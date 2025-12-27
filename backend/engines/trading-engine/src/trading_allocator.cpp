#include "../include/trading_allocator.hpp"
#include <algorithm>
#include <cstring>

namespace tradeflow {

TradingAllocator::TradingAllocator() {
    // Initialize memory pool to zero
    std::memset(memory_pool_, 0, POOL_SIZE);
}

void* TradingAllocator::allocate(size_t size) noexcept {
    if (size == 0) {
        return nullptr;
    }
    
    // Align size to cache line boundary
    size_t aligned_size = align_size(size);
    
    // Atomic fetch-and-add for lock-free allocation
    size_t old_offset = offset_.fetch_add(aligned_size, std::memory_order_relaxed);
    
    // Check if allocation would exceed pool size
    if (old_offset + aligned_size > POOL_SIZE) {
        // Rollback the offset increment
        offset_.fetch_sub(aligned_size, std::memory_order_relaxed);
        return nullptr;
    }
    
    return memory_pool_ + old_offset;
}

void TradingAllocator::reset() noexcept {
    offset_.store(0, std::memory_order_relaxed);
}

size_t TradingAllocator::bytes_allocated() const noexcept {
    return offset_.load(std::memory_order_relaxed);
}

size_t TradingAllocator::bytes_remaining() const noexcept {
    size_t allocated = bytes_allocated();
    return allocated < POOL_SIZE ? POOL_SIZE - allocated : 0;
}

bool TradingAllocator::is_exhausted() const noexcept {
    return bytes_remaining() < ALIGNMENT;
}

size_t TradingAllocator::align_size(size_t size) noexcept {
    return (size + ALIGNMENT - 1) & ~(ALIGNMENT - 1);
}

} // namespace tradeflow