import { 
  ZerodhaOrderRequest, 
  ZerodhaOrder, 
  ZERODHA_CONSTANTS 
} from '@tradeflow/types';
import { OrderValidationService } from './OrderValidationService';
import { DatabaseService } from './DatabaseService';
import { ZerodhaApiClient } from './ZerodhaApiClient';
import { OrderStatusService } from './OrderStatusService';
import { logger } from '../utils/logger';

export interface OrderModificationResult {
  success: boolean;
  orderId?: string;
  order?: ZerodhaOrder;
  errors?: string[];
  warnings?: string[];
}

export interface OrderCancellationResult {
  success: boolean;
  orderId?: string;
  errors?: string[];
  message?: string;
}

export class OrderModificationService {
  private validationService: OrderValidationService;
  private databaseService: DatabaseService;
  private apiClient: ZerodhaApiClient;
  private statusService: OrderStatusService;

  constructor() {
    this.validationService = new OrderValidationService();
    this.databaseService = new DatabaseService();
    this.apiClient = new ZerodhaApiClient();
    this.statusService = new OrderStatusService();
  }

  /**
   * Modify an existing order
   */
  async modifyOrder(
    userId: string,
    orderId: string,
    modifications: Partial<ZerodhaOrderRequest>,
    accessToken: string
  ): Promise<OrderModificationResult> {
    const startTime = Date.now();

    try {
      logger.info(`Modifying order ${orderId} for user ${userId}:`, modifications);

      // Step 1: Get existing order
      const existingOrder = await this.databaseService.getOrderById(orderId);
      if (!existingOrder) {
        return {
          success: false,
          errors: ['Order not found']
        };
      }

      // Step 2: Verify order ownership
      if (existingOrder.account_id !== userId) {
        return {
          success: false,
          errors: ['Unauthorized: Order does not belong to user']
        };
      }

      // Step 3: Validate modification parameters
      const validation = await this.validationService.validateOrderModification(
        orderId,
        modifications,
        existingOrder
      );

      if (!validation.valid) {
        logger.warn(`Order modification validation failed for order ${orderId}:`, validation.errors);
        return {
          success: false,
          errors: validation.errors,
          warnings: validation.warnings
        };
      }

      // Step 4: Check if order can be modified
      const modifiabilityCheck = this.checkOrderModifiability(existingOrder);
      if (!modifiabilityCheck.canModify) {
        return {
          success: false,
          errors: [modifiabilityCheck.reason || 'Order cannot be modified']
        };
      }

      // Step 5: Validate modified order parameters
      const modifiedOrderRequest = this.mergeOrderModifications(existingOrder, modifications);
      const orderValidation = await this.validationService.validateOrder(modifiedOrderRequest);
      
      if (!orderValidation.valid) {
        return {
          success: false,
          errors: orderValidation.errors,
          warnings: orderValidation.warnings
        };
      }

      // Step 6: Submit modification to Zerodha API
      const apiResponse = await this.apiClient.modifyOrder(orderId, modifications, accessToken);
      if (apiResponse.status !== 'success') {
        logger.error(`Zerodha API order modification failed for order ${orderId}:`, apiResponse.message);
        return {
          success: false,
          errors: [apiResponse.message || 'Order modification failed']
        };
      }

      // Step 7: Update order in database
      const updatedOrder = await this.updateOrderInDatabase(orderId, modifications);

      // Step 8: Log modification
      await this.logOrderModification(userId, orderId, modifications, existingOrder);

      const executionTime = Date.now() - startTime;
      logger.info(`Order modified successfully:`, {
        orderId,
        userId,
        executionTime: `${executionTime}ms`
      });

      return {
        success: true,
        orderId,
        order: updatedOrder,
        warnings: orderValidation.warnings
      };

    } catch (error) {
      const executionTime = Date.now() - startTime;
      logger.error(`Order modification error for order ${orderId}:`, {
        error: error.message,
        executionTime: `${executionTime}ms`,
        modifications
      });

      return {
        success: false,
        errors: ['Internal error occurred while modifying order']
      };
    }
  }

