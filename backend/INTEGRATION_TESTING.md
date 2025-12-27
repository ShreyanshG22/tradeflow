# TradeFlow Backend Integration Testing Guide

This document provides comprehensive information about the integration testing framework for the TradeFlow backend infrastructure.

## Overview

The integration testing suite validates the complete integration and interaction between all backend services, databases, and external systems. These tests ensure that the entire system works together correctly in realistic scenarios.

## Test Categories

### 1. End-to-End Integration Tests
- **Location**: `services/api-gateway/src/__tests__/integration/integration.test.ts`
- **Purpose**: Test complete user workflows from registration to trading
- **Coverage**: Full system integration, real-time updates, cross-service communication
- **Features**:
  - Complete user registration to trading workflow
  - Real-time WebSocket communication
  - Multi-service data consistency
  - Error handling across services

### 2. Service-to-Service Communication Tests
- **Purpose**: Test communication between microservices
- **Coverage**: API Gateway routing, service discovery, data consistency
- **Features**:
  - Authentication flow through services
  - Cross-service data validation
  - Service failover scenarios
  - Load balancing verification

### 3. Database Transaction and Consistency Tests
- **Purpose**: Test database operations and ACID properties
- **Coverage**: Transaction management, referential integrity, concurrent operations
- **Features**:
  - Multi-table transaction consistency
  - Rollback scenarios
  - Concurrent access handling
  - Foreign key constraint validation

### 4. Market Data Pipeline Integration Tests
- **Location**: `services/market-data-service/src/__tests__/integration/`
- **Purpose**: Test market data flow from providers to consumers
- **Coverage**: Real-time data, caching, provider failover, data validation
- **Features**:
  - Real-time market data subscriptions
  - Provider failover mechanisms
  - Data caching and invalidation
  - WebSocket communication

### 5. Strategy Execution Integration Tests
- **Location**: `services/strategy-service/src/__tests__/integration/`
- **Purpose**: Test strategy lifecycle from creation to execution
- **Coverage**: Strategy validation, backtesting, live execution, performance tracking
- **Features**:
  - Strategy configuration validation
  - Backtest execution and results
  - Real-time strategy signals
  - Performance monitoring

### 6. Portfolio Management Integration Tests
- **Location**: `services/portfolio-service/src/__tests__/integration/`
- **Purpose**: Test portfolio operations and performance calculations
- **Coverage**: Trade execution, P&L calculation, multi-currency support, risk metrics
- **Features**:
  - Trade execution and settlement
  - Real-time portfolio valuation
  - Multi-currency operations
  - Performance analytics

### 7. Error Handling and Recovery Tests
- **Purpose**: Test system behavior under failure conditions
- **Coverage**: Service failures, network issues, data corruption, recovery mechanisms
- **Features**:
  - Database connection failures
  - Service unavailability scenarios
  - Timeout handling
  - Circuit breaker patterns

## Test Environment Setup

### Prerequisites

1. **Node.js** (v18 or higher)
2. **PostgreSQL** (v15 or higher) - Test instance on port 5433
3. **Redis** (v7 or higher) - Test instance on port 6380
4. **Docker & Docker Compose** (optional, for containerized testing)

### Environment Variables

Create a `.env.test` file in the backend directory:

```bash
# Test Environment Configuration
NODE_ENV=test

# Database Configuration
DATABASE_URL=postgresql://test_user:test_password@localhost:5433/tradeflow_test
DB_HOST=localhost
DB_PORT=5433
DB_NAME=tradeflow_test
DB_USER=test_user
DB_PASSWORD=test_password

# Redis Configuration
REDIS_URL=redis://localhost:6380/1
REDIS_HOST=localhost
REDIS_PORT=6380
REDIS_DB=1

# JWT Configuration
JWT_SECRET=test-jwt-secret-for-integration-tests
JWT_REFRESH_SECRET=test-refresh-secret-for-integration-tests

# Service URLs
USER_SERVICE_URL=http://localhost:3002
STRATEGY_SERVICE_URL=http://localhost:3003
PORTFOLIO_SERVICE_URL=http://localhost:3004
MARKET_DATA_SERVICE_URL=http://localhost:3005
MONITORING_SERVICE_URL=http://localhost:3006

# Test Configuration
PORT=3001
CORS_ORIGIN=http://localhost:3000

# Market Data Provider Configuration (Test)
ALPHA_VANTAGE_API_KEY=test_api_key
YAHOO_FINANCE_ENABLED=true

# Logging Configuration
LOG_LEVEL=error
LOG_FILE=logs/integration-test.log
```

