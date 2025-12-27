import { ZerodhaOrder } from '@tradeflow/types';
import { DatabaseService } from './DatabaseService';
import { ZerodhaApiClient } from './ZerodhaApiClient';
import { RedisService } from './RedisService';
import { logger } from '../utils/logger';

export interface OrderHistoryQuery {
  userId: string;
  orderId?: string;
  symbol?: string;
  exchange?: string;
  status?: string;
  fromDate?: Date;
  toDate?: Date;
  limit?: number;
  offset?: number;
}

export interface OrderTradeDetails {
  trade_id: string;
  order_id: string;
  exchange_order_id: string;
  tradingsymbol: string;
  exchange: string;
  instrument_token: number;
  product: string;
  quantity: number;
  price: number;
  timestamp: string;
  transaction_type: string;
}

export interface OrderSummary {
  totalOrders: number;
  completedOrders: number;
  cancelledOrders: number;
  rejectedOrders: number;
  openOrders: number;
  totalValue: number;
  avgExecutionPrice: number;
  successRate: number;
}

export class OrderHistoryService {
  private databaseService: DatabaseService;
  private apiClient: ZerodhaApiClient;
  private redisService: RedisService;

  constructor() {
    this.databaseService = new DatabaseService();
    this.apiClient = new ZerodhaApiClient();
    this.redisService = new RedisService();
  }

  /**
   * Get order history with filtering and pagination
   */
  async getOrderHistory(query: OrderHistoryQuery): Promise<{
    orders: ZerodhaOrder[];
    total: number;
    hasMore: boolean;
  }> {
    try {
      logger.info(`Fetching order history for user ${query.userId}:`, {
        symbol: query.symbol,
        exchange: query.exchange,
        status: query.status,
        limit: query.limit
      });

      const limit = query.limit || 50;
      const offset = query.offset || 0;

      // Build search criteria
      const searchCriteria = {
        symbol: query.symbol,
        exchange: query.exchange,
        status: query.status,
        fromDate: query.fromDate,
        toDate: query.toDate
      };

      // Get orders from database
      const orders = await this.databaseService.searchOrders(
        query.userId,
        searchCriteria,
        limit + 1, // Get one extra to check if there are more
        offset
      );

      const hasMore = orders.length > limit;
      const resultOrders = hasMore ? orders.slice(0, limit) : orders;

      // Get total count for pagination
      const total = await this.getOrderCount(query.userId, searchCriteria);

      return {
        orders: resultOrders,
        total,
        hasMore
      };

    } catch (error) {
      logger.error(`Error fetching order history for user ${query.userId}:`, error);
      throw error;
    }
  }

  /**
   * Get detailed order information including trades
   */
  async getOrderDetails(
    userId: string,
    orderId: string,
    accessToken?: string
  ): Promise<{
    order: ZerodhaOrder;
    trades: OrderTradeDetails[];
    timeline: any[];
  } | null> {
    try {
      logger.info(`Fetching order details for order ${orderId}`);

      // Get order from database
      const order = await this.databaseService.getOrderById(orderId);
      if (!order || order.account_id !== userId) {
        return null;
      }

      // Get trade details
      let trades: OrderTradeDetails[] = [];
      if (accessToken) {
        try {
          const tradesResponse = await this.apiClient.getOrderHistory(orderId, accessToken);
          if (tradesResponse.status === 'success' && tradesResponse.data) {
            trades = tradesResponse.data;
          }
        } catch (error) {
          logger.warn(`Failed to fetch trades for order ${orderId}:`, error);
        }
      }

      // Get order timeline/audit trail
      const timeline = await this.getOrderTimeline(orderId);

      return {
        order,
        trades,
        timeline
      };

    } catch (error) {
      logger.error(`Error fetching order details for ${orderId}:`, error);
      throw error;
    }
  }

