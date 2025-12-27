#pragma once

#include "performance_calculator.hpp"
#include "simulation_engine.hpp"
#include <string>
#include <vector>
#include <map>
#include <fstream>
#include <memory>

namespace tradeflow {

struct BacktestResult {
    std::string backtest_id;
    std::string strategy_name;
    std::string symbol;
    uint64_t start_timestamp;
    uint64_t end_timestamp;
    double initial_capital;
    
    // Performance metrics
    TradingStatistics statistics;
    
    // Trade data
    std::vector<Fill> trades;
    std::vector<double> equity_curve;
    std::vector<double> drawdown_curve;
    
    // Monte Carlo results (optional)
    MonteCarloResults monte_carlo;
    bool has_monte_carlo;
    
    // Metadata
    uint64_t created_timestamp;
    std::string notes;
    
    BacktestResult() : initial_capital(100000.0), has_monte_carlo(false), created_timestamp(0) {}
};

struct BacktestComparison {
    std::vector<std::string> backtest_ids;
    std::vector<std::string> strategy_names;
    
    // Comparative metrics
    std::map<std::string, double> returns;
    std::map<std::string, double> sharpe_ratios;
    std::map<std::string, double> max_drawdowns;
    std::map<std::string, double> win_rates;
    std::map<std::string, uint32_t> total_trades;
    
    // Rankings
    std::vector<std::pair<std::string, double>> return_ranking;
    std::vector<std::pair<std::string, double>> sharpe_ranking;
    std::vector<std::pair<std::string, double>> drawdown_ranking;
    
    BacktestComparison() = default;
};

enum class StorageFormat {
    BINARY,     // Fast, compact binary format
    JSON,       // Human-readable JSON format
    CSV,        // CSV format for spreadsheet analysis
    HDF5        // High-performance scientific data format
};

enum class ReportFormat {
    HTML,       // Rich HTML report with charts
    PDF,        // PDF report for sharing
    JSON,       // JSON for API consumption
    CSV,        // CSV for data analysis
    MARKDOWN    // Markdown for documentation
};

class ResultStorage {
public:
    ResultStorage(const std::string& storage_directory = "backtest_results");
    ~ResultStorage();
    
    // Storage operations
    bool storeResult(const BacktestResult& result, StorageFormat format = StorageFormat::BINARY);
    bool loadResult(const std::string& backtest_id, BacktestResult& result);
    bool deleteResult(const std::string& backtest_id);
    
    // Query operations
    std::vector<std::string> listResults() const;
    std::vector<BacktestResult> findResultsByStrategy(const std::string& strategy_name) const;
    std::vector<BacktestResult> findResultsBySymbol(const std::string& symbol) const;
    std::vector<BacktestResult> findResultsByDateRange(uint64_t start_ts, uint64_t end_ts) const;
    
    // Comparison and analysis
    BacktestComparison compareResults(const std::vector<std::string>& backtest_ids) const;
    std::vector<BacktestResult> getBestPerformers(size_t count = 10, 
                                                 const std::string& metric = "sharpe_ratio") const;
    
    // Bulk operations
    bool exportResults(const std::vector<std::string>& backtest_ids, 
                      const std::string& export_path, 
                      StorageFormat format = StorageFormat::CSV) const;
    
    // Cleanup
    void cleanupOldResults(uint64_t older_than_timestamp);
    size_t getStorageSize() const;
    
private:
    std::string storage_directory_;
    
    // Helper methods
    std::string generateBacktestId() const;
    std::string getResultPath(const std::string& backtest_id, StorageFormat format) const;
    bool saveBinaryFormat(const BacktestResult& result, const std::string& filepath) const;
    bool loadBinaryFormat(const std::string& filepath, BacktestResult& result) const;
    bool saveJsonFormat(const BacktestResult& result, const std::string& filepath) const;
    bool loadJsonFormat(const std::string& filepath, BacktestResult& result) const;
    bool saveCsvFormat(const BacktestResult& result, const std::string& filepath) const;
};

class ReportGenerator {
public:
    ReportGenerator();
    ~ReportGenerator();
    
    // Single result reports
    bool generateReport(const BacktestResult& result, 
                       const std::string& output_path,
                       ReportFormat format = ReportFormat::HTML) const;
    
    // Comparison reports
    bool generateComparisonReport(const BacktestComparison& comparison,
                                 const std::vector<BacktestResult>& results,
                                 const std::string& output_path,
                                 ReportFormat format = ReportFormat::HTML) const;
    
    // Portfolio analysis report
    bool generatePortfolioReport(const std::vector<BacktestResult>& results,
                               const std::string& output_path,
                               ReportFormat format = ReportFormat::HTML) const;
    
    // Custom report templates
    void setTemplate(ReportFormat format, const std::string& template_path);
    
private:
    std::map<ReportFormat, std::string> templates_;
    
    // Report generation methods
    bool generateHtmlReport(const BacktestResult& result, const std::string& output_path) const;
    bool generateJsonReport(const BacktestResult& result, const std::string& output_path) const;
    bool generateCsvReport(const BacktestResult& result, const std::string& output_path) const;
    bool generateMarkdownReport(const BacktestResult& result, const std::string& output_path) const;
    
    // Comparison report methods
    bool generateHtmlComparison(const BacktestComparison& comparison,
                               const std::vector<BacktestResult>& results,
                               const std::string& output_path) const;
    
    // Utility methods
    std::string formatNumber(double value, int precision = 2) const;
    std::string formatPercentage(double value, int precision = 2) const;
    std::string formatCurrency(double value, int precision = 2) const;
    std::string formatTimestamp(uint64_t timestamp) const;
    std::string generateChartData(const std::vector<double>& data) const;
};

// Frontend integration structures
struct FrontendVisualizationData {
    // Equity curve data
    std::vector<std::pair<uint64_t, double>> equity_points;
    std::vector<std::pair<uint64_t, double>> drawdown_points;
    
    // Trade markers
    std::vector<std::pair<uint64_t, double>> buy_markers;
    std::vector<std::pair<uint64_t, double>> sell_markers;
    
    // Performance summary
    std::map<std::string, double> key_metrics;
    
    // Monthly returns heatmap
    std::vector<std::vector<double>> monthly_returns;
    std::vector<std::string> month_labels;
    std::vector<std::string> year_labels;
    
    FrontendVisualizationData() = default;
};

class FrontendIntegration {
public:
    FrontendIntegration();
    ~FrontendIntegration();
    
    // Convert backtest results to frontend-friendly format
    FrontendVisualizationData convertForVisualization(const BacktestResult& result) const;
    
    // Generate JSON for React components
    std::string generateEquityCurveJson(const BacktestResult& result) const;
    std::string generateTradeListJson(const BacktestResult& result) const;
    std::string generateMetricsJson(const BacktestResult& result) const;
    std::string generateDrawdownChartJson(const BacktestResult& result) const;
    std::string generateMonthlyReturnsJson(const BacktestResult& result) const;
    
    // Comparison data for frontend
    std::string generateComparisonJson(const BacktestComparison& comparison,
                                     const std::vector<BacktestResult>& results) const;
    
private:
    // Helper methods for JSON generation
    std::string vectorToJson(const std::vector<double>& data) const;
    std::string timestampVectorToJson(const std::vector<std::pair<uint64_t, double>>& data) const;
    std::string metricsMapToJson(const std::map<std::string, double>& metrics) const;
    
    // Data processing
    std::vector<std::vector<double>> calculateMonthlyReturns(const std::vector<double>& equity_curve,
                                                           uint64_t start_timestamp) const;
};

} // namespace tradeflow