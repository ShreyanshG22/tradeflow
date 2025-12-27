import { Pool, PoolClient } from 'pg';
import { ZerodhaOrder } from '@tradeflow/types';
import { OrderStatusUpdate } from './OrderStatusService';
import { logger } from '../utils/logger';

export class DatabaseService {
  private pool: Pool;

  constructor() {
    this.pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });

    this.pool.on('error', (err) => {
      logger.error('Database pool error:', err);
    });
  }

  /**
   * Create a new order record
   */
  async createOrder(orderData: Partial<ZerodhaOrder>): Promise<ZerodhaOrder> {
    const client = await this.pool.connect();
    
    try {
      const query = `
        INSERT INTO zerodha_orders (
          order_id, account_id, placed_by, exchange, tradingsymbol, 
          transaction_type, quantity, product, order_type, price, 
          trigger_price, validity, disclosed_quantity, status, 
          order_timestamp, filled_quantity, pending_quantity, 
          cancelled_quantity, average_price, tag, guid
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 
          $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21
        ) RETURNING *
      `;

      const values = [
        orderData.order_id,
        orderData.account_id,
        orderData.placed_by,
        orderData.exchange,
        orderData.tradingsymbol,
        orderData.transaction_type,
        orderData.quantity,
        orderData.product,
        orderData.order_type,
        orderData.price,
        orderData.trigger_price,
        orderData.validity,
        orderData.disclosed_quantity,
        orderData.status,
        orderData.order_timestamp,
        orderData.filled_quantity,
        orderData.pending_quantity,
        orderData.cancelled_quantity,
        orderData.average_price,
        orderData.tag,
        orderData.guid
      ];

      const result = await client.query(query, values);
      return result.rows[0];

    } catch (error) {
      logger.error('Error creating order:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get order by ID
   */
  async getOrderById(orderId: string): Promise<ZerodhaOrder | null> {
    const client = await this.pool.connect();
    
    try {
      const query = 'SELECT * FROM zerodha_orders WHERE order_id = $1';
      const result = await client.query(query, [orderId]);
      
      return result.rows.length > 0 ? result.rows[0] : null;

    } catch (error) {
      logger.error(`Error fetching order ${orderId}:`, error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Update order details
   */
  async updateOrder(orderId: string, updates: Partial<ZerodhaOrder>): Promise<ZerodhaOrder> {
    const client = await this.pool.connect();
    
    try {
      const setClause = Object.keys(updates)
        .map((key, index) => `${key} = $${index + 2}`)
        .join(', ');
      
      const query = `
        UPDATE zerodha_orders 
        SET ${setClause}, updated_at = NOW()
        WHERE order_id = $1 
        RETURNING *
      `;

      const values = [orderId, ...Object.values(updates)];
      const result = await client.query(query, values);

      if (result.rows.length === 0) {
        throw new Error(`Order ${orderId} not found`);
      }

      return result.rows[0];

    } catch (error) {
      logger.error(`Error updating order ${orderId}:`, error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get orders for a user
   */
  async getUserOrders(
    userId: string, 
    limit: number = 50, 
    offset: number = 0,
    status?: string
  ): Promise<ZerodhaOrder[]> {
    const client = await this.pool.connect();
    
    try {
      let query = `
        SELECT * FROM zerodha_orders 
        WHERE account_id = $1
      `;
      const values: any[] = [userId];

      if (status) {
        query += ` AND status = $${values.length + 1}`;
        values.push(status);
      }

      query += ` ORDER BY order_timestamp DESC LIMIT $${values.length + 1} OFFSET $${values.length + 2}`;
      values.push(limit, offset);

      const result = await client.query(query, values);
      return result.rows;

    } catch (error) {
      logger.error(`Error fetching orders for user ${userId}:`, error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get open orders for a user
   */
  async getOpenOrders(userId: string): Promise<ZerodhaOrder[]> {
    const client = await this.pool.connect();
    
    try {
      const query = `
        SELECT * FROM zerodha_orders 
        WHERE account_id = $1 AND status IN ('OPEN', 'TRIGGER_PENDING', 'MODIFY_PENDING')
        ORDER BY order_timestamp DESC
      `;

      const result = await client.query(query, [userId]);
      return result.rows;

    } catch (error) {
      logger.error(`Error fetching open orders for user ${userId}:`, error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get user by ID
   */
  async getUserById(userId: string): Promise<any | null> {
    const client = await this.pool.connect();
    
    try {
      const query = 'SELECT * FROM users WHERE id = $1';
      const result = await client.query(query, [userId]);
      
      return result.rows.length > 0 ? result.rows[0] : null;

    } catch (error) {
      logger.error(`Error fetching user ${userId}:`, error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get user's order count for today
   */
  async getUserOrderCountToday(userId: string): Promise<number> {
    const client = await this.pool.connect();
    
    try {
      const query = `
        SELECT COUNT(*) as count 
        FROM zerodha_orders 
        WHERE account_id = $1 
        AND DATE(order_timestamp) = CURRENT_DATE
      `;

      const result = await client.query(query, [userId]);
      return parseInt(result.rows[0].count);

    } catch (error) {
      logger.error(`Error fetching order count for user ${userId}:`, error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get order statistics for a user
   */
  async getOrderStats(
    userId: string, 
    timeframe: 'today' | 'week' | 'month' = 'today'
  ): Promise<any> {
    const client = await this.pool.connect();
    
    try {
      let dateCondition = '';
      switch (timeframe) {
        case 'today':
          dateCondition = "DATE(order_timestamp) = CURRENT_DATE";
          break;
        case 'week':
          dateCondition = "order_timestamp >= CURRENT_DATE - INTERVAL '7 days'";
          break;
        case 'month':
          dateCondition = "order_timestamp >= CURRENT_DATE - INTERVAL '30 days'";
          break;
      }

      const query = `
        SELECT 
          COUNT(*) as total_orders,
          COUNT(CASE WHEN status = 'COMPLETE' THEN 1 END) as completed_orders,
          COUNT(CASE WHEN status = 'CANCELLED' THEN 1 END) as cancelled_orders,
          COUNT(CASE WHEN status = 'REJECTED' THEN 1 END) as rejected_orders,
          COUNT(CASE WHEN status = 'OPEN' THEN 1 END) as open_orders,
          SUM(CASE WHEN status = 'COMPLETE' THEN quantity * average_price ELSE 0 END) as total_value,
          AVG(CASE WHEN status = 'COMPLETE' THEN average_price ELSE NULL END) as avg_price
        FROM zerodha_orders 
        WHERE account_id = $1 AND ${dateCondition}
      `;

      const result = await client.query(query, [userId]);
      return result.rows[0];

    } catch (error) {
      logger.error(`Error fetching order stats for user ${userId}:`, error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get order updates/history
   */
  async getOrderUpdates(userId: string, since?: Date): Promise<OrderStatusUpdate[]> {
    const client = await this.pool.connect();
    
    try {
      // This would require an order_updates table to track status changes
      // For now, we'll return recent orders with status changes
      let query = `
        SELECT 
          order_id,
          status as new_status,
          updated_at as timestamp,
          filled_quantity,
          average_price
        FROM zerodha_orders 
        WHERE account_id = $1
      `;
      
      const values: any[] = [userId];

      if (since) {
        query += ` AND updated_at > $${values.length + 1}`;
        values.push(since);
      }

      query += ` ORDER BY updated_at DESC LIMIT 100`;

      const result = await client.query(query, values);
      
      return result.rows.map(row => ({
        orderId: row.order_id,
        previousStatus: 'UNKNOWN', // Would need order_updates table for this
        newStatus: row.new_status,
        timestamp: row.timestamp,
        filledQuantity: row.filled_quantity,
        averagePrice: row.average_price
      }));

    } catch (error) {
      logger.error(`Error fetching order updates for user ${userId}:`, error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Create order update record (for audit trail)
   */
  async createOrderUpdate(update: OrderStatusUpdate): Promise<void> {
    const client = await this.pool.connect();
    
    try {
      // This would require an order_updates table
      const query = `
        INSERT INTO order_updates (
          order_id, previous_status, new_status, 
          timestamp, filled_quantity, average_price
        ) VALUES ($1, $2, $3, $4, $5, $6)
      `;

      await client.query(query, [
        update.orderId,
        update.previousStatus,
        update.newStatus,
        update.timestamp,
        update.filledQuantity,
        update.averagePrice
      ]);

    } catch (error) {
      // Don't throw error for audit trail failures
      logger.error('Error creating order update record:', error);
    } finally {
      client.release();
    }
  }

  /**
   * Search orders by criteria
   */
  async searchOrders(
    userId: string,
    criteria: {
      symbol?: string;
      exchange?: string;
      status?: string;
      fromDate?: Date;
      toDate?: Date;
    },
    limit: number = 50,
    offset: number = 0
  ): Promise<ZerodhaOrder[]> {
    const client = await this.pool.connect();
    
    try {
      let query = 'SELECT * FROM zerodha_orders WHERE account_id = $1';
      const values: any[] = [userId];

      if (criteria.symbol) {
        query += ` AND tradingsymbol ILIKE $${values.length + 1}`;
        values.push(`%${criteria.symbol}%`);
      }

      if (criteria.exchange) {
        query += ` AND exchange = $${values.length + 1}`;
        values.push(criteria.exchange);
      }

      if (criteria.status) {
        query += ` AND status = $${values.length + 1}`;
        values.push(criteria.status);
      }

      if (criteria.fromDate) {
        query += ` AND order_timestamp >= $${values.length + 1}`;
        values.push(criteria.fromDate);
      }

      if (criteria.toDate) {
        query += ` AND order_timestamp <= $${values.length + 1}`;
        values.push(criteria.toDate);
      }

      query += ` ORDER BY order_timestamp DESC LIMIT $${values.length + 1} OFFSET $${values.length + 2}`;
      values.push(limit, offset);

      const result = await client.query(query, values);
      return result.rows;

    } catch (error) {
      logger.error(`Error searching orders for user ${userId}:`, error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Close database connection
   */
  async close(): Promise<void> {
    await this.pool.end();
  }
}