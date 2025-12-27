#include "logger.hpp"
#include "../include/pre_trade_validator.hpp"
#include "../include/portfolio_monitor.hpp"
#include "../include/risk_types.hpp"
#include "high_res_timer.hpp"
#include <iostream>
#include <csignal>
#include <atomic>
#include <thread>
#include <chrono>
#include <memory>

namespace {
    std::atomic<bool> running{true};
    
    void signalHandler(int signal) {
        if (signal == SIGINT || signal == SIGTERM) {
            tradeflow::Logger::getInstance().info("Received shutdown signal");
            running.store(false);
        }
    }
}

int main(int argc, char* argv[]) {
    // Set up signal handlers
    std::signal(SIGINT, signalHandler);
    std::signal(SIGTERM, signalHandler);
    
    auto& logger = tradeflow::Logger::getInstance();
    logger.setLevel(tradeflow::LogLevel::INFO);
    
    logger.info("TradeFlow Risk Manager starting...");
    
    // Initialize risk manager components
    auto validator = std::make_unique<tradeflow::PreTradeValidator>();
    auto monitor = std::make_unique<tradeflow::PortfolioMonitor>();
    
    if (!validator || !monitor) {
        logger.error("Failed to initialize risk manager components");
        return 1;
    }
    
    // Set up default risk parameters
    tradeflow::RiskParameters default_params;
    default_params.max_position_size_pct = 0.05;      // 5%
    default_params.max_sector_exposure_pct = 0.20;    // 20%
    default_params.max_correlation_threshold = 0.7;   // 70%
    default_params.max_daily_loss_pct = 0.02;         // 2%
    default_params.max_drawdown_pct = 0.10;           // 10%
    default_params.max_positions = 50;
    default_params.leverage_limit = 2.0;
    
    logger.info("Risk Manager initialized successfully");
    logger.info("Risk Parameters: max_position={}%, max_sector={}%, max_correlation={}%",
               default_params.max_position_size_pct * 100,
               default_params.max_sector_exposure_pct * 100,
               default_params.max_correlation_threshold * 100);
    
    // Performance monitoring variables
    uint64_t last_stats_time = tradeflow::HighResTimer::now_nanos();
    uint64_t stats_interval_ns = 10000000000ULL; // 10 seconds
    
    // Main event loop
    while (running.load()) {
        uint64_t current_time = tradeflow::HighResTimer::now_nanos();
        
        // Example: Monitor portfolio positions and calculate risk metrics
        // In production, this would process real market data and orders
        
        // Update some sample correlations (normally from market data analysis)
        validator->updateCorrelationMatrix("AAPL", "MSFT", 0.65);
        validator->updateCorrelationMatrix("AAPL", "GOOGL", 0.72);
        validator->updateCorrelationMatrix("JPM", "BAC", 0.85);
        validator->updateCorrelationMatrix("XOM", "CVX", 0.78);
        
        // Update sample market prices (normally from market data feed)
        monitor->updateMarketPrice("AAPL", 150.0 + (rand() % 10 - 5) * 0.1);
        monitor->updateMarketPrice("MSFT", 300.0 + (rand() % 10 - 5) * 0.2);
        monitor->updateMarketPrice("GOOGL", 2500.0 + (rand() % 10 - 5) * 2.0);
        
        // Print performance statistics periodically
        if (current_time - last_stats_time >= stats_interval_ns) {
            uint64_t total_validations = validator->getTotalValidations();
            uint64_t rejected_orders = validator->getRejectedOrders();
            uint64_t total_updates = monitor->getTotalUpdates();
            
            double avg_validation_time = 0.0;
            if (total_validations > 0) {
                avg_validation_time = tradeflow::HighResTimer::to_microseconds(
                    validator->getLastValidationTime());
            }
            
            logger.info("Performance Stats - Validations: {}, Rejected: {}, Updates: {}, Avg Time: {:.2f}μs",
                       total_validations, rejected_orders, total_updates, avg_validation_time);
            
            last_stats_time = current_time;
        }
        
        // Sleep for 50 microseconds (ultra-low latency monitoring)
        std::this_thread::sleep_for(std::chrono::microseconds(50));
    }
    
    logger.info("Risk Manager shutting down...");
    
    // Print final statistics
    uint64_t final_validations = validator->getTotalValidations();
    uint64_t final_rejected = validator->getRejectedOrders();
    uint64_t final_updates = monitor->getTotalUpdates();
    
    logger.info("Final Stats - Total Validations: {}, Total Rejected: {}, Total Updates: {}",
               final_validations, final_rejected, final_updates);
    
    logger.info("Risk Manager shutdown complete");
    return 0;
}