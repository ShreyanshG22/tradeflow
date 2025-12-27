# TradeFlow Backend Testing Guide

This document provides comprehensive information about the testing framework and practices for the TradeFlow backend infrastructure.

## Overview

The TradeFlow backend uses a multi-layered testing approach:

- **Unit Tests**: Test individual components in isolation
- **Integration Tests**: Test service-to-service communication
- **Performance Tests**: Benchmark critical path performance
- **Security Tests**: Validate authentication and authorization

## Testing Stack

### Node.js Services
- **Framework**: Jest with TypeScript support
- **Mocking**: Jest mocks for external dependencies
- **Coverage**: Istanbul/NYC with 80% minimum threshold
- **Assertions**: Jest matchers and custom assertions

### C++ Engines
- **Framework**: Google Test (gtest)
- **Build System**: CMake with CTest integration
- **Coverage**: LCOV/GCOV for coverage reporting
- **Performance**: Built-in benchmarking utilities

## Test Structure

```
backend/
├── services/
│   ├── user-service/
│   │   ├── src/__tests__/
│   │   │   ├── setup.ts
│   │   │   ├── auth.test.ts
│   │   │   └── user.test.ts
│   │   └── jest.config.js
│   └── ...
├── engines/
│   ├── tests/
│   │   ├── test_shared.cpp
│   │   ├── test_trading_engine.cpp
│   │   └── ...
│   └── CMakeLists.txt
└── scripts/
    └── run-tests.sh
```

## Running Tests

### All Tests
```bash
cd backend
./scripts/run-tests.sh
```

### Node.js Services Only
```bash
./scripts/run-tests.sh --nodejs-only
```

### C++ Engines Only
```bash
./scripts/run-tests.sh --cpp-only
```

### Individual Service
```bash
cd backend/services/user-service
npm test
```

### Individual C++ Component
```bash
cd backend/engines/build
./test_trading_engine
```

## Test Configuration

### Jest Configuration (Node.js)

Each service has a `jest.config.js` file with:

```javascript
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/__tests__/**',
    '!src/index.ts',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
  setupFilesAfterEnv: ['<rootDir>/src/__tests__/setup.ts'],
};
```

### CMake Configuration (C++)

Tests are configured in `engines/tests/CMakeLists.txt`:

```cmake
# Enable testing
enable_testing()

# Add test executable
add_executable(test_trading_engine
    test_trading_engine.cpp
    test_lock_free_order_book.cpp
)

# Link with Google Test
target_link_libraries(test_trading_engine
    gtest_main
    gtest
    pthread
)

# Register with CTest
add_test(NAME TradingEngineTest COMMAND test_trading_engine)
```

## Writing Tests

### Node.js Service Tests

#### Basic Test Structure
```typescript
import { UserService } from '../services/user';
import { DatabaseService } from '../services/database';

// Mock dependencies
jest.mock('../services/database');
const mockDatabaseService = DatabaseService as jest.Mocked<typeof DatabaseService>;

describe('UserService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getUserProfile', () => {
    it('should return user profile when user exists', async () => {
      // Arrange
      const mockUser = { id: 'user-123', email: 'test@example.com' };
      mockDatabaseService.query.mockResolvedValueOnce({
        rows: [mockUser],
        rowCount: 1
      });

      // Act
      const result = await UserService.getUserProfile('user-123');

      // Assert
      expect(result).toEqual(expect.objectContaining({
        id: 'user-123',
        email: 'test@example.com'
      }));
    });
  });
});
```

#### Mocking Guidelines
- Mock external dependencies (database, Redis, APIs)
- Use `jest.clearAllMocks()` in `beforeEach`
- Mock at the module level, not implementation level
- Verify mock calls with `expect().toHaveBeenCalledWith()`

### C++ Engine Tests

#### Basic Test Structure
```cpp
#include <gtest/gtest.h>
#include "lock_free_order_book.hpp"

class LockFreeOrderBookTest : public ::testing::Test {
protected:
    void SetUp() override {
        order_book = std::make_unique<LockFreeOrderBook<double, 10000>>();
    }

    void TearDown() override {
        order_book.reset();
    }

    std::unique_ptr<LockFreeOrderBook<double, 10000>> order_book;
};

TEST_F(LockFreeOrderBookTest, BasicOrderInsertion) {
    // Arrange
    Order buy_order{1, 100.50, 100, OrderStatus::PENDING};
    
    // Act
    bool result = order_book->add_order(&buy_order);
    
    // Assert
    EXPECT_TRUE(result);
    auto best_bid = order_book->get_best_bid();
    EXPECT_DOUBLE_EQ(best_bid.first, 100.50);
}
```

#### Performance Tests
```cpp
TEST_F(LockFreeOrderBookTest, PerformanceBenchmark) {
    const int num_orders = 100000;
    
    auto start_time = std::chrono::high_resolution_clock::now();
    
    for (int i = 0; i < num_orders; ++i) {
        Order order{i + 1, 100.0 + i * 0.01, 100, OrderStatus::PENDING};
        order_book->add_order(&order);
    }
    
    auto end_time = std::chrono::high_resolution_clock::now();
    auto duration = std::chrono::duration_cast<std::chrono::nanoseconds>(end_time - start_time);
    
    double ns_per_operation = static_cast<double>(duration.count()) / num_orders;
    
    EXPECT_LT(ns_per_operation, 1000.0); // Less than 1μs per operation
    
    std::cout << "Performance: " << ns_per_operation << " ns per operation" << std::endl;
}
```

## Coverage Requirements

