#pragma once

#include "market_data_types.hpp"
#include <vector>
#include <memory>

namespace MarketData {

class BinaryFormat {
public:
    BinaryFormat() = default;
    ~BinaryFormat() = default;

    // Serialize market tick to binary format
    std::vector<uint8_t> serialize_tick(const MarketTick& tick);
    
    // Deserialize market tick from binary format
    bool deserialize_tick(const uint8_t* data, size_t length, MarketTick& tick);
    
    // Serialize OHLCV bar to binary format
    std::vector<uint8_t> serialize_bar(const OHLCVBar& bar);
    
    // Deserialize OHLCV bar from binary format
    bool deserialize_bar(const uint8_t* data, size_t length, OHLCVBar& bar);
    
    // Batch serialization for better performance
    std::vector<uint8_t> serialize_tick_batch(const std::vector<MarketTick>& ticks);
    bool deserialize_tick_batch(const uint8_t* data, size_t length, std::vector<MarketTick>& ticks);
    
    // Compression utilities
    std::vector<uint8_t> compress_data(const std::vector<uint8_t>& data);
    std::vector<uint8_t> decompress_data(const std::vector<uint8_t>& compressed_data);
    
    // Get format version
    static constexpr uint16_t get_version() { return BINARY_FORMAT_VERSION; }

private:
    static constexpr uint16_t BINARY_FORMAT_VERSION = 1;
    static constexpr uint32_t MAGIC_NUMBER = 0x4D444154; // "MDAT"
    
    // Serialization helpers
    void write_header(std::vector<uint8_t>& buffer, uint16_t message_type, size_t payload_size);
    bool read_header(const uint8_t*& data, size_t& remaining, BinaryMessageHeader& header);
    
    void write_symbol(std::vector<uint8_t>& buffer, const Symbol& symbol);
    bool read_symbol(const uint8_t*& data, size_t& remaining, Symbol& symbol);
    
    void write_timestamp(std::vector<uint8_t>& buffer, const Timestamp& timestamp);
    bool read_timestamp(const uint8_t*& data, size_t& remaining, Timestamp& timestamp);
    
    template<typename T>
    void write_value(std::vector<uint8_t>& buffer, const T& value);
    
    template<typename T>
    bool read_value(const uint8_t*& data, size_t& remaining, T& value);
    
    // Calculate CRC32 checksum
    uint32_t calculate_crc32(const uint8_t* data, size_t length);
    
    // Simple LZ4-style compression
    std::vector<uint8_t> simple_compress(const uint8_t* data, size_t length);
    std::vector<uint8_t> simple_decompress(const uint8_t* data, size_t length);
};

// Template implementations
template<typename T>
void BinaryFormat::write_value(std::vector<uint8_t>& buffer, const T& value) {
    const uint8_t* bytes = reinterpret_cast<const uint8_t*>(&value);
    buffer.insert(buffer.end(), bytes, bytes + sizeof(T));
}

template<typename T>
bool BinaryFormat::read_value(const uint8_t*& data, size_t& remaining, T& value) {
    if (remaining < sizeof(T)) {
        return false;
    }
    
    std::memcpy(&value, data, sizeof(T));
    data += sizeof(T);
    remaining -= sizeof(T);
    return true;
}

} // namespace MarketData