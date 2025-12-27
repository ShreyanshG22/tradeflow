#include "logger.hpp"
#include "data_loader.hpp"
#include "simd_indicators.hpp"
#include "parallel_processor.hpp"
#include "simulation_engine.hpp"
#include "backtest_runner.hpp"
#include "performance_calculator.hpp"
#include "result_storage.hpp"
#include <iostream>
#include <csignal>
#include <atomic>
#include <thread>
#include <chrono>

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
    
    logger.info("TradeFlow Backtest Engine starting...");
    
    try {
        // Initialize backtest engine components
        tradeflow::DataLoader data_loader;
        tradeflow::ParallelProcessor parallel_processor;
        tradeflow::SimulationEngine simulation_engine;
        tradeflow::PerformanceCalculator performance_calculator;
        
        logger.info("Initialized high-performance backtesting components:");
        logger.info("- Memory-mapped file system for large datasets");
        logger.info("- SIMD-optimized technical indicators");
        logger.info("- Parallel processing with {} threads", parallel_processor.getNumThreads());
        logger.info("- Tick-by-tick simulation engine with realistic execution");
        logger.info("- Comprehensive performance metrics calculation");
        
        // Test simulation engine capabilities
        logger.info("Testing simulation engine...");
        
        // Create sample market data
        tradeflow::MarketData sample_tick(1640995200, 150.0, 152.0, 149.0, 151.0, 1000000, "AAPL");
        
        // Test order submission and execution
        tradeflow::Order test_order(1, "AAPL", tradeflow::OrderType::MARKET, 
                                   tradeflow::OrderSide::BUY, 100);
        
        uint64_t order_id = simulation_engine.submitOrder(test_order);
        logger.info("Submitted test market order {} for 100 shares", order_id);
        
        // Process market data to trigger execution
        simulation_engine.processMarketData(sample_tick);
        
        auto fills = simulation_engine.getFills();
        if (!fills.empty()) {
            const auto& fill = fills[0];
            logger.info("Order executed: {} shares at ${:.2f} with ${:.2f} commission",
                       fill.quantity, fill.price, fill.commission);
            logger.info("Total slippage: ${:.2f}, Total commissions: ${:.2f}",
                       simulation_engine.getTotalSlippage(), simulation_engine.getTotalCommissions());
        }
        
        // Test backtest runner with simple strategy
        logger.info("Testing backtest runner with comprehensive performance analysis...");
        
        tradeflow::BacktestRunner backtest_runner;
        
        // Create sample historical data with more realistic price movement
        std::vector<tradeflow::MarketData> sample_data;
        double price = 150.0;
        for (int i = 0; i < 252; ++i) { // One year of daily data
            // Add trend and noise
            double trend = 0.0005; // 0.05% daily trend
            double noise = (rand() % 200 - 100) * 0.0001; // ±1% random noise
            price *= (1.0 + trend + noise);
            
            double high = price * (1.0 + (rand() % 50) * 0.0001);
            double low = price * (1.0 - (rand() % 50) * 0.0001);
            
            sample_data.emplace_back(1640995200 + i * 86400, price, high, low, price, 100000, "AAPL");
        }
        
        // Set simple moving average crossover strategy
        backtest_runner.setStrategy([](const tradeflow::MarketData& tick, const std::vector<tradeflow::Fill>& fills) {
            std::vector<tradeflow::Order> orders;
            
            // Simple strategy: buy if price > 150, sell if price < 150
            static bool has_position = false;
            
            if (!has_position && tick.close > 150.0) {
                orders.emplace_back(0, tick.symbol, tradeflow::OrderType::MARKET, 
                                   tradeflow::OrderSide::BUY, 100);
                has_position = true;
            } else if (has_position && tick.close < 150.0) {
                orders.emplace_back(0, tick.symbol, tradeflow::OrderType::MARKET, 
                                   tradeflow::OrderSide::SELL, 100);
                has_position = false;
            }
            
            return orders;
        });
        
        auto metrics = backtest_runner.runBacktest(sample_data);
        
        logger.info("Backtest Results:");
        logger.info("- Total Return: {:.2f}%", metrics.total_return * 100);
        logger.info("- Annualized Return: {:.2f}%", metrics.annualized_return * 100);
        logger.info("- Volatility: {:.2f}%", metrics.volatility * 100);
        logger.info("- Sharpe Ratio: {:.2f}", metrics.sharpe_ratio);
        logger.info("- Sortino Ratio: {:.2f}", metrics.sortino_ratio);
        logger.info("- Max Drawdown: {:.2f}%", metrics.max_drawdown * 100);
        logger.info("- Calmar Ratio: {:.2f}", metrics.calmar_ratio);
        logger.info("- Total Trades: {}", metrics.total_trades);
        logger.info("- Win Rate: {:.2f}%", metrics.win_rate * 100);
        logger.info("- Profit Factor: {:.2f}", metrics.profit_factor);
        
        // Test comprehensive performance analysis
        logger.info("Testing comprehensive performance analysis...");
        
        auto comprehensive_stats = performance_calculator.calculateTradingStatistics(
            backtest_runner.getTrades(), backtest_runner.getEquityCurve(), 100000.0);
        
        logger.info("Comprehensive Performance Metrics:");
        logger.info("- VaR (95%): {:.2f}%", comprehensive_stats.var_95 * 100);
        logger.info("- CVaR (95%): {:.2f}%", comprehensive_stats.cvar_95 * 100);
        logger.info("- Skewness: {:.3f}", comprehensive_stats.skewness);
        logger.info("- Kurtosis: {:.3f}", comprehensive_stats.kurtosis);
        logger.info("- Monthly Win Rate: {:.2f}%", comprehensive_stats.monthly_win_rate * 100);
        logger.info("- Best Month: {:.2f}%", comprehensive_stats.best_month * 100);
        logger.info("- Worst Month: {:.2f}%", comprehensive_stats.worst_month * 100);
        
        // Test Monte Carlo simulation
        logger.info("Testing Monte Carlo simulation for strategy robustness...");
        
        auto returns = performance_calculator.calculateReturns(backtest_runner.getEquityCurve());
        auto mc_results = performance_calculator.runMonteCarloSimulation(returns, 1000, 252, 100000.0);
        auto mc_analysis = performance_calculator.analyzeMonteCarloResults(mc_results, 100000.0);
        
        logger.info("Monte Carlo Analysis (1000 simulations):");
        logger.info("- Mean Final Value: ${:.2f}", mc_analysis.mean_final_value);
        logger.info("- Median Final Value: ${:.2f}", mc_analysis.median_final_value);
        logger.info("- 5th Percentile: ${:.2f}", mc_analysis.percentile_5);
        logger.info("- 95th Percentile: ${:.2f}", mc_analysis.percentile_95);
        logger.info("- Probability of Loss: {:.2f}%", mc_analysis.probability_of_loss * 100);
        logger.info("- Probability of Severe Drawdown (>20%): {:.2f}%", 
                   mc_analysis.probability_of_severe_drawdown * 100);
        
        logger.info("Backtest Engine initialized successfully");
        logger.info("Comprehensive performance metrics and Monte Carlo analysis ready");
        
        // Main event loop
        while (running.load()) {
            // In a real implementation, this would:
            // - Process incoming backtest requests
            // - Load historical data using memory-mapped files
            // - Run tick-by-tick simulations with realistic execution
            // - Calculate comprehensive performance metrics including Monte Carlo analysis
            
            std::this_thread::sleep_for(std::chrono::milliseconds(100));
        }
        
    } catch (const std::exception& e) {
        logger.error("Fatal error in Backtest Engine: {}", e.what());
        return 1;
    }
    
    logger.info("Backtest Engine shutting down...");
    
    // Cleanup is handled automatically by destructors
    
    logger.info("Backtest Engine shutdown complete");
    return 0;
}