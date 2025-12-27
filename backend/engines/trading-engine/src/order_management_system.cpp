#include "../include/order_management_system.hpp"
#include <cstring>
#include <algorithm>

namespace tradeflow {

OrderManagementSystem::OrderManagementSystem(TradingAllocator& allocator, LatencyTracker& latency_tracker)
    : allocator_(allocator), latency_tracker_(latency_tracker) {
    
    // Initialize active orders array
    for (auto& order_ptr : active_orders_) {
        order_ptr.store(nullptr, std::memory_order_relaxed);
    }
    
    // Initialize symbols array
    for (auto& symbol_info : symbols_) {
        symbol_info.order_book = nullptr;
        symbol_info.routing_destination = OrderDestination::INTERNAL_BOOK;
        std::memset(symbol_info.symbol, 0, sizeof(symbol_info.symbol));
    }
    
    // Initialize user risk info array
    for (auto& user_info : user_risk_info_) {
        user_info.user_id = 0;
        user_info.active = false;
        user_info.current_position_value.store(0, std::memory_order_relaxed);
        user_info.active_order_count.store(0, std::memory_order_relaxed);
    }
}

OrderExecutionResult OrderManagementSystem::submit_order(uint64_t order_id, const char* symbol, 
                                                        OrderSide side, uint32_t quantity, 
                                                        uint64_t price, uint32_t user_id) noexcept {
    LatencyMeasurement measurement(latency_tracker_);
    orders_submitted_.fetch_add(1, std::memory_order_relaxed);
    
    OrderExecutionResult result{};
    result.order_id = order_id;
    result.executed_quantity = 0;
    result.executed_price = 0;
    result.timestamp_nanos = LatencyTracker::now_nanos();
    result.final_status = OrderStatus::REJECTED;
    
    // Validate order
    {
        LatencyMeasurement validation_measurement(validation_latency_tracker_);
        result.validation_result = validate_order(order_id, symbol, side, quantity, price, user_id);
    }
    
    if (result.validation_result != OrderValidationResult::VALID) {
        orders_rejected_.fetch_add(1, std::memory_order_relaxed);
        validation_errors_.fetch_add(1, std::memory_order_relaxed);
        return result;
    }
    
    // Allocate order from pool
    Order* order = allocator_.allocate<Order>();
    if (!order) {
        result.validation_result = OrderValidationResult::RISK_LIMIT_EXCEEDED;
        orders_rejected_.fetch_add(1, std::memory_order_relaxed);
        return result;
    }
    
    // Initialize order
    new (order) Order(order_id, price, quantity, side, user_id, symbol, result.timestamp_nanos);
    
    // Find or create order book for symbol
    LockFreeOrderBook* order_book = get_order_book(symbol);
    if (!order_book) {
        order_book = add_symbol(symbol);
        if (!order_book) {
            result.validation_result = OrderValidationResult::INVALID_SYMBOL;
            orders_rejected_.fetch_add(1, std::memory_order_relaxed);
            return result;
        }
    }
    
    // Allocate order slot for tracking
    size_t slot = allocate_order_slot();
    if (slot >= MAX_ACTIVE_ORDERS) {
        result.validation_result = OrderValidationResult::RISK_LIMIT_EXCEEDED;
        orders_rejected_.fetch_add(1, std::memory_order_relaxed);
        return result;
    }
    
    // Store order in tracking array
    active_orders_[slot].store(order, std::memory_order_release);
    
    // Execute order
    {
        LatencyMeasurement execution_measurement(execution_latency_tracker_);
        
        // Check routing destination
        size_t symbol_index = find_symbol_index(symbol);
        if (symbol_index < symbol_count_.load() && 
            symbols_[symbol_index].routing_destination != OrderDestination::INTERNAL_BOOK) {
            result = route_order_external(order, symbols_[symbol_index].routing_destination);
        } else {
            result = execute_order_internal(order, order_book);
        }
    }
    
    // Update user risk tracking
    size_t user_index = find_user_index(user_id);
    if (user_index < MAX_USERS && user_risk_info_[user_index].active) {
        user_risk_info_[user_index].active_order_count.fetch_add(1, std::memory_order_relaxed);
        if (result.executed_quantity > 0) {
            uint64_t executed_value = result.executed_quantity * result.executed_price;
            user_risk_info_[user_index].current_position_value.fetch_add(executed_value, std::memory_order_relaxed);
        }
    }
    
    if (result.executed_quantity > 0) {
        orders_executed_.fetch_add(1, std::memory_order_relaxed);
    }
    
    return result;
}

bool OrderManagementSystem::cancel_order(uint64_t order_id) noexcept {
    LatencyMeasurement measurement(latency_tracker_);
    
    // Find order in active orders
    for (size_t i = 0; i < MAX_ACTIVE_ORDERS; ++i) {
        Order* order = active_orders_[i].load(std::memory_order_acquire);
        if (order && order->id.load(std::memory_order_acquire) == order_id) {
            
            // Check if order can be cancelled
            OrderStatus current_status = order->status.load(std::memory_order_acquire);
            if (current_status == OrderStatus::FILLED || current_status == OrderStatus::CANCELLED) {
                return false;
            }
            
            // Try to cancel order atomically
            OrderStatus expected = OrderStatus::ACTIVE;
            if (order->status.compare_exchange_strong(expected, OrderStatus::CANCELLED, 
                                                    std::memory_order_acq_rel)) {
                
                // Find order book and remove order
                LockFreeOrderBook* order_book = get_order_book(order->symbol);
                if (order_book) {
                    order_book->cancel_order(order_id);
                }
                
                // Deallocate order slot
                active_orders_[i].store(nullptr, std::memory_order_release);
                deallocate_order_slot(i);
                
                orders_cancelled_.fetch_add(1, std::memory_order_relaxed);
                return true;
            }
        }
    }
    
    return false;
}

bool OrderManagementSystem::modify_order(uint64_t order_id, uint32_t new_quantity, uint64_t new_price) noexcept {
    LatencyMeasurement measurement(latency_tracker_);
    
    // Find order in active orders
    for (size_t i = 0; i < MAX_ACTIVE_ORDERS; ++i) {
        Order* order = active_orders_[i].load(std::memory_order_acquire);
        if (order && order->id.load(std::memory_order_acquire) == order_id) {
            
            // Check if order can be modified
            OrderStatus current_status = order->status.load(std::memory_order_acquire);
            if (current_status != OrderStatus::ACTIVE) {
                return false;
            }
            
            // Update quantity if specified
            if (new_quantity > 0) {
                order->quantity.store(new_quantity, std::memory_order_release);
            }
            
            // Update price if specified
            if (new_price > 0) {
                order->price.store(new_price, std::memory_order_release);
            }
            
            return true;
        }
    }
    
    return false;
}

const Order* OrderManagementSystem::get_order_status(uint64_t order_id) const noexcept {
    // Find order in active orders
    for (size_t i = 0; i < MAX_ACTIVE_ORDERS; ++i) {
        Order* order = active_orders_[i].load(std::memory_order_acquire);
        if (order && order->id.load(std::memory_order_acquire) == order_id) {
            return order;
        }
    }
    
    return nullptr;
}

void OrderManagementSystem::set_risk_parameters(uint32_t user_id, const RiskParameters& params) noexcept {
    size_t user_index = find_user_index(user_id);
    if (user_index >= MAX_USERS) {
        user_index = add_user_internal(user_id);
    }
    
    if (user_index < MAX_USERS) {
        user_risk_info_[user_index].user_id = user_id;
        user_risk_info_[user_index].params = params;
        user_risk_info_[user_index].active = true;
        user_risk_info_[user_index].current_position_value.store(0, std::memory_order_relaxed);
        user_risk_info_[user_index].active_order_count.store(0, std::memory_order_relaxed);
    }
}

LockFreeOrderBook* OrderManagementSystem::add_symbol(const char* symbol) noexcept {
    if (!symbol || std::strlen(symbol) >= 16) {
        return nullptr;
    }
    
    size_t index = add_symbol_internal(symbol);
    if (index >= MAX_SYMBOLS) {
        return nullptr;
    }
    
    // Allocate order book from pool
    LockFreeOrderBook* order_book = allocator_.allocate<LockFreeOrderBook>();
    if (!order_book) {
        return nullptr;
    }
    
    // Initialize order book
    new (order_book) LockFreeOrderBook();
    
    // Store in symbols array
    symbols_[index].order_book = order_book;
    symbols_[index].routing_destination = OrderDestination::INTERNAL_BOOK;
    std::strncpy(symbols_[index].symbol, symbol, sizeof(symbols_[index].symbol) - 1);
    symbols_[index].symbol[sizeof(symbols_[index].symbol) - 1] = '\0';
    
    return order_book;
}

LockFreeOrderBook* OrderManagementSystem::get_order_book(const char* symbol) const noexcept {
    size_t index = find_symbol_index(symbol);
    if (index < symbol_count_.load(std::memory_order_acquire)) {
        return symbols_[index].order_book;
    }
    return nullptr;
}

void OrderManagementSystem::set_routing_destination(const char* symbol, OrderDestination destination) noexcept {
    size_t index = find_symbol_index(symbol);
    if (index < symbol_count_.load(std::memory_order_acquire)) {
        symbols_[index].routing_destination = destination;
    }
}

OrderManagementSystem::PerformanceStats OrderManagementSystem::get_performance_stats() const noexcept {
    PerformanceStats stats{};
    
    stats.orders_submitted = orders_submitted_.load(std::memory_order_relaxed);
    stats.orders_executed = orders_executed_.load(std::memory_order_relaxed);
    stats.orders_cancelled = orders_cancelled_.load(std::memory_order_relaxed);
    stats.orders_rejected = orders_rejected_.load(std::memory_order_relaxed);
    stats.validation_errors = validation_errors_.load(std::memory_order_relaxed);
    
    stats.validation_latency = validation_latency_tracker_.get_stats();
    stats.execution_latency = execution_latency_tracker_.get_stats();
    
    return stats;
}

void OrderManagementSystem::reset_stats() noexcept {
    orders_submitted_.store(0, std::memory_order_relaxed);
    orders_executed_.store(0, std::memory_order_relaxed);
    orders_cancelled_.store(0, std::memory_order_relaxed);
    orders_rejected_.store(0, std::memory_order_relaxed);
    validation_errors_.store(0, std::memory_order_relaxed);
    
    validation_latency_tracker_.reset();
    execution_latency_tracker_.reset();
}

// Private helper methods

OrderValidationResult OrderManagementSystem::validate_order(uint64_t order_id, const char* symbol, 
                                                           OrderSide side, uint32_t quantity, 
                                                           uint64_t price, uint32_t user_id) noexcept {
    // Check for duplicate order ID
    if (check_duplicate_order_id(order_id)) {
        return OrderValidationResult::DUPLICATE_ORDER_ID;
    }
    
    // Validate symbol
    if (!symbol || std::strlen(symbol) == 0 || std::strlen(symbol) >= 16) {
        return OrderValidationResult::INVALID_SYMBOL;
    }
    
    // Validate quantity
    if (quantity == 0) {
        return OrderValidationResult::INVALID_QUANTITY;
    }
    
    // Validate price (0 is allowed for market orders)
    if (price > UINT64_MAX / 2) { // Sanity check for price
        return OrderValidationResult::INVALID_PRICE;
    }
    
    // Check user risk parameters
    size_t user_index = find_user_index(user_id);
    if (user_index < MAX_USERS && user_risk_info_[user_index].active) {
        const RiskParameters& params = user_risk_info_[user_index].params;
        
        // Check position size limit
        if (quantity > params.max_position_size) {
            return OrderValidationResult::POSITION_LIMIT_EXCEEDED;
        }
        
        // Check order value limit
        if (price > 0 && (static_cast<uint64_t>(quantity) * price) > params.max_order_value) {
            return OrderValidationResult::RISK_LIMIT_EXCEEDED;
        }
        
        // Check available funds for buy orders
        if (side == OrderSide::BUY && price > 0) {
            uint64_t required_funds = static_cast<uint64_t>(quantity) * price;
            if (required_funds > params.available_funds) {
                return OrderValidationResult::INSUFFICIENT_FUNDS;
            }
        }
        
        // Check short selling permission
        if (side == OrderSide::SELL && !params.allow_short_selling) {
            // In a real system, we'd check current position
            // For now, assume all sells are allowed
        }
    }
    
    return OrderValidationResult::VALID;
}

size_t OrderManagementSystem::find_symbol_index(const char* symbol) const noexcept {
    if (!symbol) return MAX_SYMBOLS;
    
    size_t count = symbol_count_.load(std::memory_order_acquire);
    for (size_t i = 0; i < count; ++i) {
        if (std::strcmp(symbols_[i].symbol, symbol) == 0) {
            return i;
        }
    }
    
    return MAX_SYMBOLS;
}

size_t OrderManagementSystem::add_symbol_internal(const char* symbol) noexcept {
    // Check if symbol already exists
    size_t existing_index = find_symbol_index(symbol);
    if (existing_index < MAX_SYMBOLS) {
        return existing_index;
    }
    
    // Add new symbol
    size_t current_count = symbol_count_.load(std::memory_order_acquire);
    if (current_count >= MAX_SYMBOLS) {
        return MAX_SYMBOLS;
    }
    
    // Try to increment symbol count atomically
    if (symbol_count_.compare_exchange_weak(current_count, current_count + 1, std::memory_order_acq_rel)) {
        return current_count;
    }
    
    return MAX_SYMBOLS;
}

bool OrderManagementSystem::check_duplicate_order_id(uint64_t order_id) const noexcept {
    for (size_t i = 0; i < MAX_ACTIVE_ORDERS; ++i) {
        Order* order = active_orders_[i].load(std::memory_order_acquire);
        if (order && order->id.load(std::memory_order_acquire) == order_id) {
            return true;
        }
    }
    return false;
}

size_t OrderManagementSystem::allocate_order_slot() noexcept {
    // Simple linear search for empty slot
    for (size_t i = 0; i < MAX_ACTIVE_ORDERS; ++i) {
        Order* expected = nullptr;
        if (active_orders_[i].compare_exchange_weak(expected, reinterpret_cast<Order*>(1), 
                                                   std::memory_order_acq_rel)) {
            return i;
        }
    }
    return MAX_ACTIVE_ORDERS;
}

void OrderManagementSystem::deallocate_order_slot(size_t slot) noexcept {
    if (slot < MAX_ACTIVE_ORDERS) {
        active_orders_[slot].store(nullptr, std::memory_order_release);
    }
}

OrderExecutionResult OrderManagementSystem::execute_order_internal(Order* order, LockFreeOrderBook* order_book) noexcept {
    OrderExecutionResult result{};
    result.order_id = order->id.load(std::memory_order_acquire);
    result.timestamp_nanos = LatencyTracker::now_nanos();
    result.validation_result = OrderValidationResult::VALID;
    
    // Try to match order against existing orders
    uint32_t matched_quantity = order_book->match_order(order);
    
    if (matched_quantity > 0) {
        result.executed_quantity = matched_quantity;
        result.executed_price = order->price.load(std::memory_order_acquire);
        result.final_status = (matched_quantity == order->quantity.load()) ? 
                             OrderStatus::FILLED : OrderStatus::ACTIVE;
    } else {
        // No match, add to order book
        if (order_book->add_order(order)) {
            result.executed_quantity = 0;
            result.executed_price = 0;
            result.final_status = OrderStatus::ACTIVE;
        } else {
            result.executed_quantity = 0;
            result.executed_price = 0;
            result.final_status = OrderStatus::REJECTED;
        }
    }
    
    return result;
}

OrderExecutionResult OrderManagementSystem::route_order_external(Order* order, OrderDestination destination) noexcept {
    // Placeholder for external routing
    // In a real system, this would route to external exchanges
    
    OrderExecutionResult result{};
    result.order_id = order->id.load(std::memory_order_acquire);
    result.executed_quantity = 0;
    result.executed_price = 0;
    result.timestamp_nanos = LatencyTracker::now_nanos();
    result.final_status = OrderStatus::ACTIVE; // Assume order is sent to external venue
    result.validation_result = OrderValidationResult::VALID;
    
    // Mark order as routed externally
    order->status.store(OrderStatus::ACTIVE, std::memory_order_release);
    
    return result;
}

size_t OrderManagementSystem::find_user_index(uint32_t user_id) const noexcept {
    size_t count = user_count_.load(std::memory_order_acquire);
    for (size_t i = 0; i < count && i < MAX_USERS; ++i) {
        if (user_risk_info_[i].active && user_risk_info_[i].user_id == user_id) {
            return i;
        }
    }
    return MAX_USERS;
}

size_t OrderManagementSystem::add_user_internal(uint32_t user_id) noexcept {
    size_t current_count = user_count_.load(std::memory_order_acquire);
    if (current_count >= MAX_USERS) {
        return MAX_USERS;
    }
    
    // Try to increment user count atomically
    if (user_count_.compare_exchange_weak(current_count, current_count + 1, std::memory_order_acq_rel)) {
        return current_count;
    }
    
    return MAX_USERS;
}

} // namespace tradeflow