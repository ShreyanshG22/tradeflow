#pragma once

#include "kite_connect.hpp"
#include <chrono>
#include <unordered_map>

namespace tradeflow {
namespace zerodha {

// Indian market specific data structures
struct IndianMarketTick {
    std::string symbol;
    std::string exchange;  // NSE, BSE, NFO, BFO, CDS, MCX
    double last_price;
    double open;
    double high;
    double low;
    double close;
    double change;
    double change_percent;
    uint64_t volume;
    uint64_t average_price;
    uint64_t oi;  // Open Interest
    std::string timestamp;
    
    struct MarketDepth {
        double price;
        uint32_t quantity;
        uint32_t orders;
    };
    
    std::vector<MarketDepth> buy_depth;
    std::vector<MarketDepth> sell_depth;
};

struct IndianOrderRequest {
    std::string exchange;        // NSE, BSE, NFO, BFO, CDS, MCX
    std::string trading_symbol;  // e.g., "RELIANCE", "NIFTY21SEPFUT"
    std::string transaction_type; // BUY, SELL
    double quantity;
    std::string product;         // CNC (Cash and Carry), MIS (Intraday), NRML (Normal)
    std::string order_type;      // MARKET, LIMIT, SL (Stop Loss), SL-M (Stop Loss Market)
    double price = 0;            // For LIMIT orders
    std::string validity = "DAY"; // DAY, IOC (Immediate or Cancel), TTL (Till Triggered)
    double disclosed_quantity = 0; // Iceberg orders
    double trigger_price = 0;    // For SL orders
    std::string tag = "";        // Custom tag for tracking
};

struct IndianOrderResult {
    bool success;
    std::string order_id;
    std::string message;
    std::string error_message;
};

class NSEBSEAdapter {
public:
    NSEBSEAdapter(const std::string& api_key, const std::string& access_token = "");
    
    // Initialization
    bool initialize();
    
    // Market Data
    std::vector<IndianMarketTick> get_market_data(const std::vector<std::string>& symbols);
    nlohmann::json get_historical_data(
        const std::string& symbol,
        const std::string& from_date,
        const std::string& to_date,
        const std::string& interval = "day"
    );
    
    // Trading
    IndianOrderResult place_order(const IndianOrderRequest& request);
    bool cancel_order(const std::string& order_id);
    bool modify_order(const std::string& order_id, const IndianOrderRequest& new_request);
    
    // Portfolio
    std::vector<IndianPosition> get_positions();
    std::vector<IndianHolding> get_holdings();
    std::vector<IndianOrder> get_orders();
    
    // Market Status
    bool is_market_open() const;
    std::vector<std::string> get_popular_stocks() const;
    
    // Utility
    std::string get_instrument_token(const std::string& symbol) const;
    void set_access_token(const std::string& access_token);
    
    // Market timings (IST)
    struct MarketTimings {
        std::chrono::hours open_hour{9};
        std::chrono::minutes open_minute{15};
        std::chrono::hours close_hour{15};
        std::chrono::minutes close_minute{30};
        
        // Pre-market: 9:00 AM to 9:15 AM
        std::chrono::hours pre_market_start{9};
        std::chrono::minutes pre_market_start_min{0};
        
        // After-market: 3:40 PM to 4:00 PM
        std::chrono::hours after_market_start{15};
        std::chrono::minutes after_market_start_min{40};
        std::chrono::hours after_market_end{16};
        std::chrono::minutes after_market_end_min{0};
    };
    
    MarketTimings get_market_timings() const { return market_timings_; }

private:
    KiteConnect kite_;
    bool is_market_open_;
    std::chrono::duration<int, std::ratio<3600>> market_open_time_;
    std::chrono::duration<int, std::ratio<3600>> market_close_time_;
    MarketTimings market_timings_;
    
    // Cached data
    std::vector<std::string> popular_stocks_;
    std::unordered_map<std::string, std::string> instrument_mappings_;
    std::vector<IndianPosition> current_positions_;
    std::vector<IndianHolding> current_holdings_;
    std::vector<IndianOrder> current_orders_;
    
    // Helper methods
    void initialize_popular_stocks();
    void load_instrument_mappings();
    void update_market_status();
    void refresh_portfolio_data();
    
    // Conversion methods
    IndianMarketTick convert_to_market_tick(const NSEBSETick& zerodha_tick);
    std::string get_symbol_from_token(const std::string& token) const;
    
    // Validation
    bool validate_order_request(const IndianOrderRequest& request);
};

} // namespace zerodha
} // namespace tradeflow