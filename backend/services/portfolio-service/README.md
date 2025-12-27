# Portfolio Management Service

The Portfolio Management Service is a core component of the TradeFlow trading platform that handles portfolio tracking, position management, trade recording, and performance analytics.

## Features

### Portfolio Management
- Create and manage multiple portfolios (trading, paper, backtest)
- Real-time portfolio valuation and P&L calculation
- Multi-currency support with automatic conversion
- Portfolio summary and detailed analytics

### Position Tracking
- Real-time position tracking with market price updates
- Automatic position calculation from trades
- Support for long and short positions
- Position-level P&L calculation

### Trade Recording & Reconciliation
- Complete trade lifecycle management
- Trade validation and recording
- Broker trade reconciliation
- Trade statistics and analytics

### Performance Analytics
- Comprehensive performance metrics calculation
- Risk-adjusted returns (Sharpe, Sortino ratios)
- Drawdown analysis and Value at Risk
- Benchmark comparison and attribution analysis
- Automated performance reporting

## API Endpoints

### Portfolios
- `GET /api/portfolios` - Get user portfolios
- `POST /api/portfolios` - Create new portfolio
- `GET /api/portfolios/:id` - Get portfolio details
- `PUT /api/portfolios/:id` - Update portfolio
- `DELETE /api/portfolios/:id` - Delete portfolio
- `GET /api/portfolios/:id/valuation` - Get real-time valuation
- `GET /api/portfolios/:id/summary` - Get portfolio summary
- `GET /api/portfolios/:id/positions` - Get portfolio positions

### Trades
- `POST /api/trades` - Record new trade
- `GET /api/trades/portfolio/:id` - Get portfolio trades
- `GET /api/trades/:id` - Get trade details
- `PATCH /api/trades/:id/status` - Update trade status
- `POST /api/trades/portfolio/:id/reconcile` - Reconcile with broker
- `GET /api/trades/portfolio/:id/statistics` - Get trade statistics

### Performance Analytics
- `POST /api/performance/portfolios/:id/metrics` - Calculate performance metrics
- `POST /api/performance/portfolios/:id/report` - Generate performance report
- `GET /api/performance/portfolios/:id/metrics/latest` - Get latest metrics
- `GET /api/performance/portfolios/:id/metrics/history` - Get metrics history
- `POST /api/performance/compare` - Compare multiple portfolios
- `GET /api/performance/portfolios/:id/dashboard` - Get dashboard data

### Currency
- `GET /api/currencies/supported` - Get supported currencies
- `GET /api/currencies/rates/:base` - Get exchange rates

## Configuration

### Environment Variables

```bash
# Service Configuration
NODE_ENV=development
PORTFOLIO_SERVICE_PORT=3004

# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=tradeflow
DB_USER=postgres
DB_PASSWORD=password

# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_DB=1

# Portfolio Service Specific
PORTFOLIO_UPDATE_INTERVAL=1000
CURRENCY_CACHE_TTL=300
METRICS_INTERVAL=60000
MAX_POSITIONS_PER_PORTFOLIO=1000

# External Services
MARKET_DATA_SERVICE_URL=http://localhost:3003
USER_SERVICE_URL=http://localhost:3001
```

## Installation & Setup

1. Install dependencies:
```bash
npm install
```

2. Copy environment configuration:
```bash
cp .env.example .env
```

3. Build the service:
```bash
npm run build
```

4. Start the service:
```bash
# Development
npm run dev

# Production
npm start
```

## Architecture

### Services
- **PortfolioService**: Core portfolio management and valuation
- **PositionService**: Position tracking and market price updates
- **TradeService**: Trade recording and reconciliation
- **PerformanceService**: Performance analytics and reporting
- **CurrencyService**: Multi-currency support and conversion

### Data Flow
1. Trades are recorded and validated
2. Positions are automatically updated from trades
3. Market prices update position valuations in real-time
4. Portfolio values are calculated from cash + position values
5. Performance metrics are calculated periodically
6. Real-time updates are published via Redis

### Caching Strategy
- Portfolio data: 5 minutes TTL
- Position valuations: 30 seconds TTL
- Currency rates: 5 minutes TTL
- Performance reports: 1 hour TTL

## Performance Considerations

### Real-time Updates
- Position prices updated every second for active portfolios
- Portfolio valuations cached with short TTL
- WebSocket events for real-time client updates

### Database Optimization
- Indexed queries for portfolio and position lookups
- Batch updates for position price changes
- Partitioned tables for large trade volumes

### Scalability
- Horizontal scaling via load balancer
- Redis clustering for high availability
- Database read replicas for analytics queries

## Monitoring & Logging

### Health Checks
- Database connectivity
- Redis connectivity
- Service dependencies

### Metrics
- Request latency and throughput
- Database query performance
- Cache hit rates
- Error rates by endpoint

### Logging
- Structured JSON logging
- Request/response logging
- Error tracking with stack traces
- Performance metrics logging

## Testing

```bash
# Run tests
npm test

# Run with coverage
npm run test:coverage

# Run linting
npm run lint
```

## Dependencies

### Production
- **express**: Web framework
- **pg**: PostgreSQL client
- **redis**: Redis client
- **joi**: Request validation
- **winston**: Logging
- **cors**: CORS middleware
- **helmet**: Security middleware

### Development
- **typescript**: Type checking
- **jest**: Testing framework
- **nodemon**: Development server
- **eslint**: Code linting

## Requirements Fulfilled

This implementation addresses the following requirements:

- **6.1**: Real-time position tracking and P&L calculation
- **6.2**: Portfolio performance metrics aggregation
- **6.6**: Multi-currency support and conversion
- **6.1**: Trade capture and validation system
- **6.2**: Trade matching and settlement tracking
- **6.3**: Performance dashboard data
- **6.6**: Automated performance report generation