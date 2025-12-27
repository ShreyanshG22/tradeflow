#include "backtest_runner.hpp"
#include "simulation_engine.hpp"
#include "data_loader.hpp"
#include "simd_indicators.hpp"
#include "logger.hpp"
#include <algorithm>
#include <chrono>
#include <numeric>

namespace tradeflow {

BacktestRunner::BacktestRunner() 
    : current_portfolio_value_(100000.0), cash_balance_(100000.0) {
    
    Logger::getInstance().debug("BacktestRunner initialized");
}

BacktestRunner::~BacktestRunner() = default;

void BacktestRunner::setConfig(const BacktestConfig& config) {
    config_ = config;
    current_portfolio_value_ = config.initial_capital;
    cash_balance_ = config.initial_capital;
    
    // Configure simulation engine
    simulation_engine_.setSlippageModel(config.slippage_model);
    simulation_engine_.setTransactionCosts(config.transaction_costs);
    simulation_engine_.setLiquidityModel(config.liquidity_model);
    
    Logger::getInstance().info("Backtest configured for {} from {} to {}", 
                              config.symbol, config.start_timestamp, config.end_timestamp);
}

void BacktestRunner::setStrategy(std::function<std::vector<Order>(const MarketData&, const std::vector<Fill>&)> strategy) {
    strategy_function_ = strategy;
    Logger::getInstance().debug("Strategy function set");
}

BacktestMetrics BacktestRunner::runBacktest() {
    auto& logger = Logger::getInstance();
    logger.info("Starting backtest for {}", config_.symbol);
    
    // Load historical data
    bool data_loaded = data_loader_.loadHistoricalData(
        config_.symbol, "1d", config_.start_timestamp, config_.end_timestamp);
    
    if (!data_loaded) {
        logger.error("Failed to load historical data for {}", config_.symbol);
        return BacktestMetrics();
    }
    
    return runBacktest(data_loader_.getData());
}

BacktestMetrics BacktestRunner::runBacktest(const std::vector<MarketData>& historical_data) {
    auto& logger = Logger::getInstance();
    logger.info("Running backtest on {} data points", historical_data.size());
    
    // Reset state
    simulation_engine_.reset();
    all_fills_.clear();
    equity_curve_.clear();
    returns_.clear();
    positions_.clear();
    
    current_portfolio_value_ = config_.initial_capital;
    cash_balance_ = config_.initial_capital;
    
    auto start_time = std::chrono::high_resolution_clock::now();
    
    // Process each tick
    for (const auto& tick : historical_data) {
        processNextTick(tick);
    }
    
    auto end_time = std::chrono::high_resolution_clock::now();
    auto duration = std::chrono::duration_cast<std::chrono::milliseconds>(end_time - start_time);
    
    logger.info("Backtest completed in {} ms", duration.count());
    logger.info("Processed {} ticks, executed {} trades", 
               historical_data.size(), all_fills_.size());
    
    return calculateMetrics();
}

void BacktestRunner::processNextTick(const MarketData& tick) {
    // Update simulation engine with new market data
    simulation_engine_.processMarketData(tick);
    
    // Execute strategy if function is set
    if (strategy_function_) {
        executeStrategy(tick);
    }
    
    // Process any new fills
    auto new_fills = simulation_engine_.getFills();
    if (new_fills.size() > all_fills_.size()) {
        // Add new fills
        for (size_t i = all_fills_.size(); i < new_fills.size(); ++i) {
            const auto& fill = new_fills[i];
            all_fills_.push_back(fill);
            
            // Update positions and cash
            if (fill.side == OrderSide::BUY) {
                positions_[fill.symbol] += fill.quantity;
                cash_balance_ -= (fill.quantity * fill.price + fill.commission);
            } else {
                positions_[fill.symbol] -= fill.quantity;
                cash_balance_ += (fill.quantity * fill.price - fill.commission);
            }
        }
    }
    
    // Update portfolio value
    updatePortfolioValue(tick);
    
    // Record equity curve
    equity_curve_.push_back(current_portfolio_value_);
    
    // Calculate returns
    if (equity_curve_.size() > 1) {
        double prev_value = equity_curve_[equity_curve_.size() - 2];
        double return_pct = (current_portfolio_value_ - prev_value) / prev_value;
        returns_.push_back(return_pct);
    }
}

void BacktestRunner::updatePortfolioValue(const MarketData& current_tick) {
    double position_value = 0.0;
    
    // Calculate value of all positions at current market price
    for (const auto& position : positions_) {
        if (position.first == current_tick.symbol) {
            position_value += position.second * current_tick.close;
        }
        // For other symbols, we'd need their current prices
        // For simplicity, assuming single symbol backtests
    }
    
    current_portfolio_value_ = cash_balance_ + position_value;
}

void BacktestRunner::executeStrategy(const MarketData& tick) {
    try {
        // Get recent fills for strategy context
        auto recent_fills = simulation_engine_.getFills();
        
        // Call strategy function
        auto orders = strategy_function_(tick, recent_fills);
        
        // Submit orders to simulation engine
        for (const auto& order : orders) {
            simulation_engine_.submitOrder(order);
        }
        
    } catch (const std::exception& e) {
        Logger::getInstance().error("Strategy execution error: {}", e.what());
    }
}

BacktestMetrics BacktestRunner::calculateMetrics() const {
    BacktestMetrics metrics;
    
    if (equity_curve_.empty()) {
        return metrics;
    }
    
    // Basic metrics
    double initial_value = config_.initial_capital;
    double final_value = equity_curve_.back();
    
    metrics.total_return = (final_value - initial_value) / initial_value;
    
    // Annualized return (assuming daily data)
    double days = static_cast<double>(equity_curve_.size());
    double years = days / 252.0; // Trading days per year
    if (years > 0) {
        metrics.annualized_return = std::pow(1.0 + metrics.total_return, 1.0 / years) - 1.0;
    }
    
    // Volatility (annualized)
    if (!returns_.empty()) {
        double mean_return = std::accumulate(returns_.begin(), returns_.end(), 0.0) / returns_.size();
        double variance = 0.0;
        for (double ret : returns_) {
            variance += (ret - mean_return) * (ret - mean_return);
        }
        variance /= returns_.size();
        metrics.volatility = std::sqrt(variance * 252.0); // Annualized
    }
    
    // Risk-adjusted metrics
    metrics.sharpe_ratio = calculateSharpeRatio(returns_);
    metrics.sortino_ratio = calculateSortinoRatio(returns_);
    
    // Drawdown analysis
    metrics.max_drawdown = calculateDrawdown(equity_curve_);
    
    // Calmar ratio
    if (metrics.max_drawdown > 0) {
        metrics.calmar_ratio = metrics.annualized_return / metrics.max_drawdown;
    }
    
    // Trade statistics
    metrics.total_trades = all_fills_.size();
    
    // Calculate winning trades
    std::map<std::string, std::vector<Fill>> trades_by_symbol;
    for (const auto& fill : all_fills_) {
        trades_by_symbol[fill.symbol].push_back(fill);
    }
    
    double total_pnl = 0.0;
    double total_wins = 0.0;
    double total_losses = 0.0;
    uint32_t win_count = 0;
    uint32_t loss_count = 0;
    
    // Simplified P&L calculation (assumes pairs of buy/sell)
    for (const auto& symbol_trades : trades_by_symbol) {
        double position = 0.0;
        double cost_basis = 0.0;
        
        for (const auto& fill : symbol_trades.second) {
            if (fill.side == OrderSide::BUY) {
                cost_basis += fill.quantity * fill.price;
                position += fill.quantity;
            } else {
                if (position > 0) {
                    double avg_cost = cost_basis / position;
                    double pnl = fill.quantity * (fill.price - avg_cost);
                    total_pnl += pnl;
                    
                    if (pnl > 0) {
                        total_wins += pnl;
                        win_count++;
                    } else {
                        total_losses += std::abs(pnl);
                        loss_count++;
                    }
                    
                    position -= fill.quantity;
                    cost_basis -= fill.quantity * avg_cost;
                }
            }
        }
    }
    
    metrics.winning_trades = win_count;
    metrics.win_rate = (metrics.total_trades > 0) ? 
        static_cast<double>(win_count) / metrics.total_trades : 0.0;
    
    metrics.avg_win = (win_count > 0) ? total_wins / win_count : 0.0;
    metrics.avg_loss = (loss_count > 0) ? total_losses / loss_count : 0.0;
    
    metrics.profit_factor = (total_losses > 0) ? total_wins / total_losses : 0.0;
    
    // Costs
    metrics.total_commissions = simulation_engine_.getTotalCommissions();
    metrics.total_slippage = simulation_engine_.getTotalSlippage();
    
    // Copy curves
    metrics.equity_curve = equity_curve_;
    
    return metrics;
}

double BacktestRunner::calculateDrawdown(const std::vector<double>& equity) const {
    if (equity.empty()) return 0.0;
    
    double max_drawdown = 0.0;
    double peak = equity[0];
    
    for (double value : equity) {
        if (value > peak) {
            peak = value;
        }
        
        double drawdown = (peak - value) / peak;
        max_drawdown = std::max(max_drawdown, drawdown);
    }
    
    return max_drawdown;
}

double BacktestRunner::calculateSharpeRatio(const std::vector<double>& returns) const {
    if (returns.empty()) return 0.0;
    
    double mean_return = std::accumulate(returns.begin(), returns.end(), 0.0) / returns.size();
    
    double variance = 0.0;
    for (double ret : returns) {
        variance += (ret - mean_return) * (ret - mean_return);
    }
    variance /= returns.size();
    
    double std_dev = std::sqrt(variance);
    
    if (std_dev == 0.0) return 0.0;
    
    // Annualized Sharpe ratio (assuming risk-free rate of 0)
    return (mean_return * std::sqrt(252.0)) / (std_dev * std::sqrt(252.0));
}

double BacktestRunner::calculateSortinoRatio(const std::vector<double>& returns) const {
    if (returns.empty()) return 0.0;
    
    double mean_return = std::accumulate(returns.begin(), returns.end(), 0.0) / returns.size();
    
    // Calculate downside deviation (only negative returns)
    double downside_variance = 0.0;
    int negative_count = 0;
    
    for (double ret : returns) {
        if (ret < 0) {
            downside_variance += ret * ret;
            negative_count++;
        }
    }
    
    if (negative_count == 0) return 0.0;
    
    downside_variance /= negative_count;
    double downside_deviation = std::sqrt(downside_variance);
    
    if (downside_deviation == 0.0) return 0.0;
    
    // Annualized Sortino ratio
    return (mean_return * std::sqrt(252.0)) / (downside_deviation * std::sqrt(252.0));
}

} // namespace tradeflow