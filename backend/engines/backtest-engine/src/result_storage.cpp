#include "result_storage.hpp"
#include "logger.hpp"
#include <filesystem>
#include <fstream>
#include <sstream>
#include <iomanip>
#include <chrono>
#include <algorithm>
#include <ctime>

namespace tradeflow {

// ResultStorage implementation
ResultStorage::ResultStorage(const std::string& storage_directory) 
    : storage_directory_(storage_directory) {
    
    // Create storage directory if it doesn't exist
    std::filesystem::create_directories(storage_directory_);
    
    Logger::getInstance().debug("ResultStorage initialized with directory: {}", storage_directory_);
}

ResultStorage::~ResultStorage() = default;

bool ResultStorage::storeResult(const BacktestResult& result, StorageFormat format) {
    auto& logger = Logger::getInstance();
    
    std::string filepath = getResultPath(result.backtest_id, format);
    
    bool success = false;
    switch (format) {
        case StorageFormat::BINARY:
            success = saveBinaryFormat(result, filepath);
            break;
        case StorageFormat::JSON:
            success = saveJsonFormat(result, filepath);
            break;
        case StorageFormat::CSV:
            success = saveCsvFormat(result, filepath);
            break;
        case StorageFormat::HDF5:
            logger.warn("HDF5 format not implemented, falling back to binary");
            success = saveBinaryFormat(result, filepath);
            break;
    }
    
    if (success) {
        logger.info("Stored backtest result {} in {} format", result.backtest_id, 
                   format == StorageFormat::BINARY ? "binary" : 
                   format == StorageFormat::JSON ? "JSON" : "CSV");
    } else {
        logger.error("Failed to store backtest result {}", result.backtest_id);
    }
    
    return success;
}

bool ResultStorage::loadResult(const std::string& backtest_id, BacktestResult& result) {
    // Try different formats in order of preference
    std::vector<StorageFormat> formats = {StorageFormat::BINARY, StorageFormat::JSON, StorageFormat::CSV};
    
    for (auto format : formats) {
        std::string filepath = getResultPath(backtest_id, format);
        
        if (std::filesystem::exists(filepath)) {
            bool success = false;
            switch (format) {
                case StorageFormat::BINARY:
                    success = loadBinaryFormat(filepath, result);
                    break;
                case StorageFormat::JSON:
                    success = loadJsonFormat(filepath, result);
                    break;
                default:
                    continue; // Skip unsupported formats for loading
            }
            
            if (success) {
                Logger::getInstance().debug("Loaded backtest result {} from {} format", 
                                          backtest_id, format == StorageFormat::BINARY ? "binary" : "JSON");
                return true;
            }
        }
    }
    
    Logger::getInstance().warn("Could not load backtest result {}", backtest_id);
    return false;
}

bool ResultStorage::deleteResult(const std::string& backtest_id) {
    bool deleted_any = false;
    
    std::vector<StorageFormat> formats = {StorageFormat::BINARY, StorageFormat::JSON, StorageFormat::CSV};
    
    for (auto format : formats) {
        std::string filepath = getResultPath(backtest_id, format);
        
        if (std::filesystem::exists(filepath)) {
            try {
                std::filesystem::remove(filepath);
                deleted_any = true;
            } catch (const std::exception& e) {
                Logger::getInstance().error("Failed to delete {}: {}", filepath, e.what());
            }
        }
    }
    
    if (deleted_any) {
        Logger::getInstance().info("Deleted backtest result {}", backtest_id);
    }
    
    return deleted_any;
}

std::vector<std::string> ResultStorage::listResults() const {
    std::vector<std::string> result_ids;
    
    try {
        for (const auto& entry : std::filesystem::directory_iterator(storage_directory_)) {
            if (entry.is_regular_file()) {
                std::string filename = entry.path().stem().string();
                
                // Remove format suffix if present
                size_t dot_pos = filename.find_last_of('.');
                if (dot_pos != std::string::npos) {
                    filename = filename.substr(0, dot_pos);
                }
                
                // Add to results if not already present
                if (std::find(result_ids.begin(), result_ids.end(), filename) == result_ids.end()) {
                    result_ids.push_back(filename);
                }
            }
        }
    } catch (const std::exception& e) {
        Logger::getInstance().error("Error listing results: {}", e.what());
    }
    
    return result_ids;
}

BacktestComparison ResultStorage::compareResults(const std::vector<std::string>& backtest_ids) const {
    BacktestComparison comparison;
    comparison.backtest_ids = backtest_ids;
    
    for (const auto& id : backtest_ids) {
        BacktestResult result;
        // Create a non-const reference to call loadResult
        ResultStorage* non_const_this = const_cast<ResultStorage*>(this);
        if (non_const_this->loadResult(id, result)) {
            comparison.strategy_names.push_back(result.strategy_name);
            comparison.returns[id] = result.statistics.total_return;
            comparison.sharpe_ratios[id] = result.statistics.sharpe_ratio;
            comparison.max_drawdowns[id] = result.statistics.max_drawdown;
            comparison.win_rates[id] = result.statistics.win_rate;
            comparison.total_trades[id] = result.statistics.total_trades;
        }
    }
    
    // Create rankings
    for (const auto& pair : comparison.returns) {
        comparison.return_ranking.push_back(pair);
    }
    std::sort(comparison.return_ranking.begin(), comparison.return_ranking.end(),
             [](const auto& a, const auto& b) { return a.second > b.second; });
    
    for (const auto& pair : comparison.sharpe_ratios) {
        comparison.sharpe_ranking.push_back(pair);
    }
    std::sort(comparison.sharpe_ranking.begin(), comparison.sharpe_ranking.end(),
             [](const auto& a, const auto& b) { return a.second > b.second; });
    
    for (const auto& pair : comparison.max_drawdowns) {
        comparison.drawdown_ranking.push_back(pair);
    }
    std::sort(comparison.drawdown_ranking.begin(), comparison.drawdown_ranking.end(),
             [](const auto& a, const auto& b) { return a.second < b.second; }); // Lower is better
    
    return comparison;
}

std::string ResultStorage::generateBacktestId() const {
    auto now = std::chrono::system_clock::now();
    auto time_t = std::chrono::system_clock::to_time_t(now);
    auto ms = std::chrono::duration_cast<std::chrono::milliseconds>(
        now.time_since_epoch()) % 1000;
    
    std::stringstream ss;
    ss << "bt_" << std::put_time(std::localtime(&time_t), "%Y%m%d_%H%M%S") 
       << "_" << std::setfill('0') << std::setw(3) << ms.count();
    
    return ss.str();
}

std::string ResultStorage::getResultPath(const std::string& backtest_id, StorageFormat format) const {
    std::string extension;
    switch (format) {
        case StorageFormat::BINARY: extension = ".bin"; break;
        case StorageFormat::JSON: extension = ".json"; break;
        case StorageFormat::CSV: extension = ".csv"; break;
        case StorageFormat::HDF5: extension = ".h5"; break;
    }
    
    return storage_directory_ + "/" + backtest_id + extension;
}

bool ResultStorage::saveBinaryFormat(const BacktestResult& result, const std::string& filepath) const {
    try {
        std::ofstream file(filepath, std::ios::binary);
        if (!file.is_open()) return false;
        
        // Write header
        uint32_t version = 1;
        file.write(reinterpret_cast<const char*>(&version), sizeof(version));
        
        // Write string fields
        auto writeString = [&file](const std::string& str) {
            uint32_t size = str.size();
            file.write(reinterpret_cast<const char*>(&size), sizeof(size));
            file.write(str.c_str(), size);
        };
        
        writeString(result.backtest_id);
        writeString(result.strategy_name);
        writeString(result.symbol);
        
        // Write basic fields
        file.write(reinterpret_cast<const char*>(&result.start_timestamp), sizeof(result.start_timestamp));
        file.write(reinterpret_cast<const char*>(&result.end_timestamp), sizeof(result.end_timestamp));
        file.write(reinterpret_cast<const char*>(&result.initial_capital), sizeof(result.initial_capital));
        file.write(reinterpret_cast<const char*>(&result.created_timestamp), sizeof(result.created_timestamp));
        
        // Write statistics (simplified - in real implementation would serialize the full struct)
        file.write(reinterpret_cast<const char*>(&result.statistics.total_return), sizeof(result.statistics.total_return));
        file.write(reinterpret_cast<const char*>(&result.statistics.sharpe_ratio), sizeof(result.statistics.sharpe_ratio));
        file.write(reinterpret_cast<const char*>(&result.statistics.max_drawdown), sizeof(result.statistics.max_drawdown));
        
        // Write equity curve
        uint32_t equity_size = result.equity_curve.size();
        file.write(reinterpret_cast<const char*>(&equity_size), sizeof(equity_size));
        file.write(reinterpret_cast<const char*>(result.equity_curve.data()), 
                  equity_size * sizeof(double));
        
        // Write trades count (simplified)
        uint32_t trades_count = result.trades.size();
        file.write(reinterpret_cast<const char*>(&trades_count), sizeof(trades_count));
        
        return true;
    } catch (const std::exception& e) {
        Logger::getInstance().error("Error saving binary format: {}", e.what());
        return false;
    }
}

bool ResultStorage::loadBinaryFormat(const std::string& filepath, BacktestResult& result) const {
    try {
        std::ifstream file(filepath, std::ios::binary);
        if (!file.is_open()) return false;
        
        // Read header
        uint32_t version;
        file.read(reinterpret_cast<char*>(&version), sizeof(version));
        
        if (version != 1) {
            Logger::getInstance().warn("Unsupported binary format version: {}", version);
            return false;
        }
        
        // Read string fields
        auto readString = [&file]() -> std::string {
            uint32_t size;
            file.read(reinterpret_cast<char*>(&size), sizeof(size));
            std::string str(size, '\0');
            file.read(&str[0], size);
            return str;
        };
        
        result.backtest_id = readString();
        result.strategy_name = readString();
        result.symbol = readString();
        
        // Read basic fields
        file.read(reinterpret_cast<char*>(&result.start_timestamp), sizeof(result.start_timestamp));
        file.read(reinterpret_cast<char*>(&result.end_timestamp), sizeof(result.end_timestamp));
        file.read(reinterpret_cast<char*>(&result.initial_capital), sizeof(result.initial_capital));
        file.read(reinterpret_cast<char*>(&result.created_timestamp), sizeof(result.created_timestamp));
        
        // Read statistics
        file.read(reinterpret_cast<char*>(&result.statistics.total_return), sizeof(result.statistics.total_return));
        file.read(reinterpret_cast<char*>(&result.statistics.sharpe_ratio), sizeof(result.statistics.sharpe_ratio));
        file.read(reinterpret_cast<char*>(&result.statistics.max_drawdown), sizeof(result.statistics.max_drawdown));
        
        // Read equity curve
        uint32_t equity_size;
        file.read(reinterpret_cast<char*>(&equity_size), sizeof(equity_size));
        result.equity_curve.resize(equity_size);
        file.read(reinterpret_cast<char*>(result.equity_curve.data()), 
                 equity_size * sizeof(double));
        
        // Read trades count
        uint32_t trades_count;
        file.read(reinterpret_cast<char*>(&trades_count), sizeof(trades_count));
        
        return true;
    } catch (const std::exception& e) {
        Logger::getInstance().error("Error loading binary format: {}", e.what());
        return false;
    }
}

bool ResultStorage::saveJsonFormat(const BacktestResult& result, const std::string& filepath) const {
    try {
        std::ofstream file(filepath);
        if (!file.is_open()) return false;
        
        file << "{\n";
        file << "  \"backtest_id\": \"" << result.backtest_id << "\",\n";
        file << "  \"strategy_name\": \"" << result.strategy_name << "\",\n";
        file << "  \"symbol\": \"" << result.symbol << "\",\n";
        file << "  \"start_timestamp\": " << result.start_timestamp << ",\n";
        file << "  \"end_timestamp\": " << result.end_timestamp << ",\n";
        file << "  \"initial_capital\": " << result.initial_capital << ",\n";
        file << "  \"created_timestamp\": " << result.created_timestamp << ",\n";
        
        file << "  \"statistics\": {\n";
        file << "    \"total_return\": " << result.statistics.total_return << ",\n";
        file << "    \"annualized_return\": " << result.statistics.annualized_return << ",\n";
        file << "    \"volatility\": " << result.statistics.volatility << ",\n";
        file << "    \"sharpe_ratio\": " << result.statistics.sharpe_ratio << ",\n";
        file << "    \"sortino_ratio\": " << result.statistics.sortino_ratio << ",\n";
        file << "    \"max_drawdown\": " << result.statistics.max_drawdown << ",\n";
        file << "    \"total_trades\": " << result.statistics.total_trades << ",\n";
        file << "    \"win_rate\": " << result.statistics.win_rate << ",\n";
        file << "    \"profit_factor\": " << result.statistics.profit_factor << "\n";
        file << "  },\n";
        
        file << "  \"equity_curve\": [";
        for (size_t i = 0; i < result.equity_curve.size(); ++i) {
            if (i > 0) file << ", ";
            file << result.equity_curve[i];
        }
        file << "],\n";
        
        file << "  \"trades_count\": " << result.trades.size() << "\n";
        file << "}\n";
        
        return true;
    } catch (const std::exception& e) {
        Logger::getInstance().error("Error saving JSON format: {}", e.what());
        return false;
    }
}

bool ResultStorage::loadJsonFormat(const std::string& filepath, BacktestResult& result) const {
    // Simplified JSON parsing - in a real implementation would use a proper JSON library
    try {
        std::ifstream file(filepath);
        if (!file.is_open()) return false;
        
        std::string line;
        while (std::getline(file, line)) {
            // Very basic JSON parsing - would use nlohmann/json or similar in production
            if (line.find("\"backtest_id\"") != std::string::npos) {
                size_t start = line.find("\"", line.find(":")) + 1;
                size_t end = line.find("\"", start);
                result.backtest_id = line.substr(start, end - start);
            }
            // Add more parsing as needed...
        }
        
        return true;
    } catch (const std::exception& e) {
        Logger::getInstance().error("Error loading JSON format: {}", e.what());
        return false;
    }
}

bool ResultStorage::saveCsvFormat(const BacktestResult& result, const std::string& filepath) const {
    try {
        std::ofstream file(filepath);
        if (!file.is_open()) return false;
        
        // Write header
        file << "Metric,Value\n";
        file << "Backtest ID," << result.backtest_id << "\n";
        file << "Strategy Name," << result.strategy_name << "\n";
        file << "Symbol," << result.symbol << "\n";
        file << "Initial Capital," << result.initial_capital << "\n";
        file << "Total Return," << result.statistics.total_return << "\n";
        file << "Annualized Return," << result.statistics.annualized_return << "\n";
        file << "Volatility," << result.statistics.volatility << "\n";
        file << "Sharpe Ratio," << result.statistics.sharpe_ratio << "\n";
        file << "Sortino Ratio," << result.statistics.sortino_ratio << "\n";
        file << "Max Drawdown," << result.statistics.max_drawdown << "\n";
        file << "Total Trades," << result.statistics.total_trades << "\n";
        file << "Win Rate," << result.statistics.win_rate << "\n";
        file << "Profit Factor," << result.statistics.profit_factor << "\n";
        
        return true;
    } catch (const std::exception& e) {
        Logger::getInstance().error("Error saving CSV format: {}", e.what());
        return false;
    }
}

// ReportGenerator implementation
ReportGenerator::ReportGenerator() {
    Logger::getInstance().debug("ReportGenerator initialized");
}

ReportGenerator::~ReportGenerator() = default;

bool ReportGenerator::generateReport(const BacktestResult& result, 
                                   const std::string& output_path,
                                   ReportFormat format) const {
    switch (format) {
        case ReportFormat::HTML:
            return generateHtmlReport(result, output_path);
        case ReportFormat::JSON:
            return generateJsonReport(result, output_path);
        case ReportFormat::CSV:
            return generateCsvReport(result, output_path);
        case ReportFormat::MARKDOWN:
            return generateMarkdownReport(result, output_path);
        default:
            Logger::getInstance().warn("Unsupported report format");
            return false;
    }
}

bool ReportGenerator::generateHtmlReport(const BacktestResult& result, const std::string& output_path) const {
    try {
        std::ofstream file(output_path);
        if (!file.is_open()) return false;
        
        file << "<!DOCTYPE html>\n<html>\n<head>\n";
        file << "<title>Backtest Report - " << result.strategy_name << "</title>\n";
        file << "<style>\n";
        file << "body { font-family: Arial, sans-serif; margin: 20px; }\n";
        file << ".metric { margin: 10px 0; }\n";
        file << ".positive { color: green; }\n";
        file << ".negative { color: red; }\n";
        file << "table { border-collapse: collapse; width: 100%; }\n";
        file << "th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }\n";
        file << "th { background-color: #f2f2f2; }\n";
        file << "</style>\n</head>\n<body>\n";
        
        file << "<h1>Backtest Report</h1>\n";
        file << "<h2>Strategy: " << result.strategy_name << "</h2>\n";
        file << "<p><strong>Symbol:</strong> " << result.symbol << "</p>\n";
        file << "<p><strong>Period:</strong> " << formatTimestamp(result.start_timestamp) 
             << " to " << formatTimestamp(result.end_timestamp) << "</p>\n";
        file << "<p><strong>Initial Capital:</strong> " << formatCurrency(result.initial_capital) << "</p>\n";
        
        file << "<h3>Performance Summary</h3>\n";
        file << "<table>\n";
        file << "<tr><th>Metric</th><th>Value</th></tr>\n";
        file << "<tr><td>Total Return</td><td class=\"" 
             << (result.statistics.total_return >= 0 ? "positive" : "negative") << "\">" 
             << formatPercentage(result.statistics.total_return) << "</td></tr>\n";
        file << "<tr><td>Annualized Return</td><td>" << formatPercentage(result.statistics.annualized_return) << "</td></tr>\n";
        file << "<tr><td>Volatility</td><td>" << formatPercentage(result.statistics.volatility) << "</td></tr>\n";
        file << "<tr><td>Sharpe Ratio</td><td>" << formatNumber(result.statistics.sharpe_ratio) << "</td></tr>\n";
        file << "<tr><td>Sortino Ratio</td><td>" << formatNumber(result.statistics.sortino_ratio) << "</td></tr>\n";
        file << "<tr><td>Max Drawdown</td><td class=\"negative\">" << formatPercentage(result.statistics.max_drawdown) << "</td></tr>\n";
        file << "<tr><td>Total Trades</td><td>" << result.statistics.total_trades << "</td></tr>\n";
        file << "<tr><td>Win Rate</td><td>" << formatPercentage(result.statistics.win_rate) << "</td></tr>\n";
        file << "<tr><td>Profit Factor</td><td>" << formatNumber(result.statistics.profit_factor) << "</td></tr>\n";
        file << "</table>\n";
        
        if (result.has_monte_carlo) {
            file << "<h3>Monte Carlo Analysis</h3>\n";
            file << "<table>\n";
            file << "<tr><th>Metric</th><th>Value</th></tr>\n";
            file << "<tr><td>Mean Final Value</td><td>" << formatCurrency(result.monte_carlo.mean_final_value) << "</td></tr>\n";
            file << "<tr><td>5th Percentile</td><td>" << formatCurrency(result.monte_carlo.percentile_5) << "</td></tr>\n";
            file << "<tr><td>95th Percentile</td><td>" << formatCurrency(result.monte_carlo.percentile_95) << "</td></tr>\n";
            file << "<tr><td>Probability of Loss</td><td>" << formatPercentage(result.monte_carlo.probability_of_loss) << "</td></tr>\n";
            file << "</table>\n";
        }
        
        file << "<p><em>Report generated on " << formatTimestamp(std::chrono::duration_cast<std::chrono::seconds>(
            std::chrono::system_clock::now().time_since_epoch()).count()) << "</em></p>\n";
        
        file << "</body>\n</html>\n";
        
        return true;
    } catch (const std::exception& e) {
        Logger::getInstance().error("Error generating HTML report: {}", e.what());
        return false;
    }
}

bool ReportGenerator::generateMarkdownReport(const BacktestResult& result, const std::string& output_path) const {
    try {
        std::ofstream file(output_path);
        if (!file.is_open()) return false;
        
        file << "# Backtest Report\n\n";
        file << "## Strategy: " << result.strategy_name << "\n\n";
        file << "- **Symbol:** " << result.symbol << "\n";
        file << "- **Period:** " << formatTimestamp(result.start_timestamp) 
             << " to " << formatTimestamp(result.end_timestamp) << "\n";
        file << "- **Initial Capital:** " << formatCurrency(result.initial_capital) << "\n\n";
        
        file << "## Performance Summary\n\n";
        file << "| Metric | Value |\n";
        file << "|--------|-------|\n";
        file << "| Total Return | " << formatPercentage(result.statistics.total_return) << " |\n";
        file << "| Annualized Return | " << formatPercentage(result.statistics.annualized_return) << " |\n";
        file << "| Volatility | " << formatPercentage(result.statistics.volatility) << " |\n";
        file << "| Sharpe Ratio | " << formatNumber(result.statistics.sharpe_ratio) << " |\n";
        file << "| Sortino Ratio | " << formatNumber(result.statistics.sortino_ratio) << " |\n";
        file << "| Max Drawdown | " << formatPercentage(result.statistics.max_drawdown) << " |\n";
        file << "| Total Trades | " << result.statistics.total_trades << " |\n";
        file << "| Win Rate | " << formatPercentage(result.statistics.win_rate) << " |\n";
        file << "| Profit Factor | " << formatNumber(result.statistics.profit_factor) << " |\n\n";
        
        return true;
    } catch (const std::exception& e) {
        Logger::getInstance().error("Error generating Markdown report: {}", e.what());
        return false;
    }
}

std::string ReportGenerator::formatNumber(double value, int precision) const {
    std::stringstream ss;
    ss << std::fixed << std::setprecision(precision) << value;
    return ss.str();
}

std::string ReportGenerator::formatPercentage(double value, int precision) const {
    return formatNumber(value * 100, precision) + "%";
}

std::string ReportGenerator::formatCurrency(double value, int precision) const {
    return "$" + formatNumber(value, precision);
}

std::string ReportGenerator::formatTimestamp(uint64_t timestamp) const {
    std::time_t time = static_cast<std::time_t>(timestamp);
    std::stringstream ss;
    ss << std::put_time(std::localtime(&time), "%Y-%m-%d");
    return ss.str();
}

// Stub implementations for other methods
bool ReportGenerator::generateJsonReport(const BacktestResult& result, const std::string& output_path) const {
    // Implementation would be similar to JSON storage format
    return true;
}

bool ReportGenerator::generateCsvReport(const BacktestResult& result, const std::string& output_path) const {
    // Implementation would be similar to CSV storage format
    return true;
}

bool ReportGenerator::generateComparisonReport(const BacktestComparison& comparison,
                                             const std::vector<BacktestResult>& results,
                                             const std::string& output_path,
                                             ReportFormat format) const {
    // Implementation for comparison reports
    return true;
}

// FrontendIntegration implementation
FrontendIntegration::FrontendIntegration() {
    Logger::getInstance().debug("FrontendIntegration initialized");
}

FrontendIntegration::~FrontendIntegration() = default;

std::string FrontendIntegration::generateEquityCurveJson(const BacktestResult& result) const {
    std::stringstream json;
    json << "{\n  \"data\": [\n";
    
    for (size_t i = 0; i < result.equity_curve.size(); ++i) {
        if (i > 0) json << ",\n";
        json << "    {\"x\": " << (result.start_timestamp + i * 86400) 
             << ", \"y\": " << result.equity_curve[i] << "}";
    }
    
    json << "\n  ]\n}";
    return json.str();
}

std::string FrontendIntegration::generateMetricsJson(const BacktestResult& result) const {
    std::stringstream json;
    json << "{\n";
    json << "  \"totalReturn\": " << result.statistics.total_return << ",\n";
    json << "  \"annualizedReturn\": " << result.statistics.annualized_return << ",\n";
    json << "  \"volatility\": " << result.statistics.volatility << ",\n";
    json << "  \"sharpeRatio\": " << result.statistics.sharpe_ratio << ",\n";
    json << "  \"sortinoRatio\": " << result.statistics.sortino_ratio << ",\n";
    json << "  \"maxDrawdown\": " << result.statistics.max_drawdown << ",\n";
    json << "  \"totalTrades\": " << result.statistics.total_trades << ",\n";
    json << "  \"winRate\": " << result.statistics.win_rate << ",\n";
    json << "  \"profitFactor\": " << result.statistics.profit_factor << "\n";
    json << "}";
    return json.str();
}

} // namespace tradeflow