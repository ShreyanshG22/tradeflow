#include "../include/trading_allocator.hpp"
#include "../include/lock_free_order_book.hpp"
#include "../include/latency_tracker.hpp"
#include <iostream>
#include <cassert>
#include <thread>
#include <chrono>

using namespace tradeflow;

void test_trading_allocator() {
    std::cout << "Testing TradingAllocator..." << std::endl;
    
    TradingAllocator allocator;
    
    // Test basic allocation
    void* ptr1 = allocator.allocate(1024);
    if (ptr1 == nullptr) {
        std::cout << "  ERROR: Basic allocation failed" << std::endl;
        return;
    }
    
    // Test typed allocation
    int* int_ptr = allocator.allocate<int>(10);
    if (int_ptr == nullptr) {
        std::cout << "  ERROR: Typed allocation failed" << std::endl;
        return;
    }
    
    // Test statistics
    std::cout << "  Allocated: " << allocator.bytes_allocated() << " bytes" << std::endl;
    std::cout << "  Remaining: " << allocator.bytes_remaining() << " bytes" << std::endl;
    
    std::cout << "TradingAllocator tests passed!" << std::endl;
}

void test_latency_tracker() {
    std::cout << "Testing LatencyTracker..." << std::endl;
    
    LatencyTracker tracker;
    
    // Record some latencies
    for (int i = 0; i < 100; ++i) {
        uint64_t start = LatencyTracker::now_nanos();
        
        // Simulate some work
        volatile int dummy = 0;
        for (int j = 0; j < 10; ++j) {
            dummy += j;
        }
        
        uint64_t end = LatencyTracker::now_nanos();
        tracker.record_latency(start, end);
    }
    
    // Get statistics
    auto stats = tracker.get_stats();
    
    std::cout << "  Count: " << stats.count << std::endl;
    std::cout << "  Min: " << stats.min_nanos << " ns" << std::endl;
    std::cout << "  Max: " << stats.max_nanos << " ns" << std::endl;
    std::cout << "  Avg: " << stats.avg_nanos << " ns (" << stats.avg_micros << " μs)" << std::endl;
    
    std::cout << "LatencyTracker tests passed!" << std::endl;
}

void test_lock_free_order_book() {
    std::cout << "Testing LockFreeOrderBook..." << std::endl;
    
    LockFreeOrderBook order_book;
    TradingAllocator allocator;
    
    // Create test orders
    Order* buy_order = allocator.allocate<Order>();
    if (buy_order == nullptr) {
        std::cout << "  ERROR: Failed to allocate buy order" << std::endl;
        return;
    }
    
    // Use placement new to initialize the order
    new (buy_order) Order(1, 10000, 100, OrderSide::BUY, 1, "AAPL", LatencyTracker::now_nanos());
    
    // Add orders to book
    bool added1 = order_book.add_order(buy_order);
    std::cout << "  Buy order added: " << (added1 ? "YES" : "NO") << std::endl;
    
    // Check best bid/ask
    auto best_bid = order_book.get_best_bid();
    auto best_ask = order_book.get_best_ask();
    
    std::cout << "  Best bid: " << best_bid.first << " @ " << best_bid.second << std::endl;
    std::cout << "  Best ask: " << best_ask.first << " @ " << best_ask.second << std::endl;
    
    // Get statistics
    auto stats = order_book.get_stats();
    std::cout << "  Total bid orders: " << stats.total_bid_orders << std::endl;
    std::cout << "  Total ask orders: " << stats.total_ask_orders << std::endl;
    
    std::cout << "LockFreeOrderBook tests passed!" << std::endl;
}

int main() {
    std::cout << "=== TradeFlow Core Infrastructure Tests ===" << std::endl;
    
    try {
        test_trading_allocator();
        std::cout << std::endl;
        
        test_latency_tracker();
        std::cout << std::endl;
        
        test_lock_free_order_book();
        std::cout << std::endl;
        
        std::cout << "=== All tests passed! ===" << std::endl;
        
    } catch (const std::exception& e) {
        std::cerr << "Test failed with exception: " << e.what() << std::endl;
        return 1;
    } catch (...) {
        std::cerr << "Test failed with unknown exception" << std::endl;
        return 1;
    }
    
    return 0;
}