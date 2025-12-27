#pragma once

#include "risk_types.hpp"
#include "portfolio_monitor.hpp"
#include "pre_trade_validator.hpp"
#include "high_res_timer.hpp"
#include <memory>
#include <atomic>
#include <unordered_map>
#include <mutex>

namespace tradeflow {

// Volatility-based risk adjustment parameters
struct VolatilityRiskParams {
    double low_volatility_threshold = 0.015;    // 1.5% daily volatility
    double high_volatility_threshold = 0.035;   // 3.5% daily volatility
    double volatility_adjustment_factor = 0.5;  // Reduce position size by 50% in high vol
    double correlation_adjustment_factor = 0.3; // Reduce correlation threshold by 30%
    uint64_t volatility_lookback_period = 20;   // 20 periods for volatility calculation
};

// Drawdown-based position reduction parameters
struct DrawdownRiskParams {
    double minor_drawdown_threshold = 0.05;     // 5% drawdown
    double major_drawdown_threshold = 0.10;     // 10% drawdown
    double critical_drawdown_threshold = 0.15;  // 15% drawdown
    double minor_position_reduction = 0.25;     // Reduce positions by 25%
    double major_position_reduction = 0.50;     // Reduce positions by 50%
    double critical_position_reduction = 0.75;  // Reduce positions by 75%
    bool enable_automatic_liquidation = true;   // Auto-liquidate at critical levels
};

// Emergency stop-loss parameters
struct EmergencyStopParams {
    double daily_loss_emergency_threshold = 0.03;    // 3% daily loss triggers emergency
    double portfolio_var_threshold = 0.05;           // 5% VaR threshold
    double leverage_emergency_threshold = 2.5;       // 2.5x leverage emergency threshold
    bool enable_circuit_breaker = true;              // Enable trading halt
    uint64_t circuit_breaker_duration_ms = 300000;  // 5 minute trading halt
    bool enable_forced_liquidation = true;           // Force liquidate positions
};

// Risk enforcement action types
enum class RiskEnforcementAction {
    NO_ACTION,
    REDUCE_POSITION_SIZE,
    HALT_NEW_POSITIONS,
    REDUCE_EXISTING_POSITIONS,
    EMERGENCY_LIQUIDATION,
    CIRCUIT_BREAKER_ACTIVATED
};

// Risk enforcement result
struct RiskEnforcementResult {
    RiskEnforcementAction action;
    std::string reason;
    double position_reduction_factor;
    std::vector<std::string> affected_symbols;
    uint64_t enforcement_time_ns;
    bool trading_halted;
    uint64_t halt_duration_remaining_ms;
};

class DynamicRiskEnforcer {
public:
    DynamicRiskEnforcer(std::shared_ptr<PortfolioMonitor> monitor,
                       std::shared_ptr<PreTradeValidator> validator);
    ~DynamicRiskEnforcer() = default;
    
    // Main enforcement functions
    RiskEnforcementResult enforceRiskLimits(const std::string& user_id,
                                           const RiskParameters& base_params,
                                           const VolatilityRiskParams& vol_params,
                                           const DrawdownRiskParams& drawdown_params,
                                           const EmergencyStopParams& emergency_params) noexcept;
    
    // Automatic position sizing based on volatility
    RiskParameters adjustForVolatility(const RiskParameters& base_params,
                                      const std::string& symbol,
                                      const VolatilityRiskParams& vol_params) noexcept;
    
    double calculateSymbolVolatility(const std::string& symbol,
                                    uint64_t lookback_periods = 20) noexcept;
    
    double calculatePortfolioVolatility(const std::string& user_id) noexcept;
    
    // Drawdown-based position reduction
    RiskEnforcementResult enforceDrawdownLimits(const std::string& user_id,
                                               const DrawdownRiskParams& params) noexcept;
    
    double calculateCurrentDrawdown(const std::string& user_id) noexcept;
    
