#include "simulation_engine.hpp"
#include "logger.hpp"
#include <algorithm>
#include <cmath>
#include <map>

namespace tradeflow {

SimulationEngine::SimulationEngine() 
    : next_order_id_(1), total_slippage_(0.0), total_commissions_(0.0),
      rng_(std::random_device{}()), normal_dist_(0.0, 1.0), uniform_dist_(0.0, 1.0) {
    
    // Set default models
    slippage_model_ = SlippageModel();
    transaction_costs_ = TransactionCosts();
    liquidity_model_ = LiquidityModel();
    
    Logger::getInstance().debug("SimulationEngine initialized with default models");
}

SimulationEngine::~SimulationEngine() = default;

void SimulationEngine::setSlippageModel(const SlippageModel& model) {
    slippage_model_ = model;
    Logger::getInstance().debug("Updated slippage model");
}

void SimulationEngine::setTransactionCosts(const TransactionCosts& costs) {
    transaction_costs_ = costs;
    Logger::getInstance().debug("Updated transaction costs model");
}

void SimulationEngine::setLiquidityModel(const LiquidityModel& model) {
    liquidity_model_ = model;
    Logger::getInstance().debug("Updated liquidity model");
}

uint64_t SimulationEngine::submitOrder(const Order& order) {
    Order new_order = order;
    new_order.id = next_order_id_++;
    new_order.timestamp = std::chrono::duration_cast<std::chrono::milliseconds>(
        std::chrono::system_clock::now().time_since_epoch()).count();
    
    pending_orders_.push_back(new_order);
    
    Logger::getInstance().debug("Submitted order {} for {} shares of {} at ${}", 
                               new_order.id, new_order.quantity, new_order.symbol, new_order.price);
    
    return new_order.id;
}

bool SimulationEngine::cancelOrder(uint64_t order_id) {
    auto it = std::find_if(pending_orders_.begin(), pending_orders_.end(),
                          [order_id](const Order& order) { return order.id == order_id; });
    
    if (it != pending_orders_.end()) {
        it->status = OrderStatus::CANCELLED;
        Logger::getInstance().debug("Cancelled order {}", order_id);
        return true;
    }
    
    return false;
}

std::vector<Order> SimulationEngine::getPendingOrders() const {
    std::vector<Order> pending;
    std::copy_if(pending_orders_.begin(), pending_orders_.end(), 
                std::back_inserter(pending),
                [](const Order& order) { 
                    return order.status == OrderStatus::PENDING || 
                           order.status == OrderStatus::PARTIALLY_FILLED; 
                });
    return pending;
}

std::vector<Fill> SimulationEngine::getFills() const {
    return fills_;
}

void SimulationEngine::processMarketData(const MarketData& tick) {
    current_market_data_[tick.symbol] = tick;
    
    // Update bid-ask spread (simplified model)
    double mid_price = tick.close;
    double spread = slippage_model_.fixed_spread * mid_price;
    current_bid_ask_[tick.symbol] = {mid_price - spread/2, mid_price + spread/2};
    
    // Process pending orders against new market data
    auto pending = getPendingOrders();
    for (auto& order : pending_orders_) {
        if (order.symbol == tick.symbol && 
            (order.status == OrderStatus::PENDING || order.status == OrderStatus::PARTIALLY_FILLED)) {
            
            if (shouldFillOrder(order, tick)) {
                auto fills = executeOrder(order, tick);
                fills_.insert(fills_.end(), fills.begin(), fills.end());
                
                // Update statistics
                for (const auto& fill : fills) {
                    total_commissions_ += calculateTransactionCost(fill);
                }
            }
        }
    }
    
    // Remove fully filled or cancelled orders
    pending_orders_.erase(
        std::remove_if(pending_orders_.begin(), pending_orders_.end(),
                      [](const Order& order) {
                          return order.status == OrderStatus::FILLED || 
                                 order.status == OrderStatus::CANCELLED ||
                                 order.status == OrderStatus::REJECTED;
                      }), pending_orders_.end());
}

void SimulationEngine::processOrderBook(const std::string& symbol, double bid, double ask, 
                                       double bid_size, double ask_size) {
    current_bid_ask_[symbol] = {bid, ask};
    
    // Update liquidity levels
    liquidity_levels_[symbol][bid] = bid_size;
    liquidity_levels_[symbol][ask] = ask_size;
}

double SimulationEngine::calculateSlippage(const Order& order, double market_price, 
                                          double volatility) const {
    double base_slippage = 0.0;
    
    // Linear market impact
    base_slippage += slippage_model_.linear_impact * order.quantity;
    
    // Square root market impact (more realistic for large orders)
    base_slippage += slippage_model_.sqrt_impact * std::sqrt(order.quantity);
    
    // Volatility-based slippage
    base_slippage += slippage_model_.volatility_factor * volatility;
    
    // Add random component for realism
    double random_factor = normal_dist_(rng_) * 0.1; // 10% random variation
    base_slippage *= (1.0 + random_factor);
    
    // Apply direction (buy orders have positive slippage, sell orders negative)
    if (order.side == OrderSide::SELL) {
        base_slippage = -base_slippage;
    }
    
    return base_slippage * market_price;
}

double SimulationEngine::calculateMarketImpact(const Order& order, double available_liquidity) const {
    if (available_liquidity <= 0) {
        return 0.05; // 5% impact if no liquidity
    }
    
    double impact_ratio = order.quantity / available_liquidity;
    
    // Non-linear impact function
    double impact = 0.01 * std::pow(impact_ratio, 0.6); // Power law impact
    
    return std::min(impact, 0.1); // Cap at 10% impact
}

double SimulationEngine::calculateTransactionCost(const Fill& fill) const {
    double trade_value = fill.quantity * fill.price;
    
    // Commission calculation
    double commission = std::max(
        transaction_costs_.commission_per_share * fill.quantity,
        trade_value * transaction_costs_.commission_percentage
    );
    commission = std::max(commission, transaction_costs_.minimum_commission);
    
    // Regulatory fees
    double sec_fee = trade_value * transaction_costs_.sec_fee_rate;
    double exchange_fee = trade_value * transaction_costs_.exchange_fee_rate;
    
    return commission + sec_fee + exchange_fee;
}

double SimulationEngine::getAvailableLiquidity(const std::string& symbol, OrderSide side, 
                                              double price_level) const {
    auto symbol_it = liquidity_levels_.find(symbol);
    if (symbol_it == liquidity_levels_.end()) {
        return liquidity_model_.depth_at_touch; // Default liquidity
    }
    
    const auto& levels = symbol_it->second;
    
    // Find liquidity at or better than the price level
    double total_liquidity = 0.0;
    
    if (side == OrderSide::BUY) {
        // For buy orders, look at ask levels at or below the price
        for (const auto& level : levels) {
            if (level.first <= price_level) {
                total_liquidity += level.second;
            }
        }
    } else {
        // For sell orders, look at bid levels at or above the price
        for (const auto& level : levels) {
            if (level.first >= price_level) {
                total_liquidity += level.second;
            }
        }
    }
    
    return std::max(total_liquidity, liquidity_model_.depth_at_touch * 0.1);
}

void SimulationEngine::updateLiquidity(const std::string& symbol, const Fill& fill) {
    // Reduce liquidity at the fill price
    auto& levels = liquidity_levels_[symbol];
    if (levels.find(fill.price) != levels.end()) {
        levels[fill.price] = std::max(0.0, levels[fill.price] - fill.quantity);
    }
    
    // Simulate liquidity regeneration over time
    for (auto& level : levels) {
        level.second += level.second * liquidity_model_.regeneration_rate;
    }
}

std::vector<Fill> SimulationEngine::executeOrder(Order& order, const MarketData& current_tick) {
    std::vector<Fill> fills;
    
    if (order.status == OrderStatus::CANCELLED || order.status == OrderStatus::REJECTED) {
        return fills;
    }
    
    double remaining_quantity = order.quantity - order.filled_quantity;
    if (remaining_quantity <= 0) {
        order.status = OrderStatus::FILLED;
        return fills;
    }
    
    // Determine execution price based on order type
    double execution_price = 0.0;
    
    switch (order.type) {
        case OrderType::MARKET: {
            // Market orders execute at current market price with slippage
            double market_price = (order.side == OrderSide::BUY) ? 
                current_bid_ask_[order.symbol].second : current_bid_ask_[order.symbol].first;
            
            double volatility = calculateVolatility(order.symbol);
            double slippage = calculateSlippage(order, market_price, volatility);
            execution_price = market_price + slippage;
            break;
        }
        
        case OrderType::LIMIT: {
            // Limit orders only execute if market price is favorable
            double market_price = current_tick.close;
            
            if ((order.side == OrderSide::BUY && market_price <= order.price) ||
                (order.side == OrderSide::SELL && market_price >= order.price)) {
                execution_price = order.price;
            } else {
                return fills; // No execution
            }
            break;
        }
        
        case OrderType::STOP: {
            // Stop orders become market orders when triggered
            if (isOrderTriggered(order, current_tick)) {
                double market_price = (order.side == OrderSide::BUY) ? 
                    current_bid_ask_[order.symbol].second : current_bid_ask_[order.symbol].first;
                
                double volatility = calculateVolatility(order.symbol);
                double slippage = calculateSlippage(order, market_price, volatility);
                execution_price = market_price + slippage;
            } else {
                return fills; // Not triggered
            }
            break;
        }
        
        case OrderType::STOP_LIMIT: {
            // Stop-limit orders become limit orders when triggered
            if (isOrderTriggered(order, current_tick)) {
                double market_price = current_tick.close;
                
                if ((order.side == OrderSide::BUY && market_price <= order.price) ||
                    (order.side == OrderSide::SELL && market_price >= order.price)) {
                    execution_price = order.price;
                } else {
                    return fills; // Triggered but price not favorable
                }
            } else {
                return fills; // Not triggered
            }
            break;
        }
    }
    
    // Check available liquidity
    double available_liquidity = getAvailableLiquidity(order.symbol, order.side, execution_price);
    double market_impact = calculateMarketImpact(order, available_liquidity);
    
    // Adjust execution price for market impact
    if (order.side == OrderSide::BUY) {
        execution_price += execution_price * market_impact;
    } else {
        execution_price -= execution_price * market_impact;
    }
    
    // Determine fill quantity (may be partial)
    double fill_quantity = std::min(remaining_quantity, available_liquidity);
    
    // Add some randomness to partial fills for realism
    if (fill_quantity < remaining_quantity && uniform_dist_(rng_) < 0.3) {
        fill_quantity *= (0.5 + 0.5 * uniform_dist_(rng_)); // 50-100% of available
    }
    
    if (fill_quantity > 0) {
        // Create fill
        Fill fill(order.id, order.symbol, order.side, fill_quantity, 
                 execution_price, current_tick.timestamp);
        fill.commission = calculateTransactionCost(fill);
        
        fills.push_back(fill);
        
        // Update order
        order.filled_quantity += fill_quantity;
        order.avg_fill_price = ((order.avg_fill_price * (order.filled_quantity - fill_quantity)) + 
                               (execution_price * fill_quantity)) / order.filled_quantity;
        
        updateOrderStatus(order);
        updateLiquidity(order.symbol, fill);
        
        // Track slippage
        double expected_price = (order.side == OrderSide::BUY) ? 
            current_bid_ask_[order.symbol].second : current_bid_ask_[order.symbol].first;
        total_slippage_ += std::abs(execution_price - expected_price) * fill_quantity;
        
        Logger::getInstance().debug("Filled {} shares of {} at ${} (order {})", 
                                   fill_quantity, order.symbol, execution_price, order.id);
    }
    
    return fills;
}

bool SimulationEngine::shouldFillOrder(const Order& order, const MarketData& tick) const {
    switch (order.type) {
        case OrderType::MARKET:
            return true; // Market orders always execute
            
        case OrderType::LIMIT:
            if (order.side == OrderSide::BUY) {
                return tick.low <= order.price; // Buy limit triggered if price drops to limit
            } else {
                return tick.high >= order.price; // Sell limit triggered if price rises to limit
            }
            
        case OrderType::STOP:
        case OrderType::STOP_LIMIT:
            return isOrderTriggered(order, tick);
    }
    
    return false;
}

double SimulationEngine::calculateVolatility(const std::string& symbol, size_t lookback_periods) const {
    // Simplified volatility calculation
    // In a real implementation, this would use historical price data
    
    auto it = current_market_data_.find(symbol);
    if (it == current_market_data_.end()) {
        return 0.02; // Default 2% volatility
    }
    
    const MarketData& data = it->second;
    double daily_range = (data.high - data.low) / data.close;
    
    // Estimate volatility from daily range (simplified)
    return daily_range * 0.5; // Rough approximation
}

double SimulationEngine::getRandomFactor() const {
    return normal_dist_(rng_);
}

bool SimulationEngine::isOrderTriggered(const Order& order, const MarketData& tick) const {
    if (order.type != OrderType::STOP && order.type != OrderType::STOP_LIMIT) {
        return false;
    }
    
    if (order.side == OrderSide::BUY) {
        return tick.high >= order.stop_price; // Buy stop triggered if price rises to stop
    } else {
        return tick.low <= order.stop_price; // Sell stop triggered if price falls to stop
    }
}

std::vector<Fill> SimulationEngine::partialFill(Order& order, double available_quantity, 
                                               double fill_price, uint64_t timestamp) {
    std::vector<Fill> fills;
    
    double remaining = order.quantity - order.filled_quantity;
    double fill_qty = std::min(remaining, available_quantity);
    
    if (fill_qty > 0) {
        Fill fill(order.id, order.symbol, order.side, fill_qty, fill_price, timestamp);
        fill.commission = calculateTransactionCost(fill);
        fills.push_back(fill);
        
        order.filled_quantity += fill_qty;
        updateOrderStatus(order);
    }
    
    return fills;
}

void SimulationEngine::updateOrderStatus(Order& order) {
    if (order.filled_quantity >= order.quantity) {
        order.status = OrderStatus::FILLED;
    } else if (order.filled_quantity > 0) {
        order.status = OrderStatus::PARTIALLY_FILLED;
    }
}

void SimulationEngine::reset() {
    pending_orders_.clear();
    fills_.clear();
    current_market_data_.clear();
    current_bid_ask_.clear();
    liquidity_levels_.clear();
    
    next_order_id_ = 1;
    total_slippage_ = 0.0;
    total_commissions_ = 0.0;
    
    Logger::getInstance().debug("SimulationEngine reset");
}

} // namespace tradeflow