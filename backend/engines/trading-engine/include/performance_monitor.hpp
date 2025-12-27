#pragma once

#include "latency_tracker.hpp"
#include <atomic>
#include <array>
#include <chrono>
#include <memory>

namespace tradeflow {

/**
 * System resource metrics
 */
struct SystemMetrics {
    double cpu_usage_percent;
    uint64_t memory_used_bytes;
    uint64_t memory_available_bytes;
    uint64_t network_bytes_sent;
    uint64_t network_bytes_received;
    uint32_t active_connections;
    uint64_t disk_reads;
    uint64_t disk_writes;
    uint64_t timestamp_nanos;
};

/**
 * Trading performance metrics
 */
struct TradingMetrics {
    uint64_t orders_per_second;
    uint64_t trades_per_second;
    uint64_t market_data_updates_per_second;
    double average_order_latency_micros;
    double p99_order_latency_micros;
    double average_fill_latency_micros;
    uint64_t total_volume_traded;
    int64_t total_pnl;
    uint32_t active_strategies;
    uint32_t active_positions;
    uint64_t timestamp_nanos;
};

/**
 * Performance alert levels
 */
enum class AlertLevel : uint8_t {
    INFO = 0,
    WARNING = 1,
    CRITICAL = 2,
    EMERGENCY = 3
};

/**
 * Performance alert
 */
struct PerformanceAlert {
    AlertLevel level;
    char metric_name[64];
    char description[256];
    double threshold_value;
    double current_value;
    uint64_t timestamp_nanos;
};

/**
 * Performance threshold configuration
 */
struct PerformanceThresholds {
    double max_cpu_usage_percent;
    uint64_t max_memory_usage_bytes;
    double max_order_latency_micros;
    double max_fill_latency_micros;
    uint64_t max_orders_per_second;
    uint32_t max_active_connections;
    int64_t max_daily_loss;
    double min_system_availability;
};

/**
 * Metrics aggregation window
 */
enum class AggregationWindow : uint8_t {
    SECOND = 0,
    MINUTE = 1,
    HOUR = 2,
    DAY = 3
};

/**
 * Historical metrics data point
 */
struct MetricsDataPoint {
    uint64_t timestamp_nanos;
    double value;
    uint64_t count;
    double min_value;
    double max_value;
    double sum_value;
};

/**
 * Ultra-low latency performance monitoring system
 * Collects, aggregates, and monitors system and trading performance metrics
 */
class PerformanceMonitor {
public:
    static constexpr size_t MAX_ALERTS = 1000;
    static constexpr size_t MAX_METRICS_HISTORY = 86400; // 24 hours of seconds
    static constexpr size_t METRICS_BUFFER_SIZE = 10000;
    
    PerformanceMonitor();
    ~PerformanceMonitor() = default;
    
    // Non-copyable, non-movable
    PerformanceMonitor(const PerformanceMonitor&) = delete;
    PerformanceMonitor& operator=(const PerformanceMonitor&) = delete;
    PerformanceMonitor(PerformanceMonitor&&) = delete;
    PerformanceMonitor& operator=(PerformanceMonitor&&) = delete;
    
    /**
     * Start performance monitoring
     * @param collection_interval_ms Metrics collection interval in milliseconds
     */
    void start_monitoring(uint32_t collection_interval_ms = 1000) noexcept;
    
    /**
     * Stop performance monitoring
     */
    void stop_monitoring() noexcept;
    
    /**
     * Record order latency (nanosecond precision)
     * @param start_time Order start timestamp
     * @param end_time Order completion timestamp
     */
    void record_order_latency(uint64_t start_time, uint64_t end_time) noexcept;
    
    /**
     * Record fill latency
     * @param start_time Fill start timestamp
     * @param end_time Fill completion timestamp
     */
    void record_fill_latency(uint64_t start_time, uint64_t end_time) noexcept;
    
    /**
     * Record market data update
     */
    void record_market_data_update() noexcept;
    
    /**
     * Record order processed
     */
    void record_order_processed() noexcept;
    
    /**
     * Record trade executed
     * @param volume Trade volume
     * @param pnl Profit/loss for the trade
     */
    void record_trade_executed(uint64_t volume, int64_t pnl) noexcept;
    
    /**
     * Update strategy count
     * @param active_count Number of active strategies
     */
    void update_strategy_count(uint32_t active_count) noexcept;
    
    /**
     * Update position count
     * @param active_count Number of active positions
     */
    void update_position_count(uint32_t active_count) noexcept;
    
    /**
     * Set performance thresholds
     * @param thresholds Threshold configuration
     */
    void set_thresholds(const PerformanceThresholds& thresholds) noexcept;
    
    /**
     * Get current system metrics
     * @return Current system resource usage
     */
    SystemMetrics get_system_metrics() const noexcept;
    
    /**
     * Get current trading metrics
     * @return Current trading performance metrics
     */
    TradingMetrics get_trading_metrics() const noexcept;
    
    /**
     * Get recent performance alerts
     * @param alerts Array to fill with alerts
     * @param max_alerts Maximum number of alerts to return
     * @return Number of alerts returned
     */
    size_t get_recent_alerts(PerformanceAlert* alerts, size_t max_alerts) const noexcept;
    
