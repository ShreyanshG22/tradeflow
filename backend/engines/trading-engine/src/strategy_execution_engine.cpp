#include "../include/strategy_execution_engine.hpp"
#include <cstring>
#include <algorithm>

namespace tradeflow {

StrategyExecutionEngine::StrategyExecutionEngine(OrderManagementSystem& oms, 
                                               TradingAllocator& allocator, 
                                               LatencyTracker& latency_tracker)
    : oms_(oms), allocator_(allocator), latency_tracker_(latency_tracker) {
    
    // Initialize strategies array
    for (auto& strategy : strategies_) {
        strategy.strategy_id = 0;
        strategy.user_id = 0;
        strategy.callback = nullptr;
        strategy.enabled.store(false, std::memory_order_relaxed);
        strategy.last_signal_time.store(0, std::memory_order_relaxed);
        strategy.signals_this_second.store(0, std::memory_order_relaxed);
        strategy.active = false;
        
        // Initialize stats
        strategy.stats.signals_generated = 0;
        strategy.stats.orders_placed = 0;
        strategy.stats.orders_filled = 0;
        strategy.stats.profitable_trades = 0;
        strategy.stats.losing_trades = 0;
        strategy.stats.total_pnl = 0;
        strategy.stats.win_rate = 0.0;
        strategy.stats.sharpe_ratio = 0.0;
        strategy.stats.max_drawdown = 0;
    }
    
    // Initialize positions array
    for (auto& pos_info : positions_) {
        pos_info.key.strategy_id = 0;
        std::memset(pos_info.key.symbol, 0, sizeof(pos_info.key.symbol));
        pos_info.active.store(false, std::memory_order_relaxed);
        
        // Initialize position
        std::memset(pos_info.position.symbol, 0, sizeof(pos_info.position.symbol));
        pos_info.position.quantity = 0;
        pos_info.position.avg_entry_price = 0;
        pos_info.position.current_price = 0;
        pos_info.position.unrealized_pnl = 0;
        pos_info.position.realized_pnl = 0;
        pos_info.position.last_update_time = 0;
    }
}

bool StrategyExecutionEngine::register_strategy(uint64_t strategy_id, uint32_t user_id,
                                              const StrategyRiskControls& risk_controls,
                                              StrategyCallback* callback) noexcept {
    if (!callback || strategy_id == 0) {
        return false;
    }
    
    // Check if strategy already exists
    size_t existing_index = find_strategy_index(strategy_id);
    if (existing_index < MAX_STRATEGIES) {
        return false; // Strategy already registered
    }
    
    // Find empty slot
    size_t current_count = strategy_count_.load(std::memory_order_acquire);
    if (current_count >= MAX_STRATEGIES) {
        return false;
    }
    
    // Try to increment strategy count atomically
    if (!strategy_count_.compare_exchange_weak(current_count, current_count + 1, std::memory_order_acq_rel)) {
        return false;
    }
    
    // Initialize strategy info
    StrategyInfo& strategy = strategies_[current_count];
    strategy.strategy_id = strategy_id;
    strategy.user_id = user_id;
    strategy.risk_controls = risk_controls;
    strategy.callback = callback;
    strategy.enabled.store(true, std::memory_order_release);
    strategy.last_signal_time.store(0, std::memory_order_relaxed);
    strategy.signals_this_second.store(0, std::memory_order_relaxed);
    strategy.active = true;
    
    // Reset stats
    strategy.stats.signals_generated = 0;
    strategy.stats.orders_placed = 0;
    strategy.stats.orders_filled = 0;
    strategy.stats.profitable_trades = 0;
    strategy.stats.losing_trades = 0;
    strategy.stats.total_pnl = 0;
    strategy.stats.win_rate = 0.0;
    strategy.stats.sharpe_ratio = 0.0;
    strategy.stats.max_drawdown = 0;
    
    return true;
}

bool StrategyExecutionEngine::unregister_strategy(uint64_t strategy_id) noexcept {
    size_t index = find_strategy_index(strategy_id);
    if (index >= MAX_STRATEGIES) {
        return false;
    }
    
    // Disable and mark as inactive
    strategies_[index].enabled.store(false, std::memory_order_release);
    strategies_[index].active = false;
    strategies_[index].callback = nullptr;
    
    return true;
}

bool StrategyExecutionEngine::process_signal(const TradingSignal& signal) noexcept {
    LatencyMeasurement measurement(signal_processing_latency_);
    
    // Check emergency stop
    if (emergency_stop_.load(std::memory_order_acquire)) {
        return false;
    }
    
    signals_processed_.fetch_add(1, std::memory_order_relaxed);
    
    // Find strategy
    size_t strategy_index = find_strategy_index(signal.strategy_id);
    if (strategy_index >= MAX_STRATEGIES) {
        return false;
    }
    
    StrategyInfo& strategy = strategies_[strategy_index];
    
    // Check if strategy is enabled
    if (!strategy.enabled.load(std::memory_order_acquire) || !strategy.active) {
        return false;
    }
    
    // Validate signal
    if (!validate_signal(signal, strategy)) {
        return false;
    }
    
    // Check risk limits
    if (!check_risk_limits(signal, strategy)) {
        risk_violations_.fetch_add(1, std::memory_order_relaxed);
        if (strategy.callback) {
            strategy.callback->on_risk_breach("Risk limits exceeded");
        }
        return false;
    }
    
    // Update strategy stats
    strategy.stats.signals_generated++;
    
    // Notify callback
    if (strategy.callback) {
        strategy.callback->on_signal_generated(signal);
    }
    
    // Execute signal if it's a trading signal
    if (signal.signal_type == SignalType::BUY || signal.signal_type == SignalType::SELL) {
        OrderExecutionResult result = execute_signal(signal, strategy);
        
        if (result.validation_result == OrderValidationResult::VALID) {
            orders_generated_.fetch_add(1, std::memory_order_relaxed);
            strategy.stats.orders_placed++;
            
            if (strategy.callback) {
                strategy.callback->on_order_placed(result.order_id, signal);
            }
            
            // If order was filled immediately
            if (result.executed_quantity > 0) {
                strategy.stats.orders_filled++;
                
                if (strategy.callback) {
                    strategy.callback->on_order_filled(result.order_id, result.executed_quantity, result.executed_price);
                }
                
                // Update position
                int64_t quantity_change = (signal.signal_type == SignalType::BUY) ? 
                                        static_cast<int64_t>(result.executed_quantity) : 
                                        -static_cast<int64_t>(result.executed_quantity);
                
                update_position(signal.strategy_id, signal.symbol, quantity_change, result.executed_price);
            }
        }
    }
    
    return true;
}

void StrategyExecutionEngine::update_market_price(const char* symbol, uint64_t price) noexcept {
    if (!symbol) return;
    
    // Update all positions for this symbol
    size_t count = position_count_.load(std::memory_order_acquire);
    for (size_t i = 0; i < count && i < MAX_POSITIONS; ++i) {
        if (positions_[i].active.load(std::memory_order_acquire) &&
            std::strcmp(positions_[i].position.symbol, symbol) == 0) {
            
            positions_[i].position.current_price = price;
            positions_[i].position.last_update_time = LatencyTracker::now_nanos();
            
            // Calculate unrealized P&L
            int64_t quantity = positions_[i].position.quantity;
            if (quantity != 0) {
                int64_t price_diff = static_cast<int64_t>(price) - static_cast<int64_t>(positions_[i].position.avg_entry_price);
                positions_[i].position.unrealized_pnl = quantity * price_diff;
            }
            
            // Notify strategy callback
            size_t strategy_index = find_strategy_index(positions_[i].key.strategy_id);
            if (strategy_index < MAX_STRATEGIES && strategies_[strategy_index].callback) {
                strategies_[strategy_index].callback->on_position_updated(positions_[i].position);
            }
        }
    }
}

const StrategyPosition* StrategyExecutionEngine::get_position(uint64_t strategy_id, const char* symbol) const noexcept {
    size_t index = find_position_index(strategy_id, symbol);
    if (index < MAX_POSITIONS && positions_[index].active.load(std::memory_order_acquire)) {
        return &positions_[index].position;
    }
    return nullptr;
}

StrategyStats StrategyExecutionEngine::get_strategy_stats(uint64_t strategy_id) const noexcept {
    size_t index = find_strategy_index(strategy_id);
    if (index < MAX_STRATEGIES && strategies_[index].active) {
        StrategyStats stats = strategies_[index].stats;
        
        // Calculate win rate
        uint64_t total_trades = stats.profitable_trades + stats.losing_trades;
        if (total_trades > 0) {
            stats.win_rate = static_cast<double>(stats.profitable_trades) / total_trades;
        }
        
        return stats;
    }
    
    return StrategyStats{};
}

void StrategyExecutionEngine::set_strategy_enabled(uint64_t strategy_id, bool enabled) noexcept {
    size_t index = find_strategy_index(strategy_id);
    if (index < MAX_STRATEGIES) {
        strategies_[index].enabled.store(enabled, std::memory_order_release);
    }
}

void StrategyExecutionEngine::emergency_stop_all() noexcept {
    emergency_stop_.store(true, std::memory_order_release);
    
    // Disable all strategies
    size_t count = strategy_count_.load(std::memory_order_acquire);
    for (size_t i = 0; i < count && i < MAX_STRATEGIES; ++i) {
        if (strategies_[i].active) {
            strategies_[i].enabled.store(false, std::memory_order_release);
            
            if (strategies_[i].callback) {
                strategies_[i].callback->on_risk_breach("Emergency stop activated");
            }
        }
    }
}

StrategyExecutionEngine::EngineStats StrategyExecutionEngine::get_engine_stats() const noexcept {
    EngineStats stats{};
    
    stats.signals_processed = signals_processed_.load(std::memory_order_relaxed);
    stats.orders_generated = orders_generated_.load(std::memory_order_relaxed);
    stats.risk_violations = risk_violations_.load(std::memory_order_relaxed);
    
    stats.signal_processing_latency = signal_processing_latency_.get_stats();
    stats.order_execution_latency = order_execution_latency_.get_stats();
    
    return stats;
}

void StrategyExecutionEngine::reset_stats() noexcept {
    signals_processed_.store(0, std::memory_order_relaxed);
    orders_generated_.store(0, std::memory_order_relaxed);
    risk_violations_.store(0, std::memory_order_relaxed);
    
    signal_processing_latency_.reset();
    order_execution_latency_.reset();
    
    // Reset strategy stats
    size_t count = strategy_count_.load(std::memory_order_acquire);
    for (size_t i = 0; i < count && i < MAX_STRATEGIES; ++i) {
        if (strategies_[i].active) {
            strategies_[i].stats.signals_generated = 0;
            strategies_[i].stats.orders_placed = 0;
            strategies_[i].stats.orders_filled = 0;
            strategies_[i].stats.profitable_trades = 0;
            strategies_[i].stats.losing_trades = 0;
            strategies_[i].stats.total_pnl = 0;
            strategies_[i].stats.win_rate = 0.0;
            strategies_[i].stats.sharpe_ratio = 0.0;
            strategies_[i].stats.max_drawdown = 0;
        }
    }
}

// Private helper methods

size_t StrategyExecutionEngine::find_strategy_index(uint64_t strategy_id) const noexcept {
    size_t count = strategy_count_.load(std::memory_order_acquire);
    for (size_t i = 0; i < count && i < MAX_STRATEGIES; ++i) {
        if (strategies_[i].active && strategies_[i].strategy_id == strategy_id) {
            return i;
        }
    }
    return MAX_STRATEGIES;
}

size_t StrategyExecutionEngine::find_position_index(uint64_t strategy_id, const char* symbol) const noexcept {
    if (!symbol) return MAX_POSITIONS;
    
    size_t count = position_count_.load(std::memory_order_acquire);
    for (size_t i = 0; i < count && i < MAX_POSITIONS; ++i) {
        if (positions_[i].active.load(std::memory_order_acquire) &&
            positions_[i].key.strategy_id == strategy_id &&
            std::strcmp(positions_[i].key.symbol, symbol) == 0) {
            return i;
        }
    }
    return MAX_POSITIONS;
}

size_t StrategyExecutionEngine::create_position(uint64_t strategy_id, const char* symbol) noexcept {
    if (!symbol || std::strlen(symbol) >= 16) {
        return MAX_POSITIONS;
    }
    
    size_t current_count = position_count_.load(std::memory_order_acquire);
    if (current_count >= MAX_POSITIONS) {
        return MAX_POSITIONS;
    }
    
    // Try to increment position count atomically
    if (!position_count_.compare_exchange_weak(current_count, current_count + 1, std::memory_order_acq_rel)) {
        return MAX_POSITIONS;
    }
    
    // Initialize position
    PositionInfo& pos_info = positions_[current_count];
    pos_info.key.strategy_id = strategy_id;
    std::strncpy(pos_info.key.symbol, symbol, sizeof(pos_info.key.symbol) - 1);
    pos_info.key.symbol[sizeof(pos_info.key.symbol) - 1] = '\0';
    
    std::strncpy(pos_info.position.symbol, symbol, sizeof(pos_info.position.symbol) - 1);
    pos_info.position.symbol[sizeof(pos_info.position.symbol) - 1] = '\0';
    pos_info.position.quantity = 0;
    pos_info.position.avg_entry_price = 0;
    pos_info.position.current_price = 0;
    pos_info.position.unrealized_pnl = 0;
    pos_info.position.realized_pnl = 0;
    pos_info.position.last_update_time = LatencyTracker::now_nanos();
    
    pos_info.active.store(true, std::memory_order_release);
    
    return current_count;
}

bool StrategyExecutionEngine::validate_signal(const TradingSignal& signal, const StrategyInfo& strategy) noexcept {
    // Basic signal validation
    if (signal.strategy_id != strategy.strategy_id) {
        return false;
    }
    
    if (signal.signal_type == SignalType::NONE) {
        return false;
    }
    
    if (std::strlen(signal.symbol) == 0 || std::strlen(signal.symbol) >= 16) {
        return false;
    }
    
    if (signal.confidence_score < 0.0 || signal.confidence_score > 1.0) {
        return false;
    }
    
    return true;
}

bool StrategyExecutionEngine::check_risk_limits(const TradingSignal& signal, const StrategyInfo& strategy) noexcept {
    const StrategyRiskControls& controls = strategy.risk_controls;
    
    // Check rate limiting
    uint64_t current_time = LatencyTracker::now_nanos();
    uint64_t last_signal_time = strategy.last_signal_time.load(std::memory_order_acquire);
    
    // Reset counter if we're in a new second
    if (current_time - last_signal_time > 1000000000ULL) { // 1 second in nanoseconds
        const_cast<StrategyInfo&>(strategy).signals_this_second.store(0, std::memory_order_relaxed);
        const_cast<StrategyInfo&>(strategy).last_signal_time.store(current_time, std::memory_order_relaxed);
    }
    
    uint32_t signals_this_second = const_cast<StrategyInfo&>(strategy).signals_this_second.fetch_add(1, std::memory_order_relaxed);
    if (signals_this_second >= controls.max_orders_per_second) {
        return false;
    }
    
    // Check position size limits
    if (signal.suggested_quantity > controls.max_position_size) {
        return false;
    }
    
    // Check daily loss limits (simplified check)
    if (strategy.stats.total_pnl < -static_cast<int64_t>(controls.max_daily_loss)) {
        return false;
    }
    
    return true;
}

uint32_t StrategyExecutionEngine::calculate_position_size(const TradingSignal& signal, const StrategyInfo& strategy) noexcept {
    uint32_t suggested_size = signal.suggested_quantity;
    uint32_t max_size = strategy.risk_controls.max_position_size;
    
    // Apply signal strength multiplier
    double strength_multiplier = static_cast<double>(signal.strength) / 4.0; // Normalize to 0.25-1.0
    uint32_t adjusted_size = static_cast<uint32_t>(suggested_size * strength_multiplier);
    
    // Apply confidence score
    adjusted_size = static_cast<uint32_t>(adjusted_size * signal.confidence_score);
    
    // Ensure within limits
    return std::min(adjusted_size, max_size);
}

uint64_t StrategyExecutionEngine::calculate_stop_loss_price(const TradingSignal& signal, const StrategyInfo& strategy) noexcept {
    if (!strategy.risk_controls.enable_stop_loss) {
        return 0;
    }
    
    if (signal.stop_loss_price > 0) {
        return signal.stop_loss_price;
    }
    
    // Calculate based on percentage
    double stop_loss_pct = strategy.risk_controls.stop_loss_percentage;
    if (signal.signal_type == SignalType::BUY) {
        return static_cast<uint64_t>(signal.target_price * (1.0 - stop_loss_pct));
    } else {
        return static_cast<uint64_t>(signal.target_price * (1.0 + stop_loss_pct));
    }
}

uint64_t StrategyExecutionEngine::calculate_take_profit_price(const TradingSignal& signal, const StrategyInfo& strategy) noexcept {
    if (!strategy.risk_controls.enable_take_profit) {
        return 0;
    }
    
    if (signal.take_profit_price > 0) {
        return signal.take_profit_price;
    }
    
    // Calculate based on percentage
    double take_profit_pct = strategy.risk_controls.take_profit_percentage;
    if (signal.signal_type == SignalType::BUY) {
        return static_cast<uint64_t>(signal.target_price * (1.0 + take_profit_pct));
    } else {
        return static_cast<uint64_t>(signal.target_price * (1.0 - take_profit_pct));
    }
}

void StrategyExecutionEngine::update_position(uint64_t strategy_id, const char* symbol, 
                                            int64_t quantity_change, uint64_t price) noexcept {
    size_t index = find_position_index(strategy_id, symbol);
    if (index >= MAX_POSITIONS) {
        index = create_position(strategy_id, symbol);
        if (index >= MAX_POSITIONS) {
            return;
        }
    }
    
    StrategyPosition& position = positions_[index].position;
    
    // Calculate new average entry price
    int64_t old_quantity = position.quantity;
    int64_t new_quantity = old_quantity + quantity_change;
    
    if (new_quantity != 0 && quantity_change != 0) {
        // Weighted average for entry price
        uint64_t old_value = static_cast<uint64_t>(std::abs(old_quantity)) * position.avg_entry_price;
        uint64_t new_value = static_cast<uint64_t>(std::abs(quantity_change)) * price;
        position.avg_entry_price = (old_value + new_value) / static_cast<uint64_t>(std::abs(new_quantity));
    }
    
    position.quantity = new_quantity;
    position.current_price = price;
    position.last_update_time = LatencyTracker::now_nanos();
    
    // Calculate realized P&L if position is being closed
    if ((old_quantity > 0 && quantity_change < 0) || (old_quantity < 0 && quantity_change > 0)) {
        int64_t closed_quantity = std::min(std::abs(old_quantity), std::abs(quantity_change));
        int64_t price_diff = static_cast<int64_t>(price) - static_cast<int64_t>(position.avg_entry_price);
        
        if (old_quantity > 0) {
            position.realized_pnl += closed_quantity * price_diff;
        } else {
            position.realized_pnl += closed_quantity * (-price_diff);
        }
    }
    
    // Update unrealized P&L
    if (position.quantity != 0) {
        int64_t price_diff = static_cast<int64_t>(price) - static_cast<int64_t>(position.avg_entry_price);
        position.unrealized_pnl = position.quantity * price_diff;
    } else {
        position.unrealized_pnl = 0;
    }
}

void StrategyExecutionEngine::update_strategy_stats(uint64_t strategy_id, bool profitable_trade, int64_t pnl) noexcept {
    size_t index = find_strategy_index(strategy_id);
    if (index < MAX_STRATEGIES) {
        StrategyStats& stats = strategies_[index].stats;
        
        if (profitable_trade) {
            stats.profitable_trades++;
        } else {
            stats.losing_trades++;
        }
        
        stats.total_pnl += pnl;
        
        // Update max drawdown
        if (pnl < 0 && static_cast<uint64_t>(-pnl) > stats.max_drawdown) {
            stats.max_drawdown = static_cast<uint64_t>(-pnl);
        }
    }
}

OrderExecutionResult StrategyExecutionEngine::execute_signal(const TradingSignal& signal, const StrategyInfo& strategy) noexcept {
    LatencyMeasurement measurement(order_execution_latency_);
    
    // Calculate position size
    uint32_t position_size = calculate_position_size(signal, strategy);
    if (position_size == 0) {
        return OrderExecutionResult{};
    }
    
    // Determine order side
    OrderSide order_side = (signal.signal_type == SignalType::BUY) ? OrderSide::BUY : OrderSide::SELL;
    
    // Generate unique order ID
    static std::atomic<uint64_t> order_id_counter{1000000};
    uint64_t order_id = order_id_counter.fetch_add(1, std::memory_order_relaxed);
    
    // Submit order to OMS
    return oms_.submit_order(order_id, signal.symbol, order_side, position_size, 
                           signal.target_price, strategy.user_id);
}

} // namespace tradeflow