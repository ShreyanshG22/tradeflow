import { PortfolioService } from '../services/portfolioService';
import { databaseService } from '../services/database';
import { redisService } from '../services/redis';
import { CreatePortfolioRequest, UpdatePortfolioRequest, PortfolioFilter } from '../types';

// Mock dependencies
jest.mock('../services/database');
jest.mock('../services/redis');

const mockDatabaseService = databaseService as jest.Mocked<typeof databaseService>;
const mockRedisService = redisService as jest.Mocked<typeof redisService>;

describe('PortfolioService', () => {
  let portfolioService: PortfolioService;

  beforeEach(() => {
    portfolioService = new PortfolioService();
    jest.clearAllMocks();
  });

  describe('createPortfolio', () => {
    it('should create portfolio successfully', async () => {
      const mockRequest: CreatePortfolioRequest = {
        name: 'Test Portfolio',
        description: 'Test Description',
        portfolioType: 'live',
        baseCurrency: 'USD',
        initialCash: 10000
      };

      const mockDbRow = {
        id: 'portfolio-123',
        user_id: 'user-123',
        name: 'Test Portfolio',
        description: 'Test Description',
        portfolio_type: 'live',
        base_currency: 'USD',
        initial_cash: '10000',
        cash_balance: '10000',
        total_value: '10000',
        unrealized_pnl: '0',
        realized_pnl: '0',
        is_active: true,
        created_at: new Date(),
        updated_at: new Date()
      };

      mockDatabaseService.query.mockResolvedValueOnce({
        rows: [mockDbRow],
        rowCount: 1
      });

      mockRedisService.set.mockResolvedValueOnce();

      const result = await portfolioService.createPortfolio('user-123', mockRequest);

      expect(result.id).toBe('portfolio-123');
      expect(result.name).toBe('Test Portfolio');
      expect(result.initialCash).toBe(10000);
      expect(mockRedisService.set).toHaveBeenCalled();
    });

    it('should handle database errors', async () => {
      const mockRequest: CreatePortfolioRequest = {
        name: 'Test Portfolio',
        portfolioType: 'live',
        initialCash: 10000
      };

      mockDatabaseService.query.mockRejectedValueOnce(new Error('Database error'));

      await expect(portfolioService.createPortfolio('user-123', mockRequest))
        .rejects.toThrow('Database error');
    });
  });

  describe('getPortfolio', () => {
    it('should return cached portfolio if available', async () => {
      const mockPortfolio = {
        id: 'portfolio-123',
        userId: 'user-123',
        name: 'Test Portfolio',
        portfolioType: 'live',
        initialCash: 10000,
        cashBalance: 10000,
        totalValue: 10000
      };

      mockRedisService.get.mockResolvedValueOnce(JSON.stringify(mockPortfolio));

      const result = await portfolioService.getPortfolio('portfolio-123');

      expect(result).toEqual(mockPortfolio);
      expect(mockDatabaseService.query).not.toHaveBeenCalled();
    });

    it('should fetch from database when not cached', async () => {
      const mockDbRow = {
        id: 'portfolio-123',
        user_id: 'user-123',
        name: 'Test Portfolio',
        description: 'Test Description',
        portfolio_type: 'live',
        base_currency: 'USD',
        initial_cash: '10000',
        cash_balance: '10000',
        total_value: '10000',
        unrealized_pnl: '0',
        realized_pnl: '0',
        is_active: true,
        created_at: new Date(),
        updated_at: new Date()
      };

      mockRedisService.get.mockResolvedValueOnce(null);
      mockDatabaseService.query.mockResolvedValueOnce({
        rows: [mockDbRow],
        rowCount: 1
      });
      mockRedisService.set.mockResolvedValueOnce();

      const result = await portfolioService.getPortfolio('portfolio-123');

      expect(result?.id).toBe('portfolio-123');
      expect(mockRedisService.set).toHaveBeenCalled();
    });

    it('should return null when portfolio not found', async () => {
      mockRedisService.get.mockResolvedValueOnce(null);
      mockDatabaseService.query.mockResolvedValueOnce({
        rows: [],
        rowCount: 0
      });

      const result = await portfolioService.getPortfolio('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('getUserPortfolios', () => {
    it('should return user portfolios with filters', async () => {
      const filter: PortfolioFilter = {
        userId: 'user-123',
        portfolioType: 'live',
        isActive: true,
        limit: 10
      };

      const mockDbRows = [
        {
          id: 'portfolio-1',
          user_id: 'user-123',
          name: 'Portfolio 1',
          portfolio_type: 'live',
          base_currency: 'USD',
          initial_cash: '10000',
          cash_balance: '10000',
          total_value: '10000',
          unrealized_pnl: '0',
          realized_pnl: '0',
          is_active: true,
          created_at: new Date(),
          updated_at: new Date()
        }
      ];

      mockDatabaseService.query.mockResolvedValueOnce({
        rows: mockDbRows,
        rowCount: 1
      });

      const result = await portfolioService.getUserPortfolios(filter);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('portfolio-1');
    });

    it('should handle empty results', async () => {
      const filter: PortfolioFilter = {
        userId: 'user-123'
      };

      mockDatabaseService.query.mockResolvedValueOnce({
        rows: [],
        rowCount: 0
      });

      const result = await portfolioService.getUserPortfolios(filter);

      expect(result).toHaveLength(0);
    });
  });

  describe('updatePortfolio', () => {
    it('should update portfolio successfully', async () => {
      const updateRequest: UpdatePortfolioRequest = {
        name: 'Updated Portfolio',
        description: 'Updated Description'
      };

      const mockDbRow = {
        id: 'portfolio-123',
        user_id: 'user-123',
        name: 'Updated Portfolio',
        description: 'Updated Description',
        portfolio_type: 'live',
        base_currency: 'USD',
        initial_cash: '10000',
        cash_balance: '10000',
        total_value: '10000',
        unrealized_pnl: '0',
        realized_pnl: '0',
        is_active: true,
        created_at: new Date(),
        updated_at: new Date()
      };

      mockDatabaseService.query.mockResolvedValueOnce({
        rows: [mockDbRow],
        rowCount: 1
      });
      mockRedisService.set.mockResolvedValueOnce();

      const result = await portfolioService.updatePortfolio('portfolio-123', updateRequest);

      expect(result.name).toBe('Updated Portfolio');
      expect(result.description).toBe('Updated Description');
    });

    it('should throw error when no fields to update', async () => {
      await expect(portfolioService.updatePortfolio('portfolio-123', {}))
        .rejects.toThrow('No fields to update');
    });

    it('should throw error when portfolio not found', async () => {
      const updateRequest: UpdatePortfolioRequest = {
        name: 'Updated Portfolio'
      };

      mockDatabaseService.query.mockResolvedValueOnce({
        rows: [],
        rowCount: 0
      });

      await expect(portfolioService.updatePortfolio('portfolio-123', updateRequest))
        .rejects.toThrow('Portfolio not found');
    });
  });

  describe('deletePortfolio', () => {
    it('should delete portfolio successfully when no active positions', async () => {
      const mockClient = {
        query: jest.fn()
          .mockResolvedValueOnce({ rows: [{ count: '0' }] }) // No active positions
          .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // Update portfolio
      };

      mockDatabaseService.transaction.mockImplementation(async (callback) => {
        return await callback(mockClient);
      });

      mockRedisService.del.mockResolvedValueOnce();

      await portfolioService.deletePortfolio('portfolio-123');

      expect(mockClient.query).toHaveBeenCalledTimes(2);
      expect(mockRedisService.del).toHaveBeenCalled();
    });

    it('should throw error when portfolio has active positions', async () => {
      const mockClient = {
        query: jest.fn()
          .mockResolvedValueOnce({ rows: [{ count: '5' }] }) // Has active positions
      };

      mockDatabaseService.transaction.mockImplementation(async (callback) => {
        return await callback(mockClient);
      });

      await expect(portfolioService.deletePortfolio('portfolio-123'))
        .rejects.toThrow('Cannot delete portfolio with active positions');
    });
  });

  describe('getPortfolioValuation', () => {
    it('should return cached valuation if available', async () => {
      const mockValuation = {
        portfolioId: 'portfolio-123',
        totalValue: 15000,
        cashBalance: 5000,
        positionsValue: 10000,
        unrealizedPnl: 1000,
        realizedPnl: 500,
        positions: [],
        timestamp: new Date()
      };

      mockRedisService.get.mockResolvedValueOnce(JSON.stringify(mockValuation));

      const result = await portfolioService.getPortfolioValuation('portfolio-123');

      expect(result).toEqual(mockValuation);
      expect(mockDatabaseService.query).not.toHaveBeenCalled();
    });

    it('should calculate valuation when not cached', async () => {
      mockRedisService.get.mockResolvedValueOnce(null);
      
      // Mock portfolio valuation query
      mockDatabaseService.query
        .mockResolvedValueOnce({
          rows: [{
            id: 'portfolio-123',
            cash_balance: '5000',
            unrealized_pnl: '0',
            realized_pnl: '500',
            positions_value: '10000',
            total_unrealized_pnl: '1000'
          }],
          rowCount: 1
        })
        .mockResolvedValueOnce({
          rows: [],
          rowCount: 0
        });

      mockRedisService.set.mockResolvedValueOnce();

      const result = await portfolioService.getPortfolioValuation('portfolio-123');

      expect(result.portfolioId).toBe('portfolio-123');
      expect(result.totalValue).toBe(15000);
      expect(result.cashBalance).toBe(5000);
      expect(mockRedisService.set).toHaveBeenCalled();
    });
  });
});