    /**
     * Get historical metrics
     * @param metric_name Name of the metric
     * @param window Aggregation window
     * @param data_points Array to fill with historical data
     * @param max_points Maximum number of data points to return
     * @return Number of data points returned
     */
    size_t get_historical_metrics(const char* metric_name, AggregationWindow window,
                                 MetricsDataPoint* data_points, size_t max_points) const noexcept;
    
    /**
     * Generate performance dashboard data
     * @return JSON-formatted dashboard data (allocated from internal buffer)
     */
    const char* generate_dashboard_data() noexcept;
    
    /**
     * Check system health
     * @return true if all systems are healthy
     */
    bool is_system_healthy() const noexcept;
    
    /**
     * Get performance summary
     */
    struct PerformanceSummary {
        double system_health_score;      // 0.0 to 1.0
        uint64_t uptime_seconds;
        uint64_t total_orders_processed;
        uint64_t total_trades_executed;
        double average_daily_pnl;
        uint32_t active_alerts;
        double cpu_usage_percent;
        double memory_usage_percent;
        double network_utilization_percent;
    };
    
    PerformanceSummary get_performance_summary() const noexcept;
    
    /**
     * Reset all metrics and statistics
     */
    void reset_metrics() noexcept;
    
private:
    // Monitoring state
    std::atomic<bool> monitoring_active_{false};
    std::atomic<uint64_t> start_time_{0};
    uint32_t collection_interval_ms_{1000};
    
    // Latency tracking
    LatencyTracker order_latency_tracker_;
    LatencyTracker fill_latency_tracker_;
    
    // Performance counters
    std::atomic<uint64_t> market_data_updates_{0};
    std::atomic<uint64_t> orders_processed_{0};
    std::atomic<uint64_t> trades_executed_{0};
    std::atomic<uint64_t> total_volume_traded_{0};
    std::atomic<int64_t> total_pnl_{0};
    std::atomic<uint32_t> active_strategies_{0};
    std::atomic<uint32_t> active_positions_{0};
    
    // Rate tracking (per second)
    struct RateCounter {
        std::atomic<uint64_t> current_second{0};
        std::atomic<uint64_t> current_count{0};
        std::atomic<uint64_t> last_rate{0};
    };
    
    RateCounter market_data_rate_;
    RateCounter order_rate_;
    RateCounter trade_rate_;
    
    // System metrics
    mutable SystemMetrics cached_system_metrics_{};
    mutable std::atomic<uint64_t> last_system_metrics_update_{0};
    
    // Performance thresholds
    PerformanceThresholds thresholds_{};
    
    // Alerts
    alignas(64) std::array<PerformanceAlert, MAX_ALERTS> alerts_;
    std::atomic<size_t> alert_count_{0};
    std::atomic<size_t> alert_write_index_{0};
    
    // Historical metrics storage
    struct MetricsTimeSeries {
        char name[64];
        std::array<MetricsDataPoint, MAX_METRICS_HISTORY> data_points;
        std::atomic<size_t> write_index{0};
        std::atomic<size_t> count{0};
        bool active;
    };
    
    static constexpr size_t MAX_TIME_SERIES = 50;
    std::array<MetricsTimeSeries, MAX_TIME_SERIES> time_series_;
    std::atomic<size_t> time_series_count_{0};
    
    // Dashboard data buffer
    alignas(64) char dashboard_buffer_[8192];
    
    // Helper methods
    void collect_metrics() noexcept;
    void update_system_metrics() const noexcept;
    void update_rate_counters() noexcept;
    void check_thresholds() noexcept;
    void add_alert(AlertLevel level, const char* metric_name, const char* description,
                   double threshold, double current_value) noexcept;
    
    size_t find_time_series(const char* name) const noexcept;
    size_t create_time_series(const char* name) noexcept;
    void record_metric_value(const char* name, double value) noexcept;
    
    double calculate_system_health_score() const noexcept;
    double get_cpu_usage() const noexcept;
    uint64_t get_memory_usage() const noexcept;
    uint64_t get_available_memory() const noexcept;
};

/**
 * RAII performance measurement helper
 */
class PerformanceMeasurement {
public:
    explicit PerformanceMeasurement(PerformanceMonitor& monitor, bool is_fill = false) noexcept
        : monitor_(monitor), is_fill_(is_fill), start_time_(LatencyTracker::now_nanos()) {}
    
    ~PerformanceMeasurement() noexcept {
        uint64_t end_time = LatencyTracker::now_nanos();
        if (is_fill_) {
            monitor_.record_fill_latency(start_time_, end_time);
        } else {
            monitor_.record_order_latency(start_time_, end_time);
        }
    }
    
    // Non-copyable, non-movable
    PerformanceMeasurement(const PerformanceMeasurement&) = delete;
    PerformanceMeasurement& operator=(const PerformanceMeasurement&) = delete;
    PerformanceMeasurement(PerformanceMeasurement&&) = delete;
    PerformanceMeasurement& operator=(PerformanceMeasurement&&) = delete;
    
private:
    PerformanceMonitor& monitor_;
    bool is_fill_;
    uint64_t start_time_;
};

} // namespace tradeflow