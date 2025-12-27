# Dynamic Risk Enforcer

## Overview

The Dynamic Risk Enforcer is a C++ component that implements automatic position sizing based on volatility, drawdown-based position reduction, and emergency stop-loss and liquidation systems. It provides real-time risk management with ultra-low latency performance.

## Features

### 1. Automatic Position Sizing Based on Volatility

- **Volatility Calculation**: Real-time calculation of symbol volatility using rolling price history
- **Dynamic Adjustment**: Automatically adjusts position size limits based on market volatility
- **Configurable Thresholds**: Customizable volatility thresholds for risk parameter adjustment

### 2. Drawdown-Based Position Reduction

- **Real-time Monitoring**: Continuous monitoring of portfolio drawdown levels
- **Tiered Response**: Multiple drawdown thresholds with escalating responses:
  - Minor drawdown (5%): Reduce new position sizes by 25%
  - Major drawdown (10%): Reduce existing positions by 50%
  - Critical drawdown (15%): Emergency liquidation of all positions

### 3. Emergency Stop-Loss and Liquidation System

- **Circuit Breaker**: Automatic trading halt when emergency conditions are detected
- **Forced Liquidation**: Automatic position liquidation in extreme risk scenarios
- **Multiple Triggers**: Emergency conditions based on:
  - Daily loss thresholds
  - Leverage limits
  - Portfolio VaR (Value at Risk)

## Architecture

### Core Components

1. **DynamicRiskEnforcer**: Main class coordinating all risk enforcement activities
2. **PriceHistory**: Lock-free price history storage for volatility calculations
3. **CircuitBreakerState**: Circuit breaker state management
4. **Risk Parameter Structures**: Configuration for different risk enforcement modes

### Performance Characteristics

- **Ultra-low Latency**: Risk enforcement operations complete in microseconds
- **Lock-free Design**: Minimal contention for real-time operations
- **Memory Efficient**: Pre-allocated data structures to avoid heap allocation
- **Thread Safe**: Safe for concurrent access from multiple threads

## Usage

### Basic Initialization

```cpp
#include "dynamic_risk_enforcer.hpp"

auto monitor = std::make_shared<PortfolioMonitor>();
auto validator = std::make_shared<PreTradeValidator>();
auto enforcer = std::make_unique<DynamicRiskEnforcer>(monitor, validator);
```

### Volatility-Based Risk Adjustment

```cpp
// Configure volatility parameters
VolatilityRiskParams vol_params;
vol_params.high_volatility_threshold = 0.03;  // 3% daily volatility
vol_params.volatility_adjustment_factor = 0.5; // 50% reduction in high vol

// Adjust risk parameters based on symbol volatility
RiskParameters base_params;
base_params.max_position_size_pct = 0.05;

RiskParameters adjusted = enforcer->adjustForVolatility(base_params, "AAPL", vol_params);
```

### Drawdown-Based Position Reduction

```cpp
// Configure drawdown parameters
DrawdownRiskParams drawdown_params;
drawdown_params.minor_drawdown_threshold = 0.05;    // 5%
drawdown_params.major_drawdown_threshold = 0.10;    // 10%
drawdown_params.critical_drawdown_threshold = 0.15; // 15%

// Enforce drawdown limits
RiskEnforcementResult result = enforcer->enforceDrawdownLimits(user_id, drawdown_params);
```

### Emergency Stop-Loss System

```cpp
// Configure emergency parameters
EmergencyStopParams emergency_params;
emergency_params.daily_loss_emergency_threshold = 0.03;  // 3%
emergency_params.enable_circuit_breaker = true;
emergency_params.circuit_breaker_duration_ms = 300000;  // 5 minutes

// Check emergency conditions
RiskEnforcementResult result = enforcer->checkEmergencyConditions(user_id, emergency_params);
```

### Integrated Risk Enforcement

