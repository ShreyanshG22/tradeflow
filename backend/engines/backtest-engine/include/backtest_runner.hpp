#pragma once

#include "simulation_engine.hpp"
#include "data_loader.hpp"
#include <functional>
#include <vector>
#include <map>

namespace tradeflow {

struct BacktestConfig {
    std::string symbol;
    uint64_t start_timestamp;
    uint64_t end_timestamp;
    double initial_capital;
    SlippageModel slippage_model;
    TransactionCosts transaction_costs;
    LiquidityModel liquidity_model;
    
    BacktestConfig(const std::string& sym = "", uint64_t start_ts = 0, uint64_t end_ts = 0, double capital = 100000.0)
        : symbol(sym), start_timestamp(start_ts), end_timestamp(end_ts), initial_capital(capital) {}
};

struct BacktestMetrics {
    double total_return;
    double annualized_return;
    double volatility;
    double sharpe_ratio;
    double sortino_ratio;
    double max_drawdown;
    double calmar_ratio;
    uint32_t total_trades;
    uint32_t winning_trades;
    double win_rate;
    double avg_win;
    double avg_loss;
    double profit_factor;
    double total_commissions;
    double total_slippage;
    std::vector<double> equity_curve;
    std::vector<double> drawdown_curve;
    
    BacktestMetrics() : total_return(0.0), annualized_return(0.0), volatility(0.0),
                       sharpe_ratio(0.0), sortino_ratio(0.0), max_drawdown(0.0),
                       calmar_ratio(0.0), total_trades(0), winning_trades(0),
                       win_rate(0.0), avg_win(0.0), avg_loss(0.0), profit_factor(0.0),
                       total_commissions(0.0), total_slippage(0.0) {}
};

class BacktestRunner {
public:
    BacktestRunner();
    ~BacktestRunner();
    
    // Configuration
    void setConfig(const BacktestConfig& config);
    
    // Strategy interface
    void setStrategy(std::function<std::vector<Order>(const MarketData&, const std::vector<Fill>&)> strategy);
    
    // Execution
    BacktestMetrics runBacktest();
    BacktestMetrics runBacktest(const std::vector<MarketData>& historical_data);
    
    // Results
    const std::vector<Fill>& getTrades() const { return all_fills_; }
    const std::vector<double>& getEquityCurve() const { return equity_curve_; }
    
    // Tick-by-tick simulation
    void processNextTick(const MarketData& tick);
    double getCurrentPortfolioValue() const { return current_portfolio_value_; }
    
private:
    BacktestConfig config_;
    SimulationEngine simulation_engine_;
    DataLoader data_loader_;
    
    // Strategy function
    std::function<std::vector<Order>(const MarketData&, const std::vector<Fill>&)> strategy_function_;
    
    // Portfolio state
    double current_portfolio_value_;
    double cash_balance_;
    std::map<std::string, double> positions_; // symbol -> quantity
    
    // Results tracking
    std::vector<Fill> all_fills_;
    std::vector<double> equity_curve_;
    std::vector<double> returns_;
    
    // Helper methods
    void updatePortfolioValue(const MarketData& current_tick);
    BacktestMetrics calculateMetrics() const;
    double calculateDrawdown(const std::vector<double>& equity) const;
    double calculateSharpeRatio(const std::vector<double>& returns) const;
    double calculateSortinoRatio(const std::vector<double>& returns) const;
    void executeStrategy(const MarketData& tick);
};

} // namespace tradeflow