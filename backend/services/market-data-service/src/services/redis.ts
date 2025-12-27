import { createClient, RedisClientType } from 'redis';
import { config } from '../config/config';
import logger from '../utils/logger';
import { CacheEntry } from '../types';

class RedisService {
  private client: RedisClientType;
  private connected: boolean = false;

  constructor() {
    this.client = createClient({
      socket: {
        host: config.redis.host,
        port: config.redis.port,
      },
      password: config.redis.password,
      database: config.redis.db,
    });

    this.client.on('error', (err) => {
      logger.error('Redis Client Error:', err);
      this.connected = false;
    });

    this.client.on('connect', () => {
      logger.info('Redis Client Connected');
      this.connected = true;
    });

    this.client.on('disconnect', () => {
      logger.warn('Redis Client Disconnected');
      this.connected = false;
    });
  }

  async connect(): Promise<void> {
    try {
      await this.client.connect();
      this.connected = true;
      logger.info('Redis connection established');
    } catch (error) {
      logger.error('Failed to connect to Redis:', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    try {
      await this.client.disconnect();
      this.connected = false;
      logger.info('Redis connection closed');
    } catch (error) {
      logger.error('Error disconnecting from Redis:', error);
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    if (!this.connected) {
      logger.warn('Redis not connected, skipping cache set');
      return;
    }

    try {
      const cacheEntry: CacheEntry<T> = {
        data: value,
        timestamp: new Date(),
        ttl: ttlSeconds || config.cache.ttlSeconds,
      };

      const serialized = JSON.stringify(cacheEntry);
      
      if (ttlSeconds) {
        await this.client.setEx(key, ttlSeconds, serialized);
      } else {
        await this.client.setEx(key, config.cache.ttlSeconds, serialized);
      }
    } catch (error) {
      logger.error('Error setting cache value:', error);
    }
  }

  async get<T>(key: string): Promise<T | null> {
    if (!this.connected) {
      logger.warn('Redis not connected, skipping cache get');
      return null;
    }

    try {
      const cached = await this.client.get(key);
      if (!cached) {
        return null;
      }

      const cacheEntry: CacheEntry<T> = JSON.parse(cached);
      
      // Check if cache entry is still valid
      const now = new Date();
      const cacheAge = (now.getTime() - new Date(cacheEntry.timestamp).getTime()) / 1000;
      
      if (cacheAge > cacheEntry.ttl) {
        await this.client.del(key);
        return null;
      }

      return cacheEntry.data;
    } catch (error) {
      logger.error('Error getting cache value:', error);
      return null;
    }
  }

  async del(key: string): Promise<void> {
    if (!this.connected) {
      return;
    }

    try {
      await this.client.del(key);
    } catch (error) {
      logger.error('Error deleting cache key:', error);
    }
  }

  async exists(key: string): Promise<boolean> {
    if (!this.connected) {
      return false;
    }

    try {
      const result = await this.client.exists(key);
      return result === 1;
    } catch (error) {
      logger.error('Error checking cache key existence:', error);
      return false;
    }
  }

  generateCacheKey(prefix: string, ...parts: string[]): string {
    return `market-data:${prefix}:${parts.join(':')}`;
  }
}

export default new RedisService();