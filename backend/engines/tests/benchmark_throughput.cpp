#include <gtest/gtest.h>
#include <chrono>
#include <vector>
#include <thread>
#include <atomic>
#include <random>
#include <fstream>
#include <iomanip>

// Include engine headers
#include "high_res_timer.hpp"
#include "lock_free_order_book.hpp"
#include "data_distribution_coordinator.hpp"
#include "tick_storage.hpp"
#include "simd_indicators.hpp"

// JSON output for results
#include <nlohmann/json.hpp>
using json = nlohmann::json;

class ThroughputBenchmark : public ::testing::Test {
protected:
    void SetUp() override {
        // Initialize components
        timer = std::make_unique<HighResTimer>();
        order_book = std::make_unique<LockFreeOrderBook<double, 100000>>();
        data_coordinator = std::make_unique<DataDistributionCoordinator>();
        tick_storage = std::make_unique<TickStorage>();
        
        // Prepare test data
        prepare_test_data();
    }
    
    void TearDown() override {
        timer.reset();
        order_book.reset();
        data_coordinator.reset();
        tick_storage.reset();
    }
    
    void prepare_test_data() {
        // Generate market data ticks
        std::random_device rd;
        std::mt19937 gen(rd());
        std::uniform_real_distribution<double> price_dist(100.0, 200.0);
        std::uniform_int_distribution<uint64_t> volume_dist(100, 10000);
        
        test_ticks.reserve(BENCHMARK_ITERATIONS);
        for (int i = 0; i < BENCHMARK_ITERATIONS; ++i) {
            MarketTick tick;
            tick.symbol = "AAPL";
            tick.price = price_dist(gen);
            tick.volume = volume_dist(gen);
            tick.timestamp = std::chrono::high_resolution_clock::now().time_since_epoch().count();
            test_ticks.push_back(tick);
        }
        
        // Generate orders for order book throughput
        test_orders.reserve(BENCHMARK_ITERATIONS);
        for (int i = 0; i < BENCHMARK_ITERATIONS; ++i) {
            Order order;
            order.id = i + 1;
            order.price = price_dist(gen);
            order.quantity = volume_dist(gen) / 100;
            order.side = (i % 2 == 0) ? OrderSide::BUY : OrderSide::SELL;
            order.status = OrderStatus::PENDING;
            test_orders.push_back(order);
        }
        
        // Generate price data for SIMD calculations
        test_prices.reserve(BENCHMARK_ITERATIONS);
        for (int i = 0; i < BENCHMARK_ITERATIONS; ++i) {
            test_prices.push_back(static_cast<float>(price_dist(gen)));
        }
    }
    
    static constexpr int BENCHMARK_ITERATIONS = 10000000;  // 10M operations
    static constexpr int WARMUP_ITERATIONS = 100000;      // 100K warmup
    static constexpr int THREAD_COUNT = 8;                // Multi-threaded tests
    
    std::unique_ptr<HighResTimer> timer;
    std::unique_ptr<LockFreeOrderBook<double, 100000>> order_book;
    std::unique_ptr<DataDistributionCoordinator> data_coordinator;
    std::unique_ptr<TickStorage> tick_storage;
    
    std::vector<MarketTick> test_ticks;
    std::vector<Order> test_orders;
    std::vector<float> test_prices;
    
    json benchmark_results;
};

