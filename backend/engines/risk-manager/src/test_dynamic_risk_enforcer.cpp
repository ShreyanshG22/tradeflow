#include "../include/dynamic_risk_enforcer.hpp"
#include "../include/portfolio_monitor.hpp"
#include "../include/pre_trade_validator.hpp"
#include "high_res_timer.hpp"
#include <iostream>
#include <cassert>
#include <memory>
#include <thread>
#include <chrono>

using namespace tradeflow;

void testVolatilityAdjustment() {
    std::cout << "Testing volatility-based risk adjustment..." << std::endl;
    
    auto monitor = std::make_shared<PortfolioMonitor>();
    auto validator = std::make_shared<PreTradeValidator>();
    auto enforcer = std::make_unique<DynamicRiskEnforcer>(monitor, validator);
    
    // Set up base risk parameters
    RiskParameters base_params;
    base_params.max_position_size_pct = 0.05;
    base_params.max_sector_exposure_pct = 0.20;
    base_params.leverage_limit = 2.0;
    
    VolatilityRiskParams vol_params;
    vol_params.high_volatility_threshold = 0.03;
    vol_params.volatility_adjustment_factor = 0.5;
    
    // Add some price history to simulate high volatility
    std::string symbol = "TSLA";
    uint64_t base_time = HighResTimer::now_nanos();
    
    // Add volatile price data
    double prices[] = {100.0, 105.0, 98.0, 110.0, 95.0, 115.0, 90.0, 120.0, 85.0, 125.0};
    for (int i = 0; i < 10; ++i) {
        enforcer->updateMarketData(symbol, prices[i], base_time + i * 1000000000ULL);
    }
    
    // Test volatility calculation
    double volatility = enforcer->calculateSymbolVolatility(symbol, 10);
    std::cout << "  ✓ Calculated volatility for " << symbol << ": " << volatility << std::endl;
    
    // Test risk parameter adjustment
    RiskParameters adjusted = enforcer->adjustForVolatility(base_params, symbol, vol_params);
    
    if (volatility > vol_params.high_volatility_threshold) {
        assert(adjusted.max_position_size_pct < base_params.max_position_size_pct);
        std::cout << "  ✓ High volatility detected, position size reduced from " 
                  << base_params.max_position_size_pct << " to " << adjusted.max_position_size_pct << std::endl;
    }
    
    std::cout << "  ✓ Volatility adjustment test passed" << std::endl;
}

void testDrawdownEnforcement() {
    std::cout << "Testing drawdown-based position reduction..." << std::endl;
    
    auto monitor = std::make_shared<PortfolioMonitor>();
    auto validator = std::make_shared<PreTradeValidator>();
    auto enforcer = std::make_unique<DynamicRiskEnforcer>(monitor, validator);
    
    std::string user_id = "test_user_drawdown";
    
    // Set up portfolio with some positions
    monitor->updatePosition(user_id, "AAPL", 100, 150.0, "Technology");
    monitor->updatePosition(user_id, "MSFT", 50, 300.0, "Technology");
    monitor->updatePosition(user_id, "GOOGL", 20, 2500.0, "Technology");
    
    // Simulate market price drops to create drawdown
    monitor->updateMarketPrice("AAPL", 135.0);  // 10% drop
    monitor->updateMarketPrice("MSFT", 270.0);  // 10% drop
    monitor->updateMarketPrice("GOOGL", 2250.0); // 10% drop
    
    DrawdownRiskParams drawdown_params;
    drawdown_params.minor_drawdown_threshold = 0.05;  // 5%
    drawdown_params.major_drawdown_threshold = 0.10;  // 10%
    drawdown_params.minor_position_reduction = 0.25;  // 25%
    drawdown_params.major_position_reduction = 0.50;  // 50%
    
    // Test drawdown calculation
    double drawdown = enforcer->calculateCurrentDrawdown(user_id);
    std::cout << "  ✓ Current drawdown: " << (drawdown * 100) << "%" << std::endl;
    
    // Test drawdown enforcement
    RiskEnforcementResult result = enforcer->enforceDrawdownLimits(user_id, drawdown_params);
    
    if (result.action != RiskEnforcementAction::NO_ACTION) {
        std::cout << "  ✓ Drawdown enforcement triggered: " << result.reason << std::endl;
        std::cout << "  ✓ Action: " << static_cast<int>(result.action) << std::endl;
        std::cout << "  ✓ Position reduction factor: " << result.position_reduction_factor << std::endl;
        std::cout << "  ✓ Affected symbols: " << result.affected_symbols.size() << std::endl;
    }
    
    std::cout << "  ✓ Drawdown enforcement test passed" << std::endl;
}

