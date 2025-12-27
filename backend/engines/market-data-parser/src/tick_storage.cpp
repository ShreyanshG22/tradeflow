#include "tick_storage.hpp"
#include "memory_pool.hpp"
#include <algorithm>
#include <thread>

namespace MarketData {

TickStorage::TickStorage() {
    // Initialize memory pool for efficient tick allocation
    memory_pool_ = std::make_unique<MemoryPool>(sizeof(MarketTick), DEFAULT_BUFFER_SIZE * MAX_SYMBOLS);
    
    // Start cleanup thread
    cleanup_running_.store(true, std::memory_order_release);
    cleanup_thread_ = std::thread(&TickStorage::cleanup_worker, this);
}

TickStorage::~TickStorage() {
    // Stop cleanup thread
    cleanup_running_.store(false, std::memory_order_release);
    if (cleanup_thread_.joinable()) {
        cleanup_thread_.join();
    }
}

bool TickStorage::store_tick(const MarketTick& tick) {
    auto* storage = get_symbol_storage(tick.symbol);
    if (!storage) {
        total_drops_.fetch_add(1, std::memory_order_relaxed);
        return false;
    }
    
    // Allocate tick from memory pool
    auto* new_tick = static_cast<MarketTick*>(memory_pool_->allocate());
    if (!new_tick) {
        total_drops_.fetch_add(1, std::memory_order_relaxed);
        return false;
    }
    
    // Copy tick data
    *new_tick = tick;
    
    // Try to store in buffer
    if (!storage->buffer.try_push(std::unique_ptr<MarketTick>(new_tick))) {
        memory_pool_->deallocate(new_tick);
        total_drops_.fetch_add(1, std::memory_order_relaxed);
        return false;
    }
    
    // Update metadata
    storage->latest_tick = tick;
    storage->last_update.store(tick.timestamp, std::memory_order_release);
    storage->tick_count.fetch_add(1, std::memory_order_relaxed);
    storage->has_data.store(true, std::memory_order_release);
    
    total_ticks_stored_.fetch_add(1, std::memory_order_relaxed);
    return true;
}

bool TickStorage::get_latest_tick(const Symbol& symbol, MarketTick& tick) {
    std::shared_lock<std::shared_mutex> lock(storage_mutex_);
    
    auto it = symbol_storage_.find(symbol);
    if (it == symbol_storage_.end() || !it->second->has_data.load(std::memory_order_acquire)) {
        return false;
    }
    
    tick = it->second->latest_tick;
    return true;
}

std::vector<MarketTick> TickStorage::get_recent_ticks(const Symbol& symbol, size_t count) {
    std::vector<MarketTick> ticks;
    ticks.reserve(count);
    
    std::shared_lock<std::shared_mutex> lock(storage_mutex_);
    
    auto it = symbol_storage_.find(symbol);
    if (it == symbol_storage_.end()) {
        return ticks;
    }
    
    auto& storage = *it->second;
    
    // Collect ticks from buffer (this is a simplified version)
    // In practice, you'd want a more sophisticated approach to get recent ticks
    MarketTick* tick;
    std::vector<MarketTick*> temp_ticks;
    
    // Pop ticks temporarily
    while (temp_ticks.size() < count && storage.buffer.try_pop(tick)) {
        temp_ticks.push_back(tick);
    }
    
    // Copy ticks to result and put them back
    for (auto it = temp_ticks.rbegin(); it != temp_ticks.rend(); ++it) {
        ticks.push_back(**it);
        storage.buffer.try_push(std::unique_ptr<MarketTick>(*it));
    }
    
    return ticks;
}

std::vector<Symbol> TickStorage::get_active_symbols() {
    std::vector<Symbol> symbols;
    
    std::shared_lock<std::shared_mutex> lock(storage_mutex_);
    
    symbols.reserve(symbol_storage_.size());
    for (const auto& pair : symbol_storage_) {
        if (pair.second->has_data.load(std::memory_order_acquire)) {
            symbols.push_back(pair.first);
        }
    }
    
    return symbols;
}

void TickStorage::cleanup_old_data(std::chrono::seconds max_age) {
    auto cutoff_time = std::chrono::high_resolution_clock::now() - max_age;
    
    std::unique_lock<std::shared_mutex> lock(storage_mutex_);
    
    auto it = symbol_storage_.begin();
    while (it != symbol_storage_.end()) {
        auto last_update = it->second->last_update.load(std::memory_order_acquire);
        
        if (last_update < cutoff_time) {
            // Clean up old ticks from this symbol's buffer
            MarketTick* tick;
            while (it->second->buffer.try_pop(tick)) {
                memory_pool_->deallocate(tick);
            }
            
            it->second->has_data.store(false, std::memory_order_release);
            it->second->tick_count.store(0, std::memory_order_release);
        }
        
        ++it;
    }
}

TickStorage::StorageStats TickStorage::get_stats() const {
    StorageStats stats;
    
    stats.total_ticks_stored = total_ticks_stored_.load(std::memory_order_relaxed);
    stats.drops_due_to_full_buffer = total_drops_.load(std::memory_order_relaxed);
    
    std::shared_lock<std::shared_mutex> lock(storage_mutex_);
    
    stats.active_symbols = 0;
    size_t total_buffer_usage = 0;
    
    for (const auto& pair : symbol_storage_) {
        if (pair.second->has_data.load(std::memory_order_acquire)) {
            stats.active_symbols++;
        }
        total_buffer_usage += pair.second->buffer.size();
    }
    
    stats.memory_usage_bytes = memory_pool_->get_allocated_bytes();
    stats.buffer_utilization_percent = symbol_storage_.empty() ? 0 :
        (total_buffer_usage * 100) / (symbol_storage_.size() * DEFAULT_BUFFER_SIZE);
    
    return stats;
}

void TickStorage::reset_stats() {
    total_ticks_stored_.store(0, std::memory_order_relaxed);
    total_drops_.store(0, std::memory_order_relaxed);
}

TickStorage::SymbolStorage* TickStorage::get_symbol_storage(const Symbol& symbol) {
    // Try to find existing storage first (read lock)
    {
        std::shared_lock<std::shared_mutex> lock(storage_mutex_);
        auto it = symbol_storage_.find(symbol);
        if (it != symbol_storage_.end()) {
            return it->second.get();
        }
    }
    
    // Need to create new storage (write lock)
    std::unique_lock<std::shared_mutex> lock(storage_mutex_);
    
    // Double-check after acquiring write lock
    auto it = symbol_storage_.find(symbol);
    if (it != symbol_storage_.end()) {
        return it->second.get();
    }
    
    // Check if we've reached the maximum number of symbols
    if (symbol_storage_.size() >= MAX_SYMBOLS) {
        return nullptr;
    }
    
    // Create new storage
    auto storage = std::make_unique<SymbolStorage>();
    auto* storage_ptr = storage.get();
    
    symbol_storage_[symbol] = std::move(storage);
    return storage_ptr;
}

void TickStorage::cleanup_worker() {
    while (cleanup_running_.load(std::memory_order_acquire)) {
        // Clean up data older than 1 hour
        cleanup_old_data(std::chrono::hours(1));
        
        // Sleep for 5 minutes before next cleanup
        std::this_thread::sleep_for(std::chrono::minutes(5));
    }
}

// TickAggregator implementation

TickAggregator::TickAggregator() = default;

void TickAggregator::add_tick(const MarketTick& tick) {
    if (tick.last_price <= 0.0 || tick.last_size == 0) {
        return; // Invalid tick
    }
    
    // Use 1-minute buckets by default
    auto time_bucket = get_time_bucket(tick.timestamp, std::chrono::minutes(1));
    
    TimeKey key{tick.symbol, time_bucket};
    
    std::unique_lock<std::shared_mutex> lock(bars_mutex_);
    
    auto& bar_data = bars_[key];
    bar_data.update_with_tick(tick);
}

bool TickAggregator::get_ohlcv_bar(const Symbol& symbol, 
                                  const Timestamp& start_time,
                                  const Timestamp& end_time,
                                  OHLCVBar& bar) {
    auto interval = std::chrono::duration_cast<std::chrono::seconds>(end_time - start_time);
    auto time_bucket = get_time_bucket(start_time, interval);
    
    TimeKey key{symbol, time_bucket};
    
    std::shared_lock<std::shared_mutex> lock(bars_mutex_);
    
    auto it = bars_.find(key);
    if (it == bars_.end() || !it->second.initialized) {
        return false;
    }
    
    const auto& bar_data = it->second;
    
    bar.symbol = symbol;
    bar.start_time = start_time;
    bar.end_time = end_time;
    bar.open = bar_data.open;
    bar.high = bar_data.high;
    bar.low = bar_data.low;
    bar.close = bar_data.close;
    bar.volume = bar_data.volume;
    bar.tick_count = bar_data.tick_count;
    
    return true;
}

std::vector<OHLCVBar> TickAggregator::get_ohlcv_bars(const Symbol& symbol,
                                                    const Timestamp& start_time,
                                                    const Timestamp& end_time,
                                                    std::chrono::seconds interval) {
    std::vector<OHLCVBar> bars;
    
    auto current_time = start_time;
    while (current_time < end_time) {
        auto next_time = current_time + interval;
        
        OHLCVBar bar;
        if (get_ohlcv_bar(symbol, current_time, next_time, bar)) {
            bars.push_back(bar);
        }
        
        current_time = next_time;
    }
    
    return bars;
}

uint64_t TickAggregator::get_time_bucket(const Timestamp& timestamp, std::chrono::seconds interval) {
    auto epoch_seconds = std::chrono::duration_cast<std::chrono::seconds>(
        timestamp.time_since_epoch()).count();
    
    auto interval_seconds = interval.count();
    return static_cast<uint64_t>(epoch_seconds / interval_seconds);
}

} // namespace MarketData