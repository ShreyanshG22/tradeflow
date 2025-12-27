# Risk Reporting and Alerting System

## Overview

The Risk Reporting and Alerting system provides real-time risk metrics calculation, risk limit breach notifications, and risk dashboard data aggregation for the TradeFlow trading platform. This system is implemented in C++ for ultra-low latency performance and integrates with the existing risk management infrastructure.

## Components

### 1. RiskReporter Class

The main class that orchestrates risk reporting and alerting functionality.

**Key Features:**
- Real-time risk metrics calculation
- Risk limit breach detection and alerting
- Dashboard data aggregation
- Historical risk data tracking
- Alert management and acknowledgment
- Performance monitoring

### 2. Risk Metrics

The system calculates comprehensive risk metrics including:

- **Portfolio Metrics:**
  - Portfolio value and daily P&L
  - Unrealized and realized P&L percentages
  - Maximum and current drawdown
  - Position count and active strategies

- **Risk Metrics:**
  - Portfolio Value-at-Risk (95% and 99% confidence levels)
  - Leverage ratio
  - Sector concentration risk (Herfindahl-Hirschman Index)
  - Correlation risk between positions

### 3. Alert System

**Alert Types:**
- Position size breach
- Sector exposure breach
- Correlation breach
- Daily loss breach
- Drawdown breach
- Leverage breach
- VaR breach
- Circuit breaker activation
- Emergency liquidation
- System errors

**Alert Levels:**
- INFO: Informational messages
- WARNING: Risk limits approaching
- CRITICAL: Risk limits exceeded
- EMERGENCY: Immediate action required

### 4. Dashboard Data Aggregation

The system provides comprehensive dashboard data including:
- Current risk metrics
- Active alerts
- Sector exposure breakdown
- Position risk analysis
- Historical P&L, drawdown, and VaR data

## Usage Examples

### Basic Risk Metrics Calculation

```cpp
#include "risk_reporter.hpp"

// Create dependencies
auto monitor = std::make_shared<PortfolioMonitor>();
auto enforcer = std::make_shared<DynamicRiskEnforcer>(monitor, nullptr);
auto reporter = std::make_unique<RiskReporter>(monitor, enforcer);

// Calculate risk metrics for a user
std::string user_id = "user123";
RiskMetrics metrics = reporter->calculateRiskMetrics(user_id);

std::cout << "Portfolio Value: $" << metrics.portfolio_value << std::endl;
std::cout << "Daily P&L: " << metrics.daily_pnl_pct << "%" << std::endl;
std::cout << "Current Drawdown: " << metrics.current_drawdown_pct << "%" << std::endl;
std::cout << "Leverage Ratio: " << metrics.leverage_ratio << std::endl;
```

### Alert Generation and Management

```cpp
// Generate a risk alert
reporter->generateAlert(user_id,
                       RiskAlertType::POSITION_SIZE_BREACH,
                       RiskAlertLevel::WARNING,
                       "Position size limit exceeded",
                       "AAPL position exceeds 5% portfolio limit",
                       5.0,    // threshold value
                       7.5,    // current value
                       "AAPL"); // affected symbol

// Register alert callback
reporter->registerAlertCallback([](const RiskAlert& alert) {
    std::cout << "Alert: " << alert.message << std::endl;
    // Send notification to external systems
});

// Get active alerts
auto alerts = reporter->getActiveAlerts(user_id);
for (const auto& alert : alerts) {
    std::cout << "Alert: " << alert.message << " (Level: " 
              << static_cast<int>(alert.level) << ")" << std::endl;
}

// Acknowledge an alert
if (!alerts.empty()) {
    reporter->acknowledgeAlert(alerts[0].alert_id);
}
```

### Risk Limit Checking

