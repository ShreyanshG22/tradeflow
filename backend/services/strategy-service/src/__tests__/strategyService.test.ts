import { StrategyService, CreateStrategyRequest, UpdateStrategyRequest } from '../services/strategyService';
import { DatabaseService } from '../services/database';
import { RedisService } from '../services/redis';
import { StrategyConfig } from '../types';

// Mock dependencies
jest.mock('../services/database');
jest.mock('../services/redis');

const mockDatabaseService = DatabaseService as jest.Mocked<typeof DatabaseService>;
const mockRedisService = RedisService as jest.Mocked<typeof RedisService>;

describe('StrategyService', () => {
  let strategyService: StrategyService;

  beforeEach(() => {
    strategyService = new StrategyService();
    jest.clearAllMocks();
  });

  const mockStrategyConfig: StrategyConfig = {
    nodes: [
      {
        id: 'node-1',
        type: 'entry',
        config: { indicator: 'SMA', period: 20 },
        position: { x: 100, y: 100 }
      }
    ],
    connections: [
      {
        id: 'conn-1',
        source: 'node-1',
        target: 'node-2',
        sourceHandle: 'output',
        targetHandle: 'input'
      }
    ],
    parameters: {
      timeframe: '1h',
      positionSizing: { method: 'fixed', amount: 1000 },
      riskManagement: { stopLoss: 2, takeProfit: 4 }
    }
  };

  describe('createStrategy', () => {
    it('should create strategy successfully', async () => {
      const createRequest: CreateStrategyRequest = {
        name: 'Test Strategy',
        description: 'Test Description',
        config: mockStrategyConfig,
        tags: ['test', 'sma']
      };

      const mockDbRow = {
        id: 'strategy-123',
        user_id: 'user-123',
        name: 'Test Strategy',
        description: 'Test Description',
        config_json: JSON.stringify(mockStrategyConfig),
        version: 1,
        is_active: true,
        is_template: false,
        tags: ['test', 'sma'],
        parent_strategy_id: null,
        created_at: new Date(),
        updated_at: new Date()
      };

      mockDatabaseService.query.mockResolvedValueOnce({
        rows: [mockDbRow],
        rowCount: 1
      });

      mockRedisService.set.mockResolvedValueOnce();

      const result = await strategyService.createStrategy('user-123', createRequest);

      expect(result.id).toBe('strategy-123');
      expect(result.name).toBe('Test Strategy');
      expect(result.config).toEqual(mockStrategyConfig);
      expect(mockRedisService.set).toHaveBeenCalled();
    });

    it('should throw error for invalid strategy config', async () => {
      const invalidConfig = {
        nodes: [], // Empty nodes array
        connections: [],
        parameters: {} // Missing required parameters
      };

      const createRequest: CreateStrategyRequest = {
        name: 'Invalid Strategy',
        config: invalidConfig as StrategyConfig
      };

      await expect(strategyService.createStrategy('user-123', createRequest))
        .rejects.toThrow('Strategy must have parameters');
    });

    it('should validate node types', async () => {
      const invalidConfig = {
        nodes: [
          {
            id: 'node-1',
            type: 'invalid-type', // Invalid node type
            config: {},
            position: { x: 0, y: 0 }
          }
        ],
        connections: [],
        parameters: {
          timeframe: '1h',
          positionSizing: { method: 'fixed' },
          riskManagement: { stopLoss: 2 }
        }
      };

      const createRequest: CreateStrategyRequest = {
        name: 'Invalid Strategy',
        config: invalidConfig as StrategyConfig
      };

      await expect(strategyService.createStrategy('user-123', createRequest))
        .rejects.toThrow('Invalid node type: invalid-type');
    });
  });

  describe('getStrategyById', () => {
    it('should return cached strategy if available', async () => {
      const mockStrategy = {
        id: 'strategy-123',
        userId: 'user-123',
        name: 'Test Strategy',
        config: mockStrategyConfig,
        version: 1
      };

      mockRedisService.get.mockResolvedValueOnce(JSON.stringify(mockStrategy));

      const result = await strategyService.getStrategyById('strategy-123', 'user-123');

      expect(result).toEqual(mockStrategy);
      expect(mockDatabaseService.query).not.toHaveBeenCalled();
    });

    it('should fetch from database when not cached', async () => {
      const mockDbRow = {
        id: 'strategy-123',
        user_id: 'user-123',
        name: 'Test Strategy',
        description: 'Test Description',
        config_json: JSON.stringify(mockStrategyConfig),
        version: 1,
        is_active: true,
        is_template: false,
        tags: ['test'],
        parent_strategy_id: null,
        created_at: new Date(),
        updated_at: new Date()
      };

      mockRedisService.get.mockResolvedValueOnce(null);
      mockDatabaseService.query.mockResolvedValueOnce({
        rows: [mockDbRow],
        rowCount: 1
      });
      mockRedisService.set.mockResolvedValueOnce();

      const result = await strategyService.getStrategyById('strategy-123', 'user-123');

      expect(result.id).toBe('strategy-123');
      expect(result.config).toEqual(mockStrategyConfig);
      expect(mockRedisService.set).toHaveBeenCalled();
    });

    it('should throw error when strategy not found', async () => {
      mockRedisService.get.mockResolvedValueOnce(null);
      mockDatabaseService.query.mockResolvedValueOnce({
        rows: [],
        rowCount: 0
      });

      await expect(strategyService.getStrategyById('nonexistent', 'user-123'))
        .rejects.toThrow('Strategy not found');
    });
  });

  describe('getStrategies', () => {
    it('should return paginated strategies with filters', async () => {
      const mockDbRows = [
        {
          id: 'strategy-1',
          user_id: 'user-123',
          name: 'Strategy 1',
          config_json: JSON.stringify(mockStrategyConfig),
          version: 1,
          is_active: true,
          is_template: false,
          tags: ['test'],
          created_at: new Date(),
          updated_at: new Date()
        }
      ];

      // Mock count query
      mockDatabaseService.query
        .mockResolvedValueOnce({
          rows: [{ total: '1' }],
          rowCount: 1
        })
        // Mock strategies query
        .mockResolvedValueOnce({
          rows: mockDbRows,
          rowCount: 1
        });

      const result = await strategyService.getStrategies('user-123', { isActive: true });

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data[0].id).toBe('strategy-1');
      expect(result.pagination.total).toBe(1);
    });

    it('should handle search filters', async () => {
      mockDatabaseService.query
        .mockResolvedValueOnce({
          rows: [{ total: '0' }],
          rowCount: 1
        })
        .mockResolvedValueOnce({
          rows: [],
          rowCount: 0
        });

      const result = await strategyService.getStrategies('user-123', { search: 'nonexistent' });

      expect(result.data).toHaveLength(0);
      expect(result.pagination.total).toBe(0);
    });
  });

  describe('updateStrategy', () => {
    it('should update strategy successfully', async () => {
      const updateRequest: UpdateStrategyRequest = {
        name: 'Updated Strategy',
        description: 'Updated Description'
      };

      // Mock getStrategyById call
      const mockExistingStrategy = {
        id: 'strategy-123',
        userId: 'user-123',
        name: 'Original Strategy',
        config: mockStrategyConfig
      };

      mockRedisService.get.mockResolvedValueOnce(JSON.stringify(mockExistingStrategy));

      const mockUpdatedRow = {
        id: 'strategy-123',
        user_id: 'user-123',
        name: 'Updated Strategy',
        description: 'Updated Description',
        config_json: JSON.stringify(mockStrategyConfig),
        version: 1,
        is_active: true,
        is_template: false,
        tags: [],
        parent_strategy_id: null,
        created_at: new Date(),
        updated_at: new Date()
      };

      mockDatabaseService.query.mockResolvedValueOnce({
        rows: [mockUpdatedRow],
        rowCount: 1
      });

      mockRedisService.set.mockResolvedValueOnce();

      const result = await strategyService.updateStrategy('strategy-123', 'user-123', updateRequest);

      expect(result.name).toBe('Updated Strategy');
      expect(result.description).toBe('Updated Description');
    });

    it('should throw error when no fields to update', async () => {
      const mockExistingStrategy = {
        id: 'strategy-123',
        userId: 'user-123',
        name: 'Original Strategy',
        config: mockStrategyConfig
      };

      mockRedisService.get.mockResolvedValueOnce(JSON.stringify(mockExistingStrategy));

      await expect(strategyService.updateStrategy('strategy-123', 'user-123', {}))
        .rejects.toThrow('No fields to update');
    });

    it('should validate config when updating', async () => {
      const mockExistingStrategy = {
        id: 'strategy-123',
        userId: 'user-123',
        name: 'Original Strategy',
        config: mockStrategyConfig
      };

      mockRedisService.get.mockResolvedValueOnce(JSON.stringify(mockExistingStrategy));

      const invalidConfig = {
        nodes: [],
        connections: [],
        parameters: {} // Missing required parameters
      };

      const updateRequest: UpdateStrategyRequest = {
        config: invalidConfig as StrategyConfig
      };

      await expect(strategyService.updateStrategy('strategy-123', 'user-123', updateRequest))
        .rejects.toThrow('Strategy must have parameters');
    });
  });

  describe('deleteStrategy', () => {
    it('should delete strategy successfully when no active executions', async () => {
      const mockExistingStrategy = {
        id: 'strategy-123',
        userId: 'user-123',
        name: 'Test Strategy',
        config: mockStrategyConfig
      };

      mockRedisService.get.mockResolvedValueOnce(JSON.stringify(mockExistingStrategy));

      // Mock execution check query
      mockDatabaseService.query
        .mockResolvedValueOnce({
          rows: [{ count: '0' }], // No active executions
          rowCount: 1
        })
        // Mock delete query
        .mockResolvedValueOnce({
          rows: [],
          rowCount: 1
        });

      mockRedisService.del.mockResolvedValueOnce();

      await strategyService.deleteStrategy('strategy-123', 'user-123');

      expect(mockDatabaseService.query).toHaveBeenCalledTimes(2);
      expect(mockRedisService.del).toHaveBeenCalled();
    });

    it('should throw error when strategy has active executions', async () => {
      const mockExistingStrategy = {
        id: 'strategy-123',
        userId: 'user-123',
        name: 'Test Strategy',
        config: mockStrategyConfig
      };

      mockRedisService.get.mockResolvedValueOnce(JSON.stringify(mockExistingStrategy));

      mockDatabaseService.query.mockResolvedValueOnce({
        rows: [{ count: '2' }], // Has active executions
        rowCount: 1
      });

      await expect(strategyService.deleteStrategy('strategy-123', 'user-123'))
        .rejects.toThrow('Cannot delete strategy with active executions');
    });
  });

  describe('createStrategyVersion', () => {
    it('should create new version successfully', async () => {
      const mockOriginalStrategy = {
        id: 'strategy-123',
        userId: 'user-123',
        name: 'Original Strategy',
        description: 'Original Description',
        config: mockStrategyConfig,
        version: 1,
        tags: ['original']
      };

      mockRedisService.get.mockResolvedValueOnce(JSON.stringify(mockOriginalStrategy));

      const mockNewVersionRow = {
        id: 'strategy-456',
        user_id: 'user-123',
        name: 'Updated Strategy',
        description: 'Updated Description',
        config_json: JSON.stringify(mockStrategyConfig),
        version: 2,
        is_active: true,
        is_template: false,
        tags: [],
        parent_strategy_id: 'strategy-123',
        created_at: new Date(),
        updated_at: new Date()
      };

      mockDatabaseService.query.mockResolvedValueOnce({
        rows: [mockNewVersionRow],
        rowCount: 1
      });

      mockRedisService.set.mockResolvedValueOnce();

      const updateRequest: UpdateStrategyRequest = {
        name: 'Updated Strategy',
        description: 'Updated Description'
      };

      const result = await strategyService.createStrategyVersion('strategy-123', 'user-123', updateRequest);

      expect(result.id).toBe('strategy-456');
      expect(result.version).toBe(2);
      expect(result.parentStrategyId).toBe('strategy-123');
      expect(result.name).toBe('Updated Strategy');
    });
  });

  describe('shareAsTemplate', () => {
    it('should share strategy as template successfully', async () => {
      const mockOriginalStrategy = {
        id: 'strategy-123',
        userId: 'user-123',
        name: 'My Strategy',
        description: 'My Description',
        config: mockStrategyConfig,
        tags: ['personal']
      };

      mockRedisService.get.mockResolvedValueOnce(JSON.stringify(mockOriginalStrategy));

      const mockTemplateRow = {
        id: 'template-456',
        user_id: 'user-123',
        name: 'My Strategy (Template)',
        description: 'My Description',
        config_json: JSON.stringify(mockStrategyConfig),
        version: 1,
        is_active: true,
        is_template: true,
        tags: ['personal', 'template'],
        parent_strategy_id: null,
        created_at: new Date(),
        updated_at: new Date()
      };

      mockDatabaseService.query.mockResolvedValueOnce({
        rows: [mockTemplateRow],
        rowCount: 1
      });

      mockRedisService.set.mockResolvedValueOnce();

      const result = await strategyService.shareAsTemplate('strategy-123', 'user-123');

      expect(result.id).toBe('template-456');
      expect(result.isTemplate).toBe(true);
      expect(result.name).toBe('My Strategy (Template)');
      expect(result.tags).toContain('template');
    });
  });
});