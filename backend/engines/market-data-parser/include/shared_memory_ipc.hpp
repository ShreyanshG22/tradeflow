#pragma once

#include "market_data_types.hpp"
#include <sys/mman.h>
#include <sys/stat.h>
#include <fcntl.h>
#include <unistd.h>
#include <semaphore.h>
#include <atomic>
#include <string>
#include <memory>

namespace MarketData {

// Shared memory configuration
struct SharedMemoryConfig {
    static constexpr size_t MAX_TICKS_PER_BUFFER = 8192;
    static constexpr size_t MAX_SUBSCRIBERS = 64;
    static constexpr size_t BUFFER_COUNT = 4; // Multiple buffers for lock-free operation
    static constexpr size_t ALIGNMENT = 64; // Cache line alignment
};

// Shared memory header
struct alignas(64) SharedMemoryHeader {
    std::atomic<uint64_t> producer_sequence{0};
    std::atomic<uint64_t> consumer_sequences[SharedMemoryConfig::MAX_SUBSCRIBERS];
    std::atomic<uint32_t> active_consumers{0};
    std::atomic<uint32_t> buffer_index{0};
    uint64_t buffer_size;
    uint64_t tick_size;
    char padding[64 - sizeof(uint64_t) * 2 - sizeof(uint32_t) * 2 - sizeof(std::atomic<uint64_t>) * (1 + SharedMemoryConfig::MAX_SUBSCRIBERS)];
};

// Lock-free ring buffer in shared memory
template<typename T, size_t Capacity>
class SharedRingBuffer {
public:
    static_assert((Capacity & (Capacity - 1)) == 0, "Capacity must be power of 2");
    
    SharedRingBuffer() = default;
    
    // Initialize buffer (call from producer)
    void initialize() {
        write_index_.store(0, std::memory_order_relaxed);
        for (size_t i = 0; i < Capacity; ++i) {
            new (&buffer_[i]) std::atomic<T*>(nullptr);
        }
    }
    
    // Producer: try to publish item
    bool try_publish(T* item) {
        const uint64_t current_write = write_index_.load(std::memory_order_relaxed);
        const uint64_t next_write = current_write + 1;
        
        // Check if any consumer is too far behind
        for (size_t i = 0; i < SharedMemoryConfig::MAX_SUBSCRIBERS; ++i) {
            uint64_t consumer_seq = consumer_sequences_[i].load(std::memory_order_acquire);
            if (consumer_seq != 0 && (next_write - consumer_seq) >= Capacity) {
                return false; // Would overwrite unread data
            }
        }
        
        // Store item
        const size_t index = current_write & (Capacity - 1);
        buffer_[index].store(item, std::memory_order_release);
        write_index_.store(next_write, std::memory_order_release);
        
        return true;
    }
    
    // Consumer: try to consume next item
    bool try_consume(uint32_t consumer_id, T*& item) {
        if (consumer_id >= SharedMemoryConfig::MAX_SUBSCRIBERS) {
            return false;
        }
        
        const uint64_t current_read = consumer_sequences_[consumer_id].load(std::memory_order_relaxed);
        const uint64_t available = write_index_.load(std::memory_order_acquire);
        
        if (current_read >= available) {
            return false; // No new data
        }
        
        const size_t index = current_read & (Capacity - 1);
        item = buffer_[index].load(std::memory_order_acquire);
        
        if (item == nullptr) {
            return false; // Item not ready yet
        }
        
        consumer_sequences_[consumer_id].store(current_read + 1, std::memory_order_release);
        return true;
    }
    
    // Get current write position
    uint64_t get_write_position() const {
        return write_index_.load(std::memory_order_acquire);
    }
    
    // Get consumer position
    uint64_t get_consumer_position(uint32_t consumer_id) const {
        if (consumer_id >= SharedMemoryConfig::MAX_SUBSCRIBERS) {
            return 0;
        }
        return consumer_sequences_[consumer_id].load(std::memory_order_acquire);
    }

private:
    alignas(64) std::atomic<uint64_t> write_index_{0};
    alignas(64) std::atomic<uint64_t> consumer_sequences_[SharedMemoryConfig::MAX_SUBSCRIBERS];
    alignas(64) std::atomic<T*> buffer_[Capacity];
};

// Shared memory manager for market data distribution
class SharedMemoryManager {
public:
    SharedMemoryManager(const std::string& name, bool is_producer = false);
    ~SharedMemoryManager();
    
    // Non-copyable, non-movable
    SharedMemoryManager(const SharedMemoryManager&) = delete;
    SharedMemoryManager& operator=(const SharedMemoryManager&) = delete;
    
    // Producer interface
    bool publish_tick(const MarketTick& tick);
    bool publish_tick_batch(const std::vector<MarketTick>& ticks);
    
    // Consumer interface
    uint32_t register_consumer();
    void unregister_consumer(uint32_t consumer_id);
    bool consume_tick(uint32_t consumer_id, MarketTick& tick);
    std::vector<MarketTick> consume_available_ticks(uint32_t consumer_id, size_t max_count = 100);
    
    // Status and statistics
    struct Statistics {
        uint64_t total_published;
        uint64_t total_consumed;
        uint64_t active_consumers;
        uint64_t buffer_utilization_percent;
        uint64_t slowest_consumer_lag;
    };
    
    Statistics get_statistics() const;
    
    // Check if shared memory is valid
    bool is_valid() const { return memory_ptr_ != nullptr; }

private:
    std::string name_;
    bool is_producer_;
    int shm_fd_;
    void* memory_ptr_;
    size_t memory_size_;
    
    SharedMemoryHeader* header_;
    SharedRingBuffer<MarketTick, SharedMemoryConfig::MAX_TICKS_PER_BUFFER>* ring_buffer_;
    MarketTick* tick_pool_;
    
