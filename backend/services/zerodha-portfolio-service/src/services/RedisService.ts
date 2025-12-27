import { createClient, RedisClientType } from 'redis';
import { logger } from '../utils/logger';

class RedisService {
  private static client: RedisClientType;

  static async initialize(): Promise<void> {
    try {
      this.client = createClient({
        url: process.env.REDIS_URL || 'redis://localhost:6379',
        socket: {
          connectTimeout: 5000,
          lazyConnect: true
        }
      });

      this.client.on('error', (error) => {
        logger.error('Redis client error:', error);
      });

      this.client.on('connect', () => {
        logger.info('Redis client connected');
      });

      this.client.on('disconnect', () => {
        logger.warn('Redis client disconnected');
      });

      await this.client.connect();
      logger.info('Redis connection established');
    } catch (error) {
      logger.error('Failed to initialize Redis connection:', error);
      throw error;
    }
  }

  static async get(key: string): Promise<string | null> {
    try {
      return await this.client.get(key);
    } catch (error) {
      logger.error(`Redis GET failed for key ${key}:`, error);
      throw error;
    }
  }

  static async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    try {
      if (ttlSeconds) {
        await this.client.setEx(key, ttlSeconds, value);
      } else {
        await this.client.set(key, value);
      }
    } catch (error) {
      logger.error(`Redis SET failed for key ${key}:`, error);
      throw error;
    }
  }

  static async del(key: string): Promise<void> {
    try {
      await this.client.del(key);
    } catch (error) {
      logger.error(`Redis DEL failed for key ${key}:`, error);
      throw error;
    }
  }

  static async exists(key: string): Promise<boolean> {
    try {
      const result = await this.client.exists(key);
      return result === 1;
    } catch (error) {
      logger.error(`Redis EXISTS failed for key ${key}:`, error);
      throw error;
    }
  }

  static async hGet(key: string, field: string): Promise<string | undefined> {
    try {
      return await this.client.hGet(key, field);
    } catch (error) {
      logger.error(`Redis HGET failed for key ${key}, field ${field}:`, error);
      throw error;
    }
  }

  static async hSet(key: string, field: string, value: string): Promise<void> {
    try {
      await this.client.hSet(key, field, value);
    } catch (error) {
      logger.error(`Redis HSET failed for key ${key}, field ${field}:`, error);
      throw error;
    }
  }

  static async hGetAll(key: string): Promise<Record<string, string>> {
    try {
      return await this.client.hGetAll(key);
    } catch (error) {
      logger.error(`Redis HGETALL failed for key ${key}:`, error);
      throw error;
    }
  }

  static async close(): Promise<void> {
    if (this.client) {
      await this.client.quit();
      logger.info('Redis connection closed');
    }
  }
}

export { RedisService };