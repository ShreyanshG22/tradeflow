#pragma once

#include <cstdint>
#include <string>
#include <chrono>
#include <array>

namespace MarketData {

// High-precision timestamp using nanoseconds since epoch
using Timestamp = std::chrono::time_point<std::chrono::high_resolution_clock>;

// Symbol representation (fixed size for cache efficiency)
struct Symbol {
    static constexpr size_t MAX_LENGTH = 16;
    std::array<char, MAX_LENGTH> data{};
    uint8_t length = 0;
    
    Symbol() = default;
    
    explicit Symbol(const std::string& str) {
        length = std::min(str.length(), MAX_LENGTH - 1);
        std::copy(str.begin(), str.begin() + length, data.begin());
        data[length] = '\0';
    }
    
    std::string to_string() const {
        return std::string(data.data(), length);
    }
    
    bool operator==(const Symbol& other) const {
        return length == other.length && 
               std::equal(data.begin(), data.begin() + length, other.data.begin());
    }
};

// Market data tick (cache-line aligned for performance)
struct alignas(64) MarketTick {
    Symbol symbol;
    Timestamp timestamp;
    double bid_price = 0.0;
    double ask_price = 0.0;
    double last_price = 0.0;
    uint64_t bid_size = 0;
    uint64_t ask_size = 0;
    uint64_t last_size = 0;
    uint64_t volume = 0;
    uint32_t sequence_number = 0;
    uint16_t message_type = 0;
    uint8_t flags = 0;
    uint8_t padding = 0;
};

// OHLCV bar data
struct alignas(32) OHLCVBar {
    Symbol symbol;
    Timestamp start_time;
    Timestamp end_time;
    double open = 0.0;
    double high = 0.0;
    double low = 0.0;
    double close = 0.0;
    uint64_t volume = 0;
    uint32_t tick_count = 0;
    uint32_t padding = 0;
};

// FIX message types
enum class FixMessageType : uint16_t {
    HEARTBEAT = 0,
    TEST_REQUEST = 1,
    RESEND_REQUEST = 2,
    REJECT = 3,
    SEQUENCE_RESET = 4,
    LOGOUT = 5,
    MARKET_DATA_SNAPSHOT = 87,
    MARKET_DATA_INCREMENTAL_REFRESH = 88,
    MARKET_DATA_REQUEST = 86,
    MARKET_DATA_REQUEST_REJECT = 89
};

// Binary message header for internal format
struct alignas(8) BinaryMessageHeader {
    uint32_t message_length;
    uint16_t message_type;
    uint16_t version;
    uint64_t timestamp_ns;
    uint32_t sequence_number;
    uint32_t checksum;
};

// Market data subscription
struct MarketDataSubscription {
    Symbol symbol;
    bool subscribe_to_trades = true;
    bool subscribe_to_quotes = true;
    bool subscribe_to_depth = false;
    uint32_t depth_levels = 5;
};

// Performance statistics
struct alignas(64) PerformanceStats {
    std::atomic<uint64_t> messages_processed{0};
    std::atomic<uint64_t> messages_dropped{0};
    std::atomic<uint64_t> parse_errors{0};
    std::atomic<uint64_t> total_latency_ns{0};
    std::atomic<uint64_t> max_latency_ns{0};
    std::atomic<uint64_t> min_latency_ns{UINT64_MAX};
    std::atomic<uint64_t> bytes_processed{0};
    
    void record_message(uint64_t latency_ns, size_t message_size) {
        messages_processed.fetch_add(1, std::memory_order_relaxed);
        total_latency_ns.fetch_add(latency_ns, std::memory_order_relaxed);
        bytes_processed.fetch_add(message_size, std::memory_order_relaxed);
        
        // Update min/max latency
        uint64_t current_max = max_latency_ns.load(std::memory_order_relaxed);
        while (latency_ns > current_max && 
               !max_latency_ns.compare_exchange_weak(current_max, latency_ns, std::memory_order_relaxed)) {
            // Retry if another thread updated max_latency_ns
        }
        
        uint64_t current_min = min_latency_ns.load(std::memory_order_relaxed);
        while (latency_ns < current_min && 
               !min_latency_ns.compare_exchange_weak(current_min, latency_ns, std::memory_order_relaxed)) {
            // Retry if another thread updated min_latency_ns
        }
    }
    
    void record_error() {
        parse_errors.fetch_add(1, std::memory_order_relaxed);
    }
    
    void record_drop() {
        messages_dropped.fetch_add(1, std::memory_order_relaxed);
    }
    
    double get_average_latency_us() const {
        uint64_t total_msgs = messages_processed.load(std::memory_order_relaxed);
        if (total_msgs == 0) return 0.0;
        
        uint64_t total_lat = total_latency_ns.load(std::memory_order_relaxed);
        return static_cast<double>(total_lat) / (total_msgs * 1000.0); // Convert to microseconds
    }
};

} // namespace MarketData