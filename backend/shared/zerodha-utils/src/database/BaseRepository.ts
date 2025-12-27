import { Pool, PoolClient } from 'pg';
import { createLogger } from '../logger';

const logger = createLogger('BaseRepository');

export interface DatabaseConfig {
  connectionString: string;
  max?: number;
  idleTimeoutMillis?: number;
  connectionTimeoutMillis?: number;
}

export interface QueryResult<T = any> {
  rows: T[];
  rowCount: number;
}

export interface TransactionCallback<T> {
  (client: PoolClient): Promise<T>;
}

export abstract class BaseRepository {
  protected pool: Pool;
  protected tableName: string;

  constructor(config: DatabaseConfig, tableName: string) {
    this.tableName = tableName;
    this.pool = new Pool({
      connectionString: config.connectionString,
      max: config.max || 20,
      idleTimeoutMillis: config.idleTimeoutMillis || 30000,
      connectionTimeoutMillis: config.connectionTimeoutMillis || 2000,
    });

    this.setupEventHandlers();
  }

  /**
   * Setup database event handlers
   */
  private setupEventHandlers(): void {
    this.pool.on('connect', () => {
      logger.debug('Database client connected', { tableName: this.tableName });
    });

    this.pool.on('error', (error) => {
      logger.error('Database pool error', { 
        error: error.message, 
        tableName: this.tableName 
      });
    });

    this.pool.on('remove', () => {
      logger.debug('Database client removed from pool', { tableName: this.tableName });
    });
  }

