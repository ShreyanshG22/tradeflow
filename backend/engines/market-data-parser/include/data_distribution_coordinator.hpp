#pragma once

#include "market_data_types.hpp"
#include "shared_memory_ipc.hpp"
#include "tick_storage.hpp"
#include <thread>
#include <vector>
#include <memory>
#include <atomic>

namespace MarketData {

// Main coordinator for real-time data distribution
class DataDistributionCoordinator {
public:
    struct Config {
        std::string shared_memory_name = "tradeflow_market_data";
        size_t worker_thread_count = 4;
        size_t max_subscribers = 64;
        std::chrono::milliseconds distribution_interval{1}; // 1ms
        bool enable_compression = true;
        bool enable_deduplication = true;
        size_t deduplication_cache_size = 10000;
        std::chrono::seconds cleanup_interval{300}; // 5 minutes
    };
    
    DataDistributionCoordinator(const Config& config = Config{});
    ~DataDistributionCoordinator();
    
    // Non-copyable, non-movable
    DataDistributionCoordinator(const DataDistributionCoordinator&) = delete;
    DataDistributionCoordinator& operator=(const DataDistributionCoordinator&) = delete;
    
    // Lifecycle management
    bool start();
    void stop();
    bool is_running() const { return running_.load(std::memory_order_acquire); }
    
    // Data ingestion
    bool ingest_tick(const MarketTick& tick);
    bool ingest_tick_batch(const std::vector<MarketTick>& ticks);
    
    // Subscription management
    uint32_t add_subscription(const SubscriptionManager::Subscription& subscription);
    bool remove_subscription(uint32_t subscription_id);
    bool update_subscription(uint32_t subscription_id, const SubscriptionManager::Subscription& subscription);
    
    // Consumer registration
    uint32_t register_consumer();
    void unregister_consumer(uint32_t consumer_id);
    
    // Statistics and monitoring
    struct SystemStats {
        // Ingestion stats
        uint64_t total_ticks_ingested;
        uint64_t ticks_per_second;
        uint64_t ingestion_errors;
        
        // Distribution stats
        uint64_t total_ticks_distributed;
        uint64_t distribution_latency_us;
        uint64_t active_subscribers;
        
        // Storage stats
        TickStorage::StorageStats storage_stats;
        
        // Subscription stats
        SubscriptionManager::SubscriptionStats subscription_stats;
        
        // Deduplication stats
        TickDeduplicator::DeduplicationStats deduplication_stats;
        
        // Shared memory stats
        SharedMemoryManager::Statistics shared_memory_stats;
        
        // System health
        bool all_workers_healthy;
        double cpu_usage_percent;
        size_t memory_usage_bytes;
    };
    
    SystemStats get_system_stats() const;
    void reset_stats();
    
    // Health monitoring
    bool is_healthy() const;
    std::vector<std::string> get_health_issues() const;

private:
    Config config_;
    std::atomic<bool> running_{false};
    std::atomic<bool> shutdown_requested_{false};
    
    // Core components
    std::unique_ptr<SharedMemoryManager> shared_memory_;
    std::unique_ptr<TickStorage> tick_storage_;
    std::unique_ptr<SubscriptionManager> subscription_manager_;
    std::unique_ptr<TickDeduplicator> deduplicator_;
    std::unique_ptr<DataCompressor> compressor_;
    
    // Worker threads
    std::vector<std::thread> worker_threads_;
    std::thread distribution_thread_;
    std::thread cleanup_thread_;
    std::thread stats_thread_;
    
    // Performance monitoring
    mutable std::atomic<uint64_t> total_ticks_ingested_{0};
    mutable std::atomic<uint64_t> total_ticks_distributed_{0};
    mutable std::atomic<uint64_t> ingestion_errors_{0};
    mutable std::atomic<uint64_t> last_ticks_count_{0};
    mutable std::atomic<uint64_t> ticks_per_second_{0};
    mutable std::atomic<uint64_t> distribution_latency_us_{0};
    
    // Thread-safe queues for internal communication
    std::unique_ptr<class LockFreeQueue<MarketTick>> ingestion_queue_;
    std::unique_ptr<class LockFreeQueue<std::pair<MarketTick, std::vector<uint32_t>>>> distribution_queue_;
    
    // Worker thread functions
    void ingestion_worker();
    void distribution_worker();
    void cleanup_worker();
    void stats_worker();
    
    // Internal processing
    void process_ingested_tick(const MarketTick& tick);
    void distribute_tick_to_subscribers(const MarketTick& tick, const std::vector<uint32_t>& subscriber_ids);
    
