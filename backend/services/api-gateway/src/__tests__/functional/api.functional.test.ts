import request from 'supertest';
import { Server } from 'http';
import { app, server } from '../../index';
import { DatabaseService } from '../../../user-service/src/services/database';
import { RedisService } from '../../../user-service/src/services/redis';

describe('API Gateway Functional Tests', () => {
  let testServer: Server;
  let authToken: string;
  let testUserId: string;

  beforeAll(async () => {
    // Initialize test database and Redis connections
    await DatabaseService.initialize();
    await RedisService.initialize();
    
    testServer = server;
    
    // Create test user and get auth token
    const registerResponse = await request(app)
      .post('/api/auth/register')
      .send({
        email: 'test@example.com',
        password: 'TestPassword123',
        firstName: 'Test',
        lastName: 'User'
      });

    expect(registerResponse.status).toBe(201);
    
    const loginResponse = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'test@example.com',
        password: 'TestPassword123'
      });

    expect(loginResponse.status).toBe(200);
    authToken = loginResponse.body.accessToken;
    testUserId = loginResponse.body.user.id;
  });

  afterAll(async () => {
    // Clean up test data
    await DatabaseService.query('DELETE FROM users WHERE email = $1', ['test@example.com']);
    await DatabaseService.close();
    await RedisService.close();
    testServer.close();
  });

  describe('Authentication Endpoints', () => {
    describe('POST /api/auth/register', () => {
      it('should register a new user successfully', async () => {
        const response = await request(app)
          .post('/api/auth/register')
          .send({
            email: 'newuser@example.com',
            password: 'NewPassword123',
            firstName: 'New',
            lastName: 'User'
          });

        expect(response.status).toBe(201);
        expect(response.body).toHaveProperty('user');
        expect(response.body).toHaveProperty('accessToken');
        expect(response.body.user.email).toBe('newuser@example.com');

        // Clean up
        await DatabaseService.query('DELETE FROM users WHERE email = $1', ['newuser@example.com']);
      });

      it('should reject registration with invalid email', async () => {
        const response = await request(app)
          .post('/api/auth/register')
          .send({
            email: 'invalid-email',
            password: 'Password123',
            firstName: 'Test',
            lastName: 'User'
          });

        expect(response.status).toBe(400);
        expect(response.body.error).toHaveProperty('message');
      });

      it('should reject registration with weak password', async () => {
        const response = await request(app)
          .post('/api/auth/register')
          .send({
            email: 'test2@example.com',
            password: 'weak',
            firstName: 'Test',
            lastName: 'User'
          });

        expect(response.status).toBe(400);
        expect(response.body.error).toHaveProperty('message');
      });

      it('should reject duplicate email registration', async () => {
        const response = await request(app)
          .post('/api/auth/register')
          .send({
            email: 'test@example.com',
            password: 'Password123',
            firstName: 'Duplicate',
            lastName: 'User'
          });

        expect(response.status).toBe(409);
        expect(response.body.error.code).toBe('EMAIL_ALREADY_EXISTS');
      });
    });

    describe('POST /api/auth/login', () => {
      it('should login with valid credentials', async () => {
        const response = await request(app)
          .post('/api/auth/login')
          .send({
            email: 'test@example.com',
            password: 'TestPassword123'
          });

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('accessToken');
        expect(response.body).toHaveProperty('refreshToken');
        expect(response.body).toHaveProperty('user');
        expect(response.body.user.email).toBe('test@example.com');
      });

      it('should reject login with invalid email', async () => {
        const response = await request(app)
          .post('/api/auth/login')
          .send({
            email: 'nonexistent@example.com',
            password: 'TestPassword123'
          });

        expect(response.status).toBe(401);
        expect(response.body.error.code).toBe('INVALID_CREDENTIALS');
      });

      it('should reject login with invalid password', async () => {
        const response = await request(app)
          .post('/api/auth/login')
          .send({
            email: 'test@example.com',
            password: 'WrongPassword'
          });

        expect(response.status).toBe(401);
        expect(response.body.error.code).toBe('INVALID_CREDENTIALS');
      });

      it('should reject login with missing fields', async () => {
        const response = await request(app)
          .post('/api/auth/login')
          .send({
            email: 'test@example.com'
          });

        expect(response.status).toBe(400);
        expect(response.body.error).toHaveProperty('message');
      });
    });

    describe('POST /api/auth/refresh', () => {
      it('should refresh token with valid refresh token', async () => {
        const loginResponse = await request(app)
          .post('/api/auth/login')
          .send({
            email: 'test@example.com',
            password: 'TestPassword123'
          });

        const refreshToken = loginResponse.body.refreshToken;

        const response = await request(app)
          .post('/api/auth/refresh')
          .send({
            refreshToken
          });

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('accessToken');
        expect(response.body).toHaveProperty('refreshToken');
      });

      it('should reject refresh with invalid token', async () => {
        const response = await request(app)
          .post('/api/auth/refresh')
          .send({
            refreshToken: 'invalid-token'
          });

        expect(response.status).toBe(401);
        expect(response.body.error.code).toBe('INVALID_REFRESH_TOKEN');
      });
    });

    describe('POST /api/auth/logout', () => {
      it('should logout successfully with valid token', async () => {
        const response = await request(app)
          .post('/api/auth/logout')
          .set('Authorization', `Bearer ${authToken}`);

        expect(response.status).toBe(200);
        expect(response.body.message).toBe('Logged out successfully');
      });

      it('should reject logout without token', async () => {
        const response = await request(app)
          .post('/api/auth/logout');

        expect(response.status).toBe(401);
        expect(response.body.error.code).toBe('AUTHENTICATION_REQUIRED');
      });
    });
  });

  describe('Strategy Endpoints', () => {
    let strategyId: string;

    const mockStrategy = {
      name: 'Test Strategy',
      description: 'A test trading strategy',
      nodes: [
        {
          id: 'entry-1',
          type: 'entry',
          config: { indicator: 'sma', period: 20 },
          position: { x: 100, y: 100 }
        }
      ],
      connections: [],
      parameters: {
        timeframe: '1h',
        positionSizing: { type: 'fixed', amount: 1000 },
        riskManagement: { stopLoss: 0.02, takeProfit: 0.04 }
      }
    };

    describe('POST /api/strategies', () => {
      it('should create a new strategy', async () => {
        const response = await request(app)
          .post('/api/strategies')
          .set('Authorization', `Bearer ${authToken}`)
          .send(mockStrategy);

        expect(response.status).toBe(201);
        expect(response.body).toHaveProperty('id');
        expect(response.body.name).toBe(mockStrategy.name);
        strategyId = response.body.id;
      });

      it('should reject strategy creation without authentication', async () => {
        const response = await request(app)
          .post('/api/strategies')
          .send(mockStrategy);

        expect(response.status).toBe(401);
        expect(response.body.error.code).toBe('AUTHENTICATION_REQUIRED');
      });

      it('should reject strategy with invalid data', async () => {
        const response = await request(app)
          .post('/api/strategies')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            name: '', // Invalid empty name
            nodes: []
          });

        expect(response.status).toBe(400);
        expect(response.body.error).toHaveProperty('message');
      });
    });

    describe('GET /api/strategies', () => {
      it('should retrieve user strategies', async () => {
        const response = await request(app)
          .get('/api/strategies')
          .set('Authorization', `Bearer ${authToken}`);

        expect(response.status).toBe(200);
        expect(Array.isArray(response.body.strategies)).toBe(true);
        expect(response.body.strategies.length).toBeGreaterThan(0);
      });

      it('should support pagination', async () => {
        const response = await request(app)
          .get('/api/strategies?page=1&limit=5')
          .set('Authorization', `Bearer ${authToken}`);

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('pagination');
        expect(response.body.pagination.page).toBe(1);
        expect(response.body.pagination.limit).toBe(5);
      });

      it('should reject request without authentication', async () => {
        const response = await request(app)
          .get('/api/strategies');

        expect(response.status).toBe(401);
        expect(response.body.error.code).toBe('AUTHENTICATION_REQUIRED');
      });
    });

    describe('GET /api/strategies/:id', () => {
      it('should retrieve specific strategy', async () => {
        const response = await request(app)
          .get(`/api/strategies/${strategyId}`)
          .set('Authorization', `Bearer ${authToken}`);

        expect(response.status).toBe(200);
        expect(response.body.id).toBe(strategyId);
        expect(response.body.name).toBe(mockStrategy.name);
      });

      it('should return 404 for non-existent strategy', async () => {
        const response = await request(app)
          .get('/api/strategies/00000000-0000-0000-0000-000000000000')
          .set('Authorization', `Bearer ${authToken}`);

        expect(response.status).toBe(404);
        expect(response.body.error.code).toBe('STRATEGY_NOT_FOUND');
      });

      it('should reject access to other user\'s strategy', async () => {
        // Create another user
        const otherUserResponse = await request(app)
          .post('/api/auth/register')
          .send({
            email: 'other@example.com',
            password: 'OtherPassword123',
            firstName: 'Other',
            lastName: 'User'
          });

        const otherToken = otherUserResponse.body.accessToken;

        const response = await request(app)
          .get(`/api/strategies/${strategyId}`)
          .set('Authorization', `Bearer ${otherToken}`);

        expect(response.status).toBe(403);
        expect(response.body.error.code).toBe('ACCESS_DENIED');

        // Clean up
        await DatabaseService.query('DELETE FROM users WHERE email = $1', ['other@example.com']);
      });
    });

    describe('PUT /api/strategies/:id', () => {
      it('should update strategy successfully', async () => {
        const updatedStrategy = {
          ...mockStrategy,
          name: 'Updated Test Strategy',
          description: 'Updated description'
        };

        const response = await request(app)
          .put(`/api/strategies/${strategyId}`)
          .set('Authorization', `Bearer ${authToken}`)
          .send(updatedStrategy);

        expect(response.status).toBe(200);
        expect(response.body.name).toBe('Updated Test Strategy');
        expect(response.body.description).toBe('Updated description');
      });

      it('should return 404 for non-existent strategy', async () => {
        const response = await request(app)
          .put('/api/strategies/00000000-0000-0000-0000-000000000000')
          .set('Authorization', `Bearer ${authToken}`)
          .send(mockStrategy);

        expect(response.status).toBe(404);
        expect(response.body.error.code).toBe('STRATEGY_NOT_FOUND');
      });
    });

    describe('POST /api/strategies/:id/validate', () => {
      it('should validate strategy successfully', async () => {
        const response = await request(app)
          .post(`/api/strategies/${strategyId}/validate`)
          .set('Authorization', `Bearer ${authToken}`);

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('isValid');
        expect(response.body).toHaveProperty('errors');
        expect(response.body).toHaveProperty('warnings');
      });
    });

    describe('DELETE /api/strategies/:id', () => {
      it('should delete strategy successfully', async () => {
        const response = await request(app)
          .delete(`/api/strategies/${strategyId}`)
          .set('Authorization', `Bearer ${authToken}`);

        expect(response.status).toBe(200);
        expect(response.body.message).toBe('Strategy deleted successfully');
      });

      it('should return 404 for already deleted strategy', async () => {
        const response = await request(app)
          .delete(`/api/strategies/${strategyId}`)
          .set('Authorization', `Bearer ${authToken}`);

        expect(response.status).toBe(404);
        expect(response.body.error.code).toBe('STRATEGY_NOT_FOUND');
      });
    });
  });

  describe('Portfolio Endpoints', () => {
    describe('GET /api/portfolio', () => {
      it('should retrieve portfolio overview', async () => {
        const response = await request(app)
          .get('/api/portfolio')
          .set('Authorization', `Bearer ${authToken}`);

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('totalValue');
        expect(response.body).toHaveProperty('cashBalance');
        expect(response.body).toHaveProperty('positions');
        expect(response.body).toHaveProperty('performance');
      });

      it('should reject request without authentication', async () => {
        const response = await request(app)
          .get('/api/portfolio');

        expect(response.status).toBe(401);
        expect(response.body.error.code).toBe('AUTHENTICATION_REQUIRED');
      });
    });

    describe('GET /api/portfolio/positions', () => {
      it('should retrieve user positions', async () => {
        const response = await request(app)
          .get('/api/portfolio/positions')
          .set('Authorization', `Bearer ${authToken}`);

        expect(response.status).toBe(200);
        expect(Array.isArray(response.body.positions)).toBe(true);
        expect(response.body).toHaveProperty('pagination');
      });

      it('should filter positions by symbol', async () => {
        const response = await request(app)
          .get('/api/portfolio/positions?symbol=AAPL')
          .set('Authorization', `Bearer ${authToken}`);

        expect(response.status).toBe(200);
        expect(Array.isArray(response.body.positions)).toBe(true);
      });

      it('should filter positions by status', async () => {
        const response = await request(app)
          .get('/api/portfolio/positions?status=open')
          .set('Authorization', `Bearer ${authToken}`);

        expect(response.status).toBe(200);
        expect(Array.isArray(response.body.positions)).toBe(true);
      });
    });

    describe('GET /api/portfolio/trades', () => {
      it('should retrieve user trades', async () => {
        const response = await request(app)
          .get('/api/portfolio/trades')
          .set('Authorization', `Bearer ${authToken}`);

        expect(response.status).toBe(200);
        expect(Array.isArray(response.body.trades)).toBe(true);
        expect(response.body).toHaveProperty('pagination');
      });

      it('should filter trades by date range', async () => {
        const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
        const endDate = new Date().toISOString();

        const response = await request(app)
          .get(`/api/portfolio/trades?startDate=${startDate}&endDate=${endDate}`)
          .set('Authorization', `Bearer ${authToken}`);

        expect(response.status).toBe(200);
        expect(Array.isArray(response.body.trades)).toBe(true);
      });
    });

    describe('GET /api/portfolio/performance', () => {
      it('should retrieve performance metrics', async () => {
        const response = await request(app)
          .get('/api/portfolio/performance')
          .set('Authorization', `Bearer ${authToken}`);

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('totalReturn');
        expect(response.body).toHaveProperty('sharpeRatio');
        expect(response.body).toHaveProperty('maxDrawdown');
        expect(response.body).toHaveProperty('winRate');
      });

      it('should support different timeframes', async () => {
        const response = await request(app)
          .get('/api/portfolio/performance?timeframe=1y')
          .set('Authorization', `Bearer ${authToken}`);

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('timeframe');
        expect(response.body.timeframe).toBe('1y');
      });
    });

    describe('POST /api/portfolio/manual-trade', () => {
      it('should create manual trade successfully', async () => {
        const tradeData = {
          symbol: 'AAPL',
          side: 'buy',
          quantity: 10,
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
        expect(response.body.quantity).toBe(10);
      });

      it('should reject trade with invalid data', async () => {
        const response = await request(app)
          .post('/api/portfolio/manual-trade')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            symbol: 'INVALID',
            side: 'invalid_side',
            quantity: -10
          });

        expect(response.status).toBe(400);
        expect(response.body.error).toHaveProperty('message');
      });
    });
  });

  describe('Market Data Endpoints', () => {
    describe('GET /api/market-data/quote/:symbol', () => {
      it('should retrieve current quote for valid symbol', async () => {
        const response = await request(app)
          .get('/api/market-data/quote/AAPL')
          .set('Authorization', `Bearer ${authToken}`);

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('symbol');
        expect(response.body).toHaveProperty('price');
        expect(response.body).toHaveProperty('timestamp');
        expect(response.body.symbol).toBe('AAPL');
      });

      it('should return 404 for invalid symbol', async () => {
        const response = await request(app)
          .get('/api/market-data/quote/INVALID')
          .set('Authorization', `Bearer ${authToken}`);

        expect(response.status).toBe(404);
        expect(response.body.error.code).toBe('SYMBOL_NOT_FOUND');
      });
    });

    describe('GET /api/market-data/historical/:symbol', () => {
      it('should retrieve historical data', async () => {
        const response = await request(app)
          .get('/api/market-data/historical/AAPL?timeframe=1d&startDate=2023-01-01&endDate=2023-01-31')
          .set('Authorization', `Bearer ${authToken}`);

        expect(response.status).toBe(200);
        expect(Array.isArray(response.body.data)).toBe(true);
        expect(response.body).toHaveProperty('symbol');
        expect(response.body.symbol).toBe('AAPL');
      });

      it('should validate date range parameters', async () => {
        const response = await request(app)
          .get('/api/market-data/historical/AAPL?timeframe=1d&startDate=invalid-date')
          .set('Authorization', `Bearer ${authToken}`);

        expect(response.status).toBe(400);
        expect(response.body.error).toHaveProperty('message');
      });
    });
  });

  describe('Health Check Endpoints', () => {
    describe('GET /health', () => {
      it('should return health status without authentication', async () => {
        const response = await request(app)
          .get('/health');

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('status');
        expect(response.body).toHaveProperty('timestamp');
        expect(response.body).toHaveProperty('uptime');
        expect(response.body.status).toBe('healthy');
      });
    });

    describe('GET /api/health/detailed', () => {
      it('should return detailed health status', async () => {
        const response = await request(app)
          .get('/api/health/detailed')
          .set('Authorization', `Bearer ${authToken}`);

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('status');
        expect(response.body).toHaveProperty('services');
        expect(response.body).toHaveProperty('database');
        expect(response.body).toHaveProperty('redis');
      });
    });
  });

  describe('Error Handling', () => {
    it('should return 404 for non-existent endpoints', async () => {
      const response = await request(app)
        .get('/api/non-existent-endpoint')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe('NOT_FOUND');
    });

    it('should handle malformed JSON requests', async () => {
      const response = await request(app)
        .post('/api/strategies')
        .set('Authorization', `Bearer ${authToken}`)
        .set('Content-Type', 'application/json')
        .send('{ invalid json }');

      expect(response.status).toBe(400);
      expect(response.body.error).toHaveProperty('message');
    });

    it('should handle requests exceeding size limits', async () => {
      const largePayload = {
        name: 'A'.repeat(1000000), // 1MB string
        description: 'Test'
      };

      const response = await request(app)
        .post('/api/strategies')
        .set('Authorization', `Bearer ${authToken}`)
        .send(largePayload);

      expect(response.status).toBe(413);
      expect(response.body.error.code).toBe('PAYLOAD_TOO_LARGE');
    });
  });

  describe('Rate Limiting', () => {
    it('should enforce rate limits', async () => {
      const requests = [];
      
      // Make multiple rapid requests
      for (let i = 0; i < 105; i++) {
        requests.push(
          request(app)
            .get('/api/portfolio')
            .set('Authorization', `Bearer ${authToken}`)
        );
      }

      const responses = await Promise.all(requests);
      
      // Some requests should be rate limited
      const rateLimitedResponses = responses.filter(res => res.status === 429);
      expect(rateLimitedResponses.length).toBeGreaterThan(0);
    });
  });
});