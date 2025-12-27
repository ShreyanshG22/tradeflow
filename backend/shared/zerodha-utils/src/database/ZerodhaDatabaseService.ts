import { DatabaseConfig } from './BaseRepository';
import { ZerodhaOrderRepository } from './ZerodhaOrderRepository';
import { ZerodhaPositionRepository } from './ZerodhaPositionRepository';
import { ZerodhaInstrumentRepository } from './ZerodhaInstrumentRepository';
import { createLogger } from '../logger';

const logger = createLogger('ZerodhaDatabaseService');

export interface ZerodhaDatabaseConfig extends DatabaseConfig {
  enableConnectionPooling?: boolean;
  enableQueryLogging?: boolean;
}

export class ZerodhaDatabaseService {
  public orders: ZerodhaOrderRepository;
  public positions: ZerodhaPositionRepository;
  public instruments: ZerodhaInstrumentRepository;

  private config: ZerodhaDatabaseConfig;

  constructor(config: ZerodhaDatabaseConfig) {
    this.config = config;
    
    // Initialize repositories
    this.orders = new ZerodhaOrderRepository(config);
    this.positions = new ZerodhaPositionRepository(config);
    this.instruments = new ZerodhaInstrumentRepository(config);

    logger.info('Zerodha Database Service initialized', {
      connectionString: this.maskConnectionString(config.connectionString),
      maxConnections: config.max || 20,
      enableConnectionPooling: config.enableConnectionPooling !== false,
      enableQueryLogging: config.enableQueryLogging === true
    });
  }

  /**
   * Initialize all database components
   */
  public async initialize(): Promise<void> {
    try {
      // Test database connectivity
      await this.healthCheck();
      
      logger.info('Zerodha Database Service initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize Zerodha Database Service', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Perform comprehensive health check on all repositories
   */
  public async healthCheck(): Promise<{
    status: 'healthy' | 'unhealthy';
    repositories: {
      orders: { status: string; latency?: number };
      positions: { status: string; latency?: number };
      instruments: { status: string; latency?: number };
    };
    overall_latency?: number;
  }> {
    const start = Date.now();
    
    try {
      const [ordersHealth, positionsHealth, instrumentsHealth] = await Promise.all([
        this.orders.healthCheck(),
        this.positions.healthCheck(),
        this.instruments.healthCheck()
      ]);

      const overallLatency = Date.now() - start;
      
      const allHealthy = [ordersHealth, positionsHealth, instrumentsHealth]
        .every(health => health.status === 'healthy');

      const result = {
        status: allHealthy ? 'healthy' as const : 'unhealthy' as const,
        repositories: {
          orders: ordersHealth,
          positions: positionsHealth,
          instruments: instrumentsHealth
        },
        overall_latency: overallLatency
      };

      if (allHealthy) {
        logger.debug('Database health check passed', result);
      } else {
        logger.warn('Database health check failed', result);
      }

      return result;
    } catch (error) {
      logger.error('Database health check error', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      return {
        status: 'unhealthy',
        repositories: {
          orders: { status: 'unhealthy' },
          positions: { status: 'unhealthy' },
          instruments: { status: 'unhealthy' }
        }
      };
    }
  }

  /**
   * Get database statistics
   */
  public async getStatistics(): Promise<{
    orders: {
      total: number;
      pending: number;
      completed: number;
      cancelled: number;
      rejected: number;
    };
    positions: {
      total_positions: number;
      total_value: number;
      total_pnl: number;
      profitable_positions: number;
      losing_positions: number;
    };
    instruments: {
      total: number;
      by_exchange: Record<string, number>;
      by_type: Record<string, number>;
    };
  }> {
    try {
      // Get sample user ID for position stats (in real implementation, this would be parameterized)
      const sampleUserId = 'sample-user-id';
      
      const [orderStats, positionStats, instrumentStats] = await Promise.all([
        this.orders.getOrderStats(sampleUserId),
        this.positions.getPositionSummary(sampleUserId),
        this.instruments.getInstrumentStats()
      ]);

      return {
        orders: orderStats,
        positions: positionStats,
        instruments: instrumentStats
      };
    } catch (error) {
      logger.error('Failed to get database statistics', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      return {
        orders: { total: 0, pending: 0, completed: 0, cancelled: 0, rejected: 0 },
        positions: { 
          total_positions: 0, 
          total_value: 0, 
          total_pnl: 0, 
          profitable_positions: 0, 
          losing_positions: 0 
        },
        instruments: { total: 0, by_exchange: {}, by_type: {} }
      };
    }
  }

  /**
   * Perform database maintenance tasks
   */
  public async performMaintenance(): Promise<{
    ordersDeleted: number;
    positionsDeleted: number;
    success: boolean;
  }> {
    try {
      logger.info('Starting database maintenance');

      const [ordersDeleted, positionsDeleted] = await Promise.all([
        this.orders.deleteOldOrders(90), // Delete orders older than 90 days
        this.positions.deleteOldPositions(365) // Delete positions older than 1 year
      ]);

      logger.info('Database maintenance completed', {
        ordersDeleted,
        positionsDeleted
      });

      return {
        ordersDeleted,
        positionsDeleted,
        success: true
      };
    } catch (error) {
      logger.error('Database maintenance failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      return {
        ordersDeleted: 0,
        positionsDeleted: 0,
        success: false
      };
    }
  }

  /**
   * Close all database connections
   */
  public async close(): Promise<void> {
    try {
      await Promise.all([
        this.orders.close(),
        this.positions.close(),
        this.instruments.close()
      ]);
      
      logger.info('All database connections closed');
    } catch (error) {
      logger.error('Failed to close database connections', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Mask sensitive information in connection string for logging
   */
  private maskConnectionString(connectionString: string): string {
    try {
      const url = new URL(connectionString);
      if (url.password) {
        url.password = '***';
      }
      return url.toString();
    } catch {
      return 'invalid-connection-string';
    }
  }

  /**
   * Create database service instance from environment variables
   */
  public static fromEnvironment(): ZerodhaDatabaseService {
    const config: ZerodhaDatabaseConfig = {
      connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/tradeflow',
      max: parseInt(process.env.DB_POOL_MAX || '20', 10),
      idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT || '30000', 10),
      connectionTimeoutMillis: parseInt(process.env.DB_CONNECTION_TIMEOUT || '2000', 10),
      enableConnectionPooling: process.env.DB_ENABLE_POOLING !== 'false',
      enableQueryLogging: process.env.DB_ENABLE_QUERY_LOGGING === 'true'
    };

    return new ZerodhaDatabaseService(config);
  }
}