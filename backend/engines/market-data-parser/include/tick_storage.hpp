#pragma once

#include "market_data_types.hpp"
#include "lock_free_queue.hpp"
#include <atomic>
#include <memory>
#include <array>
#include <unordered_map>

namespace MarketData {

// Lock-free circular buffer for tick storage
template<size_t Capacity>
class LockFreeTickBuffer {
public:
    static_assert((Capacity & (Capacity - 1)) == 0, "Capacity must be power of 2");
    
    LockFreeTickBuffer() : write_index_(0), read_index_(0) {
        // Initialize all slots
        for (size_t i = 0; i < Capacity; ++i) {
            buffer_[i].store(nullptr, std::memory_order_relaxed);
        }
    }
    
    ~LockFreeTickBuffer() {
        // Clean up any remaining ticks
        MarketTick* tick;
        while (try_pop(tick)) {
            delete tick;
        }
    }
    
    // Non-copyable, non-movable
    LockFreeTickBuffer(const LockFreeTickBuffer&) = delete;
    LockFreeTickBuffer& operator=(const LockFreeTickBuffer&) = delete;
    
    bool try_push(std::unique_ptr<MarketTick> tick) {
        const size_t current_write = write_index_.load(std::memory_order_relaxed);
        const size_t next_write = (current_write + 1) & (Capacity - 1);
        
        // Check if buffer is full
        if (next_write == read_index_.load(std::memory_order_acquire)) {
            return false; // Buffer full
        }
        
        // Store the tick
        buffer_[current_write].store(tick.release(), std::memory_order_release);
        write_index_.store(next_write, std::memory_order_release);
        
        return true;
    }
    
    bool try_pop(MarketTick*& tick) {
        const size_t current_read = read_index_.load(std::memory_order_relaxed);
        
        // Check if buffer is empty
        if (current_read == write_index_.load(std::memory_order_acquire)) {
            return false; // Buffer empty
        }
        
        // Load the tick
        tick = buffer_[current_read].load(std::memory_order_acquire);
        buffer_[current_read].store(nullptr, std::memory_order_relaxed);
        
        read_index_.store((current_read + 1) & (Capacity - 1), std::memory_order_release);
        
        return true;
    }
    
    size_t size() const {
        const size_t write_idx = write_index_.load(std::memory_order_acquire);
        const size_t read_idx = read_index_.load(std::memory_order_acquire);
        return (write_idx - read_idx) & (Capacity - 1);
    }
    
    bool empty() const {
        return read_index_.load(std::memory_order_acquire) == 
               write_index_.load(std::memory_order_acquire);
    }
    
    bool full() const {
        const size_t write_idx = write_index_.load(std::memory_order_acquire);
        const size_t read_idx = read_index_.load(std::memory_order_acquire);
        return ((write_idx + 1) & (Capacity - 1)) == read_idx;
    }

private:
    alignas(64) std::atomic<size_t> write_index_;
    alignas(64) std::atomic<size_t> read_index_;
    alignas(64) std::array<std::atomic<MarketTick*>, Capacity> buffer_;
};

// Multi-producer, multi-consumer tick storage system
class TickStorage {
public:
    static constexpr size_t DEFAULT_BUFFER_SIZE = 65536; // 64K ticks per symbol
    static constexpr size_t MAX_SYMBOLS = 1024;
    
    TickStorage();
    ~TickStorage();
    
    // Non-copyable, non-movable
    TickStorage(const TickStorage&) = delete;
    TickStorage& operator=(const TickStorage&) = delete;
    
    // Store a tick (thread-safe)
    bool store_tick(const MarketTick& tick);
    
    // Retrieve latest tick for symbol (thread-safe)
    bool get_latest_tick(const Symbol& symbol, MarketTick& tick);
    
    // Retrieve multiple ticks for symbol (thread-safe)
    std::vector<MarketTick> get_recent_ticks(const Symbol& symbol, size_t count);
    
    // Get all symbols with recent activity
    std::vector<Symbol> get_active_symbols();
    
    // Clear old data (call periodically)
    void cleanup_old_data(std::chrono::seconds max_age);
    
