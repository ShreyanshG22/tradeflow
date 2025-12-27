#include "../include/lock_free_order_book.hpp"
#include "../include/trading_allocator.hpp"
#include "../include/latency_tracker.hpp"
#include <memory>

namespace tradeflow {

/**
 * Main order book class that integrates all ultra-low latency components
 */
class OrderBook {
public:
    OrderBook() : allocator_(std::make_unique<TradingAllocator>()),
                  order_book_(std::make_unique<LockFreeOrderBook>()),
                  latency_tracker_(std::make_unique<LatencyTracker>()) {}
    
    ~OrderBook() = default;
    
    // Non-copyable, non-movable
    OrderBook(const OrderBook&) = delete;
    OrderBook& operator=(const OrderBook&) = delete;
    OrderBook(OrderBook&&) = delete;
    OrderBook& operator=(OrderBook&&) = delete;
    
    /**
     * Add order to the book with latency tracking
     */
    bool add_order(uint64_t order_id, uint64_t price, uint32_t quantity, 
                   OrderSide side, uint32_t user_id, const char* symbol) {
        LatencyMeasurement measurement(*latency_tracker_);
        
        // Allocate order from pool
        Order* order = allocator_->allocate<Order>();
        if (!order) {
            return false;
        }
        
        // Initialize order
        uint64_t timestamp = LatencyTracker::now_nanos();
        new (order) Order(order_id, price, quantity, side, user_id, symbol, timestamp);
        
        // Add to order book
        bool result = order_book_->add_order(order);
        
        if (result) {
            counters_.orders_processed.fetch_add(1, std::memory_order_relaxed);
        } else {
            counters_.orders_rejected.fetch_add(1, std::memory_order_relaxed);
        }
        
        return result;
    }
    
    /**
     * Cancel order by ID
     */
    bool cancel_order(uint64_t order_id) {
        LatencyMeasurement measurement(*latency_tracker_);
        
        bool result = order_book_->cancel_order(order_id);
        
        if (result) {
            counters_.orders_cancelled.fetch_add(1, std::memory_order_relaxed);
        }
        
        return result;
    }
    
    /**
     * Match incoming order against the book
     */
    uint32_t match_order(uint64_t order_id, uint64_t price, uint32_t quantity,
                        OrderSide side, uint32_t user_id, const char* symbol) {
        LatencyMeasurement measurement(*latency_tracker_);
        
        // Allocate order from pool
        Order* order = allocator_->allocate<Order>();
        if (!order) {
            return 0;
        }
        
        // Initialize order
        uint64_t timestamp = LatencyTracker::now_nanos();
        new (order) Order(order_id, price, quantity, side, user_id, symbol, timestamp);
        
        // Match against book
        uint32_t matched = order_book_->match_order(order);
        
        if (matched > 0) {
            counters_.orders_matched.fetch_add(1, std::memory_order_relaxed);
            counters_.trades_executed.fetch_add(1, std::memory_order_relaxed);
        }
        
        return matched;
    }
    
    /**
     * Get best bid price and quantity
     */
    std::pair<uint64_t, uint32_t> get_best_bid() const {
        return order_book_->get_best_bid();
    }
    
    /**
     * Get best ask price and quantity
     */
    std::pair<uint64_t, uint32_t> get_best_ask() const {
        return order_book_->get_best_ask();
    }
    
    /**
     * Get market depth
     */
    size_t get_market_depth(PriceLevel* levels, size_t max_levels, OrderSide side) const {
        return order_book_->get_market_depth(levels, max_levels, side);
    }
    
    /**
     * Get order book statistics
     */
    LockFreeOrderBook::BookStats get_book_stats() const {
        return order_book_->get_stats();
    }
    
    /**
     * Get latency statistics
     */
    LatencyTracker::LatencyStats get_latency_stats() const {
        return latency_tracker_->get_stats();
    }
    
    /**
     * Get performance counters
     */
    PerformanceCounters::Snapshot get_performance_stats() const {
        return counters_.get_snapshot();
    }
    
    /**
     * Reset allocator (use only during market close)
     */
    void reset_allocator() {
        allocator_->reset();
    }
    
    /**
     * Clear order book (use only during market close)
     */
    void clear() {
        order_book_->clear();
        latency_tracker_->reset();
        counters_.reset();
    }
    
private:
    std::unique_ptr<TradingAllocator> allocator_;
    std::unique_ptr<LockFreeOrderBook> order_book_;
    std::unique_ptr<LatencyTracker> latency_tracker_;
    PerformanceCounters counters_;
};

} // namespace tradeflow