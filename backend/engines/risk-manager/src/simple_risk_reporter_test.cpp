#include "../include/risk_reporter.hpp"
#include "../include/portfolio_monitor.hpp"
#include "../include/dynamic_risk_enforcer.hpp"
#include "logger.hpp"
#include <iostream>

using namespace tradeflow;

int main() {
    try {
        std::cout << "Starting simple Risk Reporter test...\n";
        
        // Create dependencies
        auto monitor = std::make_shared<PortfolioMonitor>();
        auto enforcer = std::make_shared<DynamicRiskEnforcer>(monitor, nullptr);
        auto reporter = std::make_unique<RiskReporter>(monitor, enforcer);
        
        std::string user_id = "test_user";
        
        // Add a test position
        monitor->updatePosition(user_id, "AAPL", 100, 150.0, "Technology");
        monitor->updateMarketPrice("AAPL", 155.0);
        
        std::cout << "Added test position for AAPL\n";
        
        // Calculate risk metrics
        RiskMetrics metrics = reporter->calculateRiskMetrics(user_id);
        
        std::cout << "Risk metrics calculated:\n";
        std::cout << "  User ID: " << metrics.user_id << "\n";
        std::cout << "  Portfolio value: $" << metrics.portfolio_value << "\n";
        std::cout << "  Position count: " << metrics.position_count << "\n";
        std::cout << "  Daily P&L: " << metrics.daily_pnl_pct << "%\n";
        std::cout << "  Leverage ratio: " << metrics.leverage_ratio << "\n";
        
        // Generate a test alert
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
        }
        
        // Test dashboard data generation
        RiskDashboardData dashboard = reporter->generateDashboardData(user_id);
        std::cout << "Dashboard data generated:\n";
        std::cout << "  User ID: " << dashboard.user_id << "\n";
        std::cout << "  Active alerts: " << dashboard.active_alerts.size() << "\n";
        std::cout << "  Sector exposures: " << dashboard.sector_exposures.size() << "\n";
        std::cout << "  Position risks: " << dashboard.position_risks.size() << "\n";
        
        std::cout << "\nSimple Risk Reporter test completed successfully!\n";
        return 0;
        
    } catch (const std::exception& e) {
        std::cerr << "Test failed with exception: " << e.what() << std::endl;
        return 1;
    } catch (...) {
        std::cerr << "Test failed with unknown exception" << std::endl;
        return 1;
    }
}