  /**
   * Get order summary statistics
   */
  async getOrderSummary(
    userId: string,
    timeframe: 'today' | 'week' | 'month' | 'year' = 'today'
  ): Promise<OrderSummary> {
    try {
      logger.info(`Fetching order summary for user ${userId}, timeframe: ${timeframe}`);

      // Try cache first
      const cacheKey = `order_summary:${userId}:${timeframe}`;
      const cachedSummary = await this.redisService.get(cacheKey);
      if (cachedSummary) {
        return JSON.parse(cachedSummary);
      }

      // Get stats from database
      const stats = await this.databaseService.getOrderStats(userId, timeframe);

      const summary: OrderSummary = {
        totalOrders: parseInt(stats.total_orders) || 0,
        completedOrders: parseInt(stats.completed_orders) || 0,
        cancelledOrders: parseInt(stats.cancelled_orders) || 0,
        rejectedOrders: parseInt(stats.rejected_orders) || 0,
        openOrders: parseInt(stats.open_orders) || 0,
        totalValue: parseFloat(stats.total_value) || 0,
        avgExecutionPrice: parseFloat(stats.avg_price) || 0,
        successRate: 0
      };

      // Calculate success rate
      if (summary.totalOrders > 0) {
        summary.successRate = (summary.completedOrders / summary.totalOrders) * 100;
      }

      // Cache the summary for 5 minutes
      await this.redisService.set(cacheKey, JSON.stringify(summary), 300);

      return summary;

    } catch (error) {
      logger.error(`Error fetching order summary for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Get order timeline/audit trail
   */
  async getOrderTimeline(orderId: string): Promise<any[]> {
    try {
      // This would query an audit/timeline table
      // For now, return basic timeline from order updates
      const order = await this.databaseService.getOrderById(orderId);
      if (!order) {
        return [];
      }

      const timeline = [
        {
          timestamp: order.order_timestamp,
          event: 'ORDER_PLACED',
          description: `Order placed for ${order.quantity} shares of ${order.tradingsymbol}`,
          details: {
            quantity: order.quantity,
            price: order.price,
            order_type: order.order_type
          }
        }
      ];

      // Add status updates if available
      if (order.exchange_timestamp) {
        timeline.push({
          timestamp: order.exchange_timestamp,
          event: 'EXCHANGE_RECEIVED',
          description: 'Order received by exchange'
        });
      }

      if (order.filled_quantity > 0) {
        timeline.push({
          timestamp: order.exchange_update_timestamp || order.order_timestamp,
          event: order.filled_quantity === order.quantity ? 'ORDER_COMPLETED' : 'PARTIAL_FILL',
          description: `${order.filled_quantity} shares executed at ₹${order.average_price}`,
          details: {
            filled_quantity: order.filled_quantity,
            average_price: order.average_price
          }
        });
      }

      if (order.status === 'CANCELLED') {
        timeline.push({
          timestamp: order.exchange_update_timestamp || order.order_timestamp,
          event: 'ORDER_CANCELLED',
          description: 'Order cancelled',
          details: {
            reason: order.status_message
          }
        });
      }

      if (order.status === 'REJECTED') {
        timeline.push({
          timestamp: order.exchange_update_timestamp || order.order_timestamp,
          event: 'ORDER_REJECTED',
          description: 'Order rejected by exchange',
          details: {
            reason: order.status_message
          }
        });
      }

      return timeline.sort((a, b) => 
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );

    } catch (error) {
      logger.error(`Error fetching order timeline for ${orderId}:`, error);
      return [];
    }
  }

  /**
   * Sync order history from Zerodha API
   */
  async syncOrderHistory(userId: string, accessToken: string): Promise<{
    synced: number;
    errors: string[];
  }> {
    try {
      logger.info(`Syncing order history for user ${userId}`);

      const errors: string[] = [];
      let syncedCount = 0;

      // Fetch orders from Zerodha API
      const apiResponse = await this.apiClient.getOrders(accessToken);
      if (apiResponse.status !== 'success' || !apiResponse.data) {
        throw new Error('Failed to fetch orders from Zerodha API');
      }

      const apiOrders = apiResponse.data as ZerodhaOrder[];

      // Process each order
      for (const apiOrder of apiOrders) {
        try {
          // Check if order exists in database
          const existingOrder = await this.databaseService.getOrderById(apiOrder.order_id);
          
          if (existingOrder) {
            // Update existing order if there are changes
            if (this.hasOrderChanged(existingOrder, apiOrder)) {
              await this.databaseService.updateOrder(apiOrder.order_id, {
                status: apiOrder.status,
                filled_quantity: apiOrder.filled_quantity,
                pending_quantity: apiOrder.pending_quantity,
                cancelled_quantity: apiOrder.cancelled_quantity,
                average_price: apiOrder.average_price,
                exchange_update_timestamp: apiOrder.exchange_update_timestamp,
                exchange_timestamp: apiOrder.exchange_timestamp,
                status_message: apiOrder.status_message
              });
              syncedCount++;
            }
          } else {
            // Create new order record
            const orderData = {
              ...apiOrder,
              account_id: userId,
              placed_by: userId
            };
            await this.databaseService.createOrder(orderData);
            syncedCount++;
          }

        } catch (error) {
          logger.error(`Error syncing order ${apiOrder.order_id}:`, error);
          errors.push(`Failed to sync order ${apiOrder.order_id}: ${error.message}`);
        }
      }

      logger.info(`Order history sync completed for user ${userId}: ${syncedCount} orders synced`);

      return {
        synced: syncedCount,
        errors
      };

    } catch (error) {
      logger.error(`Error syncing order history for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Export order history to CSV
   */
  async exportOrderHistory(
    userId: string,
    query: Omit<OrderHistoryQuery, 'userId' | 'limit' | 'offset'>
  ): Promise<string> {
    try {
      logger.info(`Exporting order history for user ${userId}`);

      // Get all orders matching criteria
      const { orders } = await this.getOrderHistory({
        ...query,
        userId,
        limit: 10000 // Large limit for export
      });

      // Generate CSV content
      const headers = [
        'Order ID',
        'Date',
        'Symbol',
        'Exchange',
        'Type',
        'Quantity',
        'Price',
        'Trigger Price',
        'Status',
        'Filled Qty',
        'Avg Price',
        'Product',
        'Validity'
      ];

      const csvRows = [headers.join(',')];

      for (const order of orders) {
        const row = [
          order.order_id,
          new Date(order.order_timestamp).toISOString().split('T')[0],
          order.tradingsymbol,
          order.exchange,
          order.transaction_type,
          order.quantity,
          order.price || '',
          order.trigger_price || '',
          order.status,
          order.filled_quantity,
          order.average_price || '',
          order.product,
          order.validity
        ];
        csvRows.push(row.join(','));
      }

      return csvRows.join('\n');

    } catch (error) {
      logger.error(`Error exporting order history for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Get order performance analytics
   */
  async getOrderAnalytics(
    userId: string,
    timeframe: 'week' | 'month' | 'quarter' | 'year' = 'month'
  ): Promise<any> {
    try {
      logger.info(`Fetching order analytics for user ${userId}, timeframe: ${timeframe}`);

      // This would involve complex analytics queries
      // For now, return basic analytics
      const summary = await this.getOrderSummary(userId, timeframe);
      
      return {
        summary,
        trends: {
          // Daily order counts, success rates, etc.
          // This would require more complex database queries
        },
        topSymbols: await this.getTopTradedSymbols(userId, timeframe),
        performanceMetrics: {
          avgExecutionTime: 0, // Would calculate from order timestamps
          fillRate: summary.successRate,
          rejectionRate: (summary.rejectedOrders / summary.totalOrders) * 100
        }
      };

    } catch (error) {
      logger.error(`Error fetching order analytics for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Get top traded symbols for a user
   */
  private async getTopTradedSymbols(
    userId: string,
    timeframe: string,
    limit: number = 10
  ): Promise<any[]> {
    try {
      // This would require a more complex query
      // For now, return empty array
      return [];
    } catch (error) {
      logger.error(`Error fetching top traded symbols for user ${userId}:`, error);
      return [];
    }
  }

  /**
   * Get order count for pagination
   */
  private async getOrderCount(userId: string, criteria: any): Promise<number> {
    try {
      // This would require a count query with the same criteria
      // For now, return approximate count
      return 0;
    } catch (error) {
      logger.error(`Error getting order count for user ${userId}:`, error);
      return 0;
    }
  }

  /**
   * Check if order has changed (for sync)
   */
  private hasOrderChanged(existingOrder: ZerodhaOrder, apiOrder: ZerodhaOrder): boolean {
    return (
      existingOrder.status !== apiOrder.status ||
      existingOrder.filled_quantity !== apiOrder.filled_quantity ||
      existingOrder.average_price !== apiOrder.average_price ||
      existingOrder.pending_quantity !== apiOrder.pending_quantity ||
      existingOrder.cancelled_quantity !== apiOrder.cancelled_quantity
    );
  }

  /**
   * Create order status change notification
   */
  async createStatusChangeNotification(
    userId: string,
    orderId: string,
    oldStatus: string,
    newStatus: string
  ): Promise<void> {
    try {
      const notification = {
        userId,
        orderId,
        type: 'ORDER_STATUS_CHANGE',
        title: 'Order Status Updated',
        message: `Order ${orderId} status changed from ${oldStatus} to ${newStatus}`,
        timestamp: new Date().toISOString(),
        read: false
      };

      // Store notification in Redis for real-time delivery
      const notificationKey = `notifications:${userId}:${Date.now()}`;
      await this.redisService.set(
        notificationKey,
        JSON.stringify(notification),
        86400 // 24 hours TTL
      );

      logger.info(`Status change notification created for user ${userId}, order ${orderId}`);

    } catch (error) {
      logger.error('Error creating status change notification:', error);
    }
  }

  /**
   * Get user notifications
   */
  async getUserNotifications(userId: string, limit: number = 50): Promise<any[]> {
    try {
      // This would query notifications from Redis or database
      // For now, return empty array
      return [];
    } catch (error) {
      logger.error(`Error fetching notifications for user ${userId}:`, error);
      return [];
    }
  }
}