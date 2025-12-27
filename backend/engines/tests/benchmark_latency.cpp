#include <gtest/gtest.h>
#include <chrono>
#include <vector>
#include <algorithm>
#include <fstream>
#include <iomanip>
#include <thread>
#include <atomic>
#include <random>
#include <cstring>

// Include engine headers
#include "high_res_timer.hpp"
#include "lock_free_order_book.hpp"
#include "pre_trade_validator.hpp"
#include "fix_parser.hpp"

// JSON output for results
#include <nlohmann/json.hpp>
using json = nlohmann::json;

class LatencyBenchmark : public ::testing::Test {
protected:
    void SetUp() override {
        // Initialize high-resolution timer
        timer = std::make_unique<HighResTimer>();
        
        // Initialize order book
        order_book = std::make_unique<LockFreeOrderBook<double, 10000>>();
        
        // Initialize risk validator
        risk_validator = std::make_unique<PreTradeValidator>();
        
        // Initialize FIX parser
        fix_parser = std::make_unique<FIXParser>();
        
        // Prepare test data
        prepare_test_data();
    }
    
    void TearDown() override {
        // Cleanup
        timer.reset();
        order_book.reset();
        risk_validator.reset();
        fix_parser.reset();
    }
    
    void prepare_test_data() {
        // Generate test orders
        std::random_device rd;
        std::mt19937 gen(rd());
        std::uniform_real_distribution<double> price_dist(100.0, 200.0);
        std::uniform_int_distribution<uint32_t> qty_dist(100, 10000);
        
        test_orders.reserve(BENCHMARK_ITERATIONS);
        for (int i = 0; i < BENCHMARK_ITERATIONS; ++i) {
            Order order;
            order.id = i + 1;
            order.price = price_dist(gen);
            order.quantity = qty_dist(gen);
            order.side = (i % 2 == 0) ? OrderSide::BUY : OrderSide::SELL;
            order.status = OrderStatus::PENDING;
            test_orders.push_back(order);
        }
        
        // Generate FIX messages
        test_fix_messages.reserve(BENCHMARK_ITERATIONS);
        for (int i = 0; i < BENCHMARK_ITERATIONS; ++i) {
            std::string fix_msg = generate_fix_message(test_orders[i]);
            test_fix_messages.push_back(fix_msg);
        }
    }
    
    std::string generate_fix_message(const Order& order) {
        std::ostringstream oss;
        oss << "8=FIX.4.4|9=100|35=D|49=SENDER|56=TARGET|"
            << "11=" << order.id << "|"
            << "21=1|55=AAPL|54=" << (order.side == OrderSide::BUY ? "1" : "2") << "|"
            << "38=" << order.quantity << "|44=" << std::fixed << std::setprecision(2) << order.price << "|"
            << "40=2|59=0|10=000|";
        return oss.str();
    }
    
    // Calculate percentiles from latency measurements
    struct LatencyStats {
        double min_ns;
        double max_ns;
        double avg_ns;
        double p50_ns;
        double p95_ns;
        double p99_ns;
        double p999_ns;
    };
    
    LatencyStats calculate_stats(std::vector<uint64_t>& latencies) {
        std::sort(latencies.begin(), latencies.end());
        
        LatencyStats stats;
        stats.min_ns = latencies.front();
        stats.max_ns = latencies.back();
        
        uint64_t sum = 0;
        for (auto latency : latencies) {
            sum += latency;
        }
        stats.avg_ns = static_cast<double>(sum) / latencies.size();
        
        size_t size = latencies.size();
        stats.p50_ns = latencies[size * 0.50];
        stats.p95_ns = latencies[size * 0.95];
        stats.p99_ns = latencies[size * 0.99];
        stats.p999_ns = latencies[size * 0.999];
        
        return stats;
    }
    
    static constexpr int BENCHMARK_ITERATIONS = 1000000;
    static constexpr int WARMUP_ITERATIONS = 10000;
    
    std::unique_ptr<HighResTimer> timer;
    std::unique_ptr<LockFreeOrderBook<double, 10000>> order_book;
    std::unique_ptr<PreTradeValidator> risk_validator;
    std::unique_ptr<FIXParser> fix_parser;
    
    std::vector<Order> test_orders;
    std::vector<std::string> test_fix_messages;
    
    json benchmark_results;
};

