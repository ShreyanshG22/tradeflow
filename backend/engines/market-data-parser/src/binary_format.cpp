#include "binary_format.hpp"
#include <cstring>
#include <algorithm>

namespace MarketData {

std::vector<uint8_t> BinaryFormat::serialize_tick(const MarketTick& tick) {
    std::vector<uint8_t> buffer;
    buffer.reserve(sizeof(MarketTick) + sizeof(BinaryMessageHeader));
    
    // Calculate payload size
    size_t payload_size = sizeof(Symbol) + sizeof(uint64_t) + // symbol + timestamp
                         8 * sizeof(double) + // prices
                         4 * sizeof(uint64_t) + // sizes
                         3 * sizeof(uint32_t) + // sequence, type, flags
                         sizeof(uint8_t); // padding
    
    // Write header
    write_header(buffer, static_cast<uint16_t>(tick.message_type), payload_size);
    
    // Write payload
    write_symbol(buffer, tick.symbol);
    write_timestamp(buffer, tick.timestamp);
    write_value(buffer, tick.bid_price);
    write_value(buffer, tick.ask_price);
    write_value(buffer, tick.last_price);
    write_value(buffer, tick.bid_size);
    write_value(buffer, tick.ask_size);
    write_value(buffer, tick.last_size);
    write_value(buffer, tick.volume);
    write_value(buffer, tick.sequence_number);
    write_value(buffer, tick.message_type);
    write_value(buffer, tick.flags);
    write_value(buffer, tick.padding);
    
    // Calculate and update checksum
    uint32_t checksum = calculate_crc32(buffer.data() + sizeof(BinaryMessageHeader), 
                                       buffer.size() - sizeof(BinaryMessageHeader));
    
    // Update checksum in header
    BinaryMessageHeader* header = reinterpret_cast<BinaryMessageHeader*>(buffer.data());
    header->checksum = checksum;
    
    return buffer;
}

bool BinaryFormat::deserialize_tick(const uint8_t* data, size_t length, MarketTick& tick) {
    if (length < sizeof(BinaryMessageHeader)) {
        return false;
    }
    
    const uint8_t* current = data;
    size_t remaining = length;
    
    // Read header
    BinaryMessageHeader header;
    if (!read_header(current, remaining, header)) {
        return false;
    }
    
    // Validate message length
    if (header.message_length != length) {
        return false;
    }
    
    // Validate checksum
    uint32_t calculated_checksum = calculate_crc32(current, remaining);
    if (calculated_checksum != header.checksum) {
        return false;
    }
    
    // Read payload
    if (!read_symbol(current, remaining, tick.symbol)) return false;
    if (!read_timestamp(current, remaining, tick.timestamp)) return false;
    if (!read_value(current, remaining, tick.bid_price)) return false;
    if (!read_value(current, remaining, tick.ask_price)) return false;
    if (!read_value(current, remaining, tick.last_price)) return false;
    if (!read_value(current, remaining, tick.bid_size)) return false;
    if (!read_value(current, remaining, tick.ask_size)) return false;
    if (!read_value(current, remaining, tick.last_size)) return false;
    if (!read_value(current, remaining, tick.volume)) return false;
    if (!read_value(current, remaining, tick.sequence_number)) return false;
    if (!read_value(current, remaining, tick.message_type)) return false;
    if (!read_value(current, remaining, tick.flags)) return false;
    if (!read_value(current, remaining, tick.padding)) return false;
    
    return true;
}

std::vector<uint8_t> BinaryFormat::serialize_bar(const OHLCVBar& bar) {
    std::vector<uint8_t> buffer;
    buffer.reserve(sizeof(OHLCVBar) + sizeof(BinaryMessageHeader));
    
    size_t payload_size = sizeof(Symbol) + 2 * sizeof(uint64_t) + // symbol + timestamps
                         5 * sizeof(double) + // OHLCV
                         2 * sizeof(uint32_t); // tick_count + padding
    
    write_header(buffer, 0x0002, payload_size); // Bar message type
    
    write_symbol(buffer, bar.symbol);
    write_timestamp(buffer, bar.start_time);
    write_timestamp(buffer, bar.end_time);
    write_value(buffer, bar.open);
    write_value(buffer, bar.high);
    write_value(buffer, bar.low);
    write_value(buffer, bar.close);
    write_value(buffer, bar.volume);
    write_value(buffer, bar.tick_count);
    write_value(buffer, bar.padding);
    
    // Update checksum
    uint32_t checksum = calculate_crc32(buffer.data() + sizeof(BinaryMessageHeader), 
                                       buffer.size() - sizeof(BinaryMessageHeader));
    BinaryMessageHeader* header = reinterpret_cast<BinaryMessageHeader*>(buffer.data());
    header->checksum = checksum;
    
    return buffer;
}

bool BinaryFormat::deserialize_bar(const uint8_t* data, size_t length, OHLCVBar& bar) {
    if (length < sizeof(BinaryMessageHeader)) {
        return false;
    }
    
    const uint8_t* current = data;
    size_t remaining = length;
    
    BinaryMessageHeader header;
    if (!read_header(current, remaining, header)) {
        return false;
    }
    
    if (header.message_length != length) {
        return false;
    }
    
    uint32_t calculated_checksum = calculate_crc32(current, remaining);
    if (calculated_checksum != header.checksum) {
        return false;
    }
    
    if (!read_symbol(current, remaining, bar.symbol)) return false;
    if (!read_timestamp(current, remaining, bar.start_time)) return false;
    if (!read_timestamp(current, remaining, bar.end_time)) return false;
    if (!read_value(current, remaining, bar.open)) return false;
    if (!read_value(current, remaining, bar.high)) return false;
    if (!read_value(current, remaining, bar.low)) return false;
    if (!read_value(current, remaining, bar.close)) return false;
    if (!read_value(current, remaining, bar.volume)) return false;
    if (!read_value(current, remaining, bar.tick_count)) return false;
    if (!read_value(current, remaining, bar.padding)) return false;
    
    return true;
}

std::vector<uint8_t> BinaryFormat::serialize_tick_batch(const std::vector<MarketTick>& ticks) {
    std::vector<uint8_t> buffer;
    
    // Estimate total size
    size_t estimated_size = sizeof(BinaryMessageHeader) + 
                           sizeof(uint32_t) + // tick count
                           ticks.size() * (sizeof(MarketTick) + 32); // rough estimate
    buffer.reserve(estimated_size);
    
    // Write batch header
    write_header(buffer, 0x0003, 0); // Batch message type, size will be updated
    
    // Write tick count
    uint32_t tick_count = static_cast<uint32_t>(ticks.size());
    write_value(buffer, tick_count);
    
    // Serialize each tick (without individual headers)
    for (const auto& tick : ticks) {
        write_symbol(buffer, tick.symbol);
        write_timestamp(buffer, tick.timestamp);
        write_value(buffer, tick.bid_price);
        write_value(buffer, tick.ask_price);
        write_value(buffer, tick.last_price);
        write_value(buffer, tick.bid_size);
        write_value(buffer, tick.ask_size);
        write_value(buffer, tick.last_size);
        write_value(buffer, tick.volume);
        write_value(buffer, tick.sequence_number);
        write_value(buffer, tick.message_type);
        write_value(buffer, tick.flags);
        write_value(buffer, tick.padding);
    }
    
    // Update header with actual size and checksum
    BinaryMessageHeader* header = reinterpret_cast<BinaryMessageHeader*>(buffer.data());
    header->message_length = static_cast<uint32_t>(buffer.size());
    header->checksum = calculate_crc32(buffer.data() + sizeof(BinaryMessageHeader), 
                                      buffer.size() - sizeof(BinaryMessageHeader));
    
    return buffer;
}

bool BinaryFormat::deserialize_tick_batch(const uint8_t* data, size_t length, std::vector<MarketTick>& ticks) {
    if (length < sizeof(BinaryMessageHeader) + sizeof(uint32_t)) {
        return false;
    }
    
    const uint8_t* current = data;
    size_t remaining = length;
    
    BinaryMessageHeader header;
    if (!read_header(current, remaining, header)) {
        return false;
    }
    
    if (header.message_length != length) {
        return false;
    }
    
    uint32_t calculated_checksum = calculate_crc32(current, remaining);
    if (calculated_checksum != header.checksum) {
        return false;
    }
    
    // Read tick count
    uint32_t tick_count;
    if (!read_value(current, remaining, tick_count)) {
        return false;
    }
    
    ticks.clear();
    ticks.reserve(tick_count);
    
    // Read each tick
    for (uint32_t i = 0; i < tick_count; ++i) {
        MarketTick tick;
        
        if (!read_symbol(current, remaining, tick.symbol)) return false;
        if (!read_timestamp(current, remaining, tick.timestamp)) return false;
        if (!read_value(current, remaining, tick.bid_price)) return false;
        if (!read_value(current, remaining, tick.ask_price)) return false;
        if (!read_value(current, remaining, tick.last_price)) return false;
        if (!read_value(current, remaining, tick.bid_size)) return false;
        if (!read_value(current, remaining, tick.ask_size)) return false;
        if (!read_value(current, remaining, tick.last_size)) return false;
        if (!read_value(current, remaining, tick.volume)) return false;
        if (!read_value(current, remaining, tick.sequence_number)) return false;
        if (!read_value(current, remaining, tick.message_type)) return false;
        if (!read_value(current, remaining, tick.flags)) return false;
        if (!read_value(current, remaining, tick.padding)) return false;
        
        ticks.push_back(tick);
    }
    
    return true;
}

void BinaryFormat::write_header(std::vector<uint8_t>& buffer, uint16_t message_type, size_t payload_size) {
    BinaryMessageHeader header;
    header.message_length = static_cast<uint32_t>(sizeof(BinaryMessageHeader) + payload_size);
    header.message_type = message_type;
    header.version = BINARY_FORMAT_VERSION;
    header.timestamp_ns = std::chrono::duration_cast<std::chrono::nanoseconds>(
        std::chrono::high_resolution_clock::now().time_since_epoch()).count();
    header.sequence_number = 0; // Will be set by caller if needed
    header.checksum = 0; // Will be calculated later
    
    write_value(buffer, header);
}

bool BinaryFormat::read_header(const uint8_t*& data, size_t& remaining, BinaryMessageHeader& header) {
    return read_value(data, remaining, header);
}

void BinaryFormat::write_symbol(std::vector<uint8_t>& buffer, const Symbol& symbol) {
    write_value(buffer, symbol.length);
    buffer.insert(buffer.end(), symbol.data.begin(), symbol.data.begin() + symbol.length);
    
    // Pad to fixed size for alignment
    size_t padding = Symbol::MAX_LENGTH - symbol.length;
    buffer.insert(buffer.end(), padding, 0);
}

bool BinaryFormat::read_symbol(const uint8_t*& data, size_t& remaining, Symbol& symbol) {
    if (!read_value(data, remaining, symbol.length)) {
        return false;
    }
    
    if (remaining < Symbol::MAX_LENGTH || symbol.length >= Symbol::MAX_LENGTH) {
        return false;
    }
    
    std::memcpy(symbol.data.data(), data, symbol.length);
    symbol.data[symbol.length] = '\0';
    
    data += Symbol::MAX_LENGTH;
    remaining -= Symbol::MAX_LENGTH;
    
    return true;
}

void BinaryFormat::write_timestamp(std::vector<uint8_t>& buffer, const Timestamp& timestamp) {
    uint64_t ns = std::chrono::duration_cast<std::chrono::nanoseconds>(
        timestamp.time_since_epoch()).count();
    write_value(buffer, ns);
}

bool BinaryFormat::read_timestamp(const uint8_t*& data, size_t& remaining, Timestamp& timestamp) {
    uint64_t ns;
    if (!read_value(data, remaining, ns)) {
        return false;
    }
    
    timestamp = Timestamp(std::chrono::nanoseconds(ns));
    return true;
}

uint32_t BinaryFormat::calculate_crc32(const uint8_t* data, size_t length) {
    // Simple CRC32 implementation
    static constexpr uint32_t CRC32_POLYNOMIAL = 0xEDB88320;
    
    uint32_t crc = 0xFFFFFFFF;
    
    for (size_t i = 0; i < length; ++i) {
        crc ^= data[i];
        for (int j = 0; j < 8; ++j) {
            if (crc & 1) {
                crc = (crc >> 1) ^ CRC32_POLYNOMIAL;
            } else {
                crc >>= 1;
            }
        }
    }
    
    return crc ^ 0xFFFFFFFF;
}

std::vector<uint8_t> BinaryFormat::compress_data(const std::vector<uint8_t>& data) {
    // Simple compression - in production, use LZ4 or similar
    return simple_compress(data.data(), data.size());
}

std::vector<uint8_t> BinaryFormat::decompress_data(const std::vector<uint8_t>& compressed_data) {
    return simple_decompress(compressed_data.data(), compressed_data.size());
}

std::vector<uint8_t> BinaryFormat::simple_compress(const uint8_t* data, size_t length) {
    // Placeholder for simple RLE compression
    std::vector<uint8_t> compressed;
    compressed.reserve(length); // Worst case
    
    for (size_t i = 0; i < length; ) {
        uint8_t current = data[i];
        size_t count = 1;
        
        // Count consecutive identical bytes
        while (i + count < length && data[i + count] == current && count < 255) {
            count++;
        }
        
        if (count > 3 || current == 0) {
            // Use RLE encoding
            compressed.push_back(0); // Escape byte
            compressed.push_back(static_cast<uint8_t>(count));
            compressed.push_back(current);
        } else {
            // Store literally
            for (size_t j = 0; j < count; ++j) {
                compressed.push_back(current);
            }
        }
        
        i += count;
    }
    
    return compressed;
}

std::vector<uint8_t> BinaryFormat::simple_decompress(const uint8_t* data, size_t length) {
    std::vector<uint8_t> decompressed;
    decompressed.reserve(length * 2); // Estimate
    
    for (size_t i = 0; i < length; ) {
        if (data[i] == 0 && i + 2 < length) {
            // RLE encoded
            uint8_t count = data[i + 1];
            uint8_t value = data[i + 2];
            
            for (uint8_t j = 0; j < count; ++j) {
                decompressed.push_back(value);
            }
            
            i += 3;
        } else {
            // Literal byte
            decompressed.push_back(data[i]);
            i++;
        }
    }
    
    return decompressed;
}

} // namespace MarketData