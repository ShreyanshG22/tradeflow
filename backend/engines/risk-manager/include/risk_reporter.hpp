#pragma once

#include "risk_types.hpp"
#include "portfolio_monitor.hpp"
#include "dynamic_risk_enforcer.hpp"
#include "high_res_timer.hpp"
#include <memory>
#include <vector>
#include <unordered_map>
#include <atomic>
#include <mutex>
#include <functional>
#include <queue>

namespace tradeflow {

// Risk metrics for real-time monitoring
struct RiskMetrics {
    std::string user_id;
    double portfolio_value;
    double daily_pnl;
    double daily_pnl_pct;
    double unrealized_pnl;
    double unrealized_pnl_pct;
    double max_drawdown;
    double max_drawdown_pct;
    double current_drawdown;
    double current_drawdown_pct;
    double portfolio_var_95;
    double portfolio_var_99;
    double leverage_ratio;
    double sector_concentration_risk;
    double correlation_risk;
    uint32_t position_count;
    uint32_t active_strategies;
    uint64_t last_updated;
    
    RiskMetrics() : portfolio_value(0), daily_pnl(0), daily_pnl_pct(0),
                   unrealized_pnl(0), unrealized_pnl_pct(0), max_drawdown(0),
                   max_drawdown_pct(0), current_drawdown(0), current_drawdown_pct(0),
                   portfolio_var_95(0), portfolio_var_99(0), leverage_ratio(0),
                   sector_concentration_risk(0), correlation_risk(0),
                   position_count(0), active_strategies(0), last_updated(0) {}
};

// Risk alert levels
enum class RiskAlertLevel {
    INFO,
    WARNING,
    CRITICAL,
    EMERGENCY
};

// Risk alert types
enum class RiskAlertType {
    POSITION_SIZE_BREACH,
    SECTOR_EXPOSURE_BREACH,
    CORRELATION_BREACH,
    DAILY_LOSS_BREACH,
    DRAWDOWN_BREACH,
    LEVERAGE_BREACH,
    VAR_BREACH,
    CIRCUIT_BREAKER_ACTIVATED,
    EMERGENCY_LIQUIDATION,
    SYSTEM_ERROR
};

// Risk alert structure
struct RiskAlert {
    std::string alert_id;
    std::string user_id;
    RiskAlertType type;
    RiskAlertLevel level;
    std::string message;
    std::string details;
    double threshold_value;
    double current_value;
    std::string affected_symbol;
    std::vector<std::string> affected_symbols;
    uint64_t timestamp;
    bool acknowledged;
    
    RiskAlert() : type(RiskAlertType::SYSTEM_ERROR), level(RiskAlertLevel::INFO),
                 threshold_value(0), current_value(0), timestamp(0), acknowledged(false) {}
};

// Dashboard aggregation data
struct RiskDashboardData {
    std::string user_id;
    RiskMetrics current_metrics;
    std::vector<RiskAlert> active_alerts;
    std::unordered_map<std::string, double> sector_exposures;
    std::unordered_map<std::string, double> position_risks;
    std::vector<std::pair<uint64_t, double>> pnl_history; // timestamp, pnl
    std::vector<std::pair<uint64_t, double>> drawdown_history;
    std::vector<std::pair<uint64_t, double>> var_history;
    uint64_t last_updated;
    
    RiskDashboardData() : last_updated(0) {}
};

// Alert callback function type
using AlertCallback = std::function<void(const RiskAlert&)>;

// Risk reporter class for real-time monitoring and alerting
class RiskReporter {
public:
    RiskReporter(std::shared_ptr<PortfolioMonitor> monitor,
                std::shared_ptr<DynamicRiskEnforcer> enforcer);
    ~RiskReporter() = default;
    
    // Real-time risk metrics calculation
    RiskMetrics calculateRiskMetrics(const std::string& user_id) noexcept;
    
    void updateRiskMetrics(const std::string& user_id) noexcept;
    
    RiskMetrics getRiskMetrics(const std::string& user_id) const noexcept;
    
    // Risk limit breach detection and notifications
    void checkRiskLimits(const std::string& user_id, const RiskParameters& params) noexcept;
    
    void generateAlert(const std::string& user_id,
                      RiskAlertType type,
                      RiskAlertLevel level,
                      const std::string& message,
                      const std::string& details = "",
                      double threshold_value = 0.0,
                      double current_value = 0.0,
                      const std::string& affected_symbol = "") noexcept;
    