// Benchmark: Order Book Operations
TEST_F(LatencyBenchmark, OrderBookLatency) {
    std::vector<uint64_t> add_latencies;
    std::vector<uint64_t> cancel_latencies;
    std::vector<uint64_t> match_latencies;
    
    add_latencies.reserve(BENCHMARK_ITERATIONS);
    cancel_latencies.reserve(BENCHMARK_ITERATIONS / 2);
    match_latencies.reserve(BENCHMARK_ITERATIONS / 4);
    
    // Warmup
    for (int i = 0; i < WARMUP_ITERATIONS; ++i) {
        order_book->add_order(&test_orders[i % test_orders.size()]);
    }
    
    // Benchmark order additions
    for (int i = 0; i < BENCHMARK_ITERATIONS; ++i) {
        auto start = timer->now();
        bool result = order_book->add_order(&test_orders[i % test_orders.size()]);
        auto end = timer->now();
        
        if (result) {
            add_latencies.push_back(end - start);
        }
    }
    
    // Benchmark order cancellations
    for (int i = 0; i < BENCHMARK_ITERATIONS / 2; ++i) {
        auto start = timer->now();
        bool result = order_book->cancel_order(test_orders[i].id);
        auto end = timer->now();
        
        cancel_latencies.push_back(end - start);
    }
    
    // Calculate statistics
    auto add_stats = calculate_stats(add_latencies);
    auto cancel_stats = calculate_stats(cancel_latencies);
    
    // Store results
    benchmark_results["order_book"]["add_order"] = {
        {"min_ns", add_stats.min_ns},
        {"max_ns", add_stats.max_ns},
        {"avg_ns", add_stats.avg_ns},
        {"p50_ns", add_stats.p50_ns},
        {"p95_ns", add_stats.p95_ns},
        {"p99_ns", add_stats.p99_ns},
        {"p999_ns", add_stats.p999_ns}
    };
    
    benchmark_results["order_book"]["cancel_order"] = {
        {"min_ns", cancel_stats.min_ns},
        {"max_ns", cancel_stats.max_ns},
        {"avg_ns", cancel_stats.avg_ns},
        {"p50_ns", cancel_stats.p50_ns},
        {"p95_ns", cancel_stats.p95_ns},
        {"p99_ns", cancel_stats.p99_ns},
        {"p999_ns", cancel_stats.p999_ns}
    };
    
    // Verify latency targets (< 10μs for P99)
    EXPECT_LT(add_stats.p99_ns, 10000) << "Order add P99 latency exceeds 10μs: " << add_stats.p99_ns << "ns";
    EXPECT_LT(cancel_stats.p99_ns, 10000) << "Order cancel P99 latency exceeds 10μs: " << cancel_stats.p99_ns << "ns";
    
    std::cout << "Order Book Add P99: " << add_stats.p99_ns / 1000.0 << "μs" << std::endl;
    std::cout << "Order Book Cancel P99: " << cancel_stats.p99_ns / 1000.0 << "μs" << std::endl;
}

// Benchmark: Risk Validation
TEST_F(LatencyBenchmark, RiskValidationLatency) {
    std::vector<uint64_t> validation_latencies;
    validation_latencies.reserve(BENCHMARK_ITERATIONS);
    
    // Warmup
    for (int i = 0; i < WARMUP_ITERATIONS; ++i) {
        risk_validator->validate_order("user-123", test_orders[i % test_orders.size()]);
    }
    
    // Benchmark risk validation
    for (int i = 0; i < BENCHMARK_ITERATIONS; ++i) {
        auto start = timer->now();
        bool result = risk_validator->validate_order("user-123", test_orders[i % test_orders.size()]);
        auto end = timer->now();
        
        validation_latencies.push_back(end - start);
    }
    
    // Calculate statistics
    auto stats = calculate_stats(validation_latencies);
    
    // Store results
    benchmark_results["risk_validation"] = {
        {"min_ns", stats.min_ns},
        {"max_ns", stats.max_ns},
        {"avg_ns", stats.avg_ns},
        {"p50_ns", stats.p50_ns},
        {"p95_ns", stats.p95_ns},
        {"p99_ns", stats.p99_ns},
        {"p999_ns", stats.p999_ns}
    };
    
    // Verify latency targets (< 2μs for P99)
    EXPECT_LT(stats.p99_ns, 2000) << "Risk validation P99 latency exceeds 2μs: " << stats.p99_ns << "ns";
    
    std::cout << "Risk Validation P99: " << stats.p99_ns / 1000.0 << "μs" << std::endl;
}

// Benchmark: FIX Message Parsing
TEST_F(LatencyBenchmark, FIXParsingLatency) {
    std::vector<uint64_t> parsing_latencies;
    parsing_latencies.reserve(BENCHMARK_ITERATIONS);
    
    // Warmup
    for (int i = 0; i < WARMUP_ITERATIONS; ++i) {
        fix_parser->parse_message(test_fix_messages[i % test_fix_messages.size()]);
    }
    
    // Benchmark FIX parsing
    for (int i = 0; i < BENCHMARK_ITERATIONS; ++i) {
        auto start = timer->now();
        auto result = fix_parser->parse_message(test_fix_messages[i % test_fix_messages.size()]);
        auto end = timer->now();
        
        parsing_latencies.push_back(end - start);
    }
    
    // Calculate statistics
    auto stats = calculate_stats(parsing_latencies);
    
    // Store results
    benchmark_results["fix_parsing"] = {
        {"min_ns", stats.min_ns},
        {"max_ns", stats.max_ns},
        {"avg_ns", stats.avg_ns},
        {"p50_ns", stats.p50_ns},
        {"p95_ns", stats.p95_ns},
        {"p99_ns", stats.p99_ns},
        {"p999_ns", stats.p999_ns}
    };
    
    // Verify latency targets (< 5μs for P99)
    EXPECT_LT(stats.p99_ns, 5000) << "FIX parsing P99 latency exceeds 5μs: " << stats.p99_ns << "ns";
    
    std::cout << "FIX Parsing P99: " << stats.p99_ns / 1000.0 << "μs" << std::endl;
}