### Database Setup

1. **Using Docker Compose** (Recommended):
   ```bash
   cd backend
   docker-compose -f docker-compose.test.yml up -d
   ```

2. **Manual Setup**:
   ```bash
   # Create test database
   createdb -h localhost -p 5433 -U test_user tradeflow_test
   
   # Run migrations
   cd backend/database
   npm install
   npm run migrate
   ```

### Redis Setup

1. **Using Docker** (from docker-compose.test.yml):
   ```bash
   # Redis will be available on port 6380
   ```

2. **Manual Setup**:
   ```bash
   # Start Redis on different port for testing
   redis-server --port 6380 --daemonize yes
   ```

## Running Integration Tests

### Quick Start

```bash
# Run all integration tests
cd backend
./scripts/run-integration-tests.sh

# Run with coverage
./scripts/run-integration-tests.sh --coverage

# Run specific test category
./scripts/run-integration-tests.sh end-to-end
./scripts/run-integration-tests.sh user-service
```

### Individual Service Tests

```bash
# User Service integration tests
./scripts/run-integration-tests.sh user-service

# Strategy Service integration tests
./scripts/run-integration-tests.sh strategy-service

# Market Data Service integration tests
./scripts/run-integration-tests.sh market-data-service

# Portfolio Service integration tests
./scripts/run-integration-tests.sh portfolio-service

# End-to-end integration tests
./scripts/run-integration-tests.sh end-to-end
```

### Using npm Scripts

```bash
# Run all integration tests
npm run test:integration

# Run with coverage
npm run test:integration:coverage

# Run specific services
npm run test:integration:user
npm run test:integration:strategy
npm run test:integration:market-data
npm run test:integration:portfolio
npm run test:integration:e2e
```

### Test Options

```bash
# Setup test environment only
./scripts/run-integration-tests.sh --setup-only

# Skip environment setup (if already running)
./scripts/run-integration-tests.sh --no-setup

# Skip cleanup after tests
./scripts/run-integration-tests.sh --no-cleanup

# Generate coverage reports
./scripts/run-integration-tests.sh --coverage
```

## Test Configuration

### Jest Configuration

Integration tests use a dedicated Jest configuration:

```javascript
// jest.integration.config.js
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/__tests__/integration/**/*.test.ts'],
  setupFilesAfterEnv: ['<rootDir>/services/api-gateway/src/__tests__/integration/setup.ts'],
  testTimeout: 120000, // 2 minutes
  maxWorkers: 1, // Sequential execution
  forceExit: true,
  detectOpenHandles: true,
  coverageThreshold: {
    global: {
      branches: 60,
      functions: 60,
      lines: 60,
      statements: 60,
    },
  },
};
```

### Test Sequencing

Integration tests run in a specific order to ensure proper setup and avoid conflicts:

1. Database Integration Tests
2. Redis Integration Tests
3. User Service Integration Tests
4. Market Data Service Integration Tests
5. Strategy Service Integration Tests
6. Portfolio Service Integration Tests
7. End-to-End Integration Tests

## Writing Integration Tests

### Test Structure

```typescript
describe('Service Integration Tests', () => {
  let authToken: string;
  let testUserId: string;

  beforeAll(async () => {
    // Global setup (database, Redis connections)
    await DatabaseService.initialize();
    await RedisService.initialize();
    
    // Create test user
    const registerResponse = await request(app)
      .post('/api/auth/register')
      .send(testUserData);
    
    authToken = registerResponse.body.accessToken;
    testUserId = registerResponse.body.user.id;
  });

  afterAll(async () => {
    // Global cleanup
    await DatabaseService.query('DELETE FROM users WHERE id = $1', [testUserId]);
    await DatabaseService.close();
    await RedisService.close();
  });

  beforeEach(async () => {
    // Test-specific setup
  });

  afterEach(async () => {
    // Test-specific cleanup
  });

  describe('Feature Integration', () => {
    it('should test complete workflow', async () => {
      // Arrange
      const testData = { /* test data */ };
      
      // Act
      const response = await request(app)
        .post('/api/endpoint')
        .set('Authorization', `Bearer ${authToken}`)
        .send(testData);
      
      // Assert
      expect(response.status).toBe(200);
      
      // Verify database state
      const dbResult = await DatabaseService.query(
        'SELECT * FROM table WHERE id = $1',
        [response.body.id]
      );
      expect(dbResult.rows).toHaveLength(1);
    });
  });
});
```

