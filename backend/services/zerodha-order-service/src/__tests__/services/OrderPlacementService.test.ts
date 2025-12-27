import { OrderPlacementService } from '../../services/OrderPlacementService';
import { ZerodhaOrderRequest } from '@tradeflow/types';

// Mock dependencies
jest.mock('../../services/OrderValidationService');
jest.mock('../../services/DatabaseService');
jest.mock('../../services/ZerodhaApiClient');
jest.mock('../../services/OrderStatusService');
jest.mock('../../utils/logger');

describe('OrderPlacementService', () => {
  let placementService: OrderPlacementService;
  let mockValidationService: any;
  let mockDatabaseService: any;
  let mockApiClient: any;
  let mockStatusService: any;

  beforeEach(() => {
    placementService = new OrderPlacementService();
    
    // Get mocked services
    mockValidationService = require('../../services/OrderValidationService').OrderValidationService;
    mockDatabaseService = require('../../services/DatabaseService').DatabaseService;
    mockApiClient = require('../../services/ZerodhaApiClient').ZerodhaApiClient;
    mockStatusService = require('../../services/OrderStatusService').OrderStatusService;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('placeOrder', () => {
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

    const mockUser = {
      id: 'user123',
      accessToken: 'token123'
    };

    it('should successfully place a valid order', async () => {
      // Mock validation success
      mockValidationService.prototype.validateOrder = jest.fn().mockResolvedValue({
        valid: true,
        errors: [],
        warnings: []
      });

      // Mock user validation
      mockDatabaseService.prototype.getUserById = jest.fn().mockResolvedValue({
        id: 'user123',
        email: 'test@example.com'
      });

      // Mock order count check
      mockDatabaseService.prototype.getUserOrderCountToday = jest.fn().mockResolvedValue(5);

      // Mock API success
      mockApiClient.prototype.placeOrder = jest.fn().mockResolvedValue({
        status: 'success',
        data: { order_id: 'ORDER123' }
      });

      // Mock database order creation
      mockDatabaseService.prototype.createOrder = jest.fn().mockResolvedValue({
        order_id: 'ORDER123',
        status: 'OPEN',
        ...validOrderRequest
      });

      // Mock status monitoring
      mockStatusService.prototype.startMonitoring = jest.fn();

      const result = await placementService.placeOrder(
        mockUser.id,
        validOrderRequest,
        mockUser.accessToken
      );

      expect(result.success).toBe(true);
      expect(result.orderId).toBe('ORDER123');
      expect(mockValidationService.prototype.validateOrder).toHaveBeenCalledWith(validOrderRequest);
      expect(mockApiClient.prototype.placeOrder).toHaveBeenCalledWith(validOrderRequest, mockUser.accessToken);
      expect(mockStatusService.prototype.startMonitoring).toHaveBeenCalledWith('ORDER123', mockUser.id);
    });

    it('should reject order with validation errors', async () => {
      mockValidationService.prototype.validateOrder = jest.fn().mockResolvedValue({
        valid: false,
        errors: ['Invalid exchange'],
        warnings: []
      });

      const result = await placementService.placeOrder(
        mockUser.id,
        validOrderRequest,
        mockUser.accessToken
      );

      expect(result.success).toBe(false);
      expect(result.errors).toContain('Invalid exchange');
      expect(mockApiClient.prototype.placeOrder).not.toHaveBeenCalled();
    });

    it('should reject order when user not found', async () => {
      mockValidationService.prototype.validateOrder = jest.fn().mockResolvedValue({
        valid: true,
        errors: [],
        warnings: []
      });

      mockDatabaseService.prototype.getUserById = jest.fn().mockResolvedValue(null);

      const result = await placementService.placeOrder(
        mockUser.id,
        validOrderRequest,
        mockUser.accessToken
      );

      expect(result.success).toBe(false);
      expect(result.errors).toContain('User not found');
    });

    it('should reject order when daily limit exceeded', async () => {
      mockValidationService.prototype.validateOrder = jest.fn().mockResolvedValue({
        valid: true,
        errors: [],
        warnings: []
      });

      mockDatabaseService.prototype.getUserById = jest.fn().mockResolvedValue({
        id: 'user123'
      });

      mockDatabaseService.prototype.getUserOrderCountToday = jest.fn().mockResolvedValue(100);

      const result = await placementService.placeOrder(
        mockUser.id,
        validOrderRequest,
        mockUser.accessToken
      );

      expect(result.success).toBe(false);
      expect(result.errors?.some(error => error.includes('Daily order limit'))).toBe(true);
    });

    it('should reject order when API call fails', async () => {
      mockValidationService.prototype.validateOrder = jest.fn().mockResolvedValue({
        valid: true,
        errors: [],
        warnings: []
      });

      mockDatabaseService.prototype.getUserById = jest.fn().mockResolvedValue({
        id: 'user123'
      });

      mockDatabaseService.prototype.getUserOrderCountToday = jest.fn().mockResolvedValue(5);

      mockApiClient.prototype.placeOrder = jest.fn().mockResolvedValue({
        status: 'error',
        message: 'Insufficient funds'
      });

      const result = await placementService.placeOrder(
        mockUser.id,
        validOrderRequest,
        mockUser.accessToken
      );

      expect(result.success).toBe(false);
      expect(result.errors).toContain('Insufficient funds');
    });

    it('should handle order value limits in risk checks', async () => {
      const highValueOrder = {
        ...validOrderRequest,
        quantity: 1000,
        price: 2500 // Total value: 25,00,000 (exceeds 10,00,000 limit)
      };

      mockValidationService.prototype.validateOrder = jest.fn().mockResolvedValue({
        valid: true,
        errors: [],
        warnings: []
      });

      mockDatabaseService.prototype.getUserById = jest.fn().mockResolvedValue({
        id: 'user123'
      });

      mockDatabaseService.prototype.getUserOrderCountToday = jest.fn().mockResolvedValue(5);

      const result = await placementService.placeOrder(
        mockUser.id,
        highValueOrder,
        mockUser.accessToken
      );

      expect(result.success).toBe(false);
      expect(result.errors?.some(error => error.includes('exceeds maximum limit'))).toBe(true);
    });
  });

  describe('placeBatchOrders', () => {
    const batchOrders = [
      {
        exchange: 'NSE' as const,
        tradingsymbol: 'RELIANCE',
        transaction_type: 'BUY' as const,
        quantity: 10,
        product: 'CNC' as const,
        order_type: 'LIMIT' as const,
        price: 2500
      },
      {
        exchange: 'NSE' as const,
        tradingsymbol: 'TCS',
        transaction_type: 'BUY' as const,
        quantity: 5,
        product: 'CNC' as const,
        order_type: 'MARKET' as const
      }
    ];

    it('should process batch orders sequentially', async () => {
      const mockPlaceOrder = jest.spyOn(placementService, 'placeOrder')
        .mockResolvedValueOnce({ success: true, orderId: 'ORDER1' })
        .mockResolvedValueOnce({ success: true, orderId: 'ORDER2' });

      const results = await placementService.placeBatchOrders(
        'user123',
        batchOrders,
        'token123'
      );

      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(true);
      expect(mockPlaceOrder).toHaveBeenCalledTimes(2);
    });

    it('should handle individual order failures in batch', async () => {
      const mockPlaceOrder = jest.spyOn(placementService, 'placeOrder')
        .mockResolvedValueOnce({ success: true, orderId: 'ORDER1' })
        .mockResolvedValueOnce({ success: false, errors: ['Validation failed'] });

      const results = await placementService.placeBatchOrders(
        'user123',
        batchOrders,
        'token123'
      );

      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(false);
      expect(results[1].errors).toContain('Validation failed');
    });
  });

  describe('getOrderStats', () => {
    it('should return order statistics', async () => {
      const mockStats = {
        total_orders: '25',
        completed_orders: '20',
        cancelled_orders: '3',
        rejected_orders: '2',
        open_orders: '0',
        total_value: '500000',
        avg_price: '2500'
      };

      mockDatabaseService.prototype.getOrderStats = jest.fn().mockResolvedValue(mockStats);

      const result = await placementService.getOrderStats('user123', 'today');

      expect(result).toEqual(mockStats);
      expect(mockDatabaseService.prototype.getOrderStats).toHaveBeenCalledWith('user123', 'today');
    });
  });
});