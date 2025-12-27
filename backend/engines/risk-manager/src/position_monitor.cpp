#include "../include/portfolio_monitor.hpp"
#include "logger.hpp"
#include <algorithm>
#include <cmath>

namespace tradeflow {

PortfolioMonitor::PortfolioMonitor() {
    // Initialize with some common sector mappings
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

void PortfolioMonitor::updatePosition(const std::string& user_id,
                                     const std::string& symbol,
                                     double quantity,
                                     double price,
                                     const std::string& sector) noexcept {
    try {
        auto portfolio = getOrCreatePortfolio(user_id);
        if (!portfolio) return;
        
        uint64_t timestamp = HighResTimer::now_nanos();
        
        {
            std::lock_guard<std::mutex> lock(portfolio->positions_mutex);
            
            auto& position = portfolio->positions[symbol];
            
            if (position.symbol.empty()) {
                // New position
                position.symbol = symbol;
                position.quantity = quantity;
                position.avg_price = price;
                position.current_price = price;
                position.market_value = quantity * price;
                position.sector = sector.empty() ? getSymbolSector(symbol) : sector;
                position.timestamp = timestamp;
                
                portfolio->position_count.fetch_add(1, std::memory_order_relaxed);
            } else {
                // Update existing position
                double total_cost = (position.quantity * position.avg_price) + (quantity * price);
                double total_quantity = position.quantity + quantity;
                
                if (total_quantity > 0) {
                    position.avg_price = total_cost / total_quantity;
                    position.quantity = total_quantity;
                    position.market_value = total_quantity * position.current_price;
                } else {
                    // Position closed
                    portfolio->positions.erase(symbol);
                    portfolio->position_count.fetch_sub(1, std::memory_order_relaxed);
                }
                position.timestamp = timestamp;
            }
            
            // Update sector exposures
            updatePortfolioMetrics(portfolio);
        }
        
        portfolio->last_update.store(timestamp, std::memory_order_relaxed);
        total_updates_.fetch_add(1, std::memory_order_relaxed);
        
    } catch (...) {
        // Log error but don't throw in noexcept function
        Logger::getInstance().error("Failed to update position for user {} symbol {}", user_id, symbol);
    }
}

void PortfolioMonitor::updateMarketPrice(const std::string& symbol, double price) noexcept {
    try {
        {
            std::lock_guard<std::mutex> lock(prices_mutex_);
            auto& price_data = market_prices_[symbol];
            if (!price_data) {
                price_data = std::make_unique<PriceData>();
            }
            price_data->price.store(price, std::memory_order_relaxed);
            price_data->timestamp.store(HighResTimer::now_nanos(), std::memory_order_relaxed);
        }
        
        // Update all portfolios with this symbol
        std::lock_guard<std::mutex> portfolios_lock(portfolios_mutex_);
        for (auto& [user_id, portfolio] : portfolios_) {
            if (!portfolio->active.load(std::memory_order_relaxed)) continue;
            
            std::lock_guard<std::mutex> positions_lock(portfolio->positions_mutex);
            auto it = portfolio->positions.find(symbol);
            if (it != portfolio->positions.end()) {
                it->second.current_price = price;
                it->second.market_value = it->second.quantity * price;
                it->second.unrealized_pnl = (price - it->second.avg_price) * it->second.quantity;
                
                updatePortfolioMetrics(portfolio.get());
            }
        }
        
    } catch (...) {
        Logger::getInstance().error("Failed to update market price for symbol {}", symbol);
    }
}

PortfolioState PortfolioMonitor::getPortfolioState(const std::string& user_id) const noexcept {
    PortfolioState state;
    state.user_id = user_id;
    
    try {
        std::lock_guard<std::mutex> lock(portfolios_mutex_);
        auto it = portfolios_.find(user_id);
        if (it == portfolios_.end() || !it->second->active.load(std::memory_order_relaxed)) {
            return state;
        }
        
        auto& portfolio = it->second;
        
        // Copy atomic values
        state.cash_balance = portfolio->cash_balance.load(std::memory_order_relaxed);
        state.total_equity = portfolio->total_equity.load(std::memory_order_relaxed);
        state.daily_pnl = portfolio->daily_pnl.load(std::memory_order_relaxed);
        state.max_drawdown = portfolio->max_drawdown.load(std::memory_order_relaxed);
        state.position_count = portfolio->position_count.load(std::memory_order_relaxed);
        state.last_update = portfolio->last_update.load(std::memory_order_relaxed);
        
        // Copy positions (requires lock)
        {
            std::lock_guard<std::mutex> positions_lock(portfolio->positions_mutex);
            state.positions = portfolio->positions;
            state.sector_exposures = portfolio->sector_exposures;
        }
        
        // Calculate derived values
        state.total_market_value = 0.0;
        state.unrealized_pnl = 0.0;
        
        for (const auto& [symbol, position] : state.positions) {
            state.total_market_value += position.market_value;
            state.unrealized_pnl += position.unrealized_pnl;
        }
        
    } catch (...) {
        Logger::getInstance().error("Failed to get portfolio state for user {}", user_id);
    }
    
    return state;
}

double PortfolioMonitor::calculateRealTimeExposure(const std::string& user_id) const noexcept {
    try {
        std::lock_guard<std::mutex> lock(portfolios_mutex_);
        auto it = portfolios_.find(user_id);
        if (it == portfolios_.end()) return 0.0;
        
        auto& portfolio = it->second;
        std::lock_guard<std::mutex> positions_lock(portfolio->positions_mutex);
        
        double total_exposure = 0.0;
        for (const auto& [symbol, position] : portfolio->positions) {
            total_exposure += std::abs(position.market_value);
        }
        
        return total_exposure;
        
    } catch (...) {
        return 0.0;
    }
}

double PortfolioMonitor::calculateSectorExposure(const std::string& user_id,
                                                const std::string& sector) const noexcept {
    try {
        std::lock_guard<std::mutex> lock(portfolios_mutex_);
        auto it = portfolios_.find(user_id);
        if (it == portfolios_.end()) return 0.0;
        
        auto& portfolio = it->second;
        std::lock_guard<std::mutex> positions_lock(portfolio->positions_mutex);
        
        auto sector_it = portfolio->sector_exposures.find(sector);
        return (sector_it != portfolio->sector_exposures.end()) ? sector_it->second : 0.0;
        
    } catch (...) {
        return 0.0;
    }
}

double PortfolioMonitor::calculateUnrealizedPnL(const std::string& user_id) const noexcept {
    try {
        std::lock_guard<std::mutex> lock(portfolios_mutex_);
        auto it = portfolios_.find(user_id);
        if (it == portfolios_.end()) return 0.0;
        
        auto& portfolio = it->second;
        std::lock_guard<std::mutex> positions_lock(portfolio->positions_mutex);
        
        double unrealized_pnl = 0.0;
        for (const auto& [symbol, position] : portfolio->positions) {
            unrealized_pnl += position.unrealized_pnl;
        }
        
        return unrealized_pnl;
        
    } catch (...) {
        return 0.0;
    }
}

double PortfolioMonitor::calculatePortfolioVaR(const std::string& user_id,
                                              double confidence_level) const noexcept {
    // Simplified VaR calculation - in production this would use historical returns
    try {
        std::lock_guard<std::mutex> lock(portfolios_mutex_);
        auto it = portfolios_.find(user_id);
        if (it == portfolios_.end()) return 0.0;
        
        auto& portfolio = it->second;
        
        // Calculate exposure without acquiring mutex again (already held)
        std::lock_guard<std::mutex> positions_lock(portfolio->positions_mutex);
        double total_exposure = 0.0;
        for (const auto& [symbol, position] : portfolio->positions) {
            total_exposure += std::abs(position.market_value);
        }
        
        double volatility = 0.02; // Assume 2% daily volatility
        double z_score = (confidence_level == 0.95) ? 1.645 : 2.33; // 95% or 99%
        
        return total_exposure * volatility * z_score;
        
    } catch (...) {
        return 0.0;
    }
}

double PortfolioMonitor::calculateMaxDrawdown(const std::string& user_id) const noexcept {
    try {
        std::lock_guard<std::mutex> lock(portfolios_mutex_);
        auto it = portfolios_.find(user_id);
        if (it == portfolios_.end()) return 0.0;
        
        return it->second->max_drawdown.load(std::memory_order_relaxed);
        
    } catch (...) {
        return 0.0;
    }
}

double PortfolioMonitor::calculateLeverageRatio(const std::string& user_id) const noexcept {
    try {
        std::lock_guard<std::mutex> lock(portfolios_mutex_);
        auto it = portfolios_.find(user_id);
        if (it == portfolios_.end()) return 0.0;
        
        auto& portfolio = it->second;
        double total_equity = portfolio->total_equity.load(std::memory_order_relaxed);
        if (total_equity <= 0) return 0.0;
        
        // Calculate exposure without acquiring mutex again (already held)
        std::lock_guard<std::mutex> positions_lock(portfolio->positions_mutex);
        double total_exposure = 0.0;
        for (const auto& [symbol, position] : portfolio->positions) {
            total_exposure += std::abs(position.market_value);
        }
        
        return total_exposure / total_equity;
        
    } catch (...) {
        return 0.0;
    }
}

uint32_t PortfolioMonitor::getPositionCount(const std::string& user_id) const noexcept {
    try {
        std::lock_guard<std::mutex> lock(portfolios_mutex_);
        auto it = portfolios_.find(user_id);
        if (it == portfolios_.end()) return 0;
        
        return it->second->position_count.load(std::memory_order_relaxed);
        
    } catch (...) {
        return 0;
    }
}

std::unordered_map<std::string, double> PortfolioMonitor::getSectorBreakdown(const std::string& user_id) const {
    std::unordered_map<std::string, double> breakdown;
    
    try {
        std::lock_guard<std::mutex> lock(portfolios_mutex_);
        auto it = portfolios_.find(user_id);
        if (it == portfolios_.end()) return breakdown;
        
        auto& portfolio = it->second;
        std::lock_guard<std::mutex> positions_lock(portfolio->positions_mutex);
        
        breakdown = portfolio->sector_exposures;
        
    } catch (...) {
        Logger::getInstance().error("Failed to get sector breakdown for user {}", user_id);
    }
    
    return breakdown;
}

uint64_t PortfolioMonitor::getLastUpdateTime(const std::string& user_id) const noexcept {
    try {
        std::lock_guard<std::mutex> lock(portfolios_mutex_);
        auto it = portfolios_.find(user_id);
        if (it == portfolios_.end()) return 0;
        
        return it->second->last_update.load(std::memory_order_relaxed);
        
    } catch (...) {
        return 0;
    }
}

// Private helper methods
PortfolioMonitor::UserPortfolio* PortfolioMonitor::getOrCreatePortfolio(const std::string& user_id) {
    std::lock_guard<std::mutex> lock(portfolios_mutex_);
    
    auto it = portfolios_.find(user_id);
    if (it == portfolios_.end()) {
        auto portfolio = std::make_unique<UserPortfolio>();
        portfolio->active.store(true, std::memory_order_relaxed);
        portfolio->cash_balance.store(100000.0, std::memory_order_relaxed); // Default $100k
        portfolio->total_equity.store(100000.0, std::memory_order_relaxed);
        
        auto* ptr = portfolio.get();
        portfolios_[user_id] = std::move(portfolio);
        return ptr;
    }
    
    return it->second.get();
}

void PortfolioMonitor::updatePortfolioMetrics(UserPortfolio* portfolio) noexcept {
    if (!portfolio) return;
    
    try {
        double total_market_value = 0.0;
        double unrealized_pnl = 0.0;
        std::unordered_map<std::string, double> sector_exposures;
        
        for (const auto& [symbol, position] : portfolio->positions) {
            total_market_value += position.market_value;
            unrealized_pnl += position.unrealized_pnl;
            
            if (!position.sector.empty()) {
                sector_exposures[position.sector] += position.market_value;
            }
        }
        
        portfolio->sector_exposures = std::move(sector_exposures);
        
        double cash_balance = portfolio->cash_balance.load(std::memory_order_relaxed);
        double total_equity = cash_balance + total_market_value + unrealized_pnl;
        
        portfolio->total_equity.store(total_equity, std::memory_order_relaxed);
        
    } catch (...) {
        // Don't throw in noexcept function
    }
}

double PortfolioMonitor::calculatePositionValue(const Position& position, double current_price) const noexcept {
    return position.quantity * current_price;
}

std::string PortfolioMonitor::getSymbolSector(const std::string& symbol) const {
    std::lock_guard<std::mutex> lock(sector_mutex_);
    auto it = symbol_to_sector_.find(symbol);
    return (it != symbol_to_sector_.end()) ? it->second : "Unknown";
}

} // namespace tradeflow