### Best Practices

1. **Test Isolation**: Each test should be independent and not rely on other tests
2. **Data Cleanup**: Always clean up test data to avoid interference
3. **Realistic Scenarios**: Test realistic user workflows and edge cases
4. **Error Testing**: Test both success and failure scenarios
5. **Performance**: Include basic performance assertions for critical paths
6. **Concurrency**: Test concurrent operations where applicable
7. **Security**: Test authentication, authorization, and data access controls

### Integration Test Patterns

```typescript
// Service-to-service communication testing
const userResponse = await request(userServiceApp)
  .get('/api/users/profile')
  .set('Authorization', `Bearer ${authToken}`);

const portfolioResponse = await request(portfolioServiceApp)
  .get('/api/portfolio')
  .set('Authorization', `Bearer ${authToken}`);

// Verify data consistency across services
expect(userResponse.body.id).toBe(portfolioResponse.body.userId);

// WebSocket integration testing
const client = io('http://localhost:3001', {
  auth: { token: authToken }
});

await new Promise((resolve) => {
  client.on('connect', resolve);
});

let dataReceived = false;
client.on('market-data:update', (data) => {
  dataReceived = true;
  expect(data).toHaveProperty('symbol');
});

// Database transaction testing
await DatabaseService.query('BEGIN');
try {
  // Perform multiple operations
  await DatabaseService.query('INSERT INTO table1 ...');
  await DatabaseService.query('INSERT INTO table2 ...');
  await DatabaseService.query('COMMIT');
} catch (error) {
  await DatabaseService.query('ROLLBACK');
  throw error;
}
```

## Test Data Management

### Test Database

- Uses separate test database (`tradeflow_test`)
- Automatically cleaned between test runs
- Includes all production schema and constraints
- Supports transaction rollback for test isolation

### Test Users

```typescript
// Standard test users created in setup
const testUsers = {
  regularUser: {
    email: 'integration-test@example.com',
    password: 'TestPassword123',
    role: 'trader'
  },
  adminUser: {
    email: 'admin-integration-test@example.com',
    password: 'AdminPassword123',
    role: 'admin'
  }
};
```

### Mock Data

```typescript
// Market data mocks
const mockMarketData = {
  symbol: 'AAPL',
  price: 150.25,
  bid: 150.20,
  ask: 150.30,
  volume: 1000000,
  timestamp: new Date().toISOString()
};

// Strategy configuration mocks
const mockStrategy = {
  name: 'Integration Test Strategy',
  nodes: [
    { id: 'entry-1', type: 'entry', config: { indicator: 'sma', period: 20 } }
  ],
  connections: [],
  parameters: { timeframe: '1h' }
};
```

## Performance Testing

### Latency Requirements

- API endpoints: < 500ms for 95th percentile
- Database queries: < 100ms for complex operations
- WebSocket messages: < 50ms for real-time updates
- Service-to-service calls: < 200ms

### Load Testing

```typescript
// Concurrent request testing
const requests = Array.from({ length: 50 }, () =>
  request(app).get('/api/endpoint').set('Authorization', `Bearer ${token}`)
);

const responses = await Promise.all(requests);
const successfulResponses = responses.filter(r => r.status === 200);
expect(successfulResponses.length).toBeGreaterThan(45); // 90% success rate
```

### Memory Testing

```typescript
// Memory leak detection
const initialMemory = process.memoryUsage().heapUsed;

// Perform operations
for (let i = 0; i < 1000; i++) {
  await performOperation();
}

const finalMemory = process.memoryUsage().heapUsed;
const memoryIncrease = finalMemory - initialMemory;
expect(memoryIncrease).toBeLessThan(100 * 1024 * 1024); // < 100MB increase
```

