# TradeFlow Backend Functional Testing Guide

This document provides comprehensive information about the functional testing framework for the TradeFlow backend infrastructure.

## Overview

The functional testing suite validates the complete integration and behavior of the TradeFlow backend services. These tests verify that all components work together correctly in a realistic environment.

## Test Categories

### 1. API Functional Tests
- **Location**: `services/api-gateway/src/__tests__/functional/api.functional.test.ts`
- **Purpose**: Test all REST API endpoints end-to-end
- **Coverage**: Authentication, strategies, portfolio, market data, health checks
- **Features**:
  - Complete request/response validation
  - Authentication and authorization testing
  - Error handling verification
  - Rate limiting validation
  - CORS and security headers testing

### 2. WebSocket Functional Tests
- **Location**: `services/api-gateway/src/__tests__/functional/websocket.functional.test.ts`
- **Purpose**: Test real-time communication functionality
- **Coverage**: Market data subscriptions, portfolio updates, strategy notifications
- **Features**:
  - Connection authentication
  - Subscription management
  - Real-time data broadcasting
  - Multiple client handling
  - Error handling and recovery

### 3. Database Integration Tests
- **Location**: `services/api-gateway/src/__tests__/functional/database.integration.test.ts`
- **Purpose**: Test database operations and data integrity
- **Coverage**: CRUD operations, transactions, constraints, performance
- **Features**:
  - Connection management
  - Transaction handling
  - Foreign key constraints
  - Index usage verification
  - Concurrent operation testing

### 4. Redis Integration Tests
- **Location**: `services/api-gateway/src/__tests__/functional/redis.integration.test.ts`
- **Purpose**: Test caching and session management
- **Coverage**: Key-value operations, pub/sub, session management, market data caching
- **Features**:
  - Connection handling
  - Data expiration
  - Pub/Sub messaging
  - Pipeline operations
  - Error recovery

### 5. Authentication & Authorization Tests
- **Location**: `services/api-gateway/src/__tests__/functional/auth.functional.test.ts`
- **Purpose**: Test security and access control
- **Coverage**: JWT validation, role-based access, session management, security headers
- **Features**:
  - Token validation and expiration
  - Role and permission checking
  - Session lifecycle management
  - Security header validation
  - Rate limiting and brute force protection

## Test Environment Setup

### Prerequisites

1. **Node.js** (v18 or higher)
2. **PostgreSQL** (v15 or higher)
3. **Redis** (v7 or higher)
4. **Docker & Docker Compose** (optional, for containerized testing)

### Environment Variables

Create a `.env.test` file in the backend directory:

```bash
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
JWT_SECRET=test-jwt-secret-for-functional-tests
JWT_REFRESH_SECRET=test-refresh-secret-for-functional-tests

# Service URLs
USER_SERVICE_URL=http://localhost:3002
STRATEGY_SERVICE_URL=http://localhost:3003
PORTFOLIO_SERVICE_URL=http://localhost:3004
MARKET_DATA_SERVICE_URL=http://localhost:3005

# Test Configuration
NODE_ENV=test
PORT=3001
CORS_ORIGIN=http://localhost:3000
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
   createdb tradeflow_test
   
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

## Running Functional Tests

### Quick Start

```bash
# Run all functional tests
cd backend
./scripts/run-functional-tests.sh

# Run with coverage
./scripts/run-functional-tests.sh --coverage

# Run specific service tests
./scripts/run-functional-tests.sh api-gateway
./scripts/run-functional-tests.sh user-service
```

### Individual Service Tests

```bash
# API Gateway functional tests
cd backend/services/api-gateway
npm run test:functional

# User Service functional tests
cd backend/services/user-service
npm run test:functional

# With coverage
npm run test:functional:coverage
```

### Test Options

```bash
# Setup test environment only
./scripts/run-functional-tests.sh --setup-only

# Skip environment setup (if already running)
./scripts/run-functional-tests.sh --no-setup

# Skip cleanup after tests
./scripts/run-functional-tests.sh --no-cleanup

