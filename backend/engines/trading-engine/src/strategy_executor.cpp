// Trading Engine - Strategy Executor Implementation
// High-performance strategy execution with minimal latency

#include "logger.hpp"
#include <algorithm>
#include <chrono>
#include <vector>
#include <string>
#include <unordered_map>
#include <cmath>
#include <utility>

namespace tradeflow {

struct MarketTick {
    std::string symbol;
    double price;
    double volume;
    std::chrono::steady_clock::time_point timestamp;
};

struct TradingSignal {
    std::string strategy_id;
    std::string symbol;
    std::string side; // "BUY" or "SELL"
    double quantity;
    double price;
    std::chrono::steady_clock::time_point timestamp;
};

class StrategyExecutor {
public:
    StrategyExecutor() = default;
    
    // Initialize strategy execution engine
    bool initialize() {
        auto& logger = Logger::getInstance();
        logger.info("Initializing Strategy Executor");
        
        // Set up strategy processing pipeline
        is_initialized_ = true;
        next_strategy_id_ = 1;
        
        // Initialize signal processing components
        signal_queue_.clear();
        
        // Configure position management
        positions_.clear();
        
        logger.info("Strategy Executor initialized successfully");
        return true;
    }
    
    // Process market data and generate signals
    void process_market_data(const MarketTick& tick) {
        if (!is_initialized_) return;
        
        auto start = std::chrono::steady_clock::now();
        
        // Update strategy indicators for each active strategy
        for (auto& strategy : active_strategies_) {
            if (strategy.is_active) {
                update_strategy_indicators(strategy, tick);
                
                // Generate trading signals based on updated indicators
                auto signals = generate_trading_signals(strategy, tick);
                
                // Add signals to processing queue
                for (const auto& signal : signals) {
                    signal_queue_.push_back(signal);
                }
                
                // Manage existing positions
                manage_positions(strategy, tick);
                
                strategy.last_update = std::chrono::steady_clock::now();
            }
        }
        
        record_execution_latency(start);
        
        auto& logger = Logger::getInstance();
        logger.debug("Processed market data for " + tick.symbol + " at price " + std::to_string(tick.price));
    }
    
    // Execute trading signal
    void execute_signal(const TradingSignal& signal) {
        auto start = std::chrono::steady_clock::now();
        
        // Validate signal parameters
        if (!validate_signal(signal)) {
            auto& logger = Logger::getInstance();
            logger.warn("Invalid signal rejected: " + signal.strategy_id);
            return;
        }
        
        // Apply risk management rules
        if (!apply_risk_checks(signal)) {
            auto& logger = Logger::getInstance();
            logger.warn("Signal failed risk checks: " + signal.strategy_id);
            return;
        }
        
        // Submit order to execution engine
        submit_order_to_execution_engine(signal);
        
        // Update position tracking
        update_position_tracking(signal);
        
        record_execution_latency(start);
        
        auto& logger = Logger::getInstance();
        logger.info("Executed signal for " + signal.symbol + " (" + signal.side + " " + std::to_string(signal.quantity) + ")");
    }
    
    // Calculate P&L for positions
    double calculate_pnl(const std::string& strategy_id) {
        double total_pnl = 0.0;
        
        // Calculate realized and unrealized P&L
        for (const auto& position : positions_) {
            if (position.strategy_id == strategy_id) {
                // Realized P&L from closed trades
                total_pnl += position.realized_pnl;
                
                // Unrealized P&L from open positions
                if (position.quantity != 0) {
                    double current_value = position.quantity * position.current_price;
                    double cost_basis = position.quantity * position.average_price;
                    total_pnl += (current_value - cost_basis);
                }
            }
        }
        
        // Update position values in cache
        position_pnl_cache_[strategy_id] = total_pnl;
        
        return total_pnl;
    }
    
    // Shutdown strategy executor
    void shutdown() {
        auto& logger = Logger::getInstance();
        logger.info("Shutting down Strategy Executor");
        
        // Save strategy states to persistent storage
        save_strategy_states();
        
        // Close open positions if required (risk management decision)
        if (close_positions_on_shutdown_) {
            close_all_positions();
        }
        
        // Clean up resources
        active_strategies_.clear();
        positions_.clear();
        signal_queue_.clear();
        position_pnl_cache_.clear();
        
        is_initialized_ = false;
        
        logger.info("Strategy Executor shutdown complete");
    }
    
private:
    // Strategy execution pipeline components
    struct StrategyState {
        std::string strategy_id;
        bool is_active;
        double position_size;
        std::chrono::steady_clock::time_point last_update;
        
        // Strategy-specific indicators
        double moving_average_short = 0.0;
        double moving_average_long = 0.0;
        double rsi = 50.0;
        double bollinger_upper = 0.0;
        double bollinger_lower = 0.0;
        
        // Price history for calculations
        std::vector<double> price_history;
        static const size_t MAX_HISTORY = 200;
    };
    
