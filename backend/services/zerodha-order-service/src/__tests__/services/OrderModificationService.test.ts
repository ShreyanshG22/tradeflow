import { OrderModificationService } from '../../services/OrderModificationService';
import { ZerodhaOrderRequest } from '@tradeflow/types';

// Mock dependencies
jest.mock('../../services/OrderValidationService');
jest.mock('../../services/DatabaseService');
jest.mock('../../services/ZerodhaApiClient');
jest.mock('../../services/OrderStatusService');
jest.mock('../../utils/logger');

describe('OrderModificationService', () => {
  let modificationService: OrderModificationService;
  let mockValidationService: any;
  let mockDatabaseService: any;
  let mockApiClient: any;
  let mockStatusService: any;

  beforeEach(() => {
    modificationService = new OrderModificationService();
    
    mockValidationService = require('../../services/OrderValidationService').OrderValidationService;
    mockDatabaseService = require('../../services/DatabaseService').DatabaseService;
    mockApiClient = require('../../services/ZerodhaApiClient').ZerodhaApiClient;
    mockStatusService = require('../../services/OrderStatusService').OrderStatusService;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('modifyOrder', () => {
    const mockExistingOrder = {
      order_id: 'ORDER123',
      account_id: 'user123',
      status: 'OPEN',
      exchange: 'NSE',
      tradingsymbol: 'RELIANCE',
      transaction_type: 'BUY',
      quantity: 10,
      product: 'CNC',
      order_type: 'LIMIT',
      price: 2500,
      trigger_price: 0,
      validity: 'DAY',
      filled_quantity: 0,
      pending_quantity: 10
    };

    const modifications = {
      quantity: 15,
      price: 2600
    };

    it('should successfully modify an order', async () => {
      // Mock order retrieval
      mockDatabaseService.prototype.getOrderById = jest.fn().mockResolvedValue(mockExistingOrder);

      // Mock validation success
      mockValidationService.prototype.validateOrderModification = jest.fn().mockResolvedValue({
        valid: true,
        errors: [],
        warnings: []
      });

      mockValidationService.prototype.validateOrder = jest.fn().mockResolvedValue({
        valid: true,
        errors: [],
        warnings: []
      });

      // Mock API success
      mockApiClient.prototype.modifyOrder = jest.fn().mockResolvedValue({
        status: 'success',
        data: { order_id: 'ORDER123' }
      });

      // Mock database update
      mockDatabaseService.prototype.updateOrder = jest.fn().mockResolvedValue({
        ...mockExistingOrder,
        ...modifications
      });

      const result = await modificationService.modifyOrder(
        'user123',
        'ORDER123',
        modifications,
        'token123'
      );

      expect(result.success).toBe(true);
      expect(result.orderId).toBe('ORDER123');
      expect(mockApiClient.prototype.modifyOrder).toHaveBeenCalledWith('ORDER123', modifications, 'token123');
      expect(mockDatabaseService.prototype.updateOrder).toHaveBeenCalled();
    });

    it('should reject modification when order not found', async () => {
      mockDatabaseService.prototype.getOrderById = jest.fn().mockResolvedValue(null);

      const result = await modificationService.modifyOrder(
        'user123',
        'ORDER123',
        modifications,
        'token123'
      );

      expect(result.success).toBe(false);
      expect(result.errors).toContain('Order not found');
    });

    it('should reject modification when user does not own order', async () => {
      const otherUserOrder = { ...mockExistingOrder, account_id: 'otheruser' };
      mockDatabaseService.prototype.getOrderById = jest.fn().mockResolvedValue(otherUserOrder);

      const result = await modificationService.modifyOrder(
        'user123',
        'ORDER123',
        modifications,
        'token123'
      );

      expect(result.success).toBe(false);
      expect(result.errors?.some(error => error.includes('Unauthorized'))).toBe(true);
    });

    it('should reject modification of completed order', async () => {
      const completedOrder = { ...mockExistingOrder, status: 'COMPLETE' };
      mockDatabaseService.prototype.getOrderById = jest.fn().mockResolvedValue(completedOrder);

      mockValidationService.prototype.validateOrderModification = jest.fn().mockResolvedValue({
        valid: true,
        errors: [],
        warnings: []
      });

      const result = await modificationService.modifyOrder(
        'user123',
        'ORDER123',
        modifications,
        'token123'
      );

      expect(result.success).toBe(false);
      expect(result.errors?.some(error => error.includes('cannot be modified'))).toBe(true);
    });

    it('should reject modification of partially filled order', async () => {
      const partiallyFilledOrder = { ...mockExistingOrder, filled_quantity: 5 };
      mockDatabaseService.prototype.getOrderById = jest.fn().mockResolvedValue(partiallyFilledOrder);

      mockValidationService.prototype.validateOrderModification = jest.fn().mockResolvedValue({
        valid: true,
        errors: [],
        warnings: []
      });

      const result = await modificationService.modifyOrder(
        'user123',
        'ORDER123',
        modifications,
        'token123'
      );

      expect(result.success).toBe(false);
      expect(result.errors?.some(error => error.includes('Partially filled'))).toBe(true);
    });

    it('should handle API modification failure', async () => {
      mockDatabaseService.prototype.getOrderById = jest.fn().mockResolvedValue(mockExistingOrder);

      mockValidationService.prototype.validateOrderModification = jest.fn().mockResolvedValue({
        valid: true,
        errors: [],
        warnings: []
      });

      mockValidationService.prototype.validateOrder = jest.fn().mockResolvedValue({
        valid: true,
        errors: [],
        warnings: []
      });

      mockApiClient.prototype.modifyOrder = jest.fn().mockResolvedValue({
        status: 'error',
        message: 'Order modification rejected'
      });

      const result = await modificationService.modifyOrder(
        'user123',
        'ORDER123',
        modifications,
        'token123'
      );

      expect(result.success).toBe(false);
      expect(result.errors).toContain('Order modification rejected');
    });
  });

  describe('cancelOrder', () => {
    const mockExistingOrder = {
      order_id: 'ORDER123',
      account_id: 'user123',
      status: 'OPEN',
      filled_quantity: 0,
      quantity: 10
    };

    it('should successfully cancel an order', async () => {
      mockDatabaseService.prototype.getOrderById = jest.fn().mockResolvedValue(mockExistingOrder);

      mockValidationService.prototype.validateOrderCancellation = jest.fn().mockReturnValue({
        valid: true,
        errors: [],
        warnings: []
      });

      mockApiClient.prototype.cancelOrder = jest.fn().mockResolvedValue({
        status: 'success',
        data: { order_id: 'ORDER123' }
      });

      mockDatabaseService.prototype.updateOrder = jest.fn().mockResolvedValue({
        ...mockExistingOrder,
        status: 'CANCEL_PENDING'
      });

      mockStatusService.prototype.stopMonitoring = jest.fn();

      const result = await modificationService.cancelOrder(
        'user123',
        'ORDER123',
        'token123',
        'User requested cancellation'
      );

      expect(result.success).toBe(true);
      expect(result.orderId).toBe('ORDER123');
      expect(mockApiClient.prototype.cancelOrder).toHaveBeenCalledWith('ORDER123', 'token123');
      expect(mockStatusService.prototype.stopMonitoring).toHaveBeenCalledWith('ORDER123');
    });

    it('should reject cancellation when order not found', async () => {
      mockDatabaseService.prototype.getOrderById = jest.fn().mockResolvedValue(null);

      const result = await modificationService.cancelOrder(
        'user123',
        'ORDER123',
        'token123'
      );

      expect(result.success).toBe(false);
      expect(result.errors).toContain('Order not found');
    });

    it('should reject cancellation when user does not own order', async () => {
      const otherUserOrder = { ...mockExistingOrder, account_id: 'otheruser' };
      mockDatabaseService.prototype.getOrderById = jest.fn().mockResolvedValue(otherUserOrder);

      const result = await modificationService.cancelOrder(
        'user123',
        'ORDER123',
        'token123'
      );

      expect(result.success).toBe(false);
      expect(result.errors?.some(error => error.includes('Unauthorized'))).toBe(true);
    });

    it('should reject cancellation of completed order', async () => {
      const completedOrder = { ...mockExistingOrder, status: 'COMPLETE' };
      mockDatabaseService.prototype.getOrderById = jest.fn().mockResolvedValue(completedOrder);

      mockValidationService.prototype.validateOrderCancellation = jest.fn().mockReturnValue({
        valid: false,
        errors: ['Cannot cancel order with status: COMPLETE'],
        warnings: []
      });

      const result = await modificationService.cancelOrder(
        'user123',
        'ORDER123',
        'token123'
      );

      expect(result.success).toBe(false);
      expect(result.errors?.some(error => error.includes('Cannot cancel order'))).toBe(true);
    });

    it('should handle API cancellation failure', async () => {
      mockDatabaseService.prototype.getOrderById = jest.fn().mockResolvedValue(mockExistingOrder);

      mockValidationService.prototype.validateOrderCancellation = jest.fn().mockReturnValue({
        valid: true,
        errors: [],
        warnings: []
      });

      mockApiClient.prototype.cancelOrder = jest.fn().mockResolvedValue({
        status: 'error',
        message: 'Order cancellation rejected'
      });

      const result = await modificationService.cancelOrder(
        'user123',
        'ORDER123',
        'token123'
      );

      expect(result.success).toBe(false);
      expect(result.errors).toContain('Order cancellation rejected');
    });
  });

  describe('cancelBatchOrders', () => {
    const orderIds = ['ORDER1', 'ORDER2', 'ORDER3'];

    it('should process batch cancellations sequentially', async () => {
      const mockCancelOrder = jest.spyOn(modificationService, 'cancelOrder')
        .mockResolvedValueOnce({ success: true, orderId: 'ORDER1' })
        .mockResolvedValueOnce({ success: true, orderId: 'ORDER2' })
        .mockResolvedValueOnce({ success: false, errors: ['Order not found'] });

      const results = await modificationService.cancelBatchOrders(
        'user123',
        orderIds,
        'token123',
        'Batch cancellation'
      );

      expect(results).toHaveLength(3);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(true);
      expect(results[2].success).toBe(false);
      expect(mockCancelOrder).toHaveBeenCalledTimes(3);
    });
  });

  describe('handlePartialFill', () => {
    it('should update order with partial fill information', async () => {
      mockDatabaseService.prototype.updateOrder = jest.fn().mockResolvedValue({
        order_id: 'ORDER123',
        filled_quantity: 5,
        pending_quantity: 5,
        status: 'OPEN'
      });

      await modificationService.handlePartialFill('ORDER123', 5, 5);

      expect(mockDatabaseService.prototype.updateOrder).toHaveBeenCalledWith('ORDER123', {
        filled_quantity: 5,
        pending_quantity: 5,
        status: 'OPEN'
      });
    });

    it('should mark order as complete when fully filled', async () => {
      mockDatabaseService.prototype.updateOrder = jest.fn().mockResolvedValue({
        order_id: 'ORDER123',
        filled_quantity: 10,
        pending_quantity: 0,
        status: 'COMPLETE'
      });

      await modificationService.handlePartialFill('ORDER123', 10, 0);

      expect(mockDatabaseService.prototype.updateOrder).toHaveBeenCalledWith('ORDER123', {
        filled_quantity: 10,
        pending_quantity: 0,
        status: 'COMPLETE'
      });
    });
  });
});