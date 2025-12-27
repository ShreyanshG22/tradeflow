import { 
  ZerodhaOrderRequest, 
  ZERODHA_CONSTANTS, 
  ZerodhaUtils 
} from '@tradeflow/types';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings?: string[];
}

export class ZerodhaValidators {
  /**
   * Validate order request parameters
   */
  static validateOrderRequest(order: Partial<ZerodhaOrderRequest>): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Required fields validation
    if (!order.exchange) {
      errors.push('Exchange is required');
    } else if (!Object.values(ZERODHA_CONSTANTS.EXCHANGES).includes(order.exchange as any)) {
      errors.push(`Invalid exchange: ${order.exchange}`);
    }

    if (!order.tradingsymbol) {
      errors.push('Trading symbol is required');
    } else if (typeof order.tradingsymbol !== 'string' || order.tradingsymbol.trim().length === 0) {
      errors.push('Trading symbol must be a non-empty string');
    }

    if (!order.transaction_type) {
      errors.push('Transaction type is required');
    } else if (!Object.values(ZERODHA_CONSTANTS.TRANSACTION_TYPES).includes(order.transaction_type as any)) {
      errors.push(`Invalid transaction type: ${order.transaction_type}`);
    }

    if (!order.quantity) {
      errors.push('Quantity is required');
    } else if (typeof order.quantity !== 'number' || order.quantity <= 0) {
      errors.push('Quantity must be a positive number');
    }

    if (!order.product) {
      errors.push('Product type is required');
    } else if (!Object.values(ZERODHA_CONSTANTS.PRODUCTS).includes(order.product as any)) {
      errors.push(`Invalid product type: ${order.product}`);
    }

    if (!order.order_type) {
      errors.push('Order type is required');
    } else if (!Object.values(ZERODHA_CONSTANTS.ORDER_TYPES).includes(order.order_type as any)) {
      errors.push(`Invalid order type: ${order.order_type}`);
    }

    // Price validation for LIMIT and SL orders
    if (order.order_type === 'LIMIT' || order.order_type === 'SL') {
      if (!order.price || order.price <= 0) {
        errors.push('Price is required for LIMIT and SL orders');
      }
    }

    // Trigger price validation for SL orders
    if (order.order_type === 'SL' || order.order_type === 'SL-M') {
      if (!order.trigger_price || order.trigger_price <= 0) {
        errors.push('Trigger price is required for SL orders');
      }
    }

    // Validity validation
    if (order.validity && !Object.values(ZERODHA_CONSTANTS.VALIDITY).includes(order.validity as any)) {
      errors.push(`Invalid validity: ${order.validity}`);
    }

    // Logical validations
    if (order.order_type === 'SL' && order.price && order.trigger_price) {
      if (order.transaction_type === 'BUY' && order.trigger_price <= order.price) {
        warnings.push('For BUY SL orders, trigger price should be higher than price');
      }
      if (order.transaction_type === 'SELL' && order.trigger_price >= order.price) {
        warnings.push('For SELL SL orders, trigger price should be lower than price');
      }
    }

