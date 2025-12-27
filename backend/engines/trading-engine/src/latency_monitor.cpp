// Trading Engine - Latency Monitor Implementation
// Monitor and track system latency with nanosecond precision

#include "logger.hpp"
#include <chrono>
#include <vector>
#include <mutex>
#include <fstream>
#include <algorithm>
#include <numeric>

namespace tradeflow {

class LatencyMonitor {
public:
    LatencyMonitor() = default;
    
    // Initialize latency monitoring
    bool initialize() {
        auto& logger = Logger::getInstance();
        logger.info("Initializing Latency Monitor");
        
        start_time_ = std::chrono::steady_clock::now();
        return true;
    }
    
    // Record timestamp collection for various events
    void record_market_data_received() {
        auto timestamp = std::chrono::steady_clock::now();
        
        std::lock_guard<std::mutex> lock(metrics_mutex_);
        market_data_timestamps_.push_back(timestamp);
        
        if (market_data_timestamps_.size() > 1000) {
            market_data_timestamps_.erase(market_data_timestamps_.begin());
        }
    }
    
    // Latency calculation between events
    void record_order_latency(const std::chrono::steady_clock::time_point& start,
                             const std::chrono::steady_clock::time_point& end) {
        auto latency = std::chrono::duration_cast<std::chrono::nanoseconds>(end - start);
        
        std::lock_guard<std::mutex> lock(metrics_mutex_);
        order_latencies_.push_back(latency.count());
        
        if (order_latencies_.size() > 10000) {
            order_latencies_.erase(order_latencies_.begin());
        }
    }
    
    // Performance metrics calculation
    struct LatencyStats {
        double min_ns;
        double max_ns;
        double avg_ns;
        double p95_ns;
        double p99_ns;
        size_t count;
    };
    
    LatencyStats get_latency_stats() {
        std::lock_guard<std::mutex> lock(metrics_mutex_);
        return calculate_stats(order_latencies_);
    }
    
    // Histogram generation for latency distribution
    void generate_histogram() {
        std::lock_guard<std::mutex> lock(metrics_mutex_);
        
        if (order_latencies_.empty()) return;
        
        auto& logger = Logger::getInstance();
        logger.info("Generating latency histogram");
        
        // Create histogram buckets
        std::vector<int> buckets(10, 0);
        auto min_lat = *std::min_element(order_latencies_.begin(), order_latencies_.end());
        auto max_lat = *std::max_element(order_latencies_.begin(), order_latencies_.end());
        
        double bucket_size = (max_lat - min_lat) / 10.0;
        
        for (auto latency : order_latencies_) {
            int bucket = std::min(9, (int)((latency - min_lat) / bucket_size));
            buckets[bucket]++;
        }
        
        // Log histogram
        for (int i = 0; i < 10; ++i) {
            double range_start = min_lat + i * bucket_size;
            double range_end = min_lat + (i + 1) * bucket_size;
            logger.info("Bucket " + std::to_string(i) + " [" + 
                       std::to_string(range_start) + "-" + std::to_string(range_end) + 
                       " ns]: " + std::to_string(buckets[i]) + " samples");
        }
    }
    
    // Save metrics and shutdown
    void shutdown() {
        auto& logger = Logger::getInstance();
        logger.info("Shutting down Latency Monitor");
        
        generate_histogram();
        save_metrics();
    }
    
private:
    std::vector<std::chrono::steady_clock::time_point> market_data_timestamps_;
    std::vector<long> order_latencies_;
    std::mutex metrics_mutex_;
    std::chrono::steady_clock::time_point start_time_;
    
    // High-resolution timing components
    LatencyStats calculate_stats(const std::vector<long>& latencies) {
        if (latencies.empty()) {
            return {0, 0, 0, 0, 0, 0};
        }
        
        std::vector<long> sorted = latencies;
        std::sort(sorted.begin(), sorted.end());
        
        LatencyStats stats;
        stats.count = sorted.size();
        stats.min_ns = sorted.front();
        stats.max_ns = sorted.back();
        stats.avg_ns = std::accumulate(sorted.begin(), sorted.end(), 0.0) / stats.count;
        stats.p95_ns = sorted[stats.count * 95 / 100];
        stats.p99_ns = sorted[stats.count * 99 / 100];
        
        return stats;
    }
    
    void save_metrics() {
        std::ofstream file("latency_metrics.csv");
        if (file.is_open()) {
            file << "timestamp,latency_ns\n";
            
            std::lock_guard<std::mutex> lock(metrics_mutex_);
            for (size_t i = 0; i < order_latencies_.size() && i < 1000; ++i) {
                file << i << "," << order_latencies_[i] << "\n";
            }
            
            file.close();
        }
    }
};

} // namespace tradeflow