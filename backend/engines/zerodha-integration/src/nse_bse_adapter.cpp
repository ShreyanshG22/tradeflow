#include "nse_bse_adapter.hpp"
#include "logger.hpp"
#include <algorithm>
#include <regex>

namespace tradeflow {
namespace zerodha {

NSEBSEAdapter::NSEBSEAdapter(const std::string& api_key, const std::string& access_token)
    : kite_(api_key, access_token), is_market_open_(false) {
    
    // Initialize Indian market timings (IST)
    market_open_time_ = std::chrono::hours(9) + std::chrono::minutes(15);  // 9:15 AM
    market_close_time_ = std::chrono::hours(15) + std::chrono::minutes(30); // 3:30 PM
    
    // Load popular Indian stocks
    initialize_popular_stocks();
    
    // Load NSE/BSE instrument mappings
    load_instrument_mappings();
}

bool NSEBSEAdapter::initialize() {
    auto& logger = Logger::getInstance();
    logger.info("Initializing NSE/BSE Market Data Adapter");
    
    try {
        // Test connection with a simple API call
        auto margins = kite_.get_margins();
        
        // Check if markets are open
        update_market_status();
        
        // Load current positions and holdings
        refresh_portfolio_data();
        
        logger.info("NSE/BSE Adapter initialized successfully");
        return true;
        
    } catch (const KiteConnect::KiteException& e) {
        logger.error("Failed to initialize NSE/BSE adapter: " + std::string(e.what()));
        return false;
    }
}

std::vector<IndianMarketTick> NSEBSEAdapter::get_market_data(const std::vector<std::string>& symbols) {
    std::vector<std::string> instrument_tokens;
    
    // Convert symbols to instrument tokens
    for (const auto& symbol : symbols) {
        auto token = get_instrument_token(symbol);
        if (!token.empty()) {
            instrument_tokens.push_back(token);
        }
    }
    
    if (instrument_tokens.empty()) {
        return {};
    }
    
    try {
        auto zerodha_ticks = kite_.get_quote(instrument_tokens);
        
        std::vector<IndianMarketTick> market_ticks;
        for (const auto& tick : zerodha_ticks) {
            market_ticks.push_back(convert_to_market_tick(tick));
        }
        
        return market_ticks;
        
    } catch (const KiteConnect::KiteException& e) {
        auto& logger = Logger::getInstance();
        logger.error("Failed to get market data: " + std::string(e.what()));
        return {};
    }
}

IndianOrderResult NSEBSEAdapter::place_order(const IndianOrderRequest& request) {
    auto& logger = Logger::getInstance();
    
    try {
        // Validate order request
        if (!validate_order_request(request)) {
            throw std::invalid_argument("Invalid order request");
        }
        
        // Convert to Zerodha format and place order
        std::string order_id = kite_.place_order(
            request.exchange,
            request.trading_symbol,
            request.transaction_type,
            request.quantity,
            request.product,
            request.order_type,
            request.price,
            request.validity,
            request.disclosed_quantity,
            request.trigger_price,
            "", // squareoff
            "", // stoploss
            0,  // trailing_stoploss
            request.tag
        );
        
        IndianOrderResult result;
        result.success = true;
        result.order_id = order_id;
        result.message = "Order placed successfully";
        
        logger.info("Order placed successfully: " + order_id + " for " + request.trading_symbol);
        
        return result;
        
    } catch (const std::exception& e) {
        IndianOrderResult result;
        result.success = false;
        result.error_message = e.what();
        
        logger.error("Failed to place order: " + std::string(e.what()));
        
        return result;
    }
}

std::vector<IndianPosition> NSEBSEAdapter::get_positions() {
    try {
        return kite_.get_positions();
    } catch (const KiteConnect::KiteException& e) {
        auto& logger = Logger::getInstance();
        logger.error("Failed to get positions: " + std::string(e.what()));
        return {};
    }
}

std::vector<IndianHolding> NSEBSEAdapter::get_holdings() {
    try {
        return kite_.get_holdings();
    } catch (const KiteConnect::KiteException& e) {
        auto& logger = Logger::getInstance();
        logger.error("Failed to get holdings: " + std::string(e.what()));
        return {};
    }
}

std::vector<IndianOrder> NSEBSEAdapter::get_orders() {
    try {
        return kite_.get_orders();
    } catch (const KiteConnect::KiteException& e) {
        auto& logger = Logger::getInstance();
        logger.error("Failed to get orders: " + std::string(e.what()));
        return {};
    }
}

nlohmann::json NSEBSEAdapter::get_historical_data(
    const std::string& symbol,
    const std::string& from_date,
    const std::string& to_date,
    const std::string& interval) {
    
    try {
        std::string instrument_token = get_instrument_token(symbol);
        if (instrument_token.empty()) {
            throw std::invalid_argument("Invalid symbol: " + symbol);
        }
        
        return kite_.get_historical_data(instrument_token, from_date, to_date, interval);
        
    } catch (const std::exception& e) {
        auto& logger = Logger::getInstance();
        logger.error("Failed to get historical data for " + symbol + ": " + std::string(e.what()));
        return nlohmann::json::object();
    }
}

bool NSEBSEAdapter::is_market_open() const {
    return is_market_open_;
}

std::vector<std::string> NSEBSEAdapter::get_popular_stocks() const {
    return popular_stocks_;
}

std::string NSEBSEAdapter::get_instrument_token(const std::string& symbol) const {
    // First try NSE
    auto nse_key = "NSE:" + symbol;
    auto it = instrument_mappings_.find(nse_key);
    if (it != instrument_mappings_.end()) {
        return it->second;
    }
    
    // Then try BSE
    auto bse_key = "BSE:" + symbol;
    it = instrument_mappings_.find(bse_key);
    if (it != instrument_mappings_.end()) {
        return it->second;
    }
    
    // Try without exchange prefix
    it = instrument_mappings_.find(symbol);
    if (it != instrument_mappings_.end()) {
        return it->second;
    }
    
    return "";
}

void NSEBSEAdapter::initialize_popular_stocks() {
    // Popular Indian stocks for quick access
    popular_stocks_ = {
        // Nifty 50 major stocks
        "RELIANCE", "TCS", "HDFCBANK", "INFY", "HINDUNILVR",
        "ICICIBANK", "KOTAKBANK", "BHARTIARTL", "ITC", "SBIN",
        "BAJFINANCE", "ASIANPAINT", "MARUTI", "HCLTECH", "AXISBANK",
        "LT", "DMART", "SUNPHARMA", "TITAN", "ULTRACEMCO",
        "NESTLEIND", "WIPRO", "NTPC", "JSWSTEEL", "POWERGRID",
        "TATAMOTORS", "TECHM", "ONGC", "BAJAJFINSV", "LTIM",
        "COALINDIA", "HDFCLIFE", "SBILIFE", "BPCL", "GRASIM",
        "BRITANNIA", "EICHERMOT", "ADANIENT", "APOLLOHOSP", "CIPLA",
        "DIVISLAB", "HINDALCO", "HEROMOTOCO", "DRREDDY", "INDUSINDBK",
        "BAJAJ-AUTO", "TATACONSUM", "UPL", "ADANIPORTS", "TATASTEEL",
        
        // Additional popular stocks
        "ADANIGREEN", "ADANITRANS", "GODREJCP", "PIDILITIND",
        "BERGEPAINT", "DABUR", "MARICO", "COLPAL", "MCDOWELL-N",
        "AMBUJACEM", "ACC", "SHREECEM", "RAMCOCEM", "INDIACEM",
        
        // Banking stocks
        "PNB", "BANKBARODA", "CANBK", "IDFCFIRSTB", "FEDERALBNK",
        "RBLBANK", "BANDHANBNK", "AUBANK", "INDHOTEL", "YESBANK",
        
        // IT stocks
        "MINDTREE", "MPHASIS", "COFORGE", "PERSISTENT", "LTTS",
        
        // Pharma stocks
        "LUPIN", "BIOCON", "CADILAHC", "TORNTPHARM", "ALKEM",
        
        // Auto stocks
        "MAHINDRA", "ASHOKLEY", "ESCORTS", "BAJAJHLDNG", "TVSMOTORS"
    };
}

void NSEBSEAdapter::load_instrument_mappings() {
    auto& logger = Logger::getInstance();
    
    try {
        // Load NSE instruments
        auto nse_instruments = kite_.get_instruments("NSE");
        if (nse_instruments.contains("data")) {
            for (const auto& instrument : nse_instruments["data"]) {
                if (instrument.contains("tradingsymbol") && instrument.contains("instrument_token")) {
                    std::string symbol = instrument["tradingsymbol"];
                    std::string token = std::to_string(static_cast<int>(instrument["instrument_token"]));
                    
                    instrument_mappings_["NSE:" + symbol] = token;
                    instrument_mappings_[symbol] = token; // Default to NSE
                }
            }
        }
        
        // Load BSE instruments
        auto bse_instruments = kite_.get_instruments("BSE");
        if (bse_instruments.contains("data")) {
            for (const auto& instrument : bse_instruments["data"]) {
                if (instrument.contains("tradingsymbol") && instrument.contains("instrument_token")) {
                    std::string symbol = instrument["tradingsymbol"];
                    std::string token = std::to_string(static_cast<int>(instrument["instrument_token"]));
                    
                    instrument_mappings_["BSE:" + symbol] = token;
                    // Don't override NSE mapping if it exists
                    if (instrument_mappings_.find(symbol) == instrument_mappings_.end()) {
                        instrument_mappings_[symbol] = token;
                    }
                }
            }
        }
        
        logger.info("Loaded " + std::to_string(instrument_mappings_.size()) + " instrument mappings");
        
    } catch (const std::exception& e) {
        logger.error("Failed to load instrument mappings: " + std::string(e.what()));
        
        // Fallback: Create mappings for popular stocks with dummy tokens
        // In production, you would need to handle this properly
        for (size_t i = 0; i < popular_stocks_.size(); ++i) {
            instrument_mappings_[popular_stocks_[i]] = std::to_string(1000000 + i);
        }
    }
}

void NSEBSEAdapter::update_market_status() {
    auto now = std::chrono::system_clock::now();
    auto time_t = std::chrono::system_clock::to_time_t(now);
    auto tm = *std::localtime(&time_t);
    
    // Convert to IST (assuming system is in IST or adjust accordingly)
    auto current_time = std::chrono::hours(tm.tm_hour) + std::chrono::minutes(tm.tm_min);
    
    // Check if it's a weekday (Monday = 1, Sunday = 0)
    bool is_weekday = (tm.tm_wday >= 1 && tm.tm_wday <= 5);
    
    // Market is open on weekdays between 9:15 AM and 3:30 PM IST
    is_market_open_ = is_weekday && 
                     (current_time >= market_open_time_) && 
                     (current_time <= market_close_time_);
}

void NSEBSEAdapter::refresh_portfolio_data() {
    try {
        // Refresh positions and holdings
        current_positions_ = get_positions();
        current_holdings_ = get_holdings();
        current_orders_ = get_orders();
        
        auto& logger = Logger::getInstance();
        logger.info("Portfolio data refreshed - Positions: " + 
                   std::to_string(current_positions_.size()) + 
                   ", Holdings: " + std::to_string(current_holdings_.size()) +
                   ", Orders: " + std::to_string(current_orders_.size()));
        
    } catch (const std::exception& e) {
        auto& logger = Logger::getInstance();
        logger.error("Failed to refresh portfolio data: " + std::string(e.what()));
    }
}

IndianMarketTick NSEBSEAdapter::convert_to_market_tick(const NSEBSETick& zerodha_tick) {
    IndianMarketTick tick;
    
    tick.symbol = get_symbol_from_token(zerodha_tick.instrument_token);
    tick.exchange = zerodha_tick.exchange;
    tick.last_price = zerodha_tick.last_price;
    tick.open = zerodha_tick.open;
    tick.high = zerodha_tick.high;
    tick.low = zerodha_tick.low;
    tick.close = zerodha_tick.close;
    tick.change = zerodha_tick.change;
    tick.change_percent = zerodha_tick.change_percent;
    tick.volume = zerodha_tick.volume;
    tick.average_price = zerodha_tick.average_price;
    tick.oi = zerodha_tick.oi;
    tick.timestamp = zerodha_tick.timestamp;
    
    // Convert market depth
    for (const auto& buy_order : zerodha_tick.buy_depth) {
        IndianMarketTick::MarketDepth depth;
        depth.price = buy_order.price;
        depth.quantity = buy_order.quantity;
        depth.orders = buy_order.orders;
        tick.buy_depth.push_back(depth);
    }
    
    for (const auto& sell_order : zerodha_tick.sell_depth) {
        IndianMarketTick::MarketDepth depth;
        depth.price = sell_order.price;
        depth.quantity = sell_order.quantity;
        depth.orders = sell_order.orders;
        tick.sell_depth.push_back(depth);
    }
    
    return tick;
}

std::string NSEBSEAdapter::get_symbol_from_token(const std::string& token) const {
    // Reverse lookup in instrument mappings
    for (const auto& [symbol, mapped_token] : instrument_mappings_) {
        if (mapped_token == token) {
            // Return symbol without exchange prefix if it exists
            size_t colon_pos = symbol.find(':');
            if (colon_pos != std::string::npos) {
                return symbol.substr(colon_pos + 1);
            }
            return symbol;
        }
    }
    return token; // Fallback to token if symbol not found
}

bool NSEBSEAdapter::validate_order_request(const IndianOrderRequest& request) {
    // Basic validation for Indian markets
    
    // Check exchange
    if (request.exchange != "NSE" && request.exchange != "BSE" && 
        request.exchange != "NFO" && request.exchange != "BFO" &&
        request.exchange != "CDS" && request.exchange != "MCX") {
        return false;
    }
    
    // Check transaction type
    if (request.transaction_type != "BUY" && request.transaction_type != "SELL") {
        return false;
    }
    
    // Check product type
    if (request.product != "CNC" && request.product != "MIS" && request.product != "NRML") {
        return false;
    }
    
    // Check order type
    if (request.order_type != "MARKET" && request.order_type != "LIMIT" && 
        request.order_type != "SL" && request.order_type != "SL-M") {
        return false;
    }
    
    // Check quantity
    if (request.quantity <= 0) {
        return false;
    }
    
    // Check price for limit orders
    if ((request.order_type == "LIMIT" || request.order_type == "SL") && request.price <= 0) {
        return false;
    }
    
    // Check trigger price for SL orders
    if ((request.order_type == "SL" || request.order_type == "SL-M") && request.trigger_price <= 0) {
        return false;
    }
    
    return true;
}

} // namespace zerodha
} // namespace tradeflow