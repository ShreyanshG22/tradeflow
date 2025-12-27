import request from 'supertest';
import { app } from '../../index';
import { DatabaseService } from '../../../user-service/src/services/database';
import { RedisService } from '../../../user-service/src/services/redis';

describe('Strategy Service Integration Tests', () => {
  let authToken: string;
  let testUserId: string;

  beforeAll(async () => {
    await DatabaseService.initialize();
    await RedisService.initialize();

    // Create test user for strategy operations
    const registerResponse = await request(app)
      .post('/api/auth/register')
      .send({
        email: 'strategy-integration-test@example.com',
        password: 'TestPassword123',
        firstName: 'Strategy',
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
    // Clean up strategies before each test
    await DatabaseService.query('DELETE FROM strategies WHERE user_id = $1', [testUserId]);
  });

  describe('Strategy CRUD Integration', () => {
    it('should create strategy with complex configuration', async () => {
      const strategyConfig = {
        name: 'Complex Integration Strategy',
        description: 'A complex strategy for integration testing',
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
            id: 'filter-1',
            type: 'filter',
            config: {
              indicator: 'rsi',
              period: 14,
              comparison: 'above',
              value: 30
            },
            position: { x: 200, y: 100 }
          },
          {
            id: 'position-size-1',
            type: 'position-size',
            config: {
              type: 'risk_based',
              riskPercentage: 0.02,
              maxPositionSize: 0.1
            },
            position: { x: 300, y: 100 }
          },
          {
            id: 'exit-1',
            type: 'exit',
            config: {
              type: 'stop_loss',
              percentage: 0.02
            },
            position: { x: 400, y: 100 }
          },
          {
            id: 'exit-2',
            type: 'exit',
            config: {
              type: 'take_profit',
              percentage: 0.04
            },
            position: { x: 400, y: 200 }
          }
        ],
        connections: [
          { from: 'entry-1', to: 'filter-1' },
          { from: 'filter-1', to: 'position-size-1' },
          { from: 'position-size-1', to: 'exit-1' },
          { from: 'position-size-1', to: 'exit-2' }
        ],
        parameters: {
          timeframe: '1h',
          symbols: ['AAPL', 'GOOGL', 'MSFT'],
          riskManagement: {
            maxPositionSize: 0.1,
            maxDailyLoss: 0.05,
            maxDrawdown: 0.15,
            stopLoss: 0.02,
            takeProfit: 0.04
          },
          execution: {
            orderType: 'market',
            slippage: 0.001,
            commission: 0.001
          }
        }
      };

      const response = await request(app)
        .post('/api/strategies')
        .set('Authorization', `Bearer ${authToken}`)
        .send(strategyConfig);

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('id');
      expect(response.body.name).toBe(strategyConfig.name);
      expect(response.body.nodes).toHaveLength(5);
      expect(response.body.connections).toHaveLength(4);

      // Verify database storage
      const dbResult = await DatabaseService.query(
        'SELECT * FROM strategies WHERE id = $1',
        [response.body.id]
      );

      expect(dbResult.rows).toHaveLength(1);
      const storedConfig = JSON.parse(dbResult.rows[0].config_json);
      expect(storedConfig.nodes).toHaveLength(5);
      expect(storedConfig.parameters.symbols).toEqual(['AAPL', 'GOOGL', 'MSFT']);
    });

    it('should validate strategy configuration integrity', async () => {
      const validStrategy = {
        name: 'Valid Strategy',
        nodes: [
          { id: 'entry-1', type: 'entry', config: { indicator: 'sma', period: 20 } },
          { id: 'exit-1', type: 'exit', config: { type: 'stop_loss', percentage: 0.02 } }
        ],
        connections: [{ from: 'entry-1', to: 'exit-1' }],
        parameters: { timeframe: '1h' }
      };

      const createResponse = await request(app)
        .post('/api/strategies')
        .set('Authorization', `Bearer ${authToken}`)
        .send(validStrategy);

      expect(createResponse.status).toBe(201);
      const strategyId = createResponse.body.id;

      // Validate the strategy
      const validationResponse = await request(app)
        .post(`/api/strategies/${strategyId}/validate`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(validationResponse.status).toBe(200);
      expect(validationResponse.body.isValid).toBe(true);
      expect(validationResponse.body.errors).toHaveLength(0);
      expect(Array.isArray(validationResponse.body.warnings)).toBe(true);
    });

    it('should handle strategy versioning correctly', async () => {
      const initialStrategy = {
        name: 'Versioned Strategy',
        nodes: [{ id: 'entry-1', type: 'entry' }],
        connections: [],
        parameters: { timeframe: '1h' }
      };

      // Create initial version
      const createResponse = await request(app)
        .post('/api/strategies')
        .set('Authorization', `Bearer ${authToken}`)
        .send(initialStrategy);

      const strategyId = createResponse.body.id;
      expect(createResponse.body.version).toBe(1);

      // Update strategy (should create new version)
      const updatedStrategy = {
        ...initialStrategy,
        name: 'Updated Versioned Strategy',
        nodes: [
          { id: 'entry-1', type: 'entry' },
          { id: 'exit-1', type: 'exit' }
        ],
        connections: [{ from: 'entry-1', to: 'exit-1' }]
      };

      const updateResponse = await request(app)
        .put(`/api/strategies/${strategyId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(updatedStrategy);

      expect(updateResponse.status).toBe(200);
      expect(updateResponse.body.version).toBe(2);
      expect(updateResponse.body.nodes).toHaveLength(2);

      // Verify version history
      const historyResponse = await request(app)
        .get(`/api/strategies/${strategyId}/versions`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(historyResponse.status).toBe(200);
      expect(historyResponse.body.versions).toHaveLength(2);
    });

    it('should handle strategy sharing and templates', async () => {
      const templateStrategy = {
        name: 'Template Strategy',
        description: 'A strategy template for sharing',
        nodes: [
          { id: 'entry-1', type: 'entry', config: { indicator: 'sma', period: 20 } },
          { id: 'exit-1', type: 'exit', config: { type: 'stop_loss', percentage: 0.02 } }
        ],
        connections: [{ from: 'entry-1', to: 'exit-1' }],
        parameters: { timeframe: '1h' },
        isTemplate: true,
        isPublic: true
      };

      // Create template strategy
      const createResponse = await request(app)
        .post('/api/strategies')
        .set('Authorization', `Bearer ${authToken}`)
        .send(templateStrategy);

      expect(createResponse.status).toBe(201);
      const templateId = createResponse.body.id;

      // Get public templates
      const templatesResponse = await request(app)
        .get('/api/strategies/templates')
        .set('Authorization', `Bearer ${authToken}`);

      expect(templatesResponse.status).toBe(200);
      expect(templatesResponse.body.templates.length).toBeGreaterThan(0);

      // Clone template
      const cloneResponse = await request(app)
        .post(`/api/strategies/${templateId}/clone`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Cloned Strategy'
        });

      expect(cloneResponse.status).toBe(201);
      expect(cloneResponse.body.name).toBe('Cloned Strategy');
      expect(cloneResponse.body.nodes).toHaveLength(2);
      expect(cloneResponse.body.isTemplate).toBe(false);
    });
  });

  describe('Strategy Execution Integration', () => {
    let strategyId: string;

    beforeEach(async () => {
      // Create test strategy
      const strategyResponse = await request(app)
        .post('/api/strategies')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Execution Test Strategy',
          nodes: [
            {
              id: 'entry-1',
              type: 'entry',
              config: { indicator: 'sma', period: 20, comparison: 'above' }
            }
          ],
          connections: [],
          parameters: {
            timeframe: '1h',
            symbols: ['AAPL']
          }
        });

      strategyId = strategyResponse.body.id;
    });

    it('should handle strategy activation and deactivation', async () => {
      // Activate strategy
      const activateResponse = await request(app)
        .post(`/api/strategies/${strategyId}/activate`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          mode: 'paper',
          allocation: 10000,
          symbols: ['AAPL']
        });

      expect(activateResponse.status).toBe(200);
      expect(activateResponse.body.status).toBe('active');
      expect(activateResponse.body.mode).toBe('paper');

      // Verify strategy execution record
      const dbResult = await DatabaseService.query(
        'SELECT * FROM strategy_executions WHERE strategy_id = $1',
        [strategyId]
      );

      expect(dbResult.rows).toHaveLength(1);
      expect(dbResult.rows[0].status).toBe('active');

      // Deactivate strategy
      const deactivateResponse = await request(app)
        .post(`/api/strategies/${strategyId}/deactivate`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(deactivateResponse.status).toBe(200);
      expect(deactivateResponse.body.status).toBe('inactive');
    });

    it('should handle strategy signal generation', async () => {
      // Activate strategy
      await request(app)
        .post(`/api/strategies/${strategyId}/activate`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          mode: 'paper',
          allocation: 10000
        });

      // Simulate market data that should trigger signal
      const signalResponse = await request(app)
        .post(`/api/strategies/${strategyId}/process-signal`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          marketData: {
            symbol: 'AAPL',
            timestamp: new Date().toISOString(),
            price: 150.25,
            volume: 1000000,
            indicators: {
              sma_20: 148.50,
              sma_50: 145.00
            }
          }
        });

      expect(signalResponse.status).toBe(200);
      expect(signalResponse.body).toHaveProperty('signal');
      expect(['buy', 'sell', 'hold']).toContain(signalResponse.body.signal.action);
    });

    it('should handle strategy performance tracking', async () => {
      // Activate strategy
      await request(app)
        .post(`/api/strategies/${strategyId}/activate`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          mode: 'paper',
          allocation: 10000
        });

      // Simulate some trades
      await request(app)
        .post(`/api/strategies/${strategyId}/simulate-trade`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          symbol: 'AAPL',
          side: 'buy',
          quantity: 10,
          price: 150.00,
          timestamp: new Date().toISOString()
        });

      await request(app)
        .post(`/api/strategies/${strategyId}/simulate-trade`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          symbol: 'AAPL',
          side: 'sell',
          quantity: 10,
          price: 155.00,
          timestamp: new Date(Date.now() + 3600000).toISOString()
        });

      // Get performance metrics
      const performanceResponse = await request(app)
        .get(`/api/strategies/${strategyId}/performance`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(performanceResponse.status).toBe(200);
      expect(performanceResponse.body).toHaveProperty('totalReturn');
      expect(performanceResponse.body).toHaveProperty('sharpeRatio');
      expect(performanceResponse.body).toHaveProperty('maxDrawdown');
      expect(performanceResponse.body).toHaveProperty('winRate');
      expect(performanceResponse.body).toHaveProperty('trades');
      expect(Array.isArray(performanceResponse.body.trades)).toBe(true);
    });

    it('should handle strategy risk management integration', async () => {
      // Test risk validation before activation
      const riskValidationResponse = await request(app)
        .post(`/api/strategies/${strategyId}/validate-risk`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          allocation: 50000, // 50% of portfolio
          portfolioValue: 100000,
          currentPositions: [
            { symbol: 'GOOGL', value: 30000 },
            { symbol: 'MSFT', value: 20000 }
          ]
        });

      expect(riskValidationResponse.status).toBe(200);
      expect(riskValidationResponse.body).toHaveProperty('riskAssessment');
      expect(riskValidationResponse.body).toHaveProperty('recommendations');

      // Should warn about high allocation
      expect(riskValidationResponse.body.riskAssessment.level).toBe('high');
    });
  });

  describe('Strategy Backtesting Integration', () => {
    let strategyId: string;

    beforeEach(async () => {
      // Create test strategy for backtesting
      const strategyResponse = await request(app)
        .post('/api/strategies')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Backtest Strategy',
          nodes: [
            {
              id: 'entry-1',
              type: 'entry',
              config: {
                indicator: 'sma',
                period: 20,
                comparison: 'crossover',
                target: { indicator: 'sma', period: 50 }
              }
            },
            {
              id: 'exit-1',
              type: 'exit',
              config: { type: 'stop_loss', percentage: 0.02 }
            }
          ],
          connections: [{ from: 'entry-1', to: 'exit-1' }],
          parameters: {
            timeframe: '1h',
            symbols: ['AAPL']
          }
        });

      strategyId = strategyResponse.body.id;
    });

    it('should run comprehensive backtest', async () => {
      const backtestRequest = {
        strategyId,
        symbol: 'AAPL',
        startDate: '2023-01-01',
        endDate: '2023-12-31',
        initialCapital: 100000,
        parameters: {
          commission: 0.001,
          slippage: 0.001,
          benchmark: 'SPY'
        }
      };

      // Start backtest
      const backtestResponse = await request(app)
        .post('/api/backtests')
        .set('Authorization', `Bearer ${authToken}`)
        .send(backtestRequest);

      expect(backtestResponse.status).toBe(201);
      expect(backtestResponse.body).toHaveProperty('id');
      const backtestId = backtestResponse.body.id;

      // Monitor backtest progress
      let backtestComplete = false;
      let attempts = 0;
      const maxAttempts = 20;

      while (!backtestComplete && attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        const statusResponse = await request(app)
          .get(`/api/backtests/${backtestId}`)
          .set('Authorization', `Bearer ${authToken}`);

        if (statusResponse.body.status === 'completed') {
          backtestComplete = true;
          
          // Verify comprehensive results
          const results = statusResponse.body.results;
          expect(results).toHaveProperty('totalReturn');
          expect(results).toHaveProperty('annualizedReturn');
          expect(results).toHaveProperty('sharpeRatio');
          expect(results).toHaveProperty('sortinoRatio');
          expect(results).toHaveProperty('maxDrawdown');
          expect(results).toHaveProperty('winRate');
          expect(results).toHaveProperty('profitFactor');
          expect(results).toHaveProperty('trades');
          expect(results).toHaveProperty('equityCurve');
          expect(results).toHaveProperty('monthlyReturns');
          
          // Verify trade details
          expect(Array.isArray(results.trades)).toBe(true);
          if (results.trades.length > 0) {
            const trade = results.trades[0];
            expect(trade).toHaveProperty('entryDate');
            expect(trade).toHaveProperty('exitDate');
            expect(trade).toHaveProperty('entryPrice');
            expect(trade).toHaveProperty('exitPrice');
            expect(trade).toHaveProperty('quantity');
            expect(trade).toHaveProperty('pnl');
          }
        } else if (statusResponse.body.status === 'failed') {
          throw new Error(`Backtest failed: ${statusResponse.body.error}`);
        }
        
        attempts++;
      }

      expect(backtestComplete).toBe(true);
    });

    it('should handle parameter optimization', async () => {
      const optimizationRequest = {
        strategyId,
        symbol: 'AAPL',
        startDate: '2023-01-01',
        endDate: '2023-06-30',
        initialCapital: 100000,
        optimization: {
          parameters: [
            {
              nodeId: 'entry-1',
              parameter: 'period',
              min: 10,
              max: 30,
              step: 5
            }
          ],
          objective: 'sharpe_ratio',
          maxIterations: 10
        }
      };

      const optimizationResponse = await request(app)
        .post('/api/backtests/optimize')
        .set('Authorization', `Bearer ${authToken}`)
        .send(optimizationRequest);

      expect(optimizationResponse.status).toBe(201);
      const optimizationId = optimizationResponse.body.id;

      // Wait for optimization completion
      let optimizationComplete = false;
      let attempts = 0;
      const maxAttempts = 30;

      while (!optimizationComplete && attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        const statusResponse = await request(app)
          .get(`/api/backtests/optimize/${optimizationId}`)
          .set('Authorization', `Bearer ${authToken}`);

        if (statusResponse.body.status === 'completed') {
          optimizationComplete = true;
          
          const results = statusResponse.body.results;
          expect(results).toHaveProperty('bestParameters');
          expect(results).toHaveProperty('bestScore');
          expect(results).toHaveProperty('allResults');
          expect(Array.isArray(results.allResults)).toBe(true);
          expect(results.allResults.length).toBeGreaterThan(0);
        }
        
        attempts++;
      }

      expect(optimizationComplete).toBe(true);
    });

    it('should handle Monte Carlo analysis', async () => {
      const monteCarloRequest = {
        strategyId,
        symbol: 'AAPL',
        startDate: '2023-01-01',
        endDate: '2023-12-31',
        initialCapital: 100000,
        monteCarlo: {
          iterations: 100,
          confidenceLevel: 0.95,
          randomSeed: 12345
        }
      };

      const monteCarloResponse = await request(app)
        .post('/api/backtests/monte-carlo')
        .set('Authorization', `Bearer ${authToken}`)
        .send(monteCarloRequest);

      expect(monteCarloResponse.status).toBe(201);
      const analysisId = monteCarloResponse.body.id;

      // Wait for analysis completion
      let analysisComplete = false;
      let attempts = 0;
      const maxAttempts = 25;

      while (!analysisComplete && attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        const statusResponse = await request(app)
          .get(`/api/backtests/monte-carlo/${analysisId}`)
          .set('Authorization', `Bearer ${authToken}`);

        if (statusResponse.body.status === 'completed') {
          analysisComplete = true;
          
          const results = statusResponse.body.results;
          expect(results).toHaveProperty('statistics');
          expect(results).toHaveProperty('percentiles');
          expect(results).toHaveProperty('worstCase');
          expect(results).toHaveProperty('bestCase');
          expect(results).toHaveProperty('probabilityOfProfit');
          expect(results.statistics).toHaveProperty('mean');
          expect(results.statistics).toHaveProperty('standardDeviation');
        }
        
        attempts++;
      }

      expect(analysisComplete).toBe(true);
    });
  });

  describe('Strategy Service Error Handling', () => {
    it('should handle invalid strategy configurations', async () => {
      const invalidConfigs = [
        {
          name: 'Invalid Nodes',
          nodes: [{ id: 'invalid', type: 'unknown_type' }],
          connections: [],
          parameters: {}
        },
        {
          name: 'Circular Connections',
          nodes: [
            { id: 'node1', type: 'entry' },
            { id: 'node2', type: 'exit' }
          ],
          connections: [
            { from: 'node1', to: 'node2' },
            { from: 'node2', to: 'node1' }
          ],
          parameters: {}
        },
        {
          name: 'Missing Required Parameters',
          nodes: [{ id: 'entry1', type: 'entry', config: {} }],
          connections: [],
          parameters: {}
        }
      ];

      for (const config of invalidConfigs) {
        const response = await request(app)
          .post('/api/strategies')
          .set('Authorization', `Bearer ${authToken}`)
          .send(config);

        expect(response.status).toBe(400);
        expect(response.body.error).toHaveProperty('code');
        expect(response.body.error).toHaveProperty('message');
      }
    });

    it('should handle strategy execution errors', async () => {
      // Create strategy with invalid configuration for execution
      const strategyResponse = await request(app)
        .post('/api/strategies')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Error Strategy',
          nodes: [
            {
              id: 'entry-1',
              type: 'entry',
              config: { indicator: 'invalid_indicator' }
            }
          ],
          connections: [],
          parameters: { timeframe: '1h' }
        });

      const strategyId = strategyResponse.body.id;

      // Try to activate strategy with invalid config
      const activateResponse = await request(app)
        .post(`/api/strategies/${strategyId}/activate`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          mode: 'paper',
          allocation: 10000
        });

      expect(activateResponse.status).toBe(400);
      expect(activateResponse.body.error.code).toBe('INVALID_STRATEGY_CONFIG');
    });

    it('should handle concurrent strategy operations', async () => {
      // Create strategy
      const strategyResponse = await request(app)
        .post('/api/strategies')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Concurrent Test Strategy',
          nodes: [{ id: 'entry-1', type: 'entry' }],
          connections: [],
          parameters: { timeframe: '1h' }
        });

      const strategyId = strategyResponse.body.id;

      // Perform concurrent operations
      const operations = [
        request(app)
          .put(`/api/strategies/${strategyId}`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({ name: 'Updated Name 1' }),
        
        request(app)
          .put(`/api/strategies/${strategyId}`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({ name: 'Updated Name 2' }),
        
        request(app)
          .post(`/api/strategies/${strategyId}/activate`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({ mode: 'paper', allocation: 5000 })
      ];

      const results = await Promise.all(operations);
      
      // Should handle conflicts gracefully
      const successfulOps = results.filter(r => r.status < 400);
      const conflictErrors = results.filter(r => r.status === 409);
      
      expect(successfulOps.length + conflictErrors.length).toBe(3);
    });
  });
});