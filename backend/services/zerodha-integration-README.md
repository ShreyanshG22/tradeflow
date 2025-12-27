# Zerodha Integration Services

This directory contains the microservices for integrating Zerodha's Kite Connect API with the TradeFlow platform.

## Services Overview

### 1. Zerodha Authentication Service (`zerodha-auth-service`)
- **Port**: 3001
- **Purpose**: Handles OAuth flow, token management, and user authentication with Zerodha
- **Key Features**:
  - OAuth 2.0 flow implementation
  - Secure token storage and encryption
  - Session management with Redis
  - JWT token generation for internal services

### 2. Zerodha Market Data Service (`zerodha-market-service`)
- **Port**: 3002
- **Purpose**: Manages real-time market data, historical data, and instrument information
- **Key Features**:
  - WebSocket connection for real-time data
  - Instrument database management
  - Historical data caching
  - Market status monitoring

### 3. Zerodha Order Service (`zerodha-order-service`)
- **Port**: 3003
- **Purpose**: Handles order placement, modification, and tracking
- **Key Features**:
  - Order validation and placement
  - Order status monitoring
  - Order history management
  - Integration with risk management

### 4. Zerodha Portfolio Service (`zerodha-portfolio-service`)
- **Port**: 3004
- **Purpose**: Manages portfolio data, positions, and P&L calculations
- **Key Features**:
  - Position management
  - Holdings tracking
  - Real-time P&L calculations
  - Portfolio analytics

### 5. Zerodha Risk Service (`zerodha-risk-service`)
- **Port**: 3005
- **Purpose**: Enforces trading limits and risk controls
- **Key Features**:
  - Pre-trade risk validation
  - Real-time exposure monitoring
  - Risk limit configuration
  - Alert generation

## Shared Components

### Types (`backend/shared/types`)
- Comprehensive TypeScript interfaces for Zerodha API responses
- Configuration schemas with validation
- Market constants and utilities

### Utilities (`backend/shared/zerodha-utils`)
- API client for Zerodha integration
- Encryption services for sensitive data
- Logging utilities
- Validation functions

## Configuration

Each service uses environment variables for configuration. Copy the `.env.example` file to `.env` and update with your values:

```bash
# For each service directory
cp .env.example .env
```

### Required Environment Variables

#### Common to All Services
- `ZERODHA_API_KEY`: Your Zerodha API key
- `ZERODHA_API_SECRET`: Your Zerodha API secret
- `DATABASE_URL`: PostgreSQL connection string
- `REDIS_URL`: Redis connection string
- `NODE_ENV`: Environment (development/production)

#### Service-Specific
- `ZERODHA_REDIRECT_URL`: OAuth callback URL (auth service)
- `JWT_SECRET`: JWT signing secret (auth service)
- `ENCRYPTION_KEY`: 32-character encryption key (auth service)

## Development Setup

### Prerequisites
- Node.js 18+
- PostgreSQL
- Redis
- Docker (optional)

### Local Development

1. **Install dependencies** for each service:
```bash
cd backend/services/zerodha-auth-service
npm install

cd ../zerodha-market-service
npm install

# Repeat for all services
```

2. **Build shared types**:
```bash
cd backend/shared/types
npm run build

cd ../zerodha-utils
npm run build
```

3. **Start services** in development mode:
```bash
# Terminal 1 - Auth Service
cd backend/services/zerodha-auth-service
npm run dev

# Terminal 2 - Market Service
cd backend/services/zerodha-market-service
npm run dev

# Continue for other services...
```

### Docker Development

1. **Build and start all services**:
```bash
cd backend/docker/zerodha-services
docker-compose -f docker-compose.zerodha.yml up --build
```

2. **View logs**:
```bash
docker-compose -f docker-compose.zerodha.yml logs -f zerodha-auth-service
```

## API Endpoints

### Authentication Service (Port 3001)
- `POST /api/zerodha/auth/login` - Initiate OAuth flow
- `GET /api/zerodha/auth/callback` - Handle OAuth callback
- `POST /api/zerodha/auth/refresh` - Refresh access token
- `GET /api/zerodha/auth/profile` - Get user profile
- `DELETE /api/zerodha/auth/logout` - Logout user

### Market Data Service (Port 3002)
- `GET /api/zerodha/market/instruments` - Get instrument list
- `GET /api/zerodha/market/search` - Search instruments
- `POST /api/zerodha/market/subscribe` - Subscribe to real-time data
- `GET /api/zerodha/market/quotes` - Get current quotes
- `GET /api/zerodha/market/historical` - Get historical data
- `WebSocket: /ws/market-data` - Real-time data stream

### Order Service (Port 3003)
- `POST /api/zerodha/orders` - Place order
- `PUT /api/zerodha/orders/:orderId` - Modify order
- `DELETE /api/zerodha/orders/:orderId` - Cancel order
- `GET /api/zerodha/orders` - Get order list
- `GET /api/zerodha/orders/:orderId` - Get order details

### Portfolio Service (Port 3004)
- `GET /api/zerodha/portfolio/positions` - Get positions
- `GET /api/zerodha/portfolio/holdings` - Get holdings
- `GET /api/zerodha/portfolio/margins` - Get margin details
- `GET /api/zerodha/portfolio/pnl` - Get P&L summary

### Risk Service (Port 3005)
- `POST /api/zerodha/risk/validate` - Validate order against risk rules
- `GET /api/zerodha/risk/limits` - Get risk limits
- `PUT /api/zerodha/risk/limits` - Update risk limits
- `GET /api/zerodha/risk/exposure` - Get current exposure

## Testing

Each service includes unit tests and integration tests:

```bash
# Run tests for a specific service
cd backend/services/zerodha-auth-service
npm test

# Run tests in watch mode
npm run test:watch
```

## Monitoring and Health Checks

All services expose health check endpoints at `/health`:

```bash
curl http://localhost:3001/health  # Auth Service
curl http://localhost:3002/health  # Market Service
curl http://localhost:3003/health  # Order Service
curl http://localhost:3004/health  # Portfolio Service
curl http://localhost:3005/health  # Risk Service
```

## Security Considerations

1. **API Keys**: Store Zerodha API credentials securely using environment variables
2. **Encryption**: Sensitive data is encrypted using AES-256-CBC
3. **Authentication**: JWT tokens for inter-service communication
4. **Rate Limiting**: Implemented to prevent API abuse
5. **Input Validation**: All inputs are validated before processing

## Troubleshooting

### Common Issues

1. **Connection Errors**: Check if PostgreSQL and Redis are running
2. **Authentication Failures**: Verify Zerodha API credentials
3. **WebSocket Issues**: Check network connectivity and firewall settings
4. **Rate Limiting**: Implement proper retry logic with exponential backoff

### Logs

Logs are written to:
- Console (development)
- Files in `logs/` directory (production)
- Structured JSON format for easy parsing

### Debug Mode

Enable debug logging by setting:
```bash
LOG_LEVEL=debug
ZERODHA_DEBUG=true
```

## Contributing

1. Follow TypeScript best practices
2. Add comprehensive tests for new features
3. Update documentation for API changes
4. Use conventional commit messages
5. Ensure all services pass health checks

## License

This project is part of the TradeFlow platform and follows the same licensing terms.