// Benchmark: Market Data Processing Throughput
TEST_F(ThroughputBenchmark, MarketDataThroughput) {
    // Warmup
    for (int i = 0; i < WARMUP_ITERATIONS; ++i) {
        tick_storage->store_tick(test_ticks[i % test_ticks.size()]);
    }
    
    // Single-threaded throughput test
    auto start_time = timer->now();
    
    for (int i = 0; i < BENCHMARK_ITERATIONS; ++i) {
        tick_storage->store_tick(test_ticks[i % test_ticks.size()]);
    }
    
    auto end_time = timer->now();
    auto duration_ns = end_time - start_time;
    auto duration_s = static_cast<double>(duration_ns) / 1e9;
    auto ops_per_second = BENCHMARK_ITERATIONS / duration_s;
    
    // Store results
    benchmark_results["market_data"]["single_threaded"] = {
        {"operations", BENCHMARK_ITERATIONS},
        {"duration_ns", duration_ns},
        {"duration_s", duration_s},
        {"operations_per_second", ops_per_second}
    };
    
    // Multi-threaded throughput test
    std::atomic<int> completed_operations{0};
    std::vector<std::thread> threads;
    
    auto mt_start_time = timer->now();
    
    for (int t = 0; t < THREAD_COUNT; ++t) {
        threads.emplace_back([this, &completed_operations, t]() {
            int ops_per_thread = BENCHMARK_ITERATIONS / THREAD_COUNT;
            int start_idx = t * ops_per_thread;
            
            for (int i = 0; i < ops_per_thread; ++i) {
                tick_storage->store_tick(test_ticks[(start_idx + i) % test_ticks.size()]);
                completed_operations.fetch_add(1, std::memory_order_relaxed);
            }
        });
    }
    
    for (auto& thread : threads) {
        thread.join();
    }
    
    auto mt_end_time = timer->now();
    auto mt_duration_ns = mt_end_time - mt_start_time;
    auto mt_duration_s = static_cast<double>(mt_duration_ns) / 1e9;
    auto mt_ops_per_second = completed_operations.load() / mt_duration_s;
    
    // Store multi-threaded results
    benchmark_results["market_data"]["multi_threaded"] = {
        {"operations", completed_operations.load()},
        {"threads", THREAD_COUNT},
        {"duration_ns", mt_duration_ns},
        {"duration_s", mt_duration_s},
        {"operations_per_second", mt_ops_per_second}
    };
    
    // Overall market data results
    benchmark_results["market_data"]["operations_per_second"] = mt_ops_per_second;
    
    // Verify throughput targets (> 1M ops/sec)
    EXPECT_GT(mt_ops_per_second, 1000000) << "Market data throughput below 1M ops/sec: " << mt_ops_per_second;
    
    std::cout << "Market Data Single-threaded: " << std::fixed << std::setprecision(0) << ops_per_second << " ops/sec" << std::endl;
    std::cout << "Market Data Multi-threaded: " << std::fixed << std::setprecision(0) << mt_ops_per_second << " ops/sec" << std::endl;
}

// Benchmark: Order Book Throughput
TEST_F(ThroughputBenchmark, OrderBookThroughput) {
    // Warmup
    for (int i = 0; i < WARMUP_ITERATIONS; ++i) {
        order_book->add_order(&test_orders[i % test_orders.size()]);
    }
    
    // Single-threaded order processing
    auto start_time = timer->now();
    
    for (int i = 0; i < BENCHMARK_ITERATIONS; ++i) {
        order_book->add_order(&test_orders[i % test_orders.size()]);
    }
    
    auto end_time = timer->now();
    auto duration_ns = end_time - start_time;
    auto duration_s = static_cast<double>(duration_ns) / 1e9;
    auto ops_per_second = BENCHMARK_ITERATIONS / duration_s;
    
    // Store results
    benchmark_results["order_book"]["single_threaded"] = {
        {"operations", BENCHMARK_ITERATIONS},
        {"duration_ns", duration_ns},
        {"duration_s", duration_s},
        {"operations_per_second", ops_per_second}
    };
    
    // Multi-threaded order processing
    std::atomic<int> completed_orders{0};
    std::vector<std::thread> threads;
    
    auto mt_start_time = timer->now();
    
    for (int t = 0; t < THREAD_COUNT; ++t) {
        threads.emplace_back([this, &completed_orders, t]() {
            int orders_per_thread = BENCHMARK_ITERATIONS / THREAD_COUNT;
            int start_idx = t * orders_per_thread;
            
            for (int i = 0; i < orders_per_thread; ++i) {
                if (order_book->add_order(&test_orders[(start_idx + i) % test_orders.size()])) {
                    completed_orders.fetch_add(1, std::memory_order_relaxed);
                }
            }
        });
    }
    
    for (auto& thread : threads) {
        thread.join();
    }
    
    auto mt_end_time = timer->now();
    auto mt_duration_ns = mt_end_time - mt_start_time;
    auto mt_duration_s = static_cast<double>(mt_duration_ns) / 1e9;
    auto mt_ops_per_second = completed_orders.load() / mt_duration_s;
    
    // Store multi-threaded results
    benchmark_results["order_book"]["multi_threaded"] = {
        {"operations", completed_orders.load()},
        {"threads", THREAD_COUNT},
        {"duration_ns", mt_duration_ns},
        {"duration_s", mt_duration_s},
        {"operations_per_second", mt_ops_per_second}
    };
    
    // Verify throughput targets (> 100K orders/sec)
    EXPECT_GT(mt_ops_per_second, 100000) << "Order book throughput below 100K ops/sec: " << mt_ops_per_second;
    
    std::cout << "Order Book Single-threaded: " << std::fixed << std::setprecision(0) << ops_per_second << " ops/sec" << std::endl;
    std::cout << "Order Book Multi-threaded: " << std::fixed << std::setprecision(0) << mt_ops_per_second << " ops/sec" << std::endl;
}

