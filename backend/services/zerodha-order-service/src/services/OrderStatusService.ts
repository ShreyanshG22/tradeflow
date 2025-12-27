import { ZerodhaOrder, ZERODHA_CONSTANTS } from '@tradeflow/types';
import { DatabaseService } from './DatabaseService';
import { ZerodhaApiClient } from './ZerodhaApiClient';
import { RedisService } from './RedisService';
import { logger } from '../utils/logger';

export interface OrderStatusUpdate {
  orderId: string;
  previousStatus: string;
  newStatus: string;
  timestamp: string;
  filledQuantity?: number;
  averagePrice?: number;
}

export class OrderStatusService {
  private databaseService: DatabaseService;
  private apiClient: ZerodhaApiClient;
  private redisService: RedisService;
  private monitoringIntervals: Map<string, NodeJS.Timeout> = new Map();
  private readonly MONITORING_INTERVAL = 5000; // 5 seconds

  constructor() {
    this.databaseService = new DatabaseService();
    this.apiClient = new ZerodhaApiClient();
    this.redisService = new RedisService();
  }

  /**
   * Start monitoring an order for status updates
   */
  startMonitoring(orderId: string, userId: string): void {
    // Clear existing monitoring if any
    this.stopMonitoring(orderId);

    logger.info(`Starting order monitoring for order ${orderId}`);

    const interval = setInterval(async () => {
      try {
        await this.checkOrderStatus(orderId, userId);
      } catch (error) {
        logger.error(`Error monitoring order ${orderId}:`, error);
      }
    }, this.MONITORING_INTERVAL);

    this.monitoringIntervals.set(orderId, interval);

    // Auto-stop monitoring after 8 hours (market close)
    setTimeout(() => {
      this.stopMonitoring(orderId);
    }, 8 * 60 * 60 * 1000);
  }

  /**
   * Stop monitoring an order
   */
  stopMonitoring(orderId: string): void {
    const interval = this.monitoringIntervals.get(orderId);
    if (interval) {
      clearInterval(interval);
      this.monitoringIntervals.delete(orderId);
      logger.info(`Stopped monitoring order ${orderId}`);
    }
  }

  /**
   * Check order status and update if changed
   */
  async checkOrderStatus(orderId: string, userId: string): Promise<OrderStatusUpdate | null> {
    try {
      // Get current order from database
      const currentOrder = await this.databaseService.getOrderById(orderId);
      if (!currentOrder) {
        logger.warn(`Order ${orderId} not found in database`);
        return null;
      }

      // Get user's access token
      const accessToken = await this.getUserAccessToken(userId);
      if (!accessToken) {
        logger.error(`Access token not found for user ${userId}`);
        return null;
      }

      // Fetch latest status from Zerodha API
      const apiResponse = await this.apiClient.getOrder(orderId, accessToken);
      if (apiResponse.status !== 'success' || !apiResponse.data) {
        logger.warn(`Failed to fetch order status from API for order ${orderId}`);
        return null;
      }

      const latestOrder = apiResponse.data as ZerodhaOrder;

      // Check if status has changed
      if (this.hasOrderChanged(currentOrder, latestOrder)) {
        const statusUpdate = await this.updateOrderStatus(currentOrder, latestOrder);
        
        // Stop monitoring if order is in terminal state
        if (this.isTerminalStatus(latestOrder.status)) {
          this.stopMonitoring(orderId);
        }

        return statusUpdate;
      }

      return null;

    } catch (error) {
      logger.error(`Error checking order status for ${orderId}:`, error);
      return null;
    }
  }

  /**
   * Update order status in database and notify clients
   */
  private async updateOrderStatus(
    currentOrder: ZerodhaOrder, 
    latestOrder: ZerodhaOrder
  ): Promise<OrderStatusUpdate> {
    const statusUpdate: OrderStatusUpdate = {
      orderId: currentOrder.order_id,
      previousStatus: currentOrder.status,
      newStatus: latestOrder.status,
      timestamp: new Date().toISOString(),
      filledQuantity: latestOrder.filled_quantity,
      averagePrice: latestOrder.average_price
    };

    try {
      // Update order in database
      await this.databaseService.updateOrder(currentOrder.order_id, {
        status: latestOrder.status,
        filled_quantity: latestOrder.filled_quantity,
        pending_quantity: latestOrder.pending_quantity,
        cancelled_quantity: latestOrder.cancelled_quantity,
        average_price: latestOrder.average_price,
        exchange_update_timestamp: latestOrder.exchange_update_timestamp,
        exchange_timestamp: latestOrder.exchange_timestamp,
        status_message: latestOrder.status_message,
        status_message_raw: latestOrder.status_message_raw
      });

      // Cache the update for real-time notifications
      await this.cacheStatusUpdate(statusUpdate);

      // Log the status change
      logger.info(`Order status updated:`, {
        orderId: currentOrder.order_id,
        from: statusUpdate.previousStatus,
        to: statusUpdate.newStatus,
        filled: statusUpdate.filledQuantity,
        avgPrice: statusUpdate.averagePrice
      });

      // Trigger notifications (WebSocket, webhooks, etc.)
      await this.notifyStatusChange(statusUpdate);

      return statusUpdate;

    } catch (error) {
      logger.error(`Error updating order status for ${currentOrder.order_id}:`, error);
      throw error;
    }
  }

