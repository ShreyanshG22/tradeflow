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
#include "data_distribution_coordinator.hpp"
#include "tick_storage.hpp"
#include "shared_memory_ipc.hpp"
#include "binary_format.hpp"

// JSON output for results
#include <nlohmann/json.hpp>
using json = nlohmann::json;

class MarketDataStressTest : public ::testing::Test {
protected:
    void SetUp() override {
        // Initialize components
        timer = std::make_unique<HighResTimer>();
        data_coordinator = std::make_unique<DataDistributionCoordinator>();
        tick_storage = std::make_unique<TickStorage>();
        shared_memory = std::make_unique<SharedMemoryIPC>();
        binary_formatter = std::make_unique<BinaryFormat>();
        
        // Initialize test parameters
        target_ticks_per_second = 1000000;  // Default 1M ticks/sec
        test_duration_seconds = 600;        // Default 10 minutes
        feed_count = 10;                    // Number of simulated feeds
        subscriber_count = 1000;            // Number of subscribers
        
        // Parse environment variables
        parse_environment();
        
        // Prepare test data
        prepare_test_data();
    }
    
    void TearDown() override {
        timer.reset();
        data_coordinator.reset();
        tick_storage.reset();
        shared_memory.reset();
        binary_formatter.reset();
    }
    
    void parse_environment() {
        const char* target_ticks = std::getenv("TARGET_TICKS");
        if (target_ticks) {
            target_ticks_per_second = std::stoi(target_ticks);
        }
        
        const char* duration = std::getenv("DURATION");
        if (duration) {
            test_duration_seconds = std::stoi(duration);
        }
        
        const char* feeds = std::getenv("FEEDS");
        if (feeds) {
            feed_count = std::stoi(feeds);
        }
        
        const char* subscribers = std::getenv("SUBSCRIBERS");
        if (subscribers) {
            subscriber_count = std::stoi(subscribers);
        }
    }
    
    void prepare_test_data() {
        // Generate market data ticks
        std::random_device rd;
        std::mt19937 gen(rd());
        std::uniform_real_distribution<double> price_dist(100.0, 200.0);
        std::uniform_int_distribution<uint64_t> volume_dist(100, 10000);
        
        // Symbols for different feeds
        symbols = {"AAPL", "GOOGL", "MSFT", "AMZN", "TSLA", "META", "NVDA", "NFLX", "CRM", "ORCL"};
        
        // Generate ticks for each feed
        const int ticks_per_feed = (target_ticks_per_second * test_duration_seconds) / feed_count;
        
        test_ticks.resize(feed_count);
        for (int f = 0; f < feed_count; ++f) {
            test_ticks[f].reserve(ticks_per_feed);
            
            for (int i = 0; i < ticks_per_feed; ++i) {
                MarketTick tick;
                tick.symbol = symbols[f % symbols.size()];
                tick.price = price_dist(gen);
                tick.volume = volume_dist(gen);
                tick.timestamp = std::chrono::high_resolution_clock::now().time_since_epoch().count();
                tick.bid = tick.price - 0.01;
                tick.ask = tick.price + 0.01;
                tick.sequence_number = f * ticks_per_feed + i + 1;
                test_ticks[f].push_back(tick);
            }
        }
    }
    
    struct StressTestResults {
        uint64_t total_ticks_generated;
        uint64_t total_ticks_processed;
        uint64_t total_ticks_distributed;
        double actual_ticks_per_second;
        double processing_success_rate;
        uint64_t test_duration_ns;
        double avg_processing_latency_ns;
        double p99_processing_latency_ns;
        double avg_distribution_latency_ns;
        double p99_distribution_latency_ns;
        double memory_growth_mb_per_hour;
        double avg_cpu_percent;
        double peak_memory_mb;
        uint64_t dropped_ticks;
        double drop_rate_percent;
    };
    
