#include "../include/strategy_execution_engine.hpp"
#include <iostream>

using namespace tradeflow;

// Simple callback implementation for testing
class TestCallback : public StrategyCallback {
public:
    void on_signal_generated(const TradingSignal& signal) override {
        std::cout << "Signal generated for strategy " << signal.strategy_id 
                  << " symbol " << signal.symbol << std::endl;
    }
    
    void on_order_placed(uint64_t order_id, const TradingSignal& signal) override {
        std::cout << "Order " << order_id << " placed for signal" << std::endl;
    }
    
    void on_order_filled(uint64_t order_id, uint32_t filled_quantity, uint64_t fill_price) override {
        std::cout << "Order " << order_id << " filled: " << filled_quantity 
                  << " @ " << fill_price << std::endl;
    }
    
    void on_position_updated(const StrategyPosition& position) override {
        std::cout << "Position updated for " << position.symbol 
                  << " quantity: " << position.quantity << std::endl;
    }
    
    void on_risk_breach(const char* reason) override {
        std::cout << "Risk breach: " << reason << std::endl;
    }
};

int main() {
    std::cout << "=== Strategy Execution Engine Test ===" << std::endl;
    
    try {
        // Create dependencies
        TradingAllocator allocator;
        LatencyTracker latency_tracker;
        OrderManagementSystem oms(allocator, latency_tracker);
        
        // Create strategy execution engine
        StrategyExecutionEngine engine(oms, allocator, latency_tracker);
        
        std::cout << "Strategy execution engine created successfully!" << std::endl;
        
        // Create test callback
        TestCallback callback;
        
        // Set up risk controls
        StrategyRiskControls risk_controls{};
        risk_controls.max_position_size = 1000;
        risk_controls.max_daily_loss = 10000;
        risk_controls.max_drawdown = 5000;
        risk_controls.max_portfolio_allocation = 0.1;
        risk_controls.max_orders_per_second = 10;
        risk_controls.enable_stop_loss = true;
        risk_controls.enable_take_profit = true;
        risk_controls.stop_loss_percentage = 0.02;
        risk_controls.take_profit_percentage = 0.05;
        
        // Register a test strategy
        bool registered = engine.register_strategy(12345, 1, risk_controls, &callback);
        
        if (registered) {
            std::cout << "Strategy registered successfully!" << std::endl;
        } else {
            std::cout << "Failed to register strategy" << std::endl;
            return 1;
        }
        
        // Create a test signal
        TradingSignal signal{};
        signal.strategy_id = 12345;
        signal.timestamp_nanos = LatencyTracker::now_nanos();
        std::strncpy(signal.symbol, "AAPL", sizeof(signal.symbol) - 1);
        signal.signal_type = SignalType::BUY;
        signal.strength = SignalStrength::STRONG;
        signal.target_price = 15000; // $150.00
        signal.suggested_quantity = 100;
        signal.confidence_score = 0.85;
        
        // Process the signal
        bool processed = engine.process_signal(signal);
        
        if (processed) {
            std::cout << "Signal processed successfully!" << std::endl;
        } else {
            std::cout << "Failed to process signal" << std::endl;
        }
        
        // Get engine statistics
        auto stats = engine.get_engine_stats();
        std::cout << "Signals processed: " << stats.signals_processed << std::endl;
        std::cout << "Orders generated: " << stats.orders_generated << std::endl;
        std::cout << "Risk violations: " << stats.risk_violations << std::endl;
        
        // Get strategy statistics
        auto strategy_stats = engine.get_strategy_stats(12345);
        std::cout << "Strategy signals: " << strategy_stats.signals_generated << std::endl;
        std::cout << "Strategy orders: " << strategy_stats.orders_placed << std::endl;
        
        std::cout << "=== Strategy execution engine test completed! ===" << std::endl;
        
    } catch (const std::exception& e) {
        std::cerr << "Exception: " << e.what() << std::endl;
        return 1;
    } catch (...) {
        std::cerr << "Unknown exception" << std::endl;
        return 1;
    }
    
    return 0;
}