import { 
  ZerodhaOrderRequest, 
  ZerodhaInstrument,
  ZERODHA_CONSTANTS,
  MARKET_UTILS,
  ZerodhaUtils
} from '@tradeflow/types';
import { ZerodhaValidators, ValidationResult } from '@tradeflow/zerodha-utils';
import { InstrumentService } from './InstrumentService';
import { logger } from '../utils/logger';

export interface OrderValidationContext {
  instrument?: ZerodhaInstrument;
  userMargins?: any;
  existingPositions?: any[];
  riskLimits?: any;
}

export interface ExtendedValidationResult extends ValidationResult {
  context?: OrderValidationContext;
}

export class OrderValidationService {
  private instrumentService: InstrumentService;

  constructor() {
    this.instrumentService = new InstrumentService();
  }

  /**
   * Comprehensive order validation including exchange rules
   */
  async validateOrder(
    order: Partial<ZerodhaOrderRequest>, 
    context?: OrderValidationContext
  ): Promise<ExtendedValidationResult> {
    try {
      const errors: string[] = [];
      const warnings: string[] = [];

      // Basic parameter validation
      const basicValidation = ZerodhaValidators.validateOrderRequest(order);
      errors.push(...basicValidation.errors);
      if (basicValidation.warnings) {
        warnings.push(...basicValidation.warnings);
      }

      if (errors.length > 0) {
        return { valid: false, errors, warnings };
      }

      // Get instrument details for advanced validation
      let instrument = context?.instrument;
      if (!instrument && order.tradingsymbol && order.exchange) {
        try {
          instrument = await this.instrumentService.getInstrument(
            order.tradingsymbol, 
            order.exchange
          );
        } catch (error) {
          errors.push(`Instrument not found: ${order.tradingsymbol} on ${order.exchange}`);
          return { valid: false, errors, warnings };
        }
      }

      // Exchange-specific validations
      if (instrument) {
        const exchangeValidation = this.validateExchangeRules(order, instrument);
        errors.push(...exchangeValidation.errors);
        if (exchangeValidation.warnings) {
          warnings.push(...exchangeValidation.warnings);
        }

        // Lot size validation
        const lotSizeValidation = this.validateLotSize(order, instrument);
        errors.push(...lotSizeValidation.errors);
        if (lotSizeValidation.warnings) {
          warnings.push(...lotSizeValidation.warnings);
        }

        // Tick size validation
        const tickSizeValidation = this.validateTickSize(order, instrument);
        errors.push(...tickSizeValidation.errors);
        if (tickSizeValidation.warnings) {
          warnings.push(...tickSizeValidation.warnings);
        }
      }

      // Market timing validation
      const marketValidation = this.validateMarketTiming(order);
      if (marketValidation.warnings) {
        warnings.push(...marketValidation.warnings);
      }

      // Product-specific validations
      const productValidation = this.validateProductRules(order);
      errors.push(...productValidation.errors);
      if (productValidation.warnings) {
        warnings.push(...productValidation.warnings);
      }

      return {
        valid: errors.length === 0,
        errors,
        warnings: warnings.length > 0 ? warnings : undefined,
        context: { ...context, instrument }
      };

    } catch (error) {
      logger.error('Order validation error:', error);
      return {
        valid: false,
        errors: ['Internal validation error occurred']
      };
    }
  }

  /**
   * Validate exchange-specific rules
   */
  private validateExchangeRules(
    order: Partial<ZerodhaOrderRequest>, 
    instrument: ZerodhaInstrument
  ): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // NSE/BSE specific rules
    if (order.exchange === 'NSE' || order.exchange === 'BSE') {
      // Equity segment validations
      if (instrument.segment === 'EQ') {
        // CNC product validation for delivery
        if (order.product === 'CNC' && order.transaction_type === 'SELL') {
          warnings.push('Ensure you have sufficient holdings for CNC SELL order');
        }

        // MIS product validation for intraday
        if (order.product === 'MIS') {
          warnings.push('MIS orders will be auto-squared off before market close');
        }

        // Price band validation (basic check)
        if (order.price && instrument.last_price) {
          const priceVariation = Math.abs(order.price - instrument.last_price) / instrument.last_price * 100;
          if (priceVariation > 20) {
            warnings.push(`Order price varies by ${priceVariation.toFixed(2)}% from last traded price`);
          }
        }
      }

      // F&O segment validations
      if (instrument.segment === 'FO') {
        if (order.product === 'CNC') {
          errors.push('CNC product not allowed for F&O instruments');
        }

        // Expiry validation for options/futures
        if (instrument.expiry) {
          const expiryDate = new Date(instrument.expiry);
          const today = new Date();
          if (expiryDate <= today) {
            errors.push('Cannot place order on expired instrument');
          }
        }
      }
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  /**
   * Validate lot size requirements
   */
  private validateLotSize(
    order: Partial<ZerodhaOrderRequest>, 
    instrument: ZerodhaInstrument
  ): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!order.quantity || !instrument.lot_size) {
      return { valid: true, errors, warnings };
    }

