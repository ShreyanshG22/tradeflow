#include <gtest/gtest.h>
#include "high_res_timer.hpp"
#include <thread>
#include <chrono>

class HighResTimerTest : public ::testing::Test {
protected:
    void SetUp() override {
        timer = std::make_unique<HighResTimer>();
    }

    void TearDown() override {
        timer.reset();
    }

    std::unique_ptr<HighResTimer> timer;
};

TEST_F(HighResTimerTest, BasicTiming) {
    uint64_t start = timer->now();
    
    // Sleep for a known duration
    std::this_thread::sleep_for(std::chrono::milliseconds(10));
    
    uint64_t end = timer->now();
    
    // Check that time has passed
    EXPECT_GT(end, start);
    
    // Convert to microseconds and check approximate duration
    double duration_us = timer->to_microseconds(end - start);
    
    // Should be approximately 10,000 microseconds (10ms), allow some tolerance
    EXPECT_GT(duration_us, 8000.0);  // At least 8ms
    EXPECT_LT(duration_us, 15000.0); // At most 15ms
}

TEST_F(HighResTimerTest, NanosecondPrecision) {
    uint64_t start = timer->now();
    
    // Perform a small operation
    volatile int sum = 0;
    for (int i = 0; i < 1000; ++i) {
        sum += i;
    }
    
    uint64_t end = timer->now();
    
    // Should measure even small durations
    EXPECT_GT(end, start);
    
    double duration_us = timer->to_microseconds(end - start);
    
    // Should be a small but measurable duration
    EXPECT_GT(duration_us, 0.0);
    EXPECT_LT(duration_us, 1000.0); // Should be less than 1ms
}

TEST_F(HighResTimerTest, MonotonicTime) {
    // Take multiple measurements and ensure they're monotonic
    std::vector<uint64_t> timestamps;
    
    for (int i = 0; i < 100; ++i) {
        timestamps.push_back(timer->now());
        // Small delay to ensure time progression
        std::this_thread::sleep_for(std::chrono::microseconds(10));
    }
    
    // Verify all timestamps are monotonically increasing
    for (size_t i = 1; i < timestamps.size(); ++i) {
        EXPECT_GT(timestamps[i], timestamps[i-1]);
    }
}

TEST_F(HighResTimerTest, PerformanceBenchmark) {
    const int num_calls = 1000000;
    
    auto start_time = std::chrono::high_resolution_clock::now();
    
    for (int i = 0; i < num_calls; ++i) {
        volatile uint64_t timestamp = timer->now();
        (void)timestamp; // Suppress unused variable warning
    }
    
    auto end_time = std::chrono::high_resolution_clock::now();
    auto duration = std::chrono::duration_cast<std::chrono::nanoseconds>(end_time - start_time);
    
    double ns_per_call = static_cast<double>(duration.count()) / num_calls;
    
    // Should be very fast - less than 100ns per call on modern hardware
    EXPECT_LT(ns_per_call, 100.0);
    
    std::cout << "HighResTimer performance: " << ns_per_call << " ns per call" << std::endl;
}

TEST_F(HighResTimerTest, ConversionAccuracy) {
    uint64_t nanoseconds = 1500000; // 1.5 milliseconds in nanoseconds
    
    double microseconds = timer->to_microseconds(nanoseconds);
    
    EXPECT_DOUBLE_EQ(microseconds, 1500.0);
}

TEST_F(HighResTimerTest, LargeTimeSpans) {
    uint64_t start = timer->now();
    
    // Sleep for a longer duration
    std::this_thread::sleep_for(std::chrono::milliseconds(100));
    
    uint64_t end = timer->now();
    
    double duration_us = timer->to_microseconds(end - start);
    
    // Should be approximately 100,000 microseconds (100ms)
    EXPECT_GT(duration_us, 95000.0);  // At least 95ms
    EXPECT_LT(duration_us, 110000.0); // At most 110ms
}

TEST_F(HighResTimerTest, ZeroDuration) {
    uint64_t timestamp = timer->now();
    
    double duration_us = timer->to_microseconds(timestamp - timestamp);
    
    EXPECT_DOUBLE_EQ(duration_us, 0.0);
}