    struct Position {
        std::string strategy_id;
        std::string symbol;
        double quantity;
        double average_price;
        double current_price;
        double realized_pnl;
        std::chrono::steady_clock::time_point created_at;
    };
    
    std::vector<StrategyState> active_strategies_;
    std::vector<Position> positions_;
    std::vector<TradingSignal> signal_queue_;
    std::unordered_map<std::string, double> position_pnl_cache_;
    
    bool is_initialized_ = false;
    int next_strategy_id_ = 1;
    bool close_positions_on_shutdown_ = false;
    
    // Helper methods for actual implementation
    void update_strategy_indicators(StrategyState& strategy, const MarketTick& tick) {
        // Add price to history
        strategy.price_history.push_back(tick.price);
        if (strategy.price_history.size() > StrategyState::MAX_HISTORY) {
            strategy.price_history.erase(strategy.price_history.begin());
        }
        
        if (strategy.price_history.size() >= 20) {
            // Calculate moving averages
            strategy.moving_average_short = calculate_moving_average(strategy.price_history, 10);
            strategy.moving_average_long = calculate_moving_average(strategy.price_history, 20);
            
            // Calculate RSI
            strategy.rsi = calculate_rsi(strategy.price_history, 14);
            
            // Calculate Bollinger Bands
            auto bollinger = calculate_bollinger_bands(strategy.price_history, 20, 2.0);
            strategy.bollinger_upper = bollinger.first;
            strategy.bollinger_lower = bollinger.second;
        }
    }
    
    std::vector<TradingSignal> generate_trading_signals(const StrategyState& strategy, const MarketTick& tick) {
        std::vector<TradingSignal> signals;
        
        if (strategy.price_history.size() < 20) return signals;
        
        // Simple moving average crossover strategy
        if (strategy.moving_average_short > strategy.moving_average_long && 
            strategy.rsi < 70 && tick.price > strategy.bollinger_lower) {
            
            TradingSignal signal;
            signal.strategy_id = strategy.strategy_id;
            signal.symbol = tick.symbol;
            signal.side = "BUY";
            signal.quantity = calculate_position_size(strategy, tick.price);
            signal.price = tick.price;
            signal.timestamp = tick.timestamp;
            
            signals.push_back(signal);
        }
        else if (strategy.moving_average_short < strategy.moving_average_long && 
                 strategy.rsi > 30 && tick.price < strategy.bollinger_upper) {
            
            TradingSignal signal;
            signal.strategy_id = strategy.strategy_id;
            signal.symbol = tick.symbol;
            signal.side = "SELL";
            signal.quantity = calculate_position_size(strategy, tick.price);
            signal.price = tick.price;
            signal.timestamp = tick.timestamp;
            
            signals.push_back(signal);
        }
        
        return signals;
    }
    
    void manage_positions(StrategyState& strategy, const MarketTick& tick) {
        // Update current prices for positions
        for (auto& position : positions_) {
            if (position.strategy_id == strategy.strategy_id && position.symbol == tick.symbol) {
                position.current_price = tick.price;
            }
        }
        
        // Check for stop-loss or take-profit conditions
        check_exit_conditions(strategy, tick);
    }
    
    bool validate_signal(const TradingSignal& signal) {
        // Basic validation
        if (signal.symbol.empty() || signal.quantity <= 0 || signal.price <= 0) {
            return false;
        }
        
        if (signal.side != "BUY" && signal.side != "SELL") {
            return false;
        }
        
        return true;
    }
    
    bool apply_risk_checks(const TradingSignal& signal) {
        // Position size limits
        double max_position_size = 10000.0; // $10,000 max per position
        if (signal.quantity * signal.price > max_position_size) {
            return false;
        }
        
        // Maximum number of positions per strategy
        int position_count = 0;
        for (const auto& pos : positions_) {
            if (pos.strategy_id == signal.strategy_id && pos.quantity != 0) {
                position_count++;
            }
        }
        
        if (position_count >= 5) { // Max 5 positions per strategy
            return false;
        }
        
        return true;
    }
    
    void submit_order_to_execution_engine(const TradingSignal& signal) {
        // In a real implementation, this would interface with the execution engine
        // For now, we'll simulate the order submission
        auto& logger = Logger::getInstance();
        logger.info("Submitting order: " + signal.side + " " + std::to_string(signal.quantity) + 
                   " " + signal.symbol + " @ " + std::to_string(signal.price));
    }
    