    // Get storage statistics
    struct StorageStats {
        size_t total_ticks_stored;
        size_t active_symbols;
        size_t memory_usage_bytes;
        size_t buffer_utilization_percent;
        size_t drops_due_to_full_buffer;
    };
    
    StorageStats get_stats() const;
    
    // Reset all statistics
    void reset_stats();

private:
    // Per-symbol storage
    struct SymbolStorage {
        LockFreeTickBuffer<DEFAULT_BUFFER_SIZE> buffer;
        std::atomic<Timestamp> last_update;
        std::atomic<uint64_t> tick_count;
        MarketTick latest_tick; // Cache for fast access
        std::atomic<bool> has_data;
        
        SymbolStorage() : last_update(Timestamp{}), tick_count(0), has_data(false) {}
    };
    
    // Hash function for Symbol
    struct SymbolHash {
        size_t operator()(const Symbol& symbol) const {
            size_t hash = 0;
            for (size_t i = 0; i < symbol.length; ++i) {
                hash = hash * 31 + static_cast<size_t>(symbol.data[i]);
            }
            return hash;
        }
    };
    
    // Symbol storage map (protected by RW lock for resize operations)
    mutable std::shared_mutex storage_mutex_;
    std::unordered_map<Symbol, std::unique_ptr<SymbolStorage>, SymbolHash> symbol_storage_;
    
    // Statistics (atomic for thread safety)
    mutable std::atomic<uint64_t> total_ticks_stored_{0};
    mutable std::atomic<uint64_t> total_drops_{0};
    
    // Memory pool for tick allocation
    std::unique_ptr<class MemoryPool> memory_pool_;
    
    // Get or create storage for symbol
    SymbolStorage* get_symbol_storage(const Symbol& symbol);
    
    // Cleanup thread management
    std::atomic<bool> cleanup_running_{false};
    std::thread cleanup_thread_;
    void cleanup_worker();
};

// High-performance tick aggregator for OHLCV bars
class TickAggregator {
public:
    TickAggregator();
    ~TickAggregator() = default;
    
    // Add tick to aggregation
    void add_tick(const MarketTick& tick);
    
    // Get OHLCV bar for time period
    bool get_ohlcv_bar(const Symbol& symbol, 
                       const Timestamp& start_time,
                       const Timestamp& end_time,
                       OHLCVBar& bar);
    
    // Get multiple bars for symbol
    std::vector<OHLCVBar> get_ohlcv_bars(const Symbol& symbol,
                                        const Timestamp& start_time,
                                        const Timestamp& end_time,
                                        std::chrono::seconds interval);

private:
    struct BarData {
        double open = 0.0;
        double high = 0.0;
        double low = 0.0;
        double close = 0.0;
        uint64_t volume = 0;
        uint32_t tick_count = 0;
        Timestamp first_tick_time;
        Timestamp last_tick_time;
        bool initialized = false;
        
        void update_with_tick(const MarketTick& tick) {
            if (!initialized) {
                open = high = low = close = tick.last_price;
                first_tick_time = tick.timestamp;
                initialized = true;
            } else {
                high = std::max(high, tick.last_price);
                low = std::min(low, tick.last_price);
            }
            
            close = tick.last_price;
            volume += tick.last_size;
            tick_count++;
            last_tick_time = tick.timestamp;
        }
    };
    
    // Time-based bar storage
    struct TimeKey {
        Symbol symbol;
        uint64_t time_bucket;
        
        bool operator==(const TimeKey& other) const {
            return symbol == other.symbol && time_bucket == other.time_bucket;
        }
    };
    
    struct TimeKeyHash {
        size_t operator()(const TimeKey& key) const {
            size_t h1 = SymbolHash{}(key.symbol);
            size_t h2 = std::hash<uint64_t>{}(key.time_bucket);
            return h1 ^ (h2 << 1);
        }
    };
    
    mutable std::shared_mutex bars_mutex_;
    std::unordered_map<TimeKey, BarData, TimeKeyHash> bars_;
    
    // Convert timestamp to time bucket
    uint64_t get_time_bucket(const Timestamp& timestamp, std::chrono::seconds interval);
};

} // namespace MarketData