#pragma once

#include <string>
#include <vector>
#include <memory>
#include <cstdint>
#include <sys/mman.h>
#include <fcntl.h>
#include <unistd.h>

namespace tradeflow {

struct MarketData {
    uint64_t timestamp;
    double open;
    double high;
    double low;
    double close;
    uint64_t volume;
    std::string symbol;
    
    MarketData() = default;
    MarketData(uint64_t ts, double o, double h, double l, double c, uint64_t v, const std::string& sym = "")
        : timestamp(ts), open(o), high(h), low(l), close(c), volume(v), symbol(sym) {}
};

class MemoryMappedFile {
public:
    MemoryMappedFile(const std::string& filename);
    ~MemoryMappedFile();
    
    bool open();
    void close();
    
    const char* data() const { return mapped_data_; }
    size_t size() const { return file_size_; }
    bool is_open() const { return mapped_data_ != nullptr; }

private:
    std::string filename_;
    int fd_;
    char* mapped_data_;
    size_t file_size_;
};

class DataLoader {
public:
    DataLoader();
    ~DataLoader();
    
    // Load historical data from memory-mapped files
    bool loadHistoricalData(const std::string& symbol, 
                           const std::string& timeframe,
                           uint64_t start_timestamp,
                           uint64_t end_timestamp);
    
    // Get loaded data
    const std::vector<MarketData>& getData() const { return data_; }
    
    // Parallel data loading for multiple symbols
    bool loadMultipleSymbols(const std::vector<std::string>& symbols,
                            const std::string& timeframe,
                            uint64_t start_timestamp,
                            uint64_t end_timestamp);
    
    // Data validation and cleaning
    bool validateData();
    void cleanData();
    
    // Memory usage optimization
    void optimizeMemoryLayout();
    
private:
    std::vector<MarketData> data_;
    std::vector<std::unique_ptr<MemoryMappedFile>> mapped_files_;
    
    // Internal helper methods
    bool parseDataFile(const MemoryMappedFile& file, 
                      uint64_t start_timestamp, 
                      uint64_t end_timestamp);
    std::string getDataFilePath(const std::string& symbol, 
                               const std::string& timeframe) const;
    bool isValidDataPoint(const MarketData& data) const;
};

} // namespace tradeflow