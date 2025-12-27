#pragma once

#include "risk_types.hpp"
#include "high_res_timer.hpp"
#include <memory>
#include <unordered_map>
#include <atomic>
#include <mutex>

namespace tradeflow {

class PortfolioMonitor {
public:
    PortfolioMonitor();
    ~PortfolioMonitor() = default;
    
    // Real-time portfolio exposure monitoring
    void updatePosition(const std::string& user_id,
                       const std::string& symbol,
                       double quantity,
                       double price,
                       const std::string& sector = "") noexcept;
    
    void updateMarketPrice(const std::string& symbol, double price) noexcept;
    
    // Portfolio state retrieval (lock-free for hot path)
    PortfolioState getPortfolioState(const std::string& user_id) const noexcept;
    
    // Real-time exposure calculations
    double calculateRealTimeExposure(const std::string& user_id) const noexcept;
    
    double calculateSectorExposure(const std::string& user_id,
                                  const std::string& sector) const noexcept;
    
    double calculateUnrealizedPnL(const std::string& user_id) const noexcept;
    
    // Risk metrics calculation
    double calculatePortfolioVaR(const std::string& user_id,
                                double confidence_level = 0.95) const noexcept;
    
    double calculateMaxDrawdown(const std::string& user_id) const noexcept;
    
    double calculateLeverageRatio(const std::string& user_id) const noexcept;
    
    // Portfolio statistics
    uint32_t getPositionCount(const std::string& user_id) const noexcept;
    
    std::unordered_map<std::string, double> getSectorBreakdown(const std::string& user_id) const;
    
    // Performance monitoring
    uint64_t getLastUpdateTime(const std::string& user_id) const noexcept;
    
    uint64_t getTotalUpdates() const noexcept { return total_updates_.load(); }
    
private:
    // Portfolio storage with lock-free access patterns
    static constexpr size_t MAX_USERS = 10000;
    static constexpr size_t MAX_POSITIONS_PER_USER = 100;
    
    struct alignas(64) UserPortfolio {
        std::atomic<bool> active{false};
        std::atomic<double> cash_balance{0.0};
        std::atomic<double> total_equity{0.0};
        std::atomic<double> daily_pnl{0.0};
        std::atomic<double> max_drawdown{0.0};
        std::atomic<uint32_t> position_count{0};
        std::atomic<uint64_t> last_update{0};
        
        // Position data (protected by mutex for updates)
        std::unordered_map<std::string, Position> positions;
        std::unordered_map<std::string, double> sector_exposures;
        mutable std::mutex positions_mutex;
    };
    
    // User portfolio storage
    std::unordered_map<std::string, std::unique_ptr<UserPortfolio>> portfolios_;
    mutable std::mutex portfolios_mutex_;
    
    // Market price cache for P&L calculations
    struct alignas(64) PriceData {
        std::atomic<double> price{0.0};
        std::atomic<uint64_t> timestamp{0};
    };
    
    std::unordered_map<std::string, std::unique_ptr<PriceData>> market_prices_;
    mutable std::mutex prices_mutex_;
    
    // Helper functions
    UserPortfolio* getOrCreatePortfolio(const std::string& user_id);
    
    void updatePortfolioMetrics(UserPortfolio* portfolio) noexcept;
    
    double calculatePositionValue(const Position& position, double current_price) const noexcept;
    
    std::string getSymbolSector(const std::string& symbol) const;
    
    // Performance counters
    mutable std::atomic<uint64_t> total_updates_{0};
    
    // Sector mapping
    std::unordered_map<std::string, std::string> symbol_to_sector_;
    mutable std::mutex sector_mutex_;
};

} // namespace tradeflow