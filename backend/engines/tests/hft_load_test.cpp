#include <gtest/gtest.h>
#include <chrono>
#include <vector>
#include <thread>
#include <atomic>
#include <random>
#include <fstream>
#include <iomanip>
#include <queue>
#include <mutex>
#include <condition_variable>

// Include engine headers
#include "high_res_timer.hpp"
#include "lock_free_order_book.hpp"
#include "pre_trade_validator.hpp"
#include "order_management_system.hpp"
#include "performance_monitor.hpp"

// JSON output for results
#include <nlohmann/json.hpp>
using json = nlohmann::json;

class HFTLoadTest : public ::testing::Test {
protected:
    void SetUp() override {
        // Initialize components
        timer = std::make_unique<HighResTimer>();
        order_book = std::make_unique<LockFreeOrderBook<double, 1000000>>();
        risk_validator = std::make_unique<PreTradeValidator>();
        oms = std::make_unique<OrderManagementSystem>();
        perf_monitor = std::make_unique<PerformanceMonitor>();
        
        // Initialize test parameters
        target_ops_per_second = 100000;  // Default target
        test_duration_seconds = 300;     // Default 5 minutes
        thread_count = std::thread::hardware_concurrency();
        
        // Parse environment variables
        parse_environment();
        
        // Prepare test data
        prepare_test_data();
    }
    
    void TearDown() override {
        timer.reset();
        order_book.reset();
        risk_validator.reset();
        oms.reset();
        perf_monitor.reset();
    }
    
    void parse_environment() {
        const char* target_ops = std::getenv("TARGET_OPS");
        if (target_ops) {
            target_ops_per_second = std::stoi(target_ops);
        }
        
        const char* duration = std::getenv("DURATION");
        if (duration) {
            test_duration_seconds = std::stoi(duration);
        }
        
        const char* threads = std::getenv("THREADS");
        if (threads) {
            thread_count = std::stoi(threads);
        }
    }
    
    void prepare_test_data() {
        // Generate orders for load testing
        std::random_device rd;
        std::mt19937 gen(rd());
        std::uniform_real_distribution<double> price_dist(100.0, 200.0);
        std::uniform_int_distribution<uint32_t> qty_dist(100, 10000);
        
        const int orders_per_thread = (target_ops_per_second * test_duration_seconds) / thread_count;
        
        test_orders.resize(thread_count);
        for (int t = 0; t < thread_count; ++t) {
            test_orders[t].reserve(orders_per_thread);
            
            for (int i = 0; i < orders_per_thread; ++i) {
                Order order;
                order.id = t * orders_per_thread + i + 1;
                order.price = price_dist(gen);
                order.quantity = qty_dist(gen);
                order.side = (i % 2 == 0) ? OrderSide::BUY : OrderSide::SELL;
                order.status = OrderStatus::PENDING;
                order.symbol = "AAPL";
                order.user_id = "user-" + std::to_string(t);
                test_orders[t].push_back(order);
            }
        }
    }
    
    struct LoadTestResults {
        uint64_t total_orders_submitted;
        uint64_t total_orders_accepted;
        uint64_t total_orders_rejected;
        double actual_ops_per_second;
        double success_rate_percent;
        uint64_t test_duration_ns;
        double avg_latency_ns;
        double p50_latency_ns;
        double p95_latency_ns;
        double p99_latency_ns;
        double p999_latency_ns;
        std::vector<uint64_t> latency_histogram;
        double cpu_usage_percent;
        double memory_usage_mb;
    };
    
