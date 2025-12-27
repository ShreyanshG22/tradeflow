/**
 * Market Data Cache Manager for TradeFlow
 * 
 * Handles high-performance caching of market data, real-time price updates,
 * and pub/sub for market data distribution across services.
 */

const { redisManager, REDIS_DATABASES, PUBSUB_CHANNELS, CACHE_KEYS } = require('./redis-config');

class MarketDataCache {
    constructor() {
        this.redis = redisManager.getConnection(REDIS_DATABASES.MARKET_DATA);
        this.publisher = redisManager.getPublisher(REDIS_DATABASES.MARKET_DATA);
        this.subscriber = redisManager.getSubscriber(REDIS_DATABASES.MARKET_DATA);
        
        // Cache TTL settings
        this.priceTTL = 300; // 5 minutes for current prices
        this.ohlcTTL = 3600; // 1 hour for OHLC data
        this.tickTTL = 60; // 1 minute for tick data
    }

    /**
     * Cache current price for a symbol
     */
    async cachePrice(symbol, priceData) {
        const key = CACHE_KEYS.SYMBOL_PRICE(symbol);
        const data = {
            symbol,
            price: priceData.price,
            bid: priceData.bid,
            ask: priceData.ask,
            volume: priceData.volume,
            timestamp: priceData.timestamp || new Date().toISOString(),
            change: priceData.change,
            changePercent: priceData.changePercent
        };
        
        await this.redis.setex(key, this.priceTTL, JSON.stringify(data));
        
        // Publish price update to subscribers
        await this.publisher.publish(
            PUBSUB_CHANNELS.MARKET_DATA.PRICE_UPDATES,
            JSON.stringify({ symbol, ...data })
        );
        
        return data;
    }

    /**
     * Get cached price for a symbol
     */
    async getPrice(symbol) {
        const key = CACHE_KEYS.SYMBOL_PRICE(symbol);
        const data = await this.redis.get(key);
        
        return data ? JSON.parse(data) : null;
    }

    /**
     * Cache OHLC data for a symbol and timeframe
     */
    async cacheOHLC(symbol, timeframe, ohlcData) {
        const key = CACHE_KEYS.SYMBOL_OHLC(symbol, timeframe);
        const data = {
            symbol,
            timeframe,
            open: ohlcData.open,
            high: ohlcData.high,
            low: ohlcData.low,
            close: ohlcData.close,
            volume: ohlcData.volume,
            timestamp: ohlcData.timestamp || new Date().toISOString()
        };
        
        await this.redis.setex(key, this.ohlcTTL, JSON.stringify(data));
        return data;
    }

    /**
     * Get cached OHLC data
     */
    async getOHLC(symbol, timeframe) {
        const key = CACHE_KEYS.SYMBOL_OHLC(symbol, timeframe);
        const data = await this.redis.get(key);
        
        return data ? JSON.parse(data) : null;
    }

    /**
     * Cache multiple prices at once (batch operation)
     */
    async cachePrices(priceUpdates) {
        const pipeline = this.redis.pipeline();
        const publishData = [];
        
        for (const update of priceUpdates) {
            const key = CACHE_KEYS.SYMBOL_PRICE(update.symbol);
            const data = {
                symbol: update.symbol,
                price: update.price,
                bid: update.bid,
                ask: update.ask,
                volume: update.volume,
                timestamp: update.timestamp || new Date().toISOString(),
                change: update.change,
                changePercent: update.changePercent
            };
            
            pipeline.setex(key, this.priceTTL, JSON.stringify(data));
            publishData.push({ symbol: update.symbol, ...data });
        }
        
        await pipeline.exec();
        
        // Publish batch update
        await this.publisher.publish(
            PUBSUB_CHANNELS.MARKET_DATA.PRICE_UPDATES,
            JSON.stringify({ type: 'batch', updates: publishData })
        );
        
        return publishData;
    }

    /**
     * Get multiple prices at once
     */
    async getPrices(symbols) {
        const pipeline = this.redis.pipeline();
        
        for (const symbol of symbols) {
            const key = CACHE_KEYS.SYMBOL_PRICE(symbol);
            pipeline.get(key);
        }
        
        const results = await pipeline.exec();
        const prices = {};
        
        symbols.forEach((symbol, index) => {
            const [error, data] = results[index];
            if (!error && data) {
                prices[symbol] = JSON.parse(data);
            }
        });
        
        return prices;
    }

    /**
     * Store tick data in a time-series format
     */
    async storeTick(symbol, tickData) {
        const timestamp = tickData.timestamp || Date.now();
        const key = `ticks:${symbol}`;
        
        const tick = {
            price: tickData.price,
            volume: tickData.volume,
            bid: tickData.bid,
            ask: tickData.ask,
            timestamp
        };
        
        // Use Redis Streams for tick data
        await this.redis.xadd(
            key,
            'MAXLEN', '~', 10000, // Keep approximately 10k ticks
            timestamp,
            'data', JSON.stringify(tick)
        );
        
        // Publish tick data
        await this.publisher.publish(
            PUBSUB_CHANNELS.MARKET_DATA.TICK_DATA,
            JSON.stringify({ symbol, ...tick })
        );
        
        return tick;
    }