    std::vector<std::string> selectPositionsForReduction(const std::string& user_id,
                                                         double reduction_factor) noexcept;
    
    // Emergency stop-loss and liquidation system
    RiskEnforcementResult checkEmergencyConditions(const std::string& user_id,
                                                   const EmergencyStopParams& params) noexcept;
    
    bool activateCircuitBreaker(const std::string& user_id,
                               const std::string& reason,
                               uint64_t duration_ms) noexcept;
    
    bool isCircuitBreakerActive(const std::string& user_id) const noexcept;
    
    RiskEnforcementResult executeForcedLiquidation(const std::string& user_id,
                                                   const std::vector<std::string>& symbols) noexcept;
    
    // Market data updates for volatility calculation
    void updateMarketData(const std::string& symbol,
                         double price,
                         uint64_t timestamp) noexcept;
    
    // Risk monitoring and alerting
    void startRiskMonitoring(const std::string& user_id,
                            uint64_t monitoring_interval_ms = 1000) noexcept;
    
    void stopRiskMonitoring(const std::string& user_id) noexcept;
    
    // Performance and status
    uint64_t getTotalEnforcements() const noexcept { return total_enforcements_.load(); }
    uint64_t getEmergencyStops() const noexcept { return emergency_stops_.load(); }
    uint64_t getCircuitBreakerActivations() const noexcept { return circuit_breaker_activations_.load(); }
    uint64_t getForcedLiquidations() const noexcept { return forced_liquidations_.load(); }
    
    std::unordered_map<std::string, RiskEnforcementResult> getActiveEnforcements() const;
    
private:
    std::shared_ptr<PortfolioMonitor> monitor_;
    std::shared_ptr<PreTradeValidator> validator_;
    
    // Price history for volatility calculation
    struct PriceHistory {
        static constexpr size_t MAX_HISTORY = 100;
        double prices[MAX_HISTORY];
        uint64_t timestamps[MAX_HISTORY];
        std::atomic<size_t> count{0};
        std::atomic<size_t> head{0};
        mutable std::mutex mutex;
        
        void addPrice(double price, uint64_t timestamp) noexcept;
        double calculateVolatility(size_t periods) const noexcept;
    };
    
    std::unordered_map<std::string, std::unique_ptr<PriceHistory>> price_histories_;
    mutable std::mutex price_histories_mutex_;
    
    // Circuit breaker state
    struct CircuitBreakerState {
        std::atomic<bool> active{false};
        std::atomic<uint64_t> activation_time{0};
        std::atomic<uint64_t> duration_ms{0};
        std::string reason;
        mutable std::mutex mutex;
    };
    
    std::unordered_map<std::string, std::unique_ptr<CircuitBreakerState>> circuit_breakers_;
    mutable std::mutex circuit_breakers_mutex_;
    
    // Active risk enforcements
    std::unordered_map<std::string, RiskEnforcementResult> active_enforcements_;
    mutable std::mutex enforcements_mutex_;
    
    // Performance counters
    mutable std::atomic<uint64_t> total_enforcements_{0};
    mutable std::atomic<uint64_t> emergency_stops_{0};
    mutable std::atomic<uint64_t> circuit_breaker_activations_{0};
    mutable std::atomic<uint64_t> forced_liquidations_{0};
    
    // Helper functions
    PriceHistory* getOrCreatePriceHistory(const std::string& symbol);
    CircuitBreakerState* getOrCreateCircuitBreaker(const std::string& user_id);
    
    double calculatePortfolioRisk(const std::string& user_id) noexcept;
    double calculatePositionRisk(const Position& position, double volatility) noexcept;
    
    bool shouldReducePosition(const Position& position,
                             double portfolio_drawdown,
                             const DrawdownRiskParams& params) noexcept;
    
    void logEnforcementAction(const std::string& user_id,
                             const RiskEnforcementResult& result) noexcept;
};

} // namespace tradeflow