    // Disclosed quantity validation
    if (order.disclosed_quantity && order.quantity) {
      if (order.disclosed_quantity > order.quantity) {
        errors.push('Disclosed quantity cannot be greater than total quantity');
      }
      if (order.disclosed_quantity <= 0) {
        errors.push('Disclosed quantity must be positive');
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  }

  /**
   * Validate trading symbol format
   */
  static validateTradingSymbol(symbol: string, exchange?: string): ValidationResult {
    const errors: string[] = [];

    if (!symbol || typeof symbol !== 'string') {
      errors.push('Trading symbol must be a non-empty string');
      return { valid: false, errors };
    }

    const trimmedSymbol = symbol.trim();
    if (trimmedSymbol.length === 0) {
      errors.push('Trading symbol cannot be empty');
    }

    // Basic format validation
    if (!/^[A-Z0-9\-&]+$/.test(trimmedSymbol)) {
      errors.push('Trading symbol contains invalid characters');
    }

    // Length validation
    if (trimmedSymbol.length > 20) {
      errors.push('Trading symbol is too long (max 20 characters)');
    }

    // Exchange-specific validations
    if (exchange) {
      if (exchange === 'NSE' || exchange === 'BSE') {
        // Equity symbols should not contain special characters except hyphen
        if (!/^[A-Z0-9\-]+$/.test(trimmedSymbol)) {
          errors.push(`Invalid equity symbol format for ${exchange}`);
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Validate price and quantity values
   */
  static validatePriceQuantity(price?: number, quantity?: number, tickSize?: number): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (price !== undefined) {
      if (typeof price !== 'number' || price <= 0) {
        errors.push('Price must be a positive number');
      } else if (tickSize && price % tickSize !== 0) {
        warnings.push(`Price ${price} is not aligned with tick size ${tickSize}`);
      }
    }

    if (quantity !== undefined) {
      if (typeof quantity !== 'number' || quantity <= 0) {
        errors.push('Quantity must be a positive number');
      } else if (quantity % 1 !== 0) {
        errors.push('Quantity must be a whole number');
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  }

  /**
   * Validate instrument token
   */
  static validateInstrumentToken(token: any): ValidationResult {
    const errors: string[] = [];

    if (token === undefined || token === null) {
      errors.push('Instrument token is required');
    } else if (typeof token !== 'number') {
      errors.push('Instrument token must be a number');
    } else if (token <= 0) {
      errors.push('Instrument token must be positive');
    } else if (!Number.isInteger(token)) {
      errors.push('Instrument token must be an integer');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Validate date range for historical data
   */
  static validateDateRange(fromDate: Date, toDate: Date): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!(fromDate instanceof Date) || isNaN(fromDate.getTime())) {
      errors.push('From date must be a valid Date object');
    }

    if (!(toDate instanceof Date) || isNaN(toDate.getTime())) {
      errors.push('To date must be a valid Date object');
    }

    if (errors.length === 0) {
      if (fromDate >= toDate) {
        errors.push('From date must be before to date');
      }

      const now = new Date();
      if (toDate > now) {
        warnings.push('To date is in the future');
      }

      const daysDiff = Math.ceil((toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24));
      if (daysDiff > 365) {
        warnings.push('Date range exceeds 1 year, consider breaking into smaller chunks');
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  }

  /**
   * Validate WebSocket subscription parameters
   */
  static validateWebSocketSubscription(tokens: number[], mode?: string): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!Array.isArray(tokens)) {
      errors.push('Tokens must be an array');
      return { valid: false, errors };
    }

    if (tokens.length === 0) {
      errors.push('At least one instrument token is required');
    }

    if (tokens.length > 3000) {
      errors.push('Maximum 3000 instruments can be subscribed at once');
    }

    // Validate each token
    tokens.forEach((token, index) => {
      const tokenValidation = this.validateInstrumentToken(token);
      if (!tokenValidation.valid) {
        errors.push(`Token at index ${index}: ${tokenValidation.errors.join(', ')}`);
      }
    });

    // Check for duplicates
    const uniqueTokens = new Set(tokens);
    if (uniqueTokens.size !== tokens.length) {
      warnings.push('Duplicate instrument tokens found');
    }

    // Validate mode
    if (mode && !Object.values(ZERODHA_CONSTANTS.WS_MODES).includes(mode as any)) {
      errors.push(`Invalid WebSocket mode: ${mode}`);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  }

  /**
   * Validate API credentials
   */
  static validateCredentials(apiKey?: string, apiSecret?: string, accessToken?: string): ValidationResult {
    const errors: string[] = [];

    if (!apiKey || typeof apiKey !== 'string' || apiKey.trim().length === 0) {
      errors.push('API key is required and must be a non-empty string');
    }

    if (apiSecret !== undefined && (typeof apiSecret !== 'string' || apiSecret.trim().length === 0)) {
      errors.push('API secret must be a non-empty string if provided');
    }

    if (accessToken !== undefined && (typeof accessToken !== 'string' || accessToken.trim().length === 0)) {
      errors.push('Access token must be a non-empty string if provided');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Validate market timing
   */
  static validateMarketTiming(exchange: string = 'NSE'): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!Object.values(ZERODHA_CONSTANTS.EXCHANGES).includes(exchange as any)) {
      errors.push(`Invalid exchange: ${exchange}`);
      return { valid: false, errors };
    }

    const isMarketOpen = ZerodhaUtils.isMarketOpen(exchange as 'NSE' | 'BSE');
    const isPreMarketOpen = ZerodhaUtils.isPreMarketOpen(exchange as 'NSE' | 'BSE');

    if (!isMarketOpen && !isPreMarketOpen) {
      warnings.push(`Market is currently closed for ${exchange}`);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  }
}

// Convenience functions
export const validateOrder = (order: Partial<ZerodhaOrderRequest>) => 
  ZerodhaValidators.validateOrderRequest(order);

export const validateSymbol = (symbol: string, exchange?: string) => 
  ZerodhaValidators.validateTradingSymbol(symbol, exchange);

export const validateToken = (token: any) => 
  ZerodhaValidators.validateInstrumentToken(token);

export const validateDateRange = (fromDate: Date, toDate: Date) => 
  ZerodhaValidators.validateDateRange(fromDate, toDate);

export const validateCredentials = (apiKey?: string, apiSecret?: string, accessToken?: string) => 
  ZerodhaValidators.validateCredentials(apiKey, apiSecret, accessToken);