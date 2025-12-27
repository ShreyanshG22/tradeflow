# TradeFlow Redis Utilities

This package provides Redis configuration, connection management, and specialized utilities for the TradeFlow algorithmic trading platform. It includes high-performance caching, session management, real-time notifications, and pub/sub messaging optimized for trading workloads.

## Features

- **Multi-Database Support**: Organized Redis databases for different data types
- **Session Management**: JWT token storage and user session handling
- **Market Data Caching**: High-performance market data storage and distribution
- **Real-time Notifications**: Pub/sub messaging for alerts and updates
- **Connection Pooling**: Efficient Redis connection management
- **Performance Optimized**: Configured for ultra-low latency trading operations

## Database Organization

The Redis configuration uses multiple databases for optimal performance:

- **DB 0**: User sessions and authentication
- **DB 1**: Market data cache and real-time prices
- **DB 2**: Strategy execution state and positions
- **DB 3**: Real-time notifications and pub/sub
- **DB 4**: Performance metrics and analytics
- **DB 5**: General application cache
- **DB 6**: Rate limiting and throttling
- **DB 7**: Distributed locks and coordination

## Usage

### Basic Setup

```javascript
const { redisManager, sessionManager, marketDataCache, notificationManager } = require('@tradeflow/redis');

// Health check
const isHealthy = await redisManager.healthCheck();

// Get a connection for specific database
const cacheConnection = redisManager.getConnection(REDIS_DATABASES.CACHE);
```

### Session Management

```javascript
// Create user session
const sessionId = await sessionManager.createSession(userId, {
    ipAddress: '192.168.1.1',
    userAgent: 'Mozilla/5.0...',
    deviceInfo: { type: 'desktop', os: 'macOS' }
});

// Get session data
const session = await sessionManager.getSession(sessionId);

// Update session
await sessionManager.updateSession(sessionId, { lastActivity: new Date() });

// Delete session
await sessionManager.deleteSession(sessionId);

// Manage refresh tokens
await sessionManager.storeRefreshToken(userId, refreshToken, sessionId);
const tokenData = await sessionManager.validateRefreshToken(refreshToken);
```

### Market Data Caching

```javascript
// Cache current price
await marketDataCache.cachePrice('AAPL', {
    price: 150.25,
    bid: 150.20,
    ask: 150.30,
    volume: 1000000,
    change: 2.15,
    changePercent: 1.45
});

// Get cached price
const price = await marketDataCache.getPrice('AAPL');

// Cache OHLC data
await marketDataCache.cacheOHLC('AAPL', '1h', {
    open: 148.50,
    high: 151.00,
    low: 147.80,
    close: 150.25,
    volume: 2500000
});

// Batch operations
const priceUpdates = [
    { symbol: 'AAPL', price: 150.25, bid: 150.20, ask: 150.30 },
    { symbol: 'GOOGL', price: 2750.80, bid: 2750.50, ask: 2751.00 }
];
await marketDataCache.cachePrices(priceUpdates);

// Subscribe to price updates
await marketDataCache.subscribeToPriceUpdates(['AAPL', 'GOOGL'], (updates) => {
    console.log('Price updates:', updates);
});

// Store tick data
await marketDataCache.storeTick('AAPL', {
    price: 150.25,
    volume: 100,
    bid: 150.20,
    ask: 150.30
});
```

### Notifications and Alerts

```javascript
// Send user alert
await notificationManager.sendUserAlert(userId, {
    type: 'trade',
    title: 'Trade Executed',
    message: 'Your AAPL buy order has been filled',
    severity: 'success',
    data: { tradeId: 'trade_123', symbol: 'AAPL' }
});

// Send trade alert
await notificationManager.sendTradeAlert(userId, {
    id: 'trade_123',
    symbol: 'AAPL',
    side: 'buy',
    quantity: 100,
    price: 150.25,
    status: 'filled'
});

// Send risk alert
await notificationManager.sendRiskAlert(userId, {
    type: 'drawdown',
    message: 'Portfolio drawdown exceeds 5% limit',
    severity: 'warning',
    currentValue: 6.2,
    threshold: 5.0,
    portfolioId: 'portfolio_456'
});

// Get user alerts
const alerts = await notificationManager.getUserAlerts(userId, {
    limit: 20,
    unreadOnly: true,
    type: 'trade'
});

// Subscribe to user alerts
await notificationManager.subscribeToUserAlerts(userId, (alert) => {
    console.log('New alert:', alert);
});

// Broadcast system status
await notificationManager.broadcastSystemStatus({
    status: 'maintenance',
    message: 'Scheduled maintenance in progress',
    affectedServices: ['trading-engine'],
    estimatedResolution: '2024-12-24T15:00:00Z'
});
```

