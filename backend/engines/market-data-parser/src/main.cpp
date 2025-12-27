#include <iostream>
#include <thread>
#include <chrono>
#include <signal.h>
#include "fix_parser.hpp"
#include "binary_format.hpp"
#include "tick_storage.hpp"
#include "feed_handler.hpp"
#include "data_normalizer.hpp"
#include "logger.hpp"
#include "high_res_timer.hpp"

using namespace MarketData;

// Global flag for graceful shutdown
std::atomic<bool> g_running{true};

void signal_handler(int signal) {
    tradeflow::Logger::getInstance().info("Received signal " + std::to_string(signal) + ", shutting down...");
    g_running.store(false, std::memory_order_release);
}

int main(int argc, char* argv[]) {
    // Set up signal handlers
    signal(SIGINT, signal_handler);
    signal(SIGTERM, signal_handler);
    
    auto& logger = tradeflow::Logger::getInstance();
    logger.setLevel(tradeflow::LogLevel::INFO);
    logger.info("Starting Market Data Parser...");
    
    try {
        // Initialize components
        FixParser parser;
        BinaryFormat binary_format;
        TickStorage tick_storage;
        TickAggregator aggregator;
        
        logger.info("Components initialized successfully");
        
        // Performance monitoring
        auto last_stats_time = tradeflow::HighResTimer::now();
        
        // Main processing loop
        while (g_running.load(std::memory_order_acquire)) {
            // In a real implementation, this would:
            // 1. Receive data from network feeds
            // 2. Parse FIX messages
            // 3. Store ticks in lock-free storage
            // 4. Aggregate into OHLCV bars
            // 5. Distribute to subscribers
            
            // Simulate processing for demonstration
            std::this_thread::sleep_for(std::chrono::milliseconds(100));
            
            // Print statistics every 10 seconds
            auto now = tradeflow::HighResTimer::now();
            auto elapsed = std::chrono::duration_cast<std::chrono::seconds>(now - last_stats_time);
            
            if (elapsed.count() >= 10) {
                auto storage_stats = tick_storage.get_stats();
                auto parser_stats = parser.get_stats();
                
                logger.info("=== Performance Statistics ===");
                logger.info("Total ticks stored: " + std::to_string(storage_stats.total_ticks_stored));
                logger.info("Active symbols: " + std::to_string(storage_stats.active_symbols));
                logger.info("Memory usage: " + std::to_string(storage_stats.memory_usage_bytes / 1024) + " KB");
                logger.info("Buffer utilization: " + std::to_string(storage_stats.buffer_utilization_percent) + "%");
                logger.info("Messages processed: " + std::to_string(parser_stats.messages_processed.load()));
                logger.info("Parse errors: " + std::to_string(parser_stats.parse_errors.load()));
                logger.info("Average latency: " + std::to_string(parser_stats.get_average_latency_us()) + " μs");
                logger.info("===============================");
                
                last_stats_time = now;
            }
        }
        
        logger.info("Market Data Parser shutting down gracefully");
        
    } catch (const std::exception& e) {
        logger.error("Fatal error: " + std::string(e.what()));
        return 1;
    }
    
    logger.info("Market Data Parser stopped");
    return 0;
}