    // For F&O instruments, quantity must be in multiples of lot size
    if (instrument.segment === 'FO' && instrument.lot_size > 1) {
      if (order.quantity % instrument.lot_size !== 0) {
        errors.push(
          `Quantity ${order.quantity} must be in multiples of lot size ${instrument.lot_size}`
        );
      }
    }

    // For equity, check if quantity is reasonable
    if (instrument.segment === 'EQ') {
      if (order.quantity > 10000) {
        warnings.push('Large quantity order - ensure sufficient funds/holdings');
      }
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  /**
   * Validate tick size requirements
   */
  private validateTickSize(
    order: Partial<ZerodhaOrderRequest>, 
    instrument: ZerodhaInstrument
  ): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!order.price || !instrument.tick_size) {
      return { valid: true, errors, warnings };
    }

    // Check if price is aligned with tick size
    const remainder = order.price % instrument.tick_size;
    if (Math.abs(remainder) > 0.001) { // Allow for floating point precision
      errors.push(
        `Price ${order.price} must be in multiples of tick size ${instrument.tick_size}`
      );
    }

    // Validate trigger price for SL orders
    if (order.trigger_price && (order.order_type === 'SL' || order.order_type === 'SL-M')) {
      const triggerRemainder = order.trigger_price % instrument.tick_size;
      if (Math.abs(triggerRemainder) > 0.001) {
        errors.push(
          `Trigger price ${order.trigger_price} must be in multiples of tick size ${instrument.tick_size}`
        );
      }
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  /**
   * Validate market timing
   */
  private validateMarketTiming(order: Partial<ZerodhaOrderRequest>): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!order.exchange) {
      return { valid: true, errors, warnings };
    }

    const exchange = order.exchange as 'NSE' | 'BSE';
    const isMarketOpen = ZerodhaUtils.isMarketOpen(exchange);
    const isPreMarketOpen = ZerodhaUtils.isPreMarketOpen(exchange);

    if (!isMarketOpen && !isPreMarketOpen) {
      // Allow AMO (After Market Orders)
      warnings.push(`Market is closed. Order will be queued as AMO for next trading session`);
    } else if (isPreMarketOpen) {
      warnings.push('Market is in pre-open session. Order may have limited execution');
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  /**
   * Validate product-specific rules
   */
  private validateProductRules(order: Partial<ZerodhaOrderRequest>): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!order.product) {
      return { valid: true, errors, warnings };
    }

    switch (order.product) {
      case 'MIS':
        // Intraday product validations
        if (order.validity === 'IOC') {
          warnings.push('IOC validity with MIS product may result in immediate cancellation');
        }
        warnings.push('MIS orders will be auto-squared off before market close');
        break;

      case 'CNC':
        // Delivery product validations
        if (order.transaction_type === 'SELL') {
          warnings.push('Ensure sufficient holdings for CNC SELL orders');
        }
        break;

      case 'NRML':
        // Normal product for F&O
        warnings.push('NRML positions will be carried forward and may require margin');
        break;
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  /**
   * Validate order modification parameters
   */
  async validateOrderModification(
    orderId: string,
    modifications: Partial<ZerodhaOrderRequest>,
    existingOrder?: any
  ): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!orderId) {
      errors.push('Order ID is required for modification');
    }

    if (!existingOrder) {
      errors.push('Existing order details not found');
      return { valid: false, errors };
    }

    // Check if order can be modified
    if (existingOrder.status !== 'OPEN') {
      errors.push(`Cannot modify order with status: ${existingOrder.status}`);
    }

    // Validate modification parameters
    if (modifications.quantity !== undefined) {
      if (modifications.quantity <= existingOrder.filled_quantity) {
        errors.push('New quantity cannot be less than or equal to filled quantity');
      }
    }

    if (modifications.price !== undefined) {
      if (modifications.price <= 0) {
        errors.push('Modified price must be positive');
      }
    }

    if (modifications.trigger_price !== undefined) {
      if (modifications.trigger_price <= 0) {
        errors.push('Modified trigger price must be positive');
      }
    }

    // Validate that only modifiable fields are being changed
    const modifiableFields = ['quantity', 'price', 'trigger_price', 'order_type', 'validity'];
    const invalidFields = Object.keys(modifications).filter(
      field => !modifiableFields.includes(field)
    );

    if (invalidFields.length > 0) {
      errors.push(`Cannot modify fields: ${invalidFields.join(', ')}`);
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  /**
   * Validate order cancellation
   */
  validateOrderCancellation(orderId: string, existingOrder?: any): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!orderId) {
      errors.push('Order ID is required for cancellation');
    }

    if (!existingOrder) {
      errors.push('Existing order details not found');
      return { valid: false, errors };
    }

    // Check if order can be cancelled
    const cancellableStatuses = ['OPEN', 'TRIGGER_PENDING'];
    if (!cancellableStatuses.includes(existingOrder.status)) {
      errors.push(`Cannot cancel order with status: ${existingOrder.status}`);
    }

    if (existingOrder.filled_quantity > 0) {
      warnings.push('Order is partially filled. Only pending quantity will be cancelled');
    }

    return { valid: errors.length === 0, errors, warnings };
  }
}