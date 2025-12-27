#pragma once

#include "risk_types.hpp"
#include "high_res_timer.hpp"
#include <memory>
#include <unordered_map>
#include <atomic>
#include <mutex>

namespace tradeflow {

class PreTradeValidator {
public:
    PreTradeValidator();
    ~PreTradeValidator() = default;
    
    // Main validation function - must complete in <2μs
    RiskValidation validateOrder(const OrderRequest& order, 
                                const PortfolioState& portfolio,
                                const RiskParameters& params) noexcept;
    
    // Position size calculation with risk parameters
    double calculateOptimalPositionSize(const OrderRequest& order,
                                       const PortfolioState& portfolio,
                                       const RiskParameters& params) noexcept;
    
    // Portfolio exposure monitoring
    double calculateSectorExposure(const std::string& sector,
                                  const PortfolioState& portfolio) noexcept;
    
    double calculateTotalExposure(const PortfolioState& portfolio) noexcept;
    
    // Correlation and concentration risk checks
    double calculatePositionCorrelation(const std::string& symbol,
                                       const PortfolioState& portfolio) noexcept;
    
    bool checkConcentrationRisk(const OrderRequest& order,
                               const PortfolioState& portfolio,
                               const RiskParameters& params) noexcept;
    
    // Update correlation matrix (called periodically)
    void updateCorrelationMatrix(const std::string& symbol1,
                                const std::string& symbol2,
                                double correlation) noexcept;
    
    // Performance metrics
    uint64_t getLastValidationTime() const noexcept { return last_validation_time_.load(); }
    uint64_t getTotalValidations() const noexcept { return total_validations_.load(); }
    uint64_t getRejectedOrders() const noexcept { return rejected_orders_.load(); }
    
private:
    // Fast validation helpers
    bool validatePositionSize(const OrderRequest& order,
                             const PortfolioState& portfolio,
                             const RiskParameters& params,
                             double& suggested_size) noexcept;
    
    bool validateSectorExposure(const OrderRequest& order,
                               const PortfolioState& portfolio,
                               const RiskParameters& params) noexcept;
    
    bool validateCorrelationRisk(const OrderRequest& order,
                                const PortfolioState& portfolio,
                                const RiskParameters& params) noexcept;
    
    bool validateLeverageLimit(const OrderRequest& order,
                              const PortfolioState& portfolio,
                              const RiskParameters& params) noexcept;
    
    bool validateDailyLossLimit(const OrderRequest& order,
                               const PortfolioState& portfolio,
                               const RiskParameters& params) noexcept;
    
    bool validateMaxPositions(const OrderRequest& order,
                             const PortfolioState& portfolio,
                             const RiskParameters& params) noexcept;
    
    bool validateSufficientFunds(const OrderRequest& order,
                                const PortfolioState& portfolio) noexcept;
    
    // Correlation matrix (lock-free access for hot path)
    static constexpr size_t MAX_SYMBOLS = 1000;
    static constexpr size_t CORRELATION_HASH_SIZE = MAX_SYMBOLS * MAX_SYMBOLS;
    
    struct alignas(64) CorrelationData {
        std::atomic<double> correlation{0.0};
        std::atomic<uint64_t> timestamp{0};
    };
    
    // Pre-allocated correlation matrix for ultra-fast access
    CorrelationData correlation_matrix_[CORRELATION_HASH_SIZE];
    
    // Hash function for symbol pairs
    size_t hashSymbolPair(const std::string& symbol1, const std::string& symbol2) const noexcept;
    
    // Performance counters
    mutable std::atomic<uint64_t> last_validation_time_{0};
    mutable std::atomic<uint64_t> total_validations_{0};
    mutable std::atomic<uint64_t> rejected_orders_{0};
    
    // Sector mapping cache (updated periodically)
    std::unordered_map<std::string, std::string> symbol_to_sector_;
    mutable std::mutex sector_mutex_;
};

} // namespace tradeflow