  /**
   * Execute a query with parameters
   */
  protected async query<T = any>(
    text: string, 
    params?: any[]
  ): Promise<QueryResult<T>> {
    const client = await this.pool.connect();
    
    try {
      const start = Date.now();
      const result = await client.query(text, params);
      const duration = Date.now() - start;
      
      logger.debug('Query executed', {
        tableName: this.tableName,
        duration,
        rowCount: result.rowCount
      });
      
      return {
        rows: result.rows,
        rowCount: result.rowCount || 0
      };
    } catch (error) {
      logger.error('Query execution failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        tableName: this.tableName,
        query: text,
        params
      });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Execute multiple queries in a transaction
   */
  protected async transaction<T>(
    callback: TransactionCallback<T>
  ): Promise<T> {
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      
      logger.debug('Transaction completed successfully', { 
        tableName: this.tableName 
      });
      
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Transaction failed and rolled back', {
        error: error instanceof Error ? error.message : 'Unknown error',
        tableName: this.tableName
      });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Find record by ID
   */
  protected async findById<T>(id: string): Promise<T | null> {
    const result = await this.query<T>(
      `SELECT * FROM ${this.tableName} WHERE id = $1`,
      [id]
    );
    
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Find records by criteria
   */
  protected async findBy<T>(
    criteria: Record<string, any>,
    orderBy?: string,
    limit?: number,
    offset?: number
  ): Promise<T[]> {
    const whereClause = Object.keys(criteria)
      .map((key, index) => `${key} = $${index + 1}`)
      .join(' AND ');
    
    const values = Object.values(criteria);
    
    let query = `SELECT * FROM ${this.tableName}`;
    if (whereClause) {
      query += ` WHERE ${whereClause}`;
    }
    if (orderBy) {
      query += ` ORDER BY ${orderBy}`;
    }
    if (limit) {
      query += ` LIMIT ${limit}`;
    }
    if (offset) {
      query += ` OFFSET ${offset}`;
    }
    
    const result = await this.query<T>(query, values);
    return result.rows;
  }

  /**
   * Insert a new record
   */
  protected async insert<T>(
    data: Omit<T, 'id' | 'created_at' | 'updated_at'>
  ): Promise<T> {
    const keys = Object.keys(data);
    const values = Object.values(data);
    const placeholders = keys.map((_, index) => `$${index + 1}`).join(', ');
    const columns = keys.join(', ');
    
    const query = `
      INSERT INTO ${this.tableName} (${columns}) 
      VALUES (${placeholders}) 
      RETURNING *
    `;
    
    const result = await this.query<T>(query, values);
    
    if (result.rows.length === 0) {
      throw new Error(`Failed to insert record into ${this.tableName}`);
    }
    
    logger.debug('Record inserted', { 
      tableName: this.tableName, 
      id: (result.rows[0] as any).id 
    });
    
    return result.rows[0];
  }

  /**
   * Update a record by ID
   */
  protected async updateById<T>(
    id: string,
    data: Partial<Omit<T, 'id' | 'created_at' | 'updated_at'>>
  ): Promise<T | null> {
    const keys = Object.keys(data);
    const values = Object.values(data);
    
    if (keys.length === 0) {
      throw new Error('No data provided for update');
    }
    
    const setClause = keys
      .map((key, index) => `${key} = $${index + 2}`)
      .join(', ');
    
    const query = `
      UPDATE ${this.tableName} 
      SET ${setClause}, updated_at = NOW() 
      WHERE id = $1 
      RETURNING *
    `;
    
    const result = await this.query<T>(query, [id, ...values]);
    
    if (result.rows.length > 0) {
      logger.debug('Record updated', { 
        tableName: this.tableName, 
        id 
      });
      return result.rows[0];
    }
    
    return null;
  }

  /**
   * Delete a record by ID
   */
  protected async deleteById(id: string): Promise<boolean> {
    const result = await this.query(
      `DELETE FROM ${this.tableName} WHERE id = $1`,
      [id]
    );
    
    const deleted = result.rowCount > 0;
    
    if (deleted) {
      logger.debug('Record deleted', { 
        tableName: this.tableName, 
        id 
      });
    }
    
    return deleted;
  }

  /**
   * Count records by criteria
   */
  protected async count(criteria?: Record<string, any>): Promise<number> {
    let query = `SELECT COUNT(*) as count FROM ${this.tableName}`;
    let values: any[] = [];
    
    if (criteria && Object.keys(criteria).length > 0) {
      const whereClause = Object.keys(criteria)
        .map((key, index) => `${key} = $${index + 1}`)
        .join(' AND ');
      
      query += ` WHERE ${whereClause}`;
      values = Object.values(criteria);
    }
    
    const result = await this.query<{ count: string }>(query, values);
    return parseInt(result.rows[0].count, 10);
  }

  /**
   * Check if record exists
   */
  protected async exists(criteria: Record<string, any>): Promise<boolean> {
    const count = await this.count(criteria);
    return count > 0;
  }

  /**
   * Upsert (insert or update) a record
   */
  protected async upsert<T>(
    data: Omit<T, 'created_at' | 'updated_at'>,
    conflictColumns: string[]
  ): Promise<T> {
    const keys = Object.keys(data);
    const values = Object.values(data);
    const placeholders = keys.map((_, index) => `$${index + 1}`).join(', ');
    const columns = keys.join(', ');
    
    const updateClause = keys
      .filter(key => !conflictColumns.includes(key))
      .map(key => `${key} = EXCLUDED.${key}`)
      .join(', ');
    
    const conflictClause = conflictColumns.join(', ');
    
    const query = `
      INSERT INTO ${this.tableName} (${columns}) 
      VALUES (${placeholders}) 
      ON CONFLICT (${conflictClause}) 
      DO UPDATE SET ${updateClause}, updated_at = NOW()
      RETURNING *
    `;
    
    const result = await this.query<T>(query, values);
    
    if (result.rows.length === 0) {
      throw new Error(`Failed to upsert record into ${this.tableName}`);
    }
    
    logger.debug('Record upserted', { 
      tableName: this.tableName, 
      id: (result.rows[0] as any).id 
    });
    
    return result.rows[0];
  }

  /**
   * Health check
   */
  public async healthCheck(): Promise<{ status: string; latency?: number }> {
    try {
      const start = Date.now();
      await this.query('SELECT 1');
      const latency = Date.now() - start;
      
      return {
        status: 'healthy',
        latency
      };
    } catch (error) {
      logger.error('Database health check failed', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        tableName: this.tableName
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
      logger.info('Database connection pool closed', { 
        tableName: this.tableName 
      });
    } catch (error) {
      logger.error('Failed to close database connection pool', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        tableName: this.tableName
      });
    }
  }
}