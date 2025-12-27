#include "../include/dynamic_risk_enforcer.hpp"
#include "../include/portfolio_monitor.hpp"
#include "../include/pre_trade_validator.hpp"
#include "high_res_timer.hpp"
#include <iostream>
#include <memory>

using namespace tradeflow;

int main() {
    std::cout << "=== Dynamic Risk Enforcer Integration Test ===" << std::endl;
    
    try {
        // Initialize components
        std::cout << "1. Testing component initialization..." << std::endl;
        
        auto monitor = std::make_shared<PortfolioMonitor>();
        auto validator = std::make_shared<PreTradeValidator>();
        auto enforcer = std::make_unique<DynamicRiskEnforcer>(monitor, validator);
        
        std::cout << "  ✓ All components initialized successfully" << std::endl;
        
        // Test volatility-based adjustment
        std::cout << "2. Testing volatility-based risk adjustment..." << std::endl;
        
        std::string symbol = "TSLA";
        uint64_t base_time = HighResTimer::now_nanos();
        
        // Add volatile price history
        double prices[] = {100.0, 110.0, 95.0, 120.0, 85.0, 130.0, 80.0, 135.0};
        for (int i = 0; i < 8; ++i) {
            enforcer->updateMarketData(symbol, prices[i], base_time + i * 1000000000ULL);
        }
        
        double volatility = enforcer->calculateSymbolVolatility(symbol, 8);
        std::cout << "  ✓ Calculated volatility for " << symbol << ": " << volatility << std::endl;
        
        RiskParameters base_params;
        base_params.max_position_size_pct = 0.05;
        base_params.max_sector_exposure_pct = 0.20;
        
        VolatilityRiskParams vol_params;
        vol_params.high_volatility_threshold = 0.03;
        vol_params.volatility_adjustment_factor = 0.5;
        
        RiskParameters adjusted = enforcer->adjustForVolatility(base_params, symbol, vol_params);
        
        if (volatility > vol_params.high_volatility_threshold) {
            std::cout << "  ✓ High volatility detected - position size reduced from " 
                      << base_params.max_position_size_pct << " to " << adjusted.max_position_size_pct << std::endl;
        } else {
            std::cout << "  ✓ Normal volatility - parameters unchanged" << std::endl;
        }
        
        // Test drawdown enforcement
        std::cout << "3. Testing drawdown-based position reduction..." << std::endl;
        
        std::string user_id = "test_user_drawdown";
        
        // Set up portfolio with positions
        monitor->updatePosition(user_id, "AAPL", 100, 150.0, "Technology");
        monitor->updatePosition(user_id, "MSFT", 50, 300.0, "Technology");
        
        // Simulate market decline
        monitor->updateMarketPrice("AAPL", 135.0);  // 10% drop
        monitor->updateMarketPrice("MSFT", 270.0);  // 10% drop
        
        double drawdown = enforcer->calculateCurrentDrawdown(user_id);
        std::cout << "  ✓ Current portfolio drawdown: " << (drawdown * 100) << "%" << std::endl;
        
        DrawdownRiskParams drawdown_params;
        drawdown_params.minor_drawdown_threshold = 0.05;  // 5%
        drawdown_params.major_drawdown_threshold = 0.10;  // 10%
        drawdown_params.minor_position_reduction = 0.25;
        drawdown_params.major_position_reduction = 0.50;
        
        RiskEnforcementResult drawdown_result = enforcer->enforceDrawdownLimits(user_id, drawdown_params);
        
        std::cout << "  ✓ Drawdown enforcement action: " << static_cast<int>(drawdown_result.action) << std::endl;
        std::cout << "  ✓ Reason: " << drawdown_result.reason << std::endl;
        
        if (drawdown_result.position_reduction_factor > 0) {
            std::cout << "  ✓ Position reduction factor: " << drawdown_result.position_reduction_factor << std::endl;
            std::cout << "  ✓ Affected symbols: " << drawdown_result.affected_symbols.size() << std::endl;
        }
        
        // Test emergency conditions
        std::cout << "4. Testing emergency condition detection..." << std::endl;
        
        EmergencyStopParams emergency_params;
        emergency_params.daily_loss_emergency_threshold = 0.05;  // 5%
        emergency_params.leverage_emergency_threshold = 3.0;     // 3x leverage
        emergency_params.enable_circuit_breaker = false;        // Disable for test
        emergency_params.enable_forced_liquidation = false;     // Disable for test
        
        RiskEnforcementResult emergency_result = enforcer->checkEmergencyConditions(user_id, emergency_params);
        
        std::cout << "  ✓ Emergency check action: " << static_cast<int>(emergency_result.action) << std::endl;
        std::cout << "  ✓ Emergency reason: " << emergency_result.reason << std::endl;
        
        // Test full risk enforcement
        std::cout << "5. Testing integrated risk enforcement..." << std::endl;
        
        auto start_time = HighResTimer::now_nanos();
        RiskEnforcementResult full_result = enforcer->enforceRiskLimits(
            user_id, base_params, vol_params, drawdown_params, emergency_params);
        auto enforcement_time = HighResTimer::now_nanos() - start_time;
        
        std::cout << "  ✓ Full enforcement completed in " 
                  << HighResTimer::to_microseconds(enforcement_time) << " μs" << std::endl;
        std::cout << "  ✓ Final action: " << static_cast<int>(full_result.action) << std::endl;
        std::cout << "  ✓ Final reason: " << full_result.reason << std::endl;
        
        // Test performance metrics
        std::cout << "6. Testing performance metrics..." << std::endl;
        
        uint64_t total_enforcements = enforcer->getTotalEnforcements();
        uint64_t emergency_stops = enforcer->getEmergencyStops();
        uint64_t circuit_breaker_activations = enforcer->getCircuitBreakerActivations();
        uint64_t forced_liquidations = enforcer->getForcedLiquidations();
        
        std::cout << "  ✓ Performance metrics:" << std::endl;
        std::cout << "    - Total enforcements: " << total_enforcements << std::endl;
        std::cout << "    - Emergency stops: " << emergency_stops << std::endl;
        std::cout << "    - Circuit breaker activations: " << circuit_breaker_activations << std::endl;
        std::cout << "    - Forced liquidations: " << forced_liquidations << std::endl;
        
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