# Zerodha Integration for TradeFlow Platform

## Overview

The Zerodha Integration provides comprehensive trading capabilities for Indian stock markets (NSE/BSE) through Zerodha's Kite Connect API. This integration enables real-time market data, order execution, portfolio management, and risk controls within the TradeFlow platform.

## Features

### 🔐 Authentication & Security
- OAuth 2.0 flow with Zerodha Kite Connect
- Secure token storage with encryption
- Session management with Redis
- JWT-based API authentication
- Rate limiting and security headers

### 📊 Market Data
- Real-time price feeds via WebSocket
- Historical OHLCV data with caching
- Instrument search and discovery
- Market status and indices tracking
- Sub-100ms latency for live data

### 📈 Order Management
- Order placement with validation
- Real-time order status updates
- Order modification and cancellation
- Order history and tracking
- Support for all NSE/BSE order types

### 💼 Portfolio Management
- Real-time position tracking
- P&L calculations (realized/unrealized)
- Holdings management
- Portfolio analytics and metrics
- Margin calculations

### ⚠️ Risk Management
- Configurable risk limits
- Real-time risk monitoring
- Daily loss limits enforcement
- Position size controls
- Emergency stop-loss mechanisms

### 🔧 System Features
- High-performance WebSocket streaming
- Database connection pooling
- Redis caching for performance
- Comprehensive error handling
- Health monitoring and metrics
- Docker containerization

## Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Frontend      │    │   API Gateway    │    │  Zerodha API    │
│   Components    │◄──►│   (Express.js)   │◄──►│  Kite Connect   │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                                │
                                ▼
                       ┌──────────────────┐
                       │  Microservices   │
                       │                  │
                       │ • Auth Service   │
                       │ • Market Service │
                       │ • Order Service  │
                       │ • Portfolio Svc  │
                       │ • Risk Service   │
                       └──────────────────┘
                                │
                                ▼
                       ┌──────────────────┐
                       │   Data Layer     │
                       │                  │
                       │ • PostgreSQL     │
                       │ • Redis Cache    │
                       │ • InfluxDB       │
                       └──────────────────┘
```

## Quick Start

### Prerequisites

- Node.js 18+ and npm/yarn
- PostgreSQL 13+
- Redis 6+
- Docker and Docker Compose
- Zerodha Kite Connect API credentials

### Installation

1. **Clone and Setup**
   ```bash
   git clone <repository>
   cd backend
   npm install
   ```

2. **Environment Configuration**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

3. **Database Setup**
   ```bash
   # Run migrations
   npm run migrate

   # Start services
   docker-compose up -d
   ```

4. **Start Development Server**
   ```bash
   npm run dev
   ```

### Environment Variables

```bash
# Zerodha API Configuration
ZERODHA_API_KEY=your_api_key
ZERODHA_API_SECRET=your_api_secret
ZERODHA_REDIRECT_URL=http://localhost:3000/auth/callback

# Database Configuration
DATABASE_URL=postgresql://user:password@localhost:5432/tradeflow
REDIS_URL=redis://localhost:6379

# Security Configuration
JWT_SECRET=your_jwt_secret
ENCRYPTION_KEY=your_32_character_encryption_key