    LoadTestResults run_load_test() {
        LoadTestResults results = {};
        
        // Latency tracking
        std::vector<std::vector<uint64_t>> thread_latencies(thread_count);
        for (auto& latencies : thread_latencies) {
            latencies.reserve(test_orders[0].size());
        }
        
        // Counters
        std::atomic<uint64_t> orders_submitted{0};
        std::atomic<uint64_t> orders_accepted{0};
        std::atomic<uint64_t> orders_rejected{0};
        
        // Start performance monitoring
        perf_monitor->start_monitoring();
        
        // Synchronization
        std::atomic<bool> start_flag{false};
        std::atomic<bool> stop_flag{false};
        
        // Create worker threads
        std::vector<std::thread> workers;
        
        for (int t = 0; t < thread_count; ++t) {
            workers.emplace_back([this, t, &thread_latencies, &orders_submitted, 
                                &orders_accepted, &orders_rejected, &start_flag, &stop_flag]() {
                
                // Wait for start signal
                while (!start_flag.load(std::memory_order_acquire)) {
                    std::this_thread::yield();
                }
                
                // Calculate timing for target rate
                const auto orders_per_thread = test_orders[t].size();
                const auto target_interval_ns = (1000000000ULL * thread_count) / target_ops_per_second;
                
                auto next_order_time = timer->now();
                size_t order_index = 0;
                
                while (!stop_flag.load(std::memory_order_acquire) && order_index < orders_per_thread) {
                    // Wait for next order time
                    auto current_time = timer->now();
                    if (current_time < next_order_time) {
                        // Busy wait for precise timing
                        while (timer->now() < next_order_time) {
                            std::this_thread::yield();
                        }
                    }
                    
                    // Submit order
                    auto start_time = timer->now();
                    
                    // 1. Risk validation
                    bool risk_ok = risk_validator->validate_order(
                        test_orders[t][order_index].user_id, 
                        test_orders[t][order_index]
                    );
                    
                    bool order_accepted = false;
                    if (risk_ok) {
                        // 2. Submit to order book
                        order_accepted = order_book->add_order(&test_orders[t][order_index]);
                        
                        if (order_accepted) {
                            // 3. Update OMS
                            oms->record_order(test_orders[t][order_index]);
                        }
                    }
                    
                    auto end_time = timer->now();
                    
                    // Record metrics
                    orders_submitted.fetch_add(1, std::memory_order_relaxed);
                    if (order_accepted) {
                        orders_accepted.fetch_add(1, std::memory_order_relaxed);
                    } else {
                        orders_rejected.fetch_add(1, std::memory_order_relaxed);
                    }
                    
                    thread_latencies[t].push_back(end_time - start_time);
                    
                    // Schedule next order
                    next_order_time += target_interval_ns;
                    order_index++;
                }
            });
        }
        
        // Start the test
        auto test_start_time = timer->now();
        start_flag.store(true, std::memory_order_release);
        
        // Run for specified duration
        std::this_thread::sleep_for(std::chrono::seconds(test_duration_seconds));
        
        // Stop the test
        stop_flag.store(true, std::memory_order_release);
        auto test_end_time = timer->now();
        
        // Wait for all threads to complete
        for (auto& worker : workers) {
            worker.join();
        }
        
        // Stop performance monitoring
        auto perf_stats = perf_monitor->stop_monitoring();
        
        // Calculate results
        results.total_orders_submitted = orders_submitted.load();
        results.total_orders_accepted = orders_accepted.load();
        results.total_orders_rejected = orders_rejected.load();
        results.test_duration_ns = test_end_time - test_start_time;
        
        double test_duration_s = static_cast<double>(results.test_duration_ns) / 1e9;
        results.actual_ops_per_second = results.total_orders_submitted / test_duration_s;
        results.success_rate_percent = (static_cast<double>(results.total_orders_accepted) / 
                                       results.total_orders_submitted) * 100.0;
        
        // Combine latencies from all threads
        std::vector<uint64_t> all_latencies;
        for (const auto& thread_latencies_vec : thread_latencies) {
            all_latencies.insert(all_latencies.end(), 
                                thread_latencies_vec.begin(), 
                                thread_latencies_vec.end());
        }
        
        // Calculate latency statistics
        if (!all_latencies.empty()) {
            std::sort(all_latencies.begin(), all_latencies.end());
            
            uint64_t sum = 0;
            for (auto latency : all_latencies) {
                sum += latency;
            }
            results.avg_latency_ns = static_cast<double>(sum) / all_latencies.size();
            
            size_t size = all_latencies.size();
            results.p50_latency_ns = all_latencies[size * 0.50];
            results.p95_latency_ns = all_latencies[size * 0.95];
            results.p99_latency_ns = all_latencies[size * 0.99];
            results.p999_latency_ns = all_latencies[size * 0.999];
        }
        
        // Performance statistics
        results.cpu_usage_percent = perf_stats.avg_cpu_usage;
        results.memory_usage_mb = perf_stats.peak_memory_mb;
        
        return results;
    }
    
