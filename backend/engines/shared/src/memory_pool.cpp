#include <cstddef>
#include <atomic>
#include <memory>

namespace tradeflow {

template<size_t PoolSize = 1024 * 1024 * 64> // 64MB default
class MemoryPool {
public:
    static MemoryPool& getInstance() {
        static MemoryPool instance;
        return instance;
    }
    
    template<typename T>
    T* allocate(size_t count = 1) noexcept {
        size_t size = sizeof(T) * count;
        size_t aligned_size = (size + 63) & ~63; // 64-byte alignment
        
        size_t old_offset = offset_.fetch_add(aligned_size, std::memory_order_relaxed);
        if (old_offset + aligned_size > PoolSize) {
            return nullptr; // Pool exhausted
        }
        
        return reinterpret_cast<T*>(memory_pool_ + old_offset);
    }
    
    void reset() noexcept {
        offset_.store(0, std::memory_order_relaxed);
    }
    
    size_t used() const noexcept {
        return offset_.load(std::memory_order_relaxed);
    }
    
    size_t available() const noexcept {
        return PoolSize - used();
    }

private:
    alignas(64) char memory_pool_[PoolSize];
    std::atomic<size_t> offset_{0};
    
    MemoryPool() = default;
};

} // namespace tradeflow