  /**
   * Cancel an existing order
   */
  async cancelOrder(
    userId: string,
    orderId: string,
    accessToken: string,
    reason?: string
  ): Promise<OrderCancellationResult> {
    const startTime = Date.now();

    try {
      logger.info(`Cancelling order ${orderId} for user ${userId}`, { reason });

      // Step 1: Get existing order
      const existingOrder = await this.databaseService.getOrderById(orderId);
      if (!existingOrder) {
        return {
          success: false,
          errors: ['Order not found']
        };
      }

      // Step 2: Verify order ownership
      if (existingOrder.account_id !== userId) {
        return {
          success: false,
          errors: ['Unauthorized: Order does not belong to user']
        };
      }

      // Step 3: Validate cancellation
      const validation = this.validationService.validateOrderCancellation(orderId, existingOrder);
      if (!validation.valid) {
        logger.warn(`Order cancellation validation failed for order ${orderId}:`, validation.errors);
        return {
          success: false,
          errors: validation.errors
        };
      }

      // Step 4: Check if order can be cancelled
      const cancellabilityCheck = this.checkOrderCancellability(existingOrder);
      if (!cancellabilityCheck.canCancel) {
        return {
          success: false,
          errors: [cancellabilityCheck.reason || 'Order cannot be cancelled']
        };
      }

      // Step 5: Submit cancellation to Zerodha API
      const apiResponse = await this.apiClient.cancelOrder(orderId, accessToken);
      if (apiResponse.status !== 'success') {
        logger.error(`Zerodha API order cancellation failed for order ${orderId}:`, apiResponse.message);
        return {
          success: false,
          errors: [apiResponse.message || 'Order cancellation failed']
        };
      }

      // Step 6: Update order status in database
      await this.databaseService.updateOrder(orderId, {
        status: 'CANCEL_PENDING',
        status_message: reason || 'User requested cancellation'
      });

      // Step 7: Stop monitoring if needed
      this.statusService.stopMonitoring(orderId);

      // Step 8: Log cancellation
      await this.logOrderCancellation(userId, orderId, reason, existingOrder);

      const executionTime = Date.now() - startTime;
      logger.info(`Order cancellation initiated successfully:`, {
        orderId,
        userId,
        executionTime: `${executionTime}ms`
      });

      return {
        success: true,
        orderId,
        message: 'Order cancellation initiated successfully'
      };

    } catch (error) {
      const executionTime = Date.now() - startTime;
      logger.error(`Order cancellation error for order ${orderId}:`, {
        error: error.message,
        executionTime: `${executionTime}ms`
      });

      return {
        success: false,
        errors: ['Internal error occurred while cancelling order']
      };
    }
  }

  /**
   * Cancel multiple orders in batch
   */
  async cancelBatchOrders(
    userId: string,
    orderIds: string[],
    accessToken: string,
    reason?: string
  ): Promise<OrderCancellationResult[]> {
    const results: OrderCancellationResult[] = [];
    
    logger.info(`Cancelling batch of ${orderIds.length} orders for user ${userId}`);

    // Process cancellations sequentially to respect rate limits
    for (let i = 0; i < orderIds.length; i++) {
      const orderId = orderIds[i];
      
      try {
        const result = await this.cancelOrder(userId, orderId, accessToken, reason);
        results.push(result);

        // Add small delay between cancellations
        if (i < orderIds.length - 1) {
          await this.delay(100); // 100ms delay
        }

      } catch (error) {
        logger.error(`Batch cancellation ${i} failed for order ${orderId}:`, error);
        results.push({
          success: false,
          orderId,
          errors: [`Batch cancellation failed: ${error.message}`]
        });
      }
    }

    const successCount = results.filter(r => r.success).length;
    logger.info(`Batch cancellation completion for user ${userId}: ${successCount}/${orderIds.length} successful`);

    return results;
  }

  /**
   * Handle partial fill scenarios
   */
  async handlePartialFill(
    orderId: string,
    filledQuantity: number,
    remainingQuantity: number
  ): Promise<void> {
    try {
      logger.info(`Handling partial fill for order ${orderId}:`, {
        filled: filledQuantity,
        remaining: remainingQuantity
      });

      // Update order with partial fill information
      await this.databaseService.updateOrder(orderId, {
        filled_quantity: filledQuantity,
        pending_quantity: remainingQuantity,
        status: remainingQuantity > 0 ? 'OPEN' : 'COMPLETE'
      });

      // Log partial fill event
      await this.logPartialFill(orderId, filledQuantity, remainingQuantity);

    } catch (error) {
      logger.error(`Error handling partial fill for order ${orderId}:`, error);
      throw error;
    }
  }

  /**
   * Check if order can be modified
   */
  private checkOrderModifiability(order: ZerodhaOrder): { canModify: boolean; reason?: string } {
    const modifiableStatuses = ['OPEN', 'TRIGGER_PENDING'];
    
    if (!modifiableStatuses.includes(order.status)) {
      return {
        canModify: false,
        reason: `Order with status '${order.status}' cannot be modified`
      };
    }

    // Check if order has any fills
    if (order.filled_quantity > 0) {
      return {
        canModify: false,
        reason: 'Partially filled orders cannot be modified'
      };
    }

    // Check market timing for certain modifications
    const now = new Date();
    const marketCloseTime = new Date();
    marketCloseTime.setHours(15, 30, 0, 0); // 3:30 PM IST

    if (now > marketCloseTime) {
      return {
        canModify: false,
        reason: 'Orders cannot be modified after market close'
      };
    }

    return { canModify: true };
  }

  /**
   * Check if order can be cancelled
   */
  private checkOrderCancellability(order: ZerodhaOrder): { canCancel: boolean; reason?: string } {
    const cancellableStatuses = ['OPEN', 'TRIGGER_PENDING', 'MODIFY_PENDING'];
    
    if (!cancellableStatuses.includes(order.status)) {
      return {
        canCancel: false,
        reason: `Order with status '${order.status}' cannot be cancelled`
      };
    }

    return { canCancel: true };
  }

