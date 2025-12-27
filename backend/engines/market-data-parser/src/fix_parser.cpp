#include "fix_parser.hpp"
#include "high_res_timer.hpp"
#include <algorithm>
#include <charconv>
#include <cstring>

namespace MarketData {

FixParser::FixParser() {
    fields_buffer_.reserve(64); // Pre-allocate for typical message size
}

bool FixParser::parse_message(const char* data, size_t length, MarketTick& tick) {
    auto start_time = HighResTimer::now();
    
    // Validate minimum message length
    if (length < 20) { // Minimum FIX message size
        stats_.record_error();
        return false;
    }
    
    // Validate checksum first for data integrity
    if (!validate_checksum(data, length)) {
        stats_.record_error();
        return false;
    }
    
    // Extract fields from message
    fields_buffer_.clear();
    if (!extract_fields(data, length, fields_buffer_)) {
        stats_.record_error();
        return false;
    }
    
    // Find message type
    auto msg_type_it = std::find_if(fields_buffer_.begin(), fields_buffer_.end(),
        [](const FixField& field) { return field.tag == TAG_MSG_TYPE; });
    
    if (msg_type_it == fields_buffer_.end()) {
        stats_.record_error();
        return false;
    }
    
    bool success = false;
    
    // Parse based on message type
    if (msg_type_it->value == "W") { // Market Data Snapshot
        tick.message_type = static_cast<uint16_t>(FixMessageType::MARKET_DATA_SNAPSHOT);
        success = parse_market_data_snapshot(fields_buffer_, tick);
    } else if (msg_type_it->value == "X") { // Market Data Incremental Refresh
        tick.message_type = static_cast<uint16_t>(FixMessageType::MARKET_DATA_INCREMENTAL_REFRESH);
        success = parse_market_data_incremental(fields_buffer_, tick);
    } else {
        // Unsupported message type
        stats_.record_error();
        return false;
    }
    
    if (success) {
        tick.timestamp = HighResTimer::now();
        auto end_time = HighResTimer::now();
        auto latency_ns = std::chrono::duration_cast<std::chrono::nanoseconds>(end_time - start_time).count();
        stats_.record_message(latency_ns, length);
    } else {
        stats_.record_error();
    }
    
    return success;
}

bool FixParser::validate_checksum(const char* data, size_t length) const {
    // Find checksum field (should be at the end)
    const char* checksum_start = nullptr;
    for (size_t i = length - 7; i > 0; --i) {
        if (data[i] == '1' && data[i+1] == '0' && data[i+2] == '=') {
            checksum_start = &data[i+3];
            break;
        }
    }
    
    if (!checksum_start) {
        return false;
    }
    
    // Calculate expected checksum
    size_t checksum_pos = checksum_start - data - 3;
    uint8_t calculated = calculate_checksum(data, checksum_pos);
    
    // Parse received checksum
    char checksum_str[4] = {0};
    std::memcpy(checksum_str, checksum_start, 3);
    
    uint32_t received_checksum = 0;
    auto result = std::from_chars(checksum_str, checksum_str + 3, received_checksum);
    
    return result.ec == std::errc{} && calculated == static_cast<uint8_t>(received_checksum);
}

bool FixParser::extract_fields(const char* data, size_t length, std::vector<FixField>& fields) {
    const char* current = data;
    const char* end = data + length;
    
    while (current < end) {
        // Find tag
        const char* tag_start = current;
        const char* equals = std::find(current, end, '=');
        if (equals == end) break;
        
        // Parse tag number
        uint32_t tag = 0;
        auto tag_result = std::from_chars(tag_start, equals, tag);
        if (tag_result.ec != std::errc{}) {
            return false;
        }
        
        // Find value
        const char* value_start = equals + 1;
        const char* soh = std::find(value_start, end, '\x01'); // SOH delimiter
        if (soh == end && tag != TAG_CHECKSUM) {
            // Last field might not have SOH
            soh = end;
        }
        
        // Store field
        fields.emplace_back(FixField{tag, std::string_view(value_start, soh - value_start)});
        
        current = soh + 1;
    }
    
    return !fields.empty();
}

bool FixParser::parse_market_data_snapshot(const std::vector<FixField>& fields, MarketTick& tick) {
    bool has_symbol = false;
    
    for (const auto& field : fields) {
        switch (field.tag) {
            case TAG_SYMBOL:
                if (!parse_symbol(field.value, tick.symbol)) return false;
                has_symbol = true;
                break;
                
            case TAG_BID_PRICE:
                if (!parse_price(field.value, tick.bid_price)) return false;
                break;
                
            case TAG_ASK_PRICE:
                if (!parse_price(field.value, tick.ask_price)) return false;
                break;
                
            case TAG_LAST_PRICE:
                if (!parse_price(field.value, tick.last_price)) return false;
                break;
                
            case TAG_BID_SIZE:
                if (!parse_size(field.value, tick.bid_size)) return false;
                break;
                
            case TAG_ASK_SIZE:
                if (!parse_size(field.value, tick.ask_size)) return false;
                break;
                
            case TAG_LAST_SIZE:
                if (!parse_size(field.value, tick.last_size)) return false;
                break;
                
            case TAG_VOLUME:
                if (!parse_size(field.value, tick.volume)) return false;
                break;
                
            case TAG_SEQUENCE_NUM:
                {
                    uint64_t seq = 0;
                    if (!fast_atoi(field.value, seq)) return false;
                    tick.sequence_number = static_cast<uint32_t>(seq);
                }
                break;
                
            case TAG_TRANSACT_TIME:
                if (!parse_timestamp(field.value, tick.timestamp)) return false;
                break;
        }
    }
    
    return has_symbol;
}

bool FixParser::parse_market_data_incremental(const std::vector<FixField>& fields, MarketTick& tick) {
    // Similar to snapshot but may have partial updates
    return parse_market_data_snapshot(fields, tick);
}

bool FixParser::parse_symbol(std::string_view value, Symbol& symbol) {
    if (value.empty() || value.length() >= Symbol::MAX_LENGTH) {
        return false;
    }
    
    symbol.length = static_cast<uint8_t>(value.length());
    std::copy(value.begin(), value.end(), symbol.data.begin());
    symbol.data[symbol.length] = '\0';
    
    return true;
}

bool FixParser::parse_price(std::string_view value, double& price) {
    return fast_atof(value, price);
}

bool FixParser::parse_size(std::string_view value, uint64_t& size) {
    return fast_atoi(value, size);
}

bool FixParser::parse_timestamp(std::string_view value, Timestamp& timestamp) {
    // Parse FIX timestamp format: YYYYMMDD-HH:MM:SS.sss
    if (value.length() < 17) return false;
    
    // For now, use current time - proper timestamp parsing would be more complex
    timestamp = HighResTimer::now();
    return true;
}

bool FixParser::fast_atof(std::string_view str, double& result) {
    if (str.empty()) return false;
    
    // Use std::from_chars for fast, locale-independent parsing
    auto parse_result = std::from_chars(str.data(), str.data() + str.size(), result);
    return parse_result.ec == std::errc{};
}

bool FixParser::fast_atoi(std::string_view str, uint64_t& result) {
    if (str.empty()) return false;
    
    auto parse_result = std::from_chars(str.data(), str.data() + str.size(), result);
    return parse_result.ec == std::errc{};
}

uint8_t FixParser::calculate_checksum(const char* data, size_t length) const {
    uint32_t sum = 0;
    for (size_t i = 0; i < length; ++i) {
        sum += static_cast<uint8_t>(data[i]);
    }
    return static_cast<uint8_t>(sum % 256);
}

void FixParser::reset_stats() {
    stats_ = PerformanceStats{};
}

} // namespace MarketData