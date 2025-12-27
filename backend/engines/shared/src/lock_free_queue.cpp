#include <atomic>
#include <memory>

namespace tradeflow {

template<typename T, size_t Capacity = 1024>
class LockFreeQueue {
public:
    LockFreeQueue() : head_(0), tail_(0) {}
    
    bool enqueue(const T& item) noexcept {
        size_t current_tail = tail_.load(std::memory_order_relaxed);
        size_t next_tail = (current_tail + 1) % Capacity;
        
        if (next_tail == head_.load(std::memory_order_acquire)) {
            return false; // Queue is full
        }
        
        buffer_[current_tail] = item;
        tail_.store(next_tail, std::memory_order_release);
        return true;
    }
    
    bool dequeue(T& item) noexcept {
        size_t current_head = head_.load(std::memory_order_relaxed);
        
        if (current_head == tail_.load(std::memory_order_acquire)) {
            return false; // Queue is empty
        }
        
        item = buffer_[current_head];
        head_.store((current_head + 1) % Capacity, std::memory_order_release);
        return true;
    }
    
    bool empty() const noexcept {
        return head_.load(std::memory_order_acquire) == 
               tail_.load(std::memory_order_acquire);
    }
    
    size_t size() const noexcept {
        size_t head = head_.load(std::memory_order_acquire);
        size_t tail = tail_.load(std::memory_order_acquire);
        return (tail >= head) ? (tail - head) : (Capacity - head + tail);
    }

private:
    alignas(64) std::atomic<size_t> head_;
    alignas(64) std::atomic<size_t> tail_;
    alignas(64) T buffer_[Capacity];
};

} // namespace tradeflow