import { 
  ZerodhaOrderRequest, 
  ZerodhaOrder, 
  ZerodhaAPIResponse,
  ZERODHA_CONSTANTS 
} from '@tradeflow/types';
import { OrderValidationService } from './OrderValidationService';
import { DatabaseService } from './DatabaseService';
import { ZerodhaApiClient } from './ZerodhaApiClient';
import { OrderStatusService } from './OrderStatusService';
import { logger } from '../utils/logger';

export interface OrderPlacementResult {
  success: boolean;
  orderId?: string;
  order?: ZerodhaOrder;
  errors?: string[];
  warnings?: string[];
}

export class OrderPlacementService {
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
   * Place a new order
   */
  async placeOrder(
    userId: string,
    orderRequest: ZerodhaOrderRequest,
    accessToken: string
  ): Promise<OrderPlacementResult> {
    const startTime = Date.now();
    
    try {
      logger.info(`Placing order for user ${userId}:`, {
        symbol: orderRequest.tradingsymbol,
        exchange: orderRequest.exchange,
        type: orderRequest.transaction_type,
        quantity: orderRequest.quantity
      });

      // Step 1: Validate order parameters
      const validation = await this.validationService.validateOrder(orderRequest);
      if (!validation.valid) {
        logger.warn(`Order validation failed for user ${userId}:`, validation.errors);
        return {
          success: false,
          errors: validation.errors,
          warnings: validation.warnings
        };
      }

      // Step 2: Check user authentication and permissions
      const userCheck = await this.validateUserAccess(userId, accessToken);
      if (!userCheck.valid) {
        return {
          success: false,
          errors: userCheck.errors
        };
      }

      // Step 3: Apply risk checks (if risk service is available)
      const riskCheck = await this.performRiskChecks(userId, orderRequest);
      if (!riskCheck.valid) {
        return {
          success: false,
          errors: riskCheck.errors
        };
      }

      // Step 4: Submit order to Zerodha API
      const apiResponse = await this.submitOrderToZerodha(orderRequest, accessToken);
      if (!apiResponse.success) {
        logger.error(`Zerodha API order submission failed for user ${userId}:`, apiResponse.error);
        return {
          success: false,
          errors: [apiResponse.error || 'Order submission failed']
        };
      }

      // Step 5: Store order in database
      const orderData = await this.createOrderRecord(userId, orderRequest, apiResponse.data);
      
      // Step 6: Start order status monitoring
      this.statusService.startMonitoring(orderData.order_id, userId);

      const executionTime = Date.now() - startTime;
      logger.info(`Order placed successfully for user ${userId}:`, {
        orderId: orderData.order_id,
        executionTime: `${executionTime}ms`
      });

      return {
        success: true,
        orderId: orderData.order_id,
        order: orderData,
        warnings: validation.warnings
      };

    } catch (error) {
      const executionTime = Date.now() - startTime;
      logger.error(`Order placement error for user ${userId}:`, {
        error: error.message,
        executionTime: `${executionTime}ms`,
        orderRequest
      });

      return {
        success: false,
        errors: ['Internal error occurred while placing order']
      };
    }
  }

  /**
   * Place multiple orders in batch
   */
  async placeBatchOrders(
    userId: string,
    orders: ZerodhaOrderRequest[],
    accessToken: string
  ): Promise<OrderPlacementResult[]> {
    const results: OrderPlacementResult[] = [];
    
    logger.info(`Placing batch of ${orders.length} orders for user ${userId}`);

    // Process orders sequentially to respect rate limits
    for (let i = 0; i < orders.length; i++) {
      const order = orders[i];
      
      try {
        const result = await this.placeOrder(userId, order, accessToken);
        results.push(result);

        // Add small delay between orders to respect rate limits
        if (i < orders.length - 1) {
          await this.delay(100); // 100ms delay
        }

      } catch (error) {
        logger.error(`Batch order ${i} failed for user ${userId}:`, error);
        results.push({
          success: false,
          errors: [`Batch order ${i + 1} failed: ${error.message}`]
        });
      }
    }

    const successCount = results.filter(r => r.success).length;
    logger.info(`Batch order completion for user ${userId}: ${successCount}/${orders.length} successful`);

    return results;
  }