```cpp
// Set up risk parameters
RiskParameters params;
params.max_position_size_pct = 0.05;      // 5% max position size
params.max_sector_exposure_pct = 0.20;    // 20% max sector exposure
params.max_drawdown_pct = 0.10;           // 10% max drawdown
params.leverage_limit = 2.0;              // 2x max leverage

// Check risk limits (generates alerts if breached)
reporter->checkRiskLimits(user_id, params);
```

### Dashboard Data Generation

```cpp
// Generate comprehensive dashboard data
RiskDashboardData dashboard = reporter->generateDashboardData(user_id);

std::cout << "Dashboard for user: " << dashboard.user_id << std::endl;
std::cout << "Active alerts: " << dashboard.active_alerts.size() << std::endl;
std::cout << "Sector exposures: " << dashboard.sector_exposures.size() << std::endl;

// Access historical data
for (const auto& [timestamp, pnl] : dashboard.pnl_history) {
    std::cout << "P&L at " << timestamp << ": $" << pnl << std::endl;
}
```

### Real-Time Monitoring

```cpp
// Start real-time monitoring with 1-second updates
reporter->startRealTimeMonitoring(1000);

// The system will automatically:
// - Update risk metrics for all active users
// - Check risk limits and generate alerts
// - Process alert queues
// - Update historical data

// Stop monitoring when done
reporter->stopRealTimeMonitoring();
```

## Performance Characteristics

The risk reporting system is designed for high-performance trading environments:

- **Risk Metrics Calculation:** < 100 microseconds per user
- **Alert Generation:** < 10 microseconds per alert
- **Memory Usage:** Lock-free data structures for hot path operations
- **Concurrency:** Thread-safe operations with minimal locking
- **Scalability:** Supports thousands of concurrent users

## Integration with Trading System

The risk reporting system integrates seamlessly with other TradeFlow components:

1. **Portfolio Monitor:** Provides real-time position and P&L data
2. **Dynamic Risk Enforcer:** Supplies risk enforcement actions and circuit breaker status
3. **Market Data Service:** Receives market price updates for risk calculations
4. **API Gateway:** Exposes risk data through REST endpoints and WebSocket feeds
5. **Frontend Dashboard:** Displays real-time risk metrics and alerts

## Configuration

The system can be configured through various parameters:

- **Update Intervals:** Real-time monitoring frequency
- **Alert Thresholds:** Risk limit values for different alert types
- **Historical Data Retention:** Number of data points to keep in memory
- **Performance Monitoring:** Enable/disable latency tracking

## Error Handling

The system implements comprehensive error handling:

- **Graceful Degradation:** Continues operation even if some components fail
- **Exception Safety:** All operations are exception-safe
- **Logging:** Detailed logging for debugging and monitoring
- **Recovery:** Automatic recovery from transient failures

## Testing

The system includes comprehensive tests:

- **Unit Tests:** Individual component testing
- **Integration Tests:** End-to-end workflow testing
- **Performance Tests:** Latency and throughput benchmarks
- **Stress Tests:** High-load scenario testing

Run tests with:
```bash
# Build and run minimal test
make minimal-risk-reporter-test
./risk-manager/minimal-risk-reporter-test

# Build and run comprehensive test
make test-risk-reporter
./risk-manager/test-risk-reporter
```

## Future Enhancements

Planned improvements include:

1. **Machine Learning Integration:** Predictive risk modeling
2. **Advanced Correlation Analysis:** Real-time correlation matrix updates
3. **Stress Testing:** Monte Carlo simulation integration
4. **External Integrations:** Risk data feeds from external providers
5. **Regulatory Reporting:** Automated compliance reporting

## Requirements Satisfied

This implementation satisfies the following requirements from the specification:

- **Requirement 7.4:** Real-time risk metrics calculation and monitoring
- **Requirement 8.3:** Risk limit breach notifications and alerting system
- **Dashboard Integration:** Risk dashboard data aggregation for frontend display

The system provides comprehensive risk reporting and alerting capabilities that enable traders to monitor their risk exposure in real-time and take appropriate action when limits are breached.