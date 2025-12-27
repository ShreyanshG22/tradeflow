#include "../include/dynamic_risk_enforcer.hpp"
#include "../include/portfolio_monitor.hpp"
#include "../include/pre_trade_validator.hpp"
#include "high_res_timer.hpp"
#include <iostream>
#include <memory>

using namespace tradeflow;

int main() {
    std::cout << "=== Simple Dynamic Risk Enforcer Test ===" << std::endl;
    
    try {
        // Test basic initialization
        std::cout << "Testing initialization..." << std::endl;
        
        auto monitor = std::make_shared<PortfolioMonitor>();
        auto validator = std::make_shared<PreTradeValidator>();
        auto enforcer = std::make_unique<DynamicRiskEnforcer>(monitor, validator);
        
        std::cout << "  ✓ Components initialized successfully" << std::endl;
        
        // Test basic functionality
        std::cout << "Testing basic functionality..." << std::endl;
        
        std::string user_id = "test_user";
        
        // Set up a simple portfolio
        monitor->updatePosition(user_id, "AAPL", 100, 150.0, "Technology");
        std::cout << "  ✓ Added position to portfolio" << std::endl;
        
        // Test volatility calculation with some price data
        std::string symbol = "AAPL";
        uint64_t base_time = HighResTimer::now_nanos();
        
        enforcer->updateMarketData(symbol, 150.0, base_time);
        enforcer->updateMarketData(symbol, 152.0, base_time + 1000000000ULL);
        enforcer->updateMarketData(symbol, 148.0, base_time + 2000000000ULL);
        
        double volatility = enforcer->calculateSymbolVolatility(symbol, 3);
        std::cout << "  ✓ Calculated volatility: " << volatility << std::endl;
        
        // Test drawdown calculation
        double drawdown = enforcer->calculateCurrentDrawdown(user_id);
        std::cout << "  ✓ Calculated drawdown: " << (drawdown * 100) << "%" << std::endl;
        
        // Test risk parameter adjustment
        RiskParameters base_params;
        base_params.max_position_size_pct = 0.05;
        
        VolatilityRiskParams vol_params;
        vol_params.high_volatility_threshold = 0.03;
        
        RiskParameters adjusted = enforcer->adjustForVolatility(base_params, symbol, vol_params);
        std::cout << "  ✓ Adjusted position size from " << base_params.max_position_size_pct 
                  << " to " << adjusted.max_position_size_pct << std::endl;
        
        // Test performance metrics
        uint64_t total_enforcements = enforcer->getTotalEnforcements();
        std::cout << "  ✓ Total enforcements: " << total_enforcements << std::endl;
        
        std::cout << "=== Simple test completed successfully! ===" << std::endl;
        return 0;
        
    } catch (const std::exception& e) {
        std::cout << "  ✗ Test failed with exception: " << e.what() << std::endl;
        return 1;
    } catch (...) {
        std::cout << "  ✗ Test failed with unknown exception" << std::endl;
        return 1;
    }
}