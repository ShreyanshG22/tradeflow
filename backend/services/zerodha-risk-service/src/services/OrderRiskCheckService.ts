import { Pool } from 'pg';
import { RiskCheckResult, MarginRequirement, RiskLimits } from '../types/riskTypes';
import { RiskLimitConfigService } from './RiskLimitConfigService';
import { logger } from '../utils/logger';

interface OrderRequest {
  user_id: string;
  exchange: string;
  tradingsymbol: string;
  transaction_type: 'BUY' | 'SELL';
  quantity: number;
  product: string;
  order_type: string;
  price?: number;
  trigger_price?: number;
}

interface Position {
  tradingsymbol: string;
  exchange: string;
  quantity: number;
  average_price: number;
  last_price: number;
}

export class OrderRiskCheckService {
  private db: Pool;
  private riskLimitService: RiskLimitConfigService;

  constructor(db: Pool, riskLimitService: RiskLimitConfigService) {
    this.db = db;
    this.riskLimitService = riskLimitService;
  }

  /**
   * Perform comprehensive pre-order risk validation
   */
  async validateOrder(orderRequest: OrderRequest): Promise<RiskCheckResult> {
    try {
      const riskLimits = await this.riskLimitService.getEffectiveRiskLimits(orderRequest.user_id);
      const warnings: string[] = [];

      // Check trading hours
      const tradingHoursCheck = this.checkTradingHours(riskLimits);
      if (!tradingHoursCheck.allowed) {
        return tradingHoursCheck;
      }

      // Check allowed products and exchanges
      const productExchangeCheck = this.checkProductAndExchange(orderRequest, riskLimits);
      if (!productExchangeCheck.allowed) {
        return productExchangeCheck;
      }

      // Check blocked instruments
      const blockedInstrumentCheck = this.checkBlockedInstruments(orderRequest, riskLimits);
      if (!blockedInstrumentCheck.allowed) {
        return blockedInstrumentCheck;
      }

      // Check order value limit
      const orderValueCheck = await this.checkOrderValueLimit(orderRequest, riskLimits);
      if (!orderValueCheck.allowed) {
        return orderValueCheck;
      }
      warnings.push(...orderValueCheck.warnings);

      // Check position size limit
      const positionSizeCheck = await this.checkPositionSizeLimit(orderRequest, riskLimits);
      if (!positionSizeCheck.allowed) {
        return positionSizeCheck;
      }
      warnings.push(...positionSizeCheck.warnings);

      // Check order frequency limit
      const frequencyCheck = await this.checkOrderFrequency(orderRequest.user_id, riskLimits);
      if (!frequencyCheck.allowed) {
        return frequencyCheck;
      }
      warnings.push(...frequencyCheck.warnings);

      // Check margin requirements
      const marginCheck = await this.checkMarginRequirements(orderRequest, riskLimits);
      if (!marginCheck.allowed) {
        return marginCheck;
      }
      warnings.push(...marginCheck.warnings);

      return {
        allowed: true,
        message: 'Order passed all risk checks',
        warnings
      };

    } catch (error) {
      logger.error('Error in order risk validation:', error);
      return {
        allowed: false,
        message: 'Risk validation failed due to system error',
        warnings: []
      };
    }
  }

  /**
   * Check if current time is within trading hours
   */
  private checkTradingHours(riskLimits: RiskLimits): RiskCheckResult {
    const now = new Date();
    const currentTime = now.toTimeString().slice(0, 5); // HH:MM format
    
    const startTime = riskLimits.trading_hours_start;
    const endTime = riskLimits.trading_hours_end;

    if (currentTime < startTime || currentTime > endTime) {
      return {
        allowed: false,
        message: `Trading not allowed outside market hours (${startTime} - ${endTime})`,
        warnings: []
      };
    }

    return {
      allowed: true,
      message: 'Trading hours check passed',
      warnings: []
    };
  }

  /**
   * Check if product and exchange are allowed
   */
  private checkProductAndExchange(orderRequest: OrderRequest, riskLimits: RiskLimits): RiskCheckResult {
    // Check allowed exchanges
    if (!riskLimits.allowed_exchanges.includes(orderRequest.exchange)) {
      return {
        allowed: false,
        message: `Exchange ${orderRequest.exchange} is not allowed`,
        warnings: []
      };
    }

    // Check allowed products
    if (!riskLimits.allowed_products.includes(orderRequest.product)) {
      return {
        allowed: false,
        message: `Product ${orderRequest.product} is not allowed`,
        warnings: []
      };
    }

    return {
      allowed: true,
      message: 'Product and exchange check passed',
      warnings: []
    };
  }

