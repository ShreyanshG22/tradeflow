#include "data_distribution_coordinator.hpp"
#include "lock_free_queue.hpp"
#include "high_res_timer.hpp"
#include <algorithm>
#include <sched.h>
#include <sys/resource.h>

namespace MarketData {

DataDistributionCoordinator::DataDistributionCoordinator(const Config& config) 
    : config_(config) {
    
    // Initialize lock-free queues
    ingestion_queue_ = std::make_unique<LockFreeQueue<MarketTick>>(65536);
    distribution_queue_ = std::make_unique<LockFreeQueue<std::pair<MarketTick, std::vector<uint32_t>>>>(32768);
    
    // Initialize worker health flags
    worker_health_flags_.resize(config_.worker_thread_count);
    for (auto& flag : worker_health_flags_) {
        flag.store(true, std::memory_order_relaxed);
    }
}

DataDistributionCoordinator::~DataDistributionCoordinator() {
    stop();
}

bool DataDistributionCoordinator::start() {
    if (running_.load(std::memory_order_acquire)) {
        return true; // Already running
    }
    
    if (!initialize_components()) {
        return false;
    }
    
    running_.store(true, std::memory_order_release);
    shutdown_requested_.store(false, std::memory_order_release);
    
    // Start worker threads
    worker_threads_.reserve(config_.worker_thread_count);
    for (size_t i = 0; i < config_.worker_thread_count; ++i) {
        worker_threads_.emplace_back(&DataDistributionCoordinator::ingestion_worker, this);
    }
    
    // Start specialized threads
    distribution_thread_ = std::thread(&DataDistributionCoordinator::distribution_worker, this);
    cleanup_thread_ = std::thread(&DataDistributionCoordinator::cleanup_worker, this);
    stats_thread_ = std::thread(&DataDistributionCoordinator::stats_worker, this);
    
    // Optimize thread affinity for performance
    optimize_thread_affinity();
    
    return true;
}

void DataDistributionCoordinator::stop() {
    if (!running_.load(std::memory_order_acquire)) {
        return; // Already stopped
    }
    
    shutdown_requested_.store(true, std::memory_order_release);
    
    // Wait for all threads to finish
    for (auto& thread : worker_threads_) {
        if (thread.joinable()) {
            thread.join();
        }
    }
    
    if (distribution_thread_.joinable()) {
        distribution_thread_.join();
    }
    
    if (cleanup_thread_.joinable()) {
        cleanup_thread_.join();
    }
    
    if (stats_thread_.joinable()) {
        stats_thread_.join();
    }
    
    worker_threads_.clear();
    running_.store(false, std::memory_order_release);
    
    cleanup_components();
}

bool DataDistributionCoordinator::ingest_tick(const MarketTick& tick) {
    if (!running_.load(std::memory_order_acquire)) {
        ingestion_errors_.fetch_add(1, std::memory_order_relaxed);
        return false;
    }
    
    if (!ingestion_queue_->try_push(tick)) {
        ingestion_errors_.fetch_add(1, std::memory_order_relaxed);
        return false;
    }
    
    total_ticks_ingested_.fetch_add(1, std::memory_order_relaxed);
    return true;
}

bool DataDistributionCoordinator::ingest_tick_batch(const std::vector<MarketTick>& ticks) {
    if (!running_.load(std::memory_order_acquire)) {
        ingestion_errors_.fetch_add(ticks.size(), std::memory_order_relaxed);
        return false;
    }
    
    size_t ingested = 0;
    for (const auto& tick : ticks) {
        if (ingestion_queue_->try_push(tick)) {
            ingested++;
        }
    }
    
    total_ticks_ingested_.fetch_add(ingested, std::memory_order_relaxed);
    
    if (ingested < ticks.size()) {
        ingestion_errors_.fetch_add(ticks.size() - ingested, std::memory_order_relaxed);
        return false;
    }
    
    return true;
}

uint32_t DataDistributionCoordinator::add_subscription(const SubscriptionManager::Subscription& subscription) {
    return subscription_manager_->add_subscription(subscription);
}

bool DataDistributionCoordinator::remove_subscription(uint32_t subscription_id) {
    return subscription_manager_->remove_subscription(subscription_id);
}

bool DataDistributionCoordinator::update_subscription(uint32_t subscription_id, const SubscriptionManager::Subscription& subscription) {
    return subscription_manager_->update_subscription(subscription_id, subscription);
}

uint32_t DataDistributionCoordinator::register_consumer() {
    return shared_memory_->register_consumer();
}

void DataDistributionCoordinator::unregister_consumer(uint32_t consumer_id) {
    shared_memory_->unregister_consumer(consumer_id);
}

DataDistributionCoordinator::SystemStats DataDistributionCoordinator::get_system_stats() const {
    SystemStats stats{};
    
    // Basic counters
    stats.total_ticks_ingested = total_ticks_ingested_.load(std::memory_order_relaxed);
    stats.total_ticks_distributed = total_ticks_distributed_.load(std::memory_order_relaxed);
    stats.ingestion_errors = ingestion_errors_.load(std::memory_order_relaxed);
    stats.ticks_per_second = ticks_per_second_.load(std::memory_order_relaxed);
    stats.distribution_latency_us = distribution_latency_us_.load(std::memory_order_relaxed);
    
    // Component stats
    if (tick_storage_) {
        stats.storage_stats = tick_storage_->get_stats();
    }
    
    if (subscription_manager_) {
        stats.subscription_stats = subscription_manager_->get_statistics();
        stats.active_subscribers = stats.subscription_stats.active_subscribers;
    }
    
    if (deduplicator_) {
        stats.deduplication_stats = deduplicator_->get_statistics();
    }
    
    if (shared_memory_) {
        stats.shared_memory_stats = shared_memory_->get_statistics();
    }
    
    // System health
    stats.all_workers_healthy = is_healthy();
    stats.cpu_usage_percent = 0.0; // Would need system-specific implementation
    stats.memory_usage_bytes = 0; // Would need system-specific implementation
    
    return stats;
}

void DataDistributionCoordinator::reset_stats() {
    total_ticks_ingested_.store(0, std::memory_order_relaxed);
    total_ticks_distributed_.store(0, std::memory_order_relaxed);
    ingestion_errors_.store(0, std::memory_order_relaxed);
    ticks_per_second_.store(0, std::memory_order_relaxed);
    distribution_latency_us_.store(0, std::memory_order_relaxed);
    
    if (tick_storage_) {
        tick_storage_->reset_stats();
    }
}

bool DataDistributionCoordinator::is_healthy() const {
    if (!running_.load(std::memory_order_acquire)) {
        return false;
    }
    
    // Check worker thread health
    for (const auto& flag : worker_health_flags_) {
        if (!flag.load(std::memory_order_relaxed)) {
            return false;
        }
    }
    
    // Check system resources
    return check_system_resources();
}

std::vector<std::string> DataDistributionCoordinator::get_health_issues() const {
    std::vector<std::string> issues;
    
    if (!running_.load(std::memory_order_acquire)) {
        issues.push_back("Service is not running");
    }
    
    // Check worker health
    for (size_t i = 0; i < worker_health_flags_.size(); ++i) {
        if (!worker_health_flags_[i].load(std::memory_order_relaxed)) {
            issues.push_back("Worker thread " + std::to_string(i) + " is unhealthy");
        }
    }
    
    // Check error rates
    uint64_t total_ingested = total_ticks_ingested_.load(std::memory_order_relaxed);
    uint64_t errors = ingestion_errors_.load(std::memory_order_relaxed);
    
    if (total_ingested > 0) {
        double error_rate = static_cast<double>(errors) / total_ingested;
        if (error_rate > 0.01) { // 1% error rate threshold
            issues.push_back("High error rate: " + std::to_string(error_rate * 100) + "%");
        }
    }
    
    return issues;
}

bool DataDistributionCoordinator::initialize_components() {
    try {
        // Initialize shared memory
        shared_memory_ = std::make_unique<SharedMemoryManager>(config_.shared_memory_name, true);
        if (!shared_memory_->is_valid()) {
            return false;
        }
        
        // Initialize tick storage
        tick_storage_ = std::make_unique<TickStorage>();
        
        // Initialize subscription manager
        subscription_manager_ = std::make_unique<SubscriptionManager>();
        
        // Initialize deduplicator if enabled
        if (config_.enable_deduplication) {
            deduplicator_ = std::make_unique<TickDeduplicator>(config_.deduplication_cache_size);
        }
        
        // Initialize compressor if enabled
        if (config_.enable_compression) {
            compressor_ = std::make_unique<DataCompressor>();
        }
        
        return true;
        
    } catch (const std::exception& e) {
        cleanup_components();
        return false;
    }
}

void DataDistributionCoordinator::cleanup_components() {
    compressor_.reset();
    deduplicator_.reset();
    subscription_manager_.reset();
    tick_storage_.reset();
    shared_memory_.reset();
}

void DataDistributionCoordinator::ingestion_worker() {
    size_t worker_id = std::hash<std::thread::id>{}(std::this_thread::get_id()) % config_.worker_thread_count;
    
    while (!shutdown_requested_.load(std::memory_order_acquire)) {
        try {
            MarketTick tick;
            if (ingestion_queue_->try_pop(tick)) {
                process_ingested_tick(tick);
                update_worker_health(worker_id, true);
            } else {
                // No work available, brief sleep
                std::this_thread::sleep_for(std::chrono::microseconds(10));
            }
        } catch (const std::exception& e) {
            update_worker_health(worker_id, false);
            ingestion_errors_.fetch_add(1, std::memory_order_relaxed);
        }
    }
}

void DataDistributionCoordinator::distribution_worker() {
    while (!shutdown_requested_.load(std::memory_order_acquire)) {
        try {
            std::pair<MarketTick, std::vector<uint32_t>> work_item;
            if (distribution_queue_->try_pop(work_item)) {
                auto start_time = tradeflow::HighResTimer::now();
                
                distribute_tick_to_subscribers(work_item.first, work_item.second);
                
                auto end_time = tradeflow::HighResTimer::now();
                auto latency_us = std::chrono::duration_cast<std::chrono::microseconds>(end_time - start_time).count();
                distribution_latency_us_.store(latency_us, std::memory_order_relaxed);
                
                total_ticks_distributed_.fetch_add(1, std::memory_order_relaxed);
            } else {
                std::this_thread::sleep_for(config_.distribution_interval);
            }
        } catch (const std::exception& e) {
            // Log error and continue
        }
    }
}

void DataDistributionCoordinator::cleanup_worker() {
    while (!shutdown_requested_.load(std::memory_order_acquire)) {
        try {
            if (tick_storage_) {
                tick_storage_->cleanup_old_data(std::chrono::hours(1));
            }
            
            if (deduplicator_) {
                deduplicator_->cleanup_old_entries(std::chrono::minutes(30));
            }
            
            std::this_thread::sleep_for(config_.cleanup_interval);
        } catch (const std::exception& e) {
            // Log error and continue
        }
    }
}

void DataDistributionCoordinator::stats_worker() {
    auto last_update = std::chrono::steady_clock::now();
    uint64_t last_tick_count = 0;
    
    while (!shutdown_requested_.load(std::memory_order_acquire)) {
        try {
            auto now = std::chrono::steady_clock::now();
            auto elapsed = std::chrono::duration_cast<std::chrono::seconds>(now - last_update);
            
            if (elapsed.count() >= 1) {
                uint64_t current_tick_count = total_ticks_ingested_.load(std::memory_order_relaxed);
                uint64_t ticks_in_period = current_tick_count - last_tick_count;
                
                ticks_per_second_.store(ticks_in_period / elapsed.count(), std::memory_order_relaxed);
                
                last_update = now;
                last_tick_count = current_tick_count;
            }
            
            std::this_thread::sleep_for(std::chrono::milliseconds(100));
        } catch (const std::exception& e) {
            // Log error and continue
        }
    }
}

void DataDistributionCoordinator::process_ingested_tick(const MarketTick& tick) {
    // Deduplication check
    if (deduplicator_ && deduplicator_->is_duplicate(tick)) {
        return; // Skip duplicate
    }
    
    // Store in tick storage
    if (tick_storage_) {
        tick_storage_->store_tick(tick);
    }
    
    // Add to deduplication cache
    if (deduplicator_) {
        deduplicator_->add_tick(tick);
    }
    
    // Find matching subscribers
    auto matching_subscribers = subscription_manager_->get_matching_subscribers(tick);
    
    if (!matching_subscribers.empty()) {
        // Queue for distribution
        distribution_queue_->try_push({tick, matching_subscribers});
    }
}

void DataDistributionCoordinator::distribute_tick_to_subscribers(const MarketTick& tick, const std::vector<uint32_t>& subscriber_ids) {
    // Publish to shared memory for each subscriber
    if (shared_memory_) {
        shared_memory_->publish_tick(tick);
    }
    
    // Additional distribution mechanisms could be added here
    // (e.g., network sockets, message queues, etc.)
}

void DataDistributionCoordinator::update_worker_health(size_t worker_id, bool healthy) {
    if (worker_id < worker_health_flags_.size()) {
        worker_health_flags_[worker_id].store(healthy, std::memory_order_relaxed);
    }
}

bool DataDistributionCoordinator::check_system_resources() const {
    // Basic resource checks - would need platform-specific implementation
    return true;
}

void DataDistributionCoordinator::optimize_thread_affinity() {
    // Set CPU affinity for worker threads (Linux-specific)
#ifdef __linux__
    cpu_set_t cpuset;
    int num_cpus = sysconf(_SC_NPROCESSORS_ONLN);
    
    for (size_t i = 0; i < worker_threads_.size(); ++i) {
        CPU_ZERO(&cpuset);
        CPU_SET(i % num_cpus, &cpuset);
        
        pthread_t native_handle = worker_threads_[i].native_handle();
        pthread_setaffinity_np(native_handle, sizeof(cpu_set_t), &cpuset);
    }
#endif
}

void DataDistributionCoordinator::setup_memory_prefetching() {
    // Memory prefetching optimizations would go here
    // This is highly platform and use-case specific
}

// MarketDataService implementation

MarketDataService::MarketDataService() = default;

MarketDataService::~MarketDataService() {
    shutdown();
}

bool MarketDataService::initialize(const DataDistributionCoordinator::Config& config) {
    if (initialized_.load(std::memory_order_acquire)) {
        return true;
    }
    
    try {
        coordinator_ = std::make_unique<DataDistributionCoordinator>(config);
        initialized_.store(true, std::memory_order_release);
        return true;
    } catch (const std::exception& e) {
        return false;
    }
}

bool MarketDataService::start() {
    if (!initialized_.load(std::memory_order_acquire)) {
        return false;
    }
    
    if (running_.load(std::memory_order_acquire)) {
        return true;
    }
    
    if (coordinator_->start()) {
        running_.store(true, std::memory_order_release);
        return true;
    }
    
    return false;
}

void MarketDataService::stop() {
    if (running_.load(std::memory_order_acquire)) {
        coordinator_->stop();
        running_.store(false, std::memory_order_release);
    }
}

void MarketDataService::shutdown() {
    stop();
    
    std::unique_lock<std::shared_mutex> lock(consumers_mutex_);
    active_consumers_.clear();
    
    coordinator_.reset();
    initialized_.store(false, std::memory_order_release);
}

bool MarketDataService::publish_tick(const MarketTick& tick) {
    if (!running_.load(std::memory_order_acquire)) {
        return false;
    }
    
    return coordinator_->ingest_tick(tick);
}

bool MarketDataService::publish_tick_batch(const std::vector<MarketTick>& ticks) {
    if (!running_.load(std::memory_order_acquire)) {
        return false;
    }
    
    return coordinator_->ingest_tick_batch(ticks);
}

std::unique_ptr<MarketDataService::Consumer> MarketDataService::create_consumer() {
    if (!running_.load(std::memory_order_acquire)) {
        return nullptr;
    }
    
    return std::make_unique<Consumer>(this);
}

DataDistributionCoordinator::SystemStats MarketDataService::get_stats() const {
    if (!coordinator_) {
        return {};
    }
    
    return coordinator_->get_system_stats();
}

bool MarketDataService::is_healthy() const {
    return coordinator_ && coordinator_->is_healthy();
}

std::string MarketDataService::get_health_report() const {
    if (!coordinator_) {
        return "Service not initialized";
    }
    
    auto issues = coordinator_->get_health_issues();
    if (issues.empty()) {
        return "Service is healthy";
    }
    
    std::string report = "Health issues detected:\n";
    for (const auto& issue : issues) {
        report += "- " + issue + "\n";
    }
    
    return report;
}

uint32_t MarketDataService::register_consumer_internal() {
    return coordinator_ ? coordinator_->register_consumer() : UINT32_MAX;
}

void MarketDataService::unregister_consumer_internal(uint32_t consumer_id) {
    if (coordinator_) {
        coordinator_->unregister_consumer(consumer_id);
    }
}

// Consumer implementation

MarketDataService::Consumer::Consumer(MarketDataService* service) 
    : service_(service), consumer_id_(UINT32_MAX), last_stats_update_(std::chrono::steady_clock::now()) {
    
    if (service_) {
        consumer_id_ = service_->register_consumer_internal();
    }
}

MarketDataService::Consumer::~Consumer() {
    if (service_ && consumer_id_ != UINT32_MAX) {
        service_->unregister_consumer_internal(consumer_id_);
    }
}

uint32_t MarketDataService::Consumer::subscribe(const Symbol& symbol, bool trades, bool quotes) {
    if (!service_ || !service_->coordinator_) {
        return UINT32_MAX;
    }
    
    SubscriptionManager::Subscription sub;
    sub.subscriber_id = consumer_id_;
    sub.symbol = symbol;
    sub.include_trades = trades;
    sub.include_quotes = quotes;
    
    return service_->coordinator_->add_subscription(sub);
}

bool MarketDataService::Consumer::unsubscribe(uint32_t subscription_id) {
    if (!service_ || !service_->coordinator_) {
        return false;
    }
    
    return service_->coordinator_->remove_subscription(subscription_id);
}

bool MarketDataService::Consumer::get_next_tick(MarketTick& tick) {
    if (!service_ || !service_->coordinator_ || consumer_id_ == UINT32_MAX) {
        return false;
    }
    
    // This would need to interface with the shared memory consumer
    // For now, return false as a placeholder
    return false;
}

std::vector<MarketTick> MarketDataService::Consumer::get_available_ticks(size_t max_count) {
    std::vector<MarketTick> ticks;
    
    if (!service_ || !service_->coordinator_ || consumer_id_ == UINT32_MAX) {
        return ticks;
    }
    
    // This would need to interface with the shared memory consumer
    // For now, return empty vector as a placeholder
    return ticks;
}

MarketDataService::Consumer::ConsumerStats MarketDataService::Consumer::get_stats() const {
    ConsumerStats stats{};
    
    stats.ticks_consumed = ticks_consumed_.load(std::memory_order_relaxed);
    stats.ticks_dropped = ticks_dropped_.load(std::memory_order_relaxed);
    stats.active_subscriptions = 0; // Would need to track this
    
    auto now = std::chrono::steady_clock::now();
    auto elapsed = std::chrono::duration_cast<std::chrono::seconds>(now - last_stats_update_);
    
    if (elapsed.count() > 0) {
        stats.consumption_rate_per_second = static_cast<double>(stats.ticks_consumed) / elapsed.count();
    }
    
    return stats;
}

} // namespace MarketData