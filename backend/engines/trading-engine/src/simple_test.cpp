#include "../include/trading_allocator.hpp"
#include "../include/latency_tracker.hpp"
#include <iostream>

using namespace tradeflow;

int main() {
    std::cout << "=== Simple Core Infrastructure Test ===" << std::endl;
    
    // Test 1: TradingAllocator
    std::cout << "Testing TradingAllocator..." << std::endl;
    TradingAllocator allocator;
    
    void* ptr = allocator.allocate(1024);
    if (ptr) {
        std::cout << "  ✓ Allocation successful" << std::endl;
        std::cout << "  ✓ Allocated: " << allocator.bytes_allocated() << " bytes" << std::endl;
    } else {
        std::cout << "  ✗ Allocation failed" << std::endl;
        return 1;
    }
    
    // Test 2: LatencyTracker
    std::cout << "Testing LatencyTracker..." << std::endl;
    LatencyTracker tracker;
    
    uint64_t start = LatencyTracker::now_nanos();
    volatile int dummy = 0;
    for (int i = 0; i < 1000; ++i) {
        dummy += i;
    }
    uint64_t end = LatencyTracker::now_nanos();
    
    tracker.record_latency(start, end);
    
    auto stats = tracker.get_stats();
    if (stats.count == 1) {
        std::cout << "  ✓ Latency tracking successful" << std::endl;
        std::cout << "  ✓ Recorded latency: " << stats.min_nanos << " ns" << std::endl;
    } else {
        std::cout << "  ✗ Latency tracking failed" << std::endl;
        return 1;
    }
    
    std::cout << "=== All basic tests passed! ===" << std::endl;
    return 0;
}