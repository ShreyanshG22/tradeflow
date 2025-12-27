#pragma once

#include <atomic>
#include <cstdint>
#include <array>
#include <memory>
#include <cstring>

namespace tradeflow {

/**
 * Order side enumeration
 */
enum class OrderSide : uint8_t {
    BUY = 0,
    SELL = 1
};

/**
 * Order status enumeration
 */
enum class OrderStatus : uint32_t {
    PENDING = 0,
    ACTIVE = 1,
    FILLED = 2,
    CANCELLED = 3,
    REJECTED = 4
};

/**
 * Ultra-low latency order structure
 * Designed for cache efficiency and atomic operations
 */
struct alignas(64) Order {
    std::atomic<uint64_t> id{0};
    std::atomic<uint64_t> price{0};        // Price in fixed-point (multiply by 10000)
    std::atomic<uint32_t> quantity{0};
    std::atomic<uint32_t> filled_quantity{0};
    std::atomic<OrderStatus> status{OrderStatus::PENDING};
    std::atomic<uint64_t> timestamp{0};
    OrderSide side;
    uint32_t user_id;
    char symbol[16];                       // Null-terminated symbol
    
    Order() = default;
    
    Order(uint64_t order_id, uint64_t order_price, uint32_t qty, 
          OrderSide order_side, uint32_t uid, const char* sym, uint64_t ts) 
        : id(order_id), price(order_price), quantity(qty), filled_quantity(0),
          status(OrderStatus::PENDING), timestamp(ts), side(order_side), user_id(uid) {
        std::strncpy(symbol, sym, sizeof(symbol) - 1);
        symbol[sizeof(symbol) - 1] = '\0';
    }
};

/**
 * Price level in the order book
 */
struct alignas(64) PriceLevel {
    std::atomic<uint64_t> price{0};
    std::atomic<uint32_t> total_quantity{0};
    std::atomic<uint32_t> order_count{0};
    std::atomic<Order*> first_order{nullptr};
    
    PriceLevel() = default;
};

/**
 * Lock-free order book implementation for ultra-low latency trading
 * Uses atomic operations and lock-free data structures
 */
class LockFreeOrderBook {
public:
    static constexpr size_t MAX_PRICE_LEVELS = 1000;
    static constexpr size_t MAX_ORDERS_PER_LEVEL = 100;
    
    LockFreeOrderBook();
    ~LockFreeOrderBook() = default;
    
    // Non-copyable, non-movable
    LockFreeOrderBook(const LockFreeOrderBook&) = delete;
    LockFreeOrderBook& operator=(const LockFreeOrderBook&) = delete;
    LockFreeOrderBook(LockFreeOrderBook&&) = delete;
    LockFreeOrderBook& operator=(LockFreeOrderBook&&) = delete;
    
    /**
     * Add order to the book (lock-free)
     * @param order Pointer to order structure
     * @return true if order added successfully, false otherwise
     */
    bool add_order(Order* order) noexcept;
    
    /**
     * Cancel order by ID (lock-free)
     * @param order_id Order ID to cancel
     * @return true if order cancelled, false if not found
     */
    bool cancel_order(uint64_t order_id) noexcept;
    
    /**
     * Get best bid price and quantity
     * @return pair of (price, quantity), (0, 0) if no bids
     */
    std::pair<uint64_t, uint32_t> get_best_bid() const noexcept;
    
    /**
     * Get best ask price and quantity
     * @return pair of (price, quantity), (0, 0) if no asks
     */
    std::pair<uint64_t, uint32_t> get_best_ask() const noexcept;
    
    /**
     * Get market depth (top N levels)
     * @param levels Array to fill with price levels
     * @param max_levels Maximum number of levels to return
     * @param side Order side (BUY for bids, SELL for asks)
     * @return Number of levels filled
     */
    size_t get_market_depth(PriceLevel* levels, size_t max_levels, OrderSide side) const noexcept;
    
    /**
     * Match orders and execute trades
     * @param incoming_order Order to match against the book
     * @return Number of shares matched
     */
    uint32_t match_order(Order* incoming_order) noexcept;
    
    /**
     * Get order book statistics
     */
    struct BookStats {
        uint32_t total_bid_orders;
        uint32_t total_ask_orders;
        uint64_t total_bid_quantity;
        uint64_t total_ask_quantity;
        uint32_t bid_levels;
        uint32_t ask_levels;
    };
    
    BookStats get_stats() const noexcept;
    
    /**
     * Clear all orders (use only during market close)
     */
    void clear() noexcept;
    
private:
    // Separate arrays for bids and asks for cache efficiency
    alignas(64) std::array<PriceLevel, MAX_PRICE_LEVELS> bid_levels_;
    alignas(64) std::array<PriceLevel, MAX_PRICE_LEVELS> ask_levels_;
    
    // Atomic counters for book state
    std::atomic<uint32_t> bid_level_count_{0};
    std::atomic<uint32_t> ask_level_count_{0};
    std::atomic<uint64_t> sequence_number_{0};
    
    // Helper methods
    bool insert_order_at_level(PriceLevel& level, Order* order) noexcept;
    bool remove_order_from_level(PriceLevel& level, uint64_t order_id) noexcept;
    size_t find_price_level(const std::array<PriceLevel, MAX_PRICE_LEVELS>& levels,
                           uint32_t level_count, uint64_t price) const noexcept;
    size_t insert_price_level(std::array<PriceLevel, MAX_PRICE_LEVELS>& levels,
                             std::atomic<uint32_t>& level_count, uint64_t price) noexcept;
};

} // namespace tradeflow