    void update_position_tracking(const TradingSignal& signal) {
        // Find existing position or create new one
        auto it = std::find_if(positions_.begin(), positions_.end(),
            [&](const Position& pos) {
                return pos.strategy_id == signal.strategy_id && pos.symbol == signal.symbol;
            });
        
        if (it != positions_.end()) {
            // Update existing position
            if (signal.side == "BUY") {
                double total_cost = (it->quantity * it->average_price) + (signal.quantity * signal.price);
                it->quantity += signal.quantity;
                it->average_price = total_cost / it->quantity;
            } else { // SELL
                it->quantity -= signal.quantity;
                if (it->quantity <= 0) {
                    // Position closed, calculate realized P&L
                    it->realized_pnl += (signal.price - it->average_price) * signal.quantity;
                    it->quantity = 0;
                }
            }
        } else {
            // Create new position
            Position new_pos;
            new_pos.strategy_id = signal.strategy_id;
            new_pos.symbol = signal.symbol;
            new_pos.quantity = (signal.side == "BUY") ? signal.quantity : -signal.quantity;
            new_pos.average_price = signal.price;
            new_pos.current_price = signal.price;
            new_pos.realized_pnl = 0.0;
            new_pos.created_at = signal.timestamp;
            
            positions_.push_back(new_pos);
        }
    }
    
    // Technical indicator calculations
    double calculate_moving_average(const std::vector<double>& prices, int period) {
        if (prices.size() < period) return 0.0;
        
        double sum = 0.0;
        for (int i = prices.size() - period; i < prices.size(); ++i) {
            sum += prices[i];
        }
        return sum / period;
    }
    
    double calculate_rsi(const std::vector<double>& prices, int period) {
        if (prices.size() < period + 1) return 50.0;
        
        double gains = 0.0, losses = 0.0;
        
        for (int i = prices.size() - period; i < prices.size(); ++i) {
            double change = prices[i] - prices[i-1];
            if (change > 0) gains += change;
            else losses -= change;
        }
        
        double avg_gain = gains / period;
        double avg_loss = losses / period;
        
        if (avg_loss == 0) return 100.0;
        
        double rs = avg_gain / avg_loss;
        return 100.0 - (100.0 / (1.0 + rs));
    }
    
    std::pair<double, double> calculate_bollinger_bands(const std::vector<double>& prices, int period, double std_dev) {
        if (prices.size() < period) return {0.0, 0.0};
        
        double ma = calculate_moving_average(prices, period);
        
        double variance = 0.0;
        for (int i = prices.size() - period; i < prices.size(); ++i) {
            variance += std::pow(prices[i] - ma, 2);
        }
        variance /= period;
        
        double standard_deviation = std::sqrt(variance);
        
        return {ma + (std_dev * standard_deviation), ma - (std_dev * standard_deviation)};
    }
    
    double calculate_position_size(const StrategyState& strategy, double price) {
        // Simple position sizing: 1% of assumed $100,000 account
        double account_size = 100000.0;
        double risk_per_trade = 0.01;
        return (account_size * risk_per_trade) / price;
    }
    
    void check_exit_conditions(const StrategyState& strategy, const MarketTick& tick) {
        // Check stop-loss and take-profit for positions
        for (auto& position : positions_) {
            if (position.strategy_id == strategy.strategy_id && 
                position.symbol == tick.symbol && position.quantity != 0) {
                
                double pnl_percent = (tick.price - position.average_price) / position.average_price;
                
                // Stop loss at -2%
                if (pnl_percent < -0.02) {
                    create_exit_signal(position, tick, "STOP_LOSS");
                }
                // Take profit at +3%
                else if (pnl_percent > 0.03) {
                    create_exit_signal(position, tick, "TAKE_PROFIT");
                }
            }
        }
    }
    
    void create_exit_signal(const Position& position, const MarketTick& tick, const std::string& reason) {
        TradingSignal exit_signal;
        exit_signal.strategy_id = position.strategy_id;
        exit_signal.symbol = position.symbol;
        exit_signal.side = (position.quantity > 0) ? "SELL" : "BUY";
        exit_signal.quantity = std::abs(position.quantity);
        exit_signal.price = tick.price;
        exit_signal.timestamp = tick.timestamp;
        
        signal_queue_.push_back(exit_signal);
        
        auto& logger = Logger::getInstance();
        logger.info("Created exit signal (" + reason + "): " + exit_signal.side + " " + 
                   std::to_string(exit_signal.quantity) + " " + exit_signal.symbol);
    }
    
    void save_strategy_states() {
        // In a real implementation, this would save to database or file
        auto& logger = Logger::getInstance();
        logger.info("Saving " + std::to_string(active_strategies_.size()) + " strategy states");
    }
    
    void close_all_positions() {
        auto& logger = Logger::getInstance();
        logger.info("Closing all open positions");
        
        for (const auto& position : positions_) {
            if (position.quantity != 0) {
                logger.info("Closing position: " + position.symbol + " qty=" + std::to_string(position.quantity));
            }
        }
    }
    
    // Performance tracking
    void record_execution_latency(const std::chrono::steady_clock::time_point& start) {
        auto end = std::chrono::steady_clock::now();
        auto latency = std::chrono::duration_cast<std::chrono::microseconds>(end - start);
        
        auto& logger = Logger::getInstance();
        logger.debug("Strategy execution latency: " + std::to_string(latency.count()) + " microseconds");
    }
};

} // namespace tradeflow