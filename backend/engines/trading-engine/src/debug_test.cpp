#include <iostream>

int main() {
    std::cout << "Debug test starting..." << std::endl;
    
    try {
        std::cout << "About to include headers..." << std::endl;
        
        #include "../include/trading_allocator.hpp"
        
        std::cout << "Headers included successfully" << std::endl;
        
        tradeflow::TradingAllocator allocator;
        std::cout << "Allocator created successfully" << std::endl;
        
    } catch (...) {
        std::cout << "Exception caught" << std::endl;
        return 1;
    }
    
    std::cout << "Debug test completed successfully" << std::endl;
    return 0;
}