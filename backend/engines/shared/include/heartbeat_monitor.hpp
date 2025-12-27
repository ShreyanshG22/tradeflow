#pragma once

#include <atomic>
#include <chrono>
#include <thread>
#include <functional>
#include <string>
#include <memory>

namespace tradeflow {
namespace monitoring {

class HeartbeatMonitor {
public:
    using HeartbeatCallback = std::function<void(const std::string& service, bool alive)>;
    
    HeartbeatMonitor(const std::string& service_name, 
                    std::chrono::milliseconds interval = std::chrono::milliseconds(5000));
    ~HeartbeatMonitor();

    // Start/stop heartbeat monitoring
    void start();
    void stop();
    
    // Update heartbeat (call this regularly from your service)
    void pulse();
    
    // Set callback for heartbeat status changes
    void set_callback(HeartbeatCallback callback);
    
    // Get current status
    bool is_alive() const;
    std::chrono::steady_clock::time_point last_heartbeat() const;
    
    // Configuration
    void set_timeout(std::chrono::milliseconds timeout);
    void set_interval(std::chrono::milliseconds interval);

private:
    void monitor_loop();
    void send_heartbeat();
    
    std::string service_name_;
    std::chrono::milliseconds interval_;
    std::chrono::milliseconds timeout_;
    
    std::atomic<bool> running_{false};
    std::atomic<bool> alive_{true};
    std::atomic<std::chrono::steady_clock::time_point> last_heartbeat_;
    
    std::unique_ptr<std::thread> monitor_thread_;
    HeartbeatCallback callback_;
};

// Shared memory heartbeat for inter-process communication
class SharedHeartbeat {
public:
    struct HeartbeatData {
        std::atomic<uint64_t> timestamp;
        std::atomic<uint32_t> sequence;
        std::atomic<bool> alive;
        char service_name[64];
        char status_message[256];
    };
    
    SharedHeartbeat(const std::string& service_name, const std::string& shm_name);
    ~SharedHeartbeat();
    
    bool initialize();
    void pulse(const std::string& status = "");
    void shutdown();
    
    // Reader methods (for monitoring service)
    static std::vector<HeartbeatData> read_all_heartbeats(const std::string& shm_name);
    static bool is_service_alive(const std::string& service_name, 
                                const std::string& shm_name,
                                std::chrono::milliseconds timeout = std::chrono::milliseconds(10000));

private:
    std::string service_name_;
    std::string shm_name_;
    HeartbeatData* data_;
    int shm_fd_;
    bool initialized_;
};

// Performance metrics collector
class PerformanceCollector {
public:
    struct Metrics {
        std::atomic<uint64_t> operations_count{0};
        std::atomic<uint64_t> total_latency_ns{0};
        std::atomic<uint64_t> min_latency_ns{UINT64_MAX};
        std::atomic<uint64_t> max_latency_ns{0};
        std::atomic<uint64_t> error_count{0};
        std::atomic<uint64_t> last_update_timestamp{0};
    };
    
    PerformanceCollector(const std::string& service_name);
    ~PerformanceCollector();
    
    void record_operation(uint64_t latency_ns, bool success = true);
    void record_error();
    
    Metrics get_metrics() const;
    void reset_metrics();
    
    // Get formatted metrics for logging
    std::string get_metrics_json() const;

private:
    std::string service_name_;
    Metrics metrics_;
    mutable std::mutex metrics_mutex_;
};

} // namespace monitoring
} // namespace tradeflow