// Benchmark: SIMD Indicator Calculations
TEST_F(ThroughputBenchmark, SIMDIndicatorThroughput) {
    const int CALCULATION_ITERATIONS = 1000000;
    const int WINDOW_SIZE = 20;
    
    std::vector<float> sma_results(CALCULATION_ITERATIONS);
    std::vector<float> ema_results(CALCULATION_ITERATIONS);
    
    // Warmup
    for (int i = 0; i < 10000; ++i) {
        SIMDIndicators::calculate_sma(test_prices.data(), sma_results.data(), 
                                     std::min(i + WINDOW_SIZE, static_cast<int>(test_prices.size())), WINDOW_SIZE);
    }
    
    // Benchmark SMA calculations
    auto sma_start = timer->now();
    
    for (int i = 0; i < CALCULATION_ITERATIONS; ++i) {
        int data_size = std::min(i + WINDOW_SIZE, static_cast<int>(test_prices.size()));
        SIMDIndicators::calculate_sma(test_prices.data(), sma_results.data(), data_size, WINDOW_SIZE);
    }
    
    auto sma_end = timer->now();
    auto sma_duration_ns = sma_end - sma_start;
    auto sma_duration_s = static_cast<double>(sma_duration_ns) / 1e9;
    auto sma_ops_per_second = CALCULATION_ITERATIONS / sma_duration_s;
    
    // Benchmark EMA calculations
    auto ema_start = timer->now();
    
    for (int i = 0; i < CALCULATION_ITERATIONS; ++i) {
        int data_size = std::min(i + WINDOW_SIZE, static_cast<int>(test_prices.size()));
        SIMDIndicators::calculate_ema(test_prices.data(), ema_results.data(), data_size, WINDOW_SIZE);
    }
    
    auto ema_end = timer->now();
    auto ema_duration_ns = ema_end - ema_start;
    auto ema_duration_s = static_cast<double>(ema_duration_ns) / 1e9;
    auto ema_ops_per_second = CALCULATION_ITERATIONS / ema_duration_s;
    
    // Store results
    benchmark_results["simd_indicators"]["sma"] = {
        {"operations", CALCULATION_ITERATIONS},
        {"duration_ns", sma_duration_ns},
        {"duration_s", sma_duration_s},
        {"operations_per_second", sma_ops_per_second}
    };
    
    benchmark_results["simd_indicators"]["ema"] = {
        {"operations", CALCULATION_ITERATIONS},
        {"duration_ns", ema_duration_ns},
        {"duration_s", ema_duration_s},
        {"operations_per_second", ema_ops_per_second}
    };
    
    std::cout << "SIMD SMA Calculations: " << std::fixed << std::setprecision(0) << sma_ops_per_second << " ops/sec" << std::endl;
    std::cout << "SIMD EMA Calculations: " << std::fixed << std::setprecision(0) << ema_ops_per_second << " ops/sec" << std::endl;
}

// Benchmark: Data Distribution Throughput
TEST_F(ThroughputBenchmark, DataDistributionThroughput) {
    // Setup subscribers
    std::atomic<int> messages_received{0};
    
    auto subscriber = [&messages_received](const MarketTick& tick) {
        messages_received.fetch_add(1, std::memory_order_relaxed);
    };
    
    data_coordinator->subscribe("AAPL", subscriber);
    
    // Warmup
    for (int i = 0; i < WARMUP_ITERATIONS; ++i) {
        data_coordinator->distribute_tick(test_ticks[i % test_ticks.size()]);
    }
    
    // Reset counter
    messages_received.store(0);
    
    // Benchmark data distribution
    auto start_time = timer->now();
    
    for (int i = 0; i < BENCHMARK_ITERATIONS; ++i) {
        data_coordinator->distribute_tick(test_ticks[i % test_ticks.size()]);
    }
    
    // Wait for all messages to be processed
    std::this_thread::sleep_for(std::chrono::milliseconds(100));
    
    auto end_time = timer->now();
    auto duration_ns = end_time - start_time;
    auto duration_s = static_cast<double>(duration_ns) / 1e9;
    auto ops_per_second = messages_received.load() / duration_s;
    
    // Store results
    benchmark_results["data_distribution"] = {
        {"operations", messages_received.load()},
        {"duration_ns", duration_ns},
        {"duration_s", duration_s},
        {"operations_per_second", ops_per_second}
    };
    
    std::cout << "Data Distribution: " << std::fixed << std::setprecision(0) << ops_per_second << " ops/sec" << std::endl;
}

