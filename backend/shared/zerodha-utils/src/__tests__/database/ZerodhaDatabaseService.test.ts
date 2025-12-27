import { ZerodhaDatabaseService, ZerodhaDatabaseConfig } from '../../database/ZerodhaDatabaseService';

// Mock the repository classes
jest.mock('../../database/ZerodhaOrderRepository');
jest.mock('../../database/ZerodhaPositionRepository');
jest.mock('../../database/ZerodhaInstrumentRepository');

describe('ZerodhaDatabaseService', () => {
  let service: ZerodhaDatabaseService;
  let mockOrdersRepo: any;
  let mockPositionsRepo: any;
  let mockInstrumentsRepo: any;

  beforeEach(() => {
    // Mock repository methods
    mockOrdersRepo = {
      healthCheck: jest.fn(),
      getOrderStats: jest.fn(),
      deleteOldOrders: jest.fn(),
      close: jest.fn()
    };

    mockPositionsRepo = {
      healthCheck: jest.fn(),
      getPositionSummary: jest.fn(),
      deleteOldPositions: jest.fn(),
      close: jest.fn()
    };

    mockInstrumentsRepo = {
      healthCheck: jest.fn(),
      getInstrumentStats: jest.fn(),
      close: jest.fn()
    };

    // Mock repository constructors
    const { ZerodhaOrderRepository } = require('../../database/ZerodhaOrderRepository');
    const { ZerodhaPositionRepository } = require('../../database/ZerodhaPositionRepository');
    const { ZerodhaInstrumentRepository } = require('../../database/ZerodhaInstrumentRepository');

    ZerodhaOrderRepository.mockImplementation(() => mockOrdersRepo);
    ZerodhaPositionRepository.mockImplementation(() => mockPositionsRepo);
    ZerodhaInstrumentRepository.mockImplementation(() => mockInstrumentsRepo);

    const config: ZerodhaDatabaseConfig = {
      connectionString: 'postgresql://test:test@localhost:5432/test',
      max: 10,
      enableConnectionPooling: true,
      enableQueryLogging: false
    };

    service = new ZerodhaDatabaseService(config);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize all repositories', () => {
      expect(service.orders).toBe(mockOrdersRepo);
      expect(service.positions).toBe(mockPositionsRepo);
      expect(service.instruments).toBe(mockInstrumentsRepo);
    });
  });

  describe('initialize', () => {
    it('should initialize successfully', async () => {
      mockOrdersRepo.healthCheck.mockResolvedValue({ status: 'healthy', latency: 10 });
      mockPositionsRepo.healthCheck.mockResolvedValue({ status: 'healthy', latency: 15 });
      mockInstrumentsRepo.healthCheck.mockResolvedValue({ status: 'healthy', latency: 12 });

      await expect(service.initialize()).resolves.not.toThrow();
    });

    it('should throw error when health check fails', async () => {
      mockOrdersRepo.healthCheck.mockRejectedValue(new Error('Connection failed'));

      await expect(service.initialize()).rejects.toThrow('Connection failed');
    });
  });

  describe('healthCheck', () => {
    it('should return healthy status when all repositories are healthy', async () => {
      mockOrdersRepo.healthCheck.mockResolvedValue({ status: 'healthy', latency: 10 });
      mockPositionsRepo.healthCheck.mockResolvedValue({ status: 'healthy', latency: 15 });
      mockInstrumentsRepo.healthCheck.mockResolvedValue({ status: 'healthy', latency: 12 });

      const result = await service.healthCheck();

      expect(result.status).toBe('healthy');
      expect(result.repositories.orders.status).toBe('healthy');
      expect(result.repositories.positions.status).toBe('healthy');
      expect(result.repositories.instruments.status).toBe('healthy');
      expect(result.overall_latency).toBeGreaterThanOrEqual(0);
    });

    it('should return unhealthy status when any repository is unhealthy', async () => {
      mockOrdersRepo.healthCheck.mockResolvedValue({ status: 'healthy', latency: 10 });
      mockPositionsRepo.healthCheck.mockResolvedValue({ status: 'unhealthy' });
      mockInstrumentsRepo.healthCheck.mockResolvedValue({ status: 'healthy', latency: 12 });

      const result = await service.healthCheck();

      expect(result.status).toBe('unhealthy');
      expect(result.repositories.positions.status).toBe('unhealthy');
    });

    it('should handle health check errors', async () => {
      mockOrdersRepo.healthCheck.mockRejectedValue(new Error('Health check failed'));

      const result = await service.healthCheck();

      expect(result.status).toBe('unhealthy');
      expect(result.repositories.orders.status).toBe('unhealthy');
      expect(result.repositories.positions.status).toBe('unhealthy');
      expect(result.repositories.instruments.status).toBe('unhealthy');
    });
  });

  describe('getStatistics', () => {
    it('should get statistics from all repositories', async () => {
      const mockOrderStats = {
        total: 100,
        pending: 10,
        completed: 80,
        cancelled: 5,
        rejected: 5
      };

      const mockPositionStats = {
        total_positions: 20,
        total_value: 1000000,
        total_pnl: 50000,
        profitable_positions: 15,
        losing_positions: 5
      };

      const mockInstrumentStats = {
        total: 5000,
        by_exchange: { NSE: 3000, BSE: 2000 },
        by_type: { EQ: 4500, FUT: 500 }
      };

      mockOrdersRepo.getOrderStats.mockResolvedValue(mockOrderStats);
      mockPositionsRepo.getPositionSummary.mockResolvedValue(mockPositionStats);
      mockInstrumentsRepo.getInstrumentStats.mockResolvedValue(mockInstrumentStats);

      const result = await service.getStatistics();

      expect(result.orders).toEqual(mockOrderStats);
      expect(result.positions).toEqual(mockPositionStats);
      expect(result.instruments).toEqual(mockInstrumentStats);
    });

    it('should handle statistics errors gracefully', async () => {
      mockOrdersRepo.getOrderStats.mockRejectedValue(new Error('Stats error'));
      mockPositionsRepo.getPositionSummary.mockRejectedValue(new Error('Stats error'));
      mockInstrumentsRepo.getInstrumentStats.mockRejectedValue(new Error('Stats error'));

      const result = await service.getStatistics();

      expect(result.orders).toEqual({
        total: 0,
        pending: 0,
        completed: 0,
        cancelled: 0,
        rejected: 0
      });
      expect(result.positions).toEqual({
        total_positions: 0,
        total_value: 0,
        total_pnl: 0,
        profitable_positions: 0,
        losing_positions: 0
      });
      expect(result.instruments).toEqual({
        total: 0,
        by_exchange: {},
        by_type: {}
      });
    });
  });

  describe('performMaintenance', () => {
    it('should perform maintenance successfully', async () => {
      mockOrdersRepo.deleteOldOrders.mockResolvedValue(10);
      mockPositionsRepo.deleteOldPositions.mockResolvedValue(5);

      const result = await service.performMaintenance();

      expect(mockOrdersRepo.deleteOldOrders).toHaveBeenCalledWith(90);
      expect(mockPositionsRepo.deleteOldPositions).toHaveBeenCalledWith(365);
      expect(result).toEqual({
        ordersDeleted: 10,
        positionsDeleted: 5,
        success: true
      });
    });

    it('should handle maintenance errors', async () => {
      mockOrdersRepo.deleteOldOrders.mockRejectedValue(new Error('Maintenance error'));

      const result = await service.performMaintenance();

      expect(result).toEqual({
        ordersDeleted: 0,
        positionsDeleted: 0,
        success: false
      });
    });
  });

  describe('close', () => {
    it('should close all repository connections', async () => {
      mockOrdersRepo.close.mockResolvedValue(undefined);
      mockPositionsRepo.close.mockResolvedValue(undefined);
      mockInstrumentsRepo.close.mockResolvedValue(undefined);

      await service.close();

      expect(mockOrdersRepo.close).toHaveBeenCalled();
      expect(mockPositionsRepo.close).toHaveBeenCalled();
      expect(mockInstrumentsRepo.close).toHaveBeenCalled();
    });

    it('should handle close errors gracefully', async () => {
      mockOrdersRepo.close.mockRejectedValue(new Error('Close error'));

      await expect(service.close()).resolves.not.toThrow();
    });
  });

  describe('fromEnvironment', () => {
    it('should create service from environment variables', () => {
      const originalEnv = process.env;
      
      process.env = {
        ...originalEnv,
        DATABASE_URL: 'postgresql://env:env@localhost:5432/env_db',
        DB_POOL_MAX: '25',
        DB_IDLE_TIMEOUT: '45000',
        DB_CONNECTION_TIMEOUT: '3000',
        DB_ENABLE_POOLING: 'true',
        DB_ENABLE_QUERY_LOGGING: 'true'
      };

      const service = ZerodhaDatabaseService.fromEnvironment();

      expect(service).toBeInstanceOf(ZerodhaDatabaseService);
      
      process.env = originalEnv;
    });

    it('should use default values when environment variables not set', () => {
      const originalEnv = process.env;
      
      process.env = {
        ...originalEnv
      };
      delete process.env.DATABASE_URL;
      delete process.env.DB_POOL_MAX;

      const service = ZerodhaDatabaseService.fromEnvironment();

      expect(service).toBeInstanceOf(ZerodhaDatabaseService);
      
      process.env = originalEnv;
    });
  });

  describe('maskConnectionString', () => {
    it('should mask password in connection string', () => {
      const service = new ZerodhaDatabaseService({
        connectionString: 'postgresql://user:password@localhost:5432/db'
      });

      // Access private method for testing
      const maskedString = (service as any).maskConnectionString('postgresql://user:password@localhost:5432/db');

      expect(maskedString).toContain('***');
      expect(maskedString).not.toContain('password');
    });

    it('should handle invalid connection strings', () => {
      const service = new ZerodhaDatabaseService({
        connectionString: 'invalid-connection-string'
      });

      const maskedString = (service as any).maskConnectionString('invalid-connection-string');

      expect(maskedString).toBe('invalid-connection-string');
    });
  });
});