    // Health monitoring
    mutable std::atomic<std::chrono::steady_clock::time_point> last_health_check_;
    mutable std::vector<std::atomic<bool>> worker_health_flags_;
    
    void update_worker_health(size_t worker_id, bool healthy);
    bool check_system_resources() const;
    
    // Initialization helpers
    bool initialize_components();
    void cleanup_components();
    
    // Performance optimization
    void optimize_thread_affinity();
    void setup_memory_prefetching();
};

// High-level market data service interface
class MarketDataService {
public:
    MarketDataService();
    ~MarketDataService();
    
    // Service lifecycle
    bool initialize(const DataDistributionCoordinator::Config& config = {});
    bool start();
    void stop();
    void shutdown();
    
    // Data ingestion interface
    bool publish_tick(const MarketTick& tick);
    bool publish_tick_batch(const std::vector<MarketTick>& ticks);
    
    // Consumer interface
    class Consumer {
    public:
        Consumer(MarketDataService* service);
        ~Consumer();
        
        // Subscription management
        uint32_t subscribe(const Symbol& symbol, bool trades = true, bool quotes = true);
        bool unsubscribe(uint32_t subscription_id);
        
        // Data consumption
        bool get_next_tick(MarketTick& tick);
        std::vector<MarketTick> get_available_ticks(size_t max_count = 100);
        
        // Consumer statistics
        struct ConsumerStats {
            uint64_t ticks_consumed;
            uint64_t ticks_dropped;
            uint64_t active_subscriptions;
            double consumption_rate_per_second;
        };
        
        ConsumerStats get_stats() const;
        
    private:
        MarketDataService* service_;
        uint32_t consumer_id_;
        std::atomic<uint64_t> ticks_consumed_{0};
        std::atomic<uint64_t> ticks_dropped_{0};
        std::chrono::steady_clock::time_point last_stats_update_;
    };
    
    // Create consumer instance
    std::unique_ptr<Consumer> create_consumer();
    
    // Service statistics
    DataDistributionCoordinator::SystemStats get_stats() const;
    
    // Health monitoring
    bool is_healthy() const;
    std::string get_health_report() const;

private:
    std::unique_ptr<DataDistributionCoordinator> coordinator_;
    std::atomic<bool> initialized_{false};
    std::atomic<bool> running_{false};
    
    // Consumer management
    mutable std::shared_mutex consumers_mutex_;
    std::unordered_map<uint32_t, std::weak_ptr<Consumer>> active_consumers_;
    std::atomic<uint32_t> next_consumer_id_{1};
    
    // Internal consumer registration
    uint32_t register_consumer_internal();
    void unregister_consumer_internal(uint32_t consumer_id);
    
    friend class Consumer;
};

// Utility class for performance benchmarking
class PerformanceBenchmark {
public:
    PerformanceBenchmark();
    ~PerformanceBenchmark() = default;
    
    // Benchmark scenarios
    struct BenchmarkConfig {
        size_t tick_count = 1000000;
        size_t subscriber_count = 10;
        size_t producer_thread_count = 1;
        size_t consumer_thread_count = 4;
        std::chrono::microseconds tick_interval{10}; // 10μs between ticks
        bool measure_latency = true;
        bool measure_throughput = true;
    };
    
    struct BenchmarkResults {
        // Throughput metrics
        double ticks_per_second;
        double messages_per_second;
        
        // Latency metrics (in microseconds)
        double average_latency_us;
        double p50_latency_us;
        double p95_latency_us;
        double p99_latency_us;
        double max_latency_us;
        
        // System metrics
        double cpu_usage_percent;
        size_t memory_usage_bytes;
        size_t cache_misses;
        
        // Error metrics
        size_t dropped_messages;
        size_t parse_errors;
        double error_rate_percent;
    };
    
    BenchmarkResults run_throughput_benchmark(const BenchmarkConfig& config);
    BenchmarkResults run_latency_benchmark(const BenchmarkConfig& config);
    BenchmarkResults run_stress_test(const BenchmarkConfig& config);
    
    // Generate test data
    std::vector<MarketTick> generate_test_ticks(size_t count, const std::vector<Symbol>& symbols);
    
private:
    std::unique_ptr<MarketDataService> service_;
    
    // Benchmark helpers
    void setup_benchmark_environment();
    void cleanup_benchmark_environment();
    
    // Measurement utilities
    class LatencyMeasurer;
    class ThroughputMeasurer;
    class ResourceMonitor;
    
    std::unique_ptr<LatencyMeasurer> latency_measurer_;
    std::unique_ptr<ThroughputMeasurer> throughput_measurer_;
    std::unique_ptr<ResourceMonitor> resource_monitor_;
};

} // namespace MarketData