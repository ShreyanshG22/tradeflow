#pragma once

#include <atomic>
#include <cstddef>
#include <cstdint>
#include <memory>
#include <new>

namespace tradeflow {

/**
 * Ultra-low latency memory allocator for trading operations
 * Uses pre-allocated memory pools to avoid heap allocation during trading
 */
class TradingAllocator {
public:
    static constexpr size_t POOL_SIZE = 1024 * 1024 * 64; // 64MB pool
    static constexpr size_t ALIGNMENT = 64; // Cache line alignment
    
    TradingAllocator();
    ~TradingAllocator() = default;
    
    // Non-copyable, non-movable
    TradingAllocator(const TradingAllocator&) = delete;
    TradingAllocator& operator=(const TradingAllocator&) = delete;
    TradingAllocator(TradingAllocator&&) = delete;
    TradingAllocator& operator=(TradingAllocator&&) = delete;
    
    /**
     * Allocate memory from the pool (lock-free)
     * @param size Size in bytes to allocate
     * @return Pointer to allocated memory, nullptr if pool exhausted
     */
    void* allocate(size_t size) noexcept;
    
    /**
     * Typed allocation with automatic alignment
     */
    template<typename T>
    T* allocate(size_t count = 1) noexcept {
        size_t total_size = sizeof(T) * count;
        void* ptr = allocate(total_size);
        return static_cast<T*>(ptr);
    }
    
    /**
     * Reset the allocator (use only when no active allocations)
     */
    void reset() noexcept;
    
    /**
     * Get current usage statistics
     */
    size_t bytes_allocated() const noexcept;
    size_t bytes_remaining() const noexcept;
    bool is_exhausted() const noexcept;
    
private:
    alignas(ALIGNMENT) char memory_pool_[POOL_SIZE];
    std::atomic<size_t> offset_{0};
    
    static size_t align_size(size_t size) noexcept;
};

/**
 * RAII wrapper for trading allocator
 */
template<typename T>
class TradingPtr {
public:
    explicit TradingPtr(T* ptr = nullptr) noexcept : ptr_(ptr) {}
    
    ~TradingPtr() = default; // No deallocation needed for pool allocator
    
    // Move semantics only
    TradingPtr(const TradingPtr&) = delete;
    TradingPtr& operator=(const TradingPtr&) = delete;
    
    TradingPtr(TradingPtr&& other) noexcept : ptr_(other.ptr_) {
        other.ptr_ = nullptr;
    }
    
    TradingPtr& operator=(TradingPtr&& other) noexcept {
        if (this != &other) {
            ptr_ = other.ptr_;
            other.ptr_ = nullptr;
        }
        return *this;
    }
    
    T* get() const noexcept { return ptr_; }
    T& operator*() const noexcept { return *ptr_; }
    T* operator->() const noexcept { return ptr_; }
    
    explicit operator bool() const noexcept { return ptr_ != nullptr; }
    
    T* release() noexcept {
        T* tmp = ptr_;
        ptr_ = nullptr;
        return tmp;
    }
    
private:
    T* ptr_;
};

} // namespace tradeflow