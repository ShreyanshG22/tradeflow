import { ZerodhaRedisCache, RedisCacheConfig, MarketQuote, InstrumentData, SessionData } from './ZerodhaRedisCache';
import { createLogger } from '../logger';

const logger = createLogger('ZerodhaCacheManager');

export interface CacheManagerConfig extends RedisCacheConfig {
  enableCacheWarming?: boolean;
  cacheWarmingInterval?: number;
  enableAutoInvalidation?: boolean;
  marketDataTTL?: number;
  instrumentDataTTL?: number;
  sessionTTL?: number;
  searchResultsTTL?: number;
}

export interface CacheStats {
  hitRate: number;
  missRate: number;
  totalRequests: number;
  totalHits: number;
  totalMisses: number;
}

export class ZerodhaCacheManager {
  private cache: ZerodhaRedisCache;
  private config: CacheManagerConfig;
  private stats: CacheStats;
  private warmingInterval?: NodeJS.Timeout;

  constructor(config: CacheManagerConfig) {
    this.config = {
      enableCacheWarming: true,
      cacheWarmingInterval: 300000, // 5 minutes
      enableAutoInvalidation: true,
      marketDataTTL: 60, // 1 minute
      instrumentDataTTL: 86400, // 24 hours
      sessionTTL: 28800, // 8 hours
      searchResultsTTL: 3600, // 1 hour
      ...config
    };

    this.cache = new ZerodhaRedisCache(this.config);
    this.stats = {
      hitRate: 0,
      missRate: 0,
      totalRequests: 0,
      totalHits: 0,
      totalMisses: 0
    };

    logger.info('Zerodha Cache Manager initialized', {
      enableCacheWarming: this.config.enableCacheWarming,
      enableAutoInvalidation: this.config.enableAutoInvalidation,
      marketDataTTL: this.config.marketDataTTL,
      instrumentDataTTL: this.config.instrumentDataTTL
    });
  }