  /**
   * Check if order has changed
   */
  private hasOrderChanged(currentOrder: ZerodhaOrder, latestOrder: ZerodhaOrder): boolean {
    return (
      currentOrder.status !== latestOrder.status ||
      currentOrder.filled_quantity !== latestOrder.filled_quantity ||
      currentOrder.average_price !== latestOrder.average_price ||
      currentOrder.pending_quantity !== latestOrder.pending_quantity ||
      currentOrder.cancelled_quantity !== latestOrder.cancelled_quantity
    );
  }

  /**
   * Check if order status is terminal (no more updates expected)
   */
  private isTerminalStatus(status: string): boolean {
    const terminalStatuses = [
      ZERODHA_CONSTANTS.ORDER_STATUS.COMPLETE,
      ZERODHA_CONSTANTS.ORDER_STATUS.CANCELLED,
      ZERODHA_CONSTANTS.ORDER_STATUS.CANCELLED_AMO,
      ZERODHA_CONSTANTS.ORDER_STATUS.REJECTED
    ];
    return terminalStatuses.includes(status as any);
  }

  /**
   * Get user's access token from cache or database
   */
  private async getUserAccessToken(userId: string): Promise<string | null> {
    try {
      // Try cache first
      const cachedToken = await this.redisService.get(`user_token:${userId}`);
      if (cachedToken) {
        return cachedToken;
      }

      // Fallback to database
      const user = await this.databaseService.getUserById(userId);
      return user?.zerodha_access_token || null;

    } catch (error) {
      logger.error(`Error getting access token for user ${userId}:`, error);
      return null;
    }
  }

  /**
   * Cache status update for real-time notifications
   */
  private async cacheStatusUpdate(statusUpdate: OrderStatusUpdate): Promise<void> {
    try {
      const cacheKey = `order_update:${statusUpdate.orderId}`;
      await this.redisService.set(
        cacheKey, 
        JSON.stringify(statusUpdate), 
        300 // 5 minutes TTL
      );
    } catch (error) {
      logger.error('Error caching status update:', error);
    }
  }

  /**
   * Notify clients about status changes
   */
  private async notifyStatusChange(statusUpdate: OrderStatusUpdate): Promise<void> {
    try {
      // This would integrate with WebSocket service or notification service
      // For now, we'll just log and cache for polling
      
      const notificationKey = `notifications:order:${statusUpdate.orderId}`;
      await this.redisService.set(
        notificationKey,
        JSON.stringify({
          type: 'order_status_change',
          data: statusUpdate,
          timestamp: statusUpdate.timestamp
        }),
        3600 // 1 hour TTL
      );

      logger.info(`Order status notification sent for order ${statusUpdate.orderId}`);

    } catch (error) {
      logger.error('Error sending status notification:', error);
    }
  }

  /**
   * Get order status updates for a user
   */
  async getOrderUpdates(userId: string, since?: Date): Promise<OrderStatusUpdate[]> {
    try {
      return await this.databaseService.getOrderUpdates(userId, since);
    } catch (error) {
      logger.error(`Error fetching order updates for user ${userId}:`, error);
      return [];
    }
  }

  /**
   * Get real-time order status
   */
  async getOrderStatus(orderId: string): Promise<ZerodhaOrder | null> {
    try {
      return await this.databaseService.getOrderById(orderId);
    } catch (error) {
      logger.error(`Error fetching order status for ${orderId}:`, error);
      return null;
    }
  }

  /**
   * Bulk update order statuses for a user
   */
  async bulkUpdateOrderStatuses(userId: string): Promise<void> {
    try {
      const accessToken = await this.getUserAccessToken(userId);
      if (!accessToken) {
        throw new Error('Access token not found');
      }

      // Get all open orders for the user
      const openOrders = await this.databaseService.getOpenOrders(userId);
      
      // Fetch latest statuses from API
      const apiResponse = await this.apiClient.getOrders(accessToken);
      if (apiResponse.status !== 'success' || !apiResponse.data) {
        throw new Error('Failed to fetch orders from API');
      }

      const latestOrders = apiResponse.data as ZerodhaOrder[];
      
      // Update each order
      for (const currentOrder of openOrders) {
        const latestOrder = latestOrders.find(o => o.order_id === currentOrder.order_id);
        if (latestOrder && this.hasOrderChanged(currentOrder, latestOrder)) {
          await this.updateOrderStatus(currentOrder, latestOrder);
        }
      }

      logger.info(`Bulk updated ${openOrders.length} orders for user ${userId}`);

    } catch (error) {
      logger.error(`Error in bulk update for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Start monitoring all open orders for a user
   */
  async startMonitoringUserOrders(userId: string): Promise<void> {
    try {
      const openOrders = await this.databaseService.getOpenOrders(userId);
      
      for (const order of openOrders) {
        this.startMonitoring(order.order_id, userId);
      }

      logger.info(`Started monitoring ${openOrders.length} orders for user ${userId}`);

    } catch (error) {
      logger.error(`Error starting monitoring for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Stop monitoring all orders for a user
   */
  stopMonitoringUserOrders(userId: string): void {
    // This would require tracking which orders belong to which user
    // For now, we'll stop all monitoring (could be improved)
    for (const [orderId, interval] of this.monitoringIntervals) {
      this.stopMonitoring(orderId);
    }
  }

  /**
   * Get monitoring statistics
   */
  getMonitoringStats(): { activeOrders: number; totalMonitored: number } {
    return {
      activeOrders: this.monitoringIntervals.size,
      totalMonitored: this.monitoringIntervals.size
    };
  }
}