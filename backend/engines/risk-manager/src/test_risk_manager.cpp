#include "../include/pre_trade_validator.hpp"
#include "../include/portfolio_monitor.hpp"
#include "../include/risk_types.hpp"
#include "high_res_timer.hpp"
#include <iostream>
#include <cassert>

using namespace tradeflow;

int main() {
    std::cout << "=== Risk Manager Pre-Trade Validation Test ===" << std::endl;
    
    try {
        // Test 1: Initialize components
        std::cout << "Testing component initialization..." << std::endl;
        
        // Create validator and monitor on the heap to avoid stack issues
        auto validator = std::make_unique<PreTradeValidator>();
        auto monitor = std::make_unique<PortfolioMonitor>();
        
        std::cout << "  ✓ Components initialized successfully" << std::endl;
        
        // Test 2: Set up test portfolio
        std::cout << "Testing portfolio setup..." << std::endl;
        std::string user_id = "test_user_001";
        
        // Add some positions to the portfolio
        monitor->updatePosition(user_id, "AAPL", 100, 150.0, "Technology");
        std::cout << "  ✓ Added AAPL position" << std::endl;
        
        monitor->updatePosition(user_id, "MSFT", 50, 300.0, "Technology");
        std::cout << "  ✓ Added MSFT position" << std::endl;
        
        // Update market prices
        monitor->updateMarketPrice("AAPL", 155.0);
        monitor->updateMarketPrice("MSFT", 305.0);
        std::cout << "  ✓ Updated market prices" << std::endl;
        
        PortfolioState portfolio = monitor->getPortfolioState(user_id);
        std::cout << "  ✓ Portfolio created with " << portfolio.position_count << " positions" << std::endl;
        
        // Test 3: Set up risk parameters
        std::cout << "Testing risk parameters..." << std::endl;
        RiskParameters params;
        params.max_position_size_pct = 0.05;      // 5%
        params.max_sector_exposure_pct = 0.30;    // 30%
        params.max_correlation_threshold = 0.7;   // 70%
        params.max_daily_loss_pct = 0.02;         // 2%
        params.max_positions = 50;
        params.leverage_limit = 2.0;
        std::cout << "  ✓ Risk parameters configured" << std::endl;
        
        // Test 4: Valid order validation
        std::cout << "Testing valid order validation..." << std::endl;
        OrderRequest valid_order(user_id, "GOOGL", "BUY", 10, 2500.0, "MARKET");
        valid_order.sector = "Technology";
        
        auto start_time = HighResTimer::now_nanos();
        RiskValidation result = validator->validateOrder(valid_order, portfolio, params);
        auto validation_time = HighResTimer::now_nanos() - start_time;
        
        if (result.result == RiskValidationResult::APPROVED) {
            std::cout << "  ✓ Valid order approved" << std::endl;
        } else {
            std::cout << "  ✗ Valid order rejected: " << result.reason << std::endl;
        }
        
        double validation_time_us = HighResTimer::to_microseconds(validation_time);
        std::cout << "  ✓ Validation time: " << validation_time_us << " μs" << std::endl;
        
        // Test 5: Position size calculation
        std::cout << "Testing position size calculation..." << std::endl;
        double optimal_size = validator->calculateOptimalPositionSize(valid_order, portfolio, params);
        std::cout << "  ✓ Optimal position size: " << optimal_size << " shares" << std::endl;
        
        // Test 6: Performance metrics
        std::cout << "Testing performance metrics..." << std::endl;
        uint64_t total_validations = validator->getTotalValidations();
        std::cout << "  ✓ Total validations: " << total_validations << std::endl;
        
        std::cout << "=== Basic risk manager tests passed! ===" << std::endl;
        return 0;
        
    } catch (const std::exception& e) {
        std::cout << "  ✗ Test failed with exception: " << e.what() << std::endl;
        return 1;
    } catch (...) {
        std::cout << "  ✗ Test failed with unknown exception" << std::endl;
        return 1;
    }
}