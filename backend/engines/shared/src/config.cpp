#include <string>
#include <map>
#include <cstdlib>

namespace tradeflow {

class Config {
public:
    static Config& getInstance() {
        static Config instance;
        return instance;
    }
    
    std::string get(const std::string& key, const std::string& defaultValue = "") {
        const char* env_val = std::getenv(key.c_str());
        return env_val ? std::string(env_val) : defaultValue;
    }
    
    int getInt(const std::string& key, int defaultValue = 0) {
        const char* env_val = std::getenv(key.c_str());
        return env_val ? std::stoi(env_val) : defaultValue;
    }
    
    bool getBool(const std::string& key, bool defaultValue = false) {
        const char* env_val = std::getenv(key.c_str());
        if (!env_val) return defaultValue;
        std::string val(env_val);
        return val == "true" || val == "1" || val == "yes";
    }

private:
    Config() = default;
};

} // namespace tradeflow