#include "kite_connect.hpp"
#include <curl/curl.h>
#include <sstream>
#include <iomanip>
#include <chrono>
#include <openssl/sha.h>
#include <openssl/hmac.h>

namespace tradeflow {
namespace zerodha {

// Helper function for HTTP responses
struct HTTPResponse {
    std::string data;
    long response_code;
};

static size_t WriteCallback(void* contents, size_t size, size_t nmemb, HTTPResponse* response) {
    size_t total_size = size * nmemb;
    response->data.append(static_cast<char*>(contents), total_size);
    return total_size;
}

KiteConnect::KiteConnect(const std::string& api_key, const std::string& access_token)
    : api_key_(api_key), access_token_(access_token), base_url_("https://api.kite.trade") {
    
    // Initialize libcurl
    curl_global_init(CURL_GLOBAL_DEFAULT);
}

KiteConnect::~KiteConnect() {
    curl_global_cleanup();
}

std::string KiteConnect::get_login_url() const {
    return base_url_ + "/connect/login?api_key=" + api_key_;
}

std::string KiteConnect::generate_session(const std::string& request_token, const std::string& api_secret) {
    // Generate checksum: api_key + request_token + api_secret
    std::string data = api_key_ + request_token + api_secret;
    
    unsigned char hash[SHA256_DIGEST_LENGTH];
    SHA256_CTX sha256;
    SHA256_Init(&sha256);
    SHA256_Update(&sha256, data.c_str(), data.length());
    SHA256_Final(hash, &sha256);
    
    std::stringstream ss;
    for(int i = 0; i < SHA256_DIGEST_LENGTH; i++) {
        ss << std::hex << std::setw(2) << std::setfill('0') << static_cast<int>(hash[i]);
    }
    std::string checksum = ss.str();
    
    // Make session request
    std::unordered_map<std::string, std::string> params = {
        {"api_key", api_key_},
        {"request_token", request_token},
        {"checksum", checksum}
    };
    
    auto response = make_request("POST", "/session/token", params);
    
    if (response.contains("data") && response["data"].contains("access_token")) {
        access_token_ = response["data"]["access_token"];
        return access_token_;
    }
    
    throw KiteException("Failed to generate session", 400);
}

std::vector<NSEBSETick> KiteConnect::get_quote(const std::vector<std::string>& instruments) {
    std::string instruments_str;
    for (size_t i = 0; i < instruments.size(); ++i) {
        if (i > 0) instruments_str += ",";
        instruments_str += instruments[i];
    }
    
    std::unordered_map<std::string, std::string> params = {
        {"i", instruments_str}
    };
    
    auto response = make_request("GET", "/quote", params);
    
    std::vector<NSEBSETick> ticks;
    if (response.contains("data")) {
        for (auto& [key, value] : response["data"].items()) {
            ticks.push_back(parse_tick_data(value));
        }
    }
    
    return ticks;
}

std::vector<NSEBSETick> KiteConnect::get_ltp(const std::vector<std::string>& instruments) {
    std::string instruments_str;
    for (size_t i = 0; i < instruments.size(); ++i) {
        if (i > 0) instruments_str += ",";
        instruments_str += instruments[i];
    }
    
    std::unordered_map<std::string, std::string> params = {
        {"i", instruments_str}
    };
    
    auto response = make_request("GET", "/quote/ltp", params);
    
    std::vector<NSEBSETick> ticks;
    if (response.contains("data")) {
        for (auto& [key, value] : response["data"].items()) {
            NSEBSETick tick;
            tick.instrument_token = key;
            tick.last_price = value["last_price"];
            ticks.push_back(tick);
        }
    }
    
    return ticks;
}

nlohmann::json KiteConnect::get_historical_data(
    const std::string& instrument_token,
    const std::string& from_date,
    const std::string& to_date,
    const std::string& interval,
    bool continuous,
    bool oi) {
    
    std::unordered_map<std::string, std::string> params = {
        {"from", from_date},
        {"to", to_date},
        {"interval", interval},
        {"continuous", continuous ? "1" : "0"},
        {"oi", oi ? "1" : "0"}
    };
    
    std::string endpoint = "/instruments/historical/" + instrument_token + "/" + interval;
    return make_request("GET", endpoint, params);
}

std::string KiteConnect::place_order(
    const std::string& exchange,
    const std::string& tradingsymbol,
    const std::string& transaction_type,
    double quantity,
    const std::string& product,
    const std::string& order_type,
    double price,
    const std::string& validity,
    double disclosed_quantity,
    double trigger_price,
    const std::string& squareoff,
    const std::string& stoploss,
    double trailing_stoploss,
    const std::string& tag) {
    
    nlohmann::json order_data = {
        {"exchange", exchange},
        {"tradingsymbol", tradingsymbol},
        {"transaction_type", transaction_type},
        {"quantity", std::to_string(static_cast<int>(quantity))},
        {"product", product},
        {"order_type", order_type},
        {"validity", validity}
    };
    
    if (price > 0) {
        order_data["price"] = std::to_string(price);
    }
    
    if (disclosed_quantity > 0) {
        order_data["disclosed_quantity"] = std::to_string(static_cast<int>(disclosed_quantity));
    }
    
    if (trigger_price > 0) {
        order_data["trigger_price"] = std::to_string(trigger_price);
    }
    
    if (!squareoff.empty()) {
        order_data["squareoff"] = squareoff;
    }
    
    if (!stoploss.empty()) {
        order_data["stoploss"] = stoploss;
    }
    
    if (trailing_stoploss > 0) {
        order_data["trailing_stoploss"] = std::to_string(trailing_stoploss);
    }
    
    if (!tag.empty()) {
        order_data["tag"] = tag;
    }
    
    auto response = make_request("POST", "/orders/regular", {}, order_data);
    
    if (response.contains("data") && response["data"].contains("order_id")) {
        return response["data"]["order_id"];
    }
    
    throw KiteException("Failed to place order", 400);
}

std::vector<IndianOrder> KiteConnect::get_orders() {
    auto response = make_request("GET", "/orders");
    
    std::vector<IndianOrder> orders;
    if (response.contains("data")) {
        for (const auto& order_data : response["data"]) {
            orders.push_back(parse_order_data(order_data));
        }
    }
    
    return orders;
}

std::vector<IndianPosition> KiteConnect::get_positions() {
    auto response = make_request("GET", "/portfolio/positions");
    
    std::vector<IndianPosition> positions;
    if (response.contains("data")) {
        // Zerodha returns both net and day positions
        if (response["data"].contains("net")) {
            for (const auto& pos_data : response["data"]["net"]) {
                positions.push_back(parse_position_data(pos_data));
            }
        }
    }
    
    return positions;
}

std::vector<IndianHolding> KiteConnect::get_holdings() {
    auto response = make_request("GET", "/portfolio/holdings");
    
    std::vector<IndianHolding> holdings;
    if (response.contains("data")) {
        for (const auto& holding_data : response["data"]) {
            holdings.push_back(parse_holding_data(holding_data));
        }
    }
    
    return holdings;
}

nlohmann::json KiteConnect::get_instruments(const std::string& exchange) {
    std::string endpoint = "/instruments";
    if (!exchange.empty()) {
        endpoint += "/" + exchange;
    }
    
    return make_request("GET", endpoint);
}

nlohmann::json KiteConnect::get_margins(const std::string& segment) {
    std::string endpoint = "/user/margins";
    if (!segment.empty()) {
        endpoint += "/" + segment;
    }
    
    return make_request("GET", endpoint);
}

void KiteConnect::set_access_token(const std::string& access_token) {
    access_token_ = access_token;
}

std::string KiteConnect::get_access_token() const {
    return access_token_;
}

nlohmann::json KiteConnect::make_request(
    const std::string& method,
    const std::string& endpoint,
    const std::unordered_map<std::string, std::string>& params,
    const nlohmann::json& data) {
    
    CURL* curl = curl_easy_init();
    if (!curl) {
        throw KiteException("Failed to initialize CURL");
    }
    
    HTTPResponse response;
    std::string url = build_url(endpoint);
    
    // Add query parameters for GET requests
    if (method == "GET" && !params.empty()) {
        url += "?" + build_query_string(params);
    }
    
    curl_easy_setopt(curl, CURLOPT_URL, url.c_str());
    curl_easy_setopt(curl, CURLOPT_WRITEFUNCTION, WriteCallback);
    curl_easy_setopt(curl, CURLOPT_WRITEDATA, &response);
    curl_easy_setopt(curl, CURLOPT_TIMEOUT, 30L);
    curl_easy_setopt(curl, CURLOPT_FOLLOWLOCATION, 1L);
    
    // Set headers
    struct curl_slist* headers = nullptr;
    std::string auth_header = "Authorization: token api_key=" + api_key_ + ":access_token=" + access_token_;
    headers = curl_slist_append(headers, auth_header.c_str());
    headers = curl_slist_append(headers, "Content-Type: application/json");
    headers = curl_slist_append(headers, "X-Kite-Version: 3");
    curl_easy_setopt(curl, CURLOPT_HTTPHEADER, headers);
    
    // Set method and data
    if (method == "POST") {
        curl_easy_setopt(curl, CURLOPT_POST, 1L);
        if (!data.empty()) {
            std::string post_data = data.dump();
            curl_easy_setopt(curl, CURLOPT_POSTFIELDS, post_data.c_str());
        } else if (!params.empty()) {
            std::string post_data = build_query_string(params);
            curl_easy_setopt(curl, CURLOPT_POSTFIELDS, post_data.c_str());
            curl_slist_free_all(headers);
            headers = nullptr;
            headers = curl_slist_append(headers, auth_header.c_str());
            headers = curl_slist_append(headers, "Content-Type: application/x-www-form-urlencoded");
            headers = curl_slist_append(headers, "X-Kite-Version: 3");
            curl_easy_setopt(curl, CURLOPT_HTTPHEADER, headers);
        }
    } else if (method == "PUT") {
        curl_easy_setopt(curl, CURLOPT_CUSTOMREQUEST, "PUT");
        if (!data.empty()) {
            std::string put_data = data.dump();
            curl_easy_setopt(curl, CURLOPT_POSTFIELDS, put_data.c_str());
        }
    } else if (method == "DELETE") {
        curl_easy_setopt(curl, CURLOPT_CUSTOMREQUEST, "DELETE");
    }
    
    CURLcode res = curl_easy_perform(curl);
    curl_easy_getinfo(curl, CURLINFO_RESPONSE_CODE, &response.response_code);
    
    curl_slist_free_all(headers);
    curl_easy_cleanup(curl);
    
    if (res != CURLE_OK) {
        throw KiteException("CURL request failed: " + std::string(curl_easy_strerror(res)));
    }
    
    if (response.response_code >= 400) {
        nlohmann::json error_json;
        try {
            error_json = nlohmann::json::parse(response.data);
            std::string error_msg = "API Error: ";
            if (error_json.contains("message")) {
                error_msg += error_json["message"];
            } else {
                error_msg += "HTTP " + std::to_string(response.response_code);
            }
            throw KiteException(error_msg, response.response_code);
        } catch (const nlohmann::json::parse_error&) {
            throw KiteException("HTTP Error: " + std::to_string(response.response_code), response.response_code);
        }
    }
    
    try {
        return nlohmann::json::parse(response.data);
    } catch (const nlohmann::json::parse_error& e) {
        throw KiteException("Failed to parse JSON response: " + std::string(e.what()));
    }
}

std::string KiteConnect::build_url(const std::string& endpoint) const {
    return base_url_ + endpoint;
}

std::string KiteConnect::build_query_string(const std::unordered_map<std::string, std::string>& params) const {
    std::string query;
    for (const auto& [key, value] : params) {
        if (!query.empty()) query += "&";
        
        CURL* curl = curl_easy_init();
        char* encoded_key = curl_easy_escape(curl, key.c_str(), key.length());
        char* encoded_value = curl_easy_escape(curl, value.c_str(), value.length());
        
        query += std::string(encoded_key) + "=" + std::string(encoded_value);
        
        curl_free(encoded_key);
        curl_free(encoded_value);
        curl_easy_cleanup(curl);
    }
    return query;
}

NSEBSETick KiteConnect::parse_tick_data(const nlohmann::json& data) {
    NSEBSETick tick;
    
    if (data.contains("instrument_token")) tick.instrument_token = data["instrument_token"];
    if (data.contains("exchange")) tick.exchange = data["exchange"];
    if (data.contains("last_price")) tick.last_price = data["last_price"];
    if (data.contains("ohlc")) {
        const auto& ohlc = data["ohlc"];
        if (ohlc.contains("open")) tick.open = ohlc["open"];
        if (ohlc.contains("high")) tick.high = ohlc["high"];
        if (ohlc.contains("low")) tick.low = ohlc["low"];
        if (ohlc.contains("close")) tick.close = ohlc["close"];
    }
    if (data.contains("net_change")) tick.change = data["net_change"];
    if (data.contains("volume")) tick.volume = data["volume"];
    if (data.contains("average_price")) tick.average_price = data["average_price"];
    if (data.contains("oi")) tick.oi = data["oi"];
    
    // Parse market depth
    if (data.contains("depth")) {
        const auto& depth = data["depth"];
        if (depth.contains("buy")) {
            for (const auto& buy_order : depth["buy"]) {
                NSEBSETick::MarketDepth md;
                md.price = buy_order["price"];
                md.quantity = buy_order["quantity"];
                md.orders = buy_order["orders"];
                tick.buy_depth.push_back(md);
            }
        }
        if (depth.contains("sell")) {
            for (const auto& sell_order : depth["sell"]) {
                NSEBSETick::MarketDepth md;
                md.price = sell_order["price"];
                md.quantity = sell_order["quantity"];
                md.orders = sell_order["orders"];
                tick.sell_depth.push_back(md);
            }
        }
    }
    
    return tick;
}

IndianOrder KiteConnect::parse_order_data(const nlohmann::json& data) {
    IndianOrder order;
    
    if (data.contains("order_id")) order.order_id = data["order_id"];
    if (data.contains("parent_order_id")) order.parent_order_id = data["parent_order_id"];
    if (data.contains("exchange")) order.exchange = data["exchange"];
    if (data.contains("tradingsymbol")) order.tradingsymbol = data["tradingsymbol"];
    if (data.contains("validity")) order.validity = data["validity"];
    if (data.contains("product")) order.product = data["product"];
    if (data.contains("order_type")) order.order_type = data["order_type"];
    if (data.contains("transaction_type")) order.transaction_type = data["transaction_type"];
    if (data.contains("quantity")) order.quantity = data["quantity"];
    if (data.contains("price")) order.price = data["price"];
    if (data.contains("trigger_price")) order.trigger_price = data["trigger_price"];
    if (data.contains("status")) order.status = data["status"];
    if (data.contains("filled_quantity")) order.filled_quantity = data["filled_quantity"];
    if (data.contains("pending_quantity")) order.pending_quantity = data["pending_quantity"];
    if (data.contains("average_price")) order.average_price = data["average_price"];
    if (data.contains("order_timestamp")) order.order_timestamp = data["order_timestamp"];
    if (data.contains("exchange_timestamp")) order.exchange_timestamp = data["exchange_timestamp"];
    if (data.contains("variety")) order.variety = data["variety"];
    if (data.contains("tag")) order.tag = data["tag"];
    
    return order;
}

IndianPosition KiteConnect::parse_position_data(const nlohmann::json& data) {
    IndianPosition position;
    
    if (data.contains("tradingsymbol")) position.tradingsymbol = data["tradingsymbol"];
    if (data.contains("exchange")) position.exchange = data["exchange"];
    if (data.contains("instrument_token")) position.instrument_token = data["instrument_token"];
    if (data.contains("product")) position.product = data["product"];
    if (data.contains("quantity")) position.quantity = data["quantity"];
    if (data.contains("overnight_quantity")) position.overnight_quantity = data["overnight_quantity"];
    if (data.contains("multiplier")) position.multiplier = data["multiplier"];
    if (data.contains("average_price")) position.average_price = data["average_price"];
    if (data.contains("close_price")) position.close_price = data["close_price"];
    if (data.contains("last_price")) position.last_price = data["last_price"];
    if (data.contains("value")) position.value = data["value"];
    if (data.contains("pnl")) position.pnl = data["pnl"];
    if (data.contains("m2m")) position.m2m = data["m2m"];
    if (data.contains("unrealised")) position.unrealised = data["unrealised"];
    if (data.contains("realised")) position.realised = data["realised"];
    
    return position;
}

IndianHolding KiteConnect::parse_holding_data(const nlohmann::json& data) {
    IndianHolding holding;
    
    if (data.contains("tradingsymbol")) holding.tradingsymbol = data["tradingsymbol"];
    if (data.contains("exchange")) holding.exchange = data["exchange"];
    if (data.contains("instrument_token")) holding.instrument_token = data["instrument_token"];
    if (data.contains("isin")) holding.isin = data["isin"];
    if (data.contains("quantity")) holding.quantity = data["quantity"];
    if (data.contains("t1_quantity")) holding.t1_quantity = data["t1_quantity"];
    if (data.contains("realised_quantity")) holding.realised_quantity = data["realised_quantity"];
    if (data.contains("average_price")) holding.average_price = data["average_price"];
    if (data.contains("last_price")) holding.last_price = data["last_price"];
    if (data.contains("close_price")) holding.close_price = data["close_price"];
    if (data.contains("pnl")) holding.pnl = data["pnl"];
    if (data.contains("day_change")) holding.day_change = data["day_change"];
    if (data.contains("day_change_percentage")) holding.day_change_percentage = data["day_change_percentage"];
    
    return holding;
}

} // namespace zerodha
} // namespace tradeflow