# Service Configuration
PORT=3000
NODE_ENV=development
```

## API Documentation

### Authentication Endpoints

#### POST /api/zerodha/auth/login
Initiate Zerodha OAuth login flow.

**Request:**
```json
{
  "user_id": "string"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "login_url": "https://kite.zerodha.com/connect/login?...",
    "state": "random_state_string"
  }
}
```

#### GET /api/zerodha/auth/callback
Handle OAuth callback from Zerodha.

**Query Parameters:**
- `request_token`: OAuth request token
- `state`: State parameter for CSRF protection
- `action`: OAuth action (login)
- `status`: OAuth status (success/error)

#### GET /api/zerodha/auth/profile
Get authenticated user profile.

**Headers:**
- `Authorization: Bearer <jwt_token>`

**Response:**
```json
{
  "success": true,
  "data": {
    "user_id": "ZU1234",
    "user_name": "John Doe",
    "email": "john@example.com",
    "broker": "ZERODHA",
    "exchanges": ["NSE", "BSE"]
  }
}
```

### Market Data Endpoints

#### GET /api/zerodha/market/instruments
Get list of tradeable instruments.

**Query Parameters:**
- `exchange`: NSE or BSE (optional)

#### GET /api/zerodha/market/quotes
Get real-time quotes for instruments.

**Query Parameters:**
- `instruments`: Comma-separated list (e.g., "NSE:RELIANCE,NSE:INFY")

#### GET /api/zerodha/market/historical
Get historical OHLCV data.

**Query Parameters:**
- `instrument`: Instrument identifier (e.g., "NSE:RELIANCE")
- `from`: Start date (YYYY-MM-DD)
- `to`: End date (YYYY-MM-DD)
- `interval`: Data interval (minute, day, etc.)

#### WebSocket: /ws/market-data
Real-time market data streaming.

**Subscribe Message:**
```json
{
  "action": "subscribe",
  "instruments": ["NSE:RELIANCE", "NSE:INFY"]
}
```

**Tick Message:**
```json
{
  "type": "tick",
  "instrument_token": 738561,
  "tradingsymbol": "RELIANCE",
  "last_price": 2550.75,
  "volume": 1234567,
  "ohlc": {
    "open": 2540.00,
    "high": 2565.50,
    "low": 2535.25,
    "close": 2548.75
  },
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

### Order Management Endpoints

#### POST /api/zerodha/orders
Place a new order.

**Request:**
```json
{
  "exchange": "NSE",
  "tradingsymbol": "RELIANCE",
  "transaction_type": "BUY",
  "quantity": 10,
  "product": "CNC",
  "order_type": "MARKET",
  "price": 2550.00,
  "trigger_price": 2540.00,
  "validity": "DAY"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "order_id": "240115000123456",
    "status": "OPEN"
  }
}
```

#### GET /api/zerodha/orders
Get all orders for the user.

#### GET /api/zerodha/orders/:orderId
Get specific order details.

#### PUT /api/zerodha/orders/:orderId
Modify an existing order.

#### DELETE /api/zerodha/orders/:orderId
Cancel an order.

### Portfolio Endpoints

#### GET /api/zerodha/portfolio/positions
Get current positions.

#### GET /api/zerodha/portfolio/holdings
Get long-term holdings.

#### GET /api/zerodha/portfolio/summary
Get portfolio summary with P&L.

**Response:**
```json
{
  "success": true,
  "data": {
    "total_value": 125000.50,
    "day_change": 2500.75,
    "day_change_percent": 2.04,
    "total_pnl": 15000.25,
    "unrealised_pnl": 12000.50,
    "realised_pnl": 2999.75
  }
}
```

### Risk Management Endpoints

#### GET /api/zerodha/risk/status
Get current risk status.

#### POST /api/zerodha/risk/limits
Update risk limits.

**Request:**
```json
{
  "max_order_value": 50000,
  "max_daily_loss": 10000,
  "max_position_size": 100,
  "allowed_exchanges": ["NSE", "BSE"],
  "allowed_products": ["CNC", "MIS"]
}
```

## Frontend Integration

### React Components

The integration includes pre-built React components for easy frontend integration:

#### ZerodhaLoginButton
```tsx
import { ZerodhaLoginButton } from '@/components/zerodha';

<ZerodhaLoginButton 
  onSuccess={(token) => console.log('Authenticated:', token)}
  onError={(error) => console.error('Auth failed:', error)}
/>
```

#### ZerodhaPortfolioSummary
```tsx
import { ZerodhaPortfolioSummary } from '@/components/zerodha';

<ZerodhaPortfolioSummary 
  refreshInterval={30000} // 30 seconds
  showDetailedBreakdown={true}
/>
```

#### ZerodhaOrderForm
```tsx
import { ZerodhaOrderForm } from '@/components/zerodha';

<ZerodhaOrderForm 
  symbol="RELIANCE"
  onOrderPlaced={(order) => console.log('Order placed:', order)}
/>
```

### Custom Hooks

#### useZerodhaAuth
```tsx
import { useZerodhaAuth } from '@/hooks/useZerodhaAuth';

const { isAuthenticated, user, login, logout } = useZerodhaAuth();
```

#### useMarketData
```tsx
import { useMarketData } from '@/hooks/useMarketData';

const { quotes, subscribe, unsubscribe } = useMarketData();

// Subscribe to real-time data
subscribe(['NSE:RELIANCE', 'NSE:INFY']);
```

## Testing

### Running Tests

```bash
# Unit tests
npm test

# Integration tests
npm run test:integration

# End-to-end tests
npm run test:e2e

# Performance tests
npm run test:performance

# Security tests
npm run test:security

# All tests with coverage
npm run test:all
```

### Test Categories

1. **Unit Tests**: Individual component testing
2. **Integration Tests**: Service integration testing
3. **End-to-End Tests**: Complete workflow testing
4. **Performance Tests**: Load and stress testing
5. **Security Tests**: Authentication and data protection

### Test Environment Setup

```bash
# Start test environment
docker-compose -f docker-compose.test.yml up -d

# Run specific test suite
npm run test:integration -- --testNamePattern="Authentication"
```

## Deployment

### Docker Deployment

```bash
# Build images
docker-compose build

# Deploy to staging
docker-compose -f docker-compose.staging.yml up -d

# Deploy to production
docker-compose -f docker-compose.prod.yml up -d
```

### Kubernetes Deployment

```bash
# Apply configurations
kubectl apply -f k8s/

# Check deployment status
kubectl get pods -n tradeflow

# View logs
kubectl logs -f deployment/zerodha-auth-service -n tradeflow
```

### Environment-Specific Configurations

#### Staging
- Zerodha sandbox API endpoints
- Reduced rate limits for testing
- Debug logging enabled
- Test database with sample data

#### Production
- Zerodha live API endpoints
- Full rate limits
- Error-only logging
- Production database with backups
- SSL/TLS encryption
- Health monitoring and alerts

## Monitoring and Observability

### Health Checks

```bash
# System health
curl http://localhost:3000/api/zerodha/system/health

# Service metrics
curl http://localhost:3000/api/zerodha/system/metrics
```

### Logging

Structured logging with contextual information:

```json
{
  "timestamp": "2024-01-15T10:30:00.000Z",
  "level": "info",
  "service": "zerodha-order-service",
  "user_id": "user123",
  "order_id": "240115000123456",
  "message": "Order placed successfully",
  "metadata": {
    "symbol": "RELIANCE",
    "quantity": 10,
    "price": 2550.00
  }
}
```

### Metrics Collection

- API response times and error rates
- Order execution latencies
- WebSocket connection metrics
- Database query performance
- Cache hit/miss ratios
- Risk limit breach events

### Alerting

Configured alerts for:
- API error rate > 5%
- Order execution time > 1 second
- WebSocket disconnections
- Database connection failures
- Risk limit breaches
- System resource usage

## Security

### Data Protection

- All sensitive data encrypted at rest
- API keys stored in secure environment variables
- JWT tokens with short expiration times
- HTTPS/WSS for all communications
- Input validation and sanitization
- SQL injection prevention

### Access Control

- Role-based access control (RBAC)
- API rate limiting per user
- IP whitelisting for production
- Audit logging for all actions
- Session timeout management

### Compliance

- Data retention policies
- Audit trail maintenance
- Risk management compliance
- Regulatory reporting capabilities
- GDPR compliance for user data

## Troubleshooting

### Common Issues

#### Authentication Failures
```bash
# Check API credentials
curl -X POST http://localhost:3000/api/zerodha/auth/login \
  -H "Content-Type: application/json" \
  -d '{"user_id": "test_user"}'

# Verify token encryption
node -e "console.log(require('./src/utils/encryption').decrypt('encrypted_token'))"
```

#### WebSocket Connection Issues
```bash
# Test WebSocket connectivity
wscat -c ws://localhost:3000/ws/market-data \
  -H "Authorization: Bearer your_jwt_token"
```

#### Database Connection Problems
```bash
# Test database connectivity
npm run db:test

# Check migration status
npm run db:status
```

### Performance Issues

#### Slow API Responses
1. Check database query performance
2. Verify Redis cache hit rates
3. Monitor external API latencies
4. Review connection pool settings

#### High Memory Usage
1. Check for memory leaks in WebSocket connections
2. Review cache size limits
3. Monitor garbage collection metrics
4. Analyze heap dumps if necessary

### Error Codes Reference

| Code | Description | Resolution |
|------|-------------|------------|
| AUTH_001 | Invalid JWT token | Refresh authentication |
| AUTH_002 | Token expired | Re-authenticate with Zerodha |
| ORDER_001 | Invalid order parameters | Check order validation rules |
| ORDER_002 | Insufficient funds | Verify account balance |
| RISK_001 | Risk limit exceeded | Review and adjust risk limits |
| MARKET_001 | Invalid instrument | Check instrument symbol |
| SYS_001 | Database connection failed | Check database connectivity |
| SYS_002 | Redis connection failed | Check Redis connectivity |

## Contributing

### Development Setup

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Ensure all tests pass
6. Submit a pull request

### Code Standards

- TypeScript for all new code
- ESLint and Prettier for code formatting
- Jest for testing
- Conventional commits for commit messages
- Documentation for all public APIs

### Testing Requirements

- Unit tests for all business logic
- Integration tests for API endpoints
- End-to-end tests for critical workflows
- Performance tests for high-load scenarios
- Security tests for authentication and authorization

## Support

### Documentation
- [API Reference](./api-reference.md)
- [Architecture Guide](./architecture.md)
- [Deployment Guide](./deployment.md)
- [Security Guide](./security.md)

### Getting Help
- GitHub Issues for bug reports
- Discussions for questions and ideas
- Wiki for additional documentation
- Slack channel for real-time support

### Changelog
See [CHANGELOG.md](./CHANGELOG.md) for version history and updates.

## License

This project is licensed under the MIT License - see the [LICENSE](./LICENSE) file for details.