    // Semaphores for synchronization
    sem_t* producer_sem_;
    sem_t* consumer_sem_;
    
    // Memory allocation within shared memory
    std::atomic<size_t> next_tick_offset_{0};
    
    // Initialize shared memory
    bool initialize_shared_memory();
    void cleanup_shared_memory();
    
    // Allocate tick from shared memory pool
    MarketTick* allocate_tick();
    void deallocate_tick(MarketTick* tick);
    
    // Calculate memory layout
    size_t calculate_memory_size() const;
    void setup_memory_layout();
};

// Subscription manager for filtering and routing
class SubscriptionManager {
public:
    SubscriptionManager();
    ~SubscriptionManager() = default;
    
    // Subscription management
    struct Subscription {
        uint32_t subscriber_id;
        Symbol symbol;
        bool include_trades = true;
        bool include_quotes = true;
        bool include_depth = false;
        uint32_t depth_levels = 5;
        double min_price_change = 0.0; // Minimum price change to notify
        std::chrono::milliseconds max_frequency{0}; // Rate limiting
        std::chrono::steady_clock::time_point last_notification;
    };
    
    uint32_t add_subscription(const Subscription& subscription);
    bool remove_subscription(uint32_t subscription_id);
    bool update_subscription(uint32_t subscription_id, const Subscription& subscription);
    
    // Check if tick matches any subscriptions
    std::vector<uint32_t> get_matching_subscribers(const MarketTick& tick);
    
    // Get subscription statistics
    struct SubscriptionStats {
        size_t total_subscriptions;
        size_t active_subscribers;
        std::unordered_map<std::string, size_t> subscriptions_per_symbol;
    };
    
    SubscriptionStats get_statistics() const;

private:
    mutable std::shared_mutex subscriptions_mutex_;
    std::unordered_map<uint32_t, Subscription> subscriptions_;
    std::unordered_map<Symbol, std::vector<uint32_t>, SymbolHash> symbol_subscriptions_;
    
    std::atomic<uint32_t> next_subscription_id_{1};
    
    // Helper methods
    void update_symbol_index(uint32_t subscription_id, const Symbol& old_symbol, const Symbol& new_symbol);
    bool should_notify(const Subscription& sub, const MarketTick& tick);
};

// Data compression utilities
class DataCompressor {
public:
    // Compress tick data using delta encoding and bit packing
    static std::vector<uint8_t> compress_ticks(const std::vector<MarketTick>& ticks);
    static std::vector<MarketTick> decompress_ticks(const std::vector<uint8_t>& compressed_data);
    
    // Price compression using fixed-point representation
    static uint32_t compress_price(double price, double precision = 0.01);
    static double decompress_price(uint32_t compressed_price, double precision = 0.01);
    
    // Volume compression using variable-length encoding
    static std::vector<uint8_t> compress_volume(uint64_t volume);
    static uint64_t decompress_volume(const uint8_t* data, size_t& bytes_read);

private:
    // Delta encoding for timestamps
    static std::vector<uint8_t> encode_timestamp_deltas(const std::vector<MarketTick>& ticks);
    static void decode_timestamp_deltas(const uint8_t* data, size_t length, std::vector<MarketTick>& ticks);
    
    // Variable-length integer encoding
    static size_t encode_varint(uint64_t value, uint8_t* buffer);
    static uint64_t decode_varint(const uint8_t* data, size_t& bytes_read);
};

// Deduplication system to avoid duplicate tick processing
class TickDeduplicator {
public:
    TickDeduplicator(size_t max_cache_size = 10000);
    ~TickDeduplicator() = default;
    
    // Check if tick is duplicate
    bool is_duplicate(const MarketTick& tick);
    
    // Add tick to deduplication cache
    void add_tick(const MarketTick& tick);
    
    // Clear old entries
    void cleanup_old_entries(std::chrono::seconds max_age);
    
    // Get statistics
    struct DeduplicationStats {
        size_t total_ticks_processed;
        size_t duplicates_found;
        size_t cache_size;
        double duplicate_rate;
    };
    
    DeduplicationStats get_statistics() const;

private:
    struct TickFingerprint {
        Symbol symbol;
        uint64_t timestamp_ns;
        uint32_t price_hash;
        uint32_t volume_hash;
        
        bool operator==(const TickFingerprint& other) const {
            return symbol == other.symbol &&
                   timestamp_ns == other.timestamp_ns &&
                   price_hash == other.price_hash &&
                   volume_hash == other.volume_hash;
        }
    };
    
    struct TickFingerprintHash {
        size_t operator()(const TickFingerprint& fp) const {
            size_t h1 = SymbolHash{}(fp.symbol);
            size_t h2 = std::hash<uint64_t>{}(fp.timestamp_ns);
            size_t h3 = std::hash<uint32_t>{}(fp.price_hash);
            size_t h4 = std::hash<uint32_t>{}(fp.volume_hash);
            return h1 ^ (h2 << 1) ^ (h3 << 2) ^ (h4 << 3);
        }
    };
    
    mutable std::shared_mutex cache_mutex_;
    std::unordered_set<TickFingerprint, TickFingerprintHash> fingerprint_cache_;
    std::queue<std::pair<TickFingerprint, std::chrono::steady_clock::time_point>> insertion_order_;
    
    size_t max_cache_size_;
    std::atomic<size_t> total_processed_{0};
    std::atomic<size_t> duplicates_found_{0};
    
    // Generate fingerprint for tick
    TickFingerprint generate_fingerprint(const MarketTick& tick);
    
    // Hash functions for price and volume
    uint32_t hash_price(double price);
    uint32_t hash_volume(uint64_t volume);
};

} // namespace MarketData