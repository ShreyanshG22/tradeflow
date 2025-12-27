#include "../include/pre_trade_validator.hpp"
#include "../include/portfolio_monitor.hpp"
#include "logger.hpp"
#include "high_res_timer.hpp"
#include <memory>
#include <atomic>

namespace tradeflow {

class LimitEnforcer {
public:
    LimitEnforcer() : validator_(std::make_unique<PreTradeValidator>()),
                     monitor_(std::make_unique<PortfolioMonitor>()) {
        Logger::getInstance().info("LimitEnforcer initialized");
    }
    
    ~LimitEnforcer() = default;
    
    // Pre-trade risk validation with ultra-low latency (<2μs target)
    RiskValidation validateOrderPreTrade(const OrderRequest& order,
                                        const std::string& user_id,
                                        const RiskParameters& params) noexcept {
        auto start_time = HighResTimer::now_nanos();
        
        try {
            // Get current portfolio state
            PortfolioState portfolio = monitor_->getPortfolioState(user_id);
            
            // Validate the order
            RiskValidation result = validator_->validateOrder(order, portfolio, params);
            
            // Update performance metrics
            uint64_t elapsed = HighResTimer::now_nanos() - start_time;
            updatePerformanceMetrics(elapsed, result.result == RiskValidationResult::APPROVED);
            
            return result;
            
        } catch (...) {
            RiskValidation error_result;
            error_result.result = RiskValidationResult::REJECTED_UNKNOWN_ERROR;
            error_result.reason = "Validation system error";
            error_result.validation_time_ns = HighResTimer::now_nanos() - start_time;
            
            updatePerformanceMetrics(error_result.validation_time_ns, false);
            return error_result;
        }
    }
    
    // Dynamic limit adjustment based on market conditions
    RiskParameters adjustLimitsForVolatility(const RiskParameters& base_params,
                                           double market_volatility) noexcept {
        RiskParameters adjusted = base_params;
        
        // Reduce position sizes during high volatility
        if (market_volatility > 0.03) { // 3% daily volatility threshold
            adjusted.max_position_size_pct *= 0.7; // Reduce by 30%
            adjusted.max_sector_exposure_pct *= 0.8; // Reduce by 20%
            adjusted.leverage_limit *= 0.8; // Reduce leverage
        }
        
        return adjusted;
    }
    
    // Emergency stop-loss enforcement
    bool enforceEmergencyStop(const std::string& user_id,
                             const RiskParameters& params) noexcept {
        try {
            PortfolioState portfolio = monitor_->getPortfolioState(user_id);
            
            // Check for emergency conditions
            double drawdown_pct = std::abs(portfolio.daily_pnl) / portfolio.total_equity;
            double max_drawdown_pct = portfolio.max_drawdown / portfolio.total_equity;
            
            if (drawdown_pct >= params.max_daily_loss_pct ||
                max_drawdown_pct >= params.max_drawdown_pct) {
                
                Logger::getInstance().warn("Emergency stop triggered for user {}: drawdown={:.2f}%, max_drawdown={:.2f}%",
                                         user_id, drawdown_pct * 100, max_drawdown_pct * 100);
                
                emergency_stops_.fetch_add(1, std::memory_order_relaxed);
                return true;
            }
            
            return false;
            
        } catch (...) {
            Logger::getInstance().error("Failed to check emergency stop for user {}", user_id);
            return true; // Err on the side of caution
        }
    }
    
    // Real-time limit breach monitoring
    void monitorLimitBreaches(const std::string& user_id,
                             const RiskParameters& params) noexcept {
        try {
            PortfolioState portfolio = monitor_->getPortfolioState(user_id);
            
            // Check various risk limits
            checkPositionSizeLimits(user_id, portfolio, params);
            checkSectorExposureLimits(user_id, portfolio, params);
            checkLeverageLimits(user_id, portfolio, params);
            checkDrawdownLimits(user_id, portfolio, params);
            
        } catch (...) {
            Logger::getInstance().error("Failed to monitor limits for user {}", user_id);
        }
    }
    
    // Performance metrics
    uint64_t getTotalValidations() const noexcept {
        return total_validations_.load(std::memory_order_relaxed);
    }
    
