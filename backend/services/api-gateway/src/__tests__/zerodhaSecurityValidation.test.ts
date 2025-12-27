import request from 'supertest';
import { jest } from '@jest/globals';
import { app } from '../index';
import { ServiceProxy } from '../services/serviceProxy';

// Mock ServiceProxy
jest.mock('../services/serviceProxy');
const MockedServiceProxy = ServiceProxy as jest.MockedClass<typeof ServiceProxy>;

describe('Zerodha Security and Validation', () => {
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

  describe('Security Headers', () => {
    it('should include comprehensive security headers', async () => {
      const mockResponse = { data: { success: true } };
      mockServiceProxy.get.mockResolvedValue(mockResponse);

      const response = await request(app)
        .get('/api/zerodha/market/instruments')
        .set('Authorization', validToken);

      // Check security headers
      expect(response.headers['content-security-policy']).toContain("default-src 'self'");
      expect(response.headers['strict-transport-security']).toContain('max-age=31536000');
      expect(response.headers['x-frame-options']).toBe('DENY');
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
      expect(response.headers['x-dns-prefetch-control']).toBe('off');
      expect(response.headers['cross-origin-embedder-policy']).toBe('require-corp');
      expect(response.headers['cross-origin-opener-policy']).toBe('same-origin');
    });

    it('should include cache control headers for sensitive endpoints', async () => {
      const mockResponse = { data: { success: true } };
      mockServiceProxy.get.mockResolvedValue(mockResponse);

      const response = await request(app)
        .get('/api/zerodha/portfolio/positions')
        .set('Authorization', validToken);

      expect(response.headers['cache-control']).toContain('no-store');
      expect(response.headers['cache-control']).toContain('no-cache');
      expect(response.headers['pragma']).toBe('no-cache');
      expect(response.headers['expires']).toBe('0');
    });

    it('should include API versioning headers', async () => {
      const mockResponse = { data: { success: true } };
      mockServiceProxy.get.mockResolvedValue(mockResponse);

      const response = await request(app)
        .get('/api/zerodha/market/instruments')
        .set('Authorization', validToken);

      expect(response.headers['x-api-version']).toBe('v1');
      expect(response.headers['x-request-id']).toBeDefined();
    });

    it('should reject unsupported API versions', async () => {
      const response = await request(app)
        .get('/api/zerodha/market/instruments')
        .set('Authorization', validToken)
        .set('X-API-Version', 'v2');

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('UNSUPPORTED_API_VERSION');
      expect(response.body.error.supportedVersions).toContain('v1');
    });
  });

  describe('CORS Configuration', () => {
    it('should handle CORS preflight for allowed origins', async () => {
      const response = await request(app)
        .options('/api/zerodha/market/instruments')
        .set('Origin', 'http://localhost:3000');

      expect(response.status).toBe(204);
      expect(response.headers['access-control-allow-origin']).toBe('http://localhost:3000');
      expect(response.headers['access-control-allow-methods']).toContain('GET');
      expect(response.headers['access-control-allow-headers']).toContain('Authorization');
      expect(response.headers['access-control-allow-credentials']).toBe('true');
    });

    it('should not set CORS headers for disallowed origins', async () => {
      const response = await request(app)
        .options('/api/zerodha/market/instruments')
        .set('Origin', 'http://malicious-site.com');

      expect(response.headers['access-control-allow-origin']).toBeUndefined();
    });

    it('should handle CORS for production domains', async () => {
      const response = await request(app)
        .options('/api/zerodha/market/instruments')
        .set('Origin', 'https://tradeflow.app');

      expect(response.status).toBe(204);
      expect(response.headers['access-control-allow-origin']).toBe('https://tradeflow.app');
    });
  });

  describe('Input Sanitization', () => {
    it('should sanitize query parameters', async () => {
      const mockResponse = { data: { success: true, data: [] } };
      mockServiceProxy.get.mockResolvedValue(mockResponse);

      const response = await request(app)
        .get('/api/zerodha/market/search?q=<script>alert("xss")</script>RELIANCE')
        .set('Authorization', validToken);

      expect(response.status).toBe(200);
      // The malicious script should be sanitized
      expect(mockServiceProxy.get).toHaveBeenCalledWith(
        expect.stringContaining('q=scriptalert(xss)/scriptRELIANCE'),
        expect.any(Object)
      );
    });

    it('should sanitize request body strings', async () => {
      const mockResponse = { data: { success: true } };
      mockServiceProxy.post.mockResolvedValue(mockResponse);

      const response = await request(app)
        .post('/api/zerodha/orders')
        .set('Authorization', validToken)
        .send({
          exchange: 'NSE',
          tradingsymbol: '<script>alert("xss")</script>RELIANCE',
          transaction_type: 'BUY',
          quantity: 10,
          product: 'CNC',
          order_type: 'MARKET'
        });

      expect(mockServiceProxy.post).toHaveBeenCalledWith('/orders', 
        expect.objectContaining({
          tradingsymbol: 'scriptalert(xss)/scriptRELIANCE'
        }),
        expect.any(Object)
      );
    });

    it('should preserve valid data during sanitization', async () => {
      const mockResponse = { data: { success: true } };
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

      expect(mockServiceProxy.post).toHaveBeenCalledWith('/orders', 
        expect.objectContaining({
          tradingsymbol: 'RELIANCE',
          exchange: 'NSE'
        }),
        expect.any(Object)
      );
    });
  });

  describe('Rate Limiting', () => {
    it('should enforce market data rate limits', async () => {
      const mockResponse = { data: { success: true, data: [] } };
      mockServiceProxy.get.mockResolvedValue(mockResponse);

      // Make requests faster than the 3 per second limit
      const requests = Array(5).fill(null).map(() =>
        request(app)
          .get('/api/zerodha/market/instruments')
          .set('Authorization', validToken)
      );

      const responses = await Promise.all(requests);
      
      // Some requests should be rate limited
      const rateLimitedResponses = responses.filter(res => res.status === 429);
      expect(rateLimitedResponses.length).toBeGreaterThan(0);
      
      // Check rate limit headers
      const rateLimitedResponse = rateLimitedResponses[0];
      expect(rateLimitedResponse.body.error.code).toBe('ZERODHA_MARKET_RATE_LIMIT_EXCEEDED');
    });

    it('should enforce order rate limits', async () => {
      const mockResponse = { data: { success: true } };
      mockServiceProxy.post.mockResolvedValue(mockResponse);

      // Make requests faster than the 10 per second limit
      const requests = Array(12).fill(null).map(() =>
        request(app)
          .post('/api/zerodha/orders')
          .set('Authorization', validToken)
          .send({
            exchange: 'NSE',
            tradingsymbol: 'RELIANCE',
            transaction_type: 'BUY',
            quantity: 1,
            product: 'CNC',
            order_type: 'MARKET'
          })
      );

      const responses = await Promise.all(requests);
      
      // Some requests should be rate limited
      const rateLimitedResponses = responses.filter(res => res.status === 429);
      expect(rateLimitedResponses.length).toBeGreaterThan(0);
      
      const rateLimitedResponse = rateLimitedResponses[0];
      expect(rateLimitedResponse.body.error.code).toBe('ZERODHA_ORDER_RATE_LIMIT_EXCEEDED');
    });

    it('should enforce general rate limits for other endpoints', async () => {
      const mockResponse = { data: { success: true } };
      mockServiceProxy.get.mockResolvedValue(mockResponse);

      // Make requests faster than the 10 per second limit
      const requests = Array(12).fill(null).map(() =>
        request(app)
          .get('/api/zerodha/portfolio/positions')
          .set('Authorization', validToken)
      );

      const responses = await Promise.all(requests);
      
      // Some requests should be rate limited
      const rateLimitedResponses = responses.filter(res => res.status === 429);
      expect(rateLimitedResponses.length).toBeGreaterThan(0);
      
      const rateLimitedResponse = rateLimitedResponses[0];
      expect(rateLimitedResponse.body.error.code).toBe('ZERODHA_GENERAL_RATE_LIMIT_EXCEEDED');
    });
  });

  describe('Input Validation', () => {
    describe('Order Validation', () => {
      it('should validate required fields', async () => {
        const response = await request(app)
          .post('/api/zerodha/orders')
          .set('Authorization', validToken)
          .send({
            exchange: 'NSE'
            // Missing required fields
          });

        expect(response.status).toBe(400);
        expect(response.body.error).toBeDefined();
      });

      it('should validate exchange values', async () => {
        const response = await request(app)
          .post('/api/zerodha/orders')
          .set('Authorization', validToken)
          .send({
            exchange: 'INVALID_EXCHANGE',
            tradingsymbol: 'RELIANCE',
            transaction_type: 'BUY',
            quantity: 10,
            product: 'CNC',
            order_type: 'MARKET'
          });

        expect(response.status).toBe(400);
        expect(response.body.error).toBeDefined();
      });

      it('should validate quantity is positive', async () => {
        const response = await request(app)
          .post('/api/zerodha/orders')
          .set('Authorization', validToken)
          .send({
            exchange: 'NSE',
            tradingsymbol: 'RELIANCE',
            transaction_type: 'BUY',
            quantity: -10, // Negative quantity
            product: 'CNC',
            order_type: 'MARKET'
          });

        expect(response.status).toBe(400);
        expect(response.body.error).toBeDefined();
      });

      it('should require price for LIMIT orders', async () => {
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

      it('should require trigger_price for stop loss orders', async () => {
        const response = await request(app)
          .post('/api/zerodha/orders')
          .set('Authorization', validToken)
          .send({
            exchange: 'NSE',
            tradingsymbol: 'RELIANCE',
            transaction_type: 'BUY',
            quantity: 10,
            product: 'CNC',
            order_type: 'SL'
            // Missing trigger_price for SL order
          });

        expect(response.status).toBe(400);
        expect(response.body.error).toBeDefined();
      });
    });

    describe('Market Data Validation', () => {
      it('should validate instruments array in subscription', async () => {
        const response = await request(app)
          .post('/api/zerodha/market/subscribe')
          .set('Authorization', validToken)
          .send({
            instruments: 'not-an-array',
            mode: 'quote'
          });

        expect(response.status).toBe(400);
        expect(response.body.error).toBeDefined();
      });

      it('should validate instruments array is not empty', async () => {
        const response = await request(app)
          .post('/api/zerodha/market/subscribe')
          .set('Authorization', validToken)
          .send({
            instruments: [],
            mode: 'quote'
          });

        expect(response.status).toBe(400);
        expect(response.body.error).toBeDefined();
      });

      it('should validate instruments array size limit', async () => {
        const tooManyInstruments = Array(101).fill(0).map((_, i) => i + 1);

        const response = await request(app)
          .post('/api/zerodha/market/subscribe')
          .set('Authorization', validToken)
          .send({
            instruments: tooManyInstruments,
            mode: 'quote'
          });

        expect(response.status).toBe(400);
        expect(response.body.error).toBeDefined();
      });

      it('should validate subscription mode', async () => {
        const response = await request(app)
          .post('/api/zerodha/market/subscribe')
          .set('Authorization', validToken)
          .send({
            instruments: [256265],
            mode: 'invalid_mode'
          });

        expect(response.status).toBe(400);
        expect(response.body.error).toBeDefined();
      });
    });

    describe('Query Parameter Validation', () => {
      it('should validate date formats', async () => {
        const mockResponse = { data: { success: true, data: [] } };
        mockServiceProxy.get.mockResolvedValue(mockResponse);

        const response = await request(app)
          .get('/api/zerodha/orders?from_date=invalid-date')
          .set('Authorization', validToken);

        expect(response.status).toBe(400);
        expect(response.body.error).toBeDefined();
      });

      it('should validate search query length', async () => {
        const response = await request(app)
          .get('/api/zerodha/market/search?q=')
          .set('Authorization', validToken);

        expect(response.status).toBe(400);
        expect(response.body.error).toBeDefined();
      });

      it('should validate search query max length', async () => {
        const longQuery = 'a'.repeat(51); // Exceeds 50 character limit

        const response = await request(app)
          .get(`/api/zerodha/market/search?q=${longQuery}`)
          .set('Authorization', validToken);

        expect(response.status).toBe(400);
        expect(response.body.error).toBeDefined();
      });
    });
  });

  describe('Authentication and Authorization', () => {
    it('should require authentication for protected routes', async () => {
      const response = await request(app)
        .get('/api/zerodha/market/instruments');

      expect(response.status).toBe(401);
    });

    it('should reject invalid tokens', async () => {
      const response = await request(app)
        .get('/api/zerodha/market/instruments')
        .set('Authorization', 'Bearer invalid-token');

      expect(response.status).toBe(401);
    });

    it('should allow access to auth endpoints without token', async () => {
      const mockResponse = { data: { success: true } };
      mockServiceProxy.post.mockResolvedValue(mockResponse);

      const response = await request(app)
        .post('/api/zerodha/auth/login')
        .send({
          api_key: 'test_key',
          redirect_url: 'http://localhost:3000/callback'
        });

      expect(response.status).toBe(200);
    });
  });

  describe('Error Response Format', () => {
    it('should return consistent error format', async () => {
      const response = await request(app)
        .post('/api/zerodha/orders')
        .set('Authorization', validToken)
        .send({
          exchange: 'NSE'
          // Missing required fields
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
      expect(response.body.error.code).toBeDefined();
      expect(response.body.error.message).toBeDefined();
    });

    it('should not expose sensitive information in errors', async () => {
      mockServiceProxy.post.mockRejectedValue(new Error('Database connection failed with password: secret123'));

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

      expect(response.status).toBe(500);
      expect(response.body.error.message).not.toContain('secret123');
      expect(response.body.error.message).not.toContain('Database connection');
    });
  });
});