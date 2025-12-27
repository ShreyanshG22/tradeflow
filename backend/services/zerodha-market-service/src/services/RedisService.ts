import { createClient, RedisClientType } from 'redis';
import { createLogger } from '@tradeflow/zerodha-utils';

const logger = createLogger('RedisService');

export class RedisService {
  private client: RedisClientType;
  private isConnected: boolean = false;

  constructor() {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    this.client = createClient({
      url: redisUrl,
      socket: {
        reconnectStrategy: (retries) => {
          if (retries > 10) {
            logger.error('Redis reconnection failed after 10 attempts');
            return false;
          }
          return Math.min(retries * 100, 3000);
        },
      },
    });

    this.client.on('error', (error) => {
      logger.error('Redis client error:', error);
    });

    this.client.on('connect', () => {
      logger.info('Redis client connected');
      this.isConnected = true;
    });

    this.client.on('disconnect', () => {
      logger.warn('Redis client disconnected');
      this.isConnected = false;
    });
  }

  public async connect(): Promise<void> {
    if (!this.isConnected) {
      await this.client.connect();
    }
  }

  public async disconnect(): Promise<void> {
    if (this.isConnected) {
      await this.client.disconnect();
      this.isConnected = false;
    }
  }

  public isReady(): boolean {
    return this.isConnected;
  }

  // Instrument caching methods
  public async cacheInstruments(exchange: string, instruments: any[]): Promise<void> {
    const key = `instruments:${exchange}`;
    const value = JSON.stringify(instruments);
    await this.client.setEx(key, 24 * 60 * 60, value); // Cache for 24 hours
    logger.info(`Cached ${instruments.length} instruments for ${exchange}`);
  }

  public async getCachedInstruments(exchange: string): Promise<any[] | null> {
    const key = `instruments:${exchange}`;
    const value = await this.client.get(key);
    return value ? JSON.parse(value) : null;
  }

  public async cacheInstrumentSearch(query: string, results: any[]): Promise<void> {
    const key = `search:${query.toLowerCase()}`;
    const value = JSON.stringify(results);
    await this.client.setEx(key, 60 * 60, value); // Cache for 1 hour
  }

  public async getCachedInstrumentSearch(query: string): Promise<any[] | null> {
    const key = `search:${query.toLowerCase()}`;
    const value = await this.client.get(key);
    return value ? JSON.parse(value) : null;
  }

  // Quote caching methods
  public async cacheQuote(exchange: string, symbol: string, quote: any): Promise<void> {
    const key = `quote:${exchange}:${symbol}`;
    const value = JSON.stringify(quote);
    await this.client.setEx(key, 60, value); // Cache for 1 minute
  }

  public async getCachedQuote(exchange: string, symbol: string): Promise<any | null> {
    const key = `quote:${exchange}:${symbol}`;
    const value = await this.client.get(key);
    return value ? JSON.parse(value) : null;
  }

  // Historical data caching methods
  public async cacheHistoricalData(
    instrumentToken: number,
    interval: string,
    fromDate: string,
    toDate: string,
    data: any[]
  ): Promise<void> {
    const key = `historical:${instrumentToken}:${interval}:${fromDate}:${toDate}`;
    const value = JSON.stringify(data);
    await this.client.setEx(key, 24 * 60 * 60, value); // Cache for 24 hours
  }

  public async getCachedHistoricalData(
    instrumentToken: number,
    interval: string,
    fromDate: string,
    toDate: string
  ): Promise<any[] | null> {
    const key = `historical:${instrumentToken}:${interval}:${fromDate}:${toDate}`;
    const value = await this.client.get(key);
    return value ? JSON.parse(value) : null;
  }

  // Market status caching
  public async cacheMarketStatus(exchange: string, status: any): Promise<void> {
    const key = `market_status:${exchange}`;
    const value = JSON.stringify(status);
    await this.client.setEx(key, 5 * 60, value); // Cache for 5 minutes
  }

  public async getCachedMarketStatus(exchange: string): Promise<any | null> {
    const key = `market_status:${exchange}`;
    const value = await this.client.get(key);
    return value ? JSON.parse(value) : null;
  }

  // Generic caching methods
  public async set(key: string, value: any, ttlSeconds?: number): Promise<void> {
    const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
    if (ttlSeconds) {
      await this.client.setEx(key, ttlSeconds, stringValue);
    } else {
      await this.client.set(key, stringValue);
    }
  }

  public async get(key: string): Promise<any | null> {
    const value = await this.client.get(key);
    if (!value) return null;
    
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }

  public async del(key: string): Promise<void> {
    await this.client.del(key);
  }

  public async exists(key: string): Promise<boolean> {
    const result = await this.client.exists(key);
    return result === 1;
  }

  public async keys(pattern: string): Promise<string[]> {
    return await this.client.keys(pattern);
  }

  public async flushPattern(pattern: string): Promise<void> {
    const keys = await this.keys(pattern);
    if (keys.length > 0) {
      await this.client.del(keys);
      logger.info(`Flushed ${keys.length} keys matching pattern: ${pattern}`);
    }
  }
}