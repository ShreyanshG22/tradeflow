#include "heartbeat_monitor.hpp"
#include <sys/mman.h>
#include <sys/stat.h>
#include <fcntl.h>
#include <unistd.h>
#include <cstring>
#include <iostream>
#include <sstream>
#include <iomanip>

namespace tradeflow {
namespace monitoring {

HeartbeatMonitor::HeartbeatMonitor(const std::string& service_name, 
                                 std::chrono::milliseconds interval)
    : service_name_(service_name)
    , interval_(interval)
    , timeout_(interval * 3) // Default timeout is 3x interval
{
    last_heartbeat_.store(std::chrono::steady_clock::now());
}

HeartbeatMonitor::~HeartbeatMonitor() {
    stop();
}

void HeartbeatMonitor::start() {
    if (running_.load()) {
        return;
    }
    
    running_.store(true);
    alive_.store(true);
    last_heartbeat_.store(std::chrono::steady_clock::now());
    
    monitor_thread_ = std::make_unique<std::thread>(&HeartbeatMonitor::monitor_loop, this);
}

void HeartbeatMonitor::stop() {
    running_.store(false);
    
    if (monitor_thread_ && monitor_thread_->joinable()) {
        monitor_thread_->join();
    }
}

void HeartbeatMonitor::pulse() {
    last_heartbeat_.store(std::chrono::steady_clock::now());
    
    if (!alive_.load()) {
        alive_.store(true);
        if (callback_) {
            callback_(service_name_, true);
        }
    }
}

void HeartbeatMonitor::set_callback(HeartbeatCallback callback) {
    callback_ = callback;
}

bool HeartbeatMonitor::is_alive() const {
    return alive_.load();
}

std::chrono::steady_clock::time_point HeartbeatMonitor::last_heartbeat() const {
    return last_heartbeat_.load();
}

void HeartbeatMonitor::set_timeout(std::chrono::milliseconds timeout) {
    timeout_ = timeout;
}

void HeartbeatMonitor::set_interval(std::chrono::milliseconds interval) {
    interval_ = interval;
}

void HeartbeatMonitor::monitor_loop() {
    while (running_.load()) {
        std::this_thread::sleep_for(interval_);
        
        auto now = std::chrono::steady_clock::now();
        auto last = last_heartbeat_.load();
        auto elapsed = std::chrono::duration_cast<std::chrono::milliseconds>(now - last);
        
        bool currently_alive = elapsed < timeout_;
        bool was_alive = alive_.load();
        
        if (currently_alive != was_alive) {
            alive_.store(currently_alive);
            if (callback_) {
                callback_(service_name_, currently_alive);
            }
        }
        
        send_heartbeat();
    }
}

void HeartbeatMonitor::send_heartbeat() {
    // This could send heartbeat to external monitoring system
    // For now, we just update internal state
    auto now = std::chrono::steady_clock::now();
    auto timestamp = std::chrono::duration_cast<std::chrono::milliseconds>(
        now.time_since_epoch()).count();
    
    // Log heartbeat (could be sent to monitoring service via HTTP/UDP)
    std::cout << "[HEARTBEAT] " << service_name_ 
              << " alive=" << (alive_.load() ? "true" : "false")
              << " timestamp=" << timestamp << std::endl;
}

// SharedHeartbeat implementation
SharedHeartbeat::SharedHeartbeat(const std::string& service_name, const std::string& shm_name)
    : service_name_(service_name)
    , shm_name_(shm_name)
    , data_(nullptr)
    , shm_fd_(-1)
    , initialized_(false)
{
}

SharedHeartbeat::~SharedHeartbeat() {
    shutdown();
}

bool SharedHeartbeat::initialize() {
    if (initialized_) {
        return true;
    }
    
    // Create or open shared memory
    shm_fd_ = shm_open(shm_name_.c_str(), O_CREAT | O_RDWR, 0666);
    if (shm_fd_ == -1) {
        std::cerr << "Failed to create shared memory: " << strerror(errno) << std::endl;
        return false;
    }
    
    // Set size
    if (ftruncate(shm_fd_, sizeof(HeartbeatData)) == -1) {
        std::cerr << "Failed to set shared memory size: " << strerror(errno) << std::endl;
        close(shm_fd_);
        return false;
    }
    
    // Map memory
    data_ = static_cast<HeartbeatData*>(
        mmap(nullptr, sizeof(HeartbeatData), PROT_READ | PROT_WRITE, MAP_SHARED, shm_fd_, 0)
    );
    
    if (data_ == MAP_FAILED) {
        std::cerr << "Failed to map shared memory: " << strerror(errno) << std::endl;
        close(shm_fd_);
        return false;
    }
    
    // Initialize data
    strncpy(data_->service_name, service_name_.c_str(), sizeof(data_->service_name) - 1);
    data_->service_name[sizeof(data_->service_name) - 1] = '\0';
    data_->alive.store(true);
    data_->sequence.store(0);
    
    initialized_ = true;
    return true;
}

void SharedHeartbeat::pulse(const std::string& status) {
    if (!initialized_ || !data_) {
        return;
    }
    
    auto now = std::chrono::steady_clock::now();
    auto timestamp = std::chrono::duration_cast<std::chrono::nanoseconds>(
        now.time_since_epoch()).count();
    
    data_->timestamp.store(timestamp);
    data_->sequence.fetch_add(1);
    data_->alive.store(true);
    
    if (!status.empty()) {
        strncpy(data_->status_message, status.c_str(), sizeof(data_->status_message) - 1);
        data_->status_message[sizeof(data_->status_message) - 1] = '\0';
    }
}

void SharedHeartbeat::shutdown() {
    if (data_) {
        data_->alive.store(false);
        munmap(data_, sizeof(HeartbeatData));
        data_ = nullptr;
    }
    
    if (shm_fd_ != -1) {
        close(shm_fd_);
        shm_fd_ = -1;
    }
    
    initialized_ = false;
}

std::vector<SharedHeartbeat::HeartbeatData> SharedHeartbeat::read_all_heartbeats(const std::string& shm_name) {
    std::vector<HeartbeatData> results;
    
    int shm_fd = shm_open(shm_name.c_str(), O_RDONLY, 0666);
    if (shm_fd == -1) {
        return results;
    }
    
    HeartbeatData* data = static_cast<HeartbeatData*>(
        mmap(nullptr, sizeof(HeartbeatData), PROT_READ, MAP_SHARED, shm_fd, 0)
    );
    
    if (data != MAP_FAILED) {
        results.push_back(*data);
        munmap(data, sizeof(HeartbeatData));
    }
    
    close(shm_fd);
    return results;
}

bool SharedHeartbeat::is_service_alive(const std::string& service_name, 
                                     const std::string& shm_name,
                                     std::chrono::milliseconds timeout) {
    auto heartbeats = read_all_heartbeats(shm_name);
    
    for (const auto& hb : heartbeats) {
        if (std::string(hb.service_name) == service_name) {
            if (!hb.alive.load()) {
                return false;
            }
            
            auto now = std::chrono::steady_clock::now();
            auto hb_time = std::chrono::steady_clock::time_point(
                std::chrono::nanoseconds(hb.timestamp.load())
            );
            
            auto elapsed = std::chrono::duration_cast<std::chrono::milliseconds>(now - hb_time);
            return elapsed < timeout;
        }
    }
    
    return false;
}

// PerformanceCollector implementation
PerformanceCollector::PerformanceCollector(const std::string& service_name)
    : service_name_(service_name)
{
    auto now = std::chrono::steady_clock::now();
    auto timestamp = std::chrono::duration_cast<std::chrono::nanoseconds>(
        now.time_since_epoch()).count();
    metrics_.last_update_timestamp.store(timestamp);
}

PerformanceCollector::~PerformanceCollector() = default;

void PerformanceCollector::record_operation(uint64_t latency_ns, bool success) {
    std::lock_guard<std::mutex> lock(metrics_mutex_);
    
    metrics_.operations_count.fetch_add(1);
    metrics_.total_latency_ns.fetch_add(latency_ns);
    
    // Update min/max latency
    uint64_t current_min = metrics_.min_latency_ns.load();
    while (latency_ns < current_min && 
           !metrics_.min_latency_ns.compare_exchange_weak(current_min, latency_ns)) {
        // Retry if another thread updated it
    }
    
    uint64_t current_max = metrics_.max_latency_ns.load();
    while (latency_ns > current_max && 
           !metrics_.max_latency_ns.compare_exchange_weak(current_max, latency_ns)) {
        // Retry if another thread updated it
    }
    
    if (!success) {
        metrics_.error_count.fetch_add(1);
    }
    
    auto now = std::chrono::steady_clock::now();
    auto timestamp = std::chrono::duration_cast<std::chrono::nanoseconds>(
        now.time_since_epoch()).count();
    metrics_.last_update_timestamp.store(timestamp);
}

void PerformanceCollector::record_error() {
    metrics_.error_count.fetch_add(1);
    
    auto now = std::chrono::steady_clock::now();
    auto timestamp = std::chrono::duration_cast<std::chrono::nanoseconds>(
        now.time_since_epoch()).count();
    metrics_.last_update_timestamp.store(timestamp);
}

PerformanceCollector::Metrics PerformanceCollector::get_metrics() const {
    std::lock_guard<std::mutex> lock(metrics_mutex_);
    return metrics_;
}

void PerformanceCollector::reset_metrics() {
    std::lock_guard<std::mutex> lock(metrics_mutex_);
    
    metrics_.operations_count.store(0);
    metrics_.total_latency_ns.store(0);
    metrics_.min_latency_ns.store(UINT64_MAX);
    metrics_.max_latency_ns.store(0);
    metrics_.error_count.store(0);
    
    auto now = std::chrono::steady_clock::now();
    auto timestamp = std::chrono::duration_cast<std::chrono::nanoseconds>(
        now.time_since_epoch()).count();
    metrics_.last_update_timestamp.store(timestamp);
}

std::string PerformanceCollector::get_metrics_json() const {
    auto m = get_metrics();
    
    std::ostringstream oss;
    oss << "{"
        << "\"service\":\"" << service_name_ << "\","
        << "\"operations_count\":" << m.operations_count.load() << ","
        << "\"total_latency_ns\":" << m.total_latency_ns.load() << ","
        << "\"min_latency_ns\":" << m.min_latency_ns.load() << ","
        << "\"max_latency_ns\":" << m.max_latency_ns.load() << ","
        << "\"error_count\":" << m.error_count.load() << ","
        << "\"last_update_timestamp\":" << m.last_update_timestamp.load();
    
    uint64_t ops = m.operations_count.load();
    if (ops > 0) {
        double avg_latency = static_cast<double>(m.total_latency_ns.load()) / ops;
        double error_rate = static_cast<double>(m.error_count.load()) / ops * 100.0;
        
        oss << ",\"avg_latency_ns\":" << std::fixed << std::setprecision(2) << avg_latency
            << ",\"error_rate_percent\":" << std::fixed << std::setprecision(2) << error_rate;
    }
    
    oss << "}";
    return oss.str();
}

} // namespace monitoring
} // namespace tradeflow