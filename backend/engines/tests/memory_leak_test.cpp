#include <gtest/gtest.h>
#include <chrono>
#include <vector>
#include <thread>
#include <atomic>
#include <fstream>
#include <iomanip>
#include <sstream>
#include <unordered_map>

// Include engine headers
#include "high_res_timer.hpp"
#include "lock_free_order_book.hpp"
#include "data_distribution_coordinator.hpp"
#include "tick_storage.hpp"
#include "trading_allocator.hpp"

// JSON output for results
#include <nlohmann/json.hpp>
using json = nlohmann::json;

class MemoryLeakTest : public ::testing::Test {
protected:
    void SetUp() override {
        // Initialize components
        timer = std::make_unique<HighResTimer>();
        order_book = std::make_unique<LockFreeOrderBook<double, 100000>>();
        data_coordinator = std::make_unique<DataDistributionCoordinator>();
        tick_storage = std::make_unique<TickStorage>();
        allocator = std::make_unique<TradingAllocator>();
        
        // Initialize test parameters
        test_duration_hours = 1;  // Default 1 hour
        
        // Parse environment variables
        parse_environment();
        
        // Prepare test data
        prepare_test_data();
    }
    
    void TearDown() override {
        timer.reset();
        order_book.reset();
        data_coordinator.reset();
        tick_storage.reset();
        allocator.reset();
    }
    
    void parse_environment() {
        const char* duration = std::getenv("DURATION");
        if (duration) {
            std::string duration_str(duration);
            if (duration_str.back() == 'h') {
                test_duration_hours = std::stod(duration_str.substr(0, duration_str.length() - 1));
            } else if (duration_str.back() == 'm') {
                test_duration_hours = std::stod(duration_str.substr(0, duration_str.length() - 1)) / 60.0;
            } else {
                test_duration_hours = std::stod(duration_str) / 3600.0; // Assume seconds
            }
        }
    }
    
    void prepare_test_data() {
        // Generate test orders and ticks for continuous operation
        std::random_device rd;
        std::mt19937 gen(rd());
        std::uniform_real_distribution<double> price_dist(100.0, 200.0);
        std::uniform_int_distribution<uint32_t> qty_dist(100, 10000);
        
        // Generate orders
        const int order_count = 100000;
        test_orders.reserve(order_count);
        
        for (int i = 0; i < order_count; ++i) {
            Order order;
            order.id = i + 1;
            order.price = price_dist(gen);
            order.quantity = qty_dist(gen);
            order.side = (i % 2 == 0) ? OrderSide::BUY : OrderSide::SELL;
            order.status = OrderStatus::PENDING;
            order.symbol = "AAPL";
            order.user_id = "user-" + std::to_string(i % 1000);
            test_orders.push_back(order);
        }
        
        // Generate market ticks
        const int tick_count = 1000000;
        test_ticks.reserve(tick_count);
        
        for (int i = 0; i < tick_count; ++i) {
            MarketTick tick;
            tick.symbol = "AAPL";
            tick.price = price_dist(gen);
            tick.volume = qty_dist(gen);
            tick.timestamp = std::chrono::high_resolution_clock::now().time_since_epoch().count();
            tick.sequence_number = i + 1;
            test_ticks.push_back(tick);
        }
    }
    
    struct MemoryStats {
        double rss_mb;          // Resident Set Size
        double vms_mb;          // Virtual Memory Size
        double heap_mb;         // Heap memory
        double stack_mb;        // Stack memory
        uint64_t page_faults;   // Page faults
        uint64_t context_switches; // Context switches
    };
    
    MemoryStats get_memory_stats() {
        MemoryStats stats = {};
        
        // Read from /proc/self/status
        std::ifstream status("/proc/self/status");
        std::string line;
        
        while (std::getline(status, line)) {
            std::istringstream iss(line);
            std::string key, value, unit;
            iss >> key >> value >> unit;
            
            if (key == "VmRSS:") {
                stats.rss_mb = std::stod(value) / 1024.0; // KB to MB
            } else if (key == "VmSize:") {
                stats.vms_mb = std::stod(value) / 1024.0; // KB to MB
            } else if (key == "VmData:") {
                stats.heap_mb = std::stod(value) / 1024.0; // KB to MB
            } else if (key == "VmStk:") {
                stats.stack_mb = std::stod(value) / 1024.0; // KB to MB
            }
        }
        
        // Read from /proc/self/stat for page faults and context switches
        std::ifstream stat("/proc/self/stat");
        std::string stat_line;
        if (std::getline(stat, stat_line)) {
            std::istringstream iss(stat_line);
            std::vector<std::string> fields;
            std::string field;
            
            while (iss >> field) {
                fields.push_back(field);
            }
            
            if (fields.size() > 11) {
                stats.page_faults = std::stoull(fields[9]) + std::stoull(fields[11]); // minor + major faults
            }
        }
        
        return stats;
    }
    
