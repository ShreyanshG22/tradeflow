#include "../include/latency_tracker.hpp"
#include <algorithm>
#include <cstring>
#include <time.h>

namespace tradeflow {

LatencyTracker::LatencyTracker() {
    // Initialize histogram buckets to zero
    for (auto& bucket : histogram_) {
        bucket.store(0, std::memory_order_relaxed);
    }
}

void LatencyTracker::record_latency(uint64_t start_time, uint64_t end_time) noexcept {
    if (end_time <= start_time) {
        return;
    }
    
    uint64_t latency_nanos = end_time - start_time;
    record_latency_nanos(latency_nanos);
}

void LatencyTracker::record_latency_nanos(uint64_t latency_nanos) noexcept {
    // Update histogram
    size_t bucket_index = get_bucket_index(latency_nanos);
    histogram_[bucket_index].fetch_add(1, std::memory_order_relaxed);
    
    // Update running statistics
    count_.fetch_add(1, std::memory_order_relaxed);
    total_nanos_.fetch_add(latency_nanos, std::memory_order_relaxed);
    
    // Update min/max with compare-and-swap loops
    uint64_t current_min = min_nanos_.load(std::memory_order_relaxed);
    while (latency_nanos < current_min) {
        if (min_nanos_.compare_exchange_weak(current_min, latency_nanos, std::memory_order_relaxed)) {
            break;
        }
    }
    
    uint64_t current_max = max_nanos_.load(std::memory_order_relaxed);
    while (latency_nanos > current_max) {
        if (max_nanos_.compare_exchange_weak(current_max, latency_nanos, std::memory_order_relaxed)) {
            break;
        }
    }
}

LatencyTracker::LatencyStats LatencyTracker::get_stats() const noexcept {
    LatencyStats stats{};
    
    stats.count = count_.load(std::memory_order_relaxed);
    stats.min_nanos = min_nanos_.load(std::memory_order_relaxed);
    stats.max_nanos = max_nanos_.load(std::memory_order_relaxed);
    stats.total_nanos = total_nanos_.load(std::memory_order_relaxed);
    
    if (stats.count > 0) {
        stats.avg_nanos = static_cast<double>(stats.total_nanos) / stats.count;
        stats.avg_micros = stats.avg_nanos / 1000.0;
        
        // Calculate percentiles
        stats.p50_nanos = calculate_percentile(0.50);
        stats.p95_nanos = calculate_percentile(0.95);
        stats.p99_nanos = calculate_percentile(0.99);
        stats.p999_nanos = calculate_percentile(0.999);
    } else {
        stats.avg_nanos = 0.0;
        stats.avg_micros = 0.0;
        stats.p50_nanos = 0;
        stats.p95_nanos = 0;
        stats.p99_nanos = 0;
        stats.p999_nanos = 0;
        stats.min_nanos = 0;
    }
    
    return stats;
}

size_t LatencyTracker::get_histogram(uint64_t* buckets, size_t bucket_count) const noexcept {
    if (!buckets || bucket_count == 0) {
        return 0;
    }
    
    size_t copy_count = std::min(bucket_count, HISTOGRAM_BUCKETS);
    
    for (size_t i = 0; i < copy_count; ++i) {
        buckets[i] = histogram_[i].load(std::memory_order_relaxed);
    }
    
    return copy_count;
}

void LatencyTracker::reset() noexcept {
    // Reset histogram
    for (auto& bucket : histogram_) {
        bucket.store(0, std::memory_order_relaxed);
    }
    
    // Reset statistics
    count_.store(0, std::memory_order_relaxed);
    min_nanos_.store(UINT64_MAX, std::memory_order_relaxed);
    max_nanos_.store(0, std::memory_order_relaxed);
    total_nanos_.store(0, std::memory_order_relaxed);
}

uint64_t LatencyTracker::now_nanos() noexcept {
    // Use CLOCK_MONOTONIC for consistent timing
    struct timespec ts;
    clock_gettime(CLOCK_MONOTONIC, &ts);
    return static_cast<uint64_t>(ts.tv_sec) * 1000000000ULL + static_cast<uint64_t>(ts.tv_nsec);
}

size_t LatencyTracker::get_bucket_index(uint64_t latency_nanos) const noexcept {
    // Convert nanoseconds to microseconds for bucketing
    uint64_t latency_micros = latency_nanos / 1000;
    
    // Clamp to maximum bucket index
    if (latency_micros >= MAX_LATENCY_US) {
        return HISTOGRAM_BUCKETS - 1;
    }
    
    return static_cast<size_t>(latency_micros);
}

uint64_t LatencyTracker::calculate_percentile(double percentile) const noexcept {
    uint64_t total_count = count_.load(std::memory_order_relaxed);
    if (total_count == 0) {
        return 0;
    }
    
    uint64_t target_count = static_cast<uint64_t>(total_count * percentile);
    uint64_t running_count = 0;
    
    for (size_t i = 0; i < HISTOGRAM_BUCKETS; ++i) {
        uint64_t bucket_count = histogram_[i].load(std::memory_order_relaxed);
        running_count += bucket_count;
        
        if (running_count >= target_count) {
            // Return the latency in nanoseconds (bucket index is in microseconds)
            return i * 1000;
        }
    }
    
    // Fallback to max latency
    return (HISTOGRAM_BUCKETS - 1) * 1000;
}

// PerformanceCounters implementation

void PerformanceCounters::reset() noexcept {
    orders_received.store(0, std::memory_order_relaxed);
    orders_processed.store(0, std::memory_order_relaxed);
    orders_matched.store(0, std::memory_order_relaxed);
    orders_cancelled.store(0, std::memory_order_relaxed);
    orders_rejected.store(0, std::memory_order_relaxed);
    
    market_updates_received.store(0, std::memory_order_relaxed);
    market_updates_processed.store(0, std::memory_order_relaxed);
    
    signals_generated.store(0, std::memory_order_relaxed);
    trades_executed.store(0, std::memory_order_relaxed);
    
    processing_errors.store(0, std::memory_order_relaxed);
    validation_errors.store(0, std::memory_order_relaxed);
    system_errors.store(0, std::memory_order_relaxed);
}

PerformanceCounters::Snapshot PerformanceCounters::get_snapshot() const noexcept {
    Snapshot snapshot{};
    
    snapshot.orders_received = orders_received.load(std::memory_order_relaxed);
    snapshot.orders_processed = orders_processed.load(std::memory_order_relaxed);
    snapshot.orders_matched = orders_matched.load(std::memory_order_relaxed);
    snapshot.orders_cancelled = orders_cancelled.load(std::memory_order_relaxed);
    snapshot.orders_rejected = orders_rejected.load(std::memory_order_relaxed);
    
    snapshot.market_updates_received = market_updates_received.load(std::memory_order_relaxed);
    snapshot.market_updates_processed = market_updates_processed.load(std::memory_order_relaxed);
    
    snapshot.signals_generated = signals_generated.load(std::memory_order_relaxed);
    snapshot.trades_executed = trades_executed.load(std::memory_order_relaxed);
    
    snapshot.processing_errors = processing_errors.load(std::memory_order_relaxed);
    snapshot.validation_errors = validation_errors.load(std::memory_order_relaxed);
    snapshot.system_errors = system_errors.load(std::memory_order_relaxed);
    
    snapshot.timestamp_nanos = LatencyTracker::now_nanos();
    
    return snapshot;
}

} // namespace tradeflow