  /**
   * Check if instrument is blocked
   */
  private checkBlockedInstruments(orderRequest: OrderRequest, riskLimits: RiskLimits): RiskCheckResult {
    const instrumentKey = `${orderRequest.exchange}:${orderRequest.tradingsymbol}`;
    
    if (riskLimits.blocked_instruments.includes(instrumentKey) || 
        riskLimits.blocked_instruments.includes(orderRequest.tradingsymbol)) {
      return {
        allowed: false,
        message: `Instrument ${orderRequest.tradingsymbol} is blocked`,
        warnings: []
      };
    }

    return {
      allowed: true,
      message: 'Blocked instruments check passed',
      warnings: []
    };
  }

  /**
   * Check order value against maximum limit
   */
  private async checkOrderValueLimit(orderRequest: OrderRequest, riskLimits: RiskLimits): Promise<RiskCheckResult> {
    try {
      let orderValue: number;

      if (orderRequest.order_type === 'MARKET') {
        // For market orders, get last traded price
        const lastPrice = await this.getLastTradedPrice(orderRequest.exchange, orderRequest.tradingsymbol);
        orderValue = lastPrice * orderRequest.quantity;
      } else {
        // For limit orders, use the specified price
        orderValue = (orderRequest.price || 0) * orderRequest.quantity;
      }

      const warnings: string[] = [];
      
      if (orderValue > riskLimits.max_order_value) {
        return {
          allowed: false,
          breach_type: 'ORDER_VALUE',
          message: `Order value ₹${orderValue.toFixed(2)} exceeds maximum limit of ₹${riskLimits.max_order_value.toFixed(2)}`,
          current_value: orderValue,
          limit_value: riskLimits.max_order_value,
          warnings: []
        };
      }

      // Warning if order value is close to limit (90% threshold)
      if (orderValue > riskLimits.max_order_value * 0.9) {
        warnings.push(`Order value is ${((orderValue / riskLimits.max_order_value) * 100).toFixed(1)}% of maximum limit`);
      }

      return {
        allowed: true,
        message: 'Order value check passed',
        current_value: orderValue,
        limit_value: riskLimits.max_order_value,
        warnings
      };

    } catch (error) {
      logger.error('Error checking order value limit:', error);
      return {
        allowed: false,
        message: 'Unable to validate order value',
        warnings: []
      };
    }
  }

  /**
   * Check position size after order execution
   */
  private async checkPositionSizeLimit(orderRequest: OrderRequest, riskLimits: RiskLimits): Promise<RiskCheckResult> {
    try {
      const currentPosition = await this.getCurrentPosition(
        orderRequest.user_id, 
        orderRequest.exchange, 
        orderRequest.tradingsymbol
      );

      let newQuantity = currentPosition?.quantity || 0;
      
      // Calculate new position after order
      if (orderRequest.transaction_type === 'BUY') {
        newQuantity += orderRequest.quantity;
      } else {
        newQuantity -= orderRequest.quantity;
      }

      // Get current market price for position value calculation
      const currentPrice = await this.getLastTradedPrice(orderRequest.exchange, orderRequest.tradingsymbol);
      const newPositionValue = Math.abs(newQuantity) * currentPrice;

      const warnings: string[] = [];

      if (newPositionValue > riskLimits.max_position_size) {
        return {
          allowed: false,
          breach_type: 'POSITION_SIZE',
          message: `Position value ₹${newPositionValue.toFixed(2)} would exceed maximum limit of ₹${riskLimits.max_position_size.toFixed(2)}`,
          current_value: newPositionValue,
          limit_value: riskLimits.max_position_size,
          warnings: []
        };
      }

      // Warning if position size is close to limit (90% threshold)
      if (newPositionValue > riskLimits.max_position_size * 0.9) {
        warnings.push(`Position size would be ${((newPositionValue / riskLimits.max_position_size) * 100).toFixed(1)}% of maximum limit`);
      }

      return {
        allowed: true,
        message: 'Position size check passed',
        current_value: newPositionValue,
        limit_value: riskLimits.max_position_size,
        warnings
      };

    } catch (error) {
      logger.error('Error checking position size limit:', error);
      return {
        allowed: false,
        message: 'Unable to validate position size',
        warnings: []
      };
    }
  }

