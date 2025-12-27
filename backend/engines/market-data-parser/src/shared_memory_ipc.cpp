#include "shared_memory_ipc.hpp"
#include <cstring>
#include <algorithm>
#include <chrono>
#include <sys/types.h>
#include <errno.h>

namespace MarketData {

SharedMemoryManager::SharedMemoryManager(const std::string& name, bool is_producer)
    : name_(name), is_producer_(is_producer), shm_fd_(-1), memory_ptr_(nullptr),
      memory_size_(0), header_(nullptr), ring_buffer_(nullptr), tick_pool_(nullptr),
      producer_sem_(nullptr), consumer_sem_(nullptr) {
    
    if (!initialize_shared_memory()) {
        throw std::runtime_error("Failed to initialize shared memory: " + name);
    }
}

SharedMemoryManager::~SharedMemoryManager() {
    cleanup_shared_memory();
}

bool SharedMemoryManager::initialize_shared_memory() {
    memory_size_ = calculate_memory_size();
    
    // Create or open shared memory
    int flags = is_producer_ ? (O_CREAT | O_RDWR) : O_RDWR;
    mode_t mode = is_producer_ ? (S_IRUSR | S_IWUSR | S_IRGRP | S_IWGRP) : 0;
    
    shm_fd_ = shm_open(name_.c_str(), flags, mode);
    if (shm_fd_ == -1) {
        return false;
    }
    
    // Set size if producer
    if (is_producer_) {
        if (ftruncate(shm_fd_, memory_size_) == -1) {
            close(shm_fd_);
            shm_unlink(name_.c_str());
            return false;
        }
    }
    
    // Map memory
    memory_ptr_ = mmap(nullptr, memory_size_, PROT_READ | PROT_WRITE, MAP_SHARED, shm_fd_, 0);
    if (memory_ptr_ == MAP_FAILED) {
        close(shm_fd_);
        if (is_producer_) {
            shm_unlink(name_.c_str());
        }
        return false;
    }
    
    // Setup memory layout
    setup_memory_layout();
    
    // Initialize semaphores
    std::string producer_sem_name = name_ + "_producer";
    std::string consumer_sem_name = name_ + "_consumer";
    
    if (is_producer_) {
        producer_sem_ = sem_open(producer_sem_name.c_str(), O_CREAT, 0644, 1);
        consumer_sem_ = sem_open(consumer_sem_name.c_str(), O_CREAT, 0644, 0);
        
        // Initialize header if producer
        if (producer_sem_ != SEM_FAILED && consumer_sem_ != SEM_FAILED) {
            header_->buffer_size = SharedMemoryConfig::MAX_TICKS_PER_BUFFER;
            header_->tick_size = sizeof(MarketTick);
            ring_buffer_->initialize();
        }
    } else {
        producer_sem_ = sem_open(producer_sem_name.c_str(), 0);
        consumer_sem_ = sem_open(consumer_sem_name.c_str(), 0);
    }
    
    return producer_sem_ != SEM_FAILED && consumer_sem_ != SEM_FAILED;
}

void SharedMemoryManager::cleanup_shared_memory() {
    if (producer_sem_ != nullptr && producer_sem_ != SEM_FAILED) {
        sem_close(producer_sem_);
        if (is_producer_) {
            std::string producer_sem_name = name_ + "_producer";
            sem_unlink(producer_sem_name.c_str());
        }
    }
    
    if (consumer_sem_ != nullptr && consumer_sem_ != SEM_FAILED) {
        sem_close(consumer_sem_);
        if (is_producer_) {
            std::string consumer_sem_name = name_ + "_consumer";
            sem_unlink(consumer_sem_name.c_str());
        }
    }
    
    if (memory_ptr_ != nullptr && memory_ptr_ != MAP_FAILED) {
        munmap(memory_ptr_, memory_size_);
    }
    
    if (shm_fd_ != -1) {
        close(shm_fd_);
        if (is_producer_) {
            shm_unlink(name_.c_str());
        }
    }
}

size_t SharedMemoryManager::calculate_memory_size() const {
    size_t header_size = sizeof(SharedMemoryHeader);
    size_t ring_buffer_size = sizeof(SharedRingBuffer<MarketTick, SharedMemoryConfig::MAX_TICKS_PER_BUFFER>);
    size_t tick_pool_size = sizeof(MarketTick) * SharedMemoryConfig::MAX_TICKS_PER_BUFFER * SharedMemoryConfig::BUFFER_COUNT;
    
    // Align to page boundary
    size_t total_size = header_size + ring_buffer_size + tick_pool_size;
    size_t page_size = getpagesize();
    return ((total_size + page_size - 1) / page_size) * page_size;
}

void SharedMemoryManager::setup_memory_layout() {
    char* base_ptr = static_cast<char*>(memory_ptr_);
    
    // Header at the beginning
    header_ = reinterpret_cast<SharedMemoryHeader*>(base_ptr);
    base_ptr += sizeof(SharedMemoryHeader);
    
    // Align to cache line boundary
    size_t alignment_offset = (reinterpret_cast<uintptr_t>(base_ptr) % SharedMemoryConfig::ALIGNMENT);
    if (alignment_offset != 0) {
        base_ptr += (SharedMemoryConfig::ALIGNMENT - alignment_offset);
    }
    
    // Ring buffer
    ring_buffer_ = reinterpret_cast<SharedRingBuffer<MarketTick, SharedMemoryConfig::MAX_TICKS_PER_BUFFER>*>(base_ptr);
    base_ptr += sizeof(SharedRingBuffer<MarketTick, SharedMemoryConfig::MAX_TICKS_PER_BUFFER>);
    
    // Align tick pool
    alignment_offset = (reinterpret_cast<uintptr_t>(base_ptr) % SharedMemoryConfig::ALIGNMENT);
    if (alignment_offset != 0) {
        base_ptr += (SharedMemoryConfig::ALIGNMENT - alignment_offset);
    }
    
    // Tick pool
    tick_pool_ = reinterpret_cast<MarketTick*>(base_ptr);
}

bool SharedMemoryManager::publish_tick(const MarketTick& tick) {
    if (!is_producer_) {
        return false;
    }
    
    MarketTick* shared_tick = allocate_tick();
    if (!shared_tick) {
        return false;
    }
    
    *shared_tick = tick;
    
    if (!ring_buffer_->try_publish(shared_tick)) {
        deallocate_tick(shared_tick);
        return false;
    }
    
    // Signal consumers
    sem_post(consumer_sem_);
    return true;
}

bool SharedMemoryManager::publish_tick_batch(const std::vector<MarketTick>& ticks) {
    if (!is_producer_) {
        return false;
    }
    
    std::vector<MarketTick*> allocated_ticks;
    allocated_ticks.reserve(ticks.size());
    
    // Allocate all ticks first
    for (const auto& tick : ticks) {
        MarketTick* shared_tick = allocate_tick();
        if (!shared_tick) {
            // Cleanup on failure
            for (auto* allocated : allocated_ticks) {
                deallocate_tick(allocated);
            }
            return false;
        }
        
        *shared_tick = tick;
        allocated_ticks.push_back(shared_tick);
    }
    
    // Publish all ticks
    size_t published = 0;
    for (auto* shared_tick : allocated_ticks) {
        if (ring_buffer_->try_publish(shared_tick)) {
            published++;
        } else {
            deallocate_tick(shared_tick);
        }
    }
    
    // Signal consumers for each published tick
    for (size_t i = 0; i < published; ++i) {
        sem_post(consumer_sem_);
    }
    
    return published == ticks.size();
}

uint32_t SharedMemoryManager::register_consumer() {
    uint32_t current_consumers = header_->active_consumers.load(std::memory_order_acquire);
    
    while (current_consumers < SharedMemoryConfig::MAX_SUBSCRIBERS) {
        if (header_->active_consumers.compare_exchange_weak(current_consumers, current_consumers + 1, std::memory_order_acq_rel)) {
            // Find available consumer slot
            for (uint32_t i = 0; i < SharedMemoryConfig::MAX_SUBSCRIBERS; ++i) {
                uint64_t expected = 0;
                if (header_->consumer_sequences[i].compare_exchange_strong(expected, 1, std::memory_order_acq_rel)) {
                    return i;
                }
            }
            
            // Rollback if no slot found
            header_->active_consumers.fetch_sub(1, std::memory_order_acq_rel);
            break;
        }
    }
    
    return UINT32_MAX; // No available slots
}

void SharedMemoryManager::unregister_consumer(uint32_t consumer_id) {
    if (consumer_id >= SharedMemoryConfig::MAX_SUBSCRIBERS) {
        return;
    }
    
    header_->consumer_sequences[consumer_id].store(0, std::memory_order_release);
    header_->active_consumers.fetch_sub(1, std::memory_order_acq_rel);
}

bool SharedMemoryManager::consume_tick(uint32_t consumer_id, MarketTick& tick) {
    MarketTick* shared_tick;
    if (!ring_buffer_->try_consume(consumer_id, shared_tick)) {
        return false;
    }
    
    tick = *shared_tick;
    return true;
}

std::vector<MarketTick> SharedMemoryManager::consume_available_ticks(uint32_t consumer_id, size_t max_count) {
    std::vector<MarketTick> ticks;
    ticks.reserve(max_count);
    
    MarketTick tick;
    while (ticks.size() < max_count && consume_tick(consumer_id, tick)) {
        ticks.push_back(tick);
    }
    
    return ticks;
}

SharedMemoryManager::Statistics SharedMemoryManager::get_statistics() const {
    Statistics stats{};
    
    stats.total_published = ring_buffer_->get_write_position();
    stats.active_consumers = header_->active_consumers.load(std::memory_order_acquire);
    
    uint64_t min_consumer_pos = stats.total_published;
    uint64_t total_consumed = 0;
    
    for (uint32_t i = 0; i < SharedMemoryConfig::MAX_SUBSCRIBERS; ++i) {
        uint64_t consumer_pos = ring_buffer_->get_consumer_position(i);
        if (consumer_pos > 0) {
            min_consumer_pos = std::min(min_consumer_pos, consumer_pos);
            total_consumed += consumer_pos;
        }
    }
    
    stats.total_consumed = total_consumed;
    stats.slowest_consumer_lag = stats.total_published - min_consumer_pos;
    
    uint64_t buffer_used = stats.total_published - min_consumer_pos;
    stats.buffer_utilization_percent = (buffer_used * 100) / SharedMemoryConfig::MAX_TICKS_PER_BUFFER;
    
    return stats;
}

MarketTick* SharedMemoryManager::allocate_tick() {
    size_t offset = next_tick_offset_.fetch_add(1, std::memory_order_acq_rel);
    size_t index = offset % (SharedMemoryConfig::MAX_TICKS_PER_BUFFER * SharedMemoryConfig::BUFFER_COUNT);
    return &tick_pool_[index];
}

void SharedMemoryManager::deallocate_tick(MarketTick* tick) {
    // In this simple implementation, we don't actually deallocate
    // The circular buffer will eventually reuse the memory
    (void)tick;
}

// SubscriptionManager implementation

SubscriptionManager::SubscriptionManager() = default;

uint32_t SubscriptionManager::add_subscription(const Subscription& subscription) {
    std::unique_lock<std::shared_mutex> lock(subscriptions_mutex_);
    
    uint32_t id = next_subscription_id_.fetch_add(1, std::memory_order_acq_rel);
    subscriptions_[id] = subscription;
    
    // Update symbol index
    symbol_subscriptions_[subscription.symbol].push_back(id);
    
    return id;
}

bool SubscriptionManager::remove_subscription(uint32_t subscription_id) {
    std::unique_lock<std::shared_mutex> lock(subscriptions_mutex_);
    
    auto it = subscriptions_.find(subscription_id);
    if (it == subscriptions_.end()) {
        return false;
    }
    
    // Remove from symbol index
    auto& symbol_subs = symbol_subscriptions_[it->second.symbol];
    symbol_subs.erase(std::remove(symbol_subs.begin(), symbol_subs.end(), subscription_id), symbol_subs.end());
    
    if (symbol_subs.empty()) {
        symbol_subscriptions_.erase(it->second.symbol);
    }
    
    subscriptions_.erase(it);
    return true;
}

bool SubscriptionManager::update_subscription(uint32_t subscription_id, const Subscription& subscription) {
    std::unique_lock<std::shared_mutex> lock(subscriptions_mutex_);
    
    auto it = subscriptions_.find(subscription_id);
    if (it == subscriptions_.end()) {
        return false;
    }
    
    Symbol old_symbol = it->second.symbol;
    it->second = subscription;
    
    // Update symbol index if symbol changed
    if (!(old_symbol == subscription.symbol)) {
        update_symbol_index(subscription_id, old_symbol, subscription.symbol);
    }
    
    return true;
}

std::vector<uint32_t> SubscriptionManager::get_matching_subscribers(const MarketTick& tick) {
    std::vector<uint32_t> matching_subscribers;
    
    std::shared_lock<std::shared_mutex> lock(subscriptions_mutex_);
    
    auto symbol_it = symbol_subscriptions_.find(tick.symbol);
    if (symbol_it == symbol_subscriptions_.end()) {
        return matching_subscribers;
    }
    
    for (uint32_t sub_id : symbol_it->second) {
        auto sub_it = subscriptions_.find(sub_id);
        if (sub_it != subscriptions_.end() && should_notify(sub_it->second, tick)) {
            matching_subscribers.push_back(sub_it->second.subscriber_id);
        }
    }
    
    return matching_subscribers;
}

SubscriptionManager::SubscriptionStats SubscriptionManager::get_statistics() const {
    std::shared_lock<std::shared_mutex> lock(subscriptions_mutex_);
    
    SubscriptionStats stats;
    stats.total_subscriptions = subscriptions_.size();
    
    std::unordered_set<uint32_t> unique_subscribers;
    for (const auto& pair : subscriptions_) {
        unique_subscribers.insert(pair.second.subscriber_id);
        
        std::string symbol_str = pair.second.symbol.to_string();
        stats.subscriptions_per_symbol[symbol_str]++;
    }
    
    stats.active_subscribers = unique_subscribers.size();
    return stats;
}

void SubscriptionManager::update_symbol_index(uint32_t subscription_id, const Symbol& old_symbol, const Symbol& new_symbol) {
    // Remove from old symbol
    auto& old_subs = symbol_subscriptions_[old_symbol];
    old_subs.erase(std::remove(old_subs.begin(), old_subs.end(), subscription_id), old_subs.end());
    
    if (old_subs.empty()) {
        symbol_subscriptions_.erase(old_symbol);
    }
    
    // Add to new symbol
    symbol_subscriptions_[new_symbol].push_back(subscription_id);
}

bool SubscriptionManager::should_notify(const Subscription& sub, const MarketTick& tick) {
    // Check rate limiting
    if (sub.max_frequency.count() > 0) {
        auto now = std::chrono::steady_clock::now();
        if (now - sub.last_notification < sub.max_frequency) {
            return false;
        }
    }
    
    // Check minimum price change
    if (sub.min_price_change > 0.0) {
        // This would require storing previous prices - simplified for now
    }
    
    // Check message type filters
    if (tick.message_type == static_cast<uint16_t>(FixMessageType::MARKET_DATA_SNAPSHOT)) {
        return sub.include_quotes;
    } else if (tick.last_price > 0.0 && tick.last_size > 0) {
        return sub.include_trades;
    }
    
    return true;
}

// DataCompressor implementation (simplified)

std::vector<uint8_t> DataCompressor::compress_ticks(const std::vector<MarketTick>& ticks) {
    std::vector<uint8_t> compressed;
    
    if (ticks.empty()) {
        return compressed;
    }
    
    // Simple compression: store first tick fully, then deltas
    const auto& first_tick = ticks[0];
    
    // Store first tick (simplified - would need proper serialization)
    compressed.resize(sizeof(MarketTick));
    std::memcpy(compressed.data(), &first_tick, sizeof(MarketTick));
    
    // Store deltas for subsequent ticks
    for (size_t i = 1; i < ticks.size(); ++i) {
        // Delta compression would go here
        // For now, just append the tick
        size_t old_size = compressed.size();
        compressed.resize(old_size + sizeof(MarketTick));
        std::memcpy(compressed.data() + old_size, &ticks[i], sizeof(MarketTick));
    }
    
    return compressed;
}

std::vector<MarketTick> DataCompressor::decompress_ticks(const std::vector<uint8_t>& compressed_data) {
    std::vector<MarketTick> ticks;
    
    if (compressed_data.size() < sizeof(MarketTick)) {
        return ticks;
    }
    
    size_t tick_count = compressed_data.size() / sizeof(MarketTick);
    ticks.resize(tick_count);
    
    std::memcpy(ticks.data(), compressed_data.data(), compressed_data.size());
    
    return ticks;
}

uint32_t DataCompressor::compress_price(double price, double precision) {
    return static_cast<uint32_t>(price / precision);
}

double DataCompressor::decompress_price(uint32_t compressed_price, double precision) {
    return static_cast<double>(compressed_price) * precision;
}

// TickDeduplicator implementation

TickDeduplicator::TickDeduplicator(size_t max_cache_size) : max_cache_size_(max_cache_size) {}

bool TickDeduplicator::is_duplicate(const MarketTick& tick) {
    auto fingerprint = generate_fingerprint(tick);
    
    std::shared_lock<std::shared_mutex> lock(cache_mutex_);
    return fingerprint_cache_.find(fingerprint) != fingerprint_cache_.end();
}

void TickDeduplicator::add_tick(const MarketTick& tick) {
    auto fingerprint = generate_fingerprint(tick);
    auto now = std::chrono::steady_clock::now();
    
    std::unique_lock<std::shared_mutex> lock(cache_mutex_);
    
    total_processed_.fetch_add(1, std::memory_order_relaxed);
    
    if (fingerprint_cache_.find(fingerprint) != fingerprint_cache_.end()) {
        duplicates_found_.fetch_add(1, std::memory_order_relaxed);
        return;
    }
    
    // Add to cache
    fingerprint_cache_.insert(fingerprint);
    insertion_order_.push({fingerprint, now});
    
    // Cleanup if cache is too large
    while (fingerprint_cache_.size() > max_cache_size_) {
        auto oldest = insertion_order_.front();
        insertion_order_.pop();
        fingerprint_cache_.erase(oldest.first);
    }
}

TickDeduplicator::DeduplicationStats TickDeduplicator::get_statistics() const {
    std::shared_lock<std::shared_mutex> lock(cache_mutex_);
    
    DeduplicationStats stats;
    stats.total_ticks_processed = total_processed_.load(std::memory_order_relaxed);
    stats.duplicates_found = duplicates_found_.load(std::memory_order_relaxed);
    stats.cache_size = fingerprint_cache_.size();
    stats.duplicate_rate = stats.total_ticks_processed > 0 ? 
        static_cast<double>(stats.duplicates_found) / stats.total_ticks_processed : 0.0;
    
    return stats;
}

TickDeduplicator::TickFingerprint TickDeduplicator::generate_fingerprint(const MarketTick& tick) {
    TickFingerprint fp;
    fp.symbol = tick.symbol;
    fp.timestamp_ns = std::chrono::duration_cast<std::chrono::nanoseconds>(
        tick.timestamp.time_since_epoch()).count();
    fp.price_hash = hash_price(tick.last_price);
    fp.volume_hash = hash_volume(tick.last_size);
    
    return fp;
}

uint32_t TickDeduplicator::hash_price(double price) {
    // Simple hash for price (could be improved)
    uint64_t price_bits;
    std::memcpy(&price_bits, &price, sizeof(price));
    return static_cast<uint32_t>(price_bits ^ (price_bits >> 32));
}

uint32_t TickDeduplicator::hash_volume(uint64_t volume) {
    return static_cast<uint32_t>(volume ^ (volume >> 32));
}

} // namespace MarketData