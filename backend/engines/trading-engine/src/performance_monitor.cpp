#include "../include/performance_monitor.hpp"
#include <cstring>
#include <cstdio>
#include <thread>
#include <fstream>
#include <sstream>

#ifdef __APPLE__
#include <mach/mach.h>
#include <sys/sysctl.h>
#include <sys/mount.h>
#elif __linux__
#include <sys/sysinfo.h>
#include <unistd.h>
#endif

namespace tradeflow {

PerformanceMonitor::PerformanceMonitor() {
    // Initialize thresholds with default values
    thresholds_.max_cpu_usage_percent = 80.0;
    thresholds_.max_memory_usage_bytes = 8ULL * 1024 * 1024 * 1024; // 8GB
    thresholds_.max_order_latency_micros = 100.0; // 100 microseconds
    thresholds_.max_fill_latency_micros = 50.0;   // 50 microseconds
    thresholds_.max_orders_per_second = 100000;
    thresholds_.max_active_connections = 10000;
    thresholds_.max_daily_loss = 100000; // $1000.00
    thresholds_.min_system_availability = 0.999; // 99.9%
    
    // Initialize alerts array
    for (auto& alert : alerts_) {
        std::memset(&alert, 0, sizeof(alert));
    }
    
    // Initialize time series
    for (auto& series : time_series_) {
        std::memset(series.name, 0, sizeof(series.name));
        series.active = false;
        series.write_index.store(0, std::memory_order_relaxed);
        series.count.store(0, std::memory_order_relaxed);
        
        for (auto& point : series.data_points) {
            std::memset(&point, 0, sizeof(point));
        }
    }
    
    // Initialize rate counters
    market_data_rate_.current_second.store(0, std::memory_order_relaxed);
    market_data_rate_.current_count.store(0, std::memory_order_relaxed);
    market_data_rate_.last_rate.store(0, std::memory_order_relaxed);
    
    order_rate_.current_second.store(0, std::memory_order_relaxed);
    order_rate_.current_count.store(0, std::memory_order_relaxed);
    order_rate_.last_rate.store(0, std::memory_order_relaxed);
    
    trade_rate_.current_second.store(0, std::memory_order_relaxed);
    trade_rate_.current_count.store(0, std::memory_order_relaxed);
    trade_rate_.last_rate.store(0, std::memory_order_relaxed);
    
    // Initialize dashboard buffer
    std::memset(dashboard_buffer_, 0, sizeof(dashboard_buffer_));
}

void PerformanceMonitor::start_monitoring(uint32_t collection_interval_ms) noexcept {
    collection_interval_ms_ = collection_interval_ms;
    start_time_.store(LatencyTracker::now_nanos(), std::memory_order_release);
    monitoring_active_.store(true, std::memory_order_release);
    
    // Create initial time series
    create_time_series("cpu_usage");
    create_time_series("memory_usage");
    create_time_series("order_latency");
    create_time_series("fill_latency");
    create_time_series("orders_per_second");
    create_time_series("trades_per_second");
    create_time_series("market_data_per_second");
    create_time_series("total_pnl");
}

void PerformanceMonitor::stop_monitoring() noexcept {
    monitoring_active_.store(false, std::memory_order_release);
}

void PerformanceMonitor::record_order_latency(uint64_t start_time, uint64_t end_time) noexcept {
    if (end_time > start_time) {
        order_latency_tracker_.record_latency(start_time, end_time);
        
        // Record in time series
        double latency_micros = static_cast<double>(end_time - start_time) / 1000.0;
        record_metric_value("order_latency", latency_micros);
    }
}

void PerformanceMonitor::record_fill_latency(uint64_t start_time, uint64_t end_time) noexcept {
    if (end_time > start_time) {
        fill_latency_tracker_.record_latency(start_time, end_time);
        
        // Record in time series
        double latency_micros = static_cast<double>(end_time - start_time) / 1000.0;
        record_metric_value("fill_latency", latency_micros);
    }
}

void PerformanceMonitor::record_market_data_update() noexcept {
    market_data_updates_.fetch_add(1, std::memory_order_relaxed);
    
    // Update rate counter
    uint64_t current_second = LatencyTracker::now_nanos() / 1000000000ULL;
    uint64_t last_second = market_data_rate_.current_second.load(std::memory_order_acquire);
    
    if (current_second != last_second) {
        // New second, update rate and reset counter
        uint64_t count = market_data_rate_.current_count.exchange(1, std::memory_order_acq_rel);
        market_data_rate_.last_rate.store(count, std::memory_order_release);
        market_data_rate_.current_second.store(current_second, std::memory_order_release);
    } else {
        market_data_rate_.current_count.fetch_add(1, std::memory_order_relaxed);
    }
}

void PerformanceMonitor::record_order_processed() noexcept {
    orders_processed_.fetch_add(1, std::memory_order_relaxed);
    
    // Update rate counter
    uint64_t current_second = LatencyTracker::now_nanos() / 1000000000ULL;
    uint64_t last_second = order_rate_.current_second.load(std::memory_order_acquire);
    
    if (current_second != last_second) {
        uint64_t count = order_rate_.current_count.exchange(1, std::memory_order_acq_rel);
        order_rate_.last_rate.store(count, std::memory_order_release);
        order_rate_.current_second.store(current_second, std::memory_order_release);
    } else {
        order_rate_.current_count.fetch_add(1, std::memory_order_relaxed);
    }
}

void PerformanceMonitor::record_trade_executed(uint64_t volume, int64_t pnl) noexcept {
    trades_executed_.fetch_add(1, std::memory_order_relaxed);
    total_volume_traded_.fetch_add(volume, std::memory_order_relaxed);
    total_pnl_.fetch_add(pnl, std::memory_order_relaxed);
    
    // Update rate counter
    uint64_t current_second = LatencyTracker::now_nanos() / 1000000000ULL;
    uint64_t last_second = trade_rate_.current_second.load(std::memory_order_acquire);
    
    if (current_second != last_second) {
        uint64_t count = trade_rate_.current_count.exchange(1, std::memory_order_acq_rel);
        trade_rate_.last_rate.store(count, std::memory_order_release);
        trade_rate_.current_second.store(current_second, std::memory_order_release);
    } else {
        trade_rate_.current_count.fetch_add(1, std::memory_order_relaxed);
    }
    
    // Record P&L in time series
    record_metric_value("total_pnl", static_cast<double>(total_pnl_.load()));
}

void PerformanceMonitor::update_strategy_count(uint32_t active_count) noexcept {
    active_strategies_.store(active_count, std::memory_order_relaxed);
}

void PerformanceMonitor::update_position_count(uint32_t active_count) noexcept {
    active_positions_.store(active_count, std::memory_order_relaxed);
}

void PerformanceMonitor::set_thresholds(const PerformanceThresholds& thresholds) noexcept {
    thresholds_ = thresholds;
}

SystemMetrics PerformanceMonitor::get_system_metrics() const noexcept {
    uint64_t current_time = LatencyTracker::now_nanos();
    uint64_t last_update = last_system_metrics_update_.load(std::memory_order_acquire);
    
    // Update system metrics if cache is stale (older than 1 second)
    if (current_time - last_update > 1000000000ULL) {
        update_system_metrics();
    }
    
    return cached_system_metrics_;
}

TradingMetrics PerformanceMonitor::get_trading_metrics() const noexcept {
    TradingMetrics metrics{};
    
    metrics.orders_per_second = order_rate_.last_rate.load(std::memory_order_acquire);
    metrics.trades_per_second = trade_rate_.last_rate.load(std::memory_order_acquire);
    metrics.market_data_updates_per_second = market_data_rate_.last_rate.load(std::memory_order_acquire);
    
    auto order_stats = order_latency_tracker_.get_stats();
    metrics.average_order_latency_micros = order_stats.avg_micros;
    metrics.p99_order_latency_micros = static_cast<double>(order_stats.p99_nanos) / 1000.0;
    
    auto fill_stats = fill_latency_tracker_.get_stats();
    metrics.average_fill_latency_micros = fill_stats.avg_micros;
    
    metrics.total_volume_traded = total_volume_traded_.load(std::memory_order_relaxed);
    metrics.total_pnl = total_pnl_.load(std::memory_order_relaxed);
    metrics.active_strategies = active_strategies_.load(std::memory_order_relaxed);
    metrics.active_positions = active_positions_.load(std::memory_order_relaxed);
    metrics.timestamp_nanos = LatencyTracker::now_nanos();
    
    return metrics;
}

size_t PerformanceMonitor::get_recent_alerts(PerformanceAlert* alerts, size_t max_alerts) const noexcept {
    if (!alerts || max_alerts == 0) {
        return 0;
    }
    
    size_t alert_count = alert_count_.load(std::memory_order_acquire);
    size_t copy_count = std::min(max_alerts, alert_count);
    size_t write_index = alert_write_index_.load(std::memory_order_acquire);
    
    for (size_t i = 0; i < copy_count; ++i) {
        size_t index = (write_index - copy_count + i) % MAX_ALERTS;
        alerts[i] = alerts_[index];
    }
    
    return copy_count;
}

size_t PerformanceMonitor::get_historical_metrics(const char* metric_name, AggregationWindow window,
                                                 MetricsDataPoint* data_points, size_t max_points) const noexcept {
    if (!metric_name || !data_points || max_points == 0) {
        return 0;
    }
    
    size_t series_index = find_time_series(metric_name);
    if (series_index >= MAX_TIME_SERIES) {
        return 0;
    }
    
    const MetricsTimeSeries& series = time_series_[series_index];
    size_t count = series.count.load(std::memory_order_acquire);
    size_t copy_count = std::min(max_points, count);
    size_t write_index = series.write_index.load(std::memory_order_acquire);
    
    for (size_t i = 0; i < copy_count; ++i) {
        size_t index = (write_index - copy_count + i) % MAX_METRICS_HISTORY;
        data_points[i] = series.data_points[index];
    }
    
    return copy_count;
}

const char* PerformanceMonitor::generate_dashboard_data() noexcept {
    auto system_metrics = get_system_metrics();
    auto trading_metrics = get_trading_metrics();
    auto summary = get_performance_summary();
    
    std::snprintf(dashboard_buffer_, sizeof(dashboard_buffer_),
        "{"
        "\"timestamp\":%llu,"
        "\"system\":{"
            "\"cpu_usage\":%.2f,"
            "\"memory_used\":%llu,"
            "\"memory_available\":%llu,"
            "\"network_sent\":%llu,"
            "\"network_received\":%llu"
        "},"
        "\"trading\":{"
            "\"orders_per_second\":%llu,"
            "\"trades_per_second\":%llu,"
            "\"market_data_per_second\":%llu,"
            "\"avg_order_latency\":%.2f,"
            "\"p99_order_latency\":%.2f,"
            "\"total_volume\":%llu,"
            "\"total_pnl\":%lld,"
            "\"active_strategies\":%u,"
            "\"active_positions\":%u"
        "},"
        "\"health\":{"
            "\"score\":%.3f,"
            "\"uptime\":%llu,"
            "\"active_alerts\":%u"
        "}"
        "}",
        static_cast<unsigned long long>(LatencyTracker::now_nanos()),
        system_metrics.cpu_usage_percent,
        static_cast<unsigned long long>(system_metrics.memory_used_bytes),
        static_cast<unsigned long long>(system_metrics.memory_available_bytes),
        static_cast<unsigned long long>(system_metrics.network_bytes_sent),
        static_cast<unsigned long long>(system_metrics.network_bytes_received),
        static_cast<unsigned long long>(trading_metrics.orders_per_second),
        static_cast<unsigned long long>(trading_metrics.trades_per_second),
        static_cast<unsigned long long>(trading_metrics.market_data_updates_per_second),
        trading_metrics.average_order_latency_micros,
        trading_metrics.p99_order_latency_micros,
        static_cast<unsigned long long>(trading_metrics.total_volume_traded),
        static_cast<long long>(trading_metrics.total_pnl),
        trading_metrics.active_strategies,
        trading_metrics.active_positions,
        summary.system_health_score,
        static_cast<unsigned long long>(summary.uptime_seconds),
        summary.active_alerts
    );
    
    return dashboard_buffer_;
}

bool PerformanceMonitor::is_system_healthy() const noexcept {
    return calculate_system_health_score() > 0.8; // 80% health threshold
}

PerformanceMonitor::PerformanceSummary PerformanceMonitor::get_performance_summary() const noexcept {
    PerformanceSummary summary{};
    
    summary.system_health_score = calculate_system_health_score();
    
    uint64_t current_time = LatencyTracker::now_nanos();
    uint64_t start = start_time_.load(std::memory_order_acquire);
    summary.uptime_seconds = (current_time - start) / 1000000000ULL;
    
    summary.total_orders_processed = orders_processed_.load(std::memory_order_relaxed);
    summary.total_trades_executed = trades_executed_.load(std::memory_order_relaxed);
    
    if (summary.uptime_seconds > 0) {
        summary.average_daily_pnl = static_cast<double>(total_pnl_.load()) * 86400.0 / summary.uptime_seconds;
    }
    
    summary.active_alerts = static_cast<uint32_t>(alert_count_.load(std::memory_order_relaxed));
    
    auto system_metrics = get_system_metrics();
    summary.cpu_usage_percent = system_metrics.cpu_usage_percent;
    summary.memory_usage_percent = static_cast<double>(system_metrics.memory_used_bytes) * 100.0 / 
                                  (system_metrics.memory_used_bytes + system_metrics.memory_available_bytes);
    summary.network_utilization_percent = 0.0; // Simplified for now
    
    return summary;
}

void PerformanceMonitor::reset_metrics() noexcept {
    // Reset counters
    market_data_updates_.store(0, std::memory_order_relaxed);
    orders_processed_.store(0, std::memory_order_relaxed);
    trades_executed_.store(0, std::memory_order_relaxed);
    total_volume_traded_.store(0, std::memory_order_relaxed);
    total_pnl_.store(0, std::memory_order_relaxed);
    
    // Reset latency trackers
    order_latency_tracker_.reset();
    fill_latency_tracker_.reset();
    
    // Reset rate counters
    market_data_rate_.current_count.store(0, std::memory_order_relaxed);
    market_data_rate_.last_rate.store(0, std::memory_order_relaxed);
    order_rate_.current_count.store(0, std::memory_order_relaxed);
    order_rate_.last_rate.store(0, std::memory_order_relaxed);
    trade_rate_.current_count.store(0, std::memory_order_relaxed);
    trade_rate_.last_rate.store(0, std::memory_order_relaxed);
    
    // Reset alerts
    alert_count_.store(0, std::memory_order_relaxed);
    alert_write_index_.store(0, std::memory_order_relaxed);
    
    // Reset time series
    for (auto& series : time_series_) {
        if (series.active) {
            series.write_index.store(0, std::memory_order_relaxed);
            series.count.store(0, std::memory_order_relaxed);
        }
    }
    
    start_time_.store(LatencyTracker::now_nanos(), std::memory_order_release);
}

// Private helper methods

void PerformanceMonitor::update_system_metrics() const noexcept {
    cached_system_metrics_.cpu_usage_percent = get_cpu_usage();
    cached_system_metrics_.memory_used_bytes = get_memory_usage();
    cached_system_metrics_.memory_available_bytes = get_available_memory();
    cached_system_metrics_.network_bytes_sent = 0; // Simplified
    cached_system_metrics_.network_bytes_received = 0; // Simplified
    cached_system_metrics_.active_connections = 0; // Simplified
    cached_system_metrics_.disk_reads = 0; // Simplified
    cached_system_metrics_.disk_writes = 0; // Simplified
    cached_system_metrics_.timestamp_nanos = LatencyTracker::now_nanos();
    
    last_system_metrics_update_.store(cached_system_metrics_.timestamp_nanos, std::memory_order_release);
}

double PerformanceMonitor::get_cpu_usage() const noexcept {
#ifdef __APPLE__
    // Simplified CPU usage calculation for macOS
    host_cpu_load_info_data_t cpuinfo;
    mach_msg_type_number_t count = HOST_CPU_LOAD_INFO_COUNT;
    
    if (host_statistics(mach_host_self(), HOST_CPU_LOAD_INFO, 
                       (host_info_t)&cpuinfo, &count) == KERN_SUCCESS) {
        
        unsigned long total_ticks = cpuinfo.cpu_ticks[CPU_STATE_USER] + 
                                   cpuinfo.cpu_ticks[CPU_STATE_SYSTEM] + 
                                   cpuinfo.cpu_ticks[CPU_STATE_IDLE] + 
                                   cpuinfo.cpu_ticks[CPU_STATE_NICE];
        
        if (total_ticks > 0) {
            unsigned long idle_ticks = cpuinfo.cpu_ticks[CPU_STATE_IDLE];
            return (1.0 - static_cast<double>(idle_ticks) / total_ticks) * 100.0;
        }
    }
#elif __linux__
    // Linux CPU usage calculation
    std::ifstream stat_file("/proc/stat");
    if (stat_file.is_open()) {
        std::string line;
        std::getline(stat_file, line);
        
        std::istringstream iss(line);
        std::string cpu;
        long user, nice, system, idle, iowait, irq, softirq, steal;
        
        if (iss >> cpu >> user >> nice >> system >> idle >> iowait >> irq >> softirq >> steal) {
            long total = user + nice + system + idle + iowait + irq + softirq + steal;
            if (total > 0) {
                return (1.0 - static_cast<double>(idle) / total) * 100.0;
            }
        }
    }
#endif
    
    return 0.0; // Fallback
}

uint64_t PerformanceMonitor::get_memory_usage() const noexcept {
#ifdef __APPLE__
    vm_size_t page_size;
    vm_statistics64_data_t vm_stat;
    mach_msg_type_number_t count = sizeof(vm_stat) / sizeof(natural_t);
    
    if (host_page_size(mach_host_self(), &page_size) == KERN_SUCCESS &&
        host_statistics64(mach_host_self(), HOST_VM_INFO, 
                         (host_info64_t)&vm_stat, &count) == KERN_SUCCESS) {
        
        uint64_t used_pages = vm_stat.active_count + vm_stat.inactive_count + 
                             vm_stat.wire_count + vm_stat.compressor_page_count;
        return used_pages * page_size;
    }
#elif __linux__
    struct sysinfo info;
    if (sysinfo(&info) == 0) {
        return (info.totalram - info.freeram) * info.mem_unit;
    }
#endif
    
    return 0;
}

uint64_t PerformanceMonitor::get_available_memory() const noexcept {
#ifdef __APPLE__
    vm_size_t page_size;
    vm_statistics64_data_t vm_stat;
    mach_msg_type_number_t count = sizeof(vm_stat) / sizeof(natural_t);
    
    if (host_page_size(mach_host_self(), &page_size) == KERN_SUCCESS &&
        host_statistics64(mach_host_self(), HOST_VM_INFO, 
                         (host_info64_t)&vm_stat, &count) == KERN_SUCCESS) {
        
        return vm_stat.free_count * page_size;
    }
#elif __linux__
    struct sysinfo info;
    if (sysinfo(&info) == 0) {
        return info.freeram * info.mem_unit;
    }
#endif
    
    return 0;
}

double PerformanceMonitor::calculate_system_health_score() const noexcept {
    double score = 1.0;
    
    // CPU usage factor
    double cpu_usage = get_cpu_usage();
    if (cpu_usage > thresholds_.max_cpu_usage_percent) {
        score *= 0.8;
    }
    
    // Memory usage factor
    uint64_t memory_used = get_memory_usage();
    if (memory_used > thresholds_.max_memory_usage_bytes) {
        score *= 0.8;
    }
    
    // Latency factor
    auto order_stats = order_latency_tracker_.get_stats();
    if (order_stats.avg_micros > thresholds_.max_order_latency_micros) {
        score *= 0.9;
    }
    
    // Alert factor
    size_t alert_count = alert_count_.load(std::memory_order_relaxed);
    if (alert_count > 0) {
        score *= (1.0 - std::min(0.3, static_cast<double>(alert_count) * 0.1));
    }
    
    return std::max(0.0, score);
}

size_t PerformanceMonitor::find_time_series(const char* name) const noexcept {
    if (!name) return MAX_TIME_SERIES;
    
    size_t count = time_series_count_.load(std::memory_order_acquire);
    for (size_t i = 0; i < count && i < MAX_TIME_SERIES; ++i) {
        if (time_series_[i].active && std::strcmp(time_series_[i].name, name) == 0) {
            return i;
        }
    }
    
    return MAX_TIME_SERIES;
}

size_t PerformanceMonitor::create_time_series(const char* name) noexcept {
    if (!name || std::strlen(name) >= 64) {
        return MAX_TIME_SERIES;
    }
    
    // Check if already exists
    size_t existing = find_time_series(name);
    if (existing < MAX_TIME_SERIES) {
        return existing;
    }
    
    size_t current_count = time_series_count_.load(std::memory_order_acquire);
    if (current_count >= MAX_TIME_SERIES) {
        return MAX_TIME_SERIES;
    }
    
    // Try to increment count atomically
    if (time_series_count_.compare_exchange_weak(current_count, current_count + 1, std::memory_order_acq_rel)) {
        MetricsTimeSeries& series = time_series_[current_count];
        std::strncpy(series.name, name, sizeof(series.name) - 1);
        series.name[sizeof(series.name) - 1] = '\0';
        series.active = true;
        series.write_index.store(0, std::memory_order_relaxed);
        series.count.store(0, std::memory_order_relaxed);
        
        return current_count;
    }
    
    return MAX_TIME_SERIES;
}

void PerformanceMonitor::record_metric_value(const char* name, double value) noexcept {
    size_t series_index = find_time_series(name);
    if (series_index >= MAX_TIME_SERIES) {
        series_index = create_time_series(name);
        if (series_index >= MAX_TIME_SERIES) {
            return;
        }
    }
    
    MetricsTimeSeries& series = time_series_[series_index];
    size_t write_index = series.write_index.load(std::memory_order_acquire);
    size_t next_index = (write_index + 1) % MAX_METRICS_HISTORY;
    
    MetricsDataPoint& point = series.data_points[write_index];
    point.timestamp_nanos = LatencyTracker::now_nanos();
    point.value = value;
    point.count = 1;
    point.min_value = value;
    point.max_value = value;
    point.sum_value = value;
    
    series.write_index.store(next_index, std::memory_order_release);
    
    size_t count = series.count.load(std::memory_order_acquire);
    if (count < MAX_METRICS_HISTORY) {
        series.count.store(count + 1, std::memory_order_release);
    }
}

void PerformanceMonitor::add_alert(AlertLevel level, const char* metric_name, const char* description,
                                  double threshold, double current_value) noexcept {
    size_t write_index = alert_write_index_.load(std::memory_order_acquire);
    size_t next_index = (write_index + 1) % MAX_ALERTS;
    
    PerformanceAlert& alert = alerts_[write_index];
    alert.level = level;
    std::strncpy(alert.metric_name, metric_name, sizeof(alert.metric_name) - 1);
    alert.metric_name[sizeof(alert.metric_name) - 1] = '\0';
    std::strncpy(alert.description, description, sizeof(alert.description) - 1);
    alert.description[sizeof(alert.description) - 1] = '\0';
    alert.threshold_value = threshold;
    alert.current_value = current_value;
    alert.timestamp_nanos = LatencyTracker::now_nanos();
    
    alert_write_index_.store(next_index, std::memory_order_release);
    
    size_t count = alert_count_.load(std::memory_order_acquire);
    if (count < MAX_ALERTS) {
        alert_count_.store(count + 1, std::memory_order_release);
    }
}

} // namespace tradeflow