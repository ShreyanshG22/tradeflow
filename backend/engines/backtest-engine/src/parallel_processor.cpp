#include "parallel_processor.hpp"
#include "simd_indicators.hpp"
#include "logger.hpp"
#include <algorithm>
#include <random>
#include <numeric>

namespace tradeflow {

// ThreadPool implementation
ThreadPool::ThreadPool(size_t num_threads) : stop_(false) {
    for (size_t i = 0; i < num_threads; ++i) {
        workers_.emplace_back([this] {
            for (;;) {
                std::function<void()> task;
                
                {
                    std::unique_lock<std::mutex> lock(queue_mutex_);
                    condition_.wait(lock, [this] { return stop_ || !tasks_.empty(); });
                    
                    if (stop_ && tasks_.empty()) {
                        return;
                    }
                    
                    task = std::move(tasks_.front());
                    tasks_.pop();
                }
                
                task();
            }
        });
    }
}

ThreadPool::~ThreadPool() {
    shutdown();
}

void ThreadPool::shutdown() {
    {
        std::unique_lock<std::mutex> lock(queue_mutex_);
        stop_ = true;
    }
    
    condition_.notify_all();
    
    for (std::thread& worker : workers_) {
        if (worker.joinable()) {
            worker.join();
        }
    }
    
    workers_.clear();
}

// ParallelProcessor implementation
ParallelProcessor::ParallelProcessor(size_t num_threads) 
    : thread_pool_(std::make_unique<ThreadPool>(num_threads)) {
    Logger::getInstance().info("Initialized ParallelProcessor with {} threads", num_threads);
}

ParallelProcessor::~ParallelProcessor() = default;

std::vector<ParallelBacktestResult> ParallelProcessor::processStrategyVariants(
    const std::vector<StrategyVariant>& variants,
    const std::vector<double>& price_data,
    uint64_t start_timestamp,
    uint64_t end_timestamp) {
    
    auto& logger = Logger::getInstance();
    logger.info("Processing {} strategy variants in parallel", variants.size());
    
    std::vector<std::future<ParallelBacktestResult>> futures;
    futures.reserve(variants.size());
    
    // Submit all variants for parallel processing
    for (const auto& variant : variants) {
        futures.push_back(thread_pool_->enqueue([this, &variant, &price_data, start_timestamp, end_timestamp]() {
            return processStrategyVariant(variant, price_data, start_timestamp, end_timestamp);
        }));
    }
    
    // Collect results
    std::vector<ParallelBacktestResult> results;
    results.reserve(variants.size());
    
    for (auto& future : futures) {
        results.push_back(future.get());
    }
    
    logger.info("Completed processing {} strategy variants", results.size());
    return results;
}

void ParallelProcessor::processDataChunks(const std::vector<double>& data,
                                        std::function<void(const std::vector<double>&, size_t, size_t)> processor,
                                        size_t chunk_size) {
    if (data.empty()) return;
    
    auto& logger = Logger::getInstance();
    size_t num_chunks = (data.size() + chunk_size - 1) / chunk_size;
    logger.debug("Processing {} data points in {} chunks", data.size(), num_chunks);
    
    std::vector<std::future<void>> futures;
    futures.reserve(num_chunks);
    
    for (size_t i = 0; i < data.size(); i += chunk_size) {
        size_t end_idx = std::min(i + chunk_size, data.size());
        
        futures.push_back(thread_pool_->enqueue([&data, processor, i, end_idx]() {
            processor(data, i, end_idx);
        }));
    }
    
    // Wait for all chunks to complete
    for (auto& future : futures) {
        future.get();
    }
    
    logger.debug("Completed parallel data chunk processing");
}

void ParallelProcessor::calculateIndicatorsParallel(const std::vector<double>& prices,
                                                  std::vector<std::vector<double>>& indicators,
                                                  const std::vector<std::string>& indicator_types) {
    auto& logger = Logger::getInstance();
    logger.debug("Calculating {} indicators in parallel", indicator_types.size());
    
    // Convert to float for SIMD operations
    std::vector<float> float_prices(prices.begin(), prices.end());
    indicators.resize(indicator_types.size());
    
    std::vector<std::future<void>> futures;
    futures.reserve(indicator_types.size());
    
    for (size_t i = 0; i < indicator_types.size(); ++i) {
        const std::string& indicator_type = indicator_types[i];
        
        futures.push_back(thread_pool_->enqueue([&, i, indicator_type]() {
            indicators[i].resize(prices.size());
            std::vector<float> result(prices.size());
            
            if (indicator_type == "SMA_20") {
                SIMDIndicators::calculateSMA(float_prices.data(), result.data(), 
                                           prices.size(), 20);
            } else if (indicator_type == "EMA_12") {
                SIMDIndicators::calculateEMA(float_prices.data(), result.data(), 
                                           prices.size(), 2.0f / 13.0f);
            } else if (indicator_type == "RSI_14") {
                SIMDIndicators::calculateRSI(float_prices.data(), result.data(), 
                                           prices.size(), 14);
            }
            // Add more indicator types as needed
            
            // Convert back to double
            indicators[i].assign(result.begin(), result.end());
        }));
    }
    
    // Wait for all indicators to complete
    for (auto& future : futures) {
        future.get();
    }
    
    logger.debug("Completed parallel indicator calculations");
}

std::vector<std::vector<double>> ParallelProcessor::runMonteCarloSimulation(
    const std::vector<double>& returns,
    size_t num_simulations,
    size_t simulation_length) {
    
    auto& logger = Logger::getInstance();
    logger.info("Running Monte Carlo simulation: {} simulations of {} periods", 
               num_simulations, simulation_length);
    
    std::vector<std::future<std::vector<double>>> futures;
    futures.reserve(num_simulations);
    
    // Submit simulations for parallel processing
    for (size_t i = 0; i < num_simulations; ++i) {
        futures.push_back(thread_pool_->enqueue([this, &returns, simulation_length, i]() {
            return generateRandomReturns(returns, simulation_length);
        }));
    }
    
    // Collect results
    std::vector<std::vector<double>> simulations;
    simulations.reserve(num_simulations);
    
    for (auto& future : futures) {
        simulations.push_back(future.get());
    }
    
    logger.info("Completed Monte Carlo simulation");
    return simulations;
}

void ParallelProcessor::setNumThreads(size_t num_threads) {
    thread_pool_ = std::make_unique<ThreadPool>(num_threads);
    Logger::getInstance().info("Updated thread pool to {} threads", num_threads);
}

ParallelBacktestResult ParallelProcessor::processStrategyVariant(const StrategyVariant& variant,
                                                       const std::vector<double>& price_data,
                                                       uint64_t start_timestamp,
                                                       uint64_t end_timestamp) {
    ParallelBacktestResult result(variant.id);
    
    // Simple strategy simulation (placeholder implementation)
    // In a real implementation, this would execute the actual strategy logic
    
    std::vector<double> equity_curve;
    equity_curve.reserve(price_data.size());
    
    double portfolio_value = 100000.0; // Starting capital
    double position = 0.0;
    uint32_t trade_count = 0;
    uint32_t winning_trades = 0;
    double max_value = portfolio_value;
    double max_drawdown = 0.0;
    
    // Simple moving average crossover strategy simulation
    std::vector<float> float_prices(price_data.begin(), price_data.end());
    std::vector<float> sma_short(price_data.size());
    std::vector<float> sma_long(price_data.size());
    
    SIMDIndicators::calculateSMA(float_prices.data(), sma_short.data(), 
                               price_data.size(), 10);
    SIMDIndicators::calculateSMA(float_prices.data(), sma_long.data(), 
                               price_data.size(), 20);
    
    for (size_t i = 20; i < price_data.size(); ++i) {
        double current_price = price_data[i];
        
        // Strategy logic: buy when short MA crosses above long MA
        if (position == 0.0 && sma_short[i] > sma_long[i] && sma_short[i-1] <= sma_long[i-1]) {
            // Buy signal
            position = portfolio_value / current_price;
            trade_count++;
        }
        // Sell when short MA crosses below long MA
        else if (position > 0.0 && sma_short[i] < sma_long[i] && sma_short[i-1] >= sma_long[i-1]) {
            // Sell signal
            double trade_return = (current_price * position) - portfolio_value;
            portfolio_value = current_price * position;
            if (trade_return > 0) {
                winning_trades++;
            }
            position = 0.0;
        }
        
        // Update portfolio value
        double current_value = (position > 0.0) ? position * current_price : portfolio_value;
        equity_curve.push_back(current_value);
        
        // Track drawdown
        if (current_value > max_value) {
            max_value = current_value;
        } else {
            double drawdown = (max_value - current_value) / max_value;
            max_drawdown = std::max(max_drawdown, drawdown);
        }
    }
    
    // Calculate final metrics
    result.total_return = (equity_curve.back() - 100000.0) / 100000.0;
    result.max_drawdown = max_drawdown;
    result.total_trades = trade_count;
    result.win_rate = (trade_count > 0) ? static_cast<double>(winning_trades) / trade_count : 0.0;
    result.equity_curve = std::move(equity_curve);
    
    // Calculate Sharpe ratio (simplified)
    if (!equity_curve.empty()) {
        std::vector<double> returns;
        for (size_t i = 1; i < equity_curve.size(); ++i) {
            returns.push_back((equity_curve[i] - equity_curve[i-1]) / equity_curve[i-1]);
        }
        
        if (!returns.empty()) {
            double mean_return = std::accumulate(returns.begin(), returns.end(), 0.0) / returns.size();
            double variance = 0.0;
            for (double ret : returns) {
                variance += (ret - mean_return) * (ret - mean_return);
            }
            variance /= returns.size();
            double std_dev = std::sqrt(variance);
            
            result.sharpe_ratio = (std_dev > 0.0) ? mean_return / std_dev * std::sqrt(252.0) : 0.0;
        }
    }
    
    return result;
}

std::vector<double> ParallelProcessor::generateRandomReturns(const std::vector<double>& historical_returns,
                                                           size_t length) {
    std::vector<double> simulated_returns;
    simulated_returns.reserve(length);
    
    // Use thread-local random number generator
    thread_local std::random_device rd;
    thread_local std::mt19937 gen(rd());
    
    if (historical_returns.empty()) {
        // Generate random normal returns if no historical data
        std::normal_distribution<double> dist(0.0001, 0.02); // 0.01% mean, 2% std dev
        for (size_t i = 0; i < length; ++i) {
            simulated_returns.push_back(dist(gen));
        }
    } else {
        // Bootstrap from historical returns
        std::uniform_int_distribution<size_t> dist(0, historical_returns.size() - 1);
        for (size_t i = 0; i < length; ++i) {
            simulated_returns.push_back(historical_returns[dist(gen)]);
        }
    }
    
    return simulated_returns;
}

} // namespace tradeflow