#include "../include/dynamic_risk_enforcer.hpp"
#include "../include/portfolio_monitor.hpp"
#include "../include/pre_trade_validator.hpp"
#include <iostream>
#include <memory>

using namespace tradeflow;

int main() {
    std::cout << "=== Minimal Dynamic Risk Enforcer Test ===" << std::endl;
    
    try {
        auto monitor = std::make_shared<PortfolioMonitor>();
        auto validator = std::make_shared<PreTradeValidator>();
        auto enforcer = std::make_unique<DynamicRiskEnforcer>(monitor, validator);
        
        std::cout << "✓ Components initialized" << std::endl;
        
        // Test basic functionality
        std::string user_id = "test_user";
        monitor->updatePosition(user_id, "AAPL", 100, 150.0, "Technology");
        
        std::cout << "✓ Position added" << std::endl;
        
        // Test drawdown calculation
        double drawdown = enforcer->calculateCurrentDrawdown(user_id);
        std::cout << "✓ Drawdown calculated: " << (drawdown * 100) << "%" << std::endl;
        
        // Test performance metrics
        uint64_t enforcements = enforcer->getTotalEnforcements();
        std::cout << "✓ Total enforcements: " << enforcements << std::endl;
        
        std::cout << "=== Minimal test completed successfully! ===" << std::endl;
        return 0;
        
    } catch (const std::exception& e) {
        std::cout << "✗ Test failed: " << e.what() << std::endl;
        return 1;
    }
}