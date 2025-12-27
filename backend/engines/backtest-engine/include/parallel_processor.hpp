#pragma once

#include <vector>
#include <thread>
#include <future>
#include <functional>
#include <queue>
#include <mutex>
#include <condition_variable>
#include <atomic>

namespace tradeflow {

struct StrategyVariant {
    uint32_t id;
    std::string name;
    std::vector<std::pair<std::string, double>> parameters;
    
    StrategyVariant(uint32_t variant_id, const std::string& variant_name)
        : id(variant_id), name(variant_name) {}
};

struct BacktestTask {
    StrategyVariant variant;
    std::vector<double> price_data;
    uint64_t start_timestamp;
    uint64_t end_timestamp;
    
    BacktestTask(const StrategyVariant& v, const std::vector<double>& prices,
                uint64_t start_ts, uint64_t end_ts)
        : variant(v), price_data(prices), start_timestamp(start_ts), end_timestamp(end_ts) {}
};

struct ParallelBacktestResult {
    uint32_t variant_id;
    double total_return;
    double sharpe_ratio;
    double max_drawdown;
    uint32_t total_trades;
    double win_rate;
    std::vector<double> equity_curve;
    
    ParallelBacktestResult() = default;
    ParallelBacktestResult(uint32_t id) : variant_id(id) {}
};

class ThreadPool {
public:
    explicit ThreadPool(size_t num_threads);
    ~ThreadPool();
    
    template<typename F, typename... Args>
    auto enqueue(F&& f, Args&&... args) -> std::future<typename std::invoke_result<F, Args...>::type>;
    
    void shutdown();
    size_t size() const { return workers_.size(); }

private:
    std::vector<std::thread> workers_;
    std::queue<std::function<void()>> tasks_;
    std::mutex queue_mutex_;
    std::condition_variable condition_;
    std::atomic<bool> stop_;
};

class ParallelProcessor {
public:
    explicit ParallelProcessor(size_t num_threads = std::thread::hardware_concurrency());
    ~ParallelProcessor();
    
    // Process multiple strategy variants in parallel
    std::vector<ParallelBacktestResult> processStrategyVariants(
        const std::vector<StrategyVariant>& variants,
        const std::vector<double>& price_data,
        uint64_t start_timestamp,
        uint64_t end_timestamp);
    
    // Parallel data processing for large datasets
    void processDataChunks(const std::vector<double>& data,
                          std::function<void(const std::vector<double>&, size_t, size_t)> processor,
                          size_t chunk_size = 10000);
    
    // Parallel indicator calculations
    void calculateIndicatorsParallel(const std::vector<double>& prices,
                                   std::vector<std::vector<double>>& indicators,
                                   const std::vector<std::string>& indicator_types);
    
    // Monte Carlo simulation in parallel
    std::vector<std::vector<double>> runMonteCarloSimulation(
        const std::vector<double>& returns,
        size_t num_simulations,
        size_t simulation_length);
    
    void setNumThreads(size_t num_threads);
    size_t getNumThreads() const { return thread_pool_->size(); }

private:
    std::unique_ptr<ThreadPool> thread_pool_;
    
    // Internal processing functions
    ParallelBacktestResult processStrategyVariant(const StrategyVariant& variant,
                                        const std::vector<double>& price_data,
                                        uint64_t start_timestamp,
                                        uint64_t end_timestamp);
    
    std::vector<double> generateRandomReturns(const std::vector<double>& historical_returns,
                                            size_t length);
};

// Template implementation for ThreadPool::enqueue
template<typename F, typename... Args>
auto ThreadPool::enqueue(F&& f, Args&&... args) -> std::future<typename std::invoke_result<F, Args...>::type> {
    using return_type = typename std::invoke_result<F, Args...>::type;
    
    auto task = std::make_shared<std::packaged_task<return_type()>>(
        std::bind(std::forward<F>(f), std::forward<Args>(args)...)
    );
    
    std::future<return_type> res = task->get_future();
    
    {
        std::unique_lock<std::mutex> lock(queue_mutex_);
        
        if (stop_) {
            throw std::runtime_error("enqueue on stopped ThreadPool");
        }
        
        tasks_.emplace([task](){ (*task)(); });
    }
    
    condition_.notify_one();
    return res;
}

} // namespace tradeflow