```cpp
// Run complete risk enforcement
RiskEnforcementResult result = enforcer->enforceRiskLimits(
    user_id, base_params, vol_params, drawdown_params, emergency_params);

// Handle enforcement actions
switch (result.action) {
    case RiskEnforcementAction::REDUCE_POSITION_SIZE:
        // Reduce new position sizes
        break;
    case RiskEnforcementAction::REDUCE_EXISTING_POSITIONS:
        // Reduce existing positions
        break;
    case RiskEnforcementAction::EMERGENCY_LIQUIDATION:
        // Execute emergency liquidation
        break;
    case RiskEnforcementAction::CIRCUIT_BREAKER_ACTIVATED:
        // Trading halted
        break;
}
```

## Configuration Parameters

### VolatilityRiskParams

- `low_volatility_threshold`: Threshold below which risk limits are relaxed (default: 1.5%)
- `high_volatility_threshold`: Threshold above which risk limits are tightened (default: 3.5%)
- `volatility_adjustment_factor`: Factor by which to adjust risk limits (default: 0.5)
- `volatility_lookback_period`: Number of periods for volatility calculation (default: 20)

### DrawdownRiskParams

- `minor_drawdown_threshold`: Minor drawdown threshold (default: 5%)
- `major_drawdown_threshold`: Major drawdown threshold (default: 10%)
- `critical_drawdown_threshold`: Critical drawdown threshold (default: 15%)
- `minor_position_reduction`: Position reduction for minor drawdown (default: 25%)
- `major_position_reduction`: Position reduction for major drawdown (default: 50%)
- `critical_position_reduction`: Position reduction for critical drawdown (default: 75%)

### EmergencyStopParams

- `daily_loss_emergency_threshold`: Daily loss threshold for emergency (default: 3%)
- `portfolio_var_threshold`: Portfolio VaR threshold (default: 5%)
- `leverage_emergency_threshold`: Leverage threshold for emergency (default: 2.5x)
- `circuit_breaker_duration_ms`: Circuit breaker duration (default: 5 minutes)

## Performance Metrics

The Dynamic Risk Enforcer provides comprehensive performance metrics:

- `getTotalEnforcements()`: Total number of risk enforcement actions
- `getEmergencyStops()`: Number of emergency stops triggered
- `getCircuitBreakerActivations()`: Number of circuit breaker activations
- `getForcedLiquidations()`: Number of forced liquidations executed

## Testing

### Unit Tests

Run the comprehensive test suite:

```bash
cd backend/engines/build
make minimal-risk-test
./risk-manager/minimal-risk-test
```

### Integration Tests

Test with portfolio monitor integration:

```bash
make test-dynamic-integration
./risk-manager/test-dynamic-integration
```

## Requirements Satisfied

This implementation satisfies the following requirements from task 8.2:

1. **Automatic position sizing based on volatility**: ✅
   - Real-time volatility calculation using rolling price history
   - Dynamic adjustment of position size limits based on market conditions
   - Configurable volatility thresholds and adjustment factors

2. **Drawdown-based position reduction**: ✅
   - Multi-tiered drawdown monitoring with escalating responses
   - Automatic position reduction based on portfolio performance
   - Configurable drawdown thresholds and reduction factors

3. **Emergency stop-loss and liquidation system**: ✅
   - Circuit breaker functionality for trading halts
   - Forced liquidation capabilities for extreme risk scenarios
   - Multiple emergency triggers (daily loss, leverage, VaR)

## Integration with Trading System

The Dynamic Risk Enforcer integrates seamlessly with the existing risk management infrastructure:

- **Portfolio Monitor**: Real-time portfolio state monitoring
- **Pre-Trade Validator**: Risk validation for new orders
- **Trading Engine**: Order execution and position management
- **Market Data Service**: Real-time price feeds for volatility calculation

## Future Enhancements

Potential future improvements:

1. **Machine Learning Integration**: Use ML models for volatility prediction
2. **Correlation-Based Risk**: Advanced correlation risk management
3. **Sector Rotation**: Dynamic sector exposure management
4. **Options Integration**: Options-based hedging strategies
5. **Backtesting Integration**: Historical risk enforcement simulation