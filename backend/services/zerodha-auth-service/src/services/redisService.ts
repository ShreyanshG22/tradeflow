import { createClient, RedisClientType } from 'redis';
import { ZerodhaSession } from '@tradeflow/types';
import { createLogger } from '@tradeflow/zerodha-utils';

const logger = createLogger('RedisService');

export class RedisService {
  private client: RedisClientType;
  private isConnected: boolean = false;

  constructor(redisUrl: string) {
    this.client = createClient({
      url: redisUrl,
      socket: {
        reconnectStrategy: (retries) => {
          if (retries > 10) {
            logger.error('Redis reconnection failed after 10 attempts');
            return new Error('Redis connection failed');
          }
          return Math.min(retries * 100, 3000);
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
      logger.info('Redis client connected');
    });

    this.client.on('ready', () => {
      logger.info('Redis client ready');
      this.isConnected = true;
    });

    this.client.on('error', (error) => {
      logger.error('Redis client error', { error: error.message });
      this.isConnected = false;
    });

    this.client.on('end', () => {
      logger.info('Redis client disconnected');
      this.isConnected = false;
    });

    this.client.on('reconnecting', () => {
      logger.info('Redis client reconnecting');
    });
  }

  /**
   * Connect to Redis
   */
  public async connect(): Promise<void> {
    try {
      if (!this.isConnected) {
        await this.client.connect();
        logger.info('Redis connection established');
      }
    } catch (error) {
      logger.error('Failed to connect to Redis', { 
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
        logger.info('Redis connection closed');
      }
    } catch (error) {
      logger.error('Failed to disconnect from Redis', { 
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

  /**
   * Store user session in Redis
   */
  public async setSession(userId: string, session: ZerodhaSession, ttlSeconds: number): Promise<void> {
    try {
      const key = this.getSessionKey(userId);
      const value = JSON.stringify(session);
      
      await this.client.setEx(key, ttlSeconds, value);
      
      logger.debug('Session stored in Redis', { 
        userId, 
        ttl: ttlSeconds,
        key 
      });
    } catch (error) {
      logger.error('Failed to store session in Redis', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        userId 
      });
      throw error;
    }
  }

  /**
   * Get user session from Redis
   */
  public async getSession(userId: string): Promise<ZerodhaSession | null> {
    try {
      const key = this.getSessionKey(userId);
      const value = await this.client.get(key);
      
      if (!value) {
        logger.debug('Session not found in Redis', { userId, key });
        return null;
      }

      const session = JSON.parse(value) as ZerodhaSession;
      
      logger.debug('Session retrieved from Redis', { 
        userId, 
        key,
        expiresAt: session.expires_at 
      });
      
      return session;
    } catch (error) {
      logger.error('Failed to get session from Redis', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        userId 
      });
      return null;
    }
  }

  /**
   * Delete user session from Redis
   */
  public async deleteSession(userId: string): Promise<void> {
    try {
      const key = this.getSessionKey(userId);
      const result = await this.client.del(key);
      
      logger.debug('Session deleted from Redis', { 
        userId, 
        key,
        deleted: result > 0 
      });
    } catch (error) {
      logger.error('Failed to delete session from Redis', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        userId 
      });
      throw error;
    }
  }

  /**
   * Check if session exists in Redis
   */
  public async sessionExists(userId: string): Promise<boolean> {
    try {
      const key = this.getSessionKey(userId);
      const exists = await this.client.exists(key);
      
      return exists === 1;
    } catch (error) {
      logger.error('Failed to check session existence in Redis', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        userId 
      });
      return false;
    }
  }

  /**
   * Get session TTL
   */
  public async getSessionTTL(userId: string): Promise<number> {
    try {
      const key = this.getSessionKey(userId);
      const ttl = await this.client.ttl(key);
      
      return ttl;
    } catch (error) {
      logger.error('Failed to get session TTL from Redis', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        userId 
      });
      return -1;
    }
  }

  /**
   * Extend session TTL
   */
  public async extendSession(userId: string, ttlSeconds: number): Promise<void> {
    try {
      const key = this.getSessionKey(userId);
      const result = await this.client.expire(key, ttlSeconds);
      
      if (!result) {
        logger.warn('Failed to extend session TTL - session may not exist', { 
          userId, 
          key 
        });
      } else {
        logger.debug('Session TTL extended', { 
          userId, 
          key,
          newTTL: ttlSeconds 
        });
      }
    } catch (error) {
      logger.error('Failed to extend session TTL in Redis', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        userId 
      });
      throw error;
    }
  }

  /**
   * Store rate limiting data
   */
  public async setRateLimit(userId: string, count: number, ttlSeconds: number): Promise<void> {
    try {
      const key = this.getRateLimitKey(userId);
      
      await this.client.setEx(key, ttlSeconds, count.toString());
      
      logger.debug('Rate limit stored in Redis', { 
        userId, 
        count,
        ttl: ttlSeconds 
      });
    } catch (error) {
      logger.error('Failed to store rate limit in Redis', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        userId 
      });
      throw error;
    }
  }

  /**
   * Get rate limiting data
   */
  public async getRateLimit(userId: string): Promise<number> {
    try {
      const key = this.getRateLimitKey(userId);
      const value = await this.client.get(key);
      
      return value ? parseInt(value, 10) : 0;
    } catch (error) {
      logger.error('Failed to get rate limit from Redis', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        userId 
      });
      return 0;
    }
  }

  /**
   * Increment rate limit counter
   */
  public async incrementRateLimit(userId: string, ttlSeconds: number): Promise<number> {
    try {
      const key = this.getRateLimitKey(userId);
      
      // Use multi to ensure atomicity
      const multi = this.client.multi();
      multi.incr(key);
      multi.expire(key, ttlSeconds);
      
      const results = await multi.exec();
      const count = results?.[0] as number || 0;
      
      logger.debug('Rate limit incremented', { 
        userId, 
        count,
        ttl: ttlSeconds 
      });
      
      return count;
    } catch (error) {
      logger.error('Failed to increment rate limit in Redis', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        userId 
      });
      throw error;
    }
  }

  /**
   * Store temporary data (like OAuth state)
   */
  public async setTemporary(key: string, value: string, ttlSeconds: number): Promise<void> {
    try {
      const fullKey = this.getTempKey(key);
      
      await this.client.setEx(fullKey, ttlSeconds, value);
      
      logger.debug('Temporary data stored in Redis', { 
        key: fullKey, 
        ttl: ttlSeconds 
      });
    } catch (error) {
      logger.error('Failed to store temporary data in Redis', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        key 
      });
      throw error;
    }
  }

  /**
   * Get temporary data
   */
  public async getTemporary(key: string): Promise<string | null> {
    try {
      const fullKey = this.getTempKey(key);
      const value = await this.client.get(fullKey);
      
      if (value) {
        // Delete after reading (one-time use)
        await this.client.del(fullKey);
      }
      
      return value;
    } catch (error) {
      logger.error('Failed to get temporary data from Redis', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        key 
      });
      return null;
    }
  }

  /**
   * Generate session key
   */
  private getSessionKey(userId: string): string {
    return `zerodha:session:${userId}`;
  }

  /**
   * Generate rate limit key
   */
  private getRateLimitKey(userId: string): string {
    return `zerodha:rate_limit:${userId}`;
  }

  /**
   * Generate temporary data key
   */
  private getTempKey(key: string): string {
    return `zerodha:temp:${key}`;
  }

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
      logger.error('Redis health check failed', { 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      
      return {
        status: 'unhealthy'
      };
    }
  }
}