    struct LeakTestResults {
        double test_duration_hours;
        MemoryStats initial_memory;
        MemoryStats final_memory;
        MemoryStats peak_memory;
        double memory_growth_mb;
        double leak_rate_mb_per_hour;
        std::vector<MemoryStats> memory_timeline;
        uint64_t total_operations;
        uint64_t allocations_made;
        uint64_t deallocations_made;
        double allocation_efficiency;
        bool leak_detected;
        std::vector<std::string> leak_sources;
    };
    
    LeakTestResults run_memory_leak_test() {
        LeakTestResults results = {};
        results.test_duration_hours = test_duration_hours;
        
        // Get initial memory state
        results.initial_memory = get_memory_stats();
        results.peak_memory = results.initial_memory;
        
        // Memory monitoring
        std::atomic<bool> stop_monitoring{false};
        std::mutex timeline_mutex;
        
        // Memory monitoring thread
        std::thread memory_monitor([this, &results, &stop_monitoring, &timeline_mutex]() {
            while (!stop_monitoring.load()) {
                auto current_stats = get_memory_stats();
                
                {
                    std::lock_guard<std::mutex> lock(timeline_mutex);
                    results.memory_timeline.push_back(current_stats);
                    
                    // Update peak memory
                    if (current_stats.rss_mb > results.peak_memory.rss_mb) {
                        results.peak_memory = current_stats;
                    }
                }
                
                std::this_thread::sleep_for(std::chrono::seconds(10)); // Sample every 10 seconds
            }
        });
        
        // Workload simulation
        std::atomic<uint64_t> operations_count{0};
        std::atomic<uint64_t> allocations_count{0};
        std::atomic<uint64_t> deallocations_count{0};
        std::atomic<bool> stop_workload{false};
        
        // Order processing workload
        std::thread order_workload([this, &operations_count, &allocations_count, 
                                   &deallocations_count, &stop_workload]() {
            size_t order_index = 0;
            
            while (!stop_workload.load()) {
                // Process orders continuously
                for (int i = 0; i < 1000 && !stop_workload.load(); ++i) {
                    // Allocate order using custom allocator
                    Order* order = allocator->allocate<Order>();
                    allocations_count.fetch_add(1);
                    
                    if (order) {
                        *order = test_orders[order_index % test_orders.size()];
                        
                        // Process order
                        bool added = order_book->add_order(order);
                        
                        if (added) {
                            operations_count.fetch_add(1);
                        }
                        
                        // Simulate order lifecycle
                        if (order_index % 10 == 0) {
                            order_book->cancel_order(order->id);
                        }
                        
                        // Deallocate (in real system, this would be managed by allocator)
                        // For testing, we simulate deallocation
                        deallocations_count.fetch_add(1);
                    }
                    
                    order_index++;
                }
                
                // Brief pause to prevent CPU saturation
                std::this_thread::sleep_for(std::chrono::milliseconds(1));
            }
        });
        
        // Market data workload
        std::thread market_data_workload([this, &operations_count, &stop_workload]() {
            size_t tick_index = 0;
            
            while (!stop_workload.load()) {
                // Process market data continuously
                for (int i = 0; i < 1000 && !stop_workload.load(); ++i) {
                    // Store tick
                    bool stored = tick_storage->store_tick(test_ticks[tick_index % test_ticks.size()]);
                    
                    if (stored) {
                        // Distribute to subscribers
                        data_coordinator->distribute_tick(test_ticks[tick_index % test_ticks.size()]);
                        operations_count.fetch_add(1);
                    }
                    
                    tick_index++;
                }
                
                // Brief pause
                std::this_thread::sleep_for(std::chrono::milliseconds(1));
            }
        });
        
        // Memory allocation stress workload
        std::thread allocation_workload([this, &allocations_count, &deallocations_count, &stop_workload]() {
            std::vector<void*> allocated_blocks;
            allocated_blocks.reserve(10000);
            
            while (!stop_workload.load()) {
                // Allocate blocks of various sizes
                for (int i = 0; i < 100 && !stop_workload.load(); ++i) {
                    size_t size = 64 + (i * 16); // Variable sizes
                    void* block = allocator->allocate_bytes(size);
                    
                    if (block) {
                        allocated_blocks.push_back(block);
                        allocations_count.fetch_add(1);
                        
                        // Periodically deallocate some blocks
                        if (allocated_blocks.size() > 5000) {
                            // Deallocate oldest blocks
                            for (int j = 0; j < 1000; ++j) {
                                if (!allocated_blocks.empty()) {
                                    allocated_blocks.erase(allocated_blocks.begin());
                                    deallocations_count.fetch_add(1);
                                }
                            }
                        }
                    }
                }
                
                std::this_thread::sleep_for(std::chrono::milliseconds(10));
            }
            
            // Cleanup remaining allocations
            allocated_blocks.clear();
        });
        
        // Run test for specified duration
        std::cout << "Running memory leak test for " << test_duration_hours << " hours..." << std::endl;
        
        auto test_start = std::chrono::steady_clock::now();
        auto test_duration = std::chrono::duration<double, std::ratio<3600>>(test_duration_hours);
        
        // Progress reporting
        std::thread progress_reporter([this, &test_start, &test_duration, &operations_count]() {
            while (std::chrono::steady_clock::now() - test_start < test_duration) {
                auto elapsed = std::chrono::steady_clock::now() - test_start;
                auto elapsed_hours = std::chrono::duration<double, std::ratio<3600>>(elapsed).count();
                auto progress_percent = (elapsed_hours / test_duration_hours) * 100.0;
                
                std::cout << "Progress: " << std::fixed << std::setprecision(1) 
                          << progress_percent << "% (" << elapsed_hours << "h), "
                          << "Operations: " << operations_count.load() << std::endl;
                
                std::this_thread::sleep_for(std::chrono::minutes(5)); // Report every 5 minutes
            }
        });
        
        // Wait for test completion
        std::this_thread::sleep_until(test_start + std::chrono::duration_cast<std::chrono::steady_clock::duration>(test_duration));
        
        // Stop all workloads
        stop_workload.store(true);
        stop_monitoring.store(true);
        
        // Wait for threads to complete
        order_workload.join();
        market_data_workload.join();
        allocation_workload.join();
        memory_monitor.join();
        progress_reporter.join();
        
        // Get final memory state
        results.final_memory = get_memory_stats();
        
        // Calculate results
        results.total_operations = operations_count.load();
        results.allocations_made = allocations_count.load();
        results.deallocations_made = deallocations_count.load();
        results.memory_growth_mb = results.final_memory.rss_mb - results.initial_memory.rss_mb;
        results.leak_rate_mb_per_hour = results.memory_growth_mb / test_duration_hours;
        results.allocation_efficiency = static_cast<double>(results.deallocations_made) / 
                                       results.allocations_made * 100.0;
        
        // Detect potential leaks
        results.leak_detected = false;
        
        // Check for significant memory growth
        if (results.leak_rate_mb_per_hour > 10.0) {
            results.leak_detected = true;
            results.leak_sources.push_back("High memory growth rate: " + 
                                         std::to_string(results.leak_rate_mb_per_hour) + " MB/hour");
        }
        
        // Check allocation/deallocation balance
        if (results.allocation_efficiency < 95.0) {
            results.leak_detected = true;
            results.leak_sources.push_back("Allocation/deallocation imbalance: " + 
                                         std::to_string(results.allocation_efficiency) + "%");
        }
        
        // Check for memory growth trend
        if (results.memory_timeline.size() > 10) {
            double initial_rss = results.memory_timeline[0].rss_mb;
            double final_rss = results.memory_timeline.back().rss_mb;
            double trend_growth = final_rss - initial_rss;
            
            if (trend_growth > 50.0) { // More than 50MB growth
                results.leak_detected = true;
                results.leak_sources.push_back("Continuous memory growth trend: " + 
                                             std::to_string(trend_growth) + " MB");
            }
        }
        
        return results;
    }
    