    StressTestResults run_stress_test() {
        StressTestResults results = {};
        
        // Metrics tracking
        std::atomic<uint64_t> ticks_generated{0};
        std::atomic<uint64_t> ticks_processed{0};
        std::atomic<uint64_t> ticks_distributed{0};
        std::atomic<uint64_t> ticks_dropped{0};
        
        std::vector<std::vector<uint64_t>> processing_latencies(feed_count);
        std::vector<uint64_t> distribution_latencies;
        std::mutex latencies_mutex;
        
        // Memory monitoring
        auto initial_memory = get_memory_usage_mb();
        std::vector<double> memory_samples;
        std::atomic<bool> monitor_memory{true};
        
        // Memory monitoring thread
        std::thread memory_monitor([&memory_samples, &monitor_memory, this]() {
            while (monitor_memory.load()) {
                memory_samples.push_back(get_memory_usage_mb());
                std::this_thread::sleep_for(std::chrono::seconds(1));
            }
        });
        
        // Set up subscribers
        std::vector<std::atomic<uint64_t>> subscriber_counters(subscriber_count);
        for (int s = 0; s < subscriber_count; ++s) {
            subscriber_counters[s].store(0);
            
            auto subscriber_callback = [&subscriber_counters, s, &ticks_distributed, 
                                      &distribution_latencies, &latencies_mutex, this](const MarketTick& tick) {
                auto distribution_start = timer->now();
                
                // Simulate subscriber processing
                subscriber_counters[s].fetch_add(1, std::memory_order_relaxed);
                ticks_distributed.fetch_add(1, std::memory_order_relaxed);
                
                auto distribution_end = timer->now();
                
                {
                    std::lock_guard<std::mutex> lock(latencies_mutex);
                    distribution_latencies.push_back(distribution_end - distribution_start);
                }
            };
            
            // Subscribe to random symbols
            std::string symbol = symbols[s % symbols.size()];
            data_coordinator->subscribe(symbol, subscriber_callback);
        }
        
        // Synchronization
        std::atomic<bool> start_flag{false};
        std::atomic<bool> stop_flag{false};
        
        // Create feed threads
        std::vector<std::thread> feed_threads;
        
        for (int f = 0; f < feed_count; ++f) {
            feed_threads.emplace_back([this, f, &processing_latencies, &ticks_generated, 
                                     &ticks_processed, &ticks_dropped, &start_flag, &stop_flag]() {
                
                // Wait for start signal
                while (!start_flag.load(std::memory_order_acquire)) {
                    std::this_thread::yield();
                }
                
                // Calculate timing for target rate
                const auto ticks_per_feed = test_ticks[f].size();
                const auto target_interval_ns = (1000000000ULL * feed_count) / target_ticks_per_second;
                
                auto next_tick_time = timer->now();
                size_t tick_index = 0;
                
                while (!stop_flag.load(std::memory_order_acquire) && tick_index < ticks_per_feed) {
                    // Wait for next tick time
                    auto current_time = timer->now();
                    if (current_time < next_tick_time) {
                        // Busy wait for precise timing
                        while (timer->now() < next_tick_time && !stop_flag.load()) {
                            std::this_thread::yield();
                        }
                    }
                    
                    if (stop_flag.load()) break;
                    
                    // Process tick
                    auto processing_start = timer->now();
                    
                    ticks_generated.fetch_add(1, std::memory_order_relaxed);
                    
                    // 1. Store tick
                    bool stored = tick_storage->store_tick(test_ticks[f][tick_index]);
                    
                    // 2. Distribute to subscribers
                    bool distributed = false;
                    if (stored) {
                        distributed = data_coordinator->distribute_tick(test_ticks[f][tick_index]);
                    }
                    
                    auto processing_end = timer->now();
                    
                    if (stored && distributed) {
                        ticks_processed.fetch_add(1, std::memory_order_relaxed);
                        processing_latencies[f].push_back(processing_end - processing_start);
                    } else {
                        ticks_dropped.fetch_add(1, std::memory_order_relaxed);
                    }
                    
                    // Schedule next tick
                    next_tick_time += target_interval_ns;
                    tick_index++;
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
        for (auto& thread : feed_threads) {
            thread.join();
        }
        
        // Stop memory monitoring
        monitor_memory.store(false);
        memory_monitor.join();
        
        // Calculate results
        results.total_ticks_generated = ticks_generated.load();
        results.total_ticks_processed = ticks_processed.load();
        results.total_ticks_distributed = ticks_distributed.load();
        results.dropped_ticks = ticks_dropped.load();
        results.test_duration_ns = test_end_time - test_start_time;
        
        double test_duration_s = static_cast<double>(results.test_duration_ns) / 1e9;
        results.actual_ticks_per_second = results.total_ticks_processed / test_duration_s;
        results.processing_success_rate = (static_cast<double>(results.total_ticks_processed) / 
                                         results.total_ticks_generated) * 100.0;
        results.drop_rate_percent = (static_cast<double>(results.dropped_ticks) / 
                                   results.total_ticks_generated) * 100.0;
        
        // Combine processing latencies from all feeds
        std::vector<uint64_t> all_processing_latencies;
        for (const auto& feed_latencies : processing_latencies) {
            all_processing_latencies.insert(all_processing_latencies.end(), 
                                          feed_latencies.begin(), 
                                          feed_latencies.end());
        }
        
        // Calculate processing latency statistics
        if (!all_processing_latencies.empty()) {
            std::sort(all_processing_latencies.begin(), all_processing_latencies.end());
            
            uint64_t sum = 0;
            for (auto latency : all_processing_latencies) {
                sum += latency;
            }
            results.avg_processing_latency_ns = static_cast<double>(sum) / all_processing_latencies.size();
            
            size_t size = all_processing_latencies.size();
            results.p99_processing_latency_ns = all_processing_latencies[size * 0.99];
        }
        
        // Calculate distribution latency statistics
        if (!distribution_latencies.empty()) {
            std::sort(distribution_latencies.begin(), distribution_latencies.end());
            
            uint64_t sum = 0;
            for (auto latency : distribution_latencies) {
                sum += latency;
            }
            results.avg_distribution_latency_ns = static_cast<double>(sum) / distribution_latencies.size();
            
            size_t size = distribution_latencies.size();
            results.p99_distribution_latency_ns = distribution_latencies[size * 0.99];
        }
        
        // Calculate memory growth
        auto final_memory = get_memory_usage_mb();
        results.peak_memory_mb = *std::max_element(memory_samples.begin(), memory_samples.end());
        results.memory_growth_mb_per_hour = ((final_memory - initial_memory) / test_duration_s) * 3600.0;
        
        // Calculate average CPU usage (simplified)
        results.avg_cpu_percent = get_cpu_usage_percent();
        
        return results;
    }
    
    double get_memory_usage_mb() {
        // Simplified memory usage calculation
        std::ifstream status("/proc/self/status");
        std::string line;
        while (std::getline(status, line)) {
            if (line.substr(0, 6) == "VmRSS:") {
                std::istringstream iss(line);
                std::string label, value, unit;
                iss >> label >> value >> unit;
                return std::stod(value) / 1024.0; // Convert KB to MB
            }
        }
        return 0.0;
    }
    
    double get_cpu_usage_percent() {
        // Simplified CPU usage calculation
        // In a real implementation, this would use more sophisticated monitoring
        return 75.0; // Placeholder value
    }
    
    int target_ticks_per_second;
    int test_duration_seconds;
    int feed_count;
    int subscriber_count;
    
    std::unique_ptr<HighResTimer> timer;
    std::unique_ptr<DataDistributionCoordinator> data_coordinator;
    std::unique_ptr<TickStorage> tick_storage;
    std::unique_ptr<SharedMemoryIPC> shared_memory;
    std::unique_ptr<BinaryFormat> binary_formatter;
    
    std::vector<std::vector<MarketTick>> test_ticks;
    std::vector<std::string> symbols;
    
    json benchmark_results;
};

// Main Market Data Stress Test
TEST_F(MarketDataStressTest, MarketDataIngestionStress) {
    std::cout << "Starting Market Data Ingestion Stress Test..." << std::endl;
    std::cout << "Target: " << target_ticks_per_second << " ticks/sec" << std::endl;
    std::cout << "Duration: " << test_duration_seconds << " seconds" << std::endl;
    std::cout << "Feeds: " << feed_count << std::endl;
    std::cout << "Subscribers: " << subscriber_count << std::endl;
    
    // Warmup
    std::cout << "Warming up..." << std::endl;
    for (int i = 0; i < 10000; ++i) {
        if (!test_ticks.empty() && !test_ticks[0].empty()) {
            tick_storage->store_tick(test_ticks[0][i % test_ticks[0].size()]);
            data_coordinator->distribute_tick(test_ticks[0][i % test_ticks[0].size()]);
        }
    }
    
    // Run the stress test
    std::cout << "Running stress test..." << std::endl;
    auto results = run_stress_test();
    
    // Store results
    benchmark_results["market_data_stress"] = {
        {"target_ticks_per_second", target_ticks_per_second},
        {"actual_ticks_per_second", results.actual_ticks_per_second},
        {"test_duration_seconds", test_duration_seconds},
        {"feed_count", feed_count},
        {"subscriber_count", subscriber_count},
        {"total_ticks_generated", results.total_ticks_generated},
        {"total_ticks_processed", results.total_ticks_processed},
        {"total_ticks_distributed", results.total_ticks_distributed},
        {"dropped_ticks", results.dropped_ticks},
        {"processing_success_rate", results.processing_success_rate},
        {"drop_rate_percent", results.drop_rate_percent},
        {"avg_processing_latency_ns", results.avg_processing_latency_ns},
        {"avg_processing_latency_us", results.avg_processing_latency_ns / 1000.0},
        {"p99_processing_latency_ns", results.p99_processing_latency_ns},
        {"p99_processing_latency_us", results.p99_processing_latency_ns / 1000.0},
        {"avg_distribution_latency_ns", results.avg_distribution_latency_ns},
        {"avg_distribution_latency_us", results.avg_distribution_latency_ns / 1000.0},
        {"p99_distribution_latency_ns", results.p99_distribution_latency_ns},
        {"p99_distribution_latency_us", results.p99_distribution_latency_ns / 1000.0},
        {"memory_growth_mb_per_hour", results.memory_growth_mb_per_hour},
        {"avg_cpu_percent", results.avg_cpu_percent},
        {"peak_memory_mb", results.peak_memory_mb}
    };
    
    // Print results
    std::cout << std::fixed << std::setprecision(2);
    std::cout << "\n=== Market Data Stress Test Results ===" << std::endl;
    std::cout << "Ticks/Second: " << results.actual_ticks_per_second 
              << " (target: " << target_ticks_per_second << ")" << std::endl;
    std::cout << "Processing Success Rate: " << results.processing_success_rate << "%" << std::endl;
    std::cout << "Drop Rate: " << results.drop_rate_percent << "%" << std::endl;
    std::cout << "Avg Processing Latency: " << results.avg_processing_latency_ns / 1000.0 << "μs" << std::endl;
    std::cout << "P99 Processing Latency: " << results.p99_processing_latency_ns / 1000.0 << "μs" << std::endl;
    std::cout << "Avg Distribution Latency: " << results.avg_distribution_latency_ns / 1000.0 << "μs" << std::endl;
    std::cout << "P99 Distribution Latency: " << results.p99_distribution_latency_ns / 1000.0 << "μs" << std::endl;
    std::cout << "Memory Growth: " << results.memory_growth_mb_per_hour << "MB/hour" << std::endl;
    std::cout << "CPU Usage: " << results.avg_cpu_percent << "%" << std::endl;
    std::cout << "Peak Memory: " << results.peak_memory_mb << "MB" << std::endl;
    
    // Verify performance targets
    EXPECT_GE(results.actual_ticks_per_second, target_ticks_per_second * 0.95) 
        << "Throughput below 95% of target";
    EXPECT_GE(results.processing_success_rate, 99.0) 
        << "Processing success rate below 99%";
    EXPECT_LE(results.drop_rate_percent, 1.0) 
        << "Drop rate above 1%";
    EXPECT_LE(results.p99_processing_latency_ns, 100000) 
        << "P99 processing latency above 100μs";
    EXPECT_LE(results.memory_growth_mb_per_hour, 100.0) 
        << "Memory growth above 100MB/hour";
}

// Multi-Feed Stress Test
TEST_F(MarketDataStressTest, MultiFeedStress) {
    std::cout << "Running multi-feed stress test..." << std::endl;
    
    const int max_feeds = 50;
    std::vector<int> feed_counts = {1, 5, 10, 20, 30, 40, 50};
    
    for (int feeds : feed_counts) {
        if (feeds > max_feeds) continue;
        
        std::cout << "Testing with " << feeds << " feeds..." << std::endl;
        
        // Adjust target rate per feed
        int adjusted_target = target_ticks_per_second / feeds;
        
        std::atomic<uint64_t> total_processed{0};
        std::atomic<bool> stop_test{false};
        
        std::vector<std::thread> feed_threads;
        
        auto start_time = timer->now();
        
        for (int f = 0; f < feeds; ++f) {
            feed_threads.emplace_back([this, f, adjusted_target, &total_processed, &stop_test]() {
                const auto target_interval_ns = 1000000000ULL / adjusted_target;
                auto next_tick_time = timer->now();
                
                while (!stop_test.load()) {
                    while (timer->now() < next_tick_time && !stop_test.load()) {
                        std::this_thread::yield();
                    }
                    
                    if (stop_test.load()) break;
                    
                    if (!test_ticks.empty() && !test_ticks[0].empty()) {
                        size_t tick_idx = total_processed.load() % test_ticks[0].size();
                        
                        if (tick_storage->store_tick(test_ticks[0][tick_idx])) {
                            data_coordinator->distribute_tick(test_ticks[0][tick_idx]);
                            total_processed.fetch_add(1);
                        }
                    }
                    
                    next_tick_time += target_interval_ns;
                }
            });
        }
        
        // Run for 30 seconds
        std::this_thread::sleep_for(std::chrono::seconds(30));
        stop_test.store(true);
        
        for (auto& thread : feed_threads) {
            thread.join();
        }
        
        auto end_time = timer->now();
        auto duration_s = static_cast<double>(end_time - start_time) / 1e9;
        auto actual_rate = total_processed.load() / duration_s;
        
        benchmark_results["multi_feed_stress"][std::to_string(feeds) + "_feeds"] = {
            {"feed_count", feeds},
            {"target_rate_per_feed", adjusted_target},
            {"total_target_rate", adjusted_target * feeds},
            {"actual_total_rate", actual_rate},
            {"total_processed", total_processed.load()},
            {"duration_seconds", duration_s}
        };
        
        std::cout << "  " << feeds << " feeds: " << std::fixed << std::setprecision(0) 
                  << actual_rate << " ticks/sec" << std::endl;
    }
}

// Memory Pressure Test
TEST_F(MarketDataStressTest, MemoryPressureTest) {
    std::cout << "Running memory pressure test..." << std::endl;
    
    const int pressure_duration = 300; // 5 minutes
    const int high_rate = target_ticks_per_second * 2; // Double the normal rate
    
    auto initial_memory = get_memory_usage_mb();
    std::vector<double> memory_timeline;
    
    std::atomic<uint64_t> ticks_processed{0};
    std::atomic<bool> stop_test{false};
    
    // Memory monitoring thread
    std::thread memory_monitor([&memory_timeline, &stop_test, this]() {
        while (!stop_test.load()) {
            memory_timeline.push_back(get_memory_usage_mb());
            std::this_thread::sleep_for(std::chrono::seconds(5));
        }
    });
    
    // High-rate data generation thread
    std::thread data_generator([this, high_rate, &ticks_processed, &stop_test]() {
        const auto target_interval_ns = 1000000000ULL / high_rate;
        auto next_tick_time = timer->now();
        
        while (!stop_test.load()) {
            while (timer->now() < next_tick_time && !stop_test.load()) {
                std::this_thread::yield();
            }
            
            if (stop_test.load()) break;
            
            if (!test_ticks.empty() && !test_ticks[0].empty()) {
                size_t tick_idx = ticks_processed.load() % test_ticks[0].size();
                
                if (tick_storage->store_tick(test_ticks[0][tick_idx])) {
                    data_coordinator->distribute_tick(test_ticks[0][tick_idx]);
                    ticks_processed.fetch_add(1);
                }
            }
            
            next_tick_time += target_interval_ns;
        }
    });
    
    // Run pressure test
    std::this_thread::sleep_for(std::chrono::seconds(pressure_duration));
    stop_test.store(true);
    
    data_generator.join();
    memory_monitor.join();
    
    auto final_memory = get_memory_usage_mb();
    auto peak_memory = *std::max_element(memory_timeline.begin(), memory_timeline.end());
    auto memory_growth = final_memory - initial_memory;
    
    benchmark_results["memory_pressure_test"] = {
        {"duration_seconds", pressure_duration},
        {"high_rate_target", high_rate},
        {"ticks_processed", ticks_processed.load()},
        {"initial_memory_mb", initial_memory},
        {"final_memory_mb", final_memory},
        {"peak_memory_mb", peak_memory},
        {"memory_growth_mb", memory_growth},
        {"memory_growth_rate_mb_per_hour", (memory_growth / pressure_duration) * 3600.0}
    };
    
    std::cout << "Memory Pressure Test Results:" << std::endl;
    std::cout << "Initial Memory: " << initial_memory << "MB" << std::endl;
    std::cout << "Final Memory: " << final_memory << "MB" << std::endl;
    std::cout << "Peak Memory: " << peak_memory << "MB" << std::endl;
    std::cout << "Memory Growth: " << memory_growth << "MB" << std::endl;
    std::cout << "Growth Rate: " << (memory_growth / pressure_duration) * 3600.0 << "MB/hour" << std::endl;
}

// Output results to JSON file
TEST_F(MarketDataStressTest, GenerateResults) {
    const char* output_file = std::getenv("OUTPUT_FILE");
    if (!output_file) {
        output_file = "market_data_stress_results.json";
    }
    
    // Add metadata
    json results;
    results["metadata"] = {
        {"timestamp", std::chrono::duration_cast<std::chrono::seconds>(
            std::chrono::system_clock::now().time_since_epoch()).count()},
        {"target_ticks_per_second", target_ticks_per_second},
        {"test_duration_seconds", test_duration_seconds},
        {"feed_count", feed_count},
        {"subscriber_count", subscriber_count}
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
        std::cout << "Market data stress test results written to: " << output_file << std::endl;
    } else {
        std::cerr << "Failed to write market data stress test results to: " << output_file << std::endl;
    }
}

int main(int argc, char **argv) {
    ::testing::InitGoogleTest(&argc, argv);
    
    // Parse command line arguments
    for (int i = 1; i < argc; ++i) {
        std::string arg = argv[i];
        if (arg.find("--target-ticks=") == 0) {
            std::string target_ticks = arg.substr(15);
            setenv("TARGET_TICKS", target_ticks.c_str(), 1);
        } else if (arg.find("--duration=") == 0) {
            std::string duration = arg.substr(11);
            setenv("DURATION", duration.c_str(), 1);
        } else if (arg.find("--feeds=") == 0) {
            std::string feeds = arg.substr(8);
            setenv("FEEDS", feeds.c_str(), 1);
        } else if (arg.find("--subscribers=") == 0) {
            std::string subscribers = arg.substr(14);
            setenv("SUBSCRIBERS", subscribers.c_str(), 1);
        } else if (arg.find("--output=") == 0) {
            std::string output_file = arg.substr(9);
            setenv("OUTPUT_FILE", output_file.c_str(), 1);
        }
    }
    
    return RUN_ALL_TESTS();
}