// Benchmark: End-to-End Trading Pipeline
TEST_F(LatencyBenchmark, TradingPipelineLatency) {
    std::vector<uint64_t> pipeline_latencies;
    pipeline_latencies.reserve(BENCHMARK_ITERATIONS);
    
    // Warmup
    for (int i = 0; i < WARMUP_ITERATIONS; ++i) {
        // Simulate full trading pipeline
        auto parsed_order = fix_parser->parse_message(test_fix_messages[i % test_fix_messages.size()]);
        risk_validator->validate_order("user-123", test_orders[i % test_orders.size()]);
        order_book->add_order(&test_orders[i % test_orders.size()]);
    }
    
    // Benchmark full pipeline
    for (int i = 0; i < BENCHMARK_ITERATIONS; ++i) {
        auto start = timer->now();
        
        // 1. Parse FIX message
        auto parsed_order = fix_parser->parse_message(test_fix_messages[i % test_fix_messages.size()]);
        
        // 2. Validate risk
        bool risk_ok = risk_validator->validate_order("user-123", test_orders[i % test_orders.size()]);
        
        // 3. Add to order book
        if (risk_ok) {
            order_book->add_order(&test_orders[i % test_orders.size()]);
        }
        
        auto end = timer->now();
        pipeline_latencies.push_back(end - start);
    }
    
    // Calculate statistics
    auto stats = calculate_stats(pipeline_latencies);
    
    // Store results
    benchmark_results["trading_engine"] = {
        {"min_ns", stats.min_ns},
        {"max_ns", stats.max_ns},
        {"avg_ns", stats.avg_ns},
        {"average_latency_ns", stats.avg_ns},
        {"p50_ns", stats.p50_ns},
        {"p95_ns", stats.p95_ns},
        {"p99_ns", stats.p99_ns},
        {"p99_latency_ns", stats.p99_ns},
        {"p999_ns", stats.p999_ns}
    };
    
    // Verify latency targets (< 10μs for P99)
    EXPECT_LT(stats.p99_ns, 10000) << "Trading pipeline P99 latency exceeds 10μs: " << stats.p99_ns << "ns";
    
    std::cout << "Trading Pipeline P99: " << stats.p99_ns / 1000.0 << "μs" << std::endl;
}

// Memory allocation benchmark
TEST_F(LatencyBenchmark, MemoryAllocationLatency) {
    std::vector<uint64_t> allocation_latencies;
    allocation_latencies.reserve(BENCHMARK_ITERATIONS);
    
    // Test zero-allocation order processing
    for (int i = 0; i < BENCHMARK_ITERATIONS; ++i) {
        auto start = timer->now();
        
        // This should use pre-allocated memory pools
        Order* order = &test_orders[i % test_orders.size()];
        order_book->add_order(order);
        
        auto end = timer->now();
        allocation_latencies.push_back(end - start);
    }
    
    // Calculate statistics
    auto stats = calculate_stats(allocation_latencies);
    
    // Store results
    benchmark_results["memory_allocation"] = {
        {"min_ns", stats.min_ns},
        {"max_ns", stats.max_ns},
        {"avg_ns", stats.avg_ns},
        {"p50_ns", stats.p50_ns},
        {"p95_ns", stats.p95_ns},
        {"p99_ns", stats.p99_ns},
        {"p999_ns", stats.p999_ns}
    };
    
    std::cout << "Memory Allocation P99: " << stats.p99_ns / 1000.0 << "μs" << std::endl;
}

// Test fixture for output generation
class BenchmarkOutput : public ::testing::Test {
protected:
    static void SetUpTestSuite() {
        // This runs once before all tests in this suite
    }
    
    static void TearDownTestSuite() {
        // This runs once after all tests in this suite
    }
};

// Output benchmark results to JSON file
TEST_F(BenchmarkOutput, GenerateResults) {
    // Get output file from command line or use default
    const char* output_file = std::getenv("BENCHMARK_OUTPUT");
    if (!output_file) {
        output_file = "benchmark_results.json";
    }
    
    // Add metadata
    json results;
    results["metadata"] = {
        {"timestamp", std::chrono::duration_cast<std::chrono::seconds>(
            std::chrono::system_clock::now().time_since_epoch()).count()},
        {"iterations", BENCHMARK_ITERATIONS},
        {"warmup_iterations", WARMUP_ITERATIONS},
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
        std::cout << "Benchmark results written to: " << output_file << std::endl;
    } else {
        std::cerr << "Failed to write benchmark results to: " << output_file << std::endl;
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