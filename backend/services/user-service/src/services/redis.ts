import { createClient, RedisClientType } from 'redis';
import { config } from '../config/config';
import { logger } from '../utils/logger';

export class RedisService {
  private static client: RedisClientType;

  static async initialize(): Promise<void> {
    const clientOptions: any = {
      socket: {
        host: config.redis.host,
        port: config.redis.port
      },
      database: config.redis.db
    };

    if (config.redis.password) {
      clientOptions.password = config.redis.password;
    }

    this.client = createClient(clientOptions);

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
  }

  static getClient(): RedisClientType {
    if (!this.client) {
      throw new Error('Redis client not initialized');
    }
    return this.client;
  }

  static async set(key: string, value: string, expireInSeconds?: number): Promise<void> {
    if (!this.client) {
      throw new Error('Redis client not initialized');
    }

    if (expireInSeconds) {
      await this.client.setEx(key, expireInSeconds, value);
    } else {
      await this.client.set(key, value);
    }
  }

  static async get(key: string): Promise<string | null> {
    if (!this.client) {
      throw new Error('Redis client not initialized');
    }
    return this.client.get(key);
  }

  static async del(key: string): Promise<number> {
    if (!this.client) {
      throw new Error('Redis client not initialized');
    }
    return this.client.del(key);
  }

  static async exists(key: string): Promise<number> {
    if (!this.client) {
      throw new Error('Redis client not initialized');
    }
    return this.client.exists(key);
  }

  static async incr(key: string): Promise<number> {
    if (!this.client) {
      throw new Error('Redis client not initialized');
    }
    return this.client.incr(key);
  }

  static async expire(key: string, seconds: number): Promise<boolean> {
    if (!this.client) {
      throw new Error('Redis client not initialized');
    }
    return this.client.expire(key, seconds);
  }

  static async close(): Promise<void> {
    if (this.client) {
      await this.client.quit();
      logger.info('Redis connection closed');
    }
  }
}