import { createClient, RedisClientType } from 'redis';
import { createLogger } from '../logger';

const logger = createLogger('ZerodhaRedisCache');

export interface RedisCacheConfig {
  url: string;
  keyPrefix?: string;
  defaultTTL?: number;
  maxRetries?: number;
  retryDelay?: number;
}

export interface CacheOptions {
  ttl?: number;
  compress?: boolean;
}

export interface MarketQuote {
  instrument_token: number;
  tradingsymbol: string;
  exchange: string;
  last_price: number;
  volume: number;
  ohlc: {
    open: number;
    high: number;
    low: number;
    close: number;
  };
  net_change: number;
  timestamp: string;
}

export interface InstrumentData {
  instrument_token: number;
  tradingsymbol: string;
  name?: string;
  exchange: string;
  segment: string;
  instrument_type: string;
  lot_size: number;
  tick_size: number;
}

export interface SessionData {
  user_id: string;
  access_token: string;
  public_token: string;
  refresh_token?: string;
  login_time: string;
  expires_at: string;
  api_key: string;
}

export class ZerodhaRedisCache {
  private client: RedisClientType;
  private config: RedisCacheConfig;
  private isConnected: boolean = false;

  constructor(config: RedisCacheConfig) {
    this.config = {
      keyPrefix: 'zerodha',
      defaultTTL: 3600, // 1 hour
      maxRetries: 10,
      retryDelay: 100,
      ...config
    };

    this.client = createClient({
      url: this.config.url,
      socket: {
        reconnectStrategy: (retries) => {
          if (retries > (this.config.maxRetries || 10)) {
            logger.error('Redis reconnection failed after max attempts', { 
              maxRetries: this.config.maxRetries 
            });
            return new Error('Redis connection failed');
          }
          return Math.min(retries * (this.config.retryDelay || 100), 3000);
        }
      }
    });

    this.setupEventHandlers();
  }

  /**
   * Setup Redis event handlers
   */
  private setupEventHandlers(): void {
    this.client.on('connect', () => {
      logger.info('Redis cache client connected');
    });

    this.client.on('ready', () => {
      logger.info('Redis cache client ready');
      this.isConnected = true;
    });

    this.client.on('error', (error) => {
      logger.error('Redis cache client error', { error: error.message });
      this.isConnected = false;
    });

    this.client.on('end', () => {
      logger.info('Redis cache client disconnected');
      this.isConnected = false;
    });

    this.client.on('reconnecting', () => {
      logger.info('Redis cache client reconnecting');
    });
  }

