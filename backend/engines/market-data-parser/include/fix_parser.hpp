#pragma once

#include "market_data_types.hpp"
#include <string_view>
#include <unordered_map>
#include <memory>

namespace MarketData {

class FixParser {
public:
    FixParser();
    ~FixParser() = default;

    // Non-copyable, movable
    FixParser(const FixParser&) = delete;
    FixParser& operator=(const FixParser&) = delete;
    FixParser(FixParser&&) = default;
    FixParser& operator=(FixParser&&) = default;

    // Parse FIX message with zero-copy optimization
    bool parse_message(const char* data, size_t length, MarketTick& tick);
    
    // Validate FIX message checksum
    bool validate_checksum(const char* data, size_t length) const;
    
    // Get parsing statistics
    const PerformanceStats& get_stats() const { return stats_; }
    
    // Reset statistics
    void reset_stats();

private:
    // FIX field extraction (zero-copy)
    struct FixField {
        uint32_t tag;
        std::string_view value;
    };
    
    // Extract fields from FIX message
    bool extract_fields(const char* data, size_t length, std::vector<FixField>& fields);
    
    // Parse specific message types
    bool parse_market_data_snapshot(const std::vector<FixField>& fields, MarketTick& tick);
    bool parse_market_data_incremental(const std::vector<FixField>& fields, MarketTick& tick);
    
    // Field parsing helpers
    bool parse_symbol(std::string_view value, Symbol& symbol);
    bool parse_price(std::string_view value, double& price);
    bool parse_size(std::string_view value, uint64_t& size);
    bool parse_timestamp(std::string_view value, Timestamp& timestamp);
    
    // Fast string to number conversion
    bool fast_atof(std::string_view str, double& result);
    bool fast_atoi(std::string_view str, uint64_t& result);
    
    // Calculate FIX checksum
    uint8_t calculate_checksum(const char* data, size_t length) const;
    
    // Performance statistics
    mutable PerformanceStats stats_;
    
    // Field lookup table for fast access
    std::unordered_map<uint32_t, size_t> field_lookup_;
    
    // Reusable field vector to avoid allocations
    std::vector<FixField> fields_buffer_;
    
    // Constants for FIX field tags
    static constexpr uint32_t TAG_MSG_TYPE = 35;
    static constexpr uint32_t TAG_SYMBOL = 55;
    static constexpr uint32_t TAG_BID_PRICE = 132;
    static constexpr uint32_t TAG_ASK_PRICE = 133;
    static constexpr uint32_t TAG_LAST_PRICE = 31;
    static constexpr uint32_t TAG_BID_SIZE = 134;
    static constexpr uint32_t TAG_ASK_SIZE = 135;
    static constexpr uint32_t TAG_LAST_SIZE = 32;
    static constexpr uint32_t TAG_VOLUME = 146;
    static constexpr uint32_t TAG_TRANSACT_TIME = 60;
    static constexpr uint32_t TAG_CHECKSUM = 10;
    static constexpr uint32_t TAG_SEQUENCE_NUM = 34;
};

} // namespace MarketData