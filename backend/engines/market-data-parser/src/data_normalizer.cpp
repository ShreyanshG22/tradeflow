// Market Data Parser - Data Normalizer Implementation
// Normalize market data from multiple sources into standardized format

#include "logger.hpp"
#include <string>
#include <unordered_map>
#include <regex>
#include <algorithm>
#include <chrono>
#include <sstream>

namespace tradeflow {

struct MarketTick {
    std::string symbol;
    double last_price;
    long last_size;
    uint64_t timestamp;
};

class DataNormalizer {
public:
    DataNormalizer() = default;
    
    // Initialize normalization system
    bool initialize() {
        auto& logger = Logger::getInstance();
        logger.info("Initializing Data Normalizer");
        
        setup_format_rules();
        setup_validation_rules();
        
        return true;
    }
    
    // Format standardization across different sources
    void setup_format_rules() {
        symbol_mappings_["AAPL.NASDAQ"] = "AAPL";
        symbol_mappings_["AAPL.US"] = "AAPL";
        
        price_scalers_["EXCHANGE_A"] = 1.0;
        price_scalers_["EXCHANGE_B"] = 0.01;
    }
    
    // Data validation rules and thresholds
    void setup_validation_rules() {
        min_price_ = 0.01;
        max_price_ = 1000000.0;
        min_volume_ = 0;
        max_volume_ = 1000000000;
    }
    
    // Normalize market data from any source
    MarketTick normalize_data(const std::string& raw_data, const std::string& source) {
        MarketTick tick;
        
        try {
            // Parse based on source format
            tick = parse_data(raw_data, source);
            
            // Apply standardization
            standardize_symbol(tick);
            standardize_price(tick, source);
            
            // Handle missing data
            handle_missing_data(tick);
            
            // Synchronize timestamps
            synchronize_timestamp(tick);
            
            // Validate result
            if (!validate_data(tick)) {
                tick = {}; // Return empty on validation failure
            }
            
        } catch (const std::exception& e) {
            auto& logger = Logger::getInstance();
            logger.error("Normalization failed: " + std::string(e.what()));
            tick = {};
        }
        
        return tick;
    }
    
private:
    std::unordered_map<std::string, std::string> symbol_mappings_;
    std::unordered_map<std::string, double> price_scalers_;
    double min_price_, max_price_;
    long min_volume_, max_volume_;
    
    // Data processing pipeline components
    MarketTick parse_data(const std::string& raw_data, const std::string& source) {
        MarketTick tick;
        
        try {
            if (source == "EXCHANGE_A") {
                // CSV format: SYMBOL,PRICE,VOLUME,TIMESTAMP
                std::regex pattern(R"(([^,]+),([0-9.]+),([0-9]+),([0-9]+))");
                std::smatch matches;
                
                if (std::regex_match(raw_data, matches, pattern)) {
                    tick.symbol = matches[1].str();
                    tick.last_price = std::stod(matches[2].str());
                    tick.last_size = std::stol(matches[3].str());
                    tick.timestamp = std::stoull(matches[4].str());
                }
            } else if (source == "EXCHANGE_B") {
                // Pipe-delimited format: SYMBOL|PRICE|VOLUME|TIMESTAMP
                std::regex pattern(R"(([^|]+)\|([0-9.]+)\|([0-9]+)\|([0-9]+))");
                std::smatch matches;
                
                if (std::regex_match(raw_data, matches, pattern)) {
                    tick.symbol = matches[1].str();
                    tick.last_price = std::stod(matches[2].str());
                    tick.last_size = std::stol(matches[3].str());
                    tick.timestamp = std::stoull(matches[4].str());
                }
            } else if (source == "EXCHANGE_C") {
                // JSON-like format parsing
                tick = parse_json_format(raw_data);
            } else {
                // Generic space-separated format
                tick = parse_generic_format(raw_data);
            }
        } catch (const std::exception& e) {
            auto& logger = Logger::getInstance();
            logger.error("Failed to parse data from " + source + ": " + std::string(e.what()));
            tick = MarketTick{}; // Return empty tick on error
        }
        
        return tick;
    }
    
    MarketTick parse_json_format(const std::string& raw_data) {
        MarketTick tick;
        
        // Simple JSON parsing for: {"symbol":"AAPL","price":150.25,"volume":1000,"timestamp":1234567890}
        std::regex symbol_pattern(R"("symbol"\s*:\s*"([^"]+)")");
        std::regex price_pattern(R"("price"\s*:\s*([0-9.]+))");
        std::regex volume_pattern(R"("volume"\s*:\s*([0-9]+))");
        std::regex timestamp_pattern(R"("timestamp"\s*:\s*([0-9]+))");
        
        std::smatch matches;
        
        if (std::regex_search(raw_data, matches, symbol_pattern)) {
            tick.symbol = matches[1].str();
        }
        if (std::regex_search(raw_data, matches, price_pattern)) {
            tick.last_price = std::stod(matches[1].str());
        }
        if (std::regex_search(raw_data, matches, volume_pattern)) {
            tick.last_size = std::stol(matches[1].str());
        }
        if (std::regex_search(raw_data, matches, timestamp_pattern)) {
            tick.timestamp = std::stoull(matches[1].str());
        }
        
        return tick;
    }
    
    MarketTick parse_generic_format(const std::string& raw_data) {
        MarketTick tick;
        
        // Try to parse as space-separated values: SYMBOL PRICE VOLUME TIMESTAMP
        std::istringstream iss(raw_data);
        std::string symbol_str, price_str, volume_str, timestamp_str;
        
        if (iss >> symbol_str >> price_str >> volume_str >> timestamp_str) {
            try {
                tick.symbol = symbol_str;
                tick.last_price = std::stod(price_str);
                tick.last_size = std::stol(volume_str);
                tick.timestamp = std::stoull(timestamp_str);
            } catch (const std::exception& e) {
                // Return empty tick if parsing fails
                tick = MarketTick{};
            }
        }
        
        return tick;
    }
    
    void standardize_symbol(MarketTick& tick) {
        auto it = symbol_mappings_.find(tick.symbol);
        if (it != symbol_mappings_.end()) {
            tick.symbol = it->second;
        }
        std::transform(tick.symbol.begin(), tick.symbol.end(), tick.symbol.begin(), ::toupper);
    }
    
    void standardize_price(MarketTick& tick, const std::string& source) {
        auto it = price_scalers_.find(source);
        if (it != price_scalers_.end()) {
            tick.last_price *= it->second;
        }
    }
    
    // Missing data handling with interpolation
    void handle_missing_data(MarketTick& tick) {
        if (tick.last_price <= 0) {
            // Use last known price or mark as invalid
            tick.last_price = 0;
        }
        
        if (tick.last_size < 0) {
            tick.last_size = 0;
        }
    }
    
    // Timestamp synchronization across sources
    void synchronize_timestamp(MarketTick& tick) {
        if (tick.timestamp == 0) {
            // Use current timestamp if missing
            tick.timestamp = std::chrono::duration_cast<std::chrono::milliseconds>(
                std::chrono::system_clock::now().time_since_epoch()).count();
        }
    }
    
    bool validate_data(const MarketTick& tick) {
        return !tick.symbol.empty() && 
               tick.last_price >= min_price_ && tick.last_price <= max_price_ &&
               tick.last_size >= min_volume_ && tick.last_size <= max_volume_;
    }
};

} // namespace tradeflow