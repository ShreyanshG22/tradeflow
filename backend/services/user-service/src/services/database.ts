import { Pool, PoolClient } from 'pg';
import { config } from '../config/config';
import { logger } from '../utils/logger';

export class DatabaseService {
  private static pool: Pool;

  static async initialize(): Promise<void> {
    this.pool = new Pool({
      host: config.database.host,
      port: config.database.port,
      database: config.database.name,
      user: config.database.user,
      password: config.database.password,
      ssl: config.database.ssl,
      max: config.database.maxConnections,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });

    // Test connection
    try {
      const client = await this.pool.connect();
      await client.query('SELECT NOW()');
      client.release();
      logger.info('Database connection pool initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize database connection pool', error);
      throw error;
    }
  }

  static async getClient(): Promise<PoolClient> {
    if (!this.pool) {
      throw new Error('Database pool not initialized');
    }
    return this.pool.connect();
  }

  static async query(text: string, params?: any[]): Promise<any> {
    if (!this.pool) {
      throw new Error('Database pool not initialized');
    }
    
    const start = Date.now();
    try {
      const result = await this.pool.query(text, params);
      const duration = Date.now() - start;
      
      logger.debug('Database query executed', {
        query: text,
        duration,
        rowCount: result.rowCount
      });
      
      return result;
    } catch (error) {
      logger.error('Database query failed', {
        query: text,
        params,
        error: (error as Error).message
      });
      throw error;
    }
  }

  static async close(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      logger.info('Database connection pool closed');
    }
  }
}