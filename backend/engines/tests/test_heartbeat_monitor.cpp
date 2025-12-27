#include <gtest/gtest.h>
#include "heartbeat_monitor.hpp"
#include <thread>
#include <chrono>

class HeartbeatMonitorTest : public ::testing::Test {
protected:
    void SetUp() override {
        // Use a short timeout for testing
        timeout_ms = 100;
        monitor = std::make_unique<HeartbeatMonitor>(timeout_ms);
    }

    void TearDown() override {
        if (monitor) {
            monitor->stop();
        }
        monitor.reset();
    }

    std::unique_ptr<HeartbeatMonitor> monitor;
    uint32_t timeout_ms;
};

TEST_F(HeartbeatMonitorTest, BasicHeartbeat) {
    bool callback_called = false;
    std::string failed_service;
    
    monitor->set_timeout_callback([&](const std::string& service_name) {
        callback_called = true;
        failed_service = service_name;
    });
    
    monitor->start();
    
    // Register a service
    const std::string service_name = "test_service";
    monitor->register_service(service_name);
    
    // Send heartbeat immediately
    monitor->heartbeat(service_name);
    
    // Wait less than timeout
    std::this_thread::sleep_for(std::chrono::milliseconds(timeout_ms / 2));
    
    // Should not have timed out yet
    EXPECT_FALSE(callback_called);
    
    // Send another heartbeat
    monitor->heartbeat(service_name);
    
    // Wait again
    std::this_thread::sleep_for(std::chrono::milliseconds(timeout_ms / 2));
    
    // Still should not have timed out
    EXPECT_FALSE(callback_called);
}

TEST_F(HeartbeatMonitorTest, TimeoutDetection) {
    bool callback_called = false;
    std::string failed_service;
    
    monitor->set_timeout_callback([&](const std::string& service_name) {
        callback_called = true;
        failed_service = service_name;
    });
    
    monitor->start();
    
    const std::string service_name = "test_service";
    monitor->register_service(service_name);
    
    // Send initial heartbeat
    monitor->heartbeat(service_name);
    
    // Wait longer than timeout without sending heartbeat
    std::this_thread::sleep_for(std::chrono::milliseconds(timeout_ms + 50));
    
    // Should have timed out
    EXPECT_TRUE(callback_called);
    EXPECT_EQ(failed_service, service_name);
}

TEST_F(HeartbeatMonitorTest, MultipleServices) {
    std::vector<std::string> failed_services;
    std::mutex callback_mutex;
    
    monitor->set_timeout_callback([&](const std::string& service_name) {
        std::lock_guard<std::mutex> lock(callback_mutex);
        failed_services.push_back(service_name);
    });
    
    monitor->start();
    
    // Register multiple services
    const std::vector<std::string> services = {"service1", "service2", "service3"};
    for (const auto& service : services) {
        monitor->register_service(service);
        monitor->heartbeat(service);
    }
    
    // Keep service1 alive
    std::thread service1_thread([&]() {
        while (failed_services.size() < 2) {
            monitor->heartbeat("service1");
            std::this_thread::sleep_for(std::chrono::milliseconds(timeout_ms / 3));
        }
    });
    
    // Let service2 and service3 timeout
    std::this_thread::sleep_for(std::chrono::milliseconds(timeout_ms + 100));
    
    service1_thread.join();
    
    // Should have 2 failed services (service2 and service3)
    EXPECT_EQ(failed_services.size(), 2);
    EXPECT_TRUE(std::find(failed_services.begin(), failed_services.end(), "service2") != failed_services.end());
    EXPECT_TRUE(std::find(failed_services.begin(), failed_services.end(), "service3") != failed_services.end());
}

TEST_F(HeartbeatMonitorTest, ServiceRecovery) {
    int timeout_count = 0;
    std::string last_failed_service;
    
    monitor->set_timeout_callback([&](const std::string& service_name) {
        timeout_count++;
        last_failed_service = service_name;
    });
    
    monitor->start();
    
    const std::string service_name = "recovery_test_service";
    monitor->register_service(service_name);
    
    // Send initial heartbeat
    monitor->heartbeat(service_name);
    
    // Let it timeout
    std::this_thread::sleep_for(std::chrono::milliseconds(timeout_ms + 50));
    
    EXPECT_EQ(timeout_count, 1);
    EXPECT_EQ(last_failed_service, service_name);
    
    // Recover the service
    monitor->heartbeat(service_name);
    
    // Wait and send more heartbeats
    for (int i = 0; i < 5; ++i) {
        std::this_thread::sleep_for(std::chrono::milliseconds(timeout_ms / 2));
        monitor->heartbeat(service_name);
    }
    
    // Should not have timed out again
    EXPECT_EQ(timeout_count, 1);
}

TEST_F(HeartbeatMonitorTest, UnregisterService) {
    bool callback_called = false;
    
    monitor->set_timeout_callback([&](const std::string& service_name) {
        callback_called = true;
    });
    
    monitor->start();
    
    const std::string service_name = "temp_service";
    monitor->register_service(service_name);
    monitor->heartbeat(service_name);
    
    // Unregister the service
    monitor->unregister_service(service_name);
    
    // Wait longer than timeout
    std::this_thread::sleep_for(std::chrono::milliseconds(timeout_ms + 50));
    
    // Should not have called timeout callback for unregistered service
    EXPECT_FALSE(callback_called);
}

TEST_F(HeartbeatMonitorTest, HighFrequencyHeartbeats) {
    bool callback_called = false;
    
    monitor->set_timeout_callback([&](const std::string& service_name) {
        callback_called = true;
    });
    
    monitor->start();
    
    const std::string service_name = "high_freq_service";
    monitor->register_service(service_name);
    
    // Send heartbeats at high frequency
    auto start_time = std::chrono::steady_clock::now();
    auto end_time = start_time + std::chrono::milliseconds(timeout_ms * 2);
    
    while (std::chrono::steady_clock::now() < end_time) {
        monitor->heartbeat(service_name);
        std::this_thread::sleep_for(std::chrono::milliseconds(5));
    }
    
    // Should not have timed out
    EXPECT_FALSE(callback_called);
}

TEST_F(HeartbeatMonitorTest, StopAndRestart) {
    bool callback_called = false;
    
    monitor->set_timeout_callback([&](const std::string& service_name) {
        callback_called = true;
    });
    
    monitor->start();
    
    const std::string service_name = "stop_test_service";
    monitor->register_service(service_name);
    monitor->heartbeat(service_name);
    
    // Stop the monitor
    monitor->stop();
    
    // Wait longer than timeout while stopped
    std::this_thread::sleep_for(std::chrono::milliseconds(timeout_ms + 50));
    
    // Should not have called timeout callback while stopped
    EXPECT_FALSE(callback_called);
    
    // Restart the monitor
    monitor->start();
    
    // Send heartbeat after restart
    monitor->heartbeat(service_name);
    
    // Wait and verify it's working again
    std::this_thread::sleep_for(std::chrono::milliseconds(timeout_ms / 2));
    monitor->heartbeat(service_name);
    
    EXPECT_FALSE(callback_called);
}