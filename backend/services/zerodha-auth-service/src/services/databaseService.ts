import { Pool, PoolClient } from 'pg';
import { ZerodhaSession } from '@tradeflow/types';
import { createLogger } from '@tradeflow/zerodha-utils';

const logger = createLogger('DatabaseService');

export interface UserTokenRecord {
  id: string;
  user_id: string;
  zerodha_user_id: string;
  access_token: string;
  public_token: string;
  refresh_token?: string;
  login_time: string;
  expires_at: string;
  api_key: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export class DatabaseService {
  private pool: Pool;

  constructor(databaseUrl: string) {
    this.pool = new Pool({
      connectionString: databaseUrl,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });

    this.setupEventHandlers();
  }

  /**
   * Setup database event handlers
   */
  private setupEventHandlers(): void {
    this.pool.on('connect', (client) => {
      logger.debug('Database client connected');
    });

    this.pool.on('error', (error, client) => {
      logger.error('Database pool error', { error: error.message });
    });

    this.pool.on('remove', (client) => {
      logger.debug('Database client removed from pool');
    });
  }

  /**
   * Initialize database tables
   */
  public async initialize(): Promise<void> {
    try {
      await this.createTables();
      logger.info('Database initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize database', { 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      throw error;
    }
  }

  /**
   * Create necessary tables
   */
  private async createTables(): Promise<void> {
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');

      // Create zerodha_user_tokens table
      await client.query(`
        CREATE TABLE IF NOT EXISTS zerodha_user_tokens (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID NOT NULL,
          zerodha_user_id VARCHAR(50) NOT NULL,
          access_token TEXT NOT NULL,
          public_token TEXT NOT NULL,
          refresh_token TEXT,
          login_time TIMESTAMP NOT NULL,
          expires_at TIMESTAMP NOT NULL,
          api_key VARCHAR(100) NOT NULL,
          is_active BOOLEAN DEFAULT true,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW(),
          UNIQUE(user_id, zerodha_user_id)
        )
      `);

      // Create index for faster lookups
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_zerodha_user_tokens_user_id 
        ON zerodha_user_tokens(user_id) 
        WHERE is_active = true
      `);

      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_zerodha_user_tokens_zerodha_user_id 
        ON zerodha_user_tokens(zerodha_user_id) 
        WHERE is_active = true
      `);

      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_zerodha_user_tokens_expires_at 
        ON zerodha_user_tokens(expires_at) 
        WHERE is_active = true
      `);

      await client.query('COMMIT');
      
      logger.info('Database tables created successfully');
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Failed to create database tables', { 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Store user tokens in database
   */
  public async storeUserTokens(
    userId: string,
    zerodhaUserId: string,
    session: ZerodhaSession
  ): Promise<void> {
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');

      // Deactivate existing tokens for this user
      await client.query(
        `UPDATE zerodha_user_tokens 
         SET is_active = false, updated_at = NOW() 
         WHERE user_id = $1`,
        [userId]
      );

      // Insert new token record
      await client.query(
        `INSERT INTO zerodha_user_tokens (
          user_id, zerodha_user_id, access_token, public_token, 
          refresh_token, login_time, expires_at, api_key
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          userId,
          zerodhaUserId,
          session.access_token,
          session.public_token,
          session.refresh_token,
          session.login_time,
          session.expires_at,
          session.api_key
        ]
      );

      await client.query('COMMIT');
      
      logger.info('User tokens stored in database', { 
        userId, 
        zerodhaUserId 
      });
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Failed to store user tokens in database', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        userId,
        zerodhaUserId
      });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get user tokens from database
   */
  public async getUserTokens(userId: string): Promise<ZerodhaSession | null> {
    const client = await this.pool.connect();
    
    try {
      const result = await client.query(
        `SELECT * FROM zerodha_user_tokens 
         WHERE user_id = $1 AND is_active = true 
         ORDER BY created_at DESC 
         LIMIT 1`,
        [userId]
      );

      if (result.rows.length === 0) {
        logger.debug('No active tokens found for user', { userId });
        return null;
      }

      const record = result.rows[0] as UserTokenRecord;
      
      const session: ZerodhaSession = {
        user_id: record.zerodha_user_id,
        access_token: record.access_token,
        public_token: record.public_token,
        refresh_token: record.refresh_token,
        login_time: record.login_time,
        expires_at: record.expires_at,
        api_key: record.api_key
      };

      logger.debug('User tokens retrieved from database', { 
        userId, 
        zerodhaUserId: record.zerodha_user_id 
      });

      return session;
    } catch (error) {
      logger.error('Failed to get user tokens from database', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        userId
      });
      return null;
    } finally {
      client.release();
    }
  }

  /**
   * Expire user tokens (mark as inactive)
   */
  public async expireUserTokens(userId: string): Promise<void> {
    const client = await this.pool.connect();
    
    try {
      const result = await client.query(
        `UPDATE zerodha_user_tokens 
         SET is_active = false, updated_at = NOW() 
         WHERE user_id = $1 AND is_active = true`,
        [userId]
      );

      logger.info('User tokens expired in database', { 
        userId, 
        affectedRows: result.rowCount 
      });
    } catch (error) {
      logger.error('Failed to expire user tokens in database', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        userId
      });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get user by Zerodha user ID
   */
  public async getUserByZerodhaId(zerodhaUserId: string): Promise<UserTokenRecord | null> {
    const client = await this.pool.connect();
    
    try {
      const result = await client.query(
        `SELECT * FROM zerodha_user_tokens 
         WHERE zerodha_user_id = $1 AND is_active = true 
         ORDER BY created_at DESC 
         LIMIT 1`,
        [zerodhaUserId]
      );

      if (result.rows.length === 0) {
        return null;
      }

      return result.rows[0] as UserTokenRecord;
    } catch (error) {
      logger.error('Failed to get user by Zerodha ID from database', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        zerodhaUserId
      });
      return null;
    } finally {
      client.release();
    }
  }

  /**
   * Clean up expired tokens
   */
  public async cleanupExpiredTokens(): Promise<number> {
    const client = await this.pool.connect();
    
    try {
      const result = await client.query(
        `UPDATE zerodha_user_tokens 
         SET is_active = false, updated_at = NOW() 
         WHERE expires_at < NOW() AND is_active = true`
      );

      const expiredCount = result.rowCount || 0;
      
      if (expiredCount > 0) {
        logger.info('Expired tokens cleaned up', { expiredCount });
      }

      return expiredCount;
    } catch (error) {
      logger.error('Failed to cleanup expired tokens', { 
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return 0;
    } finally {
      client.release();
    }
  }

  /**
   * Get token statistics
   */
  public async getTokenStats(): Promise<{
    total: number;
    active: number;
    expired: number;
  }> {
    const client = await this.pool.connect();
    
    try {
      const result = await client.query(`
        SELECT 
          COUNT(*) as total,
          COUNT(CASE WHEN is_active = true THEN 1 END) as active,
          COUNT(CASE WHEN expires_at < NOW() AND is_active = true THEN 1 END) as expired
        FROM zerodha_user_tokens
      `);

      const stats = result.rows[0];
      
      return {
        total: parseInt(stats.total, 10),
        active: parseInt(stats.active, 10),
        expired: parseInt(stats.expired, 10)
      };
    } catch (error) {
      logger.error('Failed to get token statistics', { 
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return { total: 0, active: 0, expired: 0 };
    } finally {
      client.release();
    }
  }

  /**
   * Health check
   */
  public async healthCheck(): Promise<{ status: string; latency?: number }> {
    try {
      const start = Date.now();
      const client = await this.pool.connect();
      
      try {
        await client.query('SELECT 1');
        const latency = Date.now() - start;
        
        return {
          status: 'healthy',
          latency
        };
      } finally {
        client.release();
      }
    } catch (error) {
      logger.error('Database health check failed', { 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      
      return {
        status: 'unhealthy'
      };
    }
  }

  /**
   * Close database connection pool
   */
  public async close(): Promise<void> {
    try {
      await this.pool.end();
      logger.info('Database connection pool closed');
    } catch (error) {
      logger.error('Failed to close database connection pool', { 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
    }
  }
}