  /**
   * Merge order modifications with existing order
   */
  private mergeOrderModifications(
    existingOrder: ZerodhaOrder,
    modifications: Partial<ZerodhaOrderRequest>
  ): ZerodhaOrderRequest {
    return {
      exchange: existingOrder.exchange as any,
      tradingsymbol: existingOrder.tradingsymbol,
      transaction_type: existingOrder.transaction_type as any,
      quantity: modifications.quantity || existingOrder.quantity,
      product: existingOrder.product as any,
      order_type: modifications.order_type || existingOrder.order_type as any,
      price: modifications.price !== undefined ? modifications.price : existingOrder.price,
      trigger_price: modifications.trigger_price !== undefined ? modifications.trigger_price : existingOrder.trigger_price,
      validity: modifications.validity || existingOrder.validity as any,
      disclosed_quantity: modifications.disclosed_quantity || existingOrder.disclosed_quantity
    };
  }

  /**
   * Update order in database after modification
   */
  private async updateOrderInDatabase(
    orderId: string,
    modifications: Partial<ZerodhaOrderRequest>
  ): Promise<ZerodhaOrder> {
    const updates: Partial<ZerodhaOrder> = {};

    if (modifications.quantity) updates.quantity = modifications.quantity;
    if (modifications.price !== undefined) updates.price = modifications.price;
    if (modifications.trigger_price !== undefined) updates.trigger_price = modifications.trigger_price;
    if (modifications.order_type) updates.order_type = modifications.order_type;
    if (modifications.validity) updates.validity = modifications.validity;
    if (modifications.disclosed_quantity !== undefined) updates.disclosed_quantity = modifications.disclosed_quantity;

    // Update pending quantity if quantity changed
    if (modifications.quantity) {
      updates.pending_quantity = modifications.quantity;
    }

    return await this.databaseService.updateOrder(orderId, updates);
  }

  /**
   * Log order modification for audit trail
   */
  private async logOrderModification(
    userId: string,
    orderId: string,
    modifications: Partial<ZerodhaOrderRequest>,
    originalOrder: ZerodhaOrder
  ): Promise<void> {
    try {
      const logEntry = {
        userId,
        orderId,
        action: 'MODIFY',
        timestamp: new Date().toISOString(),
        modifications,
        originalOrder: {
          quantity: originalOrder.quantity,
          price: originalOrder.price,
          trigger_price: originalOrder.trigger_price,
          order_type: originalOrder.order_type,
          validity: originalOrder.validity
        }
      };

      logger.info('Order modification logged:', logEntry);
      
      // This could be stored in a separate audit table
      // await this.databaseService.createAuditLog(logEntry);

    } catch (error) {
      logger.error('Error logging order modification:', error);
    }
  }

  /**
   * Log order cancellation for audit trail
   */
  private async logOrderCancellation(
    userId: string,
    orderId: string,
    reason: string | undefined,
    originalOrder: ZerodhaOrder
  ): Promise<void> {
    try {
      const logEntry = {
        userId,
        orderId,
        action: 'CANCEL',
        timestamp: new Date().toISOString(),
        reason,
        originalOrder: {
          status: originalOrder.status,
          quantity: originalOrder.quantity,
          filled_quantity: originalOrder.filled_quantity,
          pending_quantity: originalOrder.pending_quantity
        }
      };

      logger.info('Order cancellation logged:', logEntry);
      
      // This could be stored in a separate audit table
      // await this.databaseService.createAuditLog(logEntry);

    } catch (error) {
      logger.error('Error logging order cancellation:', error);
    }
  }

  /**
   * Log partial fill event
   */
  private async logPartialFill(
    orderId: string,
    filledQuantity: number,
    remainingQuantity: number
  ): Promise<void> {
    try {
      const logEntry = {
        orderId,
        action: 'PARTIAL_FILL',
        timestamp: new Date().toISOString(),
        filledQuantity,
        remainingQuantity
      };

      logger.info('Partial fill logged:', logEntry);

    } catch (error) {
      logger.error('Error logging partial fill:', error);
    }
  }

  /**
   * Utility function to add delay
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get modification history for an order
   */
  async getOrderModificationHistory(orderId: string): Promise<any[]> {
    try {
      // This would query an audit log table
      // For now, return empty array
      return [];
    } catch (error) {
      logger.error(`Error fetching modification history for order ${orderId}:`, error);
      return [];
    }
  }

  /**
   * Validate modification permissions
   */
  private async validateModificationPermissions(
    userId: string,
    orderId: string
  ): Promise<{ allowed: boolean; reason?: string }> {
    try {
      // Check user permissions, account status, etc.
      // For now, allow all modifications
      return { allowed: true };
    } catch (error) {
      logger.error(`Error validating modification permissions:`, error);
      return { allowed: false, reason: 'Permission validation failed' };
    }
  }
}