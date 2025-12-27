#include "data_loader.hpp"
#include "logger.hpp"
#include <sys/stat.h>
#include <algorithm>
#include <sstream>
#include <thread>
#include <future>
#include <cstring>

namespace tradeflow {

// MemoryMappedFile implementation
MemoryMappedFile::MemoryMappedFile(const std::string& filename)
    : filename_(filename), fd_(-1), mapped_data_(nullptr), file_size_(0) {}

MemoryMappedFile::~MemoryMappedFile() {
    close();
}

bool MemoryMappedFile::open() {
    // Open file
    fd_ = ::open(filename_.c_str(), O_RDONLY);
    if (fd_ == -1) {
        Logger::getInstance().error("Failed to open file: {}", filename_);
        return false;
    }
    
    // Get file size
    struct stat st;
    if (fstat(fd_, &st) == -1) {
        Logger::getInstance().error("Failed to get file size: {}", filename_);
        ::close(fd_);
        fd_ = -1;
        return false;
    }
    file_size_ = st.st_size;
    
    // Memory map the file
    mapped_data_ = static_cast<char*>(mmap(nullptr, file_size_, PROT_READ, MAP_PRIVATE, fd_, 0));
    if (mapped_data_ == MAP_FAILED) {
        Logger::getInstance().error("Failed to memory map file: {}", filename_);
        ::close(fd_);
        fd_ = -1;
        mapped_data_ = nullptr;
        return false;
    }
    
    // Advise kernel about access pattern
    madvise(mapped_data_, file_size_, MADV_SEQUENTIAL);
    
    Logger::getInstance().debug("Memory mapped file: {} (size: {} bytes)", filename_, file_size_);
    return true;
}

void MemoryMappedFile::close() {
    if (mapped_data_ != nullptr) {
        munmap(mapped_data_, file_size_);
        mapped_data_ = nullptr;
    }
    
    if (fd_ != -1) {
        ::close(fd_);
        fd_ = -1;
    }
    
    file_size_ = 0;
}

// DataLoader implementation
DataLoader::DataLoader() {
    data_.reserve(1000000); // Pre-allocate for 1M data points
}

DataLoader::~DataLoader() {
    mapped_files_.clear();
}

bool DataLoader::loadHistoricalData(const std::string& symbol, 
                                   const std::string& timeframe,
                                   uint64_t start_timestamp,
                                   uint64_t end_timestamp) {
    auto& logger = Logger::getInstance();
    logger.info("Loading historical data for {} ({})", symbol, timeframe);
    
    std::string file_path = getDataFilePath(symbol, timeframe);
    
    auto mapped_file = std::make_unique<MemoryMappedFile>(file_path);
    if (!mapped_file->open()) {
        logger.error("Failed to open data file: {}", file_path);
        return false;
    }
    
    bool success = parseDataFile(*mapped_file, start_timestamp, end_timestamp);
    
    if (success) {
        mapped_files_.push_back(std::move(mapped_file));
        logger.info("Loaded {} data points for {}", data_.size(), symbol);
    }
    
    return success;
}

bool DataLoader::loadMultipleSymbols(const std::vector<std::string>& symbols,
                                    const std::string& timeframe,
                                    uint64_t start_timestamp,
                                    uint64_t end_timestamp) {
    auto& logger = Logger::getInstance();
    logger.info("Loading data for {} symbols in parallel", symbols.size());
    
    std::vector<std::future<bool>> futures;
    std::vector<std::vector<MarketData>> symbol_data(symbols.size());
    
    // Launch parallel loading tasks
    for (size_t i = 0; i < symbols.size(); ++i) {
        futures.push_back(std::async(std::launch::async, [&, i]() {
            DataLoader loader;
            bool success = loader.loadHistoricalData(symbols[i], timeframe, 
                                                   start_timestamp, end_timestamp);
            if (success) {
                symbol_data[i] = loader.getData();
            }
            return success;
        }));
    }
    
    // Wait for all tasks to complete
    bool all_success = true;
    for (auto& future : futures) {
        if (!future.get()) {
            all_success = false;
        }
    }
    
    if (all_success) {
        // Merge all symbol data
        data_.clear();
        for (const auto& symbol_vec : symbol_data) {
            data_.insert(data_.end(), symbol_vec.begin(), symbol_vec.end());
        }
        
        // Sort by timestamp for chronological order
        std::sort(data_.begin(), data_.end(), 
                 [](const MarketData& a, const MarketData& b) {
                     return a.timestamp < b.timestamp;
                 });
        
        logger.info("Successfully loaded {} total data points", data_.size());
    }
    
    return all_success;
}

bool DataLoader::validateData() {
    auto& logger = Logger::getInstance();
    size_t invalid_count = 0;
    
    for (const auto& data_point : data_) {
        if (!isValidDataPoint(data_point)) {
            invalid_count++;
        }
    }
    
    if (invalid_count > 0) {
        logger.warn("Found {} invalid data points out of {}", invalid_count, data_.size());
        return false;
    }
    
    logger.debug("Data validation passed for {} points", data_.size());
    return true;
}

void DataLoader::cleanData() {
    auto& logger = Logger::getInstance();
    size_t original_size = data_.size();
    
    // Remove invalid data points
    data_.erase(std::remove_if(data_.begin(), data_.end(),
                              [this](const MarketData& data) {
                                  return !isValidDataPoint(data);
                              }), data_.end());
    
    // Sort by timestamp
    std::sort(data_.begin(), data_.end(),
             [](const MarketData& a, const MarketData& b) {
                 return a.timestamp < b.timestamp;
             });
    
    size_t cleaned_size = data_.size();
    logger.info("Data cleaning: {} -> {} points ({} removed)", 
               original_size, cleaned_size, original_size - cleaned_size);
}

void DataLoader::optimizeMemoryLayout() {
    // Shrink vector to fit actual data
    data_.shrink_to_fit();
    
    // Clear unused mapped files
    mapped_files_.clear();
    
    Logger::getInstance().debug("Memory layout optimized");
}

bool DataLoader::parseDataFile(const MemoryMappedFile& file, 
                              uint64_t start_timestamp, 
                              uint64_t end_timestamp) {
    const char* data = file.data();
    size_t size = file.size();
    
    if (size == 0) {
        return false;
    }
    
    // Parse CSV format: timestamp,open,high,low,close,volume
    const char* line_start = data;
    const char* data_end = data + size;
    
    while (line_start < data_end) {
        const char* line_end = std::find(line_start, data_end, '\n');
        
        if (line_end > line_start) {
            // Parse line
            std::string line(line_start, line_end - line_start);
            std::istringstream iss(line);
            std::string token;
            
            std::vector<std::string> tokens;
            while (std::getline(iss, token, ',')) {
                tokens.push_back(token);
            }
            
            if (tokens.size() >= 6) {
                try {
                    uint64_t timestamp = std::stoull(tokens[0]);
                    
                    // Filter by timestamp range
                    if (timestamp >= start_timestamp && timestamp <= end_timestamp) {
                        MarketData market_data;
                        market_data.timestamp = timestamp;
                        market_data.open = std::stod(tokens[1]);
                        market_data.high = std::stod(tokens[2]);
                        market_data.low = std::stod(tokens[3]);
                        market_data.close = std::stod(tokens[4]);
                        market_data.volume = std::stoull(tokens[5]);
                        
                        data_.push_back(market_data);
                    }
                } catch (const std::exception& e) {
                    // Skip invalid lines
                    continue;
                }
            }
        }
        
        line_start = line_end + 1;
    }
    
    return !data_.empty();
}

std::string DataLoader::getDataFilePath(const std::string& symbol, 
                                       const std::string& timeframe) const {
    // Construct file path: data/{symbol}_{timeframe}.csv
    return "data/" + symbol + "_" + timeframe + ".csv";
}

bool DataLoader::isValidDataPoint(const MarketData& data) const {
    // Basic validation checks
    return data.timestamp > 0 &&
           data.open > 0 && data.high > 0 && data.low > 0 && data.close > 0 &&
           data.high >= data.low &&
           data.high >= data.open && data.high >= data.close &&
           data.low <= data.open && data.low <= data.close &&
           data.volume >= 0;
}

} // namespace tradeflow