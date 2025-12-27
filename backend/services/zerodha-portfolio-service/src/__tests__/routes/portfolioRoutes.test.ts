import request from 'supertest';
import express from 'express';
import { portfolioRoutes } from '../../routes/portfolioRoutes';
import { errorHandler } from '../../middleware/errorHandler';

// Mock all the services
jest.mock('../../services/PositionService');
jest.mock('../../services/HoldingsService');
jest.mock('../../services/PnLService');
jest.mock('../../services/PortfolioSummaryService');

const app = express();
app.use(express.json());
app.use('/api/zerodha/portfolio', portfolioRoutes);
app.use(errorHandler);

describe('Portfolio Routes', () => {
  const mockAuthHeaders = {
    'Authorization': 'Bearer test-token',
    'x-user-id': 'test-user-routes'
  };

  describe('GET /api/zerodha/portfolio/positions', () => {
    it('should return positions summary', async () => {
      const mockPositionService = require('../../services/PositionService').PositionService;
      mockPositionService.mockImplementation(() => ({
        getPositionSummary: jest.fn().mockResolvedValue({
          total_positions: 2,
          total_market_value: 100000.00,
          total_unrealized_pnl: 5000.00,
          positions: []
        })
      }));

      const response = await request(app)
        .get('/api/zerodha/portfolio/positions')
        .set(mockAuthHeaders)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('total_positions', 2);
      expect(response.body.data).toHaveProperty('total_market_value', 100000.00);
    });

    it('should return 401 without authorization', async () => {
      const response = await request(app)
        .get('/api/zerodha/portfolio/positions')
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error.message).toBe('Authorization token required');
    });
  });

  describe('GET /api/zerodha/portfolio/positions/:symbol', () => {
    it('should return specific position', async () => {
      const mockPositionService = require('../../services/PositionService').PositionService;
      mockPositionService.mockImplementation(() => ({
        getPositionBySymbol: jest.fn().mockResolvedValue({
          id: 'pos-123',
          symbol: 'RELIANCE',
          exchange: 'NSE',
          quantity: 10,
          average_price: 2500.00,
          current_price: 2550.00
        })
      }));

      const response = await request(app)
        .get('/api/zerodha/portfolio/positions/RELIANCE')
        .set(mockAuthHeaders)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.symbol).toBe('RELIANCE');
      expect(response.body.data.quantity).toBe(10);
    });

    it('should return 404 for non-existent position', async () => {
      const mockPositionService = require('../../services/PositionService').PositionService;
      mockPositionService.mockImplementation(() => ({
        getPositionBySymbol: jest.fn().mockResolvedValue(null)
      }));

      const response = await request(app)
        .get('/api/zerodha/portfolio/positions/NONEXISTENT')
        .set(mockAuthHeaders)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error.message).toBe('Position not found');
    });
  });

  describe('GET /api/zerodha/portfolio/holdings', () => {
    it('should return holdings summary', async () => {
      const mockHoldingsService = require('../../services/HoldingsService').HoldingsService;
      mockHoldingsService.mockImplementation(() => ({
        getHoldingsSummary: jest.fn().mockResolvedValue({
          total_holdings: 5,
          total_investment_value: 200000.00,
          total_current_value: 220000.00,
          total_pnl: 20000.00,
          holdings: []
        })
      }));

      const response = await request(app)
        .get('/api/zerodha/portfolio/holdings')
        .set(mockAuthHeaders)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('total_holdings', 5);
      expect(response.body.data).toHaveProperty('total_pnl', 20000.00);
    });
  });

  describe('GET /api/zerodha/portfolio/pnl', () => {
    it('should return P&L breakdown', async () => {
      const mockPnLService = require('../../services/PnLService').PnLService;
      mockPnLService.mockImplementation(() => ({
        getCachedPnLData: jest.fn().mockResolvedValue(null),
        getPnLBreakdown: jest.fn().mockResolvedValue({
          realized_pnl: 5000.00,
          unrealized_pnl: 15000.00,
          day_pnl: 2000.00,
          total_pnl: 20000.00
        }),
        cachePnLData: jest.fn().mockResolvedValue(undefined)
      }));

      const response = await request(app)
        .get('/api/zerodha/portfolio/pnl')
        .set(mockAuthHeaders)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('realized_pnl', 5000.00);
      expect(response.body.data).toHaveProperty('unrealized_pnl', 15000.00);
      expect(response.body.data).toHaveProperty('total_pnl', 20000.00);
    });

    it('should return cached P&L data when available', async () => {
      const mockPnLService = require('../../services/PnLService').PnLService;
      const cachedData = {
        realized_pnl: 3000.00,
        unrealized_pnl: 12000.00,
        day_pnl: 1500.00,
        total_pnl: 15000.00
      };

      mockPnLService.mockImplementation(() => ({
        getCachedPnLData: jest.fn().mockResolvedValue(cachedData),
        getPnLBreakdown: jest.fn(),
        cachePnLData: jest.fn()
      }));

      const response = await request(app)
        .get('/api/zerodha/portfolio/pnl')
        .set(mockAuthHeaders)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(cachedData);
    });
  });

  describe('GET /api/zerodha/portfolio/summary', () => {
    it('should return portfolio summary', async () => {
      const mockPortfolioSummaryService = require('../../services/PortfolioSummaryService').PortfolioSummaryService;
      mockPortfolioSummaryService.mockImplementation(() => ({
        getCachedPortfolioSummary: jest.fn().mockResolvedValue(null),
        getPortfolioSummary: jest.fn().mockResolvedValue({
          user_id: 'test-user-routes',
          total_portfolio_value: 500000.00,
          total_investment: 450000.00,
          total_pnl: 50000.00,
          positions_count: 3,
          holdings_count: 7,
          cash_balance: 25000.00
        })
      }));

      const response = await request(app)
        .get('/api/zerodha/portfolio/summary')
        .set(mockAuthHeaders)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('user_id', 'test-user-routes');
      expect(response.body.data).toHaveProperty('total_portfolio_value', 500000.00);
      expect(response.body.data).toHaveProperty('positions_count', 3);
    });
  });

  describe('POST /api/zerodha/portfolio/sync', () => {
    it('should sync portfolio data successfully', async () => {
      const mockPositionService = require('../../services/PositionService').PositionService;
      const mockHoldingsService = require('../../services/HoldingsService').HoldingsService;

      mockPositionService.mockImplementation(() => ({
        fetchPositionsFromZerodha: jest.fn().mockResolvedValue([
          { tradingsymbol: 'POS1', quantity: 10 },
          { tradingsymbol: 'POS2', quantity: 5 }
        ]),
        syncPositionsToDatabase: jest.fn().mockResolvedValue(undefined)
      }));

      mockHoldingsService.mockImplementation(() => ({
        fetchHoldingsFromZerodha: jest.fn().mockResolvedValue([
          { tradingsymbol: 'HOLD1', quantity: 20 },
          { tradingsymbol: 'HOLD2', quantity: 15 },
          { tradingsymbol: 'HOLD3', quantity: 30 }
        ]),
        syncHoldingsToDatabase: jest.fn().mockResolvedValue(undefined)
      }));

      const response = await request(app)
        .post('/api/zerodha/portfolio/sync')
        .set(mockAuthHeaders)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Portfolio data synced successfully');
      expect(response.body.data.positions_synced).toBe(2);
      expect(response.body.data.holdings_synced).toBe(3);
    });
  });

  describe('PUT /api/zerodha/portfolio/holdings/prices', () => {
    it('should update holding prices successfully', async () => {
      const mockHoldingsService = require('../../services/HoldingsService').HoldingsService;
      mockHoldingsService.mockImplementation(() => ({
        updateHoldingPrices: jest.fn().mockResolvedValue(undefined)
      }));

      const priceUpdates = [
        { symbol: 'RELIANCE', exchange: 'NSE', price: 2600.00 },
        { symbol: 'TCS', exchange: 'NSE', price: 3700.00 }
      ];

      const response = await request(app)
        .put('/api/zerodha/portfolio/holdings/prices')
        .set(mockAuthHeaders)
        .send({ price_updates: priceUpdates })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Holding prices updated successfully');
    });

    it('should return 400 for invalid price_updates format', async () => {
      const response = await request(app)
        .put('/api/zerodha/portfolio/holdings/prices')
        .set(mockAuthHeaders)
        .send({ price_updates: 'invalid' })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.message).toBe('price_updates must be an array');
    });
  });

  describe('Error handling', () => {
    it('should handle service errors gracefully', async () => {
      const mockPositionService = require('../../services/PositionService').PositionService;
      mockPositionService.mockImplementation(() => ({
        getPositionSummary: jest.fn().mockRejectedValue(new Error('Service unavailable'))
      }));

      const response = await request(app)
        .get('/api/zerodha/portfolio/positions')
        .set(mockAuthHeaders)
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error.message).toBe('Failed to fetch positions');
    });
  });
});