### Pub/Sub Channels

The system uses organized pub/sub channels for different types of real-time communication:

```javascript
const { PUBSUB_CHANNELS } = require('@tradeflow/redis');

// Market data channels
PUBSUB_CHANNELS.MARKET_DATA.PRICE_UPDATES
PUBSUB_CHANNELS.MARKET_DATA.TICK_DATA
PUBSUB_CHANNELS.MARKET_DATA.ORDER_BOOK

// Strategy channels
PUBSUB_CHANNELS.STRATEGY.SIGNALS
PUBSUB_CHANNELS.STRATEGY.EXECUTIONS
PUBSUB_CHANNELS.STRATEGY.STATUS

// Portfolio channels
PUBSUB_CHANNELS.PORTFOLIO.POSITION_UPDATES
PUBSUB_CHANNELS.PORTFOLIO.BALANCE_CHANGES
PUBSUB_CHANNELS.PORTFOLIO.TRADE_FILLS

// Notification channels
PUBSUB_CHANNELS.NOTIFICATIONS.USER_ALERTS
PUBSUB_CHANNELS.NOTIFICATIONS.SYSTEM_STATUS
PUBSUB_CHANNELS.NOTIFICATIONS.TRADE_ALERTS
```

### Cache Keys

Standardized cache key patterns for consistent data organization:

```javascript
const { CACHE_KEYS } = require('@tradeflow/redis');

// User-related keys
const sessionKey = CACHE_KEYS.USER_SESSION(sessionId);
const preferencesKey = CACHE_KEYS.USER_PREFERENCES(userId);
const portfolioKey = CACHE_KEYS.USER_PORTFOLIO(userId);

// Market data keys
const priceKey = CACHE_KEYS.SYMBOL_PRICE('AAPL');
const ohlcKey = CACHE_KEYS.SYMBOL_OHLC('AAPL', '1h');

// Strategy keys
const configKey = CACHE_KEYS.STRATEGY_CONFIG(strategyId);
const stateKey = CACHE_KEYS.STRATEGY_STATE(strategyId);
```

### Distributed Locking

```javascript
// Acquire a distributed lock
const lock = await redisManager.acquireLock('portfolio_update_user_123', 30);

if (lock.acquired) {
    try {
        // Perform critical section operations
        await updatePortfolioPositions(userId);
    } finally {
        // Release the lock
        await lock.release();
    }
} else {
    console.log('Could not acquire lock, operation already in progress');
}
```

## Configuration

### Environment Variables

```bash
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=your_redis_password
```

### Redis Configuration

The Redis server is optimized for trading workloads with:

- **Memory Management**: 1GB max memory with volatile-LRU eviction
- **Persistence**: AOF with everysec fsync for durability
- **Performance**: High frequency (100Hz) for responsiveness
- **Networking**: Increased buffer limits for market data streaming
- **Monitoring**: Latency monitoring for operations >50μs

## Performance Considerations

### High-Frequency Trading Optimizations

1. **Connection Pooling**: Reuse connections across operations
2. **Pipeline Operations**: Batch Redis commands when possible
3. **Appropriate TTLs**: Set reasonable expiration times
4. **Database Separation**: Use different databases for different data types
5. **Key Patterns**: Use consistent, efficient key naming

### Memory Management

```javascript
// Get cache statistics
const stats = await marketDataCache.getCacheStats();
console.log('Cache stats:', stats);

// Clean up old data
await marketDataCache.cleanupOldTicks();
await notificationManager.cleanupOldAlerts();
```

## Monitoring and Health Checks

```javascript
// Health check
const isHealthy = await redisManager.healthCheck();

// Get session statistics
const sessionStats = await sessionManager.getSessionStats();

// Get notification statistics
const notificationStats = await notificationManager.getNotificationStats();
```

## Integration with TradeFlow Services

This Redis package integrates with:

- **User Service**: Session management and authentication
- **Market Data Service**: Real-time price caching and distribution
- **Strategy Service**: Strategy state and execution coordination
- **Portfolio Service**: Position updates and P&L tracking
- **API Gateway**: Rate limiting and request caching
- **Trading Engine**: Ultra-low latency data access

## Best Practices

1. **Use Appropriate Databases**: Store related data in the same database
2. **Set TTLs**: Always set expiration times for cached data
3. **Handle Disconnections**: Implement proper error handling and reconnection logic
4. **Monitor Performance**: Track Redis performance metrics
5. **Clean Up**: Regularly clean up old or expired data
6. **Security**: Use authentication in production environments

## Testing

```bash
npm test
npm run test:watch
```

## Dependencies

- **ioredis**: High-performance Redis client for Node.js
- **jest**: Testing framework (dev dependency)