## Coverage Requirements

### Minimum Coverage Thresholds

- **Lines**: 60%
- **Functions**: 60%
- **Branches**: 60%
- **Statements**: 60%

### Coverage Reports

```bash
# Generate coverage reports
npm run test:integration:coverage

# View HTML report
open coverage/integration/lcov-report/index.html
```

### Coverage Exclusions

- Test files themselves
- Type definition files
- Configuration files
- Third-party integrations (mocked in tests)

## Continuous Integration

### GitHub Actions Integration

```yaml
# .github/workflows/integration-tests.yml
name: Integration Tests

on: [push, pull_request]

jobs:
  integration-tests:
    runs-on: ubuntu-latest
    
    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_DB: tradeflow_test
          POSTGRES_USER: test_user
          POSTGRES_PASSWORD: test_password
        ports:
          - 5433:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
      
      redis:
        image: redis:7
        ports:
          - 6380:6379
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - name: Install dependencies
        run: |
          cd backend
          npm install
          npm run install:all
      
      - name: Run integration tests
        run: |
          cd backend
          npm run test:integration:coverage
      
      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          directory: backend/coverage/integration
```

## Troubleshooting

### Common Issues

1. **Database Connection Errors**
   ```bash
   # Check if PostgreSQL is running
   pg_isready -h localhost -p 5433
   
   # Check database exists
   psql -h localhost -p 5433 -U test_user -l
   ```

2. **Redis Connection Errors**
   ```bash
   # Check if Redis is running
   redis-cli -p 6380 ping
   
   # Check Redis configuration
   redis-cli -p 6380 config get "*"
   ```

3. **Port Conflicts**
   ```bash
   # Check what's using the ports
   lsof -i :5433  # PostgreSQL test port
   lsof -i :6380  # Redis test port
   lsof -i :3001  # API Gateway test port
   ```

4. **Test Timeouts**
   - Increase `testTimeout` in Jest configuration
   - Check for hanging database connections
   - Verify all async operations are properly awaited

5. **Memory Issues**
   ```bash
   # Run tests with memory monitoring
   node --max-old-space-size=4096 node_modules/.bin/jest --config jest.integration.config.js
   ```

### Debug Mode

```bash
# Run tests with debug output
DEBUG=* npm run test:integration

# Run specific test with debugging
npm run test:integration -- --testNamePattern="should complete full user workflow"
```

### Log Analysis

```bash
# View test logs
tail -f backend/logs/integration-test.log

# View database logs (Docker)
docker logs tradeflow-postgres-test

# View Redis logs (Docker)
docker logs tradeflow-redis-test
```

## Maintenance

### Regular Tasks

1. **Update Test Data**: Keep test data current with production schemas
2. **Review Coverage**: Ensure coverage thresholds are maintained
3. **Performance Monitoring**: Track test execution times
4. **Dependency Updates**: Keep test dependencies up to date

### Test Environment Refresh

```bash
# Complete environment reset
./scripts/run-integration-tests.sh --setup-only

# Database schema updates
cd backend/database
npm run migrate:reset
npm run migrate
```

### Adding New Integration Tests

1. Create test file in appropriate `__tests__/integration/` directory
2. Follow existing naming conventions
3. Include in test sequencer if order matters
4. Update coverage thresholds if needed
5. Document any special setup requirements

## Resources

- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [Supertest Documentation](https://github.com/visionmedia/supertest)
- [Socket.IO Testing](https://socket.io/docs/v4/testing/)
- [PostgreSQL Testing Best Practices](https://www.postgresql.org/docs/current/regress.html)
- [Redis Testing Patterns](https://redis.io/docs/manual/patterns/)
- [Integration Testing Best Practices](https://martinfowler.com/articles/practical-test-pyramid.html)

## Contributing

When adding integration tests:

1. Follow the established patterns and conventions
2. Ensure tests are deterministic and reliable
3. Include both positive and negative test cases
4. Add appropriate documentation
5. Verify tests pass in CI environment
6. Update this documentation if adding new patterns or requirements