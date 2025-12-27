#include "../include/order_management_system.hpp"
#include <iostream>
#include <cassert>

using namespace tradeflow;

void test_order_submission() {
    std::cout << "Testing order submission..." << std::endl;
    
    TradingAllocator allocator;
    LatencyTracker latency_tracker;
    OrderManagementSystem oms(allocator, latency_tracker);
    
    // Set up risk parameters for user
    RiskParameters risk_params{};
    risk_params.max_position_size = 1000;
    risk_params.max_order_value = 100000;
    risk_params.available_funds = 50000;
    risk_params.max_portfolio_exposure = 0.5;
    risk_params.allow_short_selling = true;
    
    oms.set_risk_parameters(1, risk_params);
    
    // Submit a valid buy order
    auto result = oms.submit_order(1001, "AAPL", OrderSide::BUY, 100, 15000, 1);
    
    std::cout << "  Order ID: " << result.order_id << std::endl;
    std::cout << "  Validation result: " << static_cast<int>(result.validation_result) << std::endl;
    std::cout << "  Final status: " << static_cast<int>(result.final_status) << std::endl;
    std::cout << "  Executed quantity: " << result.executed_quantity << std::endl;
    
    if (result.validation_result == OrderValidationResult::VALID) {
        std::cout << "  ✓ Order submitted successfully" << std::endl;
    } else {
        std::cout << "  ✗ Order submission failed" << std::endl;
    }
}

void test_order_cancellation() {
    std::cout << "Testing order cancellation..." << std::endl;
    
    TradingAllocator allocator;
    LatencyTracker latency_tracker;
    OrderManagementSystem oms(allocator, latency_tracker);
    
    // Set up risk parameters
    RiskParameters risk_params{};
    risk_params.max_position_size = 1000;
    risk_params.max_order_value = 100000;
    risk_params.available_funds = 50000;
    risk_params.allow_short_selling = true;
    
    oms.set_risk_parameters(1, risk_params);
    
    // Submit an order
    auto result = oms.submit_order(2001, "MSFT", OrderSide::BUY, 50, 30000, 1);
    
    if (result.validation_result == OrderValidationResult::VALID) {
        std::cout << "  Order submitted for cancellation test" << std::endl;
        
        // Try to cancel the order
        bool cancelled = oms.cancel_order(2001);
        
        if (cancelled) {
            std::cout << "  ✓ Order cancelled successfully" << std::endl;
        } else {
            std::cout << "  ✗ Order cancellation failed" << std::endl;
        }
        
        // Try to cancel again (should fail)
        bool cancelled_again = oms.cancel_order(2001);
        if (!cancelled_again) {
            std::cout << "  ✓ Duplicate cancellation correctly rejected" << std::endl;
        } else {
            std::cout << "  ✗ Duplicate cancellation should have failed" << std::endl;
        }
    }
}

void test_order_validation() {
    std::cout << "Testing order validation..." << std::endl;
    
    TradingAllocator allocator;
    LatencyTracker latency_tracker;
    OrderManagementSystem oms(allocator, latency_tracker);
    
    // Set up restrictive risk parameters
    RiskParameters risk_params{};
    risk_params.max_position_size = 10;  // Very small limit
    risk_params.max_order_value = 1000;  // Very small limit
    risk_params.available_funds = 500;   // Very small limit
    risk_params.allow_short_selling = false;
    
    oms.set_risk_parameters(1, risk_params);
    
    // Test quantity limit violation
    auto result1 = oms.submit_order(3001, "GOOGL", OrderSide::BUY, 100, 100, 1);
    if (result1.validation_result == OrderValidationResult::POSITION_LIMIT_EXCEEDED) {
        std::cout << "  ✓ Position limit validation works" << std::endl;
    } else {
        std::cout << "  ✗ Position limit validation failed" << std::endl;
    }
    
    // Test order value limit violation
    auto result2 = oms.submit_order(3002, "GOOGL", OrderSide::BUY, 5, 300, 1);
    if (result2.validation_result == OrderValidationResult::RISK_LIMIT_EXCEEDED) {
        std::cout << "  ✓ Order value limit validation works" << std::endl;
    } else {
        std::cout << "  ✗ Order value limit validation failed" << std::endl;
    }
    
    // Test insufficient funds
    auto result3 = oms.submit_order(3003, "GOOGL", OrderSide::BUY, 5, 200, 1);
    if (result3.validation_result == OrderValidationResult::INSUFFICIENT_FUNDS) {
        std::cout << "  ✓ Insufficient funds validation works" << std::endl;
    } else {
        std::cout << "  ✗ Insufficient funds validation failed" << std::endl;
    }
    
    // Test duplicate order ID
    auto result4 = oms.submit_order(3001, "GOOGL", OrderSide::BUY, 1, 50, 1);
    if (result4.validation_result == OrderValidationResult::DUPLICATE_ORDER_ID) {
        std::cout << "  ✓ Duplicate order ID validation works" << std::endl;
    } else {
        std::cout << "  ✗ Duplicate order ID validation failed" << std::endl;
    }
}

void test_performance_stats() {
    std::cout << "Testing performance statistics..." << std::endl;
    
    TradingAllocator allocator;
    LatencyTracker latency_tracker;
    OrderManagementSystem oms(allocator, latency_tracker);
    
    // Set up risk parameters
    RiskParameters risk_params{};
    risk_params.max_position_size = 1000;
    risk_params.max_order_value = 100000;
    risk_params.available_funds = 50000;
    risk_params.allow_short_selling = true;
    
    oms.set_risk_parameters(1, risk_params);
    
    // Submit several orders
    for (int i = 0; i < 10; ++i) {
        oms.submit_order(4000 + i, "TSLA", OrderSide::BUY, 10, 20000, 1);
    }
    
    // Cancel some orders
    oms.cancel_order(4001);
    oms.cancel_order(4003);
    
    // Get performance stats
    auto stats = oms.get_performance_stats();
    
    std::cout << "  Orders submitted: " << stats.orders_submitted << std::endl;
    std::cout << "  Orders executed: " << stats.orders_executed << std::endl;
    std::cout << "  Orders cancelled: " << stats.orders_cancelled << std::endl;
    std::cout << "  Orders rejected: " << stats.orders_rejected << std::endl;
    std::cout << "  Validation errors: " << stats.validation_errors << std::endl;
    
    if (stats.orders_submitted >= 10) {
        std::cout << "  ✓ Performance statistics tracking works" << std::endl;
    } else {
        std::cout << "  ✗ Performance statistics tracking failed" << std::endl;
    }
}

int main() {
    std::cout << "=== Order Management System Tests ===" << std::endl;
    
    try {
        test_order_submission();
        std::cout << std::endl;
        
        test_order_cancellation();
        std::cout << std::endl;
        
        test_order_validation();
        std::cout << std::endl;
        
        test_performance_stats();
        std::cout << std::endl;
        
        std::cout << "=== All OMS tests completed! ===" << std::endl;
        
    } catch (const std::exception& e) {
        std::cerr << "Test failed with exception: " << e.what() << std::endl;
        return 1;
    } catch (...) {
        std::cerr << "Test failed with unknown exception" << std::endl;
        return 1;
    }
    
    return 0;
}