    int target_ops_per_second;
    int test_duration_seconds;
    int thread_count;
    
    std::unique_ptr<HighResTimer> timer;
    std::unique_ptr<LockFreeOrderBook<double, 1000000>> order_book;
    std::unique_ptr<PreTradeValidator> risk_validator;
    std::unique_ptr<OrderManagementSystem> oms;
    std::unique_ptr<PerformanceMonitor> perf_monitor;
    
    std::vector<std::vector<Order>> test_orders;
    
    json benchmark_results;
};

// Main HFT Load Test
TEST_F(HFTLoadTest, HighFrequencyTradingLoad) {
    std::cout << "Starting HFT Load Test..." << std::endl;
    std::cout << "Target: " << target_ops_per_second << " orders/sec" << std::endl;
    std::cout << "Duration: " << test_duration_seconds << " seconds" << std::endl;
    std::cout << "Threads: " << thread_count << std::endl;
    
    // Warmup
    std::cout << "Warming up..." << std::endl;
    for (int i = 0; i < 10000; ++i) {
        if (!test_orders.empty() && !test_orders[0].empty()) {
            risk_validator->validate_order("warmup-user", test_orders[0][i % test_orders[0].size()]);
            order_book->add_order(&test_orders[0][i % test_orders[0].size()]);
        }
    }
    
    // Run the load test
    std::cout << "Running load test..." << std::endl;
    auto results = run_load_test();
    
    // Store results
    benchmark_results["hft_load"] = {
        {"target_ops_per_second", target_ops_per_second},
        {"actual_ops_per_second", results.actual_ops_per_second},
        {"test_duration_seconds", test_duration_seconds},
        {"thread_count", thread_count},
        {"total_orders_submitted", results.total_orders_submitted},
        {"total_orders_accepted", results.total_orders_accepted},
        {"total_orders_rejected", results.total_orders_rejected},
        {"success_rate_percent", results.success_rate_percent},
        {"avg_latency_ns", results.avg_latency_ns},
        {"avg_latency_us", results.avg_latency_ns / 1000.0},
        {"p50_latency_ns", results.p50_latency_ns},
        {"p50_latency_us", results.p50_latency_ns / 1000.0},
        {"p95_latency_ns", results.p95_latency_ns},
        {"p95_latency_us", results.p95_latency_ns / 1000.0},
        {"p99_latency_ns", results.p99_latency_ns},
        {"p99_latency_us", results.p99_latency_ns / 1000.0},
        {"p999_latency_ns", results.p999_latency_ns},
        {"p999_latency_us", results.p999_latency_ns / 1000.0},
        {"cpu_usage_percent", results.cpu_usage_percent},
        {"memory_usage_mb", results.memory_usage_mb}
    };
    
    // Print results
    std::cout << std::fixed << std::setprecision(2);
    std::cout << "\n=== HFT Load Test Results ===" << std::endl;
    std::cout << "Orders/Second: " << results.actual_ops_per_second 
              << " (target: " << target_ops_per_second << ")" << std::endl;
    std::cout << "Success Rate: " << results.success_rate_percent << "%" << std::endl;
    std::cout << "Average Latency: " << results.avg_latency_ns / 1000.0 << "μs" << std::endl;
    std::cout << "P99 Latency: " << results.p99_latency_ns / 1000.0 << "μs" << std::endl;
    std::cout << "CPU Usage: " << results.cpu_usage_percent << "%" << std::endl;
    std::cout << "Memory Usage: " << results.memory_usage_mb << "MB" << std::endl;
    
    // Verify performance targets
    EXPECT_GE(results.actual_ops_per_second, target_ops_per_second * 0.95) 
        << "Throughput below 95% of target";
    EXPECT_GE(results.success_rate_percent, 99.9) 
        << "Success rate below 99.9%";
    EXPECT_LE(results.p99_latency_ns, 50000) 
        << "P99 latency above 50μs: " << results.p99_latency_ns / 1000.0 << "μs";
}