### Minimum Coverage Thresholds
- **Functions**: 80%
- **Lines**: 80%
- **Branches**: 80%
- **Statements**: 80%

### Coverage Exclusions
- Test files themselves
- Type definition files (`.d.ts`)
- Main entry points (`index.ts`)
- Generated code

### Viewing Coverage Reports

#### Node.js Services
```bash
cd backend/services/user-service
npm test
open coverage/lcov-report/index.html
```

#### C++ Engines
```bash
cd backend/engines/build
make coverage
open coverage/index.html
```

## Continuous Integration

### GitHub Actions Workflow

The CI pipeline runs:

1. **Unit Tests**: All services and engines
2. **Coverage Check**: Enforces 80% minimum
3. **Integration Tests**: Cross-service communication
4. **Security Scan**: Dependency vulnerabilities
5. **Performance Tests**: Benchmark critical paths

### Test Matrix

#### Node.js Services
- **Node Versions**: 18.x, 20.x
- **Databases**: PostgreSQL 15, Redis 7
- **Services**: All 6 microservices

#### C++ Engines
- **Compilers**: GCC, Clang
- **Build Types**: Debug, Release
- **Architectures**: x86_64

## Mock Strategies

### Database Mocking
```typescript
// Mock successful query
mockDatabaseService.query.mockResolvedValueOnce({
  rows: [{ id: 'test-id', name: 'Test' }],
  rowCount: 1
});

// Mock query failure
mockDatabaseService.query.mockRejectedValueOnce(
  new Error('Database connection failed')
);
```

### Redis Mocking
```typescript
// Mock cache hit
mockRedisService.get.mockResolvedValueOnce(
  JSON.stringify({ cached: 'data' })
);

// Mock cache miss
mockRedisService.get.mockResolvedValueOnce(null);
```

### External API Mocking
```typescript
// Mock HTTP responses
jest.mock('axios');
const mockAxios = axios as jest.Mocked<typeof axios>;

mockAxios.get.mockResolvedValueOnce({
  data: { price: 150.25 },
  status: 200
});
```

## Performance Testing

### Latency Requirements
- **Order Processing**: < 10μs
- **Market Data**: < 5μs
- **Risk Checks**: < 2μs

### Throughput Requirements
- **Orders/Second**: > 100,000
- **Market Data Updates**: > 1,000,000
- **Concurrent Users**: > 10,000

### Benchmark Tests
```cpp
TEST_F(TradingEngineTest, LatencyBenchmark) {
    const int iterations = 1000000;
    std::vector<uint64_t> latencies;
    
    for (int i = 0; i < iterations; ++i) {
        auto start = high_res_timer::now();
        
        // Execute operation
        engine.process_order(test_order);
        
        auto end = high_res_timer::now();
        latencies.push_back(end - start);
    }
    
    // Calculate percentiles
    std::sort(latencies.begin(), latencies.end());
    auto p50 = latencies[iterations * 0.5];
    auto p95 = latencies[iterations * 0.95];
    auto p99 = latencies[iterations * 0.99];
    
    EXPECT_LT(p99, 10000); // 99th percentile < 10μs
}
```

## Debugging Tests

### Node.js Debugging
```bash
# Run tests in debug mode
cd backend/services/user-service
npm test -- --runInBand --detectOpenHandles

# Debug specific test
npm test -- --testNamePattern="should return user profile"
```

### C++ Debugging
```bash
# Build with debug symbols
cd backend/engines/build
cmake -DCMAKE_BUILD_TYPE=Debug ..
make

# Run with GDB
gdb ./test_trading_engine
(gdb) run --gtest_filter="*OrderInsertion*"
```

## Best Practices

### General Guidelines
1. **Test Naming**: Use descriptive test names that explain the scenario
2. **AAA Pattern**: Arrange, Act, Assert structure
3. **Single Responsibility**: One assertion per test when possible
4. **Fast Tests**: Keep unit tests under 100ms
5. **Deterministic**: Tests should always produce the same result

### Node.js Specific
1. **Async/Await**: Use async/await instead of callbacks
2. **Mock Cleanup**: Always clear mocks between tests
3. **Environment**: Use test-specific environment variables
4. **Database**: Use test database, never production

### C++ Specific
1. **RAII**: Use smart pointers for automatic cleanup
2. **Thread Safety**: Test concurrent operations
3. **Memory**: Check for leaks in long-running tests
4. **Performance**: Include performance assertions

## Troubleshooting

### Common Issues

#### Jest Tests Hanging
```bash
# Add timeout and detect open handles
npm test -- --detectOpenHandles --forceExit
```

#### C++ Compilation Errors
```bash
# Clean build directory
rm -rf backend/engines/build
mkdir backend/engines/build
```

#### Coverage Not Generated
```bash
# Ensure coverage is enabled
npm test -- --coverage --collectCoverageFrom="src/**/*.ts"
```

### Getting Help

1. Check test logs for specific error messages
2. Verify all dependencies are installed
3. Ensure database/Redis services are running
4. Check environment variables are set correctly
5. Review mock configurations for external services

## Contributing

When adding new tests:

1. Follow existing naming conventions
2. Add tests for both success and failure cases
3. Include performance tests for critical paths
4. Update this documentation if adding new patterns
5. Ensure all tests pass before submitting PR

## Resources

- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [Google Test Primer](https://google.github.io/googletest/primer.html)
- [CMake Testing](https://cmake.org/cmake/help/latest/manual/ctest.1.html)
- [Node.js Testing Best Practices](https://github.com/goldbergyoni/javascript-testing-best-practices)