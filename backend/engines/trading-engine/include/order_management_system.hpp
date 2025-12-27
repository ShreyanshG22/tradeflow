#pragma once

#include "lock_free_order_book.hpp"
#include "trading_allocator.hpp"
#include "latency_tracker.hpp"
#include <atomic>
#include <unordered_map>
#include <memory>
#include <functional>

namespace tradeflow {

/**
 * Order validation result
 */
enum class OrderValidationResult : uint8_t {
    VALID = 0,
    INVALID_SYMBOL = 1,
    INVALID_QUANTITY = 2,
    INVALID_PRICE = 3,
    INSUFFICIENT_FUNDS = 4,
    POSITION_LIMIT_EXCEEDED = 5,
    RISK_LIMIT_EXCEEDED = 6,
    MARKET_CLOSED = 7,
    DUPLICATE_ORDER_ID = 8
};

/**
 * Order execution result
 */
struct OrderExecutionResult {
    uint64_t order_id;
    uint32_t executed_quantity;
    uint64_t executed_price;
    uint64_t timestamp_nanos;
    OrderStatus final_status;
    OrderValidationResult validation_result;
};

/**
 * Risk parameters for order validation
 */
struct RiskParameters {
    uint64_t max_position_size;
    uint64_t max_order_value;
    uint64_t available_funds;
    double max_portfolio_exposure;
    bool allow_short_selling;
};

/**
 * Order routing destination
 */
enum class OrderDestination : uint8_t {
    INTERNAL_BOOK = 0,
    EXTERNAL_EXCHANGE_A = 1,
    EXTERNAL_EXCHANGE_B = 2,
    DARK_POOL = 3
};

/**
 * Ultra-low latency order management system
 * Handles order validation, routing, and execution with sub-microsecond performance
 */
class OrderManagementSystem {
public:
    static constexpr size_t MAX_ACTIVE_ORDERS = 100000;
    static constexpr size_t MAX_SYMBOLS = 10000;
    
    OrderManagementSystem(TradingAllocator& allocator, LatencyTracker& latency_tracker);
    ~OrderManagementSystem() = default;
    
    // Non-copyable, non-movable
    OrderManagementSystem(const OrderManagementSystem&) = delete;
    OrderManagementSystem& operator=(const OrderManagementSystem&) = delete;
    OrderManagementSystem(OrderManagementSystem&&) = delete;
    OrderManagementSystem& operator=(OrderManagementSystem&&) = delete;
    
    /**
     * Submit order for validation and execution (sub-microsecond target)
     * @param order_id Unique order identifier
     * @param symbol Trading symbol
     * @param side Order side (BUY/SELL)
     * @param quantity Order quantity
     * @param price Order price (0 for market orders)
     * @param user_id User identifier
     * @return Execution result with validation status
     */
    OrderExecutionResult submit_order(uint64_t order_id, const char* symbol, OrderSide side,
                                    uint32_t quantity, uint64_t price, uint32_t user_id) noexcept;
    
    /**
     * Cancel order by ID (sub-microsecond target)
     * @param order_id Order ID to cancel
     * @return true if order was cancelled, false if not found or already filled
     */
    bool cancel_order(uint64_t order_id) noexcept;
    
    /**
     * Modify order quantity or price (sub-microsecond target)
     * @param order_id Order ID to modify
     * @param new_quantity New quantity (0 to keep current)
     * @param new_price New price (0 to keep current)
     * @return true if order was modified successfully
     */
    bool modify_order(uint64_t order_id, uint32_t new_quantity, uint64_t new_price) noexcept;
    
    /**
     * Get order status by ID
     * @param order_id Order ID to query
     * @return Pointer to order if found, nullptr otherwise
     */
    const Order* get_order_status(uint64_t order_id) const noexcept;
    
    /**
     * Set risk parameters for a user
     * @param user_id User identifier
     * @param params Risk parameters
     */
    void set_risk_parameters(uint32_t user_id, const RiskParameters& params) noexcept;
    
    /**
     * Add order book for a symbol
     * @param symbol Trading symbol
     * @return Pointer to order book if created successfully
     */
    LockFreeOrderBook* add_symbol(const char* symbol) noexcept;
    
    /**
     * Get order book for a symbol
     * @param symbol Trading symbol
     * @return Pointer to order book if found, nullptr otherwise
     */
    LockFreeOrderBook* get_order_book(const char* symbol) const noexcept;
    
    /**
     * Set order routing destination for a symbol
     * @param symbol Trading symbol
     * @param destination Routing destination
     */
    void set_routing_destination(const char* symbol, OrderDestination destination) noexcept;
    
    /**
     * Get system performance statistics
     */
    struct PerformanceStats {
        uint64_t orders_submitted;
        uint64_t orders_executed;
        uint64_t orders_cancelled;
        uint64_t orders_rejected;
        uint64_t validation_errors;
        LatencyTracker::LatencyStats validation_latency;
        LatencyTracker::LatencyStats execution_latency;
    };
    
    PerformanceStats get_performance_stats() const noexcept;
    
    /**
     * Reset all statistics
     */
    void reset_stats() noexcept;
    
private:
    TradingAllocator& allocator_;
    LatencyTracker& latency_tracker_;
    
    // Order tracking
    alignas(64) std::array<std::atomic<Order*>, MAX_ACTIVE_ORDERS> active_orders_;
    std::atomic<uint64_t> next_order_slot_{0};
    
    // Symbol management
    struct SymbolInfo {
        LockFreeOrderBook* order_book;
        OrderDestination routing_destination;
        char symbol[16];
    };
    
    alignas(64) std::array<SymbolInfo, MAX_SYMBOLS> symbols_;
    std::atomic<size_t> symbol_count_{0};
    
    // Risk management - use simple array instead of unordered_map
    static constexpr size_t MAX_USERS = 1000;
    struct UserRiskInfo {
        uint32_t user_id;
        RiskParameters params;
        std::atomic<uint64_t> current_position_value;
        std::atomic<uint32_t> active_order_count;
        bool active;
    };
    
    alignas(64) std::array<UserRiskInfo, MAX_USERS> user_risk_info_;
    std::atomic<size_t> user_count_{0};
    
    // Performance tracking
    std::atomic<uint64_t> orders_submitted_{0};
    std::atomic<uint64_t> orders_executed_{0};
    std::atomic<uint64_t> orders_cancelled_{0};
    std::atomic<uint64_t> orders_rejected_{0};
    std::atomic<uint64_t> validation_errors_{0};
    
    LatencyTracker validation_latency_tracker_;
    LatencyTracker execution_latency_tracker_;
    
    // Helper methods
    OrderValidationResult validate_order(uint64_t order_id, const char* symbol, OrderSide side,
                                       uint32_t quantity, uint64_t price, uint32_t user_id) noexcept;
    
    size_t find_symbol_index(const char* symbol) const noexcept;
    size_t add_symbol_internal(const char* symbol) noexcept;
    
    bool check_duplicate_order_id(uint64_t order_id) const noexcept;
    size_t allocate_order_slot() noexcept;
    void deallocate_order_slot(size_t slot) noexcept;
    
    OrderExecutionResult execute_order_internal(Order* order, LockFreeOrderBook* order_book) noexcept;
    OrderExecutionResult route_order_external(Order* order, OrderDestination destination) noexcept;
    
    size_t find_user_index(uint32_t user_id) const noexcept;
    size_t add_user_internal(uint32_t user_id) noexcept;
};

} // namespace tradeflow