    double test_duration_hours;
    
    std::unique_ptr<HighResTimer> timer;
    std::unique_ptr<LockFreeOrderBook<double, 100000>> order_book;
    std::unique_ptr<DataDistributionCoordinator> data_coordinator;
    std::unique_ptr<TickStorage> tick_storage;
    std::unique_ptr<TradingAllocator> allocator;
    
    std::vector<Order> test_orders;
    std::vector<MarketTick> test_ticks;
    
    json benchmark_results;
};

// Main Memory Leak Test
TEST_F(MemoryLeakTest, LongRunningStabilityTest) {
    std::cout << "Starting Long-Running Memory Leak Test..." << std::endl;
    std::cout << "Duration: " << test_duration_hours << " hours" << std::endl;
    
    // Run the memory leak test
    auto results = run_memory_leak_test();
    
    // Store results
    benchmark_results["memory_leak"] = {
        {"test_duration_hours", results.test_duration_hours},
        {"initial_memory_mb", results.initial_memory.rss_mb},
        {"final_memory_mb", results.final_memory.rss_mb},
        {"peak_memory_mb", results.peak_memory.rss_mb},
        {"memory_growth_mb", results.memory_growth_mb},
        {"leak_rate_mb_per_hour", results.leak_rate_mb_per_hour},
        {"total_operations", results.total_operations},
        {"allocations_made", results.allocations_made},
        {"deallocations_made", results.deallocations_made},
        {"allocation_efficiency", results.allocation_efficiency},
        {"leak_detected", results.leak_detected},
        {"leak_sources", results.leak_sources}
    };
    
    // Add memory timeline
    json timeline = json::array();
    for (size_t i = 0; i < results.memory_timeline.size(); ++i) {
        const auto& stats = results.memory_timeline[i];
        timeline.push_back({
            {"sample", i},
            {"time_minutes", i * 10.0 / 60.0}, // 10-second samples
            {"rss_mb", stats.rss_mb},
            {"vms_mb", stats.vms_mb},
            {"heap_mb", stats.heap_mb}
        });
    }
    benchmark_results["memory_timeline"] = timeline;
    
    // Print results
    std::cout << std::fixed << std::setprecision(2);
    std::cout << "\n=== Memory Leak Test Results ===" << std::endl;
    std::cout << "Test Duration: " << results.test_duration_hours << " hours" << std::endl;
    std::cout << "Initial Memory: " << results.initial_memory.rss_mb << "MB" << std::endl;
    std::cout << "Final Memory: " << results.final_memory.rss_mb << "MB" << std::endl;
    std::cout << "Peak Memory: " << results.peak_memory.rss_mb << "MB" << std::endl;
    std::cout << "Memory Growth: " << results.memory_growth_mb << "MB" << std::endl;
    std::cout << "Leak Rate: " << results.leak_rate_mb_per_hour << "MB/hour" << std::endl;
    std::cout << "Total Operations: " << results.total_operations << std::endl;
    std::cout << "Allocations: " << results.allocations_made << std::endl;
    std::cout << "Deallocations: " << results.deallocations_made << std::endl;
    std::cout << "Allocation Efficiency: " << results.allocation_efficiency << "%" << std::endl;
    std::cout << "Leak Detected: " << (results.leak_detected ? "YES" : "NO") << std::endl;
    
    if (results.leak_detected) {
        std::cout << "Leak Sources:" << std::endl;
        for (const auto& source : results.leak_sources) {
            std::cout << "  - " << source << std::endl;
        }
    }
    
    // Verify memory leak targets
    EXPECT_LE(results.leak_rate_mb_per_hour, 10.0) 
        << "Memory leak rate above 10MB/hour: " << results.leak_rate_mb_per_hour;
    EXPECT_GE(results.allocation_efficiency, 95.0) 
        << "Allocation efficiency below 95%: " << results.allocation_efficiency;
    EXPECT_FALSE(results.leak_detected) 
        << "Memory leak detected";
}

