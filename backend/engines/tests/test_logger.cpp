#include <gtest/gtest.h>
#include "logger.hpp"
#include <sstream>
#include <fstream>

class LoggerTest : public ::testing::Test {
protected:
    void SetUp() override {
        // Create a temporary log file for testing
        test_log_file = "/tmp/test_logger.log";
    }

    void TearDown() override {
        // Clean up test log file
        std::remove(test_log_file.c_str());
    }

    std::string test_log_file;
};

TEST_F(LoggerTest, LoggerInitialization) {
    // Test that logger can be initialized without errors
    EXPECT_NO_THROW({
        Logger logger(LogLevel::INFO, test_log_file);
    });
}

TEST_F(LoggerTest, LogLevelFiltering) {
    Logger logger(LogLevel::WARN, test_log_file);
    
    // These should not be logged due to level filtering
    logger.debug("Debug message");
    logger.info("Info message");
    
    // These should be logged
    logger.warn("Warning message");
    logger.error("Error message");
    
    // Check that file exists and has content
    std::ifstream log_file(test_log_file);
    EXPECT_TRUE(log_file.good());
    
    std::string line;
    int line_count = 0;
    while (std::getline(log_file, line)) {
        line_count++;
        // Should only contain WARN and ERROR messages
        EXPECT_TRUE(line.find("WARN") != std::string::npos || 
                   line.find("ERROR") != std::string::npos);
    }
    
    EXPECT_EQ(line_count, 2); // Only 2 messages should be logged
}

TEST_F(LoggerTest, MessageFormatting) {
    Logger logger(LogLevel::DEBUG, test_log_file);
    
    const std::string test_message = "Test message with number: 42";
    logger.info(test_message);
    
    std::ifstream log_file(test_log_file);
    std::string logged_line;
    std::getline(log_file, logged_line);
    
    // Check that the message is contained in the log line
    EXPECT_TRUE(logged_line.find(test_message) != std::string::npos);
    EXPECT_TRUE(logged_line.find("INFO") != std::string::npos);
}

TEST_F(LoggerTest, ThreadSafety) {
    Logger logger(LogLevel::DEBUG, test_log_file);
    
    const int num_threads = 10;
    const int messages_per_thread = 100;
    
    std::vector<std::thread> threads;
    
    // Launch multiple threads that log simultaneously
    for (int i = 0; i < num_threads; ++i) {
        threads.emplace_back([&logger, i, messages_per_thread]() {
            for (int j = 0; j < messages_per_thread; ++j) {
                logger.info("Thread " + std::to_string(i) + " message " + std::to_string(j));
            }
        });
    }
    
    // Wait for all threads to complete
    for (auto& thread : threads) {
        thread.join();
    }
    
    // Count total logged messages
    std::ifstream log_file(test_log_file);
    std::string line;
    int total_messages = 0;
    while (std::getline(log_file, line)) {
        total_messages++;
    }
    
    EXPECT_EQ(total_messages, num_threads * messages_per_thread);
}

TEST_F(LoggerTest, PerformanceBenchmark) {
    Logger logger(LogLevel::INFO, test_log_file);
    
    const int num_messages = 10000;
    auto start_time = std::chrono::high_resolution_clock::now();
    
    for (int i = 0; i < num_messages; ++i) {
        logger.info("Performance test message " + std::to_string(i));
    }
    
    auto end_time = std::chrono::high_resolution_clock::now();
    auto duration = std::chrono::duration_cast<std::chrono::microseconds>(end_time - start_time);
    
    // Should be able to log at least 1000 messages per second
    double messages_per_second = (num_messages * 1000000.0) / duration.count();
    EXPECT_GT(messages_per_second, 1000.0);
    
    std::cout << "Logger performance: " << messages_per_second << " messages/second" << std::endl;
}