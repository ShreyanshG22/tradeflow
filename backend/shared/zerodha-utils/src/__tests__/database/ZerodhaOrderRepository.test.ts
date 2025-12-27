import { ZerodhaOrderRepository, CreateZerodhaOrderData, UpdateZerodhaOrderData } from '../../database/ZerodhaOrderRepository';
import { DatabaseConfig } from '../../database/BaseRepository';

// Mock the BaseRepository
jest.mock('../../database/BaseRepository');

describe('ZerodhaOrderRepository', () => {
  let repository: ZerodhaOrderRepository;
  let mockInsert: jest.Mock;
  let mockFindBy: jest.Mock;
  let mockQuery: jest.Mock;

  beforeEach(() => {
    mockInsert = jest.fn();
    mockFindBy = jest.fn();
    mockQuery = jest.fn();

    // Mock BaseRepository methods
    const BaseRepository = require('../../database/BaseRepository').BaseRepository;
    BaseRepository.prototype.insert = mockInsert;
    BaseRepository.prototype.findBy = mockFindBy;
    BaseRepository.prototype.query = mockQuery;

    const config: DatabaseConfig = {
      connectionString: 'postgresql://test:test@localhost:5432/test'
    };

    repository = new ZerodhaOrderRepository(config);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createOrder', () => {
    it('should create order successfully', async () => {
      const orderData: CreateZerodhaOrderData = {
        user_id: 'user-1',
        order_id: 'order-1',
        exchange: 'NSE',
        tradingsymbol: 'RELIANCE',
        transaction_type: 'BUY',
        quantity: 100,
        product: 'CNC',
        order_type: 'MARKET',
        status: 'OPEN',
        order_timestamp: '2024-12-27T10:00:00Z'
      };

      const mockOrder = {
        id: 'uuid-1',
        ...orderData,
        created_at: '2024-12-27T10:00:00Z',
        updated_at: '2024-12-27T10:00:00Z'
      };

      mockInsert.mockResolvedValue(mockOrder);

      const result = await repository.createOrder(orderData);

      expect(mockInsert).toHaveBeenCalledWith(orderData);
      expect(result).toEqual(mockOrder);
    });

    it('should handle create order errors', async () => {
      const orderData: CreateZerodhaOrderData = {
        user_id: 'user-1',
        order_id: 'order-1',
        exchange: 'NSE',
        tradingsymbol: 'RELIANCE',
        transaction_type: 'BUY',
        quantity: 100,
        product: 'CNC',
        order_type: 'MARKET',
        status: 'OPEN',
        order_timestamp: '2024-12-27T10:00:00Z'
      };

      const error = new Error('Database error');
      mockInsert.mockRejectedValue(error);

      await expect(repository.createOrder(orderData)).rejects.toThrow('Database error');
    });
  });

  describe('getOrderById', () => {
    it('should get order by ID successfully', async () => {
      const mockOrder = {
        id: 'uuid-1',
        order_id: 'order-1',
        user_id: 'user-1',
        tradingsymbol: 'RELIANCE'
      };

      mockFindBy.mockResolvedValue([mockOrder]);

      const result = await repository.getOrderById('order-1');

      expect(mockFindBy).toHaveBeenCalledWith({ order_id: 'order-1' });
      expect(result).toEqual(mockOrder);
    });

    it('should return null when order not found', async () => {
      mockFindBy.mockResolvedValue([]);

      const result = await repository.getOrderById('order-1');

      expect(result).toBeNull();
    });

    it('should handle get order errors', async () => {
      mockFindBy.mockRejectedValue(new Error('Database error'));

      const result = await repository.getOrderById('order-1');

      expect(result).toBeNull();
    });
  });

  describe('getOrdersByUserId', () => {
    it('should get orders by user ID successfully', async () => {
      const mockOrders = [
        { id: 'uuid-1', order_id: 'order-1', user_id: 'user-1' },
        { id: 'uuid-2', order_id: 'order-2', user_id: 'user-1' }
      ];

      mockFindBy.mockResolvedValue(mockOrders);

      const result = await repository.getOrdersByUserId('user-1');

      expect(mockFindBy).toHaveBeenCalledWith(
        { user_id: 'user-1' },
        'order_timestamp DESC',
        100,
        0
      );
      expect(result).toEqual(mockOrders);
    });

    it('should handle custom limit and offset', async () => {
      mockFindBy.mockResolvedValue([]);

      await repository.getOrdersByUserId('user-1', 50, 10);

      expect(mockFindBy).toHaveBeenCalledWith(
        { user_id: 'user-1' },
        'order_timestamp DESC',
        50,
        10
      );
    });
  });

  describe('getOrdersWithFilters', () => {
    it('should get orders with filters successfully', async () => {
      const mockOrders = [
        { id: 'uuid-1', order_id: 'order-1', exchange: 'NSE', status: 'COMPLETE' }
      ];

      mockQuery.mockResolvedValue({ rows: mockOrders });

      const filters = {
        user_id: 'user-1',
        exchange: 'NSE',
        status: 'COMPLETE',
        date_from: '2024-12-01',
        date_to: '2024-12-31'
      };

      const result = await repository.getOrdersWithFilters(filters);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE'),
        ['user-1', 'NSE', 'COMPLETE', '2024-12-01', '2024-12-31']
      );
      expect(result).toEqual(mockOrders);
    });

    it('should handle empty filters', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      const result = await repository.getOrdersWithFilters({});

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM zerodha.orders ORDER BY order_timestamp DESC'),
        []
      );
      expect(result).toEqual([]);
    });
  });

  describe('updateOrder', () => {
    it('should update order successfully', async () => {
      const mockExistingOrder = {
        id: 'uuid-1',
        order_id: 'order-1',
        status: 'OPEN'
      };

      const mockUpdatedOrder = {
        ...mockExistingOrder,
        status: 'COMPLETE',
        filled_quantity: 100
      };

      const updateData: UpdateZerodhaOrderData = {
        status: 'COMPLETE',
        filled_quantity: 100
      };

      mockFindBy.mockResolvedValue([mockExistingOrder]);
      mockQuery.mockResolvedValue({ rows: [mockUpdatedOrder] });

      const result = await repository.updateOrder('order-1', updateData);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE zerodha.orders SET'),
        ['order-1', 'COMPLETE', 100]
      );
      expect(result).toEqual(mockUpdatedOrder);
    });

    it('should return null when order not found', async () => {
      mockFindBy.mockResolvedValue([]);

      const result = await repository.updateOrder('order-1', { status: 'COMPLETE' });

      expect(result).toBeNull();
    });
  });

  describe('getPendingOrders', () => {
    it('should get pending orders successfully', async () => {
      const mockOrders = [
        { id: 'uuid-1', order_id: 'order-1', status: 'OPEN' }
      ];

      mockFindBy.mockResolvedValue(mockOrders);

      const result = await repository.getPendingOrders('user-1');

      expect(mockFindBy).toHaveBeenCalledWith(
        { user_id: 'user-1', status: 'OPEN' },
        'order_timestamp DESC'
      );
      expect(result).toEqual(mockOrders);
    });
  });

  describe('getOrderHistoryBySymbol', () => {
    it('should get order history by symbol successfully', async () => {
      const mockOrders = [
        { id: 'uuid-1', tradingsymbol: 'RELIANCE', exchange: 'NSE' }
      ];

      mockFindBy.mockResolvedValue(mockOrders);

      const result = await repository.getOrderHistoryBySymbol('user-1', 'RELIANCE', 'NSE');

      expect(mockFindBy).toHaveBeenCalledWith(
        { user_id: 'user-1', tradingsymbol: 'RELIANCE', exchange: 'NSE' },
        'order_timestamp DESC',
        50
      );
      expect(result).toEqual(mockOrders);
    });
  });

  describe('getOrderStats', () => {
    it('should get order statistics successfully', async () => {
      const mockStats = {
        total: '10',
        pending: '2',
        completed: '6',
        cancelled: '1',
        rejected: '1'
      };

      mockQuery.mockResolvedValue({ rows: [mockStats] });

      const result = await repository.getOrderStats('user-1');

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('COUNT(*) as total'),
        ['user-1']
      );
      expect(result).toEqual({
        total: 10,
        pending: 2,
        completed: 6,
        cancelled: 1,
        rejected: 1
      });
    });

    it('should handle stats errors', async () => {
      mockQuery.mockRejectedValue(new Error('Database error'));

      const result = await repository.getOrderStats('user-1');

      expect(result).toEqual({
        total: 0,
        pending: 0,
        completed: 0,
        cancelled: 0,
        rejected: 0
      });
    });
  });

  describe('deleteOldOrders', () => {
    it('should delete old orders successfully', async () => {
      mockQuery.mockResolvedValue({ rowCount: 5 });

      const result = await repository.deleteOldOrders(90);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("INTERVAL '90 days'")
      );
      expect(result).toBe(5);
    });

    it('should handle delete errors', async () => {
      mockQuery.mockRejectedValue(new Error('Database error'));

      const result = await repository.deleteOldOrders(90);

      expect(result).toBe(0);
    });
  });
});