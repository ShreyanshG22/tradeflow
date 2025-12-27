#include "../include/lock_free_order_book.hpp"
#include <algorithm>
#include <cstring>

namespace tradeflow {

LockFreeOrderBook::LockFreeOrderBook() {
    // Initialize price levels
    for (auto& level : bid_levels_) {
        level.price.store(0, std::memory_order_relaxed);
        level.total_quantity.store(0, std::memory_order_relaxed);
        level.order_count.store(0, std::memory_order_relaxed);
        level.first_order.store(nullptr, std::memory_order_relaxed);
    }
    
    for (auto& level : ask_levels_) {
        level.price.store(0, std::memory_order_relaxed);
        level.total_quantity.store(0, std::memory_order_relaxed);
        level.order_count.store(0, std::memory_order_relaxed);
        level.first_order.store(nullptr, std::memory_order_relaxed);
    }
}

bool LockFreeOrderBook::add_order(Order* order) noexcept {
    if (!order || order->quantity.load() == 0) {
        return false;
    }
    
    // Set order status to active
    order->status.store(OrderStatus::ACTIVE, std::memory_order_release);
    
    // Get price levels array based on order side
    auto& levels = (order->side == OrderSide::BUY) ? bid_levels_ : ask_levels_;
    auto& level_count = (order->side == OrderSide::BUY) ? bid_level_count_ : ask_level_count_;
    
    uint64_t price = order->price.load(std::memory_order_acquire);
    
    // Find or create price level
    size_t level_index = find_price_level(levels, level_count.load(), price);
    
    if (level_index >= MAX_PRICE_LEVELS) {
        // Need to insert new price level
        level_index = insert_price_level(levels, level_count, price);
        if (level_index >= MAX_PRICE_LEVELS) {
            order->status.store(OrderStatus::REJECTED, std::memory_order_release);
            return false;
        }
    }
    
    // Insert order at the price level
    if (!insert_order_at_level(levels[level_index], order)) {
        order->status.store(OrderStatus::REJECTED, std::memory_order_release);
        return false;
    }
    
    // Increment sequence number for book updates
    sequence_number_.fetch_add(1, std::memory_order_acq_rel);
    
    return true;
}

bool LockFreeOrderBook::cancel_order(uint64_t order_id) noexcept {
    // Search in both bid and ask levels
    for (auto& level : bid_levels_) {
        if (remove_order_from_level(level, order_id)) {
            sequence_number_.fetch_add(1, std::memory_order_acq_rel);
            return true;
        }
    }
    
    for (auto& level : ask_levels_) {
        if (remove_order_from_level(level, order_id)) {
            sequence_number_.fetch_add(1, std::memory_order_acq_rel);
            return true;
        }
    }
    
    return false;
}

std::pair<uint64_t, uint32_t> LockFreeOrderBook::get_best_bid() const noexcept {
    uint64_t best_price = 0;
    uint32_t best_quantity = 0;
    
    uint32_t count = bid_level_count_.load(std::memory_order_acquire);
    
    for (size_t i = 0; i < count && i < MAX_PRICE_LEVELS; ++i) {
        uint64_t price = bid_levels_[i].price.load(std::memory_order_acquire);
        uint32_t quantity = bid_levels_[i].total_quantity.load(std::memory_order_acquire);
        
        if (quantity > 0 && price > best_price) {
            best_price = price;
            best_quantity = quantity;
        }
    }
    
    return {best_price, best_quantity};
}

std::pair<uint64_t, uint32_t> LockFreeOrderBook::get_best_ask() const noexcept {
    uint64_t best_price = UINT64_MAX;
    uint32_t best_quantity = 0;
    
    uint32_t count = ask_level_count_.load(std::memory_order_acquire);
    
    for (size_t i = 0; i < count && i < MAX_PRICE_LEVELS; ++i) {
        uint64_t price = ask_levels_[i].price.load(std::memory_order_acquire);
        uint32_t quantity = ask_levels_[i].total_quantity.load(std::memory_order_acquire);
        
        if (quantity > 0 && price < best_price) {
            best_price = price;
            best_quantity = quantity;
        }
    }
    
    return best_price == UINT64_MAX ? std::make_pair(0ULL, 0U) : std::make_pair(best_price, best_quantity);
}

size_t LockFreeOrderBook::get_market_depth(PriceLevel* levels, size_t max_levels, OrderSide side) const noexcept {
    if (!levels || max_levels == 0) {
        return 0;
    }
    
    const auto& book_levels = (side == OrderSide::BUY) ? bid_levels_ : ask_levels_;
    const auto& level_count = (side == OrderSide::BUY) ? bid_level_count_ : ask_level_count_;
    
    uint32_t count = level_count.load(std::memory_order_acquire);
    size_t copied = 0;
    
    for (size_t i = 0; i < count && i < MAX_PRICE_LEVELS && copied < max_levels; ++i) {
        uint32_t quantity = book_levels[i].total_quantity.load(std::memory_order_acquire);
        if (quantity > 0) {
            levels[copied].price.store(book_levels[i].price.load(std::memory_order_acquire));
            levels[copied].total_quantity.store(quantity);
            levels[copied].order_count.store(book_levels[i].order_count.load(std::memory_order_acquire));
            levels[copied].first_order.store(book_levels[i].first_order.load(std::memory_order_acquire));
            ++copied;
        }
    }
    
    return copied;
}

uint32_t LockFreeOrderBook::match_order(Order* incoming_order) noexcept {
    if (!incoming_order || incoming_order->quantity.load() == 0) {
        return 0;
    }
    
    uint32_t matched_quantity = 0;
    uint32_t remaining_quantity = incoming_order->quantity.load();
    
    // Get opposite side levels for matching
    auto& levels = (incoming_order->side == OrderSide::BUY) ? ask_levels_ : bid_levels_;
    uint32_t count = (incoming_order->side == OrderSide::BUY) ? 
                     ask_level_count_.load(std::memory_order_acquire) :
                     bid_level_count_.load(std::memory_order_acquire);
    
    uint64_t incoming_price = incoming_order->price.load();
    
    // Simple matching logic - match against best levels
    for (size_t i = 0; i < count && i < MAX_PRICE_LEVELS && remaining_quantity > 0; ++i) {
        uint64_t level_price = levels[i].price.load(std::memory_order_acquire);
        uint32_t level_quantity = levels[i].total_quantity.load(std::memory_order_acquire);
        
        if (level_quantity == 0) continue;
        
        // Check if prices cross
        bool can_match = (incoming_order->side == OrderSide::BUY) ? 
                        (incoming_price >= level_price) : 
                        (incoming_price <= level_price);
        
        if (!can_match) continue;
        
        // Calculate match quantity
        uint32_t match_qty = std::min(remaining_quantity, level_quantity);
        
        // Update quantities atomically
        uint32_t old_level_qty = levels[i].total_quantity.fetch_sub(match_qty, std::memory_order_acq_rel);
        if (old_level_qty >= match_qty) {
            matched_quantity += match_qty;
            remaining_quantity -= match_qty;
            
            // Update incoming order filled quantity
            incoming_order->filled_quantity.fetch_add(match_qty, std::memory_order_acq_rel);
        }
    }
    
    // Update order status based on fill
    if (matched_quantity > 0) {
        if (remaining_quantity == 0) {
            incoming_order->status.store(OrderStatus::FILLED, std::memory_order_release);
        }
        sequence_number_.fetch_add(1, std::memory_order_acq_rel);
    }
    
    return matched_quantity;
}

LockFreeOrderBook::BookStats LockFreeOrderBook::get_stats() const noexcept {
    BookStats stats{};
    
    // Count bid statistics
    uint32_t bid_count = bid_level_count_.load(std::memory_order_acquire);
    for (size_t i = 0; i < bid_count && i < MAX_PRICE_LEVELS; ++i) {
        uint32_t quantity = bid_levels_[i].total_quantity.load(std::memory_order_acquire);
        uint32_t orders = bid_levels_[i].order_count.load(std::memory_order_acquire);
        
        if (quantity > 0) {
            stats.total_bid_quantity += quantity;
            stats.total_bid_orders += orders;
            stats.bid_levels++;
        }
    }
    
    // Count ask statistics
    uint32_t ask_count = ask_level_count_.load(std::memory_order_acquire);
    for (size_t i = 0; i < ask_count && i < MAX_PRICE_LEVELS; ++i) {
        uint32_t quantity = ask_levels_[i].total_quantity.load(std::memory_order_acquire);
        uint32_t orders = ask_levels_[i].order_count.load(std::memory_order_acquire);
        
        if (quantity > 0) {
            stats.total_ask_quantity += quantity;
            stats.total_ask_orders += orders;
            stats.ask_levels++;
        }
    }
    
    return stats;
}

void LockFreeOrderBook::clear() noexcept {
    // Reset all levels
    for (auto& level : bid_levels_) {
        level.price.store(0, std::memory_order_relaxed);
        level.total_quantity.store(0, std::memory_order_relaxed);
        level.order_count.store(0, std::memory_order_relaxed);
        level.first_order.store(nullptr, std::memory_order_relaxed);
    }
    
    for (auto& level : ask_levels_) {
        level.price.store(0, std::memory_order_relaxed);
        level.total_quantity.store(0, std::memory_order_relaxed);
        level.order_count.store(0, std::memory_order_relaxed);
        level.first_order.store(nullptr, std::memory_order_relaxed);
    }
    
    bid_level_count_.store(0, std::memory_order_relaxed);
    ask_level_count_.store(0, std::memory_order_relaxed);
    sequence_number_.store(0, std::memory_order_relaxed);
}

// Private helper methods

bool LockFreeOrderBook::insert_order_at_level(PriceLevel& level, Order* order) noexcept {
    // Simplified insertion - just update quantities
    uint32_t order_qty = order->quantity.load(std::memory_order_acquire);
    
    level.total_quantity.fetch_add(order_qty, std::memory_order_acq_rel);
    level.order_count.fetch_add(1, std::memory_order_acq_rel);
    
    // For simplicity, we're not maintaining the linked list of orders at each level
    // In a production system, you'd want to maintain order priority within each level
    
    return true;
}

bool LockFreeOrderBook::remove_order_from_level(PriceLevel& level, uint64_t order_id) noexcept {
    // Simplified removal - this would need to search through orders at the level
    // For now, we'll just return false as we're not maintaining order lists
    return false;
}

size_t LockFreeOrderBook::find_price_level(const std::array<PriceLevel, MAX_PRICE_LEVELS>& levels,
                                          uint32_t level_count, uint64_t price) const noexcept {
    for (size_t i = 0; i < level_count && i < MAX_PRICE_LEVELS; ++i) {
        if (levels[i].price.load(std::memory_order_acquire) == price) {
            return i;
        }
    }
    return MAX_PRICE_LEVELS; // Not found
}

size_t LockFreeOrderBook::insert_price_level(std::array<PriceLevel, MAX_PRICE_LEVELS>& levels,
                                            std::atomic<uint32_t>& level_count, uint64_t price) noexcept {
    uint32_t current_count = level_count.load(std::memory_order_acquire);
    
    if (current_count >= MAX_PRICE_LEVELS) {
        return MAX_PRICE_LEVELS; // No space
    }
    
    // Try to increment level count atomically
    if (level_count.compare_exchange_weak(current_count, current_count + 1, std::memory_order_acq_rel)) {
        // Successfully reserved a slot
        levels[current_count].price.store(price, std::memory_order_release);
        return current_count;
    }
    
    return MAX_PRICE_LEVELS; // Failed to reserve slot
}

} // namespace tradeflow