// Allocation Pattern Test
TEST_F(MemoryLeakTest, AllocationPatternTest) {
    std::cout << "Running allocation pattern test..." << std::endl;
    
    const int pattern_iterations = 10000;
    std::vector<double> allocation_times;
    std::vector<double> deallocation_times;
    
    allocation_times.reserve(pattern_iterations);
    deallocation_times.reserve(pattern_iterations);
    
    auto initial_memory = get_memory_stats();
    
    // Test various allocation patterns
    for (int pattern = 0; pattern < 5; ++pattern) {
        std::cout << "Testing allocation pattern " << (pattern + 1) << "/5..." << std::endl;
        
        std::vector<void*> allocated_blocks;
        
        for (int i = 0; i < pattern_iterations; ++i) {
            size_t size;
            
            // Different allocation patterns
            switch (pattern) {
                case 0: size = 64; break;                    // Fixed small
                case 1: size = 1024; break;                  // Fixed medium
                case 2: size = 64 + (i % 1000); break;      // Variable small
                case 3: size = 1024 + (i % 10000); break;   // Variable medium
                case 4: size = (i % 2 == 0) ? 64 : 4096; break; // Mixed
            }
            
            auto alloc_start = timer->now();
            void* block = allocator->allocate_bytes(size);
            auto alloc_end = timer->now();
            
            if (block) {
                allocated_blocks.push_back(block);
                allocation_times.push_back(static_cast<double>(alloc_end - alloc_start));
            }
            
            // Periodic deallocation
            if (i % 100 == 0 && !allocated_blocks.empty()) {
                auto dealloc_start = timer->now();
                allocated_blocks.pop_back();
                auto dealloc_end = timer->now();
                
                deallocation_times.push_back(static_cast<double>(dealloc_end - dealloc_start));
            }
        }
        
        // Cleanup remaining allocations
        allocated_blocks.clear();
    }
    
    auto final_memory = get_memory_stats();
    
    // Calculate statistics
    double avg_alloc_time = 0.0;
    double avg_dealloc_time = 0.0;
    
    if (!allocation_times.empty()) {
        for (auto time : allocation_times) {
            avg_alloc_time += time;
        }
        avg_alloc_time /= allocation_times.size();
    }
    
    if (!deallocation_times.empty()) {
        for (auto time : deallocation_times) {
            avg_dealloc_time += time;
        }
        avg_dealloc_time /= deallocation_times.size();
    }
    
    benchmark_results["allocation_pattern_test"] = {
        {"pattern_iterations", pattern_iterations},
        {"total_allocations", allocation_times.size()},
        {"total_deallocations", deallocation_times.size()},
        {"avg_allocation_time_ns", avg_alloc_time},
        {"avg_deallocation_time_ns", avg_dealloc_time},
        {"initial_memory_mb", initial_memory.rss_mb},
        {"final_memory_mb", final_memory.rss_mb},
        {"memory_delta_mb", final_memory.rss_mb - initial_memory.rss_mb}
    };
    
    std::cout << "Allocation Pattern Test Results:" << std::endl;
    std::cout << "Average Allocation Time: " << avg_alloc_time / 1000.0 << "μs" << std::endl;
    std::cout << "Average Deallocation Time: " << avg_dealloc_time / 1000.0 << "μs" << std::endl;
    std::cout << "Memory Delta: " << (final_memory.rss_mb - initial_memory.rss_mb) << "MB" << std::endl;
}

