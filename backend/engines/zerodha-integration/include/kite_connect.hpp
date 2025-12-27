#pragma once

#include <string>
#include <vector>
#include <unordered_map>
#include <memory>
#include <functional>
#include <nlohmann/json.hpp>

namespace tradeflow {
namespace zerodha {

// Indian market specific types
struct NSEBSETick {
    std::string instrument_token;
    std::string tradable;
    std::string mode;
    std::string exchange;  // NSE or BSE
    double last_price;
    double open;
    double high;
    double low;
    double close;
    double change;
    double change_percent;
    uint64_t volume;
    uint64_t average_price;
    uint64_t oi;  // Open Interest for F&O
    uint64_t oi_day_high;
    uint64_t oi_day_low;
    std::string timestamp;
    
    // Depth data for NSE/BSE
    struct MarketDepth {
        double price;
        uint32_t quantity;
        uint32_t orders;
    };
    
    std::vector<MarketDepth> buy_depth;
    std::vector<MarketDepth> sell_depth;
};

struct IndianOrder {
    std::string order_id;
    std::string parent_order_id;
    std::string exchange;  // NSE, BSE, NFO, BFO, CDS, MCX
    std::string tradingsymbol;  // e.g., "RELIANCE", "NIFTY21SEPFUT"
    std::string validity;  // DAY, IOC, TTL
    std::string product;   // CNC, MIS, NRML
    std::string order_type;  // MARKET, LIMIT, SL, SL-M
    std::string transaction_type;  // BUY, SELL
    double quantity;
    double price;
    double trigger_price;  // For SL orders
    std::string status;  // OPEN, COMPLETE, CANCELLED, REJECTED
    double filled_quantity;
    double pending_quantity;
    double average_price;
    std::string order_timestamp;
    std::string exchange_timestamp;
    std::string variety;  // regular, bo, co, amo
    std::string tag;  // Custom tag for order tracking
};

struct IndianPosition {
    std::string tradingsymbol;
    std::string exchange;
    std::string instrument_token;
    std::string product;
    double quantity;
    double overnight_quantity;
    double multiplier;
    double average_price;
    double close_price;
    double last_price;
    double value;
    double pnl;
    double m2m;
    double unrealised;
    double realised;
    bool buy_m2m;
    bool sell_m2m;
    double buy_price;
    double sell_price;
    double buy_quantity;
    double sell_quantity;
    double buy_value;
    double sell_value;
};

struct IndianHolding {
    std::string tradingsymbol;
    std::string exchange;
    std::string instrument_token;
    std::string isin;
    double quantity;
    double t1_quantity;
    double realised_quantity;
    double authorised_quantity;
    double authorised_date;
    double opening_quantity;
    double collateral_quantity;
    double collateral_type;
    bool discrepancy;
    double average_price;
    double last_price;
    double close_price;
    double pnl;
    double day_change;
    double day_change_percentage;
};

class KiteConnect {
public:
    KiteConnect(const std::string& api_key, const std::string& access_token = "");
    ~KiteConnect();

    // Authentication
    std::string get_login_url() const;
    std::string generate_session(const std::string& request_token, const std::string& api_secret);
    bool invalidate_access_token();
    
    // Market Data
    std::vector<NSEBSETick> get_quote(const std::vector<std::string>& instruments);
    std::vector<NSEBSETick> get_ohlc(const std::vector<std::string>& instruments);
    std::vector<NSEBSETick> get_ltp(const std::vector<std::string>& instruments);
    
    // Historical Data
    nlohmann::json get_historical_data(
        const std::string& instrument_token,
        const std::string& from_date,
        const std::string& to_date,
        const std::string& interval = "day",
        bool continuous = false,
        bool oi = false
    );
    
    // Orders
    std::string place_order(
        const std::string& exchange,
        const std::string& tradingsymbol,
        const std::string& transaction_type,
        double quantity,
        const std::string& product,
        const std::string& order_type,
        double price = 0,
        const std::string& validity = "DAY",
        double disclosed_quantity = 0,
        double trigger_price = 0,
        const std::string& squareoff = "",
        const std::string& stoploss = "",
        double trailing_stoploss = 0,
        const std::string& tag = ""
    );
    
    std::string modify_order(
        const std::string& order_id,
        double quantity = 0,
        double price = 0,
        const std::string& order_type = "",
        const std::string& validity = "",
        double disclosed_quantity = 0,
        double trigger_price = 0,
        const std::string& parent_order_id = ""
    );
    
    bool cancel_order(const std::string& order_id, const std::string& parent_order_id = "");
    
    // Portfolio
    std::vector<IndianOrder> get_orders();
    std::vector<IndianOrder> get_order_history(const std::string& order_id);
    std::vector<IndianPosition> get_positions();
    std::vector<IndianHolding> get_holdings();
    
    // Instruments
    nlohmann::json get_instruments(const std::string& exchange = "");
    
    // Margins
    nlohmann::json get_margins(const std::string& segment = "");
    
    // GTT (Good Till Triggered)
    std::string place_gtt(
        const std::string& trigger_type,
        const std::string& tradingsymbol,
        const std::string& exchange,
        const std::vector<double>& trigger_values,
        double last_price,
        const std::vector<nlohmann::json>& orders
    );
    
    // Mutual Funds
    nlohmann::json get_mf_orders();
    nlohmann::json get_mf_holdings();
    
    // Utility methods
    void set_access_token(const std::string& access_token);
    std::string get_access_token() const;
    
    // Error handling
    struct KiteException : public std::exception {
        std::string message;
        int error_code;
        
        KiteException(const std::string& msg, int code = 0) 
            : message(msg), error_code(code) {}
        
        const char* what() const noexcept override {
            return message.c_str();
        }
    };

private:
    std::string api_key_;
    std::string access_token_;
    std::string base_url_;
    
    // HTTP client methods
    nlohmann::json make_request(
        const std::string& method,
        const std::string& endpoint,
        const std::unordered_map<std::string, std::string>& params = {},
        const nlohmann::json& data = {}
    );
    
    std::string build_url(const std::string& endpoint) const;
    std::string build_query_string(const std::unordered_map<std::string, std::string>& params) const;
    
    // Response parsing
    NSEBSETick parse_tick_data(const nlohmann::json& data);
    IndianOrder parse_order_data(const nlohmann::json& data);
    IndianPosition parse_position_data(const nlohmann::json& data);
    IndianHolding parse_holding_data(const nlohmann::json& data);
};

} // namespace zerodha
} // namespace tradeflow