// Burst Load Test
TEST_F(HFTLoadTest, BurstLoad) {
    std::cout << "Running burst load test..." << std::endl;
    
    const int burst_size = 10000;
    const int burst_count = 10;
    
    std::vector<uint64_t> burst_latencies;
    burst_latencies.reserve(burst_size * burst_count);
    
    for (int burst = 0; burst < burst_count; ++burst) {
        std::cout << "Burst " << (burst + 1) << "/" << burst_count << std::endl;
        
        auto burst_start = timer->now();
        
        for (int i = 0; i < burst_size; ++i) {
            if (!test_orders.empty() && !test_orders[0].empty()) {
                auto start = timer->now();
                
                bool risk_ok = risk_validator->validate_order(
                    "burst-user", test_orders[0][i % test_orders[0].size()]);
                
                if (risk_ok) {
                    order_book->add_order(&test_orders[0][i % test_orders[0].size()]);
                }
                
                auto end = timer->now();
                burst_latencies.push_back(end - start);
            }
        }
        
        auto burst_end = timer->now();
        auto burst_duration_s = static_cast<double>(burst_end - burst_start) / 1e9;
        auto burst_ops_per_sec = burst_size / burst_duration_s;
        
        std::cout << "Burst " << (burst + 1) << " rate: " 
                  << std::fixed << std::setprecision(0) << burst_ops_per_sec 
                  << " ops/sec" << std::endl;
        
        // Brief pause between bursts
        std::this_thread::sleep_for(std::chrono::milliseconds(100));
    }
    
    // Calculate burst statistics
    std::sort(burst_latencies.begin(), burst_latencies.end());
    
    uint64_t sum = 0;
    for (auto latency : burst_latencies) {
        sum += latency;
    }
    double avg_latency = static_cast<double>(sum) / burst_latencies.size();
    
    size_t size = burst_latencies.size();
    double p99_latency = burst_latencies[size * 0.99];
    
    benchmark_results["burst_load"] = {
        {"burst_size", burst_size},
        {"burst_count", burst_count},
        {"total_operations", burst_size * burst_count},
        {"avg_latency_ns", avg_latency},
        {"avg_latency_us", avg_latency / 1000.0},
        {"p99_latency_ns", p99_latency},
        {"p99_latency_us", p99_latency / 1000.0}
    };
    
    std::cout << "Burst Load Results:" << std::endl;
    std::cout << "Average Latency: " << avg_latency / 1000.0 << "μs" << std::endl;
    std::cout << "P99 Latency: " << p99_latency / 1000.0 << "μs" << std::endl;
}

