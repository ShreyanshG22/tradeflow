#pragma once

#include <cstdint>
#include <string>
#include <unordered_map>
#include <atomic>

namespace tradeflow {

// Risk parameter configuration
struct RiskParameters {
    double max_position_size_pct = 0.05;      // 5% of portfolio per position
    double max_sector_exposure_pct = 0.20;    // 20% max sector exposure
    double max_correlation_threshold = 0.7;   // Max correlation between positions
    double max_daily_loss_pct = 0.02;         // 2% max daily loss
    double max_drawdown_pct = 0.10;           // 10% max drawdown
    uint32_t max_positions = 50;              // Max number of positions
    double leverage_limit = 2.0;              // Max leverage ratio
};

// Position information
struct Position {
    std::string symbol;
    double quantity;
    double avg_price;
    double current_price;
    double unrealized_pnl;
    double market_value;
    std::string sector;
    uint64_t timestamp;
    
    Position() = default;
    Position(const std::string& sym, double qty, double price, const std::string& sec = "")
        : symbol(sym), quantity(qty), avg_price(price), current_price(price), 
          unrealized_pnl(0.0), market_value(qty * price), sector(sec), 
          timestamp(0) {}
};

// Portfolio state
struct PortfolioState {
    std::string user_id;
    double cash_balance;
    double total_equity;
    double total_market_value;
    double daily_pnl;
    double unrealized_pnl;
    double realized_pnl;
    double max_drawdown;
    uint32_t position_count;
    std::unordered_map<std::string, Position> positions;
    std::unordered_map<std::string, double> sector_exposures;
    uint64_t last_update;
    
    PortfolioState() : cash_balance(0), total_equity(0), total_market_value(0),
                      daily_pnl(0), unrealized_pnl(0), realized_pnl(0),
                      max_drawdown(0), position_count(0), last_update(0) {}
};

// Order information for pre-trade validation
struct OrderRequest {
    std::string user_id;
    std::string symbol;
    std::string side;  // "BUY" or "SELL"
    double quantity;
    double price;
    std::string order_type;  // "MARKET", "LIMIT", etc.
    std::string sector;
    uint64_t timestamp;
    
    OrderRequest() = default;
    OrderRequest(const std::string& uid, const std::string& sym, const std::string& s,
                double qty, double p, const std::string& type = "MARKET")
        : user_id(uid), symbol(sym), side(s), quantity(qty), price(p), 
          order_type(type), timestamp(0) {}
};

// Risk validation result
enum class RiskValidationResult {
    APPROVED,
    REJECTED_POSITION_SIZE,
    REJECTED_SECTOR_EXPOSURE,
    REJECTED_CORRELATION,
    REJECTED_DAILY_LOSS,
    REJECTED_DRAWDOWN,
    REJECTED_MAX_POSITIONS,
    REJECTED_LEVERAGE,
    REJECTED_INSUFFICIENT_FUNDS,
    REJECTED_UNKNOWN_ERROR
};

struct RiskValidation {
    RiskValidationResult result;
    std::string reason;
    double suggested_quantity;
    double risk_score;
    uint64_t validation_time_ns;
    
    RiskValidation() : result(RiskValidationResult::REJECTED_UNKNOWN_ERROR),
                      suggested_quantity(0), risk_score(0), validation_time_ns(0) {}
};

// Correlation matrix entry
struct CorrelationEntry {
    std::string symbol1;
    std::string symbol2;
    double correlation;
    uint64_t last_updated;
};

} // namespace tradeflow