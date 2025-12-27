#pragma once

#include "data_loader.hpp"
#include <vector>
#include <random>
#include <cstdint>
#include <map>
#include <string>

namespace tradeflow {

enum class OrderType {
    MARKET,
    LIMIT,
    STOP,
    STOP_LIMIT
};

enum class OrderSide {
    BUY,
    SELL
};

enum class OrderStatus {
    PENDING,
    PARTIALLY_FILLED,
    FILLED,
    CANCELLED,
    REJECTED
};

struct Order {
    uint64_t id;
    std::string symbol;
    OrderType type;
    OrderSide side;
    double quantity;
    double price;           // For limit orders
    double stop_price;      // For stop orders
    uint64_t timestamp;
    OrderStatus status;
    double filled_quantity;
    double avg_fill_price;
    
    Order(uint64_t order_id, const std::string& sym, OrderType t, OrderSide s, 
          double qty, double p = 0.0, double stop_p = 0.0)
        : id(order_id), symbol(sym), type(t), side(s), quantity(qty), 
          price(p), stop_price(stop_p), timestamp(0), status(OrderStatus::PENDING),
          filled_quantity(0.0), avg_fill_price(0.0) {}
};

struct Fill {
    uint64_t order_id;
    std::string symbol;
    OrderSide side;
    double quantity;
    double price;
    uint64_t timestamp;
    double commission;
    
    Fill(uint64_t oid, const std::string& sym, OrderSide s, double qty, 
         double p, uint64_t ts, double comm = 0.0)
        : order_id(oid), symbol(sym), side(s), quantity(qty), 
          price(p), timestamp(ts), commission(comm) {}
};

struct SlippageModel {
    double linear_impact;      // Price impact per unit volume
    double sqrt_impact;        // Square root price impact
    double fixed_spread;       // Fixed bid-ask spread
    double volatility_factor;  // Volatility-based slippage
    
    SlippageModel(double linear = 0.0001, double sqrt = 0.001, 
                  double spread = 0.0005, double vol_factor = 0.1)
        : linear_impact(linear), sqrt_impact(sqrt), 
          fixed_spread(spread), volatility_factor(vol_factor) {}
};

struct TransactionCosts {
    double commission_per_share;    // Fixed commission per share
    double commission_percentage;   // Percentage of trade value
    double minimum_commission;      // Minimum commission per trade
    double sec_fee_rate;           // SEC fee rate
    double exchange_fee_rate;      // Exchange fee rate
    
    TransactionCosts(double per_share = 0.005, double percentage = 0.0, 
                    double minimum = 1.0, double sec_fee = 0.0000231, 
                    double exchange_fee = 0.0000119)
        : commission_per_share(per_share), commission_percentage(percentage),
          minimum_commission(minimum), sec_fee_rate(sec_fee), 
          exchange_fee_rate(exchange_fee) {}
};

struct LiquidityModel {
    double depth_at_touch;         // Liquidity at best bid/ask
    double depth_decay_rate;       // How quickly liquidity decays with price
    double regeneration_rate;      // How quickly liquidity regenerates
    double volatility_impact;      // Impact of volatility on liquidity
    
    LiquidityModel(double depth = 10000.0, double decay = 0.1, 
                   double regen = 0.05, double vol_impact = 0.2)
        : depth_at_touch(depth), depth_decay_rate(decay),
          regeneration_rate(regen), volatility_impact(vol_impact) {}
};

class SimulationEngine {
public:
    SimulationEngine();
    ~SimulationEngine();
    
    // Configuration
    void setSlippageModel(const SlippageModel& model);
    void setTransactionCosts(const TransactionCosts& costs);
    void setLiquidityModel(const LiquidityModel& model);
    
    // Order management
    uint64_t submitOrder(const Order& order);
    bool cancelOrder(uint64_t order_id);
    std::vector<Order> getPendingOrders() const;
    std::vector<Fill> getFills() const;
    
    // Simulation execution
    void processMarketData(const MarketData& tick);
    void processOrderBook(const std::string& symbol, double bid, double ask, 
                         double bid_size, double ask_size);
    
    // Market impact and slippage calculation
    double calculateSlippage(const Order& order, double market_price, 
                           double volatility) const;
    double calculateMarketImpact(const Order& order, double available_liquidity) const;
    double calculateTransactionCost(const Fill& fill) const;
    
    // Liquidity simulation
    double getAvailableLiquidity(const std::string& symbol, OrderSide side, 
                               double price_level) const;
    void updateLiquidity(const std::string& symbol, const Fill& fill);
    
    // Realistic execution simulation
    std::vector<Fill> executeOrder(Order& order, const MarketData& current_tick);
    bool shouldFillOrder(const Order& order, const MarketData& tick) const;
    
    // Statistics and reporting
    double getTotalSlippage() const { return total_slippage_; }
    double getTotalCommissions() const { return total_commissions_; }
    size_t getTotalTrades() const { return fills_.size(); }
    
    // Reset simulation state
    void reset();

private:
    // Configuration
    SlippageModel slippage_model_;
    TransactionCosts transaction_costs_;
    LiquidityModel liquidity_model_;
    
    // Order management
    std::vector<Order> pending_orders_;
    std::vector<Fill> fills_;
    uint64_t next_order_id_;
    
    // Market state
    std::map<std::string, MarketData> current_market_data_;
    std::map<std::string, std::pair<double, double>> current_bid_ask_;
    std::map<std::string, std::map<double, double>> liquidity_levels_; // symbol -> price -> quantity
    
    // Statistics
    double total_slippage_;
    double total_commissions_;
    
    // Random number generation for realistic simulation
    mutable std::mt19937 rng_;
    mutable std::normal_distribution<double> normal_dist_;
    mutable std::uniform_real_distribution<double> uniform_dist_;
    
    // Helper methods
    double calculateVolatility(const std::string& symbol, size_t lookback_periods = 20) const;
    double getRandomFactor() const;
    bool isOrderTriggered(const Order& order, const MarketData& tick) const;
    std::vector<Fill> partialFill(Order& order, double available_quantity, 
                                 double fill_price, uint64_t timestamp);
    void updateOrderStatus(Order& order);
};

} // namespace tradeflow