  /**
   * Check order frequency limits
   */
  private async checkOrderFrequency(userId: string, riskLimits: RiskLimits): Promise<RiskCheckResult> {
    try {
      const oneMinuteAgo = new Date(Date.now() - 60 * 1000);
      
      const query = `
        SELECT COUNT(*) as order_count
        FROM zerodha_orders 
        WHERE user_id = $1 AND order_timestamp > $2
      `;
      
      const result = await this.db.query(query, [userId, oneMinuteAgo]);
      const orderCount = parseInt(result.rows[0].order_count);

      const warnings: string[] = [];

      if (orderCount >= riskLimits.max_orders_per_minute) {
        return {
          allowed: false,
          breach_type: 'ORDER_FREQUENCY',
          message: `Order frequency limit exceeded: ${orderCount} orders in last minute (limit: ${riskLimits.max_orders_per_minute})`,
          current_value: orderCount,
          limit_value: riskLimits.max_orders_per_minute,
          warnings: []
        };
      }

      // Warning if close to frequency limit (80% threshold)
      if (orderCount >= riskLimits.max_orders_per_minute * 0.8) {
        warnings.push(`Order frequency is ${orderCount}/${riskLimits.max_orders_per_minute} per minute`);
      }

      return {
        allowed: true,
        message: 'Order frequency check passed',
        current_value: orderCount,
        limit_value: riskLimits.max_orders_per_minute,
        warnings
      };

    } catch (error) {
      logger.error('Error checking order frequency:', error);
      return {
        allowed: false,
        message: 'Unable to validate order frequency',
        warnings: []
      };
    }
  }

  /**
   * Check margin requirements
   */
  private async checkMarginRequirements(orderRequest: OrderRequest, riskLimits: RiskLimits): Promise<RiskCheckResult> {
    try {
      const marginRequirement = await this.calculateMarginRequirement(orderRequest, riskLimits);
      
      if (!marginRequirement.is_sufficient) {
        return {
          allowed: false,
          breach_type: 'MARGIN',
          message: `Insufficient margin: Required ₹${marginRequirement.margin_required.toFixed(2)}, Available ₹${marginRequirement.available_margin.toFixed(2)}`,
          current_value: marginRequirement.available_margin,
          limit_value: marginRequirement.margin_required,
          warnings: []
        };
      }

      const warnings: string[] = [];
      const marginUtilization = marginRequirement.margin_required / marginRequirement.available_margin;
      
      // Warning if margin utilization is high (80% threshold)
      if (marginUtilization > 0.8) {
        warnings.push(`High margin utilization: ${(marginUtilization * 100).toFixed(1)}%`);
      }

      return {
        allowed: true,
        message: 'Margin requirement check passed',
        warnings
      };

    } catch (error) {
      logger.error('Error checking margin requirements:', error);
      return {
        allowed: false,
        message: 'Unable to validate margin requirements',
        warnings: []
      };
    }
  }

  /**
   * Calculate margin requirement for an order
   */
  private async calculateMarginRequirement(orderRequest: OrderRequest, riskLimits: RiskLimits): Promise<MarginRequirement> {
    // Get current market price
    const price = orderRequest.price || await this.getLastTradedPrice(orderRequest.exchange, orderRequest.tradingsymbol);
    
    // Basic margin calculation (simplified)
    let marginRequired = 0;
    
    if (orderRequest.product === 'MIS') {
      // Intraday: typically 20-30% of order value
      marginRequired = price * orderRequest.quantity * 0.25;
    } else if (orderRequest.product === 'NRML') {
      // F&O: varies by instrument, using 15% as default
      marginRequired = price * orderRequest.quantity * 0.15;
    } else {
      // CNC: 100% for buy orders, 0% for sell orders (if holding exists)
      if (orderRequest.transaction_type === 'BUY') {
        marginRequired = price * orderRequest.quantity;
      } else {
        marginRequired = 0; // Assuming sufficient holdings for sell
      }
    }

    // Apply margin multiplier from risk limits
    marginRequired *= riskLimits.margin_multiplier;

    // Get available margin (mock implementation)
    const availableMargin = await this.getAvailableMargin(orderRequest.user_id);

    return {
      instrument: `${orderRequest.exchange}:${orderRequest.tradingsymbol}`,
      quantity: orderRequest.quantity,
      price,
      margin_required: marginRequired,
      available_margin: availableMargin,
      is_sufficient: availableMargin >= marginRequired
    };
  }

  /**
   * Get last traded price for an instrument
   */
  private async getLastTradedPrice(exchange: string, tradingsymbol: string): Promise<number> {
    // This would typically call the market data service
    // For now, returning a mock price
    return 100; // Mock price
  }

  /**
   * Get current position for a user and instrument
   */
  private async getCurrentPosition(userId: string, exchange: string, tradingsymbol: string): Promise<Position | null> {
    try {
      const query = `
        SELECT * FROM zerodha_positions 
        WHERE user_id = $1 AND exchange = $2 AND tradingsymbol = $3
        AND position_date = CURRENT_DATE
      `;
      
      const result = await this.db.query(query, [userId, exchange, tradingsymbol]);
      
      if (result.rows.length === 0) {
        return null;
      }

      return result.rows[0];
    } catch (error) {
      logger.error('Error fetching current position:', error);
      return null;
    }
  }

  /**
   * Get available margin for a user
   */
  private async getAvailableMargin(userId: string): Promise<number> {
    // This would typically call the portfolio service to get margin data
    // For now, returning a mock value
    return 100000; // Mock available margin
  }
}