# Generate coverage reports
./scripts/run-functional-tests.sh --coverage
```

## Test Configuration

### Jest Configuration

Each service has a dedicated functional test configuration:

```javascript
// jest.functional.config.js
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/__tests__/functional/**/*.test.ts'],
  setupFilesAfterEnv: ['<rootDir>/src/__tests__/functional/setup.ts'],
  testTimeout: 30000,
  maxWorkers: 1, // Sequential execution
  forceExit: true,
  detectOpenHandles: true,
  coverageDirectory: 'coverage/functional',
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70,
    },
  },
};
```

### Test Sequencing

Tests run in a specific order to ensure proper setup and avoid conflicts:

1. Database Integration Tests
2. Redis Integration Tests
3. Authentication Functional Tests
4. API Functional Tests
5. WebSocket Functional Tests

## Writing Functional Tests

### Test Structure

```typescript
describe('Service Functional Tests', () => {
  beforeAll(async () => {
    // Global setup (database, Redis connections)
    await DatabaseService.initialize();
    await RedisService.initialize();
  });

  afterAll(async () => {
    // Global cleanup
    await DatabaseService.close();
    await RedisService.close();
  });

  beforeEach(async () => {
    // Test-specific setup (clean data, create test users)
  });

  afterEach(async () => {
    // Test-specific cleanup
  });

  describe('Feature Group', () => {
    it('should test specific functionality', async () => {
      // Arrange
      const testData = { /* test data */ };
      
      // Act
      const response = await request(app)
        .post('/api/endpoint')
        .send(testData);
      
      // Assert
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('expectedField');
    });
  });
});
```

### Best Practices

1. **Test Isolation**: Each test should be independent and not rely on other tests
2. **Data Cleanup**: Always clean up test data to avoid interference
3. **Realistic Data**: Use realistic test data that matches production scenarios
4. **Error Testing**: Test both success and failure scenarios
5. **Performance**: Include basic performance assertions for critical paths
6. **Security**: Test authentication, authorization, and security headers

### API Testing Patterns

```typescript
// Authentication testing
const authToken = await getAuthToken();
const response = await request(app)
  .get('/api/protected-endpoint')
  .set('Authorization', `Bearer ${authToken}`);

// Error handling testing
const response = await request(app)
  .post('/api/endpoint')
  .send(invalidData);
expect(response.status).toBe(400);
expect(response.body.error).toHaveProperty('message');

// Database verification
const dbResult = await DatabaseService.query(
  'SELECT * FROM table WHERE id = $1',
  [testId]
);
expect(dbResult.rows).toHaveLength(1);
```

### WebSocket Testing Patterns

```typescript
// Connection testing
const client = io('http://localhost:3001', {
  auth: { token: authToken }
});

await new Promise((resolve) => {
  client.on('connect', resolve);
});

// Message testing
client.emit('subscribe:market-data', { symbols: ['AAPL'] });

await new Promise((resolve) => {
  client.on('subscription:confirmed', (data) => {
    expect(data.type).toBe('market-data');
    resolve();
  });
});
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
    email: 'user@example.com',
    password: 'TestPassword123',
    role: 'trader'
  },
  adminUser: {
    email: 'admin@example.com',
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
  name: 'Test Strategy',
  nodes: [{ id: 'entry-1', type: 'entry' }],
  connections: [],
  parameters: { timeframe: '1h' }
};
```

## Performance Testing

### Latency Requirements

- API endpoints: < 200ms for 95th percentile
- Database queries: < 50ms for simple operations
- WebSocket messages: < 10ms for real-time updates
- Authentication: < 100ms for token validation

### Load Testing

```typescript
// Concurrent request testing
const requests = Array.from({ length: 100 }, () =>
  request(app).get('/api/endpoint').set('Authorization', `Bearer ${token}`)
);

const responses = await Promise.all(requests);
const successfulResponses = responses.filter(r => r.status === 200);
expect(successfulResponses.length).toBeGreaterThan(95); // 95% success rate
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
expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024); // < 50MB increase
```

## Coverage Requirements

### Minimum Coverage Thresholds

- **Lines**: 70%
- **Functions**: 70%
- **Branches**: 70%
- **Statements**: 70%

### Coverage Reports

```bash
# Generate coverage reports
npm run test:functional:coverage

# View HTML report
open coverage/functional/lcov-report/index.html
```

### Coverage Exclusions

- Test files themselves
- Type definition files
- Configuration files
- Third-party integrations (mocked in tests)

## Continuous Integration

### GitHub Actions Integration

```yaml
# .github/workflows/functional-tests.yml
name: Functional Tests

on: [push, pull_request]

jobs:
  functional-tests:
    runs-on: ubuntu-latest
    
    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_DB: tradeflow_test
          POSTGRES_USER: test_user
          POSTGRES_PASSWORD: test_password
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
      
      redis:
        image: redis:7
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
      
      - name: Run functional tests
        run: |
          cd backend
          npm run test:functional:coverage
      
      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          directory: backend/coverage/functional
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
   node --max-old-space-size=4096 node_modules/.bin/jest --config jest.functional.config.js
   ```

### Debug Mode

```bash
# Run tests with debug output
DEBUG=* npm run test:functional

# Run specific test with debugging
npm run test:functional -- --testNamePattern="should authenticate user"
```

### Log Analysis

```bash
# View test logs
tail -f backend/logs/test.log

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
./scripts/run-functional-tests.sh --setup-only

# Database schema updates
cd backend/database
npm run migrate:reset
npm run migrate
```

### Adding New Tests

1. Create test file in appropriate `__tests__/functional/` directory
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

## Contributing

When adding functional tests:

1. Follow the established patterns and conventions
2. Ensure tests are deterministic and reliable
3. Include both positive and negative test cases
4. Add appropriate documentation
5. Verify tests pass in CI environment
6. Update this documentation if adding new patterns or requirements