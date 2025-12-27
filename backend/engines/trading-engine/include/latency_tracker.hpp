#pragma once

#include <atomic>
#include <array>
#include <cstdint>
#include <chrono>

namespace tradeflow {

/**
 * Ultra-low latency performance tracker
 * Uses lock-free data structures for nanosecond precision measurements
 */
class LatencyTracker {
public:
    static constexpr size_t HISTOGRAM_BUCKETS = 1000;
    static constexpr size_t MAX_LATENCY_US = 999;
    
    LatencyTracker();
    ~LatencyTracker() = default;
    
    // Non-copyable, non-movable
    LatencyTracker(const LatencyTracker&) = delete;
    LatencyTracker& operator=(const LatencyTracker&) = delete;
    LatencyTracker(LatencyTracker&&) = delete;
    LatencyTracker& operator=(LatencyTracker&&) = delete;
    
    /**
     * Record latency measurement (lock-free)
     * @param start_time Start timestamp in nanoseconds
     * @param end_time End timestamp in nanoseconds
     */
    void record_latency(uint64_t start_time, uint64_t end_time) noexcept;
    
    /**
     * Record latency from duration
     * @param latency_nanos Latency in nanoseconds
     */
    void record_latency_nanos(uint64_t latency_nanos) noexcept;
    
    /**
     * Get latency statistics
     */
    struct LatencyStats {
        uint64_t count;
        uint64_t min_nanos;
        uint64_t max_nanos;
        uint64_t total_nanos;
        double avg_nanos;
        double avg_micros;
        uint64_t p50_nanos;
        uint64_t p95_nanos;
        uint64_t p99_nanos;
        uint64_t p999_nanos;
    };
    
    LatencyStats get_stats() const noexcept;
    
    /**
     * Get histogram data for visualization
     * @param buckets Array to fill with histogram data
     * @param bucket_count Size of buckets array
     * @return Number of buckets filled
     */
    size_t get_histogram(uint64_t* buckets, size_t bucket_count) const noexcept;
    
    /**
     * Reset all statistics
     */
    void reset() noexcept;
    
    /**
     * Get current timestamp in nanoseconds (optimized)
     */
    static uint64_t now_nanos() noexcept;
    
private:
    // Lock-free histogram buckets (one per microsecond)
    alignas(64) std::array<std::atomic<uint64_t>, HISTOGRAM_BUCKETS> histogram_;
    
    // Running statistics
    std::atomic<uint64_t> count_{0};
    std::atomic<uint64_t> min_nanos_{UINT64_MAX};
    std::atomic<uint64_t> max_nanos_{0};
    std::atomic<uint64_t> total_nanos_{0};
    
    // Helper methods
    size_t get_bucket_index(uint64_t latency_nanos) const noexcept;
    uint64_t calculate_percentile(double percentile) const noexcept;
};

/**
 * RAII latency measurement helper
 */
class LatencyMeasurement {
public:
    explicit LatencyMeasurement(LatencyTracker& tracker) noexcept
        : tracker_(tracker), start_time_(LatencyTracker::now_nanos()) {}
    
    ~LatencyMeasurement() noexcept {
        uint64_t end_time = LatencyTracker::now_nanos();
        tracker_.record_latency(start_time_, end_time);
    }
    
    // Non-copyable, non-movable
    LatencyMeasurement(const LatencyMeasurement&) = delete;
    LatencyMeasurement& operator=(const LatencyMeasurement&) = delete;
    LatencyMeasurement(LatencyMeasurement&&) = delete;
    LatencyMeasurement& operator=(LatencyMeasurement&&) = delete;
    
    /**
     * Get elapsed time so far
     */
    uint64_t elapsed_nanos() const noexcept {
        return LatencyTracker::now_nanos() - start_time_;
    }
    
private:
    LatencyTracker& tracker_;
    uint64_t start_time_;
};

/**
 * Performance counters for trading operations
 */
class PerformanceCounters {
public:
    PerformanceCounters() = default;
    ~PerformanceCounters() = default;
    
    // Order processing counters
    std::atomic<uint64_t> orders_received{0};
    std::atomic<uint64_t> orders_processed{0};
    std::atomic<uint64_t> orders_matched{0};
    std::atomic<uint64_t> orders_cancelled{0};
    std::atomic<uint64_t> orders_rejected{0};
    
    // Market data counters
    std::atomic<uint64_t> market_updates_received{0};
    std::atomic<uint64_t> market_updates_processed{0};
    
    // Strategy execution counters
    std::atomic<uint64_t> signals_generated{0};
    std::atomic<uint64_t> trades_executed{0};
    
    // Error counters
    std::atomic<uint64_t> processing_errors{0};
    std::atomic<uint64_t> validation_errors{0};
    std::atomic<uint64_t> system_errors{0};
    
    /**
     * Reset all counters
     */
    void reset() noexcept;
    
    /**
     * Get snapshot of all counters
     */
    struct Snapshot {
        uint64_t orders_received;
        uint64_t orders_processed;
        uint64_t orders_matched;
        uint64_t orders_cancelled;
        uint64_t orders_rejected;
        uint64_t market_updates_received;
        uint64_t market_updates_processed;
        uint64_t signals_generated;
        uint64_t trades_executed;
        uint64_t processing_errors;
        uint64_t validation_errors;
        uint64_t system_errors;
        uint64_t timestamp_nanos;
    };
    
    Snapshot get_snapshot() const noexcept;
};

} // namespace tradeflow