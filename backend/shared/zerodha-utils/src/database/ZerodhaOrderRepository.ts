import { BaseRepository, DatabaseConfig } from './BaseRepository';
import { createLogger } from '../logger';

const logger = createLogger('ZerodhaOrderRepository');

export interface ZerodhaOrder {
  id: string;
  user_id: string;
  order_id: string;
  parent_order_id?: string;
  exchange: string;
  tradingsymbol: string;
  instrument_token?: number;
  transaction_type: 'BUY' | 'SELL';
  quantity: number;
  product: 'CNC' | 'MIS' | 'NRML';
  order_type: 'MARKET' | 'LIMIT' | 'SL' | 'SL-M';
  price?: number;
  trigger_price?: number;
  disclosed_quantity?: number;
  validity?: 'DAY' | 'IOC';
  validity_ttl?: number;
  iceberg_legs?: number;
  iceberg_quantity?: number;
  status: string;
  status_message?: string;
  filled_quantity?: number;
  pending_quantity?: number;
  cancelled_quantity?: number;
  average_price?: number;
  order_timestamp: string;
  exchange_timestamp?: string;
  exchange_order_id?: string;
  rejection_reason?: string;
  placed_by?: string;
  variety?: string;
  tag?: string;
  guid?: string;
  created_at: string;
  updated_at: string;
}

export interface CreateZerodhaOrderData {
  user_id: string;
  order_id: string;
  parent_order_id?: string;
  exchange: string;
  tradingsymbol: string;
  instrument_token?: number;
  transaction_type: 'BUY' | 'SELL';
  quantity: number;
  product: 'CNC' | 'MIS' | 'NRML';
  order_type: 'MARKET' | 'LIMIT' | 'SL' | 'SL-M';
  price?: number;
  trigger_price?: number;
  disclosed_quantity?: number;
  validity?: 'DAY' | 'IOC';
  validity_ttl?: number;
  iceberg_legs?: number;
  iceberg_quantity?: number;
  status: string;
  status_message?: string;
  filled_quantity?: number;
  pending_quantity?: number;
  cancelled_quantity?: number;
  average_price?: number;
  order_timestamp: string;
  exchange_timestamp?: string;
  exchange_order_id?: string;
  rejection_reason?: string;
  placed_by?: string;
  variety?: string;
  tag?: string;
  guid?: string;
}

export interface UpdateZerodhaOrderData {
  status?: string;
  status_message?: string;
  filled_quantity?: number;
  pending_quantity?: number;
  cancelled_quantity?: number;
  average_price?: number;
  exchange_timestamp?: string;
  exchange_order_id?: string;
  rejection_reason?: string;
}

export interface OrderFilters {
  user_id?: string;
  exchange?: string;
  tradingsymbol?: string;
  status?: string;
  transaction_type?: 'BUY' | 'SELL';
  product?: 'CNC' | 'MIS' | 'NRML';
  order_type?: 'MARKET' | 'LIMIT' | 'SL' | 'SL-M';
  date_from?: string;
  date_to?: string;
}

export class ZerodhaOrderRepository extends BaseRepository {
  constructor(config: DatabaseConfig) {
    super(config, 'zerodha.orders');
  }

  /**
   * Create a new order
   */
  public async createOrder(data: CreateZerodhaOrderData): Promise<ZerodhaOrder> {
    try {
      const order = await this.insert<ZerodhaOrder>(data);
      logger.info('Order created', { 
        orderId: order.order_id, 
        userId: order.user_id,
        symbol: order.tradingsymbol
      });
      return order;
    } catch (error) {
      logger.error('Failed to create order', {
        error: error instanceof Error ? error.message : 'Unknown error',
        orderId: data.order_id,
        userId: data.user_id
      });
      throw error;
    }
  }

  /**
   * Get order by order ID
   */
  public async getOrderById(orderId: string): Promise<ZerodhaOrder | null> {
    try {
      const orders = await this.findBy<ZerodhaOrder>({ order_id: orderId });
      return orders.length > 0 ? orders[0] : null;
    } catch (error) {
      logger.error('Failed to get order by ID', {
        error: error instanceof Error ? error.message : 'Unknown error',
        orderId
      });
      return null;
    }
  }

