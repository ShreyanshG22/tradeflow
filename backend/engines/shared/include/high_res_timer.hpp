#pragma once

#include <chrono>
#include <cstdint>

namespace tradeflow {

class HighResTimer {
public:
    using TimePoint = std::chrono::high_resolution_clock::time_point;
    using Duration = std::chrono::nanoseconds;
    
    static uint64_t now_nanos() {
        auto now = std::chrono::high_resolution_clock::now();
        return std::chrono::duration_cast<std::chrono::nanoseconds>(
            now.time_since_epoch()).count();
    }
    
    static double to_microseconds(uint64_t nanos) {
        return static_cast<double>(nanos) / 1000.0;
    }
    
    static double to_milliseconds(uint64_t nanos) {
        return static_cast<double>(nanos) / 1000000.0;
    }
    
    static TimePoint now() {
        return std::chrono::high_resolution_clock::now();
    }
    
    static uint64_t elapsed_nanos(const TimePoint& start) {
        auto end = std::chrono::high_resolution_clock::now();
        return std::chrono::duration_cast<std::chrono::nanoseconds>(
            end - start).count();
    }
    
    static double elapsed_microseconds(const TimePoint& start) {
        return to_microseconds(elapsed_nanos(start));
    }
};

} // namespace tradeflow