  /**
   * Initialize cache manager
   */
  public async initialize(): Promise<void> {
    try {
      await this.cache.connect();
      
      if (this.config.enableCacheWarming) {
        this.startCacheWarming();
      }
      
      logger.info('Zerodha Cache Manager initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize Zerodha Cache Manager', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Shutdown cache manager
   */
  public async shutdown(): Promise<void> {
    try {
      if (this.warmingInterval) {
        clearInterval(this.warmingInterval);
      }
      
      await this.cache.disconnect();
      
      logger.info('Zerodha Cache Manager shutdown completed');
    } catch (error) {
      logger.error('Failed to shutdown Zerodha Cache Manager', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  // ============================================================================
  // MARKET DATA CACHING WITH STRATEGIES
  // ============================================================================

  /**
   * Get market quote with caching strategy
   */
  public async getMarketQuote(
    instrumentToken: number,
    fetchFunction?: () => Promise<MarketQuote>
  ): Promise<MarketQuote | null> {
    this.stats.totalRequests++;
    
    try {
      // Try cache first
      let quote = await this.cache.getMarketQuote(instrumentToken);
      
      if (quote) {
        this.stats.totalHits++;
        this.updateHitRate();
        logger.debug('Market quote cache hit', { instrumentToken });
        return quote;
      }

      // Cache miss - fetch from source if function provided
      if (fetchFunction) {
        quote = await fetchFunction();
        if (quote) {
          await this.cache.cacheMarketQuote(
            instrumentToken, 
            quote, 
            { ttl: this.config.marketDataTTL }
          );
          logger.debug('Market quote fetched and cached', { instrumentToken });
        }
      }

      this.stats.totalMisses++;
      this.updateHitRate();
      
      return quote;
    } catch (error) {
      logger.error('Failed to get market quote', {
        error: error instanceof Error ? error.message : 'Unknown error',
        instrumentToken
      });
      return null;
    }
  }

  /**
   * Get multiple market quotes with batch caching
   */
  public async getMarketQuotes(
    instrumentTokens: number[],
    fetchFunction?: (tokens: number[]) => Promise<MarketQuote[]>
  ): Promise<MarketQuote[]> {
    try {
      // Get cached quotes
      const cachedQuotes = await this.cache.getMarketQuotes(instrumentTokens);
      const cachedTokens = new Set(cachedQuotes.map(q => q.instrument_token));
      
      // Find missing tokens
      const missingTokens = instrumentTokens.filter(token => !cachedTokens.has(token));
      
      let fetchedQuotes: MarketQuote[] = [];
      
      // Fetch missing quotes if function provided
      if (missingTokens.length > 0 && fetchFunction) {
        fetchedQuotes = await fetchFunction(missingTokens);
        
        if (fetchedQuotes.length > 0) {
          await this.cache.cacheMarketQuotes(
            fetchedQuotes, 
            { ttl: this.config.marketDataTTL }
          );
        }
      }

      const allQuotes = [...cachedQuotes, ...fetchedQuotes];
      
      logger.debug('Batch market quotes retrieved', {
        requested: instrumentTokens.length,
        cached: cachedQuotes.length,
        fetched: fetchedQuotes.length,
        total: allQuotes.length
      });

      return allQuotes;
    } catch (error) {
      logger.error('Failed to get batch market quotes', {
        error: error instanceof Error ? error.message : 'Unknown error',
        count: instrumentTokens.length
      });
      return [];
    }
  }

  /**
   * Update market quote with write-through strategy
   */
  public async updateMarketQuote(quote: MarketQuote): Promise<void> {
    try {
      await this.cache.cacheMarketQuote(
        quote.instrument_token, 
        quote, 
        { ttl: this.config.marketDataTTL }
      );
      
      logger.debug('Market quote updated in cache', { 
        instrumentToken: quote.instrument_token,
        tradingsymbol: quote.tradingsymbol
      });
    } catch (error) {
      logger.error('Failed to update market quote in cache', {
        error: error instanceof Error ? error.message : 'Unknown error',
        instrumentToken: quote.instrument_token
      });
    }
  }

  // ============================================================================
  // INSTRUMENT DATA CACHING
  // ============================================================================

  /**
   * Get instrument with caching strategy
   */
  public async getInstrument(
    instrumentToken: number,
    fetchFunction?: () => Promise<InstrumentData>
  ): Promise<InstrumentData | null> {
    this.stats.totalRequests++;
    
    try {
      // Try cache first
      let instrument = await this.cache.getInstrument(instrumentToken);
      
      if (instrument) {
        this.stats.totalHits++;
        this.updateHitRate();
        logger.debug('Instrument cache hit', { instrumentToken });
        return instrument;
      }

      // Cache miss - fetch from source if function provided
      if (fetchFunction) {
        instrument = await fetchFunction();
        if (instrument) {
          await this.cache.cacheInstrument(
            instrumentToken, 
            instrument, 
            { ttl: this.config.instrumentDataTTL }
          );
          logger.debug('Instrument fetched and cached', { instrumentToken });
        }
      }

      this.stats.totalMisses++;
      this.updateHitRate();
      
      return instrument;
    } catch (error) {
      logger.error('Failed to get instrument', {
        error: error instanceof Error ? error.message : 'Unknown error',
        instrumentToken
      });
      return null;
    }
  }

  /**
   * Search instruments with caching
   */
  public async searchInstruments(
    query: string,
    fetchFunction?: () => Promise<InstrumentData[]>
  ): Promise<InstrumentData[]> {
    this.stats.totalRequests++;
    
    try {
      // Try cache first
      let results = await this.cache.getInstrumentSearch(query);
      
      if (results) {
        this.stats.totalHits++;
        this.updateHitRate();
        logger.debug('Instrument search cache hit', { query });
        return results;
      }

      // Cache miss - fetch from source if function provided
      if (fetchFunction) {
        results = await fetchFunction();
        if (results) {
          await this.cache.cacheInstrumentSearch(
            query, 
            results, 
            { ttl: this.config.searchResultsTTL }
          );
          logger.debug('Instrument search results fetched and cached', { 
            query, 
            resultCount: results.length 
          });
        }
      }

      this.stats.totalMisses++;
      this.updateHitRate();
      
      return results || [];
    } catch (error) {
      logger.error('Failed to search instruments', {
        error: error instanceof Error ? error.message : 'Unknown error',
        query
      });
      return [];
    }
  }

  // ============================================================================
  // SESSION MANAGEMENT
  // ============================================================================

  /**
   * Get session with automatic extension
   */
  public async getSession(userId: string): Promise<SessionData | null> {
    try {
      const session = await this.cache.getSession(userId);
      
      if (session) {
        // Check if session is close to expiry and extend if needed
        const expiryTime = new Date(session.expires_at).getTime();
        const now = Date.now();
        const timeToExpiry = expiryTime - now;
        
        // Extend session if less than 1 hour remaining
        if (timeToExpiry < 3600000 && timeToExpiry > 0) {
          await this.extendSession(userId, session);
          logger.debug('Session automatically extended', { userId });
        }
      }
      
      return session;
    } catch (error) {
      logger.error('Failed to get session', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId
      });
      return null;
    }
  }

  /**
   * Set session with automatic TTL calculation
   */
  public async setSession(userId: string, session: SessionData): Promise<void> {
    try {
      // Calculate TTL based on session expiry
      const expiryTime = new Date(session.expires_at).getTime();
      const now = Date.now();
      const ttl = Math.max(Math.floor((expiryTime - now) / 1000), 0);
      
      await this.cache.cacheSession(userId, session, { ttl });
      
      logger.debug('Session cached with calculated TTL', { 
        userId, 
        ttl,
        expiresAt: session.expires_at
      });
    } catch (error) {
      logger.error('Failed to set session', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId
      });
    }
  }

  /**
   * Extend session TTL
   */
  public async extendSession(userId: string, session: SessionData): Promise<void> {
    try {
      const extendedTTL = this.config.sessionTTL || 28800;
      await this.cache.cacheSession(userId, session, { ttl: extendedTTL });
      
      logger.debug('Session extended', { userId, extendedTTL });
    } catch (error) {
      logger.error('Failed to extend session', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId
      });
    }
  }

  /**
   * Delete session
   */
  public async deleteSession(userId: string): Promise<void> {
    try {
      await this.cache.deleteSession(userId);
      logger.debug('Session deleted', { userId });
    } catch (error) {
      logger.error('Failed to delete session', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId
      });
    }
  }

  // ============================================================================
  // RATE LIMITING
  // ============================================================================

  /**
   * Check and increment rate limit
   */
  public async checkRateLimit(
    userId: string, 
    limit: number, 
    window: number = 60
  ): Promise<{ allowed: boolean; current: number; remaining: number }> {
    try {
      const current = await this.cache.incrementRateLimit(userId, window);
      const allowed = current <= limit;
      const remaining = Math.max(0, limit - current);
      
      logger.debug('Rate limit checked', { 
        userId, 
        current, 
        limit, 
        allowed, 
        remaining 
      });
      
      return { allowed, current, remaining };
    } catch (error) {
      logger.error('Failed to check rate limit', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId
      });
      
      // Fail open - allow request if rate limiting fails
      return { allowed: true, current: 0, remaining: limit };
    }
  }

  // ============================================================================
  // CACHE WARMING AND MAINTENANCE
  // ============================================================================

  /**
   * Start cache warming process
   */
  private startCacheWarming(): void {
    if (this.config.cacheWarmingInterval) {
      this.warmingInterval = setInterval(async () => {
        try {
          await this.performCacheWarming();
        } catch (error) {
          logger.error('Cache warming failed', {
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }, this.config.cacheWarmingInterval);
      
      logger.info('Cache warming started', { 
        interval: this.config.cacheWarmingInterval 
      });
    }
  }

  /**
   * Perform cache warming
   */
  private async performCacheWarming(): Promise<void> {
    try {
      // This would typically warm up popular instruments
      // Implementation depends on business logic
      logger.debug('Cache warming performed');
    } catch (error) {
      logger.error('Cache warming error', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Update hit rate statistics
   */
  private updateHitRate(): void {
    this.stats.hitRate = this.stats.totalRequests > 0 
      ? (this.stats.totalHits / this.stats.totalRequests) * 100 
      : 0;
    this.stats.missRate = 100 - this.stats.hitRate;
  }

  /**
   * Get cache statistics
   */
  public getStats(): CacheStats & { redis: any } {
    return {
      ...this.stats,
      redis: this.cache.getStats()
    };
  }

  /**
   * Clear all cache
   */
  public async clearAll(): Promise<number> {
    try {
      const cleared = await this.cache.clearAll();
      
      // Reset stats
      this.stats = {
        hitRate: 0,
        missRate: 0,
        totalRequests: 0,
        totalHits: 0,
        totalMisses: 0
      };
      
      logger.info('All cache cleared', { keysCleared: cleared });
      return cleared;
    } catch (error) {
      logger.error('Failed to clear all cache', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return 0;
    }
  }

  /**
   * Health check
   */
  public async healthCheck(): Promise<{ status: string; latency?: number; stats?: any }> {
    try {
      const cacheHealth = await this.cache.healthCheck();
      const cacheStats = await this.cache.getStats();
      
      return {
        ...cacheHealth,
        stats: {
          ...this.stats,
          redis: cacheStats
        }
      };
    } catch (error) {
      logger.error('Cache manager health check failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      return { status: 'unhealthy' };
    }
  }
}