  /**
   * Get orders by user ID
   */
  public async getOrdersByUserId(
    userId: string,
    limit: number = 100,
    offset: number = 0
  ): Promise<ZerodhaOrder[]> {
    try {
      return await this.findBy<ZerodhaOrder>(
        { user_id: userId },
        'order_timestamp DESC',
        limit,
        offset
      );
    } catch (error) {
      logger.error('Failed to get orders by user ID', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId
      });
      return [];
    }
  }

  /**
   * Get orders with filters
   */
  public async getOrdersWithFilters(
    filters: OrderFilters,
    limit: number = 100,
    offset: number = 0
  ): Promise<ZerodhaOrder[]> {
    try {
      const whereConditions: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;

      // Build WHERE clause dynamically
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined) {
          if (key === 'date_from') {
            whereConditions.push(`order_timestamp >= $${paramIndex}`);
            values.push(value);
            paramIndex++;
          } else if (key === 'date_to') {
            whereConditions.push(`order_timestamp <= $${paramIndex}`);
            values.push(value);
            paramIndex++;
          } else {
            whereConditions.push(`${key} = $${paramIndex}`);
            values.push(value);
            paramIndex++;
          }
        }
      });

      let query = `SELECT * FROM ${this.tableName}`;
      if (whereConditions.length > 0) {
        query += ` WHERE ${whereConditions.join(' AND ')}`;
      }
      query += ` ORDER BY order_timestamp DESC LIMIT ${limit} OFFSET ${offset}`;

      const result = await this.query<ZerodhaOrder>(query, values);
      return result.rows;
    } catch (error) {
      logger.error('Failed to get orders with filters', {
        error: error instanceof Error ? error.message : 'Unknown error',
        filters
      });
      return [];
    }
  }

  /**
   * Update order
   */
  public async updateOrder(
    orderId: string,
    data: UpdateZerodhaOrderData
  ): Promise<ZerodhaOrder | null> {
    try {
      const order = await this.getOrderById(orderId);
      if (!order) {
        logger.warn('Order not found for update', { orderId });
        return null;
      }

      const result = await this.query<ZerodhaOrder>(
        `UPDATE ${this.tableName} 
         SET ${Object.keys(data).map((key, index) => `${key} = $${index + 2}`).join(', ')}, 
             updated_at = NOW() 
         WHERE order_id = $1 
         RETURNING *`,
        [orderId, ...Object.values(data)]
      );

      if (result.rows.length > 0) {
        logger.info('Order updated', { 
          orderId, 
          updatedFields: Object.keys(data) 
        });
        return result.rows[0];
      }

      return null;
    } catch (error) {
      logger.error('Failed to update order', {
        error: error instanceof Error ? error.message : 'Unknown error',
        orderId
      });
      throw error;
    }
  }

  /**
   * Get pending orders for user
   */
  public async getPendingOrders(userId: string): Promise<ZerodhaOrder[]> {
    try {
      return await this.findBy<ZerodhaOrder>(
        { 
          user_id: userId, 
          status: 'OPEN' 
        },
        'order_timestamp DESC'
      );
    } catch (error) {
      logger.error('Failed to get pending orders', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId
      });
      return [];
    }
  }

  /**
   * Get order history for a symbol
   */
  public async getOrderHistoryBySymbol(
    userId: string,
    tradingsymbol: string,
    exchange: string,
    limit: number = 50
  ): Promise<ZerodhaOrder[]> {
    try {
      return await this.findBy<ZerodhaOrder>(
        { 
          user_id: userId, 
          tradingsymbol, 
          exchange 
        },
        'order_timestamp DESC',
        limit
      );
    } catch (error) {
      logger.error('Failed to get order history by symbol', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId,
        tradingsymbol,
        exchange
      });
      return [];
    }
  }

  /**
   * Get order statistics for user
   */
  public async getOrderStats(userId: string): Promise<{
    total: number;
    pending: number;
    completed: number;
    cancelled: number;
    rejected: number;
  }> {
    try {
      const result = await this.query<{
        total: string;
        pending: string;
        completed: string;
        cancelled: string;
        rejected: string;
      }>(
        `SELECT 
          COUNT(*) as total,
          COUNT(CASE WHEN status IN ('OPEN', 'TRIGGER PENDING') THEN 1 END) as pending,
          COUNT(CASE WHEN status = 'COMPLETE' THEN 1 END) as completed,
          COUNT(CASE WHEN status = 'CANCELLED' THEN 1 END) as cancelled,
          COUNT(CASE WHEN status = 'REJECTED' THEN 1 END) as rejected
         FROM ${this.tableName} 
         WHERE user_id = $1`,
        [userId]
      );

      const stats = result.rows[0];
      return {
        total: parseInt(stats.total, 10),
        pending: parseInt(stats.pending, 10),
        completed: parseInt(stats.completed, 10),
        cancelled: parseInt(stats.cancelled, 10),
        rejected: parseInt(stats.rejected, 10)
      };
    } catch (error) {
      logger.error('Failed to get order statistics', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId
      });
      return { total: 0, pending: 0, completed: 0, cancelled: 0, rejected: 0 };
    }
  }

  /**
   * Delete old orders (cleanup)
   */
  public async deleteOldOrders(daysOld: number = 90): Promise<number> {
    try {
      const result = await this.query(
        `DELETE FROM ${this.tableName} 
         WHERE order_timestamp < NOW() - INTERVAL '${daysOld} days'`
      );

      const deletedCount = result.rowCount;
      
      if (deletedCount > 0) {
        logger.info('Old orders deleted', { deletedCount, daysOld });
      }

      return deletedCount;
    } catch (error) {
      logger.error('Failed to delete old orders', {
        error: error instanceof Error ? error.message : 'Unknown error',
        daysOld
      });
      return 0;
    }
  }
}