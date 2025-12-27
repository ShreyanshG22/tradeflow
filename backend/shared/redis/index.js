/**
 * TradeFlow Redis Utilities
 * 
 * Centralized export of all Redis-related utilities and managers
 * for the TradeFlow trading platform.
 */

const { RedisManager, redisManager, REDIS_DATABASES, PUBSUB_CHANNELS, CACHE_KEYS } = require('./redis-config');
const { SessionManager } = require('./session-manager');
const { MarketDataCache } = require('./market-data-cache');
const { NotificationManager } = require('./notification-manager');

// Create singleton instances
const sessionManager = new SessionManager();
const marketDataCache = new MarketDataCache();
const notificationManager = new NotificationManager();

module.exports = {
    // Core Redis configuration
    RedisManager,
    redisManager,
    REDIS_DATABASES,
    PUBSUB_CHANNELS,
    CACHE_KEYS,
    
    // Utility managers
    SessionManager,
    sessionManager,
    
    MarketDataCache,
    marketDataCache,
    
    NotificationManager,
    notificationManager,
    
    // Convenience functions
    async healthCheck() {
        return await redisManager.healthCheck();
    },
    
    async disconnect() {
        return await redisManager.disconnect();
    }
};