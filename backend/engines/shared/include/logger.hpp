#pragma once

#include <string>
#include <memory>
#include <sstream>

namespace tradeflow {

enum class LogLevel {
    DEBUG = 0,
    INFO = 1,
    WARN = 2,
    ERROR = 3,
    FATAL = 4
};

class Logger {
public:
    static Logger& getInstance();
    
    void setLevel(LogLevel level);
    void log(LogLevel level, const std::string& message);
    
    template<typename... Args>
    void debug(const std::string& format, Args&&... args) {
        if (level_ <= LogLevel::DEBUG) {
            log(LogLevel::DEBUG, formatMessage(format, std::forward<Args>(args)...));
        }
    }
    
    template<typename... Args>
    void info(const std::string& format, Args&&... args) {
        if (level_ <= LogLevel::INFO) {
            log(LogLevel::INFO, formatMessage(format, std::forward<Args>(args)...));
        }
    }
    
    template<typename... Args>
    void warn(const std::string& format, Args&&... args) {
        if (level_ <= LogLevel::WARN) {
            log(LogLevel::WARN, formatMessage(format, std::forward<Args>(args)...));
        }
    }
    
    template<typename... Args>
    void error(const std::string& format, Args&&... args) {
        if (level_ <= LogLevel::ERROR) {
            log(LogLevel::ERROR, formatMessage(format, std::forward<Args>(args)...));
        }
    }

private:
    Logger() = default;
    LogLevel level_ = LogLevel::INFO;
    
    template<typename... Args>
    std::string formatMessage(const std::string& format, Args&&... args) {
        std::ostringstream oss;
        formatImpl(oss, format, std::forward<Args>(args)...);
        return oss.str();
    }
    
    void formatImpl(std::ostringstream& oss, const std::string& format) {
        oss << format;
    }
    
    template<typename T, typename... Args>
    void formatImpl(std::ostringstream& oss, const std::string& format, T&& value, Args&&... args) {
        size_t pos = format.find("{}");
        if (pos != std::string::npos) {
            oss << format.substr(0, pos) << std::forward<T>(value);
            formatImpl(oss, format.substr(pos + 2), std::forward<Args>(args)...);
        } else {
            oss << format;
        }
    }
};

} // namespace tradeflow