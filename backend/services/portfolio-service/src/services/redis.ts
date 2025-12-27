import { createClient, RedisClientType } from 'redis';
import { config } from '../config/config';
import { logger } from '../utils/logger';

class RedisService {
  private client: RedisClientType | null = null;

  async initialize(): Promise<void> {
    try {
      this.client = createClient({
        socket: {
          host: config.redis.host,
          port: config.redis.port
        },
        password: config.redis.password,
        database: config.redis.db
      });

      this.client.on('error', (error) => {
        logger.error('Redis client error', error);
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
      logger.error('Failed to initialize Redis connection', error);
      throw error;
    }
  }

  async get(key: string): Promise<string | null> {
    if (!this.client) {
      throw new Error('Redis not initialized');
    }
    return this.client.get(key);
  }

  async set(key: string, value: string, ttl?: number): Promise<void> {
    if (!this.client) {
      throw new Error('Redis not initialized');
    }
    
    if (ttl) {
      await this.client.setEx(key, ttl, value);
    } else {
      await this.client.set(key, value);
    }
  }

  async del(key: string): Promise<void> {
    if (!this.client) {
      throw new Error('Redis not initialized');
    }
    await this.client.del(key);
  }

  async exists(key: string): Promise<boolean> {
    if (!this.client) {
      throw new Error('Redis not initialized');
    }
    const result = await this.client.exists(key);
    return result === 1;
  }

  async hGet(key: string, field: string): Promise<string | undefined> {
    if (!this.client) {
      throw new Error('Redis not initialized');
    }
    return this.client.hGet(key, field);
  }

  async hSet(key: string, field: string, value: string): Promise<void> {
    if (!this.client) {
      throw new Error('Redis not initialized');
    }
    await this.client.hSet(key, field, value);
  }

  async hGetAll(key: string): Promise<Record<string, string>> {
    if (!this.client) {
      throw new Error('Redis not initialized');
    }
    return this.client.hGetAll(key);
  }

  async publish(channel: string, message: string): Promise<void> {
    if (!this.client) {
      throw new Error('Redis not initialized');
    }
    await this.client.publish(channel, message);
  }

  async subscribe(channel: string, callback: (message: string) => void): Promise<void> {
    if (!this.client) {
      throw new Error('Redis not initialized');
    }
    
    const subscriber = this.client.duplicate();
    await subscriber.connect();
    
    await subscriber.subscribe(channel, callback);
  }

  async close(): Promise<void> {
    if (this.client) {
      await this.client.quit();
      this.client = null;
      logger.info('Redis connection closed');
    }
  }
}

export const redisService = new RedisService();