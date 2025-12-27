/**
 * Redis Configuration and Connection Management for TradeFlow
 * 
 * This module provides Redis connection management, database selection,
 * and pub/sub channel configuration for the TradeFlow trading platform.
 */

const Redis = require('ioredis');

// Redis database assignments
const REDIS_DATABASES = {
    SESSIONS: 0,        // User sessions and authentication
    MARKET_DATA: 1,     // Market data cache and real-time prices
    STRATEGY_STATE: 2,  // Strategy execution state and positions
    NOTIFICATIONS: 3,   // Real-time notifications and pub/sub
    ANALYTICS: 4,       // Performance metrics and analytics
    CACHE: 5,          // General application cache
    RATE_LIMITING: 6,   // Rate limiting and throttling
    LOCKS: 7           // Distributed locks and coordination
};

// Pub/Sub channel configuration
const PUBSUB_CHANNELS = {
    // Market data channels
    MARKET_DATA: {
        PRICE_UPDATES: 'market:price_updates',
        TICK_DATA: 'market:tick_data',
        ORDER_BOOK: 'market:order_book',
        TRADES: 'market:trades'
    },
    
    // Strategy execution channels
    STRATEGY: {
        SIGNALS: 'strategy:signals',
        EXECUTIONS: 'strategy:executions',
        STATUS: 'strategy:status',
        ERRORS: 'strategy:errors'
    },
    
    // Portfolio and trading channels
    PORTFOLIO: {
        POSITION_UPDATES: 'portfolio:position_updates',
        BALANCE_CHANGES: 'portfolio:balance_changes',
        TRADE_FILLS: 'portfolio:trade_fills',
        PNL_UPDATES: 'portfolio:pnl_updates'
    },
    
    // User notification channels
    NOTIFICATIONS: {
        USER_ALERTS: 'notifications:user_alerts',
        SYSTEM_STATUS: 'notifications:system_status',
        TRADE_ALERTS: 'notifications:trade_alerts',
        RISK_ALERTS: 'notifications:risk_alerts'
    },
    
    // System monitoring channels
    SYSTEM: {
        HEALTH_CHECKS: 'system:health_checks',
        PERFORMANCE_METRICS: 'system:performance_metrics',
        ERROR_LOGS: 'system:error_logs'
    }
};

// Cache key patterns
const CACHE_KEYS = {
    // User-related keys
    USER_SESSION: (userId) => `session:user:${userId}`,
    USER_PREFERENCES: (userId) => `preferences:user:${userId}`,
    USER_PORTFOLIO: (userId) => `portfolio:user:${userId}`,
    
    // Market data keys
    SYMBOL_PRICE: (symbol) => `price:${symbol}`,
    SYMBOL_OHLC: (symbol, timeframe) => `ohlc:${symbol}:${timeframe}`,
    MARKET_STATUS: () => 'market:status',
    
    // Strategy keys
    STRATEGY_CONFIG: (strategyId) => `strategy:config:${strategyId}`,
    STRATEGY_STATE: (strategyId) => `strategy:state:${strategyId}`,
    STRATEGY_PERFORMANCE: (strategyId) => `strategy:performance:${strategyId}`,
    
    // Rate limiting keys
    RATE_LIMIT: (identifier, window) => `rate_limit:${identifier}:${window}`,
    
    // Lock keys
    DISTRIBUTED_LOCK: (resource) => `lock:${resource}`,
    
    // Analytics keys
    DAILY_STATS: (date) => `stats:daily:${date}`,
    USER_METRICS: (userId, period) => `metrics:user:${userId}:${period}`
};

class RedisManager {
    constructor(options = {}) {
        this.options = {
            host: process.env.REDIS_HOST || 'localhost',
            port: process.env.REDIS_PORT || 6379,
            password: process.env.REDIS_PASSWORD || '',
            retryDelayOnFailover: 100,
            enableReadyCheck: true,
            maxRetriesPerRequest: 3,
            lazyConnect: true,
            keepAlive: 30000,
            ...options
        };
        
        this.connections = new Map();
        this.subscribers = new Map();
        this.publishers = new Map();
    }

    /**
     * Get a Redis connection for a specific database
     */
    getConnection(database = REDIS_DATABASES.CACHE) {
        const key = `db_${database}`;
        
        if (!this.connections.has(key)) {
            const connection = new Redis({
                ...this.options,
                db: database,
                keyPrefix: this.getKeyPrefix(database)
            });
            
            this.setupConnectionHandlers(connection, key);
            this.connections.set(key, connection);
        }
        
        return this.connections.get(key);
    }

    /**
     * Get a Redis subscriber for pub/sub operations
     */
    getSubscriber(database = REDIS_DATABASES.NOTIFICATIONS) {
        const key = `sub_${database}`;
        
        if (!this.subscribers.has(key)) {
            const subscriber = new Redis({
                ...this.options,
                db: database,
                lazyConnect: false
            });
            
            this.setupConnectionHandlers(subscriber, key);
            this.subscribers.set(key, subscriber);
        }
        
        return this.subscribers.get(key);
    }

    /**
     * Get a Redis publisher for pub/sub operations
     */
    getPublisher(database = REDIS_DATABASES.NOTIFICATIONS) {
        const key = `pub_${database}`;
        
        if (!this.publishers.has(key)) {
            const publisher = new Redis({
                ...this.options,
                db: database,
                lazyConnect: false
            });
            
            this.setupConnectionHandlers(publisher, key);
            this.publishers.set(key, publisher);
        }
        
        return this.publishers.get(key);
    }