  /**
   * Connect to Redis
   */
  public async connect(): Promise<void> {
    try {
      if (!this.isConnected) {
        await this.client.connect();
        logger.info('Redis cache connection established');
      }
    } catch (error) {
      logger.error('Failed to connect to Redis cache', { 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      throw error;
    }
  }

  /**
   * Disconnect from Redis
   */
  public async disconnect(): Promise<void> {
    try {
      if (this.isConnected) {
        await this.client.disconnect();
        logger.info('Redis cache connection closed');
      }
    } catch (error) {
      logger.error('Failed to disconnect from Redis cache', { 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
    }
  }

  /**
   * Check if Redis is connected
   */
  public isReady(): boolean {
    return this.isConnected;
  }

  // ============================================================================
  // MARKET DATA CACHING
  // ============================================================================

  /**
   * Cache market quote
   */
  public async cacheMarketQuote(
    instrumentToken: number, 
    quote: MarketQuote, 
    options: CacheOptions = {}
  ): Promise<void> {
    try {
      const key = this.getMarketQuoteKey(instrumentToken);
      const ttl = options.ttl || 60; // Default 60 seconds for market data
      const value = JSON.stringify(quote);
      
      await this.client.setEx(key, ttl, value);
      
      logger.debug('Market quote cached', { 
        instrumentToken, 
        tradingsymbol: quote.tradingsymbol,
        ttl 
      });
    } catch (error) {
      logger.error('Failed to cache market quote', {
        error: error instanceof Error ? error.message : 'Unknown error',
        instrumentToken
      });
    }
  }

  /**
   * Get cached market quote
   */
  public async getMarketQuote(instrumentToken: number): Promise<MarketQuote | null> {
    try {
      const key = this.getMarketQuoteKey(instrumentToken);
      const value = await this.client.get(key);
      
      if (!value) {
        return null;
      }

      const quote = JSON.parse(value) as MarketQuote;
      
      logger.debug('Market quote retrieved from cache', { 
        instrumentToken,
        tradingsymbol: quote.tradingsymbol
      });
      
      return quote;
    } catch (error) {
      logger.error('Failed to get market quote from cache', {
        error: error instanceof Error ? error.message : 'Unknown error',
        instrumentToken
      });
      return null;
    }
  }

  /**
   * Cache multiple market quotes
   */
  public async cacheMarketQuotes(
    quotes: MarketQuote[], 
    options: CacheOptions = {}
  ): Promise<void> {
    try {
      const ttl = options.ttl || 60;
      const multi = this.client.multi();
      
      quotes.forEach(quote => {
        const key = this.getMarketQuoteKey(quote.instrument_token);
        const value = JSON.stringify(quote);
        multi.setEx(key, ttl, value);
      });
      
      await multi.exec();
      
      logger.debug('Multiple market quotes cached', { 
        count: quotes.length,
        ttl 
      });
    } catch (error) {
      logger.error('Failed to cache multiple market quotes', {
        error: error instanceof Error ? error.message : 'Unknown error',
        count: quotes.length
      });
    }
  }

  /**
   * Get multiple cached market quotes
   */
  public async getMarketQuotes(instrumentTokens: number[]): Promise<MarketQuote[]> {
    try {
      const keys = instrumentTokens.map(token => this.getMarketQuoteKey(token));
      const values = await this.client.mGet(keys);
      
      const quotes: MarketQuote[] = [];
      values.forEach((value, index) => {
        if (value) {
          try {
            const quote = JSON.parse(value) as MarketQuote;
            quotes.push(quote);
          } catch (parseError) {
            logger.warn('Failed to parse cached market quote', {
              instrumentToken: instrumentTokens[index],
              error: parseError instanceof Error ? parseError.message : 'Parse error'
            });
          }
        }
      });
      
      logger.debug('Multiple market quotes retrieved from cache', { 
        requested: instrumentTokens.length,
        found: quotes.length
      });
      
      return quotes;
    } catch (error) {
      logger.error('Failed to get multiple market quotes from cache', {
        error: error instanceof Error ? error.message : 'Unknown error',
        count: instrumentTokens.length
      });
      return [];
    }
  }

  // ============================================================================
  // INSTRUMENT DATA CACHING
  // ============================================================================

  /**
   * Cache instrument data
   */
  public async cacheInstrument(
    instrumentToken: number, 
    instrument: InstrumentData, 
    options: CacheOptions = {}
  ): Promise<void> {
    try {
      const key = this.getInstrumentKey(instrumentToken);
      const ttl = options.ttl || 86400; // Default 24 hours for instrument data
      const value = JSON.stringify(instrument);
      
      await this.client.setEx(key, ttl, value);
      
      logger.debug('Instrument cached', { 
        instrumentToken, 
        tradingsymbol: instrument.tradingsymbol,
        ttl 
      });
    } catch (error) {
      logger.error('Failed to cache instrument', {
        error: error instanceof Error ? error.message : 'Unknown error',
        instrumentToken
      });
    }
  }

  /**
   * Get cached instrument data
   */
  public async getInstrument(instrumentToken: number): Promise<InstrumentData | null> {
    try {
      const key = this.getInstrumentKey(instrumentToken);
      const value = await this.client.get(key);
      
      if (!value) {
        return null;
      }

      const instrument = JSON.parse(value) as InstrumentData;
      
      logger.debug('Instrument retrieved from cache', { 
        instrumentToken,
        tradingsymbol: instrument.tradingsymbol
      });
      
      return instrument;
    } catch (error) {
      logger.error('Failed to get instrument from cache', {
        error: error instanceof Error ? error.message : 'Unknown error',
        instrumentToken
      });
      return null;
    }
  }

  /**
   * Cache instrument search results
   */
  public async cacheInstrumentSearch(
    searchQuery: string, 
    results: InstrumentData[], 
    options: CacheOptions = {}
  ): Promise<void> {
    try {
      const key = this.getInstrumentSearchKey(searchQuery);
      const ttl = options.ttl || 3600; // Default 1 hour for search results
      const value = JSON.stringify(results);
      
      await this.client.setEx(key, ttl, value);
      
      logger.debug('Instrument search results cached', { 
        searchQuery, 
        resultCount: results.length,
        ttl 
      });
    } catch (error) {
      logger.error('Failed to cache instrument search results', {
        error: error instanceof Error ? error.message : 'Unknown error',
        searchQuery
      });
    }
  }

  /**
   * Get cached instrument search results
   */
  public async getInstrumentSearch(searchQuery: string): Promise<InstrumentData[] | null> {
    try {
      const key = this.getInstrumentSearchKey(searchQuery);
      const value = await this.client.get(key);
      
      if (!value) {
        return null;
      }

      const results = JSON.parse(value) as InstrumentData[];
      
      logger.debug('Instrument search results retrieved from cache', { 
        searchQuery,
        resultCount: results.length
      });
      
      return results;
    } catch (error) {
      logger.error('Failed to get instrument search results from cache', {
        error: error instanceof Error ? error.message : 'Unknown error',
        searchQuery
      });
      return null;
    }
  }

  // ============================================================================
  // SESSION MANAGEMENT
  // ============================================================================

  /**
   * Cache user session
   */
  public async cacheSession(
    userId: string, 
    session: SessionData, 
    options: CacheOptions = {}
  ): Promise<void> {
    try {
      const key = this.getSessionKey(userId);
      const ttl = options.ttl || 28800; // Default 8 hours for sessions
      const value = JSON.stringify(session);
      
      await this.client.setEx(key, ttl, value);
      
      logger.debug('Session cached', { 
        userId, 
        ttl 
      });
    } catch (error) {
      logger.error('Failed to cache session', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId
      });
    }
  }

  /**
   * Get cached session
   */
  public async getSession(userId: string): Promise<SessionData | null> {
    try {
      const key = this.getSessionKey(userId);
      const value = await this.client.get(key);
      
      if (!value) {
        return null;
      }

      const session = JSON.parse(value) as SessionData;
      
      logger.debug('Session retrieved from cache', { 
        userId,
        expiresAt: session.expires_at
      });
      
      return session;
    } catch (error) {
      logger.error('Failed to get session from cache', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId
      });
      return null;
    }
  }

  /**
   * Delete cached session
   */
  public async deleteSession(userId: string): Promise<void> {
    try {
      const key = this.getSessionKey(userId);
      await this.client.del(key);
      
      logger.debug('Session deleted from cache', { userId });
    } catch (error) {
      logger.error('Failed to delete session from cache', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId
      });
    }
  }

  // ============================================================================
  // RATE LIMITING
  // ============================================================================

  /**
   * Increment rate limit counter
   */
  public async incrementRateLimit(
    userId: string, 
    window: number = 60
  ): Promise<number> {
    try {
      const key = this.getRateLimitKey(userId);
      
      const multi = this.client.multi();
      multi.incr(key);
      multi.expire(key, window);
      
      const results = await multi.exec();
      const count = results?.[0] as number || 0;
      
      logger.debug('Rate limit incremented', { 
        userId, 
        count,
        window 
      });
      
      return count;
    } catch (error) {
      logger.error('Failed to increment rate limit', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId
      });
      return 0;
    }
  }