// Output results to JSON file
TEST_F(MemoryLeakTest, GenerateResults) {
    const char* output_file = std::getenv("OUTPUT_FILE");
    if (!output_file) {
        output_file = "memory_leak_results.json";
    }
    
    // Add metadata
    json results;
    results["metadata"] = {
        {"timestamp", std::chrono::duration_cast<std::chrono::seconds>(
            std::chrono::system_clock::now().time_since_epoch()).count()},
        {"test_duration_hours", test_duration_hours},
        {"system_info", {
            {"page_size", getpagesize()},
            {"cpu_count", std::thread::hardware_concurrency()}
        }}
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
        std::cout << "Memory leak test results written to: " << output_file << std::endl;
    } else {
        std::cerr << "Failed to write memory leak test results to: " << output_file << std::endl;
    }
}

int main(int argc, char **argv) {
    ::testing::InitGoogleTest(&argc, argv);
    
    // Parse command line arguments
    for (int i = 1; i < argc; ++i) {
        std::string arg = argv[i];
        if (arg.find("--duration=") == 0) {
            std::string duration = arg.substr(11);
            setenv("DURATION", duration.c_str(), 1);
        } else if (arg.find("--output=") == 0) {
            std::string output_file = arg.substr(9);
            setenv("OUTPUT_FILE", output_file.c_str(), 1);
        }
    }
    
    return RUN_ALL_TESTS();
}