    /**
     * Setup connection event handlers
     */
    setupConnectionHandlers(connection, key) {
        connection.on('connect', () => {
            console.log(`✅ Redis connection established: ${key}`);
        });

        connection.on('ready', () => {
            console.log(`🚀 Redis connection ready: ${key}`);
        });

        connection.on('error', (error) => {
            console.error(`❌ Redis connection error (${key}):`, error.message);
        });

        connection.on('close', () => {
            console.log(`🔌 Redis connection closed: ${key}`);
        });

        connection.on('reconnecting', () => {
            console.log(`🔄 Redis reconnecting: ${key}`);
        });
    }

    /**
     * Get key prefix for different databases
     */
    getKeyPrefix(database) {
        const prefixes = {
            [REDIS_DATABASES.SESSIONS]: 'tf:session:',
            [REDIS_DATABASES.MARKET_DATA]: 'tf:market:',
            [REDIS_DATABASES.STRATEGY_STATE]: 'tf:strategy:',
            [REDIS_DATABASES.NOTIFICATIONS]: 'tf:notify:',
            [REDIS_DATABASES.ANALYTICS]: 'tf:analytics:',
            [REDIS_DATABASES.CACHE]: 'tf:cache:',
            [REDIS_DATABASES.RATE_LIMITING]: 'tf:rate:',
            [REDIS_DATABASES.LOCKS]: 'tf:lock:'
        };
        
        return prefixes[database] || 'tf:';
    }

    /**
     * Publish a message to a channel
     */
    async publish(channel, message, database = REDIS_DATABASES.NOTIFICATIONS) {
        const publisher = this.getPublisher(database);
        const payload = typeof message === 'string' ? message : JSON.stringify(message);
        
        try {
            const result = await publisher.publish(channel, payload);
            return result;
        } catch (error) {
            console.error(`Failed to publish to channel ${channel}:`, error);
            throw error;
        }
    }

    /**
     * Subscribe to a channel with message handler
     */
    async subscribe(channel, handler, database = REDIS_DATABASES.NOTIFICATIONS) {
        const subscriber = this.getSubscriber(database);
        
        subscriber.on('message', (receivedChannel, message) => {
            if (receivedChannel === channel) {
                try {
                    const parsedMessage = JSON.parse(message);
                    handler(parsedMessage, receivedChannel);
                } catch (error) {
                    // If JSON parsing fails, pass the raw message
                    handler(message, receivedChannel);
                }
            }
        });
        
        await subscriber.subscribe(channel);
        console.log(`📡 Subscribed to channel: ${channel}`);
    }

    /**
     * Set a value with optional expiration
     */
    async set(key, value, ttl = null, database = REDIS_DATABASES.CACHE) {
        const connection = this.getConnection(database);
        const serializedValue = typeof value === 'string' ? value : JSON.stringify(value);
        
        if (ttl) {
            return await connection.setex(key, ttl, serializedValue);
        } else {
            return await connection.set(key, serializedValue);
        }
    }

    /**
     * Get a value and optionally parse JSON
     */
    async get(key, database = REDIS_DATABASES.CACHE) {
        const connection = this.getConnection(database);
        const value = await connection.get(key);
        
        if (!value) return null;
        
        try {
            return JSON.parse(value);
        } catch (error) {
            return value;
        }
    }

    /**
     * Delete one or more keys
     */
    async del(keys, database = REDIS_DATABASES.CACHE) {
        const connection = this.getConnection(database);
        const keyArray = Array.isArray(keys) ? keys : [keys];
        return await connection.del(...keyArray);
    }

    /**
     * Check if a key exists
     */
    async exists(key, database = REDIS_DATABASES.CACHE) {
        const connection = this.getConnection(database);
        return await connection.exists(key);
    }

    /**
     * Set expiration on a key
     */
    async expire(key, ttl, database = REDIS_DATABASES.CACHE) {
        const connection = this.getConnection(database);
        return await connection.expire(key, ttl);
    }

    /**
     * Increment a counter
     */
    async incr(key, database = REDIS_DATABASES.CACHE) {
        const connection = this.getConnection(database);
        return await connection.incr(key);
    }

    /**
     * Acquire a distributed lock
     */
    async acquireLock(resource, ttl = 30, database = REDIS_DATABASES.LOCKS) {
        const connection = this.getConnection(database);
        const lockKey = CACHE_KEYS.DISTRIBUTED_LOCK(resource);
        const lockValue = `${Date.now()}-${Math.random()}`;
        
        const result = await connection.set(lockKey, lockValue, 'EX', ttl, 'NX');
        
        if (result === 'OK') {
            return {
                acquired: true,
                lockValue,
                release: async () => {
                    const script = `
                        if redis.call("get", KEYS[1]) == ARGV[1] then
                            return redis.call("del", KEYS[1])
                        else
                            return 0
                        end
                    `;
                    return await connection.eval(script, 1, lockKey, lockValue);
                }
            };
        }
        
        return { acquired: false };
    }

    /**
     * Close all connections
     */
    async disconnect() {
        const allConnections = [
            ...this.connections.values(),
            ...this.subscribers.values(),
            ...this.publishers.values()
        ];
        
        await Promise.all(allConnections.map(conn => conn.disconnect()));
        
        this.connections.clear();
        this.subscribers.clear();
        this.publishers.clear();
        
        console.log('✅ All Redis connections closed');
    }

    /**
     * Health check for Redis connections
     */
    async healthCheck() {
        try {
            const connection = this.getConnection(REDIS_DATABASES.CACHE);
            const result = await connection.ping();
            return result === 'PONG';
        } catch (error) {
            console.error('Redis health check failed:', error);
            return false;
        }
    }
}

// Create singleton instance
const redisManager = new RedisManager();

module.exports = {
    RedisManager,
    redisManager,
    REDIS_DATABASES,
    PUBSUB_CHANNELS,
    CACHE_KEYS
};