  /**
   * Get current rate limit count
   */
  public async getRateLimit(userId: string): Promise<number> {
    try {
      const key = this.getRateLimitKey(userId);
      const value = await this.client.get(key);
      
      return value ? parseInt(value, 10) : 0;
    } catch (error) {
      logger.error('Failed to get rate limit', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId
      });
      return 0;
    }
  }

  // ============================================================================
  // CACHE WARMING AND INVALIDATION
  // ============================================================================

  /**
   * Warm up cache with popular instruments
   */
  public async warmUpInstruments(instruments: InstrumentData[]): Promise<void> {
    try {
      const multi = this.client.multi();
      const ttl = 86400; // 24 hours
      
      instruments.forEach(instrument => {
        const key = this.getInstrumentKey(instrument.instrument_token);
        const value = JSON.stringify(instrument);
        multi.setEx(key, ttl, value);
      });
      
      await multi.exec();
      
      logger.info('Cache warmed up with instruments', { 
        count: instruments.length 
      });
    } catch (error) {
      logger.error('Failed to warm up instrument cache', {
        error: error instanceof Error ? error.message : 'Unknown error',
        count: instruments.length
      });
    }
  }

  /**
   * Invalidate cache by pattern
   */
  public async invalidatePattern(pattern: string): Promise<number> {
    try {
      const fullPattern = this.getKey(pattern);
      const keys = await this.client.keys(fullPattern);
      
      if (keys.length > 0) {
        const deleted = await this.client.del(keys);
        
        logger.info('Cache invalidated by pattern', { 
          pattern: fullPattern,
          keysDeleted: deleted 
        });
        
        return deleted;
      }
      
      return 0;
    } catch (error) {
      logger.error('Failed to invalidate cache by pattern', {
        error: error instanceof Error ? error.message : 'Unknown error',
        pattern
      });
      return 0;
    }
  }

  /**
   * Clear all Zerodha cache
   */
  public async clearAll(): Promise<number> {
    try {
      return await this.invalidatePattern('*');
    } catch (error) {
      logger.error('Failed to clear all cache', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return 0;
    }
  }

  // ============================================================================
  // KEY GENERATION METHODS
  // ============================================================================

  private getKey(suffix: string): string {
    return `${this.config.keyPrefix}:${suffix}`;
  }

  private getMarketQuoteKey(instrumentToken: number): string {
    return this.getKey(`quote:${instrumentToken}`);
  }

  private getInstrumentKey(instrumentToken: number): string {
    return this.getKey(`instrument:${instrumentToken}`);
  }

  private getInstrumentSearchKey(query: string): string {
    const normalizedQuery = query.toLowerCase().replace(/\s+/g, '_');
    return this.getKey(`search:${normalizedQuery}`);
  }

  private getSessionKey(userId: string): string {
    return this.getKey(`session:${userId}`);
  }

  private getRateLimitKey(userId: string): string {
    return this.getKey(`rate_limit:${userId}`);
  }

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  /**
   * Health check
   */
  public async healthCheck(): Promise<{ status: string; latency?: number }> {
    try {
      const start = Date.now();
      await this.client.ping();
      const latency = Date.now() - start;
      
      return {
        status: 'healthy',
        latency
      };
    } catch (error) {
      logger.error('Redis cache health check failed', { 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      
      return {
        status: 'unhealthy'
      };
    }
  }

  /**
   * Get cache statistics
   */
  public async getStats(): Promise<{
    connected: boolean;
    memory_usage?: string;
    total_keys?: number;
    zerodha_keys?: number;
  }> {
    try {
      if (!this.isConnected) {
        return { connected: false };
      }

      const info = await this.client.info('memory');
      const memoryMatch = info.match(/used_memory_human:([^\r\n]+)/);
      const memoryUsage = memoryMatch ? memoryMatch[1] : 'unknown';

      const totalKeys = await this.client.dbSize();
      const zerodhaKeys = await this.client.keys(this.getKey('*'));

      return {
        connected: true,
        memory_usage: memoryUsage,
        total_keys: totalKeys,
        zerodha_keys: zerodhaKeys.length
      };
    } catch (error) {
      logger.error('Failed to get cache statistics', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      return { connected: false };
    }
  }
}