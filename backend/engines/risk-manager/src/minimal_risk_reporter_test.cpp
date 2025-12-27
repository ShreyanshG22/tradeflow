#include "../include/risk_reporter.hpp"
#include "../include/portfolio_monitor.hpp"
#include "../include/dynamic_risk_enforcer.hpp"
#include "logger.hpp"
#include <iostream>

using namespace tradeflow;

int main() {
    try {
        std::cout << "Starting minimal Risk Reporter test...\n";
        
        // Create dependencies
        auto monitor = std::make_shared<PortfolioMonitor>();
        std::cout << "Created PortfolioMonitor\n";
        
        auto enforcer = std::make_shared<DynamicRiskEnforcer>(monitor, nullptr);
        std::cout << "Created DynamicRiskEnforcer\n";
        
        auto reporter = std::make_unique<RiskReporter>(monitor, enforcer);
        std::cout << "Created RiskReporter\n";
        
        std::string user_id = "test_user";
        
        // Test basic alert generation without portfolio operations
        reporter->generateAlert(user_id,
                              RiskAlertType::POSITION_SIZE_BREACH,
                              RiskAlertLevel::WARNING,
                              "Test alert",
                              "This is a test alert for verification");
        
        std::cout << "Generated test alert\n";
        
        // Get active alerts
        auto alerts = reporter->getActiveAlerts(user_id);
        std::cout << "Active alerts: " << alerts.size() << "\n";
        
        if (!alerts.empty()) {
            std::cout << "  Alert message: " << alerts[0].message << "\n";
            std::cout << "  Alert level: " << static_cast<int>(alerts[0].level) << "\n";
            std::cout << "  Alert ID: " << alerts[0].alert_id << "\n";
        }
        
        // Test alert acknowledgment
        if (!alerts.empty()) {
            bool acknowledged = reporter->acknowledgeAlert(alerts[0].alert_id);
            std::cout << "Alert acknowledged: " << (acknowledged ? "Yes" : "No") << "\n";
            
            // Check active alerts again
            auto remaining_alerts = reporter->getActiveAlerts(user_id);
            std::cout << "Remaining active alerts: " << remaining_alerts.size() << "\n";
        }
        
        std::cout << "\nMinimal Risk Reporter test completed successfully!\n";
        return 0;
        
    } catch (const std::exception& e) {
        std::cerr << "Test failed with exception: " << e.what() << std::endl;
        return 1;
    } catch (...) {
        std::cerr << "Test failed with unknown exception" << std::endl;
        return 1;
    }
}