// Sustained Load Test
TEST_F(HFTLoadTest, SustainedLoad) {
    std::cout << "Running sustained load test..." << std::endl;
    
    const int sustained_duration = 60; // 1 minute
    const int target_rate = target_ops_per_second / 2; // Half rate for sustainability
    
    std::atomic<uint64_t> operations_completed{0};
    std::atomic<bool> stop_test{false};
    
    std::vector<uint64_t> sustained_latencies;
    std::mutex latencies_mutex;
    
    // Worker thread
    std::thread worker([this, &operations_completed, &stop_test, &sustained_latencies, 
                       &latencies_mutex, target_rate]() {
        
        const auto target_interval_ns = 1000000000ULL / target_rate;
        auto next_operation_time = timer->now();
        
        while (!stop_test.load()) {
            // Wait for next operation time
            while (timer->now() < next_operation_time && !stop_test.load()) {
                std::this_thread::yield();
            }
            
            if (stop_test.load()) break;
            
            auto start = timer->now();
            
            if (!test_orders.empty() && !test_orders[0].empty()) {
                size_t order_idx = operations_completed.load() % test_orders[0].size();
                
                bool risk_ok = risk_validator->validate_order(
                    "sustained-user", test_orders[0][order_idx]);
                
                if (risk_ok) {
                    order_book->add_order(&test_orders[0][order_idx]);
                }
            }
            
            auto end = timer->now();
            
            {
                std::lock_guard<std::mutex> lock(latencies_mutex);
                sustained_latencies.push_back(end - start);
            }
            
            operations_completed.fetch_add(1);
            next_operation_time += target_interval_ns;
        }
    });
    
    // Run for sustained duration
    std::this_thread::sleep_for(std::chrono::seconds(sustained_duration));
    stop_test.store(true);
    worker.join();
    
    // Calculate sustained load statistics
    double actual_rate = static_cast<double>(operations_completed.load()) / sustained_duration;
    
    std::sort(sustained_latencies.begin(), sustained_latencies.end());
    
    uint64_t sum = 0;
    for (auto latency : sustained_latencies) {
        sum += latency;
    }
    double avg_latency = static_cast<double>(sum) / sustained_latencies.size();
    
    size_t size = sustained_latencies.size();
    double p99_latency = sustained_latencies[size * 0.99];
    
    benchmark_results["sustained_load"] = {
        {"duration_seconds", sustained_duration},
        {"target_rate", target_rate},
        {"actual_rate", actual_rate},
        {"total_operations", operations_completed.load()},
        {"avg_latency_ns", avg_latency},
        {"avg_latency_us", avg_latency / 1000.0},
        {"p99_latency_ns", p99_latency},
        {"p99_latency_us", p99_latency / 1000.0}
    };
    
    std::cout << "Sustained Load Results:" << std::endl;
    std::cout << "Target Rate: " << target_rate << " ops/sec" << std::endl;
    std::cout << "Actual Rate: " << std::fixed << std::setprecision(2) << actual_rate << " ops/sec" << std::endl;
    std::cout << "Average Latency: " << avg_latency / 1000.0 << "μs" << std::endl;
    std::cout << "P99 Latency: " << p99_latency / 1000.0 << "μs" << std::endl;
}

// Output results to JSON file
TEST_F(HFTLoadTest, GenerateResults) {
    const char* output_file = std::getenv("OUTPUT_FILE");
    if (!output_file) {
        output_file = "hft_load_results.json";
    }
    
    // Add metadata
    json results;
    results["metadata"] = {
        {"timestamp", std::chrono::duration_cast<std::chrono::seconds>(
            std::chrono::system_clock::now().time_since_epoch()).count()},
        {"target_ops_per_second", target_ops_per_second},
        {"test_duration_seconds", test_duration_seconds},
        {"thread_count", thread_count},
        {"compiler", 
#ifdef __GNUC__
            "GCC " + std::to_string(__GNUC__) + "." + std::to_string(__GNUC_MINOR__)
#elif defined(__clang__)
            "Clang " + std::to_string(__clang_major__) + "." + std::to_string(__clang_minor__)
#else
            "Unknown"
#endif
        }
    };
    
    // Merge benchmark results
    for (auto& [key, value] : benchmark_results.items()) {
        results[key] = value;
    }
    
    // Write results to file
    std::ofstream file(output_file);
    if (file.is_open()) {
        file << results.dump(2);
        file.close();
        std::cout << "HFT load test results written to: " << output_file << std::endl;
    } else {
        std::cerr << "Failed to write HFT load test results to: " << output_file << std::endl;
    }
}

int main(int argc, char **argv) {
    ::testing::InitGoogleTest(&argc, argv);
    
    // Parse command line arguments
    for (int i = 1; i < argc; ++i) {
        std::string arg = argv[i];
        if (arg.find("--target-ops=") == 0) {
            std::string target_ops = arg.substr(13);
            setenv("TARGET_OPS", target_ops.c_str(), 1);
        } else if (arg.find("--duration=") == 0) {
            std::string duration = arg.substr(11);
            setenv("DURATION", duration.c_str(), 1);
        } else if (arg.find("--threads=") == 0) {
            std::string threads = arg.substr(10);
            setenv("THREADS", threads.c_str(), 1);
        } else if (arg.find("--output=") == 0) {
            std::string output_file = arg.substr(9);
            setenv("OUTPUT_FILE", output_file.c_str(), 1);
        }
    }
    
    return RUN_ALL_TESTS();
}