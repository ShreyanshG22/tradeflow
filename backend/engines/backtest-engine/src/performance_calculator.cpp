#include "performance_calculator.hpp"
#include "logger.hpp"
#include <algorithm>
#include <cmath>
#include <numeric>
#include <random>

namespace tradeflow {

PerformanceCalculator::PerformanceCalculator() 
    : risk_free_rate_(0.02), // 2% annual risk-free rate
      rng_(std::random_device{}()), 
      normal_dist_(0.0, 1.0) {
    
    Logger::getInstance().debug("PerformanceCalculator initialized");
}

PerformanceCalculator::~PerformanceCalculator() = default;

void PerformanceCalculator::setRiskFreeRate(double rate) {
    risk_free_rate_ = rate;
    Logger::getInstance().debug("Risk-free rate set to {:.4f}", rate);
}

TradingStatistics PerformanceCalculator::calculateTradingStatistics(
    const std::vector<Fill>& fills,
    const std::vector<double>& equity_curve,
    double initial_capital) const {
    
    TradingStatistics stats;
    
    if (fills.empty() || equity_curve.empty()) {
        return stats;
    }
    
    // Basic metrics
    double final_value = equity_curve.back();
    stats.total_return = (final_value - initial_capital) / initial_capital;
    
    // Calculate returns series
    std::vector<double> returns = calculateReturns(equity_curve);
    
    // Time-based metrics
    double periods = static_cast<double>(equity_curve.size());
    double years = periods / 252.0; // Assuming daily data
    
    if (years > 0) {
        stats.annualized_return = std::pow(1.0 + stats.total_return, 1.0 / years) - 1.0;
    }
    
    // Volatility (annualized)
    stats.volatility = calculateVolatility(returns);
    
    // Risk-adjusted returns
    stats.sharpe_ratio = calculateSharpeRatio(returns);
    stats.sortino_ratio = calculateSortinoRatio(returns);
    stats.calmar_ratio = calculateCalmarRatio(stats.annualized_return, equity_curve);
    
    // Drawdown analysis
    auto drawdown_info = calculateDrawdownAnalysis(equity_curve);
    stats.max_drawdown = drawdown_info.max_drawdown;
    stats.avg_drawdown = drawdown_info.avg_drawdown;
    stats.max_drawdown_duration = drawdown_info.max_duration;
    stats.drawdown_curve = drawdown_info.drawdown_curve;
    
    // Trade-level statistics
    auto trade_stats = calculateTradeStatistics(fills);
    stats.total_trades = trade_stats.total_trades;
    stats.winning_trades = trade_stats.winning_trades;
    stats.losing_trades = trade_stats.losing_trades;
    stats.win_rate = trade_stats.win_rate;
    stats.avg_win = trade_stats.avg_win;
    stats.avg_loss = trade_stats.avg_loss;
    stats.largest_win = trade_stats.largest_win;
    stats.largest_loss = trade_stats.largest_loss;
    stats.profit_factor = trade_stats.profit_factor;
    stats.expectancy = trade_stats.expectancy;
    
    // Additional risk metrics
    stats.var_95 = calculateVaR(returns, 0.95);
    stats.cvar_95 = calculateCVaR(returns, 0.95);
    stats.skewness = calculateSkewness(returns);
    stats.kurtosis = calculateKurtosis(returns);
    
    // Consistency metrics
    stats.monthly_win_rate = calculateMonthlyWinRate(equity_curve);
    stats.best_month = calculateBestMonth(equity_curve);
    stats.worst_month = calculateWorstMonth(equity_curve);
    
    Logger::getInstance().debug("Calculated comprehensive trading statistics");
    
    return stats;
}

std::vector<double> PerformanceCalculator::runMonteCarloSimulation(
    const std::vector<double>& historical_returns,
    size_t num_simulations,
    size_t simulation_length,
    double initial_capital) const {
    
    auto& logger = Logger::getInstance();
    logger.info("Running Monte Carlo simulation: {} simulations of {} periods", 
               num_simulations, simulation_length);
    
    std::vector<double> final_values;
    final_values.reserve(num_simulations);
    
    if (historical_returns.empty()) {
        logger.warn("No historical returns provided for Monte Carlo simulation");
        return final_values;
    }
    
    // Calculate statistics of historical returns
    double mean_return = std::accumulate(historical_returns.begin(), historical_returns.end(), 0.0) 
                        / historical_returns.size();
    
    double variance = 0.0;
    for (double ret : historical_returns) {
        variance += (ret - mean_return) * (ret - mean_return);
    }
    variance /= historical_returns.size();
    double std_dev = std::sqrt(variance);
    
    // Run simulations
    std::normal_distribution<double> return_dist(mean_return, std_dev);
    
    for (size_t sim = 0; sim < num_simulations; ++sim) {
        double portfolio_value = initial_capital;
        
        for (size_t period = 0; period < simulation_length; ++period) {
            double random_return = return_dist(rng_);
            portfolio_value *= (1.0 + random_return);
        }
        
        final_values.push_back(portfolio_value);
    }
    
    // Sort for percentile calculations
    std::sort(final_values.begin(), final_values.end());
    
    logger.info("Monte Carlo simulation completed");
    
    return final_values;
}

MonteCarloResults PerformanceCalculator::analyzeMonteCarloResults(
    const std::vector<double>& simulation_results,
    double initial_capital) const {
    
    MonteCarloResults results;
    
    if (simulation_results.empty()) {
        return results;
    }
    
    // Basic statistics
    results.mean_final_value = std::accumulate(simulation_results.begin(), 
                                              simulation_results.end(), 0.0) / simulation_results.size();
    
    results.median_final_value = simulation_results[simulation_results.size() / 2];
    
    // Percentiles
    results.percentile_5 = simulation_results[static_cast<size_t>(simulation_results.size() * 0.05)];
    results.percentile_25 = simulation_results[static_cast<size_t>(simulation_results.size() * 0.25)];
    results.percentile_75 = simulation_results[static_cast<size_t>(simulation_results.size() * 0.75)];
    results.percentile_95 = simulation_results[static_cast<size_t>(simulation_results.size() * 0.95)];
    
    // Risk metrics
    size_t loss_count = 0;
    for (double value : simulation_results) {
        if (value < initial_capital) {
            loss_count++;
        }
    }
    
    results.probability_of_loss = static_cast<double>(loss_count) / simulation_results.size();
    
    // Maximum drawdown probability
    size_t severe_drawdown_count = 0;
    for (double value : simulation_results) {
        double drawdown = (initial_capital - value) / initial_capital;
        if (drawdown > 0.2) { // 20% drawdown threshold
            severe_drawdown_count++;
        }
    }
    
    results.probability_of_severe_drawdown = static_cast<double>(severe_drawdown_count) / simulation_results.size();
    
    return results;
}

double PerformanceCalculator::calculateSharpeRatio(const std::vector<double>& returns) const {
    if (returns.empty()) return 0.0;
    
    double mean_return = std::accumulate(returns.begin(), returns.end(), 0.0) / returns.size();
    double excess_return = mean_return - (risk_free_rate_ / 252.0); // Daily risk-free rate
    
    double variance = 0.0;
    for (double ret : returns) {
        variance += (ret - mean_return) * (ret - mean_return);
    }
    variance /= returns.size();
    double std_dev = std::sqrt(variance);
    
    if (std_dev == 0.0) return 0.0;
    
    // Annualized Sharpe ratio
    return (excess_return * std::sqrt(252.0)) / (std_dev * std::sqrt(252.0));
}

double PerformanceCalculator::calculateSortinoRatio(const std::vector<double>& returns) const {
    if (returns.empty()) return 0.0;
    
    double mean_return = std::accumulate(returns.begin(), returns.end(), 0.0) / returns.size();
    double excess_return = mean_return - (risk_free_rate_ / 252.0);
    
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
    return (excess_return * std::sqrt(252.0)) / (downside_deviation * std::sqrt(252.0));
}

double PerformanceCalculator::calculateCalmarRatio(double annualized_return, 
                                                  const std::vector<double>& equity_curve) const {
    auto drawdown_info = calculateDrawdownAnalysis(equity_curve);
    
    if (drawdown_info.max_drawdown == 0.0) return 0.0;
    
    return annualized_return / drawdown_info.max_drawdown;
}

DrawdownAnalysis PerformanceCalculator::calculateDrawdownAnalysis(const std::vector<double>& equity_curve) const {
    DrawdownAnalysis analysis;
    
    if (equity_curve.empty()) return analysis;
    
    analysis.drawdown_curve.resize(equity_curve.size());
    
    double peak = equity_curve[0];
    double max_drawdown = 0.0;
    double total_drawdown = 0.0;
    int drawdown_periods = 0;
    int current_drawdown_duration = 0;
    int max_drawdown_duration = 0;
    
    for (size_t i = 0; i < equity_curve.size(); ++i) {
        double value = equity_curve[i];
        
        if (value > peak) {
            peak = value;
            if (current_drawdown_duration > 0) {
                max_drawdown_duration = std::max(max_drawdown_duration, current_drawdown_duration);
                current_drawdown_duration = 0;
            }
        }
        
        double drawdown = (peak - value) / peak;
        analysis.drawdown_curve[i] = drawdown;
        
        if (drawdown > 0) {
            total_drawdown += drawdown;
            drawdown_periods++;
            current_drawdown_duration++;
        }
        
        max_drawdown = std::max(max_drawdown, drawdown);
    }
    
    analysis.max_drawdown = max_drawdown;
    analysis.avg_drawdown = (drawdown_periods > 0) ? total_drawdown / drawdown_periods : 0.0;
    analysis.max_duration = std::max(max_drawdown_duration, current_drawdown_duration);
    
    return analysis;
}

TradeStatistics PerformanceCalculator::calculateTradeStatistics(const std::vector<Fill>& fills) const {
    TradeStatistics stats;
    
    if (fills.empty()) return stats;
    
    // Group fills by symbol to calculate trade P&L
    std::map<std::string, std::vector<Fill>> fills_by_symbol;
    for (const auto& fill : fills) {
        fills_by_symbol[fill.symbol].push_back(fill);
    }
    
    std::vector<double> trade_pnls;
    double total_commissions = 0.0;
    
    // Calculate P&L for each symbol
    for (const auto& symbol_fills : fills_by_symbol) {
        const auto& symbol_fill_list = symbol_fills.second;
        
        double position = 0.0;
        double cost_basis = 0.0;
        
        for (const auto& fill : symbol_fill_list) {
            total_commissions += fill.commission;
            
            if (fill.side == OrderSide::BUY) {
                cost_basis += fill.quantity * fill.price;
                position += fill.quantity;
            } else {
                if (position > 0) {
                    double avg_cost = cost_basis / position;
                    double trade_pnl = fill.quantity * (fill.price - avg_cost) - fill.commission;
                    trade_pnls.push_back(trade_pnl);
                    
                    position -= fill.quantity;
                    cost_basis -= fill.quantity * avg_cost;
                }
            }
        }
    }
    
    stats.total_trades = trade_pnls.size();
    
    if (stats.total_trades == 0) return stats;
    
    // Separate winning and losing trades
    std::vector<double> winning_trades;
    std::vector<double> losing_trades;
    
    for (double pnl : trade_pnls) {
        if (pnl > 0) {
            winning_trades.push_back(pnl);
        } else {
            losing_trades.push_back(pnl);
        }
    }
    
    stats.winning_trades = winning_trades.size();
    stats.losing_trades = losing_trades.size();
    stats.win_rate = static_cast<double>(stats.winning_trades) / stats.total_trades;
    
    // Calculate averages
    if (!winning_trades.empty()) {
        stats.avg_win = std::accumulate(winning_trades.begin(), winning_trades.end(), 0.0) / winning_trades.size();
        stats.largest_win = *std::max_element(winning_trades.begin(), winning_trades.end());
    }
    
    if (!losing_trades.empty()) {
        stats.avg_loss = std::accumulate(losing_trades.begin(), losing_trades.end(), 0.0) / losing_trades.size();
        stats.largest_loss = *std::min_element(losing_trades.begin(), losing_trades.end());
    }
    
    // Profit factor
    double gross_profit = std::accumulate(winning_trades.begin(), winning_trades.end(), 0.0);
    double gross_loss = std::abs(std::accumulate(losing_trades.begin(), losing_trades.end(), 0.0));
    
    stats.profit_factor = (gross_loss > 0) ? gross_profit / gross_loss : 0.0;
    
    // Expectancy
    stats.expectancy = stats.win_rate * stats.avg_win + (1.0 - stats.win_rate) * stats.avg_loss;
    
    return stats;
}

double PerformanceCalculator::calculateVolatility(const std::vector<double>& returns) const {
    if (returns.empty()) return 0.0;
    
    double mean = std::accumulate(returns.begin(), returns.end(), 0.0) / returns.size();
    
    double variance = 0.0;
    for (double ret : returns) {
        variance += (ret - mean) * (ret - mean);
    }
    variance /= returns.size();
    
    // Annualized volatility
    return std::sqrt(variance * 252.0);
}

double PerformanceCalculator::calculateVaR(const std::vector<double>& returns, double confidence_level) const {
    if (returns.empty()) return 0.0;
    
    std::vector<double> sorted_returns = returns;
    std::sort(sorted_returns.begin(), sorted_returns.end());
    
    size_t index = static_cast<size_t>((1.0 - confidence_level) * sorted_returns.size());
    return -sorted_returns[index]; // VaR is typically reported as a positive number
}

double PerformanceCalculator::calculateCVaR(const std::vector<double>& returns, double confidence_level) const {
    if (returns.empty()) return 0.0;
    
    std::vector<double> sorted_returns = returns;
    std::sort(sorted_returns.begin(), sorted_returns.end());
    
    size_t cutoff_index = static_cast<size_t>((1.0 - confidence_level) * sorted_returns.size());
    
    double sum = 0.0;
    for (size_t i = 0; i < cutoff_index; ++i) {
        sum += sorted_returns[i];
    }
    
    return (cutoff_index > 0) ? -sum / cutoff_index : 0.0;
}

double PerformanceCalculator::calculateSkewness(const std::vector<double>& returns) const {
    if (returns.size() < 3) return 0.0;
    
    double mean = std::accumulate(returns.begin(), returns.end(), 0.0) / returns.size();
    
    double variance = 0.0;
    double skewness_sum = 0.0;
    
    for (double ret : returns) {
        double diff = ret - mean;
        variance += diff * diff;
        skewness_sum += diff * diff * diff;
    }
    
    variance /= returns.size();
    double std_dev = std::sqrt(variance);
    
    if (std_dev == 0.0) return 0.0;
    
    skewness_sum /= returns.size();
    return skewness_sum / (std_dev * std_dev * std_dev);
}

double PerformanceCalculator::calculateKurtosis(const std::vector<double>& returns) const {
    if (returns.size() < 4) return 0.0;
    
    double mean = std::accumulate(returns.begin(), returns.end(), 0.0) / returns.size();
    
    double variance = 0.0;
    double kurtosis_sum = 0.0;
    
    for (double ret : returns) {
        double diff = ret - mean;
        variance += diff * diff;
        kurtosis_sum += diff * diff * diff * diff;
    }
    
    variance /= returns.size();
    double std_dev = std::sqrt(variance);
    
    if (std_dev == 0.0) return 0.0;
    
    kurtosis_sum /= returns.size();
    return (kurtosis_sum / (variance * variance)) - 3.0; // Excess kurtosis
}

std::vector<double> PerformanceCalculator::calculateReturns(const std::vector<double>& equity_curve) const {
    std::vector<double> returns;
    
    if (equity_curve.size() < 2) return returns;
    
    returns.reserve(equity_curve.size() - 1);
    
    for (size_t i = 1; i < equity_curve.size(); ++i) {
        double ret = (equity_curve[i] - equity_curve[i-1]) / equity_curve[i-1];
        returns.push_back(ret);
    }
    
    return returns;
}

double PerformanceCalculator::calculateMonthlyWinRate(const std::vector<double>& equity_curve) const {
    if (equity_curve.size() < 21) return 0.0; // Need at least ~1 month of daily data
    
    // Simplified: assume 21 trading days per month
    size_t months = equity_curve.size() / 21;
    if (months == 0) return 0.0;
    
    size_t winning_months = 0;
    
    for (size_t month = 0; month < months; ++month) {
        size_t start_idx = month * 21;
        size_t end_idx = std::min((month + 1) * 21, equity_curve.size());
        
        if (end_idx > start_idx) {
            double month_return = (equity_curve[end_idx - 1] - equity_curve[start_idx]) / equity_curve[start_idx];
            if (month_return > 0) {
                winning_months++;
            }
        }
    }
    
    return static_cast<double>(winning_months) / months;
}

double PerformanceCalculator::calculateBestMonth(const std::vector<double>& equity_curve) const {
    if (equity_curve.size() < 21) return 0.0;
    
    size_t months = equity_curve.size() / 21;
    double best_month = -1.0;
    
    for (size_t month = 0; month < months; ++month) {
        size_t start_idx = month * 21;
        size_t end_idx = std::min((month + 1) * 21, equity_curve.size());
        
        if (end_idx > start_idx) {
            double month_return = (equity_curve[end_idx - 1] - equity_curve[start_idx]) / equity_curve[start_idx];
            best_month = std::max(best_month, month_return);
        }
    }
    
    return best_month;
}

double PerformanceCalculator::calculateWorstMonth(const std::vector<double>& equity_curve) const {
    if (equity_curve.size() < 21) return 0.0;
    
    size_t months = equity_curve.size() / 21;
    double worst_month = 1.0;
    
    for (size_t month = 0; month < months; ++month) {
        size_t start_idx = month * 21;
        size_t end_idx = std::min((month + 1) * 21, equity_curve.size());
        
        if (end_idx > start_idx) {
            double month_return = (equity_curve[end_idx - 1] - equity_curve[start_idx]) / equity_curve[start_idx];
            worst_month = std::min(worst_month, month_return);
        }
    }
    
    return worst_month;
}

} // namespace tradeflow