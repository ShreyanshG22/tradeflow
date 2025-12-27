# TradeFlow Backend Infrastructure

This is the backend infrastructure for the TradeFlow algorithmic trading platform.

## Architecture

The backend is organized as a monorepo with the following structure:

- `services/` - Node.js microservices
- `engines/` - C++ high-performance components
- `shared/` - Shared libraries and utilities
- `docker/` - Docker configurations
- `scripts/` - Build and deployment scripts

## Services

### Node.js Services
- **api-gateway** - Central API gateway and routing
- **user-service** - User management and authentication
- **strategy-service** - Trading strategy management
- **portfolio-service** - Portfolio tracking and management
- **market-data-service** - Market data integration

### C++ Engines
- **trading-engine** - Ultra-low latency trading execution
- **backtest-engine** - High-performance backtesting
- **risk-manager** - Real-time risk management
- **market-data-parser** - High-speed market data processing

## Development Setup

1. Install dependencies: `npm install`
2. Start development environment: `docker-compose up -d`
3. Build C++ components: `./scripts/build-cpp.sh`
4. Start services: `npm run dev`

## Requirements

- Node.js 18+
- Docker and Docker Compose
- CMake 3.20+
- GCC 11+ or Clang 14+
- PostgreSQL 14+
- Redis 7+