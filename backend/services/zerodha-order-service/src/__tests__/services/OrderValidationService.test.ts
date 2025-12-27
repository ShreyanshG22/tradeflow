import { OrderValidationService } from '../../services/OrderValidationService';
import { ZerodhaOrderRequest, ZerodhaInstrument } from '@tradeflow/types';

// Mock dependencies
jest.mock('../../services/InstrumentService');
jest.mock('../../utils/logger');

describe('OrderValidationService', () => {
  let validationService: OrderValidationService;
  let mockInstrumentService: any;

  beforeEach(() => {
    validationService = new OrderValidationService();
    mockInstrumentService = require('../../services/InstrumentService').InstrumentService;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('validateOrder', () => {
    const validOrderRequest: ZerodhaOrderRequest = {
      exchange: 'NSE',
      tradingsymbol: 'RELIANCE',
      transaction_type: 'BUY',
      quantity: 10,
      product: 'CNC',
      order_type: 'LIMIT',
      price: 2500,
      validity: 'DAY'
    };

    const mockInstrument: ZerodhaInstrument = {
      instrument_token: 738561,
      exchange_token: 2885,
      tradingsymbol: 'RELIANCE',
      name: 'Reliance Industries Limited',
      last_price: 2500,
      tick_size: 0.05,
      lot_size: 1,
      instrument_type: 'EQ',
      segment: 'EQ',
      exchange: 'NSE'
    };

    it('should validate a correct order request', async () => {
      mockInstrumentService.prototype.getInstrument = jest.fn().mockResolvedValue(mockInstrument);

      const result = await validationService.validateOrder(validOrderRequest);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject order with missing required fields', async () => {
      const invalidOrder = { ...validOrderRequest };
      delete invalidOrder.exchange;

      const result = await validationService.validateOrder(invalidOrder);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Exchange is required');
    });

    it('should reject order with invalid exchange', async () => {
      const invalidOrder = { ...validOrderRequest, exchange: 'INVALID' as any };

      const result = await validationService.validateOrder(invalidOrder);

      expect(result.valid).toBe(false);
      expect(result.errors.some(error => error.includes('Invalid exchange'))).toBe(true);
    });

    it('should reject order with invalid quantity', async () => {
      const invalidOrder = { ...validOrderRequest, quantity: -5 };

      const result = await validationService.validateOrder(invalidOrder);

      expect(result.valid).toBe(false);
      expect(result.errors.some(error => error.includes('positive number'))).toBe(true);
    });

    it('should require price for LIMIT orders', async () => {
      const invalidOrder = { ...validOrderRequest };
      delete invalidOrder.price;

      const result = await validationService.validateOrder(invalidOrder);

      expect(result.valid).toBe(false);
      expect(result.errors.some(error => error.includes('Price is required'))).toBe(true);
    });

    it('should require trigger price for SL orders', async () => {
      const slOrder = { 
        ...validOrderRequest, 
        order_type: 'SL' as any,
        trigger_price: undefined
      };

      const result = await validationService.validateOrder(slOrder);

      expect(result.valid).toBe(false);
      expect(result.errors.some(error => error.includes('Trigger price is required'))).toBe(true);
    });

    it('should validate lot size for F&O instruments', async () => {
      const foInstrument = {
        ...mockInstrument,
        segment: 'FO',
        lot_size: 50
      };

      const foOrder = { ...validOrderRequest, quantity: 25 }; // Not multiple of lot size

      mockInstrumentService.prototype.getInstrument = jest.fn().mockResolvedValue(foInstrument);

      const result = await validationService.validateOrder(foOrder);

      expect(result.valid).toBe(false);
      expect(result.errors.some(error => error.includes('multiples of lot size'))).toBe(true);
    });

    it('should validate tick size alignment', async () => {
      const orderWithInvalidPrice = { 
        ...validOrderRequest, 
        price: 2500.03 // Not aligned with tick size of 0.05
      };

      mockInstrumentService.prototype.getInstrument = jest.fn().mockResolvedValue(mockInstrument);

      const result = await validationService.validateOrder(orderWithInvalidPrice);

      expect(result.valid).toBe(false);
      expect(result.errors.some(error => error.includes('multiples of tick size'))).toBe(true);
    });

    it('should warn about market timing when market is closed', async () => {
      // Mock market closed scenario
      jest.spyOn(Date.prototype, 'getDay').mockReturnValue(0); // Sunday

      mockInstrumentService.prototype.getInstrument = jest.fn().mockResolvedValue(mockInstrument);

      const result = await validationService.validateOrder(validOrderRequest);

      expect(result.warnings).toBeDefined();
      expect(result.warnings?.some(warning => warning.includes('AMO'))).toBe(true);
    });
  });

  describe('validateOrderModification', () => {
    const mockExistingOrder = {
      order_id: 'ORDER123',
      status: 'OPEN',
      filled_quantity: 0,
      quantity: 10
    };

    it('should validate correct modification parameters', async () => {
      const modifications = { quantity: 15, price: 2600 };

      const result = await validationService.validateOrderModification(
        'ORDER123',
        modifications,
        mockExistingOrder
      );

      expect(result.valid).toBe(true);
    });

    it('should reject modification of completed order', async () => {
      const completedOrder = { ...mockExistingOrder, status: 'COMPLETE' };
      const modifications = { quantity: 15 };

      const result = await validationService.validateOrderModification(
        'ORDER123',
        modifications,
        completedOrder
      );

      expect(result.valid).toBe(false);
      expect(result.errors.some(error => error.includes('Cannot modify order'))).toBe(true);
    });

    it('should reject quantity less than filled quantity', async () => {
      const partiallyFilledOrder = { ...mockExistingOrder, filled_quantity: 5 };
      const modifications = { quantity: 3 };

      const result = await validationService.validateOrderModification(
        'ORDER123',
        modifications,
        partiallyFilledOrder
      );

      expect(result.valid).toBe(false);
      expect(result.errors.some(error => error.includes('less than or equal to filled'))).toBe(true);
    });
  });

  describe('validateOrderCancellation', () => {
    it('should validate cancellation of open order', () => {
      const openOrder = {
        order_id: 'ORDER123',
        status: 'OPEN',
        filled_quantity: 0
      };

      const result = validationService.validateOrderCancellation('ORDER123', openOrder);

      expect(result.valid).toBe(true);
    });

    it('should reject cancellation of completed order', () => {
      const completedOrder = {
        order_id: 'ORDER123',
        status: 'COMPLETE',
        filled_quantity: 10
      };

      const result = validationService.validateOrderCancellation('ORDER123', completedOrder);

      expect(result.valid).toBe(false);
      expect(result.errors.some(error => error.includes('Cannot cancel order'))).toBe(true);
    });

    it('should warn about partial fills', () => {
      const partiallyFilledOrder = {
        order_id: 'ORDER123',
        status: 'OPEN',
        filled_quantity: 5
      };

      const result = validationService.validateOrderCancellation('ORDER123', partiallyFilledOrder);

      expect(result.valid).toBe(true);
      expect(result.warnings?.some(warning => warning.includes('partially filled'))).toBe(true);
    });
  });
});