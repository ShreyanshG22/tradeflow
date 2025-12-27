#include "../include/risk_reporter.hpp"
#include "logger.hpp"
#include <algorithm>
#include <cmath>
#include <random>
#include <thread>
#include <chrono>

namespace tradeflow {

RiskReporter::RiskReporter(std::shared_ptr<PortfolioMonitor> monitor,
                          std::shared_ptr<DynamicRiskEnforcer> enforcer)
    : monitor_(monitor), enforcer_(enforcer) {
    Logger::getInstance().info("RiskReporter initialized");
}

RiskMetrics RiskReporter::calculateRiskMetrics(const std::string& user_id) noexcept {
    auto start_time = HighResTimer::now_nanos();
    total_metrics_calculated_.fetch_add(1, std::memory_order_relaxed);
    
    RiskMetrics metrics;
    metrics.user_id = user_id;
    metrics.last_updated = HighResTimer::now_nanos();
    
    try {
        // Get portfolio state from monitor
        PortfolioState portfolio = monitor_->getPortfolioState(user_id);
        
        // Basic portfolio metrics
        metrics.portfolio_value = portfolio.total_equity;
        metrics.daily_pnl = portfolio.daily_pnl;
        metrics.daily_pnl_pct = (portfolio.total_equity > 0) ? 
            (portfolio.daily_pnl / portfolio.total_equity) * 100.0 : 0.0;
        
        metrics.unrealized_pnl = portfolio.unrealized_pnl;
        metrics.unrealized_pnl_pct = (portfolio.total_equity > 0) ? 
            (portfolio.unrealized_pnl / portfolio.total_equity) * 100.0 : 0.0;
        
        // Drawdown calculations
        metrics.max_drawdown = portfolio.max_drawdown;
        metrics.max_drawdown_pct = (portfolio.total_equity > 0) ? 
            (portfolio.max_drawdown / portfolio.total_equity) * 100.0 : 0.0;
        
        // Current drawdown (simplified calculation)
        metrics.current_drawdown = std::abs(portfolio.daily_pnl);
        metrics.current_drawdown_pct = std::abs(metrics.daily_pnl_pct);
        
        // Risk metrics from monitor
        metrics.portfolio_var_95 = monitor_->calculatePortfolioVaR(user_id, 0.95);
        metrics.portfolio_var_99 = monitor_->calculatePortfolioVaR(user_id, 0.99);
        metrics.leverage_ratio = monitor_->calculateLeverageRatio(user_id);
        
        // Position and strategy counts
        metrics.position_count = portfolio.position_count;
        metrics.active_strategies = 1; // Simplified - would need strategy service integration
        
        // Advanced risk calculations
        metrics.sector_concentration_risk = calculateSectorConcentrationRisk(user_id);
        metrics.correlation_risk = calculateCorrelationRisk(user_id);
        
        Logger::getInstance().debug("Calculated risk metrics for user {}: portfolio_value={:.2f}, daily_pnl={:.2f}%, drawdown={:.2f}%",
                                  user_id, metrics.portfolio_value, metrics.daily_pnl_pct, metrics.current_drawdown_pct);
        
    } catch (const std::exception& e) {
        Logger::getInstance().error("Error calculating risk metrics for user {}: {}", user_id, e.what());
    } catch (...) {
        Logger::getInstance().error("Unknown error calculating risk metrics for user {}", user_id);
    }
    
    auto end_time = HighResTimer::now_nanos();
    total_calculation_time_ns_.fetch_add(end_time - start_time, std::memory_order_relaxed);
    
    return metrics;
}

void RiskReporter::updateRiskMetrics(const std::string& user_id) noexcept {
    try {
        RiskMetrics metrics = calculateRiskMetrics(user_id);
        
        auto user_data = getOrCreateUserRiskData(user_id);
        {
            std::lock_guard<std::mutex> lock(user_data->mutex);
            user_data->current_metrics = metrics;
            user_data->last_updated.store(metrics.last_updated, std::memory_order_relaxed);
        }
        
        // Record historical data (outside the lock to avoid deadlock)
        recordPnLHistory(user_id, metrics.daily_pnl);
        recordDrawdownHistory(user_id, metrics.current_drawdown);
        recordVaRHistory(user_id, metrics.portfolio_var_95);
        
    } catch (...) {
        Logger::getInstance().error("Failed to update risk metrics for user {}", user_id);
    }
}

RiskMetrics RiskReporter::getRiskMetrics(const std::string& user_id) const noexcept {
    try {
        std::lock_guard<std::mutex> lock(risk_data_mutex_);
        auto it = user_risk_data_.find(user_id);
        if (it != user_risk_data_.end()) {
            std::lock_guard<std::mutex> data_lock(it->second->mutex);
            return it->second->current_metrics;
        }
    } catch (...) {
        Logger::getInstance().error("Failed to get risk metrics for user {}", user_id);
    }
    
    return RiskMetrics(); // Return empty metrics on error
}

void RiskReporter::checkRiskLimits(const std::string& user_id, const RiskParameters& params) noexcept {
    try {
        RiskMetrics metrics = getRiskMetrics(user_id);
        
        // Check position size limits
        checkPositionSizeLimits(user_id, params);
        
        // Check sector exposure limits
        checkSectorExposureLimits(user_id, params);
        
        // Check drawdown limits
        checkDrawdownLimits(user_id, params);
        
        // Check leverage limits
        checkLeverageLimits(user_id, params);
        
        // Check VaR limits
        checkVaRLimits(user_id, params);
        
    } catch (...) {
        Logger::getInstance().error("Failed to check risk limits for user {}", user_id);
    }
}

void RiskReporter::generateAlert(const std::string& user_id,
                                RiskAlertType type,
                                RiskAlertLevel level,
                                const std::string& message,
                                const std::string& details,
                                double threshold_value,
                                double current_value,
                                const std::string& affected_symbol) noexcept {
    try {
        RiskAlert alert;
        alert.alert_id = generateAlertId();
        alert.user_id = user_id;
        alert.type = type;
        alert.level = level;
        alert.message = message;
        alert.details = details;
        alert.threshold_value = threshold_value;
        alert.current_value = current_value;
        alert.affected_symbol = affected_symbol;
        alert.timestamp = HighResTimer::now_nanos();
        alert.acknowledged = false;
        
        auto alert_storage = getOrCreateAlertStorage(user_id);
        {
            std::lock_guard<std::mutex> lock(alert_storage->mutex);
            alert_storage->active_alerts.push_back(alert);
            alert_storage->alert_queue.push(alert);
        }
        
        total_alerts_generated_.fetch_add(1, std::memory_order_relaxed);
        
        // Notify callbacks
        notifyCallbacks(alert);
        
        Logger::getInstance().warn("Risk alert generated for user {}: {} - {}", 
                                 user_id, message, details);
        
    } catch (...) {
        Logger::getInstance().error("Failed to generate alert for user {}", user_id);
    }
}

void RiskReporter::registerAlertCallback(AlertCallback callback) {
    std::lock_guard<std::mutex> lock(callbacks_mutex_);
    alert_callbacks_.push_back(callback);
}

std::vector<RiskAlert> RiskReporter::getActiveAlerts(const std::string& user_id) const {
    try {
        std::lock_guard<std::mutex> lock(alerts_mutex_);
        auto it = user_alerts_.find(user_id);
        if (it != user_alerts_.end()) {
            std::lock_guard<std::mutex> alert_lock(it->second->mutex);
            
            // Return only non-acknowledged alerts
            std::vector<RiskAlert> active_alerts;
            for (const auto& alert : it->second->active_alerts) {
                if (!alert.acknowledged) {
                    active_alerts.push_back(alert);
                }
            }
            return active_alerts;
        }
    } catch (...) {
        Logger::getInstance().error("Failed to get active alerts for user {}", user_id);
    }
    
    return {};
}

std::vector<RiskAlert> RiskReporter::getAllActiveAlerts() const {
    std::vector<RiskAlert> all_alerts;
    
    try {
        std::lock_guard<std::mutex> lock(alerts_mutex_);
        for (const auto& [user_id, alert_storage] : user_alerts_) {
            std::lock_guard<std::mutex> alert_lock(alert_storage->mutex);
            for (const auto& alert : alert_storage->active_alerts) {
                if (!alert.acknowledged) {
                    all_alerts.push_back(alert);
                }
            }
        }
    } catch (...) {
        Logger::getInstance().error("Failed to get all active alerts");
    }
    
    return all_alerts;
}

bool RiskReporter::acknowledgeAlert(const std::string& alert_id) {
    try {
        std::lock_guard<std::mutex> lock(alerts_mutex_);
        for (auto& [user_id, alert_storage] : user_alerts_) {
            std::lock_guard<std::mutex> alert_lock(alert_storage->mutex);
            for (auto& alert : alert_storage->active_alerts) {
                if (alert.alert_id == alert_id) {
                    alert.acknowledged = true;
                    Logger::getInstance().info("Alert {} acknowledged for user {}", alert_id, user_id);
                    return true;
                }
            }
        }
    } catch (...) {
        Logger::getInstance().error("Failed to acknowledge alert {}", alert_id);
    }
    
    return false;
}

void RiskReporter::clearAcknowledgedAlerts(const std::string& user_id) {
    try {
        auto alert_storage = getOrCreateAlertStorage(user_id);
        std::lock_guard<std::mutex> lock(alert_storage->mutex);
        
        auto it = std::remove_if(alert_storage->active_alerts.begin(),
                                alert_storage->active_alerts.end(),
                                [](const RiskAlert& alert) { return alert.acknowledged; });
        
        size_t removed_count = std::distance(it, alert_storage->active_alerts.end());
        alert_storage->active_alerts.erase(it, alert_storage->active_alerts.end());
        
        if (removed_count > 0) {
            Logger::getInstance().info("Cleared {} acknowledged alerts for user {}", removed_count, user_id);
        }
        
    } catch (...) {
        Logger::getInstance().error("Failed to clear acknowledged alerts for user {}", user_id);
    }
}

RiskDashboardData RiskReporter::generateDashboardData(const std::string& user_id) const {
    RiskDashboardData dashboard_data;
    dashboard_data.user_id = user_id;
    dashboard_data.last_updated = HighResTimer::now_nanos();
    
    try {
        // Get current risk metrics
        dashboard_data.current_metrics = getRiskMetrics(user_id);
        
        // Get active alerts
        dashboard_data.active_alerts = getActiveAlerts(user_id);
        
        // Get sector exposures
        dashboard_data.sector_exposures = monitor_->getSectorBreakdown(user_id);
        
        // Get position risks
        PortfolioState portfolio = monitor_->getPortfolioState(user_id);
        for (const auto& [symbol, position] : portfolio.positions) {
            double position_risk = (position.market_value / portfolio.total_equity) * 100.0;
            dashboard_data.position_risks[symbol] = position_risk;
        }
        
        // Get historical data
        std::lock_guard<std::mutex> lock(risk_data_mutex_);
        auto it = user_risk_data_.find(user_id);
        if (it != user_risk_data_.end()) {
            std::lock_guard<std::mutex> data_lock(it->second->mutex);
            dashboard_data.pnl_history = it->second->pnl_history;
            dashboard_data.drawdown_history = it->second->drawdown_history;
            dashboard_data.var_history = it->second->var_history;
        }
        
    } catch (...) {
        Logger::getInstance().error("Failed to generate dashboard data for user {}", user_id);
    }
    
    return dashboard_data;
}

void RiskReporter::updateDashboardData(const std::string& user_id) noexcept {
    try {
        updateRiskMetrics(user_id);
        
        // Dashboard data is generated on-demand, so just ensure metrics are current
        Logger::getInstance().debug("Updated dashboard data for user {}", user_id);
        
    } catch (...) {
        Logger::getInstance().error("Failed to update dashboard data for user {}", user_id);
    }
}

void RiskReporter::recordPnLHistory(const std::string& user_id, double pnl) noexcept {
    try {
        auto user_data = getOrCreateUserRiskData(user_id);
        std::lock_guard<std::mutex> lock(user_data->mutex);
        
        uint64_t timestamp = HighResTimer::now_nanos();
        addToHistory(user_data->pnl_history, timestamp, pnl);
        
    } catch (...) {
        Logger::getInstance().error("Failed to record P&L history for user {}", user_id);
    }
}

void RiskReporter::recordDrawdownHistory(const std::string& user_id, double drawdown) noexcept {
    try {
        auto user_data = getOrCreateUserRiskData(user_id);
        std::lock_guard<std::mutex> lock(user_data->mutex);
        
        uint64_t timestamp = HighResTimer::now_nanos();
        addToHistory(user_data->drawdown_history, timestamp, drawdown);
        
    } catch (...) {
        Logger::getInstance().error("Failed to record drawdown history for user {}", user_id);
    }
}

void RiskReporter::recordVaRHistory(const std::string& user_id, double var) noexcept {
    try {
        auto user_data = getOrCreateUserRiskData(user_id);
        std::lock_guard<std::mutex> lock(user_data->mutex);
        
        uint64_t timestamp = HighResTimer::now_nanos();
        addToHistory(user_data->var_history, timestamp, var);
        
    } catch (...) {
        Logger::getInstance().error("Failed to record VaR history for user {}", user_id);
    }
}

void RiskReporter::startRealTimeMonitoring(uint64_t update_interval_ms) {
    if (monitoring_active_.load()) {
        Logger::getInstance().warn("Real-time monitoring is already active");
        return;
    }
    
    monitoring_active_.store(true);
    shutdown_requested_.store(false);
    
    // Start monitoring thread
    std::thread monitoring_thread([this, update_interval_ms]() {
        monitoringLoop(update_interval_ms);
    });
    
    monitoring_thread.detach();
    
    Logger::getInstance().info("Started real-time risk monitoring with {}ms update interval", update_interval_ms);
}

void RiskReporter::stopRealTimeMonitoring() {
    if (!monitoring_active_.load()) {
        Logger::getInstance().warn("Real-time monitoring is not active");
        return;
    }
    
    shutdown_requested_.store(true);
    monitoring_active_.store(false);
    
    Logger::getInstance().info("Stopped real-time risk monitoring");
}

uint64_t RiskReporter::getAverageCalculationTimeNs() const noexcept {
    uint64_t total_calculations = total_metrics_calculated_.load();
    uint64_t total_time = total_calculation_time_ns_.load();
    
    return (total_calculations > 0) ? (total_time / total_calculations) : 0;
}

// Private helper implementations
RiskReporter::UserRiskData* RiskReporter::getOrCreateUserRiskData(const std::string& user_id) {
    std::lock_guard<std::mutex> lock(risk_data_mutex_);
    
    auto it = user_risk_data_.find(user_id);
    if (it == user_risk_data_.end()) {
        auto user_data = std::make_unique<UserRiskData>();
        user_data->active.store(true);
        auto* ptr = user_data.get();
        user_risk_data_[user_id] = std::move(user_data);
        return ptr;
    }
    
    return it->second.get();
}

RiskReporter::AlertStorage* RiskReporter::getOrCreateAlertStorage(const std::string& user_id) {
    std::lock_guard<std::mutex> lock(alerts_mutex_);
    
    auto it = user_alerts_.find(user_id);
    if (it == user_alerts_.end()) {
        auto alert_storage = std::make_unique<AlertStorage>();
        auto* ptr = alert_storage.get();
        user_alerts_[user_id] = std::move(alert_storage);
        return ptr;
    }
    
    return it->second.get();
}

void RiskReporter::monitoringLoop(uint64_t update_interval_ms) {
    Logger::getInstance().info("Risk monitoring loop started");
    
    while (!shutdown_requested_.load()) {
        try {
            // Update metrics for all active users
            std::vector<std::string> active_users;
            {
                std::lock_guard<std::mutex> lock(risk_data_mutex_);
                for (const auto& [user_id, user_data] : user_risk_data_) {
                    if (user_data->active.load()) {
                        active_users.push_back(user_id);
                    }
                }
            }
            
            for (const auto& user_id : active_users) {
                updateRiskMetrics(user_id);
                
                // Check risk limits with default parameters
                RiskParameters default_params;
                checkRiskLimits(user_id, default_params);
            }
            
            // Process alert queue
            processAlertQueue();
            
        } catch (...) {
            Logger::getInstance().error("Error in risk monitoring loop");
        }
        
        // Sleep for update interval
        std::this_thread::sleep_for(std::chrono::milliseconds(update_interval_ms));
    }
    
    Logger::getInstance().info("Risk monitoring loop stopped");
}

void RiskReporter::processAlertQueue() {
    try {
        std::lock_guard<std::mutex> lock(alerts_mutex_);
        for (auto& [user_id, alert_storage] : user_alerts_) {
            std::lock_guard<std::mutex> alert_lock(alert_storage->mutex);
            
            while (!alert_storage->alert_queue.empty()) {
                RiskAlert alert = alert_storage->alert_queue.front();
                alert_storage->alert_queue.pop();
                
                // Process alert (could send to external systems, etc.)
                Logger::getInstance().info("Processing alert {} for user {}: {}", 
                                         alert.alert_id, user_id, alert.message);
            }
        }
    } catch (...) {
        Logger::getInstance().error("Error processing alert queue");
    }
}

void RiskReporter::notifyCallbacks(const RiskAlert& alert) {
    try {
        std::lock_guard<std::mutex> lock(callbacks_mutex_);
        for (const auto& callback : alert_callbacks_) {
            try {
                callback(alert);
            } catch (...) {
                Logger::getInstance().error("Error in alert callback for alert {}", alert.alert_id);
            }
        }
    } catch (...) {
        Logger::getInstance().error("Error notifying alert callbacks");
    }
}

std::string RiskReporter::generateAlertId() const {
    static std::random_device rd;
    static std::mt19937 gen(rd());
    static std::uniform_int_distribution<> dis(100000, 999999);
    
    uint64_t timestamp = HighResTimer::now_nanos();
    int random_suffix = dis(gen);
    
    return "ALERT_" + std::to_string(timestamp) + "_" + std::to_string(random_suffix);
}

void RiskReporter::addToHistory(std::vector<std::pair<uint64_t, double>>& history,
                               uint64_t timestamp,
                               double value,
                               size_t max_size) noexcept {
    try {
        history.emplace_back(timestamp, value);
        
        // Keep only the most recent entries
        if (history.size() > max_size) {
            history.erase(history.begin(), history.begin() + (history.size() - max_size));
        }
        
    } catch (...) {
        // Don't throw in history recording
    }
}

double RiskReporter::calculateSectorConcentrationRisk(const std::string& user_id) const noexcept {
    try {
        auto sector_exposures = monitor_->getSectorBreakdown(user_id);
        
        if (sector_exposures.empty()) {
            return 0.0;
        }
        
        // Calculate Herfindahl-Hirschman Index for concentration
        double hhi = 0.0;
        for (const auto& [sector, exposure] : sector_exposures) {
            hhi += exposure * exposure;
        }
        
        // Normalize to 0-1 scale (1 = maximum concentration)
        return hhi;
        
    } catch (...) {
        return 0.0;
    }
}

double RiskReporter::calculateCorrelationRisk(const std::string& user_id) const noexcept {
    try {
        PortfolioState portfolio = monitor_->getPortfolioState(user_id);
        
        if (portfolio.positions.size() < 2) {
            return 0.0;
        }
        
        // Simplified correlation risk calculation
        // In a real implementation, this would use actual correlation matrices
        double avg_correlation = 0.5; // Assume moderate correlation
        double position_count = static_cast<double>(portfolio.positions.size());
        
        // Risk increases with number of positions and correlation
        return avg_correlation * (position_count / 50.0); // Normalize by max positions
        
    } catch (...) {
        return 0.0;
    }
}

void RiskReporter::checkPositionSizeLimits(const std::string& user_id, const RiskParameters& params) noexcept {
    try {
        PortfolioState portfolio = monitor_->getPortfolioState(user_id);
        
        for (const auto& [symbol, position] : portfolio.positions) {
            double position_pct = position.market_value / portfolio.total_equity;
            
            if (position_pct > params.max_position_size_pct) {
                generateAlert(user_id,
                            RiskAlertType::POSITION_SIZE_BREACH,
                            RiskAlertLevel::WARNING,
                            "Position size limit exceeded",
                            "Position " + symbol + " exceeds maximum size limit",
                            params.max_position_size_pct * 100.0,
                            position_pct * 100.0,
                            symbol);
            }
        }
        
    } catch (...) {
        Logger::getInstance().error("Failed to check position size limits for user {}", user_id);
    }
}

void RiskReporter::checkSectorExposureLimits(const std::string& user_id, const RiskParameters& params) noexcept {
    try {
        auto sector_exposures = monitor_->getSectorBreakdown(user_id);
        
        for (const auto& [sector, exposure] : sector_exposures) {
            if (exposure > params.max_sector_exposure_pct) {
                generateAlert(user_id,
                            RiskAlertType::SECTOR_EXPOSURE_BREACH,
                            RiskAlertLevel::WARNING,
                            "Sector exposure limit exceeded",
                            "Sector " + sector + " exposure exceeds maximum limit",
                            params.max_sector_exposure_pct * 100.0,
                            exposure * 100.0);
            }
        }
        
    } catch (...) {
        Logger::getInstance().error("Failed to check sector exposure limits for user {}", user_id);
    }
}

void RiskReporter::checkDrawdownLimits(const std::string& user_id, const RiskParameters& params) noexcept {
    try {
        RiskMetrics metrics = getRiskMetrics(user_id);
        
        if (metrics.current_drawdown_pct > params.max_drawdown_pct * 100.0) {
            RiskAlertLevel level = (metrics.current_drawdown_pct > params.max_drawdown_pct * 150.0) ?
                                  RiskAlertLevel::CRITICAL : RiskAlertLevel::WARNING;
            
            generateAlert(user_id,
                        RiskAlertType::DRAWDOWN_BREACH,
                        level,
                        "Drawdown limit exceeded",
                        "Current drawdown exceeds maximum allowed limit",
                        params.max_drawdown_pct * 100.0,
                        metrics.current_drawdown_pct);
        }
        
    } catch (...) {
        Logger::getInstance().error("Failed to check drawdown limits for user {}", user_id);
    }
}

void RiskReporter::checkLeverageLimits(const std::string& user_id, const RiskParameters& params) noexcept {
    try {
        RiskMetrics metrics = getRiskMetrics(user_id);
        
        if (metrics.leverage_ratio > params.leverage_limit) {
            RiskAlertLevel level = (metrics.leverage_ratio > params.leverage_limit * 1.5) ?
                                  RiskAlertLevel::CRITICAL : RiskAlertLevel::WARNING;
            
            generateAlert(user_id,
                        RiskAlertType::LEVERAGE_BREACH,
                        level,
                        "Leverage limit exceeded",
                        "Current leverage exceeds maximum allowed limit",
                        params.leverage_limit,
                        metrics.leverage_ratio);
        }
        
    } catch (...) {
        Logger::getInstance().error("Failed to check leverage limits for user {}", user_id);
    }
}

void RiskReporter::checkVaRLimits(const std::string& user_id, const RiskParameters& params) noexcept {
    try {
        RiskMetrics metrics = getRiskMetrics(user_id);
        
        // Use a default VaR limit of 5% of portfolio value
        double var_limit_pct = 5.0;
        double var_pct = (metrics.portfolio_value > 0) ? 
            (metrics.portfolio_var_95 / metrics.portfolio_value) * 100.0 : 0.0;
        
        if (var_pct > var_limit_pct) {
            generateAlert(user_id,
                        RiskAlertType::VAR_BREACH,
                        RiskAlertLevel::WARNING,
                        "VaR limit exceeded",
                        "Portfolio Value-at-Risk exceeds maximum allowed limit",
                        var_limit_pct,
                        var_pct);
        }
        
    } catch (...) {
        Logger::getInstance().error("Failed to check VaR limits for user {}", user_id);
    }
}

} // namespace tradeflow