// Benchmark: Memory Bandwidth
TEST_F(ThroughputBenchmark, MemoryBandwidthThroughput) {
    const size_t BUFFER_SIZE = 1024 * 1024 * 64; // 64MB
    const int COPY_ITERATIONS = 1000;
    
    std::vector<char> source_buffer(BUFFER_SIZE);
    std::vector<char> dest_buffer(BUFFER_SIZE);
    
    // Fill source buffer with test data
    std::random_device rd;
    std::mt19937 gen(rd());
    std::uniform_int_distribution<char> char_dist(0, 255);
    
    for (size_t i = 0; i < BUFFER_SIZE; ++i) {
        source_buffer[i] = char_dist(gen);
    }
    
    // Benchmark memory copy operations
    auto start_time = timer->now();
    
    for (int i = 0; i < COPY_ITERATIONS; ++i) {
        std::memcpy(dest_buffer.data(), source_buffer.data(), BUFFER_SIZE);
    }
    
    auto end_time = timer->now();
    auto duration_ns = end_time - start_time;
    auto duration_s = static_cast<double>(duration_ns) / 1e9;
    auto bytes_copied = static_cast<double>(BUFFER_SIZE) * COPY_ITERATIONS;
    auto bandwidth_gbps = (bytes_copied / duration_s) / (1024 * 1024 * 1024);
    
    // Store results
    benchmark_results["memory_bandwidth"] = {
        {"buffer_size_mb", BUFFER_SIZE / (1024 * 1024)},
        {"iterations", COPY_ITERATIONS},
        {"duration_ns", duration_ns},
        {"duration_s", duration_s},
        {"bytes_copied", bytes_copied},
        {"bandwidth_gbps", bandwidth_gbps}
    };
    
    std::cout << "Memory Bandwidth: " << std::fixed << std::setprecision(2) << bandwidth_gbps << " GB/s" << std::endl;
}

// Test fixture for output generation
class ThroughputOutput : public ::testing::Test {
protected:
    static void SetUpTestSuite() {
        // This runs once before all tests in this suite
    }
    
    static void TearDownTestSuite() {
        // This runs once after all tests in this suite
    }
};

// Output benchmark results to JSON file
TEST_F(ThroughputOutput, GenerateResults) {
    // Get output file from command line or use default
    const char* output_file = std::getenv("BENCHMARK_OUTPUT");
    if (!output_file) {
        output_file = "throughput_results.json";
    }
    
    // Add metadata
    json results;
    results["metadata"] = {
        {"timestamp", std::chrono::duration_cast<std::chrono::seconds>(
            std::chrono::system_clock::now().time_since_epoch()).count()},
        {"iterations", BENCHMARK_ITERATIONS},
        {"warmup_iterations", WARMUP_ITERATIONS},
        {"thread_count", THREAD_COUNT},
        {"compiler", 
#ifdef __GNUC__
            "GCC " + std::to_string(__GNUC__) + "." + std::to_string(__GNUC_MINOR__)
#elif defined(__clang__)
            "Clang " + std::to_string(__clang_major__) + "." + std::to_string(__clang_minor__)
#else
            "Unknown"
#endif
        },
        {"optimization_level",
#ifdef NDEBUG
            "Release"
#else
            "Debug"
#endif
        }
    };
    
    // Write results to file
    std::ofstream file(output_file);
    if (file.is_open()) {
        file << results.dump(2);
        file.close();
        std::cout << "Throughput benchmark results written to: " << output_file << std::endl;
    } else {
        std::cerr << "Failed to write throughput benchmark results to: " << output_file << std::endl;
    }
}

int main(int argc, char **argv) {
    ::testing::InitGoogleTest(&argc, argv);
    
    // Parse command line arguments
    for (int i = 1; i < argc; ++i) {
        std::string arg = argv[i];
        if (arg.find("--output=") == 0) {
            std::string output_file = arg.substr(9);
            setenv("BENCHMARK_OUTPUT", output_file.c_str(), 1);
        }
    }
    
    return RUN_ALL_TESTS();
}