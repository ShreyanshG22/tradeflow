import request from 'supertest';
import { app } from '../../index';
import { DatabaseService } from '../../../user-service/src/services/database';
import { RedisService } from '../../../user-service/src/services/redis';

describe('Portfolio Service Integration Tests', () => {
  let authToken: string;
  let testUserId: string;
  let portfolioId: string;

  beforeAll(async () => {
    await DatabaseService.initialize();
    await RedisService.initialize();

    // Create test user
    const registerResponse = await request(app)
      .post('/api/auth/register')
      .send({
        email: 'portfolio-integration-test@example.com',
        password: 'TestPassword123',
        firstName: 'Portfolio',
        lastName: 'Integration'
      });

    authToken = registerResponse.body.accessToken;
    testUserId = registerResponse.body.user.id;
  });

  afterAll(async () => {
    // Clean up test data
    await DatabaseService.query('DELETE FROM users WHERE id = $1', [testUserId]);
    await DatabaseService.close();
    await RedisService.close();
  });

  beforeEach(async () => {
    // Clean up portfolio data before each test
    await DatabaseService.query('DELETE FROM portfolios WHERE user_id = $1', [testUserId]);
  });

  describe('Portfolio Management Integration', () => {
    it('should create portfolio with initial configuration', async () => {
      const portfolioData = {
        name: 'Integration Test Portfolio',
        description: 'Portfolio for integration testing',
        initialBalance: 100000,
        currency: 'USD',
        riskProfile: 'moderate'
      };

      const response = await request(app)
        .post('/api/portfolio/create')
        .set('Authorization', `Bearer ${authToken}`)
        .send(portfolioData);

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('id');
      expect(response.body.name).toBe(portfolioData.name);
      expect(response.body.cashBalance).toBe(portfolioData.initialBalance);
      expect(response.body.totalValue).toBe(portfolioData.initialBalance);
      
      portfolioId = response.body.id;

      // Verify database storage
      const dbResult = await DatabaseService.query(
        'SELECT * FROM portfolios WHERE id = $1',
        [portfolioId]
      );

      expect(dbResult.rows).toHaveLength(1);
      expect(dbResult.rows[0].name).toBe(portfolioData.name);
      expect(parseFloat(dbResult.rows[0].cash_balance)).toBe(portfolioData.initialBalance);
    });

    it('should retrieve portfolio with current valuation', async () => {
      // Create portfolio first
      const createResponse = await request(app)
        .post('/api/portfolio/create')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Valuation Test Portfolio',
          initialBalance: 50000
        });

      portfolioId = createResponse.body.id;

      // Add some positions
      await request(app)
        .post('/api/portfolio/manual-trade')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          portfolioId,
          symbol: 'AAPL',
          side: 'buy',
          quantity: 10,
          type: 'market'
        });

      // Get portfolio overview
      const response = await request(app)
        .get('/api/portfolio')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('totalValue');
      expect(response.body).toHaveProperty('cashBalance');
      expect(response.body).toHaveProperty('positions');
      expect(response.body).toHaveProperty('performance');
      expect(Array.isArray(response.body.positions)).toBe(true);
    });

    it('should handle multiple portfolios per user', async () => {
      const portfolios = [
        { name: 'Conservative Portfolio', initialBalance: 25000 },
        { name: 'Aggressive Portfolio', initialBalance: 75000 },
        { name: 'Retirement Portfolio', initialBalance: 150000 }
      ];

      const createdPortfolios = [];

      // Create multiple portfolios
      for (const portfolio of portfolios) {
        const response = await request(app)
          .post('/api/portfolio/create')
          .set('Authorization', `Bearer ${authToken}`)
          .send(portfolio);

        expect(response.status).toBe(201);
        createdPortfolios.push(response.body);
      }

      // Get all portfolios
      const listResponse = await request(app)
        .get('/api/portfolio/list')
        .set('Authorization', `Bearer ${authToken}`);

      expect(listResponse.status).toBe(200);
      expect(Array.isArray(listResponse.body.portfolios)).toBe(true);
      expect(listResponse.body.portfolios).toHaveLength(3);

      // Verify total value calculation
      const totalValue = listResponse.body.portfolios.reduce(
        (sum, p) => sum + p.totalValue, 0
      );
      expect(totalValue).toBe(250000);
    });
  });

  describe('Trading Operations Integration', () => {
    beforeEach(async () => {
      // Create test portfolio
      const createResponse = await request(app)
        .post('/api/portfolio/create')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Trading Test Portfolio',
          initialBalance: 100000
        });

      portfolioId = createResponse.body.id;
    });

    it('should execute buy order and update positions', async () => {
      const tradeData = {
        portfolioId,
        symbol: 'AAPL',
        side: 'buy',
        quantity: 50,
        type: 'market'
      };

      const response = await request(app)
        .post('/api/portfolio/manual-trade')
        .set('Authorization', `Bearer ${authToken}`)
        .send(tradeData);

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('id');
      expect(response.body.symbol).toBe('AAPL');
      expect(response.body.side).toBe('buy');
      expect(response.body.quantity).toBe(50);
      expect(response.body.status).toBe('filled');

      // Verify position created
      const positionsResponse = await request(app)
        .get('/api/portfolio/positions')
        .set('Authorization', `Bearer ${authToken}`);

      expect(positionsResponse.status).toBe(200);
      expect(positionsResponse.body.positions).toHaveLength(1);
      
      const position = positionsResponse.body.positions[0];
      expect(position.symbol).toBe('AAPL');
      expect(position.quantity).toBe(50);
      expect(position.status).toBe('open');

      // Verify database consistency
      const dbPositions = await DatabaseService.query(
        'SELECT * FROM positions WHERE portfolio_id = $1',
        [portfolioId]
      );

      expect(dbPositions.rows).toHaveLength(1);
      expect(dbPositions.rows[0].symbol).toBe('AAPL');
      expect(parseInt(dbPositions.rows[0].quantity)).toBe(50);
    });

    it('should handle partial sell orders correctly', async () => {
      // First, buy some shares
      await request(app)
        .post('/api/portfolio/manual-trade')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          portfolioId,
          symbol: 'GOOGL',
          side: 'buy',
          quantity: 20,
          type: 'market'
        });

      // Then sell partial position
      const sellResponse = await request(app)
        .post('/api/portfolio/manual-trade')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          portfolioId,
          symbol: 'GOOGL',
          side: 'sell',
          quantity: 8,
          type: 'market'
        });

      expect(sellResponse.status).toBe(201);
      expect(sellResponse.body.side).toBe('sell');
      expect(sellResponse.body.quantity).toBe(8);

      // Verify remaining position
      const positionsResponse = await request(app)
        .get('/api/portfolio/positions')
        .set('Authorization', `Bearer ${authToken}`);

      const position = positionsResponse.body.positions.find(p => p.symbol === 'GOOGL');
      expect(position.quantity).toBe(12); // 20 - 8 = 12
    });

    it('should handle complete position closure', async () => {
      // Buy shares
      await request(app)
        .post('/api/portfolio/manual-trade')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          portfolioId,
          symbol: 'MSFT',
          side: 'buy',
          quantity: 15,
          type: 'market'
        });

      // Sell all shares
      const sellResponse = await request(app)
        .post('/api/portfolio/manual-trade')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          portfolioId,
          symbol: 'MSFT',
          side: 'sell',
          quantity: 15,
          type: 'market'
        });

      expect(sellResponse.status).toBe(201);

      // Verify position is closed
      const positionsResponse = await request(app)
        .get('/api/portfolio/positions?status=open')
        .set('Authorization', `Bearer ${authToken}`);

      const openPositions = positionsResponse.body.positions.filter(p => p.symbol === 'MSFT');
      expect(openPositions).toHaveLength(0);

      // Verify closed position exists
      const closedResponse = await request(app)
        .get('/api/portfolio/positions?status=closed')
        .set('Authorization', `Bearer ${authToken}`);

      const closedPositions = closedResponse.body.positions.filter(p => p.symbol === 'MSFT');
      expect(closedPositions).toHaveLength(1);
      expect(closedPositions[0].status).toBe('closed');
    });

    it('should calculate P&L correctly', async () => {
      // Buy at one price
      const buyResponse = await request(app)
        .post('/api/portfolio/manual-trade')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          portfolioId,
          symbol: 'TSLA',
          side: 'buy',
          quantity: 10,
          price: 200.00,
          type: 'limit'
        });

      const buyPrice = buyResponse.body.price;

      // Sell at different price
      const sellResponse = await request(app)
        .post('/api/portfolio/manual-trade')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          portfolioId,
          symbol: 'TSLA',
          side: 'sell',
          quantity: 10,
          price: 220.00,
          type: 'limit'
        });

      const sellPrice = sellResponse.body.price;

      // Get trade history
      const tradesResponse = await request(app)
        .get('/api/portfolio/trades')
        .set('Authorization', `Bearer ${authToken}`);

      expect(tradesResponse.status).toBe(200);
      expect(tradesResponse.body.trades).toHaveLength(2);

      // Calculate expected P&L
      const expectedPnL = (sellPrice - buyPrice) * 10;
      
      // Get performance metrics
      const performanceResponse = await request(app)
        .get('/api/portfolio/performance')
        .set('Authorization', `Bearer ${authToken}`);

      expect(performanceResponse.status).toBe(200);
      expect(performanceResponse.body).toHaveProperty('realizedPnL');
      expect(Math.abs(performanceResponse.body.realizedPnL - expectedPnL)).toBeLessThan(0.01);
    });

    it('should handle insufficient funds gracefully', async () => {
      // Try to buy more than available cash
      const response = await request(app)
        .post('/api/portfolio/manual-trade')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          portfolioId,
          symbol: 'AMZN',
          side: 'buy',
          quantity: 1000, // This should exceed available funds
          type: 'market'
        });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('INSUFFICIENT_FUNDS');

      // Verify no position was created
      const positionsResponse = await request(app)
        .get('/api/portfolio/positions')
        .set('Authorization', `Bearer ${authToken}`);

      const amazonPositions = positionsResponse.body.positions.filter(p => p.symbol === 'AMZN');
      expect(amazonPositions).toHaveLength(0);
    });

    it('should handle short selling restrictions', async () => {
      // Try to sell without owning shares
      const response = await request(app)
        .post('/api/portfolio/manual-trade')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          portfolioId,
          symbol: 'NVDA',
          side: 'sell',
          quantity: 10,
          type: 'market'
        });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('INSUFFICIENT_SHARES');
    });
  });

  describe('Performance Analytics Integration', () => {
    beforeEach(async () => {
      // Create test portfolio with some trades
      const createResponse = await request(app)
        .post('/api/portfolio/create')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Performance Test Portfolio',
          initialBalance: 100000
        });

      portfolioId = createResponse.body.id;

      // Execute some sample trades
      const trades = [
        { symbol: 'AAPL', side: 'buy', quantity: 20, price: 150.00 },
        { symbol: 'GOOGL', side: 'buy', quantity: 5, price: 2000.00 },
        { symbol: 'AAPL', side: 'sell', quantity: 10, price: 155.00 },
      ];

      for (const trade of trades) {
        await request(app)
          .post('/api/portfolio/manual-trade')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            portfolioId,
            ...trade,
            type: 'limit'
          });
      }
    });

    it('should calculate comprehensive performance metrics', async () => {
      const response = await request(app)
        .get('/api/portfolio/performance')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('totalReturn');
      expect(response.body).toHaveProperty('totalReturnPercentage');
      expect(response.body).toHaveProperty('realizedPnL');
      expect(response.body).toHaveProperty('unrealizedPnL');
      expect(response.body).toHaveProperty('sharpeRatio');
      expect(response.body).toHaveProperty('maxDrawdown');
      expect(response.body).toHaveProperty('winRate');
      expect(response.body).toHaveProperty('profitFactor');
      expect(response.body).toHaveProperty('averageWin');
      expect(response.body).toHaveProperty('averageLoss');

      // Verify calculations are reasonable
      expect(typeof response.body.totalReturn).toBe('number');
      expect(typeof response.body.sharpeRatio).toBe('number');
      expect(response.body.winRate).toBeGreaterThanOrEqual(0);
      expect(response.body.winRate).toBeLessThanOrEqual(1);
    });

    it('should provide performance over different timeframes', async () => {
      const timeframes = ['1d', '1w', '1m', '3m', '1y', 'all'];

      for (const timeframe of timeframes) {
        const response = await request(app)
          .get(`/api/portfolio/performance?timeframe=${timeframe}`)
          .set('Authorization', `Bearer ${authToken}`);

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('timeframe');
        expect(response.body.timeframe).toBe(timeframe);
        expect(response.body).toHaveProperty('totalReturn');
      }
    });

    it('should generate equity curve data', async () => {
      const response = await request(app)
        .get('/api/portfolio/equity-curve')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('equityCurve');
      expect(Array.isArray(response.body.equityCurve)).toBe(true);
      expect(response.body.equityCurve.length).toBeGreaterThan(0);

      // Verify data structure
      const dataPoint = response.body.equityCurve[0];
      expect(dataPoint).toHaveProperty('timestamp');
      expect(dataPoint).toHaveProperty('portfolioValue');
      expect(dataPoint).toHaveProperty('cashBalance');
      expect(dataPoint).toHaveProperty('positionsValue');
    });

    it('should calculate risk metrics', async () => {
      const response = await request(app)
        .get('/api/portfolio/risk-metrics')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('volatility');
      expect(response.body).toHaveProperty('beta');
      expect(response.body).toHaveProperty('valueAtRisk');
      expect(response.body).toHaveProperty('expectedShortfall');
      expect(response.body).toHaveProperty('correlationMatrix');
      expect(response.body).toHaveProperty('sectorAllocation');

      // Verify risk metrics are reasonable
      expect(response.body.volatility).toBeGreaterThanOrEqual(0);
      expect(response.body.valueAtRisk).toBeLessThanOrEqual(0); // VaR should be negative
    });

    it('should provide benchmark comparison', async () => {
      const response = await request(app)
        .get('/api/portfolio/benchmark-comparison?benchmark=SPY')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('portfolioReturn');
      expect(response.body).toHaveProperty('benchmarkReturn');
      expect(response.body).toHaveProperty('alpha');
      expect(response.body).toHaveProperty('beta');
      expect(response.body).toHaveProperty('trackingError');
      expect(response.body).toHaveProperty('informationRatio');

      // Verify comparison metrics
      expect(typeof response.body.alpha).toBe('number');
      expect(typeof response.body.beta).toBe('number');
    });
  });

  describe('Multi-Currency Support Integration', () => {
    beforeEach(async () => {
      // Create multi-currency portfolio
      const createResponse = await request(app)
        .post('/api/portfolio/create')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Multi-Currency Portfolio',
          initialBalance: 100000,
          currency: 'USD',
          supportedCurrencies: ['USD', 'EUR', 'GBP', 'JPY']
        });

      portfolioId = createResponse.body.id;
    });

    it('should handle trades in different currencies', async () => {
      // Buy European stock
      const eurTradeResponse = await request(app)
        .post('/api/portfolio/manual-trade')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          portfolioId,
          symbol: 'SAP.DE',
          side: 'buy',
          quantity: 10,
          price: 100.00,
          currency: 'EUR',
          type: 'limit'
        });

      expect(eurTradeResponse.status).toBe(201);
      expect(eurTradeResponse.body.currency).toBe('EUR');

      // Buy UK stock
      const gbpTradeResponse = await request(app)
        .post('/api/portfolio/manual-trade')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          portfolioId,
          symbol: 'VODL.L',
          side: 'buy',
          quantity: 100,
          price: 1.50,
          currency: 'GBP',
          type: 'limit'
        });

      expect(gbpTradeResponse.status).toBe(201);
      expect(gbpTradeResponse.body.currency).toBe('GBP');

      // Get portfolio overview with currency conversion
      const portfolioResponse = await request(app)
        .get('/api/portfolio?baseCurrency=USD')
        .set('Authorization', `Bearer ${authToken}`);

      expect(portfolioResponse.status).toBe(200);
      expect(portfolioResponse.body).toHaveProperty('totalValueUSD');
      expect(portfolioResponse.body).toHaveProperty('currencyBreakdown');
      expect(portfolioResponse.body.currencyBreakdown).toHaveProperty('EUR');
      expect(portfolioResponse.body.currencyBreakdown).toHaveProperty('GBP');
    });

    it('should handle currency conversion rates', async () => {
      const response = await request(app)
        .get('/api/portfolio/currency-rates')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('rates');
      expect(response.body).toHaveProperty('baseCurrency');
      expect(response.body).toHaveProperty('lastUpdated');

      // Verify common currency pairs
      expect(response.body.rates).toHaveProperty('EUR');
      expect(response.body.rates).toHaveProperty('GBP');
      expect(response.body.rates).toHaveProperty('JPY');
    });

    it('should calculate performance in different base currencies', async () => {
      // Add some multi-currency positions first
      await request(app)
        .post('/api/portfolio/manual-trade')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          portfolioId,
          symbol: 'ASML.AS',
          side: 'buy',
          quantity: 5,
          price: 600.00,
          currency: 'EUR',
          type: 'limit'
        });

      // Get performance in USD
      const usdPerformance = await request(app)
        .get('/api/portfolio/performance?baseCurrency=USD')
        .set('Authorization', `Bearer ${authToken}`);

      expect(usdPerformance.status).toBe(200);
      expect(usdPerformance.body.baseCurrency).toBe('USD');

      // Get performance in EUR
      const eurPerformance = await request(app)
        .get('/api/portfolio/performance?baseCurrency=EUR')
        .set('Authorization', `Bearer ${authToken}`);

      expect(eurPerformance.status).toBe(200);
      expect(eurPerformance.body.baseCurrency).toBe('EUR');

      // Values should be different due to currency conversion
      expect(usdPerformance.body.totalReturn).not.toBe(eurPerformance.body.totalReturn);
    });
  });

  describe('Portfolio Service Error Handling', () => {
    it('should handle invalid trade parameters', async () => {
      // Create portfolio first
      const createResponse = await request(app)
        .post('/api/portfolio/create')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Error Test Portfolio',
          initialBalance: 50000
        });

      portfolioId = createResponse.body.id;

      const invalidTrades = [
        { symbol: '', side: 'buy', quantity: 10 }, // Empty symbol
        { symbol: 'AAPL', side: 'invalid', quantity: 10 }, // Invalid side
        { symbol: 'AAPL', side: 'buy', quantity: -10 }, // Negative quantity
        { symbol: 'AAPL', side: 'buy', quantity: 0 }, // Zero quantity
        { symbol: 'AAPL', side: 'buy', quantity: 10, price: -100 }, // Negative price
      ];

      for (const trade of invalidTrades) {
        const response = await request(app)
          .post('/api/portfolio/manual-trade')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            portfolioId,
            ...trade,
            type: 'limit'
          });

        expect(response.status).toBe(400);
        expect(response.body.error).toHaveProperty('code');
        expect(response.body.error.code).toBe('VALIDATION_ERROR');
      }
    });

    it('should handle concurrent trade operations', async () => {
      // Create portfolio
      const createResponse = await request(app)
        .post('/api/portfolio/create')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Concurrent Test Portfolio',
          initialBalance: 100000
        });

      portfolioId = createResponse.body.id;

      // Execute concurrent trades
      const concurrentTrades = [
        request(app)
          .post('/api/portfolio/manual-trade')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            portfolioId,
            symbol: 'AAPL',
            side: 'buy',
            quantity: 10,
            type: 'market'
          }),
        
        request(app)
          .post('/api/portfolio/manual-trade')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            portfolioId,
            symbol: 'GOOGL',
            side: 'buy',
            quantity: 5,
            type: 'market'
          }),
        
        request(app)
          .post('/api/portfolio/manual-trade')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            portfolioId,
            symbol: 'MSFT',
            side: 'buy',
            quantity: 8,
            type: 'market'
          })
      ];

      const results = await Promise.all(concurrentTrades);

      // All should succeed or handle conflicts gracefully
      results.forEach(result => {
        expect([201, 409]).toContain(result.status);
      });

      // Verify final portfolio state is consistent
      const portfolioResponse = await request(app)
        .get('/api/portfolio')
        .set('Authorization', `Bearer ${authToken}`);

      expect(portfolioResponse.status).toBe(200);
      expect(portfolioResponse.body.positions.length).toBeGreaterThan(0);
    });

    it('should handle database transaction failures', async () => {
      // Create portfolio
      const createResponse = await request(app)
        .post('/api/portfolio/create')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Transaction Test Portfolio',
          initialBalance: 50000
        });

      portfolioId = createResponse.body.id;

      // Simulate a scenario that might cause transaction failure
      // (e.g., trying to trade with invalid portfolio ID)
      const response = await request(app)
        .post('/api/portfolio/manual-trade')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          portfolioId: 'invalid-portfolio-id',
          symbol: 'AAPL',
          side: 'buy',
          quantity: 10,
          type: 'market'
        });

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe('PORTFOLIO_NOT_FOUND');
    });

    it('should handle market data service failures', async () => {
      // Create portfolio
      const createResponse = await request(app)
        .post('/api/portfolio/create')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Market Data Test Portfolio',
          initialBalance: 50000
        });

      portfolioId = createResponse.body.id;

      // Try to get performance when market data is unavailable
      const response = await request(app)
        .get('/api/portfolio/performance')
        .set('Authorization', `Bearer ${authToken}`);

      // Should either work or gracefully handle market data unavailability
      expect([200, 503]).toContain(response.status);

      if (response.status === 503) {
        expect(response.body.error.code).toBe('MARKET_DATA_UNAVAILABLE');
      }
    });
  });
});