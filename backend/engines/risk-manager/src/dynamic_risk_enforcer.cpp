#include "../include/dynamic_risk_enforcer.hpp"
#include "logger.hpp"
#include <algorithm>
#include <cmath>
#include <numeric>

namespace tradeflow {

DynamicRiskEnforcer::DynamicRiskEnforcer(std::shared_ptr<PortfolioMonitor> monitor,
                                        std::shared_ptr<PreTradeValidator> validator)
    : monitor_(monitor), validator_(validator) {
    Logger::getInstance().info("DynamicRiskEnforcer initialized");
}

RiskEnforcementResult DynamicRiskEnforcer::enforceRiskLimits(
    const std::string& user_id,
    const RiskParameters& base_params,
    const VolatilityRiskParams& vol_params,
    const DrawdownRiskParams& drawdown_params,
    const EmergencyStopParams& emergency_params) noexcept {
    
    auto start_time = HighResTimer::now_nanos();
    total_enforcements_.fetch_add(1, std::memory_order_relaxed);
    
    RiskEnforcementResult result;
    result.action = RiskEnforcementAction::NO_ACTION;
    result.position_reduction_factor = 0.0;
    result.trading_halted = false;
    result.halt_duration_remaining_ms = 0;
    
    try {
        // 1. Check emergency conditions first (highest priority)
        RiskEnforcementResult emergency_result = checkEmergencyConditions(user_id, emergency_params);
        if (emergency_result.action != RiskEnforcementAction::NO_ACTION) {
            emergency_result.enforcement_time_ns = HighResTimer::now_nanos() - start_time;
            logEnforcementAction(user_id, emergency_result);
            return emergency_result;
        }
        
        // 2. Check if circuit breaker is active
        if (isCircuitBreakerActive(user_id)) {
            result.action = RiskEnforcementAction::CIRCUIT_BREAKER_ACTIVATED;
            result.reason = "Circuit breaker is active - trading halted";
            result.trading_halted = true;
            
            auto cb_state = getOrCreateCircuitBreaker(user_id);
            uint64_t current_time = HighResTimer::now_nanos();
            uint64_t activation_time = cb_state->activation_time.load(std::memory_order_relaxed);
            uint64_t duration_ms = cb_state->duration_ms.load(std::memory_order_relaxed);
            uint64_t elapsed_ms = (current_time - activation_time) / 1000000;
            
            if (elapsed_ms < duration_ms) {
                result.halt_duration_remaining_ms = duration_ms - elapsed_ms;
            } else {
                // Circuit breaker expired
                cb_state->active.store(false, std::memory_order_relaxed);
                result.action = RiskEnforcementAction::NO_ACTION;
                result.trading_halted = false;
                result.reason = "Circuit breaker expired - trading resumed";
            }
            
            result.enforcement_time_ns = HighResTimer::now_nanos() - start_time;
            return result;
        }
        
        // 3. Check drawdown-based position reduction
        RiskEnforcementResult drawdown_result = enforceDrawdownLimits(user_id, drawdown_params);
        if (drawdown_result.action != RiskEnforcementAction::NO_ACTION) {
            drawdown_result.enforcement_time_ns = HighResTimer::now_nanos() - start_time;
            logEnforcementAction(user_id, drawdown_result);
            return drawdown_result;
        }
        
        // 4. No enforcement action needed
        result.reason = "All risk limits within acceptable ranges";
        
    } catch (const std::exception& e) {
        result.action = RiskEnforcementAction::EMERGENCY_LIQUIDATION;
        result.reason = "Risk enforcement system error: " + std::string(e.what());
        Logger::getInstance().error("Risk enforcement error for user {}: {}", user_id, e.what());
    } catch (...) {
        result.action = RiskEnforcementAction::EMERGENCY_LIQUIDATION;
        result.reason = "Unknown risk enforcement system error";
        Logger::getInstance().error("Unknown risk enforcement error for user {}", user_id);
    }
    
    result.enforcement_time_ns = HighResTimer::now_nanos() - start_time;
    return result;
}

RiskParameters DynamicRiskEnforcer::adjustForVolatility(
    const RiskParameters& base_params,
    const std::string& symbol,
    const VolatilityRiskParams& vol_params) noexcept {
    
    RiskParameters adjusted = base_params;
    
    try {
        double volatility = calculateSymbolVolatility(symbol, vol_params.volatility_lookback_period);
        
        if (volatility > vol_params.high_volatility_threshold) {
            // High volatility - reduce risk limits
            adjusted.max_position_size_pct *= (1.0 - vol_params.volatility_adjustment_factor);
            adjusted.max_sector_exposure_pct *= (1.0 - vol_params.volatility_adjustment_factor * 0.5);
            adjusted.max_correlation_threshold *= (1.0 - vol_params.correlation_adjustment_factor);
            adjusted.leverage_limit *= (1.0 - vol_params.volatility_adjustment_factor * 0.3);
            
            Logger::getInstance().debug("High volatility detected for {}: {:.3f}, adjusting risk limits", 
                                      symbol, volatility);
        } else if (volatility < vol_params.low_volatility_threshold) {
            // Low volatility - slightly increase risk limits
            adjusted.max_position_size_pct *= (1.0 + vol_params.volatility_adjustment_factor * 0.2);
            adjusted.max_sector_exposure_pct *= (1.0 + vol_params.volatility_adjustment_factor * 0.1);
            
            Logger::getInstance().debug("Low volatility detected for {}: {:.3f}, relaxing risk limits", 
                                      symbol, volatility);
        }
        
    } catch (...) {
        Logger::getInstance().warn("Failed to calculate volatility for symbol {}, using base parameters", symbol);
    }
    
    return adjusted;
}

double DynamicRiskEnforcer::calculateSymbolVolatility(const std::string& symbol,
                                                     uint64_t lookback_periods) noexcept {
    try {
        std::lock_guard<std::mutex> lock(price_histories_mutex_);
        auto it = price_histories_.find(symbol);
        if (it == price_histories_.end()) {
            return 0.02; // Default 2% volatility if no history
        }
        
        return it->second->calculateVolatility(lookback_periods);
        
    } catch (...) {
        return 0.02; // Default volatility on error
    }
}

double DynamicRiskEnforcer::calculatePortfolioVolatility(const std::string& user_id) noexcept {
    try {
        PortfolioState portfolio = monitor_->getPortfolioState(user_id);
        if (portfolio.positions.empty()) {
            return 0.0;
        }
        
        double weighted_volatility = 0.0;
        double total_weight = 0.0;
        
        for (const auto& [symbol, position] : portfolio.positions) {
            double weight = position.market_value / portfolio.total_market_value;
            double volatility = calculateSymbolVolatility(symbol);
            
            weighted_volatility += weight * volatility;
            total_weight += weight;
        }
        
        return (total_weight > 0) ? weighted_volatility / total_weight : 0.0;
        
    } catch (...) {
        return 0.02; // Default portfolio volatility
    }
}

RiskEnforcementResult DynamicRiskEnforcer::enforceDrawdownLimits(
    const std::string& user_id,
    const DrawdownRiskParams& params) noexcept {
    
    RiskEnforcementResult result;
    result.action = RiskEnforcementAction::NO_ACTION;
    
    try {
        double current_drawdown = calculateCurrentDrawdown(user_id);
        
        if (current_drawdown >= params.critical_drawdown_threshold) {
            // Critical drawdown - emergency liquidation
            if (params.enable_automatic_liquidation) {
                PortfolioState portfolio = monitor_->getPortfolioState(user_id);
                std::vector<std::string> all_symbols;
                for (const auto& [symbol, position] : portfolio.positions) {
                    all_symbols.push_back(symbol);
                }
                
                result = executeForcedLiquidation(user_id, all_symbols);
                result.reason = "Critical drawdown exceeded: " + std::to_string(current_drawdown * 100) + "%";
                
                Logger::getInstance().error("Critical drawdown for user {}: {:.2f}%, executing emergency liquidation",
                                          user_id, current_drawdown * 100);
            } else {
                result.action = RiskEnforcementAction::HALT_NEW_POSITIONS;
                result.reason = "Critical drawdown exceeded: " + std::to_string(current_drawdown * 100) + "%";
            }
            
        } else if (current_drawdown >= params.major_drawdown_threshold) {
            // Major drawdown - reduce positions significantly
            result.action = RiskEnforcementAction::REDUCE_EXISTING_POSITIONS;
            result.position_reduction_factor = params.major_position_reduction;
            result.affected_symbols = selectPositionsForReduction(user_id, result.position_reduction_factor);
            result.reason = "Major drawdown: " + std::to_string(current_drawdown * 100) + "%, reducing positions by " +
                           std::to_string(params.major_position_reduction * 100) + "%";
            
            Logger::getInstance().warn("Major drawdown for user {}: {:.2f}%, reducing positions by {:.1f}%",
                                     user_id, current_drawdown * 100, params.major_position_reduction * 100);
            
        } else if (current_drawdown >= params.minor_drawdown_threshold) {
            // Minor drawdown - reduce position sizes for new orders
            result.action = RiskEnforcementAction::REDUCE_POSITION_SIZE;
            result.position_reduction_factor = params.minor_position_reduction;
            result.reason = "Minor drawdown: " + std::to_string(current_drawdown * 100) + "%, reducing new position sizes by " +
                           std::to_string(params.minor_position_reduction * 100) + "%";
            
            Logger::getInstance().info("Minor drawdown for user {}: {:.2f}%, reducing new position sizes by {:.1f}%",
                                     user_id, current_drawdown * 100, params.minor_position_reduction * 100);
        }
        
    } catch (...) {
        result.action = RiskEnforcementAction::HALT_NEW_POSITIONS;
        result.reason = "Error calculating drawdown - halting new positions as precaution";
        Logger::getInstance().error("Failed to calculate drawdown for user {}", user_id);
    }
    
    return result;
}

double DynamicRiskEnforcer::calculateCurrentDrawdown(const std::string& user_id) noexcept {
    try {
        PortfolioState portfolio = monitor_->getPortfolioState(user_id);
        if (portfolio.total_equity <= 0) {
            return 0.0;
        }
        
        // Calculate drawdown as the maximum loss from peak equity
        // For simplicity, using daily P&L as proxy for drawdown
        double drawdown = std::abs(portfolio.daily_pnl) / portfolio.total_equity;
        
        // Also consider the stored max drawdown
        double max_drawdown = portfolio.max_drawdown / portfolio.total_equity;
        
        return std::max(drawdown, max_drawdown);
        
    } catch (...) {
        return 0.0;
    }
}

std::vector<std::string> DynamicRiskEnforcer::selectPositionsForReduction(
    const std::string& user_id,
    double reduction_factor) noexcept {
    
    std::vector<std::string> selected_symbols;
    
    try {
        PortfolioState portfolio = monitor_->getPortfolioState(user_id);
        
        // Select positions based on risk criteria
        std::vector<std::pair<std::string, double>> position_risks;
        
        for (const auto& [symbol, position] : portfolio.positions) {
            double volatility = calculateSymbolVolatility(symbol);
            double position_risk = calculatePositionRisk(position, volatility);
            position_risks.emplace_back(symbol, position_risk);
        }
        
        // Sort by risk (highest first)
        std::sort(position_risks.begin(), position_risks.end(),
                 [](const auto& a, const auto& b) { return a.second > b.second; });
        
        // Select positions to reduce (start with highest risk)
        size_t positions_to_reduce = std::max(1UL, 
            static_cast<size_t>(position_risks.size() * reduction_factor));
        
        for (size_t i = 0; i < positions_to_reduce && i < position_risks.size(); ++i) {
            selected_symbols.push_back(position_risks[i].first);
        }
        
    } catch (...) {
        Logger::getInstance().error("Failed to select positions for reduction for user {}", user_id);
    }
    
    return selected_symbols;
}

RiskEnforcementResult DynamicRiskEnforcer::checkEmergencyConditions(
    const std::string& user_id,
    const EmergencyStopParams& params) noexcept {
    
    RiskEnforcementResult result;
    result.action = RiskEnforcementAction::NO_ACTION;
    
    try {
        PortfolioState portfolio = monitor_->getPortfolioState(user_id);
        
        // Check daily loss threshold
        double daily_loss_pct = std::abs(portfolio.daily_pnl) / portfolio.total_equity;
        if (daily_loss_pct >= params.daily_loss_emergency_threshold) {
            if (params.enable_circuit_breaker) {
                activateCircuitBreaker(user_id, "Daily loss emergency threshold exceeded", 
                                     params.circuit_breaker_duration_ms);
                result.action = RiskEnforcementAction::CIRCUIT_BREAKER_ACTIVATED;
                result.trading_halted = true;
                result.halt_duration_remaining_ms = params.circuit_breaker_duration_ms;
            } else if (params.enable_forced_liquidation) {
                std::vector<std::string> all_symbols;
                for (const auto& [symbol, position] : portfolio.positions) {
                    all_symbols.push_back(symbol);
                }
                result = executeForcedLiquidation(user_id, all_symbols);
            } else {
                result.action = RiskEnforcementAction::HALT_NEW_POSITIONS;
            }
            
            result.reason = "Emergency: Daily loss " + std::to_string(daily_loss_pct * 100) + "% exceeds threshold";
            emergency_stops_.fetch_add(1, std::memory_order_relaxed);
            
            Logger::getInstance().error("Emergency condition triggered for user {}: daily loss {:.2f}%",
                                      user_id, daily_loss_pct * 100);
            return result;
        }
        
        // Check leverage threshold
        double leverage = monitor_->calculateLeverageRatio(user_id);
        if (leverage >= params.leverage_emergency_threshold) {
            result.action = RiskEnforcementAction::REDUCE_EXISTING_POSITIONS;
            result.position_reduction_factor = 0.5; // Reduce by 50%
            result.affected_symbols = selectPositionsForReduction(user_id, 0.5);
            result.reason = "Emergency: Leverage " + std::to_string(leverage) + "x exceeds threshold";
            
            emergency_stops_.fetch_add(1, std::memory_order_relaxed);
            
            Logger::getInstance().error("Emergency leverage condition for user {}: {:.2f}x",
                                      user_id, leverage);
            return result;
        }
        
        // Check portfolio VaR
        double portfolio_var = monitor_->calculatePortfolioVaR(user_id);
        double var_pct = portfolio_var / portfolio.total_equity;
        if (var_pct >= params.portfolio_var_threshold) {
            result.action = RiskEnforcementAction::REDUCE_POSITION_SIZE;
            result.position_reduction_factor = 0.3; // Reduce new positions by 30%
            result.reason = "Emergency: Portfolio VaR " + std::to_string(var_pct * 100) + "% exceeds threshold";
            
            Logger::getInstance().warn("Emergency VaR condition for user {}: {:.2f}%",
                                     user_id, var_pct * 100);
            return result;
        }
        
    } catch (...) {
        result.action = RiskEnforcementAction::EMERGENCY_LIQUIDATION;
        result.reason = "Emergency: Risk calculation system error";
        Logger::getInstance().error("Emergency condition check failed for user {}", user_id);
    }
    
    return result;
}

bool DynamicRiskEnforcer::activateCircuitBreaker(const std::string& user_id,
                                                const std::string& reason,
                                                uint64_t duration_ms) noexcept {
    try {
        auto cb_state = getOrCreateCircuitBreaker(user_id);
        
        std::lock_guard<std::mutex> lock(cb_state->mutex);
        cb_state->active.store(true, std::memory_order_relaxed);
        cb_state->activation_time.store(HighResTimer::now_nanos(), std::memory_order_relaxed);
        cb_state->duration_ms.store(duration_ms, std::memory_order_relaxed);
        cb_state->reason = reason;
        
        circuit_breaker_activations_.fetch_add(1, std::memory_order_relaxed);
        
        Logger::getInstance().error("Circuit breaker activated for user {}: {} (duration: {}ms)",
                                  user_id, reason, duration_ms);
        return true;
        
    } catch (...) {
        Logger::getInstance().error("Failed to activate circuit breaker for user {}", user_id);
        return false;
    }
}

bool DynamicRiskEnforcer::isCircuitBreakerActive(const std::string& user_id) const noexcept {
    try {
        std::lock_guard<std::mutex> lock(circuit_breakers_mutex_);
        auto it = circuit_breakers_.find(user_id);
        if (it == circuit_breakers_.end()) {
            return false;
        }
        
        bool active = it->second->active.load(std::memory_order_relaxed);
        if (!active) {
            return false;
        }
        
        // Check if circuit breaker has expired
        uint64_t current_time = HighResTimer::now_nanos();
        uint64_t activation_time = it->second->activation_time.load(std::memory_order_relaxed);
        uint64_t duration_ms = it->second->duration_ms.load(std::memory_order_relaxed);
        uint64_t elapsed_ms = (current_time - activation_time) / 1000000;
        
        if (elapsed_ms >= duration_ms) {
            it->second->active.store(false, std::memory_order_relaxed);
            return false;
        }
        
        return true;
        
    } catch (...) {
        return false;
    }
}

RiskEnforcementResult DynamicRiskEnforcer::executeForcedLiquidation(
    const std::string& user_id,
    const std::vector<std::string>& symbols) noexcept {
    
    RiskEnforcementResult result;
    result.action = RiskEnforcementAction::EMERGENCY_LIQUIDATION;
    result.affected_symbols = symbols;
    
    try {
        // In a real implementation, this would interface with the trading engine
        // to execute market orders to close all positions
        
        forced_liquidations_.fetch_add(1, std::memory_order_relaxed);
        
        result.reason = "Forced liquidation of " + std::to_string(symbols.size()) + " positions";
        
        Logger::getInstance().error("Executing forced liquidation for user {}: {} positions",
                                  user_id, symbols.size());
        
        // Log each symbol being liquidated
        for (const auto& symbol : symbols) {
            Logger::getInstance().error("  Liquidating position: {}", symbol);
        }
        
    } catch (...) {
        result.reason = "Failed to execute forced liquidation";
        Logger::getInstance().error("Failed to execute forced liquidation for user {}", user_id);
    }
    
    return result;
}

void DynamicRiskEnforcer::updateMarketData(const std::string& symbol,
                                          double price,
                                          uint64_t timestamp) noexcept {
    try {
        auto price_history = getOrCreatePriceHistory(symbol);
        price_history->addPrice(price, timestamp);
        
    } catch (...) {
        Logger::getInstance().warn("Failed to update market data for symbol {}", symbol);
    }
}

// Private helper implementations
DynamicRiskEnforcer::PriceHistory* DynamicRiskEnforcer::getOrCreatePriceHistory(const std::string& symbol) {
    std::lock_guard<std::mutex> lock(price_histories_mutex_);
    
    auto it = price_histories_.find(symbol);
    if (it == price_histories_.end()) {
        auto history = std::make_unique<PriceHistory>();
        auto* ptr = history.get();
        price_histories_[symbol] = std::move(history);
        return ptr;
    }
    
    return it->second.get();
}

DynamicRiskEnforcer::CircuitBreakerState* DynamicRiskEnforcer::getOrCreateCircuitBreaker(const std::string& user_id) {
    std::lock_guard<std::mutex> lock(circuit_breakers_mutex_);
    
    auto it = circuit_breakers_.find(user_id);
    if (it == circuit_breakers_.end()) {
        auto cb_state = std::make_unique<CircuitBreakerState>();
        auto* ptr = cb_state.get();
        circuit_breakers_[user_id] = std::move(cb_state);
        return ptr;
    }
    
    return it->second.get();
}

double DynamicRiskEnforcer::calculatePositionRisk(const Position& position, double volatility) noexcept {
    // Simple risk calculation: position value * volatility
    return position.market_value * volatility;
}

void DynamicRiskEnforcer::logEnforcementAction(const std::string& user_id,
                                              const RiskEnforcementResult& result) noexcept {
    try {
        std::lock_guard<std::mutex> lock(enforcements_mutex_);
        active_enforcements_[user_id] = result;
        
    } catch (...) {
        // Don't throw in logging function
    }
}

// PriceHistory implementations
void DynamicRiskEnforcer::PriceHistory::addPrice(double price, uint64_t timestamp) noexcept {
    std::lock_guard<std::mutex> lock(mutex);
    
    size_t current_head = head.load(std::memory_order_relaxed);
    prices[current_head] = price;
    timestamps[current_head] = timestamp;
    
    head.store((current_head + 1) % MAX_HISTORY, std::memory_order_relaxed);
    
    size_t current_count = count.load(std::memory_order_relaxed);
    if (current_count < MAX_HISTORY) {
        count.store(current_count + 1, std::memory_order_relaxed);
    }
}

double DynamicRiskEnforcer::PriceHistory::calculateVolatility(size_t periods) const noexcept {
    std::lock_guard<std::mutex> lock(mutex);
    
    size_t available_count = count.load(std::memory_order_relaxed);
    if (available_count < 2) {
        return 0.02; // Default 2% volatility
    }
    
    size_t use_periods = std::min(periods, available_count - 1);
    if (use_periods < 2) {
        return 0.02;
    }
    
    // Calculate returns
    std::vector<double> returns;
    returns.reserve(use_periods);
    
    size_t current_head = head.load(std::memory_order_relaxed);
    for (size_t i = 1; i <= use_periods; ++i) {
        size_t idx1 = (current_head - i + MAX_HISTORY) % MAX_HISTORY;
        size_t idx2 = (current_head - i - 1 + MAX_HISTORY) % MAX_HISTORY;
        
        if (prices[idx2] > 0) {
            double return_val = (prices[idx1] - prices[idx2]) / prices[idx2];
            returns.push_back(return_val);
        }
    }
    
    if (returns.size() < 2) {
        return 0.02;
    }
    
    // Calculate standard deviation of returns
    double mean = std::accumulate(returns.begin(), returns.end(), 0.0) / returns.size();
    
    double variance = 0.0;
    for (double ret : returns) {
        variance += (ret - mean) * (ret - mean);
    }
    variance /= (returns.size() - 1);
    
    return std::sqrt(variance);
}

std::unordered_map<std::string, RiskEnforcementResult> DynamicRiskEnforcer::getActiveEnforcements() const {
    std::lock_guard<std::mutex> lock(enforcements_mutex_);
    return active_enforcements_;
}

} // namespace tradeflow