    uint64_t getApprovedOrders() const noexcept {
        return approved_orders_.load(std::memory_order_relaxed);
    }
    
    uint64_t getRejectedOrders() const noexcept {
        return rejected_orders_.load(std::memory_order_relaxed);
    }
    
    uint64_t getEmergencyStops() const noexcept {
        return emergency_stops_.load(std::memory_order_relaxed);
    }
    
    double getAverageValidationTime() const noexcept {
        uint64_t total = total_validations_.load(std::memory_order_relaxed);
        if (total == 0) return 0.0;
        
        uint64_t total_time = total_validation_time_.load(std::memory_order_relaxed);
        return HighResTimer::to_microseconds(total_time / total);
    }
    
private:
    std::unique_ptr<PreTradeValidator> validator_;
    std::unique_ptr<PortfolioMonitor> monitor_;
    
    // Performance counters
    mutable std::atomic<uint64_t> total_validations_{0};
    mutable std::atomic<uint64_t> approved_orders_{0};
    mutable std::atomic<uint64_t> rejected_orders_{0};
    mutable std::atomic<uint64_t> emergency_stops_{0};
    mutable std::atomic<uint64_t> total_validation_time_{0};
    
    void updatePerformanceMetrics(uint64_t validation_time_ns, bool approved) noexcept {
        total_validations_.fetch_add(1, std::memory_order_relaxed);
        total_validation_time_.fetch_add(validation_time_ns, std::memory_order_relaxed);
        
        if (approved) {
            approved_orders_.fetch_add(1, std::memory_order_relaxed);
        } else {
            rejected_orders_.fetch_add(1, std::memory_order_relaxed);
        }
    }
    
    void checkPositionSizeLimits(const std::string& user_id,
                                const PortfolioState& portfolio,
                                const RiskParameters& params) noexcept {
        for (const auto& [symbol, position] : portfolio.positions) {
            double position_pct = position.market_value / portfolio.total_equity;
            if (position_pct > params.max_position_size_pct) {
                Logger::getInstance().warn("Position size limit breach for user {} symbol {}: {:.2f}% > {:.2f}%",
                                         user_id, symbol, position_pct * 100, params.max_position_size_pct * 100);
            }
        }
    }
    
    void checkSectorExposureLimits(const std::string& user_id,
                                  const PortfolioState& portfolio,
                                  const RiskParameters& params) noexcept {
        for (const auto& [sector, exposure] : portfolio.sector_exposures) {
            double sector_pct = exposure / portfolio.total_equity;
            if (sector_pct > params.max_sector_exposure_pct) {
                Logger::getInstance().warn("Sector exposure limit breach for user {} sector {}: {:.2f}% > {:.2f}%",
                                         user_id, sector, sector_pct * 100, params.max_sector_exposure_pct * 100);
            }
        }
    }
    
    void checkLeverageLimits(const std::string& user_id,
                            const PortfolioState& portfolio,
                            const RiskParameters& params) noexcept {
        double leverage = portfolio.total_market_value / portfolio.total_equity;
        if (leverage > params.leverage_limit) {
            Logger::getInstance().warn("Leverage limit breach for user {}: {:.2f}x > {:.2f}x",
                                     user_id, leverage, params.leverage_limit);
        }
    }
    
    void checkDrawdownLimits(const std::string& user_id,
                            const PortfolioState& portfolio,
                            const RiskParameters& params) noexcept {
        double daily_loss_pct = std::abs(portfolio.daily_pnl) / portfolio.total_equity;
        double max_drawdown_pct = portfolio.max_drawdown / portfolio.total_equity;
        
        if (daily_loss_pct > params.max_daily_loss_pct) {
            Logger::getInstance().warn("Daily loss limit breach for user {}: {:.2f}% > {:.2f}%",
                                     user_id, daily_loss_pct * 100, params.max_daily_loss_pct * 100);
        }
        
        if (max_drawdown_pct > params.max_drawdown_pct) {
            Logger::getInstance().warn("Max drawdown limit breach for user {}: {:.2f}% > {:.2f}%",
                                     user_id, max_drawdown_pct * 100, params.max_drawdown_pct * 100);
        }
    }
};

} // namespace tradeflow