  /**
   * Validate user access and permissions
   */
  private async validateUserAccess(userId: string, accessToken: string): Promise<{valid: boolean, errors?: string[]}> {
    try {
      // Verify user exists and token is valid
      const user = await this.databaseService.getUserById(userId);
      if (!user) {
        return { valid: false, errors: ['User not found'] };
      }

      // Verify access token (this would typically involve JWT validation or API call)
      if (!accessToken || accessToken.trim().length === 0) {
        return { valid: false, errors: ['Access token is required'] };
      }

      // Additional checks could include:
      // - User account status
      // - Trading permissions
      // - KYC status
      // - Account balance/margin

      return { valid: true };

    } catch (error) {
      logger.error(`User access validation error for ${userId}:`, error);
      return { valid: false, errors: ['User validation failed'] };
    }
  }

  /**
   * Perform risk management checks
   */
  private async performRiskChecks(
    userId: string, 
    orderRequest: ZerodhaOrderRequest
  ): Promise<{valid: boolean, errors?: string[]}> {
    try {
      // This would integrate with the risk management service
      // For now, we'll implement basic checks

      const errors: string[] = [];

      // Check order value limits
      if (orderRequest.price && orderRequest.quantity) {
        const orderValue = orderRequest.price * orderRequest.quantity;
        const maxOrderValue = 1000000; // 10 lakh limit (configurable)
        
        if (orderValue > maxOrderValue) {
          errors.push(`Order value ₹${orderValue} exceeds maximum limit of ₹${maxOrderValue}`);
        }
      }

      // Check daily order count
      const todayOrderCount = await this.databaseService.getUserOrderCountToday(userId);
      const maxDailyOrders = 100; // Configurable limit
      
      if (todayOrderCount >= maxDailyOrders) {
        errors.push(`Daily order limit of ${maxDailyOrders} exceeded`);
      }

      return { valid: errors.length === 0, errors: errors.length > 0 ? errors : undefined };

    } catch (error) {
      logger.error(`Risk check error for user ${userId}:`, error);
      return { valid: false, errors: ['Risk validation failed'] };
    }
  }

  /**
   * Submit order to Zerodha API
   */
  private async submitOrderToZerodha(
    orderRequest: ZerodhaOrderRequest,
    accessToken: string
  ): Promise<{success: boolean, data?: any, error?: string}> {
    try {
      const response = await this.apiClient.placeOrder(orderRequest, accessToken);
      
      if (response.status === 'success' && response.data) {
        return { success: true, data: response.data };
      } else {
        return { 
          success: false, 
          error: response.message || 'Order submission failed' 
        };
      }

    } catch (error) {
      logger.error('Zerodha API submission error:', error);
      
      // Handle specific API errors
      if (error.response?.data?.error_type) {
        return { 
          success: false, 
          error: error.response.data.message || 'API error occurred' 
        };
      }

      return { 
        success: false, 
        error: 'Network error or API unavailable' 
      };
    }
  }

  /**
   * Create order record in database
   */
  private async createOrderRecord(
    userId: string,
    orderRequest: ZerodhaOrderRequest,
    apiResponse: any
  ): Promise<ZerodhaOrder> {
    const orderData: Partial<ZerodhaOrder> = {
      order_id: apiResponse.order_id,
      account_id: userId,
      placed_by: userId,
      exchange: orderRequest.exchange,
      tradingsymbol: orderRequest.tradingsymbol,
      transaction_type: orderRequest.transaction_type,
      quantity: orderRequest.quantity,
      product: orderRequest.product,
      order_type: orderRequest.order_type,
      price: orderRequest.price || 0,
      trigger_price: orderRequest.trigger_price || 0,
      validity: orderRequest.validity || 'DAY',
      disclosed_quantity: orderRequest.disclosed_quantity || 0,
      status: 'OPEN',
      order_timestamp: new Date().toISOString(),
      filled_quantity: 0,
      pending_quantity: orderRequest.quantity,
      cancelled_quantity: 0,
      average_price: 0,
      tag: orderRequest.tag,
      guid: this.generateGuid()
    };

    return await this.databaseService.createOrder(orderData);
  }

  /**
   * Generate unique identifier for order
   */
  private generateGuid(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  /**
   * Utility function to add delay
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get order placement statistics
   */
  async getOrderStats(userId: string, timeframe: 'today' | 'week' | 'month' = 'today'): Promise<any> {
    try {
      return await this.databaseService.getOrderStats(userId, timeframe);
    } catch (error) {
      logger.error(`Error fetching order stats for user ${userId}:`, error);
      throw error;
    }
  }
}