    /**
     * Get recent tick data for a symbol
     */
    async getTicks(symbol, count = 100) {
        const key = `ticks:${symbol}`;
        const ticks = await this.redis.xrevrange(key, '+', '-', 'COUNT', count);
        
        return ticks.map(([id, fields]) => {
            const data = JSON.parse(fields[1]); // fields[1] is the 'data' field
            return {
                id,
                ...data
            };
        });
    }

    /**
     * Cache market status (open/closed)
     */
    async cacheMarketStatus(status) {
        const key = CACHE_KEYS.MARKET_STATUS();
        const data = {
            isOpen: status.isOpen,
            nextOpen: status.nextOpen,
            nextClose: status.nextClose,
            timezone: status.timezone,
            timestamp: new Date().toISOString()
        };
        
        await this.redis.setex(key, 300, JSON.stringify(data)); // 5 minute TTL
        
        // Publish market status change
        await this.publisher.publish(
            PUBSUB_CHANNELS.NOTIFICATIONS.SYSTEM_STATUS,
            JSON.stringify({ type: 'market_status', ...data })
        );
        
        return data;
    }

    /**
     * Get cached market status
     */
    async getMarketStatus() {
        const key = CACHE_KEYS.MARKET_STATUS();
        const data = await this.redis.get(key);
        
        return data ? JSON.parse(data) : null;
    }

    /**
     * Subscribe to price updates for specific symbols
     */
    async subscribeToPriceUpdates(symbols, callback) {
        const channel = PUBSUB_CHANNELS.MARKET_DATA.PRICE_UPDATES;
        
        this.subscriber.on('message', (receivedChannel, message) => {
            if (receivedChannel === channel) {
                try {
                    const data = JSON.parse(message);
                    
                    if (data.type === 'batch') {
                        // Handle batch updates
                        const relevantUpdates = data.updates.filter(update => 
                            symbols.includes(update.symbol)
                        );
                        if (relevantUpdates.length > 0) {
                            callback(relevantUpdates);
                        }
                    } else if (symbols.includes(data.symbol)) {
                        // Handle single update
                        callback([data]);
                    }
                } catch (error) {
                    console.error('Error parsing price update:', error);
                }
            }
        });
        
        await this.subscriber.subscribe(channel);
    }

    /**
     * Get top movers (symbols with highest price changes)
     */
    async getTopMovers(limit = 10) {
        const pattern = CACHE_KEYS.SYMBOL_PRICE('*');
        const keys = await this.redis.keys(pattern);
        
        const prices = [];
        for (const key of keys) {
            const data = await this.redis.get(key);
            if (data) {
                const priceData = JSON.parse(data);
                if (priceData.changePercent !== undefined) {
                    prices.push(priceData);
                }
            }
        }
        
        // Sort by absolute change percentage
        prices.sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent));
        
        return prices.slice(0, limit);
    }

    /**
     * Cache watchlist symbols for quick access
     */
    async cacheWatchlist(userId, symbols) {
        const key = `watchlist:${userId}`;
        await this.redis.setex(key, 3600, JSON.stringify(symbols)); // 1 hour TTL
    }

    /**
     * Get cached watchlist
     */
    async getWatchlist(userId) {
        const key = `watchlist:${userId}`;
        const data = await this.redis.get(key);
        
        return data ? JSON.parse(data) : [];
    }

    /**
     * Get watchlist prices
     */
    async getWatchlistPrices(userId) {
        const symbols = await this.getWatchlist(userId);
        if (symbols.length === 0) {
            return {};
        }
        
        return await this.getPrices(symbols);
    }

    /**
     * Clean up old tick data (should be run periodically)
     */
    async cleanupOldTicks(maxAge = 24 * 60 * 60 * 1000) { // 24 hours in ms
        const pattern = 'ticks:*';
        const keys = await this.redis.keys(pattern);
        
        const cutoffTime = Date.now() - maxAge;
        let cleanedCount = 0;
        
        for (const key of keys) {
            // Remove ticks older than cutoff time
            const removed = await this.redis.xdel(key, cutoffTime);
            cleanedCount += removed;
        }
        
        return cleanedCount;
    }

    /**
     * Get cache statistics
     */
    async getCacheStats() {
        const priceKeys = await this.redis.keys(CACHE_KEYS.SYMBOL_PRICE('*'));
        const ohlcKeys = await this.redis.keys(CACHE_KEYS.SYMBOL_OHLC('*', '*'));
        const tickKeys = await this.redis.keys('ticks:*');
        
        const stats = {
            cachedPrices: priceKeys.length,
            cachedOHLC: ohlcKeys.length,
            tickStreams: tickKeys.length,
            memoryUsage: await this.redis.memory('usage')
        };
        
        return stats;
    }
}

module.exports = { MarketDataCache };