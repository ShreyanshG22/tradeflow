#include "../include/order_management_system.hpp"
#include <iostream>

using namespace tradeflow;

int main() {
    std::cout << "=== Simple OMS Test ===" << std::endl;
    
    try {
        std::cout << "Creating allocator..." << std::endl;
        TradingAllocator allocator;
        
        std::cout << "Creating latency tracker..." << std::endl;
        LatencyTracker latency_tracker;
        
        std::cout << "Creating OMS..." << std::endl;
        OrderManagementSystem oms(allocator, latency_tracker);
        
        std::cout << "OMS created successfully!" << std::endl;
        
        // Test basic functionality
        std::cout << "Getting performance stats..." << std::endl;
        auto stats = oms.get_performance_stats();
        
        std::cout << "Orders submitted: " << stats.orders_submitted << std::endl;
        
        std::cout << "=== Simple OMS test passed! ===" << std::endl;
        
    } catch (const std::exception& e) {
        std::cerr << "Exception: " << e.what() << std::endl;
        return 1;
    } catch (...) {
        std::cerr << "Unknown exception" << std::endl;
        return 1;
    }
    
    return 0;
}