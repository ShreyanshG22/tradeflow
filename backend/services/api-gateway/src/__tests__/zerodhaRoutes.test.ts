import request from 'supertest';
import { jest } from '@jest/globals';
import { app } from '../index';
import { ServiceProxy } from '../services/serviceProxy';

// Mock ServiceProxy
jest.mock('../services/serviceProxy');
const MockedServiceProxy = ServiceProxy as jest.MockedClass<typeof ServiceProxy>;

describe('Zerodha API Routes', () => {
  let mockServiceProxy: jest.Mocked<ServiceProxy>;
  const validToken = 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJ0ZXN0LXVzZXIiLCJlbWFpbCI6InRlc3RAdGVzdC5jb20iLCJpYXQiOjE2MzQ1NjcwMDB9.test';

  beforeEach(() => {
    mockServiceProxy = {
      get: jest.fn(),
      post: jest.fn(),
      put: jest.fn(),
      delete: jest.fn(),
      patch: jest.fn(),
      forwardRequest: jest.fn()
    } as any;

    MockedServiceProxy.mockImplementation(() => mockServiceProxy);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Authentication Routes', () => {
    describe('POST /api/zerodha/auth/login', () => {
      it('should generate login URL successfully', async () => {
        const mockResponse = {
          data: {
            success: true,
            data: {
              login_url: 'https://kite.zerodha.com/connect/login?api_key=test&v=3'
            }
          }
        };

        mockServiceProxy.post.mockResolvedValue(mockResponse);

        const response = await request(app)
          .post('/api/zerodha/auth/login')
          .send({
            api_key: 'test_api_key',
            redirect_url: 'http://localhost:3000/callback'
          });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(mockServiceProxy.post).toHaveBeenCalledWith('/auth/login', {
          api_key: 'test_api_key',
          redirect_url: 'http://localhost:3000/callback'
        });
      });

      it('should return 400 for invalid request', async () => {
        const response = await request(app)
          .post('/api/zerodha/auth/login')
          .send({
            api_key: 'test_api_key'
            // Missing redirect_url
          });

        expect(response.status).toBe(400);
        expect(response.body.error).toBeDefined();
      });

      it('should apply rate limiting', async () => {
        const mockResponse = { data: { success: true } };
        mockServiceProxy.post.mockResolvedValue(mockResponse);

        // Make multiple requests quickly
        const requests = Array(15).fill(null).map(() =>
          request(app)
            .post('/api/zerodha/auth/login')
            .send({
              api_key: 'test_api_key',
              redirect_url: 'http://localhost:3000/callback'
            })
        );

        const responses = await Promise.all(requests);
        
        // Some requests should be rate limited
        const rateLimitedResponses = responses.filter(res => res.status === 429);
        expect(rateLimitedResponses.length).toBeGreaterThan(0);
      });
    });

    describe('GET /api/zerodha/auth/profile', () => {
      it('should get user profile with valid token', async () => {
        const mockResponse = {
          data: {
            success: true,
            data: {
              user_id: 'test_user',
              email: 'test@test.com',
              user_name: 'Test User'
            }
          }
        };

        mockServiceProxy.get.mockResolvedValue(mockResponse);

        const response = await request(app)
          .get('/api/zerodha/auth/profile')
          .set('Authorization', validToken);

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(mockServiceProxy.get).toHaveBeenCalledWith('/auth/profile', {
          headers: { Authorization: validToken }
        });
      });

      it('should return 401 without token', async () => {
        const response = await request(app)
          .get('/api/zerodha/auth/profile');

        expect(response.status).toBe(401);
      });
    });
  });

  describe('Market Data Routes', () => {
    describe('GET /api/zerodha/market/instruments', () => {
      it('should get instruments list', async () => {
        const mockResponse = {
          data: {
            success: true,
            data: [
              {
                instrument_token: 256265,
                tradingsymbol: 'RELIANCE',
                name: 'Reliance Industries Limited',
                exchange: 'NSE'
              }
            ]
          }
        };

        mockServiceProxy.get.mockResolvedValue(mockResponse);

        const response = await request(app)
          .get('/api/zerodha/market/instruments')
          .set('Authorization', validToken);

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(Array.isArray(response.body.data)).toBe(true);
      });

      it('should apply market data rate limiting', async () => {
        const mockResponse = { data: { success: true, data: [] } };
        mockServiceProxy.get.mockResolvedValue(mockResponse);

        // Make requests faster than allowed (3 per second)
        const requests = Array(5).fill(null).map(() =>
          request(app)
            .get('/api/zerodha/market/instruments')
            .set('Authorization', validToken)
        );

        const responses = await Promise.all(requests);
        
        // Some requests should be rate limited
        const rateLimitedResponses = responses.filter(res => res.status === 429);
        expect(rateLimitedResponses.length).toBeGreaterThan(0);
      });
    });

    describe('POST /api/zerodha/market/subscribe', () => {
      it('should subscribe to market data', async () => {
        const mockResponse = {
          data: {
            success: true,
            message: 'Subscribed successfully'
          }
        };

        mockServiceProxy.post.mockResolvedValue(mockResponse);

        const response = await request(app)
          .post('/api/zerodha/market/subscribe')
          .set('Authorization', validToken)
          .send({
            instruments: [256265, 408065],
            mode: 'quote'
          });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(mockServiceProxy.post).toHaveBeenCalledWith('/subscribe', {
          instruments: [256265, 408065],
          mode: 'quote'
        }, {
          headers: { Authorization: validToken }
        });
      });

      it('should validate instruments array', async () => {
        const response = await request(app)
          .post('/api/zerodha/market/subscribe')
          .set('Authorization', validToken)
          .send({
            instruments: [], // Empty array
            mode: 'quote'
          });

        expect(response.status).toBe(400);
        expect(response.body.error).toBeDefined();
      });

      it('should limit instruments to 100', async () => {
        const largeInstrumentArray = Array(101).fill(0).map((_, i) => i + 1);

        const response = await request(app)
          .post('/api/zerodha/market/subscribe')
          .set('Authorization', validToken)
          .send({
            instruments: largeInstrumentArray,
            mode: 'quote'
          });

        expect(response.status).toBe(400);
        expect(response.body.error).toBeDefined();
      });
    });
  });

  describe('Order Routes', () => {
    describe('POST /api/zerodha/orders', () => {
      it('should place order successfully', async () => {
        const mockResponse = {
          data: {
            success: true,
            data: {
              order_id: 'ORD123456'
            }
          }
        };

        mockServiceProxy.post.mockResolvedValue(mockResponse);

        const response = await request(app)
          .post('/api/zerodha/orders')
          .set('Authorization', validToken)
          .send({
            exchange: 'NSE',
            tradingsymbol: 'RELIANCE',
            transaction_type: 'BUY',
            quantity: 10,
            product: 'CNC',
            order_type: 'MARKET'
          });

        expect(response.status).toBe(201);
        expect(response.body.success).toBe(true);
        expect(response.body.data.order_id).toBe('ORD123456');
      });

      it('should validate required order fields', async () => {
        const response = await request(app)
          .post('/api/zerodha/orders')
          .set('Authorization', validToken)
          .send({
            exchange: 'NSE',
            tradingsymbol: 'RELIANCE'
            // Missing required fields
          });

        expect(response.status).toBe(400);
        expect(response.body.error).toBeDefined();
      });

      it('should validate price for LIMIT orders', async () => {
        const response = await request(app)
          .post('/api/zerodha/orders')
          .set('Authorization', validToken)
          .send({
            exchange: 'NSE',
            tradingsymbol: 'RELIANCE',
            transaction_type: 'BUY',
            quantity: 10,
            product: 'CNC',
            order_type: 'LIMIT'
            // Missing price for LIMIT order
          });

        expect(response.status).toBe(400);
        expect(response.body.error).toBeDefined();
      });
    });

    describe('GET /api/zerodha/orders', () => {
      it('should get orders list', async () => {
        const mockResponse = {
          data: {
            success: true,
            data: [
              {
                order_id: 'ORD123456',
                tradingsymbol: 'RELIANCE',
                status: 'COMPLETE'
              }
            ]
          }
        };

        mockServiceProxy.get.mockResolvedValue(mockResponse);

        const response = await request(app)
          .get('/api/zerodha/orders')
          .set('Authorization', validToken);

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(Array.isArray(response.body.data)).toBe(true);
      });

      it('should filter orders by status', async () => {
        const mockResponse = { data: { success: true, data: [] } };
        mockServiceProxy.get.mockResolvedValue(mockResponse);

        const response = await request(app)
          .get('/api/zerodha/orders?status=OPEN')
          .set('Authorization', validToken);

        expect(response.status).toBe(200);
        expect(mockServiceProxy.get).toHaveBeenCalledWith(
          expect.stringContaining('status=OPEN'),
          expect.any(Object)
        );
      });
    });

    describe('DELETE /api/zerodha/orders/:orderId', () => {
      it('should cancel order successfully', async () => {
        const mockResponse = {
          data: {
            success: true,
            message: 'Order cancelled successfully'
          }
        };

        mockServiceProxy.delete.mockResolvedValue(mockResponse);

        const response = await request(app)
          .delete('/api/zerodha/orders/ORD123456')
          .set('Authorization', validToken);

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(mockServiceProxy.delete).toHaveBeenCalledWith('/orders/ORD123456', {
          headers: { Authorization: validToken }
        });
      });
    });
  });

  describe('Portfolio Routes', () => {
    describe('GET /api/zerodha/portfolio/positions', () => {
      it('should get positions', async () => {
        const mockResponse = {
          data: {
            success: true,
            data: [
              {
                tradingsymbol: 'RELIANCE',
                quantity: 10,
                average_price: 2500.50,
                pnl: 150.00
              }
            ]
          }
        };

        mockServiceProxy.get.mockResolvedValue(mockResponse);

        const response = await request(app)
          .get('/api/zerodha/portfolio/positions')
          .set('Authorization', validToken);

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(Array.isArray(response.body.data)).toBe(true);
      });
    });

    describe('GET /api/zerodha/portfolio/holdings', () => {
      it('should get holdings', async () => {
        const mockResponse = {
          data: {
            success: true,
            data: [
              {
                tradingsymbol: 'TCS',
                quantity: 5,
                average_price: 3200.00,
                pnl: 500.00
              }
            ]
          }
        };

        mockServiceProxy.get.mockResolvedValue(mockResponse);

        const response = await request(app)
          .get('/api/zerodha/portfolio/holdings')
          .set('Authorization', validToken);

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(Array.isArray(response.body.data)).toBe(true);
      });
    });
  });

  describe('Risk Management Routes', () => {
    describe('GET /api/zerodha/risk/limits', () => {
      it('should get risk limits', async () => {
        const mockResponse = {
          data: {
            success: true,
            data: {
              max_order_value: 100000,
              max_daily_loss: 10000,
              max_position_size: 50000
            }
          }
        };

        mockServiceProxy.get.mockResolvedValue(mockResponse);

        const response = await request(app)
          .get('/api/zerodha/risk/limits')
          .set('Authorization', validToken);

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.data.max_order_value).toBe(100000);
      });
    });

    describe('POST /api/zerodha/risk/validate-order', () => {
      it('should validate order against risk limits', async () => {
        const mockResponse = {
          data: {
            success: true,
            data: {
              valid: true,
              message: 'Order passes all risk checks'
            }
          }
        };

        mockServiceProxy.post.mockResolvedValue(mockResponse);

        const response = await request(app)
          .post('/api/zerodha/risk/validate-order')
          .set('Authorization', validToken)
          .send({
            exchange: 'NSE',
            tradingsymbol: 'RELIANCE',
            transaction_type: 'BUY',
            quantity: 10,
            product: 'CNC',
            order_type: 'MARKET'
          });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.data.valid).toBe(true);
      });
    });
  });

  describe('Security Headers', () => {
    it('should include security headers in responses', async () => {
      const mockResponse = { data: { success: true } };
      mockServiceProxy.get.mockResolvedValue(mockResponse);

      const response = await request(app)
        .get('/api/zerodha/market/instruments')
        .set('Authorization', validToken);

      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['x-frame-options']).toBe('DENY');
      expect(response.headers['x-api-version']).toBe('v1');
      expect(response.headers['cache-control']).toContain('no-store');
    });

    it('should handle CORS preflight requests', async () => {
      const response = await request(app)
        .options('/api/zerodha/market/instruments')
        .set('Origin', 'http://localhost:3000');

      expect(response.status).toBe(204);
      expect(response.headers['access-control-allow-origin']).toBe('http://localhost:3000');
      expect(response.headers['access-control-allow-methods']).toContain('GET');
    });
  });

  describe('API Documentation', () => {
    it('should serve API documentation', async () => {
      const response = await request(app)
        .get('/api/zerodha/docs');

      expect(response.status).toBe(200);
      expect(response.body.title).toBe('TradeFlow Zerodha Integration API');
      expect(response.body.version).toBe('1.0.0');
      expect(Array.isArray(response.body.endpoints)).toBe(true);
      expect(response.body.websocket).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should handle service unavailable errors', async () => {
      mockServiceProxy.get.mockRejectedValue(new Error('Service unavailable'));

      const response = await request(app)
        .get('/api/zerodha/market/instruments')
        .set('Authorization', validToken);

      expect(response.status).toBe(500);
      expect(response.body.error).toBeDefined();
    });

    it('should handle validation errors', async () => {
      const response = await request(app)
        .post('/api/zerodha/market/subscribe')
        .set('Authorization', validToken)
        .send({
          instruments: 'invalid' // Should be array
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
    });

    it('should return 404 for unknown routes', async () => {
      const response = await request(app)
        .get('/api/zerodha/unknown-endpoint')
        .set('Authorization', validToken);

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe('NOT_FOUND');
    });
  });
});