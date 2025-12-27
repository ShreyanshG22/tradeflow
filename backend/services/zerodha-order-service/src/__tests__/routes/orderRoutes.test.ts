import request from 'supertest';
import express from 'express';
import { orderRoutes } from '../../routes/orderRoutes';

// Mock all services
jest.mock('../../services/OrderPlacementService');
jest.mock('../../services/OrderModificationService');
jest.mock('../../services/OrderHistoryService');
jest.mock('../../services/OrderStatusService');
jest.mock('../../middleware/authMiddleware');
jest.mock('../../middleware/rateLimitMiddleware');
jest.mock('../../middleware/validationMiddleware');

describe('Order Routes Integration Tests', () => {
  let app: express.Application;
  let mockPlacementService: any;
  let mockModificationService: any;
  let mockHistoryService: any;
  let mockStatusService: any;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    
    // Mock auth middleware to add user to request
    const mockAuthMiddleware = require('../../middleware/authMiddleware').authMiddleware;
    mockAuthMiddleware.mockImplementation((req: any, res: any, next: any) => {
      req.user = {
        id: 'user123',
        accessToken: 'token123',
        email: 'test@example.com'
      };
      next();
    });

    // Mock rate limit middleware
    const mockRateLimitMiddleware = require('../../middleware/rateLimitMiddleware').rateLimitMiddleware;
    mockRateLimitMiddleware.mockImplementation((req: any, res: any, next: any) => {
      next();
    });

    // Mock validation middleware
    const mockValidateOrderRequest = require('../../middleware/validationMiddleware').validateOrderRequest;
    mockValidateOrderRequest.mockImplementation((req: any, res: any, next: any) => {
      next();
    });

    app.use('/api/zerodha/orders', orderRoutes);

    // Get mocked services
    mockPlacementService = require('../../services/OrderPlacementService').OrderPlacementService;
    mockModificationService = require('../../services/OrderModificationService').OrderModificationService;
    mockHistoryService = require('../../services/OrderHistoryService').OrderHistoryService;
    mockStatusService = require('../../services/OrderStatusService').OrderStatusService;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/zerodha/orders', () => {
    const validOrderRequest = {
      exchange: 'NSE',
      tradingsymbol: 'RELIANCE',
      transaction_type: 'BUY',
      quantity: 10,
      product: 'CNC',
      order_type: 'LIMIT',
      price: 2500,
      validity: 'DAY'
    };

    it('should place order successfully', async () => {
      mockPlacementService.prototype.placeOrder = jest.fn().mockResolvedValue({
        success: true,
        orderId: 'ORDER123',
        order: { order_id: 'ORDER123', ...validOrderRequest },
        warnings: []
      });

      const response = await request(app)
        .post('/api/zerodha/orders')
        .send(validOrderRequest)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.orderId).toBe('ORDER123');
      expect(mockPlacementService.prototype.placeOrder).toHaveBeenCalledWith(
        'user123',
        validOrderRequest,
        'token123'
      );
    });

    it('should return validation errors', async () => {
      mockPlacementService.prototype.placeOrder = jest.fn().mockResolvedValue({
        success: false,
        errors: ['Invalid exchange'],
        warnings: []
      });

      const response = await request(app)
        .post('/api/zerodha/orders')
        .send(validOrderRequest)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.errors).toContain('Invalid exchange');
    });

    it('should handle internal server errors', async () => {
      mockPlacementService.prototype.placeOrder = jest.fn().mockRejectedValue(
        new Error('Database connection failed')
      );

      const response = await request(app)
        .post('/api/zerodha/orders')
        .send(validOrderRequest)
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Internal server error');
    });
  });

  describe('POST /api/zerodha/orders/batch', () => {
    const batchOrders = [
      {
        exchange: 'NSE',
        tradingsymbol: 'RELIANCE',
        transaction_type: 'BUY',
        quantity: 10,
        product: 'CNC',
        order_type: 'LIMIT',
        price: 2500
      },
      {
        exchange: 'NSE',
        tradingsymbol: 'TCS',
        transaction_type: 'BUY',
        quantity: 5,
        product: 'CNC',
        order_type: 'MARKET'
      }
    ];

    it('should place batch orders successfully', async () => {
      mockPlacementService.prototype.placeBatchOrders = jest.fn().mockResolvedValue([
        { success: true, orderId: 'ORDER1' },
        { success: true, orderId: 'ORDER2' }
      ]);

      const response = await request(app)
        .post('/api/zerodha/orders/batch')
        .send({ orders: batchOrders })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(2);
      expect(response.body.data[0].orderId).toBe('ORDER1');
      expect(response.body.data[1].orderId).toBe('ORDER2');
    });

    it('should validate orders array', async () => {
      const response = await request(app)
        .post('/api/zerodha/orders/batch')
        .send({ orders: [] })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Orders array is required');
    });
  });

  describe('GET /api/zerodha/orders/:orderId', () => {
    it('should get order details successfully', async () => {
      const mockOrderDetails = {
        order: { order_id: 'ORDER123', tradingsymbol: 'RELIANCE' },
        trades: [],
        timeline: []
      };

      mockHistoryService.prototype.getOrderDetails = jest.fn().mockResolvedValue(mockOrderDetails);

      const response = await request(app)
        .get('/api/zerodha/orders/ORDER123')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.order.order_id).toBe('ORDER123');
      expect(mockHistoryService.prototype.getOrderDetails).toHaveBeenCalledWith(
        'user123',
        'ORDER123',
        'token123'
      );
    });

    it('should return 404 for non-existent order', async () => {
      mockHistoryService.prototype.getOrderDetails = jest.fn().mockResolvedValue(null);

      const response = await request(app)
        .get('/api/zerodha/orders/NONEXISTENT')
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Order not found');
    });
  });

  describe('PUT /api/zerodha/orders/:orderId', () => {
    const modifications = {
      quantity: 15,
      price: 2600
    };

    it('should modify order successfully', async () => {
      mockModificationService.prototype.modifyOrder = jest.fn().mockResolvedValue({
        success: true,
        orderId: 'ORDER123',
        order: { order_id: 'ORDER123', quantity: 15, price: 2600 },
        warnings: []
      });

      const response = await request(app)
        .put('/api/zerodha/orders/ORDER123')
        .send(modifications)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.orderId).toBe('ORDER123');
      expect(mockModificationService.prototype.modifyOrder).toHaveBeenCalledWith(
        'user123',
        'ORDER123',
        modifications,
        'token123'
      );
    });

    it('should return modification errors', async () => {
      mockModificationService.prototype.modifyOrder = jest.fn().mockResolvedValue({
        success: false,
        errors: ['Order cannot be modified'],
        warnings: []
      });

      const response = await request(app)
        .put('/api/zerodha/orders/ORDER123')
        .send(modifications)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.errors).toContain('Order cannot be modified');
    });
  });

  describe('DELETE /api/zerodha/orders/:orderId', () => {
    it('should cancel order successfully', async () => {
      mockModificationService.prototype.cancelOrder = jest.fn().mockResolvedValue({
        success: true,
        orderId: 'ORDER123',
        message: 'Order cancellation initiated successfully'
      });

      const response = await request(app)
        .delete('/api/zerodha/orders/ORDER123')
        .send({ reason: 'User requested cancellation' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.orderId).toBe('ORDER123');
      expect(mockModificationService.prototype.cancelOrder).toHaveBeenCalledWith(
        'user123',
        'ORDER123',
        'token123',
        'User requested cancellation'
      );
    });

    it('should return cancellation errors', async () => {
      mockModificationService.prototype.cancelOrder = jest.fn().mockResolvedValue({
        success: false,
        errors: ['Order cannot be cancelled']
      });

      const response = await request(app)
        .delete('/api/zerodha/orders/ORDER123')
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.errors).toContain('Order cannot be cancelled');
    });
  });

  describe('GET /api/zerodha/orders', () => {
    it('should get order history successfully', async () => {
      const mockHistory = {
        orders: [
          { order_id: 'ORDER1', tradingsymbol: 'RELIANCE' },
          { order_id: 'ORDER2', tradingsymbol: 'TCS' }
        ],
        total: 2,
        hasMore: false
      };

      mockHistoryService.prototype.getOrderHistory = jest.fn().mockResolvedValue(mockHistory);

      const response = await request(app)
        .get('/api/zerodha/orders')
        .query({ limit: '10', offset: '0' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.orders).toHaveLength(2);
      expect(response.body.data.total).toBe(2);
    });

    it('should handle query parameters', async () => {
      mockHistoryService.prototype.getOrderHistory = jest.fn().mockResolvedValue({
        orders: [],
        total: 0,
        hasMore: false
      });

      await request(app)
        .get('/api/zerodha/orders')
        .query({
          symbol: 'RELIANCE',
          exchange: 'NSE',
          status: 'COMPLETE',
          fromDate: '2024-01-01',
          toDate: '2024-01-31',
          limit: '25',
          offset: '50'
        })
        .expect(200);

      expect(mockHistoryService.prototype.getOrderHistory).toHaveBeenCalledWith({
        userId: 'user123',
        symbol: 'RELIANCE',
        exchange: 'NSE',
        status: 'COMPLETE',
        fromDate: new Date('2024-01-01'),
        toDate: new Date('2024-01-31'),
        limit: 25,
        offset: 50
      });
    });
  });

  describe('GET /api/zerodha/orders/summary/:timeframe?', () => {
    it('should get order summary successfully', async () => {
      const mockSummary = {
        totalOrders: 25,
        completedOrders: 20,
        cancelledOrders: 3,
        rejectedOrders: 2,
        openOrders: 0,
        totalValue: 500000,
        avgExecutionPrice: 2500,
        successRate: 80
      };

      mockHistoryService.prototype.getOrderSummary = jest.fn().mockResolvedValue(mockSummary);

      const response = await request(app)
        .get('/api/zerodha/orders/summary/today')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.totalOrders).toBe(25);
      expect(response.body.data.successRate).toBe(80);
      expect(mockHistoryService.prototype.getOrderSummary).toHaveBeenCalledWith('user123', 'today');
    });
  });

  describe('POST /api/zerodha/orders/sync', () => {
    it('should sync order history successfully', async () => {
      const mockSyncResult = {
        synced: 15,
        errors: []
      };

      mockHistoryService.prototype.syncOrderHistory = jest.fn().mockResolvedValue(mockSyncResult);

      const response = await request(app)
        .post('/api/zerodha/orders/sync')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.synced).toBe(15);
      expect(mockHistoryService.prototype.syncOrderHistory).toHaveBeenCalledWith('user123', 'token123');
    });
  });

  describe('GET /api/zerodha/orders/export/csv', () => {
    it('should export order history as CSV', async () => {
      const mockCsvData = 'Order ID,Date,Symbol,Exchange,Type,Quantity,Price,Status\nORDER123,2024-01-15,RELIANCE,NSE,BUY,10,2500,COMPLETE';

      mockHistoryService.prototype.exportOrderHistory = jest.fn().mockResolvedValue(mockCsvData);

      const response = await request(app)
        .get('/api/zerodha/orders/export/csv')
        .expect(200);

      expect(response.headers['content-type']).toBe('text/csv; charset=utf-8');
      expect(response.headers['content-disposition']).toBe('attachment; filename=order_history.csv');
      expect(response.text).toBe(mockCsvData);
    });
  });
});