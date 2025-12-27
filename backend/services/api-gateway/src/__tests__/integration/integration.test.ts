import request from 'supertest';
import { Server } from 'http';
import { app, server } from '../../index';
import { DatabaseService } from '../../../user-service/src/services/database';
import { RedisService } from '../../../user-service/src/services/redis';
import io from 'socket.io-client';

describe('End-to-End Integration Tests', () => {
  let testServer: Server;
  let authToken: string;
  let testUserId: string;
  let portfolioId: string;
  let strategyId: string;

  beforeAll(async () => {
    // Initialize all services
    await DatabaseService.initialize();
    await RedisService.initialize();
    testServer = server;
  });

  afterAll(async () => {
    // Clean up all test data
    if (testUserId) {
      await DatabaseService.query('DELETE FROM users WHERE id = $1', [testUserId]);
    }
    await DatabaseService.close();
    await RedisService.close();
    testServer.close();
  });

  beforeEach(async () => {
    // Clean up any existing test data
    await DatabaseService.query('DELETE FROM users WHERE email LIKE $1', ['%integration-test%']);
  });

  describe('Complete User Workflow Integration', () => {
    it('should complete full user registration to trading workflow', async () => {
      // Step 1: User Registration
      const registerResponse = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'integration-test@example.com',
          password: 'TestPassword123',
          firstName: 'Integration',
          lastName: 'Test'
        });

      expect(registerResponse.status).toBe(201);
      expect(registerResponse.body).toHaveProperty('accessToken');
      authToken = registerResponse.body.accessToken;
      testUserId = registerResponse.body.user.id;

      // Step 2: Create Portfolio
      const portfolioResponse = await request(app)
        .post('/api/portfolio/create')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Integration Test Portfolio',
          initialBalance: 10000
        });

      expect(portfolioResponse.status).toBe(201);
      portfolioId = portfolioResponse.body.id;

      // Step 3: Create Strategy
      const strategyResponse = await request(app)
        .post('/api/strategies')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Integration Test Strategy',
          description: 'End-to-end test strategy',
          nodes: [
            {
              id: 'entry-1',
              type: 'entry',
              config: { indicator: 'sma', period: 20, comparison: 'above' },
              position: { x: 100, y: 100 }
            },
            {
              id: 'exit-1',
              type: 'exit',
              config: { type: 'stop_loss', percentage: 0.02 },
              position: { x: 300, y: 100 }
            }
          ],
          connections: [
            { from: 'entry-1', to: 'exit-1' }
          ],
          parameters: {
            timeframe: '1h',
            positionSizing: { type: 'fixed', amount: 1000 },
            riskManagement: { stopLoss: 0.02, takeProfit: 0.04 }
          }
        });

      expect(strategyResponse.status).toBe(201);
      strategyId = strategyResponse.body.id;

      // Step 4: Validate Strategy
      const validationResponse = await request(app)
        .post(`/api/strategies/${strategyId}/validate`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(validationResponse.status).toBe(200);
      expect(validationResponse.body.isValid).toBe(true);

      // Step 5: Run Backtest
      const backtestResponse = await request(app)
        .post('/api/backtests')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          strategyId,
          symbol: 'AAPL',
          startDate: '2023-01-01',
          endDate: '2023-12-31',
          initialCapital: 10000
        });

      expect(backtestResponse.status).toBe(201);
      const backtestId = backtestResponse.body.id;

      // Step 6: Wait for backtest completion and get results
      let backtestComplete = false;
      let attempts = 0;
      const maxAttempts = 10;

      while (!backtestComplete && attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        const statusResponse = await request(app)
          .get(`/api/backtests/${backtestId}`)
          .set('Authorization', `Bearer ${authToken}`);

        if (statusResponse.body.status === 'completed') {
          backtestComplete = true;
          expect(statusResponse.body).toHaveProperty('results');
          expect(statusResponse.body.results).toHaveProperty('totalReturn');
          expect(statusResponse.body.results).toHaveProperty('sharpeRatio');
        }
        attempts++;
      }

      expect(backtestComplete).toBe(true);

      // Step 7: Get Portfolio Performance
      const performanceResponse = await request(app)
        .get('/api/portfolio/performance')
        .set('Authorization', `Bearer ${authToken}`);

      expect(performanceResponse.status).toBe(200);
      expect(performanceResponse.body).toHaveProperty('totalValue');
    });

    it('should handle complete trading workflow with real-time updates', async () => {
      // Setup user and portfolio first
      const registerResponse = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'trading-integration-test@example.com',
          password: 'TestPassword123',
          firstName: 'Trading',
          lastName: 'Test'
        });

      authToken = registerResponse.body.accessToken;
      testUserId = registerResponse.body.user.id;

      // Create WebSocket connection for real-time updates
      const client = io('http://localhost:3001', {
        auth: { token: authToken }
      });

      await new Promise((resolve) => {
        client.on('connect', resolve);
      });

      // Subscribe to portfolio updates
      client.emit('subscribe:portfolio', { userId: testUserId });

      let portfolioUpdateReceived = false;
      client.on('portfolio:update', (data) => {
        portfolioUpdateReceived = true;
        expect(data).toHaveProperty('totalValue');
        expect(data).toHaveProperty('positions');
      });

      // Create manual trade
      const tradeResponse = await request(app)
        .post('/api/portfolio/manual-trade')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          symbol: 'AAPL',
          side: 'buy',
          quantity: 10,
          type: 'market'
        });

      expect(tradeResponse.status).toBe(201);

      // Wait for real-time update
      await new Promise(resolve => setTimeout(resolve, 2000));
      expect(portfolioUpdateReceived).toBe(true);

      client.disconnect();
    });
  });

  describe('Service-to-Service Communication Integration', () => {
    beforeEach(async () => {
      // Setup test user for service communication tests
      const registerResponse = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'service-comm-test@example.com',
          password: 'TestPassword123',
          firstName: 'Service',
          lastName: 'Test'
        });

      authToken = registerResponse.body.accessToken;
      testUserId = registerResponse.body.user.id;
    });

    it('should handle API Gateway to User Service communication', async () => {
      // Test authentication flow through API Gateway to User Service
      const profileResponse = await request(app)
        .get('/api/users/profile')
        .set('Authorization', `Bearer ${authToken}`);

      expect(profileResponse.status).toBe(200);
      expect(profileResponse.body.email).toBe('service-comm-test@example.com');

      // Test profile update through services
      const updateResponse = await request(app)
        .put('/api/users/profile')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          firstName: 'Updated',
          phone: '+1234567890'
        });

      expect(updateResponse.status).toBe(200);
      expect(updateResponse.body.firstName).toBe('Updated');
    });

    it('should handle API Gateway to Strategy Service communication', async () => {
      // Create strategy through API Gateway to Strategy Service
      const strategyResponse = await request(app)
        .post('/api/strategies')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Service Communication Test',
          nodes: [{ id: 'test-1', type: 'entry' }],
          connections: [],
          parameters: { timeframe: '1h' }
        });

      expect(strategyResponse.status).toBe(201);
      strategyId = strategyResponse.body.id;

      // Validate strategy through service communication
      const validationResponse = await request(app)
        .post(`/api/strategies/${strategyId}/validate`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(validationResponse.status).toBe(200);
      expect(validationResponse.body).toHaveProperty('isValid');
    });

    it('should handle API Gateway to Market Data Service communication', async () => {
      // Test market data retrieval through services
      const quoteResponse = await request(app)
        .get('/api/market-data/quote/AAPL')
        .set('Authorization', `Bearer ${authToken}`);

      expect(quoteResponse.status).toBe(200);
      expect(quoteResponse.body).toHaveProperty('symbol');
      expect(quoteResponse.body.symbol).toBe('AAPL');

      // Test historical data through services
      const historicalResponse = await request(app)
        .get('/api/market-data/historical/AAPL?timeframe=1d&startDate=2023-01-01&endDate=2023-01-31')
        .set('Authorization', `Bearer ${authToken}`);

      expect(historicalResponse.status).toBe(200);
      expect(Array.isArray(historicalResponse.body.data)).toBe(true);
    });

    it('should handle API Gateway to Portfolio Service communication', async () => {
      // Test portfolio operations through service communication
      const portfolioResponse = await request(app)
        .get('/api/portfolio')
        .set('Authorization', `Bearer ${authToken}`);

      expect(portfolioResponse.status).toBe(200);
      expect(portfolioResponse.body).toHaveProperty('totalValue');

      // Test trade execution through services
      const tradeResponse = await request(app)
        .post('/api/portfolio/manual-trade')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          symbol: 'MSFT',
          side: 'buy',
          quantity: 5,
          type: 'market'
        });

      expect(tradeResponse.status).toBe(201);
      expect(tradeResponse.body.symbol).toBe('MSFT');
    });

    it('should handle cross-service data consistency', async () => {
      // Create strategy in Strategy Service
      const strategyResponse = await request(app)
        .post('/api/strategies')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Cross-Service Test',
          nodes: [{ id: 'test-1', type: 'entry' }],
          connections: [],
          parameters: { timeframe: '1h' }
        });

      strategyId = strategyResponse.body.id;

      // Run backtest that involves Strategy Service and Market Data Service
      const backtestResponse = await request(app)
        .post('/api/backtests')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          strategyId,
          symbol: 'AAPL',
          startDate: '2023-01-01',
          endDate: '2023-01-31',
          initialCapital: 10000
        });

      expect(backtestResponse.status).toBe(201);

      // Verify data consistency across services
      const strategyCheck = await request(app)
        .get(`/api/strategies/${strategyId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(strategyCheck.status).toBe(200);
      expect(strategyCheck.body.id).toBe(strategyId);
    });
  });

  describe('Database Transaction and Consistency Integration', () => {
    beforeEach(async () => {
      const registerResponse = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'db-transaction-test@example.com',
          password: 'TestPassword123',
          firstName: 'Database',
          lastName: 'Test'
        });

      authToken = registerResponse.body.accessToken;
      testUserId = registerResponse.body.user.id;
    });

    it('should maintain transaction consistency across multiple operations', async () => {
      // Start a complex operation that involves multiple database operations
      const portfolioResponse = await request(app)
        .post('/api/portfolio/create')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Transaction Test Portfolio',
          initialBalance: 10000
        });

      expect(portfolioResponse.status).toBe(201);
      portfolioId = portfolioResponse.body.id;

      // Execute multiple trades in sequence to test transaction consistency
      const trades = [
        { symbol: 'AAPL', side: 'buy', quantity: 10 },
        { symbol: 'GOOGL', side: 'buy', quantity: 5 },
        { symbol: 'MSFT', side: 'buy', quantity: 8 }
      ];

      const tradePromises = trades.map(trade =>
        request(app)
          .post('/api/portfolio/manual-trade')
          .set('Authorization', `Bearer ${authToken}`)
          .send({ ...trade, type: 'market' })
      );

      const tradeResponses = await Promise.all(tradePromises);
      
      // All trades should succeed
      tradeResponses.forEach(response => {
        expect(response.status).toBe(201);
      });

      // Verify portfolio consistency
      const portfolioCheck = await request(app)
        .get('/api/portfolio')
        .set('Authorization', `Bearer ${authToken}`);

      expect(portfolioCheck.status).toBe(200);
      expect(portfolioCheck.body.positions).toHaveLength(3);

      // Verify database consistency
      const dbPositions = await DatabaseService.query(
        'SELECT * FROM positions WHERE portfolio_id = $1',
        [portfolioId]
      );

      expect(dbPositions.rows).toHaveLength(3);
    });

    it('should handle transaction rollback on failure', async () => {
      // Create a scenario that should trigger rollback
      const portfolioResponse = await request(app)
        .post('/api/portfolio/create')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Rollback Test Portfolio',
          initialBalance: 1000 // Small balance to trigger insufficient funds
        });

      portfolioId = portfolioResponse.body.id;

      // Try to execute a trade that exceeds available balance
      const tradeResponse = await request(app)
        .post('/api/portfolio/manual-trade')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          symbol: 'AAPL',
          side: 'buy',
          quantity: 100, // This should exceed available balance
          type: 'market'
        });

      expect(tradeResponse.status).toBe(400);
      expect(tradeResponse.body.error.code).toBe('INSUFFICIENT_FUNDS');

      // Verify no position was created due to rollback
      const portfolioCheck = await request(app)
        .get('/api/portfolio/positions')
        .set('Authorization', `Bearer ${authToken}`);

      expect(portfolioCheck.body.positions).toHaveLength(0);
    });

    it('should maintain referential integrity across services', async () => {
      // Create strategy
      const strategyResponse = await request(app)
        .post('/api/strategies')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Referential Integrity Test',
          nodes: [{ id: 'test-1', type: 'entry' }],
          connections: [],
          parameters: { timeframe: '1h' }
        });

      strategyId = strategyResponse.body.id;

      // Create backtest that references the strategy
      const backtestResponse = await request(app)
        .post('/api/backtests')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          strategyId,
          symbol: 'AAPL',
          startDate: '2023-01-01',
          endDate: '2023-01-31',
          initialCapital: 10000
        });

      expect(backtestResponse.status).toBe(201);

      // Try to delete strategy that has dependent backtest
      const deleteResponse = await request(app)
        .delete(`/api/strategies/${strategyId}`)
        .set('Authorization', `Bearer ${authToken}`);

      // Should either prevent deletion or cascade properly
      if (deleteResponse.status === 400) {
        expect(deleteResponse.body.error.code).toBe('STRATEGY_HAS_DEPENDENCIES');
      } else {
        expect(deleteResponse.status).toBe(200);
        
        // If cascade delete, verify backtest is also removed
        const backtestCheck = await request(app)
          .get(`/api/backtests/${backtestResponse.body.id}`)
          .set('Authorization', `Bearer ${authToken}`);
        
        expect(backtestCheck.status).toBe(404);
      }
    });

    it('should handle concurrent database operations correctly', async () => {
      const portfolioResponse = await request(app)
        .post('/api/portfolio/create')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Concurrent Test Portfolio',
          initialBalance: 10000
        });

      portfolioId = portfolioResponse.body.id;

      // Execute concurrent operations
      const concurrentOperations = [
        request(app)
          .post('/api/portfolio/manual-trade')
          .set('Authorization', `Bearer ${authToken}`)
          .send({ symbol: 'AAPL', side: 'buy', quantity: 5, type: 'market' }),
        
        request(app)
          .post('/api/portfolio/manual-trade')
          .set('Authorization', `Bearer ${authToken}`)
          .send({ symbol: 'GOOGL', side: 'buy', quantity: 3, type: 'market' }),
        
        request(app)
          .get('/api/portfolio/performance')
          .set('Authorization', `Bearer ${authToken}`),
        
        request(app)
          .get('/api/portfolio/positions')
          .set('Authorization', `Bearer ${authToken}`)
      ];

      const results = await Promise.all(concurrentOperations);
      
      // All operations should complete successfully
      results.forEach((result, index) => {
        if (index < 2) { // Trade operations
          expect(result.status).toBe(201);
        } else { // Read operations
          expect(result.status).toBe(200);
        }
      });

      // Verify final state is consistent
      const finalState = await request(app)
        .get('/api/portfolio')
        .set('Authorization', `Bearer ${authToken}`);

      expect(finalState.status).toBe(200);
      expect(finalState.body.positions).toHaveLength(2);
    });
  });

  describe('Market Data Pipeline Integration', () => {
    beforeEach(async () => {
      const registerResponse = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'market-data-test@example.com',
          password: 'TestPassword123',
          firstName: 'MarketData',
          lastName: 'Test'
        });

      authToken = registerResponse.body.accessToken;
      testUserId = registerResponse.body.user.id;
    });

    it('should handle real-time market data flow', async () => {
      // Subscribe to real-time market data
      const client = io('http://localhost:3001', {
        auth: { token: authToken }
      });

      await new Promise((resolve) => {
        client.on('connect', resolve);
      });

      let marketDataReceived = false;
      client.emit('subscribe:market-data', { symbols: ['AAPL', 'GOOGL'] });

      client.on('market-data:update', (data) => {
        marketDataReceived = true;
        expect(data).toHaveProperty('symbol');
        expect(data).toHaveProperty('price');
        expect(data).toHaveProperty('timestamp');
      });

      // Trigger market data update (simulate)
      await request(app)
        .post('/api/market-data/simulate-update')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          symbol: 'AAPL',
          price: 150.25,
          volume: 1000000
        });

      // Wait for real-time update
      await new Promise(resolve => setTimeout(resolve, 2000));
      expect(marketDataReceived).toBe(true);

      client.disconnect();
    });

    it('should handle market data caching and retrieval', async () => {
      // Test market data caching
      const firstRequest = await request(app)
        .get('/api/market-data/quote/AAPL')
        .set('Authorization', `Bearer ${authToken}`);

      expect(firstRequest.status).toBe(200);
      const firstTimestamp = firstRequest.body.timestamp;

      // Second request should use cache
      const secondRequest = await request(app)
        .get('/api/market-data/quote/AAPL')
        .set('Authorization', `Bearer ${authToken}`);

      expect(secondRequest.status).toBe(200);
      
      // Should be from cache (same timestamp or very close)
      const timeDiff = Math.abs(
        new Date(secondRequest.body.timestamp).getTime() - 
        new Date(firstTimestamp).getTime()
      );
      expect(timeDiff).toBeLessThan(5000); // Within 5 seconds
    });

    it('should handle historical data processing pipeline', async () => {
      // Request historical data processing
      const historicalRequest = await request(app)
        .get('/api/market-data/historical/AAPL?timeframe=1d&startDate=2023-01-01&endDate=2023-01-31')
        .set('Authorization', `Bearer ${authToken}`);

      expect(historicalRequest.status).toBe(200);
      expect(Array.isArray(historicalRequest.body.data)).toBe(true);
      expect(historicalRequest.body.data.length).toBeGreaterThan(0);

      // Verify data structure
      const dataPoint = historicalRequest.body.data[0];
      expect(dataPoint).toHaveProperty('timestamp');
      expect(dataPoint).toHaveProperty('open');
      expect(dataPoint).toHaveProperty('high');
      expect(dataPoint).toHaveProperty('low');
      expect(dataPoint).toHaveProperty('close');
      expect(dataPoint).toHaveProperty('volume');
    });

    it('should handle market data provider failover', async () => {
      // Test primary provider
      const primaryRequest = await request(app)
        .get('/api/market-data/quote/AAPL?provider=primary')
        .set('Authorization', `Bearer ${authToken}`);

      // Test fallback provider
      const fallbackRequest = await request(app)
        .get('/api/market-data/quote/AAPL?provider=fallback')
        .set('Authorization', `Bearer ${authToken}`);

      // Both should work
      expect(primaryRequest.status).toBe(200);
      expect(fallbackRequest.status).toBe(200);

      // Data should be consistent
      expect(primaryRequest.body.symbol).toBe(fallbackRequest.body.symbol);
    });

    it('should handle market data validation and normalization', async () => {
      // Test data validation
      const validationRequest = await request(app)
        .post('/api/market-data/validate')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          symbol: 'AAPL',
          data: [
            { timestamp: '2023-01-01T10:00:00Z', price: 150.25, volume: 1000000 },
            { timestamp: '2023-01-01T10:01:00Z', price: 150.30, volume: 1500000 }
          ]
        });

      expect(validationRequest.status).toBe(200);
      expect(validationRequest.body).toHaveProperty('isValid');
      expect(validationRequest.body).toHaveProperty('normalizedData');
    });
  });

  describe('Strategy Execution End-to-End Integration', () => {
    beforeEach(async () => {
      const registerResponse = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'strategy-execution-test@example.com',
          password: 'TestPassword123',
          firstName: 'Strategy',
          lastName: 'Test'
        });

      authToken = registerResponse.body.accessToken;
      testUserId = registerResponse.body.user.id;
    });

    it('should execute complete strategy lifecycle', async () => {
      // Step 1: Create strategy
      const strategyResponse = await request(app)
        .post('/api/strategies')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Complete Lifecycle Strategy',
          description: 'Full strategy execution test',
          nodes: [
            {
              id: 'entry-1',
              type: 'entry',
              config: { 
                indicator: 'sma', 
                period: 20, 
                comparison: 'crossover',
                target: { indicator: 'sma', period: 50 }
              },
              position: { x: 100, y: 100 }
            },
            {
              id: 'position-size-1',
              type: 'position-size',
              config: { type: 'risk_based', riskPercentage: 0.02 },
              position: { x: 200, y: 100 }
            },
            {
              id: 'exit-1',
              type: 'exit',
              config: { type: 'stop_loss', percentage: 0.02 },
              position: { x: 300, y: 100 }
            },
            {
              id: 'exit-2',
              type: 'exit',
              config: { type: 'take_profit', percentage: 0.04 },
              position: { x: 300, y: 200 }
            }
          ],
          connections: [
            { from: 'entry-1', to: 'position-size-1' },
            { from: 'position-size-1', to: 'exit-1' },
            { from: 'position-size-1', to: 'exit-2' }
          ],
          parameters: {
            timeframe: '1h',
            symbols: ['AAPL'],
            riskManagement: {
              maxPositionSize: 0.1,
              maxDailyLoss: 0.05,
              maxDrawdown: 0.15
            }
          }
        });

      expect(strategyResponse.status).toBe(201);
      strategyId = strategyResponse.body.id;

      // Step 2: Validate strategy
      const validationResponse = await request(app)
        .post(`/api/strategies/${strategyId}/validate`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(validationResponse.status).toBe(200);
      expect(validationResponse.body.isValid).toBe(true);

      // Step 3: Run backtest
      const backtestResponse = await request(app)
        .post('/api/backtests')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          strategyId,
          symbol: 'AAPL',
          startDate: '2023-01-01',
          endDate: '2023-12-31',
          initialCapital: 100000
        });

      expect(backtestResponse.status).toBe(201);
      const backtestId = backtestResponse.body.id;

      // Step 4: Monitor backtest progress
      let backtestComplete = false;
      let attempts = 0;
      const maxAttempts = 15;

      while (!backtestComplete && attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        const statusResponse = await request(app)
          .get(`/api/backtests/${backtestId}`)
          .set('Authorization', `Bearer ${authToken}`);

        if (statusResponse.body.status === 'completed') {
          backtestComplete = true;
          
          // Verify backtest results
          expect(statusResponse.body.results).toHaveProperty('totalReturn');
          expect(statusResponse.body.results).toHaveProperty('sharpeRatio');
          expect(statusResponse.body.results).toHaveProperty('maxDrawdown');
          expect(statusResponse.body.results).toHaveProperty('winRate');
          expect(statusResponse.body.results).toHaveProperty('trades');
          expect(Array.isArray(statusResponse.body.results.trades)).toBe(true);
        }
        attempts++;
      }

      expect(backtestComplete).toBe(true);

      // Step 5: Activate strategy for paper trading
      const activationResponse = await request(app)
        .post(`/api/strategies/${strategyId}/activate`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          mode: 'paper',
          allocation: 10000
        });

      expect(activationResponse.status).toBe(200);
      expect(activationResponse.body.status).toBe('active');
    });

    it('should handle strategy execution with real-time market data', async () => {
      // Create simple strategy for real-time execution
      const strategyResponse = await request(app)
        .post('/api/strategies')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Real-time Execution Strategy',
          nodes: [
            {
              id: 'entry-1',
              type: 'entry',
              config: { indicator: 'price', comparison: 'above', value: 150 },
              position: { x: 100, y: 100 }
            }
          ],
          connections: [],
          parameters: {
            timeframe: '1m',
            symbols: ['AAPL']
          }
        });

      strategyId = strategyResponse.body.id;

      // Setup WebSocket for real-time updates
      const client = io('http://localhost:3001', {
        auth: { token: authToken }
      });

      await new Promise((resolve) => {
        client.on('connect', resolve);
      });

      let signalReceived = false;
      client.emit('subscribe:strategy-signals', { strategyId });

      client.on('strategy:signal', (data) => {
        signalReceived = true;
        expect(data).toHaveProperty('strategyId');
        expect(data).toHaveProperty('signal');
        expect(data).toHaveProperty('timestamp');
      });

      // Activate strategy
      await request(app)
        .post(`/api/strategies/${strategyId}/activate`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          mode: 'paper',
          allocation: 5000
        });

      // Simulate market data that should trigger signal
      await request(app)
        .post('/api/market-data/simulate-update')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          symbol: 'AAPL',
          price: 155.00, // Above threshold
          volume: 1000000
        });

      // Wait for signal
      await new Promise(resolve => setTimeout(resolve, 3000));
      expect(signalReceived).toBe(true);

      client.disconnect();
    });

    it('should handle strategy risk management integration', async () => {
      // Create strategy with risk management
      const strategyResponse = await request(app)
        .post('/api/strategies')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Risk Management Strategy',
          nodes: [
            {
              id: 'entry-1',
              type: 'entry',
              config: { indicator: 'rsi', period: 14, comparison: 'below', value: 30 },
              position: { x: 100, y: 100 }
            }
          ],
          connections: [],
          parameters: {
            timeframe: '1h',
            symbols: ['AAPL'],
            riskManagement: {
              maxPositionSize: 0.05, // 5% max position
              stopLoss: 0.02,
              takeProfit: 0.04,
              maxDailyLoss: 0.03
            }
          }
        });

      strategyId = strategyResponse.body.id;

      // Test risk validation
      const riskValidationResponse = await request(app)
        .post(`/api/strategies/${strategyId}/validate-risk`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          portfolioValue: 100000,
          currentPositions: [
            { symbol: 'GOOGL', value: 20000 },
            { symbol: 'MSFT', value: 15000 }
          ]
        });

      expect(riskValidationResponse.status).toBe(200);
      expect(riskValidationResponse.body).toHaveProperty('riskAssessment');
      expect(riskValidationResponse.body).toHaveProperty('maxAllowedPosition');
    });

    it('should handle strategy performance monitoring', async () => {
      // Create and activate strategy
      const strategyResponse = await request(app)
        .post('/api/strategies')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Performance Monitoring Strategy',
          nodes: [{ id: 'entry-1', type: 'entry' }],
          connections: [],
          parameters: { timeframe: '1h' }
        });

      strategyId = strategyResponse.body.id;

      await request(app)
        .post(`/api/strategies/${strategyId}/activate`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          mode: 'paper',
          allocation: 10000
        });

      // Get strategy performance metrics
      const performanceResponse = await request(app)
        .get(`/api/strategies/${strategyId}/performance`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(performanceResponse.status).toBe(200);
      expect(performanceResponse.body).toHaveProperty('totalReturn');
      expect(performanceResponse.body).toHaveProperty('sharpeRatio');
      expect(performanceResponse.body).toHaveProperty('drawdown');
      expect(performanceResponse.body).toHaveProperty('trades');
    });
  });

  describe('Error Handling and Recovery Scenarios', () => {
    beforeEach(async () => {
      const registerResponse = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'error-handling-test@example.com',
          password: 'TestPassword123',
          firstName: 'Error',
          lastName: 'Test'
        });

      authToken = registerResponse.body.accessToken;
      testUserId = registerResponse.body.user.id;
    });

    it('should handle database connection failures gracefully', async () => {
      // Simulate database connection issue by making invalid query
      const response = await request(app)
        .get('/api/strategies?invalid=true')
        .set('Authorization', `Bearer ${authToken}`);

      // Should return appropriate error, not crash
      expect([200, 500, 503]).toContain(response.status);
      
      if (response.status >= 500) {
        expect(response.body.error).toHaveProperty('code');
        expect(response.body.error.code).toMatch(/DATABASE|CONNECTION|SERVICE/);
      }
    });

    it('should handle service unavailability with circuit breaker', async () => {
      // Test circuit breaker behavior with multiple failed requests
      const failedRequests = [];
      
      for (let i = 0; i < 5; i++) {
        failedRequests.push(
          request(app)
            .get('/api/market-data/quote/INVALID_SYMBOL')
            .set('Authorization', `Bearer ${authToken}`)
        );
      }

      const responses = await Promise.all(failedRequests);
      
      // Should handle failures gracefully
      responses.forEach(response => {
        expect([404, 500, 503]).toContain(response.status);
        expect(response.body.error).toHaveProperty('message');
      });
    });

    it('should handle partial system failures', async () => {
      // Test system behavior when one service is down
      const portfolioResponse = await request(app)
        .get('/api/portfolio')
        .set('Authorization', `Bearer ${authToken}`);

      // Portfolio service should work even if market data service has issues
      expect([200, 503]).toContain(portfolioResponse.status);
      
      if (portfolioResponse.status === 200) {
        expect(portfolioResponse.body).toHaveProperty('totalValue');
      }
    });

    it('should handle timeout scenarios', async () => {
      // Test request timeout handling
      const timeoutResponse = await request(app)
        .get('/api/market-data/historical/AAPL?timeframe=1m&startDate=2020-01-01&endDate=2023-12-31')
        .set('Authorization', `Bearer ${authToken}`)
        .timeout(5000);

      // Should either complete or timeout gracefully
      expect([200, 408, 504]).toContain(timeoutResponse.status);
      
      if (timeoutResponse.status >= 400) {
        expect(timeoutResponse.body.error).toHaveProperty('code');
      }
    });

    it('should handle data corruption scenarios', async () => {
      // Test handling of corrupted data
      const corruptDataResponse = await request(app)
        .post('/api/strategies')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Corrupt Data Test',
          nodes: 'invalid_json_structure',
          connections: null,
          parameters: undefined
        });

      expect(corruptDataResponse.status).toBe(400);
      expect(corruptDataResponse.body.error).toHaveProperty('message');
      expect(corruptDataResponse.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should handle concurrent access conflicts', async () => {
      // Create strategy first
      const strategyResponse = await request(app)
        .post('/api/strategies')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Concurrent Access Test',
          nodes: [{ id: 'test-1', type: 'entry' }],
          connections: [],
          parameters: { timeframe: '1h' }
        });

      strategyId = strategyResponse.body.id;

      // Simulate concurrent updates
      const concurrentUpdates = [
        request(app)
          .put(`/api/strategies/${strategyId}`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({ name: 'Updated Name 1' }),
        
        request(app)
          .put(`/api/strategies/${strategyId}`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({ name: 'Updated Name 2' }),
        
        request(app)
          .delete(`/api/strategies/${strategyId}`)
          .set('Authorization', `Bearer ${authToken}`)
      ];

      const results = await Promise.all(concurrentUpdates);
      
      // Should handle conflicts gracefully
      const successfulOperations = results.filter(r => r.status < 400);
      const conflictErrors = results.filter(r => r.status === 409);
      
      expect(successfulOperations.length + conflictErrors.length).toBe(3);
    });

    it('should handle authentication token expiration', async () => {
      // Use expired or invalid token
      const expiredTokenResponse = await request(app)
        .get('/api/strategies')
        .set('Authorization', 'Bearer invalid_expired_token');

      expect(expiredTokenResponse.status).toBe(401);
      expect(expiredTokenResponse.body.error.code).toBe('INVALID_TOKEN');

      // Test token refresh on expiration
      const refreshResponse = await request(app)
        .post('/api/auth/refresh')
        .send({
          refreshToken: 'invalid_refresh_token'
        });

      expect(refreshResponse.status).toBe(401);
      expect(refreshResponse.body.error.code).toBe('INVALID_REFRESH_TOKEN');
    });

    it('should handle rate limiting gracefully', async () => {
      // Make rapid requests to trigger rate limiting
      const rapidRequests = [];
      
      for (let i = 0; i < 50; i++) {
        rapidRequests.push(
          request(app)
            .get('/api/portfolio')
            .set('Authorization', `Bearer ${authToken}`)
        );
      }

      const responses = await Promise.all(rapidRequests);
      
      // Some requests should be rate limited
      const rateLimitedResponses = responses.filter(r => r.status === 429);
      const successfulResponses = responses.filter(r => r.status === 200);
      
      expect(rateLimitedResponses.length).toBeGreaterThan(0);
      expect(successfulResponses.length).toBeGreaterThan(0);
      
      // Rate limited responses should have proper headers
      rateLimitedResponses.forEach(response => {
        expect(response.headers).toHaveProperty('retry-after');
      });
    });
  });
});