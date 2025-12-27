#pragma once

#include "simulation_engine.hpp"
#include <vector>
#include <map>
#include <random>

namespace tradeflow {

struct DrawdownAnalysis {
    double max_drawdown;
    double avg_drawdown;
    int max_duration;
    std::vector<double> drawdown_curve;
    
    DrawdownAnalysis() : max_drawdown(0.0), avg_drawdown(0.0), max_duration(0) {}
};

struct TradeStatistics {
    uint32_t total_trades;
    uint32_t winning_trades;
    uint32_t losing_trades;
    double win_rate;
    double avg_win;
    double avg_loss;
    double largest_win;
    double largest_loss;
    double profit_factor;
    double expectancy;
    
    TradeStatistics() : total_trades(0), winning_trades(0), losing_trades(0),
                       win_rate(0.0), avg_win(0.0), avg_loss(0.0),
                       largest_win(0.0), largest_loss(0.0), profit_factor(0.0),
                       expectancy(0.0) {}
};

struct TradingStatistics {
    // Return metrics
    double total_return;
    double annualized_return;
    double volatility;
    
    // Risk-adjusted metrics
    double sharpe_ratio;
    double sortino_ratio;
    double calmar_ratio;
    
    // Drawdown metrics
    double max_drawdown;
    double avg_drawdown;
    int max_drawdown_duration;
    std::vector<double> drawdown_curve;
    
    // Trade metrics
    uint32_t total_trades;
    uint32_t winning_trades;
    uint32_t losing_trades;
    double win_rate;
    double avg_win;
    double avg_loss;
    double largest_win;
    double largest_loss;
    double profit_factor;
    double expectancy;
    
    // Risk metrics
    double var_95;          // Value at Risk (95% confidence)
    double cvar_95;         // Conditional Value at Risk (95% confidence)
    double skewness;        // Return distribution skewness
    double kurtosis;        // Return distribution kurtosis
    
    // Consistency metrics
    double monthly_win_rate;
    double best_month;
    double worst_month;
    
    TradingStatistics() : total_return(0.0), annualized_return(0.0), volatility(0.0),
                         sharpe_ratio(0.0), sortino_ratio(0.0), calmar_ratio(0.0),
                         max_drawdown(0.0), avg_drawdown(0.0), max_drawdown_duration(0),
                         total_trades(0), winning_trades(0), losing_trades(0),
                         win_rate(0.0), avg_win(0.0), avg_loss(0.0),
                         largest_win(0.0), largest_loss(0.0), profit_factor(0.0),
                         expectancy(0.0), var_95(0.0), cvar_95(0.0),
                         skewness(0.0), kurtosis(0.0), monthly_win_rate(0.0),
                         best_month(0.0), worst_month(0.0) {}
};

struct MonteCarloResults {
    double mean_final_value;
    double median_final_value;
    double percentile_5;
    double percentile_25;
    double percentile_75;
    double percentile_95;
    double probability_of_loss;
    double probability_of_severe_drawdown;
    
    MonteCarloResults() : mean_final_value(0.0), median_final_value(0.0),
                         percentile_5(0.0), percentile_25(0.0),
                         percentile_75(0.0), percentile_95(0.0),
                         probability_of_loss(0.0), probability_of_severe_drawdown(0.0) {}
};

class PerformanceCalculator {
public:
    PerformanceCalculator();
    ~PerformanceCalculator();
    
    // Configuration
    void setRiskFreeRate(double rate);
    
    // Comprehensive performance analysis
    TradingStatistics calculateTradingStatistics(const std::vector<Fill>& fills,
                                               const std::vector<double>& equity_curve,
                                               double initial_capital) const;
    
    // Monte Carlo simulation for strategy robustness
    std::vector<double> runMonteCarloSimulation(const std::vector<double>& historical_returns,
                                              size_t num_simulations = 10000,
                                              size_t simulation_length = 252,
                                              double initial_capital = 100000.0) const;
    
    MonteCarloResults analyzeMonteCarloResults(const std::vector<double>& simulation_results,
                                             double initial_capital) const;
    
    // Individual metric calculations
    double calculateSharpeRatio(const std::vector<double>& returns) const;
    double calculateSortinoRatio(const std::vector<double>& returns) const;
    double calculateCalmarRatio(double annualized_return, const std::vector<double>& equity_curve) const;
    
    // Risk analysis
    DrawdownAnalysis calculateDrawdownAnalysis(const std::vector<double>& equity_curve) const;
    TradeStatistics calculateTradeStatistics(const std::vector<Fill>& fills) const;
    
    // Statistical measures
    double calculateVolatility(const std::vector<double>& returns) const;
    double calculateVaR(const std::vector<double>& returns, double confidence_level = 0.95) const;
    double calculateCVaR(const std::vector<double>& returns, double confidence_level = 0.95) const;
    double calculateSkewness(const std::vector<double>& returns) const;
    double calculateKurtosis(const std::vector<double>& returns) const;
    
    // Utility functions
    std::vector<double> calculateReturns(const std::vector<double>& equity_curve) const;
    
private:
    double risk_free_rate_;
    
    // Random number generation for Monte Carlo
    mutable std::mt19937 rng_;
    mutable std::normal_distribution<double> normal_dist_;
    
    // Helper methods
    double calculateMonthlyWinRate(const std::vector<double>& equity_curve) const;
    double calculateBestMonth(const std::vector<double>& equity_curve) const;
    double calculateWorstMonth(const std::vector<double>& equity_curve) const;
};

} // namespace tradeflow