    // Alert management
    void registerAlertCallback(AlertCallback callback);
    
    std::vector<RiskAlert> getActiveAlerts(const std::string& user_id) const;
    
    std::vector<RiskAlert> getAllActiveAlerts() const;
    
    bool acknowledgeAlert(const std::string& alert_id);
    
    void clearAcknowledgedAlerts(const std::string& user_id);
    
    // Dashboard data aggregation
    RiskDashboardData generateDashboardData(const std::string& user_id) const;
    
    void updateDashboardData(const std::string& user_id) noexcept;
    
    // Historical data management
    void recordPnLHistory(const std::string& user_id, double pnl) noexcept;
    
    void recordDrawdownHistory(const std::string& user_id, double drawdown) noexcept;
    
    void recordVaRHistory(const std::string& user_id, double var) noexcept;
    
    // System monitoring
    void startRealTimeMonitoring(uint64_t update_interval_ms = 1000);
    
    void stopRealTimeMonitoring();
    
    bool isMonitoringActive() const noexcept { return monitoring_active_.load(); }
    
    // Performance metrics
    uint64_t getTotalAlertsGenerated() const noexcept { return total_alerts_generated_.load(); }
    
    uint64_t getTotalMetricsCalculated() const noexcept { return total_metrics_calculated_.load(); }
    
    uint64_t getAverageCalculationTimeNs() const noexcept;
    
private:
    // Dependencies
    std::shared_ptr<PortfolioMonitor> monitor_;
    std::shared_ptr<DynamicRiskEnforcer> enforcer_;
    
    // Risk metrics storage
    struct alignas(64) UserRiskData {
        std::atomic<bool> active{false};
        RiskMetrics current_metrics;
        std::vector<std::pair<uint64_t, double>> pnl_history;
        std::vector<std::pair<uint64_t, double>> drawdown_history;
        std::vector<std::pair<uint64_t, double>> var_history;
        std::atomic<uint64_t> last_updated{0};
        mutable std::mutex mutex;
        
        static constexpr size_t MAX_HISTORY = 1440; // 24 hours at 1-minute intervals
    };
    
    std::unordered_map<std::string, std::unique_ptr<UserRiskData>> user_risk_data_;
    mutable std::mutex risk_data_mutex_;
    
    // Alert storage
    struct AlertStorage {
        std::vector<RiskAlert> active_alerts;
        std::queue<RiskAlert> alert_queue;
        mutable std::mutex mutex;
    };
    
    std::unordered_map<std::string, std::unique_ptr<AlertStorage>> user_alerts_;
    mutable std::mutex alerts_mutex_;
    
    // Alert callbacks
    std::vector<AlertCallback> alert_callbacks_;
    mutable std::mutex callbacks_mutex_;
    
    // Monitoring control
    std::atomic<bool> monitoring_active_{false};
    std::atomic<bool> shutdown_requested_{false};
    
    // Performance counters
    mutable std::atomic<uint64_t> total_alerts_generated_{0};
    mutable std::atomic<uint64_t> total_metrics_calculated_{0};
    mutable std::atomic<uint64_t> total_calculation_time_ns_{0};
    
    // Helper functions
    UserRiskData* getOrCreateUserRiskData(const std::string& user_id);
    
    AlertStorage* getOrCreateAlertStorage(const std::string& user_id);
    
    void monitoringLoop(uint64_t update_interval_ms);
    
    void processAlertQueue();
    
    void notifyCallbacks(const RiskAlert& alert);
    
    std::string generateAlertId() const;
    
    void addToHistory(std::vector<std::pair<uint64_t, double>>& history,
                     uint64_t timestamp,
                     double value,
                     size_t max_size = UserRiskData::MAX_HISTORY) noexcept;
    
    double calculateSectorConcentrationRisk(const std::string& user_id) const noexcept;
    
    double calculateCorrelationRisk(const std::string& user_id) const noexcept;
    
    void checkPositionSizeLimits(const std::string& user_id, const RiskParameters& params) noexcept;
    
    void checkSectorExposureLimits(const std::string& user_id, const RiskParameters& params) noexcept;
    
    void checkDrawdownLimits(const std::string& user_id, const RiskParameters& params) noexcept;
    
    void checkLeverageLimits(const std::string& user_id, const RiskParameters& params) noexcept;
    
    void checkVaRLimits(const std::string& user_id, const RiskParameters& params) noexcept;
};

} // namespace tradeflow