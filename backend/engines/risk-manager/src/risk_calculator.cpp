#include "../include/pre_trade_validator.hpp"
#include "logger.hpp"
#include <algorithm>
#include <cmath>
#include <cstring>

namespace tradeflow {

PreTradeValidator::PreTradeValidator() {
    // Initialize correlation matrix to zero
    std::memset(correlation_matrix_, 0, sizeof(correlation_matrix_));
    
    // Pre-populate common sector mappings (in production, this would come from a database)
    {
        std::lock_guard<std::mutex> lock(sector_mutex_);
        symbol_to_sector_["AAPL"] = "Technology";
        symbol_to_sector_["MSFT"] = "Technology";
        symbol_to_sector_["GOOGL"] = "Technology";
        symbol_to_sector_["AMZN"] = "Consumer Discretionary";
        symbol_to_sector_["TSLA"] = "Consumer Discretionary";
        symbol_to_sector_["JPM"] = "Financials";
        symbol_to_sector_["BAC"] = "Financials";
        symbol_to_sector_["XOM"] = "Energy";
        symbol_to_sector_["CVX"] = "Energy";
    }
}

RiskValidation PreTradeValidator::validateOrder(const OrderRequest& order, 
                                               const PortfolioState& portfolio,
                                               const RiskParameters& params) noexcept {
    auto start_time = HighResTimer::now_nanos();
    total_validations_.fetch_add(1, std::memory_order_relaxed);
    
    RiskValidation result;
    result.validation_time_ns = start_time;
    result.suggested_quantity = order.quantity;
    
    try {
        // 1. Validate sufficient funds (fastest check first)
        if (!validateSufficientFunds(order, portfolio)) {
            result.result = RiskValidationResult::REJECTED_INSUFFICIENT_FUNDS;
            result.reason = "Insufficient funds for order";
            rejected_orders_.fetch_add(1, std::memory_order_relaxed);
            result.validation_time_ns = HighResTimer::now_nanos() - start_time;
            last_validation_time_.store(result.validation_time_ns, std::memory_order_relaxed);
            return result;
        }
        
        // 2. Validate position size
        double suggested_size = order.quantity;
        if (!validatePositionSize(order, portfolio, params, suggested_size)) {
            result.result = RiskValidationResult::REJECTED_POSITION_SIZE;
            result.reason = "Position size exceeds risk limits";
            result.suggested_quantity = suggested_size;
            rejected_orders_.fetch_add(1, std::memory_order_relaxed);
            result.validation_time_ns = HighResTimer::now_nanos() - start_time;
            last_validation_time_.store(result.validation_time_ns, std::memory_order_relaxed);
            return result;
        }
        
        // 3. Validate sector exposure
        if (!validateSectorExposure(order, portfolio, params)) {
            result.result = RiskValidationResult::REJECTED_SECTOR_EXPOSURE;
            result.reason = "Sector exposure limit exceeded";
            rejected_orders_.fetch_add(1, std::memory_order_relaxed);
            result.validation_time_ns = HighResTimer::now_nanos() - start_time;
            last_validation_time_.store(result.validation_time_ns, std::memory_order_relaxed);
            return result;
        }
        
        // 4. Validate correlation risk
        if (!validateCorrelationRisk(order, portfolio, params)) {
            result.result = RiskValidationResult::REJECTED_CORRELATION;
            result.reason = "High correlation with existing positions";
            rejected_orders_.fetch_add(1, std::memory_order_relaxed);
            result.validation_time_ns = HighResTimer::now_nanos() - start_time;
            last_validation_time_.store(result.validation_time_ns, std::memory_order_relaxed);
            return result;
        }
        
        // 5. Validate max positions
        if (!validateMaxPositions(order, portfolio, params)) {
            result.result = RiskValidationResult::REJECTED_MAX_POSITIONS;
            result.reason = "Maximum position count exceeded";
            rejected_orders_.fetch_add(1, std::memory_order_relaxed);
            result.validation_time_ns = HighResTimer::now_nanos() - start_time;
            last_validation_time_.store(result.validation_time_ns, std::memory_order_relaxed);
            return result;
        }
        
        // 6. Validate leverage limit
        if (!validateLeverageLimit(order, portfolio, params)) {
            result.result = RiskValidationResult::REJECTED_LEVERAGE;
            result.reason = "Leverage limit exceeded";
            rejected_orders_.fetch_add(1, std::memory_order_relaxed);
            result.validation_time_ns = HighResTimer::now_nanos() - start_time;
            last_validation_time_.store(result.validation_time_ns, std::memory_order_relaxed);
            return result;
        }
        
        // 7. Validate daily loss limit
        if (!validateDailyLossLimit(order, portfolio, params)) {
            result.result = RiskValidationResult::REJECTED_DAILY_LOSS;
            result.reason = "Daily loss limit exceeded";
            rejected_orders_.fetch_add(1, std::memory_order_relaxed);
            result.validation_time_ns = HighResTimer::now_nanos() - start_time;
            last_validation_time_.store(result.validation_time_ns, std::memory_order_relaxed);
            return result;
        }
        
        // All checks passed
        result.result = RiskValidationResult::APPROVED;
        result.reason = "Order approved";
        result.risk_score = calculatePositionCorrelation(order.symbol, portfolio);
        
    } catch (...) {
        result.result = RiskValidationResult::REJECTED_UNKNOWN_ERROR;
        result.reason = "Unknown validation error";
        rejected_orders_.fetch_add(1, std::memory_order_relaxed);
    }
    
    result.validation_time_ns = HighResTimer::now_nanos() - start_time;
    last_validation_time_.store(result.validation_time_ns, std::memory_order_relaxed);
    return result;
}

double PreTradeValidator::calculateOptimalPositionSize(const OrderRequest& order,
                                                      const PortfolioState& portfolio,
                                                      const RiskParameters& params) noexcept {
    if (portfolio.total_equity <= 0) {
        return 0.0;
    }
    
    // Calculate position size based on risk parameters
    double max_position_value = portfolio.total_equity * params.max_position_size_pct;
    double max_quantity = max_position_value / order.price;
    
    // Adjust for available cash
    double available_cash = portfolio.cash_balance;
    double cash_limited_quantity = available_cash / order.price;
    
    return std::min(max_quantity, cash_limited_quantity);
}

double PreTradeValidator::calculateSectorExposure(const std::string& sector,
                                                 const PortfolioState& portfolio) noexcept {
    auto it = portfolio.sector_exposures.find(sector);
    if (it != portfolio.sector_exposures.end()) {
        return it->second;
    }
    return 0.0;
}

double PreTradeValidator::calculateTotalExposure(const PortfolioState& portfolio) noexcept {
    return portfolio.total_market_value;
}

double PreTradeValidator::calculatePositionCorrelation(const std::string& symbol,
                                                      const PortfolioState& portfolio) noexcept {
    double max_correlation = 0.0;
    
    for (const auto& [existing_symbol, position] : portfolio.positions) {
        if (existing_symbol == symbol) continue;
        
        size_t hash_idx = hashSymbolPair(symbol, existing_symbol);
        if (hash_idx < CORRELATION_HASH_SIZE) {
            double correlation = correlation_matrix_[hash_idx].correlation.load(std::memory_order_relaxed);
            max_correlation = std::max(max_correlation, std::abs(correlation));
        }
    }
    
    return max_correlation;
}

bool PreTradeValidator::checkConcentrationRisk(const OrderRequest& order,
                                              const PortfolioState& portfolio,
                                              const RiskParameters& params) noexcept {
    // Check if adding this position would create concentration risk
    double position_value = order.quantity * order.price;
    double position_pct = position_value / portfolio.total_equity;
    
    return position_pct <= params.max_position_size_pct;
}

void PreTradeValidator::updateCorrelationMatrix(const std::string& symbol1,
                                               const std::string& symbol2,
                                               double correlation) noexcept {
    size_t hash_idx = hashSymbolPair(symbol1, symbol2);
    if (hash_idx < CORRELATION_HASH_SIZE) {
        correlation_matrix_[hash_idx].correlation.store(correlation, std::memory_order_relaxed);
        correlation_matrix_[hash_idx].timestamp.store(HighResTimer::now_nanos(), std::memory_order_relaxed);
    }
}

// Private helper methods
bool PreTradeValidator::validatePositionSize(const OrderRequest& order,
                                            const PortfolioState& portfolio,
                                            const RiskParameters& params,
                                            double& suggested_size) noexcept {
    double optimal_size = calculateOptimalPositionSize(order, portfolio, params);
    suggested_size = optimal_size;
    return order.quantity <= optimal_size;
}

bool PreTradeValidator::validateSectorExposure(const OrderRequest& order,
                                              const PortfolioState& portfolio,
                                              const RiskParameters& params) noexcept {
    std::string sector = order.sector;
    if (sector.empty()) {
        std::lock_guard<std::mutex> lock(sector_mutex_);
        auto it = symbol_to_sector_.find(order.symbol);
        if (it != symbol_to_sector_.end()) {
            sector = it->second;
        }
    }
    
    if (sector.empty()) return true; // Unknown sector, allow
    
    double current_exposure = calculateSectorExposure(sector, portfolio);
    double order_value = order.quantity * order.price;
    double new_exposure = (current_exposure + order_value) / portfolio.total_equity;
    
    return new_exposure <= params.max_sector_exposure_pct;
}

bool PreTradeValidator::validateCorrelationRisk(const OrderRequest& order,
                                               const PortfolioState& portfolio,
                                               const RiskParameters& params) noexcept {
    double max_correlation = calculatePositionCorrelation(order.symbol, portfolio);
    return max_correlation <= params.max_correlation_threshold;
}

bool PreTradeValidator::validateLeverageLimit(const OrderRequest& order,
                                             const PortfolioState& portfolio,
                                             const RiskParameters& params) noexcept {
    double order_value = order.quantity * order.price;
    double new_market_value = portfolio.total_market_value + order_value;
    double leverage = new_market_value / portfolio.total_equity;
    
    return leverage <= params.leverage_limit;
}

bool PreTradeValidator::validateDailyLossLimit(const OrderRequest& order,
                                              const PortfolioState& portfolio,
                                              const RiskParameters& params) noexcept {
    double daily_loss_pct = std::abs(portfolio.daily_pnl) / portfolio.total_equity;
    return daily_loss_pct <= params.max_daily_loss_pct;
}

bool PreTradeValidator::validateMaxPositions(const OrderRequest& order,
                                            const PortfolioState& portfolio,
                                            const RiskParameters& params) noexcept {
    // Check if this is a new position or adding to existing
    bool is_new_position = portfolio.positions.find(order.symbol) == portfolio.positions.end();
    
    if (is_new_position) {
        return portfolio.position_count < params.max_positions;
    }
    
    return true; // Adding to existing position is allowed
}

bool PreTradeValidator::validateSufficientFunds(const OrderRequest& order,
                                               const PortfolioState& portfolio) noexcept {
    double required_cash = order.quantity * order.price;
    return portfolio.cash_balance >= required_cash;
}

size_t PreTradeValidator::hashSymbolPair(const std::string& symbol1, const std::string& symbol2) const noexcept {
    // Simple hash function for symbol pairs
    std::hash<std::string> hasher;
    size_t h1 = hasher(symbol1);
    size_t h2 = hasher(symbol2);
    
    // Ensure symmetric hashing (symbol1,symbol2) == (symbol2,symbol1)
    if (h1 > h2) std::swap(h1, h2);
    
    return (h1 ^ (h2 << 1)) % CORRELATION_HASH_SIZE;
}

} // namespace tradeflow