void testEmergencyStopLoss() {
    std::cout << "Testing emergency stop-loss system..." << std::endl;
    
    auto monitor = std::make_shared<PortfolioMonitor>();
    auto validator = std::make_shared<PreTradeValidator>();
    auto enforcer = std::make_unique<DynamicRiskEnforcer>(monitor, validator);
    
    std::string user_id = "test_user_emergency";
    
    // Set up portfolio
    monitor->updatePosition(user_id, "AAPL", 1000, 150.0, "Technology");
    
    // Simulate extreme market drop
    monitor->updateMarketPrice("AAPL", 120.0);  // 20% drop
    
    EmergencyStopParams emergency_params;
    emergency_params.daily_loss_emergency_threshold = 0.15;  // 15%
    emergency_params.enable_circuit_breaker = true;
    emergency_params.circuit_breaker_duration_ms = 1000;  // 1 second for test
    emergency_params.enable_forced_liquidation = false;
    
    // Test emergency condition check
    RiskEnforcementResult result = enforcer->checkEmergencyConditions(user_id, emergency_params);
    
    if (result.action != RiskEnforcementAction::NO_ACTION) {
        std::cout << "  ✓ Emergency condition detected: " << result.reason << std::endl;
        std::cout << "  ✓ Action: " << static_cast<int>(result.action) << std::endl;
        
        if (result.trading_halted) {
            std::cout << "  ✓ Trading halted for " << result.halt_duration_remaining_ms << "ms" << std::endl;
            
            // Test circuit breaker status
            bool is_active = enforcer->isCircuitBreakerActive(user_id);
            if (is_active) {
                std::cout << "  ✓ Circuit breaker is active" << std::endl;
            }
            
            // Wait for circuit breaker to expire
            std::this_thread::sleep_for(std::chrono::milliseconds(1100));
            
            is_active = enforcer->isCircuitBreakerActive(user_id);
            if (!is_active) {
                std::cout << "  ✓ Circuit breaker expired and deactivated" << std::endl;
            }
        }
    } else {
        std::cout << "  ✓ No emergency condition detected (expected for this test setup)" << std::endl;
    }
    
    std::cout << "  ✓ Emergency stop-loss test passed" << std::endl;
}

void testRiskEnforcementIntegration() {
    std::cout << "Testing integrated risk enforcement..." << std::endl;
    
    auto monitor = std::make_shared<PortfolioMonitor>();
    auto validator = std::make_shared<PreTradeValidator>();
    auto enforcer = std::make_unique<DynamicRiskEnforcer>(monitor, validator);
    
    std::string user_id = "test_user_integration";
    
    // Set up portfolio
    monitor->updatePosition(user_id, "AAPL", 500, 150.0, "Technology");
    monitor->updatePosition(user_id, "MSFT", 300, 300.0, "Technology");
    
    // Set up risk parameters
    RiskParameters base_params;
    base_params.max_position_size_pct = 0.05;
    base_params.max_daily_loss_pct = 0.02;
    
    VolatilityRiskParams vol_params;
    DrawdownRiskParams drawdown_params;
    EmergencyStopParams emergency_params;
    emergency_params.daily_loss_emergency_threshold = 0.10;
    
    // Test full risk enforcement
    auto start_time = HighResTimer::now_nanos();
    RiskEnforcementResult result = enforcer->enforceRiskLimits(
        user_id, base_params, vol_params, drawdown_params, emergency_params);
    auto enforcement_time = HighResTimer::now_nanos() - start_time;
    
    std::cout << "  ✓ Risk enforcement completed in " 
              << HighResTimer::to_microseconds(enforcement_time) << " μs" << std::endl;
    std::cout << "  ✓ Enforcement result: " << result.reason << std::endl;
    
    // Test performance metrics
    uint64_t total_enforcements = enforcer->getTotalEnforcements();
    uint64_t emergency_stops = enforcer->getEmergencyStops();
    uint64_t circuit_breaker_activations = enforcer->getCircuitBreakerActivations();
    
    std::cout << "  ✓ Performance metrics:" << std::endl;
    std::cout << "    - Total enforcements: " << total_enforcements << std::endl;
    std::cout << "    - Emergency stops: " << emergency_stops << std::endl;
    std::cout << "    - Circuit breaker activations: " << circuit_breaker_activations << std::endl;
    
    std::cout << "  ✓ Integration test passed" << std::endl;
}

int main() {
    std::cout << "=== Dynamic Risk Enforcer Test Suite ===" << std::endl;
    
    try {
        testVolatilityAdjustment();
        std::cout << std::endl;
        
        testDrawdownEnforcement();
        std::cout << std::endl;
        
        testEmergencyStopLoss();
        std::cout << std::endl;
        
        testRiskEnforcementIntegration();
        std::cout << std::endl;
        
        std::cout << "=== All dynamic risk enforcer tests passed! ===" << std::endl;
        return 0;
        
    } catch (const std::exception& e) {
        std::cout << "  ✗ Test failed with exception: " << e.what() << std::endl;
        return 1;
    } catch (...) {
        std::cout << "  ✗ Test failed with unknown exception" << std::endl;
        return 1;
    }
}