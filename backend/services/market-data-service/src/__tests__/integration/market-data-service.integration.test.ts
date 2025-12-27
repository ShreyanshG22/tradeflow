import request from 'supertest';
import { app } from '../../index';
import { DatabaseService } from '../../../user-service/src/services/database';
import { RedisService } from '../../../user-service/src/services/redis';
import io from 'socket.io-client';

describe('Market Data Service Integration Tests', () => {
  let authToken: string;
  let testUserId: string;

  beforeAll(async () => {
    await DatabaseService.initialize();
    await RedisService.initialize();

    // Create test user
    const registerResponse = await request(app)
      .post('/api/auth/register')
      .send({
        email: 'market-data-integration-test@example.com',
        password: 'TestPassword123',
        firstName: 'MarketData',
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

  describe('Market Data Provider Integration', () => {
    it('should retrieve real-time quotes from multiple providers', async () => {
      const symbols = ['AAPL', 'GOOGL', 'MSFT'];

      for (const symbol of symbols) {
        const response = await request(app)
          .get(`/api/market-data/quote/${symbol}`)
          .set('Authorization', `Bearer ${authToken}`);

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('symbol');
        expect(response.body).toHaveProperty('price');
        expect(response.body).toHaveProperty('bid');
        expect(response.body).toHaveProperty('ask');
        expect(response.body).toHaveProperty('volume');
        expect(response.body).toHaveProperty('timestamp');
        expect(response.body).toHaveProperty('provider');
        
        expect(response.body.symbol).toBe(symbol);
        expect(typeof response.body.price).toBe('number');
        expect(response.body.price).toBeGreaterThan(0);
      }
    });

    it('should handle provider failover gracefully', async () => {
      // Test primary provider
      const primaryResponse = await request(app)
        .get('/api/market-data/quote/AAPL?provider=primary')
        .set('Authorization', `Bearer ${authToken}`);

      // Test fallback provider
      const fallbackResponse = await request(app)
        .get('/api/market-data/quote/AAPL?provider=fallback')
        .set('Authorization', `Bearer ${authToken}`);

      // Both should work or fallback gracefully
      expect([200, 503]).toContain(primaryResponse.status);
      expect([200, 503]).toContain(fallbackResponse.status);

      // At least one should work
      expect(primaryResponse.status === 200 || fallbackResponse.status === 200).toBe(true);

      if (primaryResponse.status === 200 && fallbackResponse.status === 200) {
        // Data should be consistent between providers
        expect(primaryResponse.body.symbol).toBe(fallbackResponse.body.symbol);
        
        // Prices should be within reasonable range (5% difference)
        const priceDiff = Math.abs(primaryResponse.body.price - fallbackResponse.body.price);
        const avgPrice = (primaryResponse.body.price + fallbackResponse.body.price) / 2;
        expect(priceDiff / avgPrice).toBeLessThan(0.05);
      }
    });

    it('should retrieve historical data with proper formatting', async () => {
      const response = await request(app)
        .get('/api/market-data/historical/AAPL?timeframe=1d&startDate=2023-01-01&endDate=2023-01-31')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('symbol');
      expect(response.body).toHaveProperty('data');
      expect(response.body).toHaveProperty('timeframe');
      expect(response.body).toHaveProperty('startDate');
      expect(response.body).toHaveProperty('endDate');
      
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBeGreaterThan(0);

      // Verify data structure
      const dataPoint = response.body.data[0];
      expect(dataPoint).toHaveProperty('timestamp');
      expect(dataPoint).toHaveProperty('open');
      expect(dataPoint).toHaveProperty('high');
      expect(dataPoint).toHaveProperty('low');
      expect(dataPoint).toHaveProperty('close');
      expect(dataPoint).toHaveProperty('volume');
      
      // Verify OHLC relationships
      expect(dataPoint.high).toBeGreaterThanOrEqual(dataPoint.open);
      expect(dataPoint.high).toBeGreaterThanOrEqual(dataPoint.close);
      expect(dataPoint.low).toBeLessThanOrEqual(dataPoint.open);
      expect(dataPoint.low).toBeLessThanOrEqual(dataPoint.close);
      expect(dataPoint.volume).toBeGreaterThan(0);
    });

    it('should handle different timeframes correctly', async () => {
      const timeframes = ['1m', '5m', '15m', '1h', '1d'];
      const symbol = 'AAPL';
      const startDate = '2023-01-01';
      const endDate = '2023-01-07';

      for (const timeframe of timeframes) {
        const response = await request(app)
          .get(`/api/market-data/historical/${symbol}?timeframe=${timeframe}&startDate=${startDate}&endDate=${endDate}`)
          .set('Authorization', `Bearer ${authToken}`);

        expect(response.status).toBe(200);
        expect(response.body.timeframe).toBe(timeframe);
        expect(Array.isArray(response.body.data)).toBe(true);
        
        // Higher frequency should have more data points
        if (timeframe === '1m') {
          expect(response.body.data.length).toBeGreaterThan(100);
        } else if (timeframe === '1d') {
          expect(response.body.data.length).toBeLessThan(10);
        }
      }
    });
  });

  describe('Market Data Caching Integration', () => {
    it('should cache quote data efficiently', async () => {
      const symbol = 'AAPL';

      // First request - should fetch from provider
      const firstResponse = await request(app)
        .get(`/api/market-data/quote/${symbol}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(firstResponse.status).toBe(200);
      const firstTimestamp = new Date(firstResponse.body.timestamp);

      // Second request - should use cache
      const secondResponse = await request(app)
        .get(`/api/market-data/quote/${symbol}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(secondResponse.status).toBe(200);
      const secondTimestamp = new Date(secondResponse.body.timestamp);

      // Should be from cache (same or very close timestamp)
      const timeDiff = Math.abs(secondTimestamp.getTime() - firstTimestamp.getTime());
      expect(timeDiff).toBeLessThan(5000); // Within 5 seconds

      // Verify cache hit in Redis
      const cacheKey = `quote:${symbol}`;
      const cachedData = await RedisService.get(cacheKey);
      expect(cachedData).toBeTruthy();

      const parsedCache = JSON.parse(cachedData);
      expect(parsedCache.symbol).toBe(symbol);
      expect(parsedCache.price).toBe(secondResponse.body.price);
    });

    it('should handle cache expiration correctly', async () => {
      const symbol = 'MSFT';

      // Get initial quote
      const initialResponse = await request(app)
        .get(`/api/market-data/quote/${symbol}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(initialResponse.status).toBe(200);

      // Manually expire cache
      const cacheKey = `quote:${symbol}`;
      await RedisService.del(cacheKey);

      // Next request should fetch fresh data
      const freshResponse = await request(app)
        .get(`/api/market-data/quote/${symbol}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(freshResponse.status).toBe(200);
      
      // Should have fresh timestamp
      const initialTime = new Date(initialResponse.body.timestamp);
      const freshTime = new Date(freshResponse.body.timestamp);
      expect(freshTime.getTime()).toBeGreaterThanOrEqual(initialTime.getTime());
    });

    it('should cache historical data with proper TTL', async () => {
      const symbol = 'GOOGL';
      const timeframe = '1d';
      const startDate = '2023-01-01';
      const endDate = '2023-01-31';

      // First request
      const firstResponse = await request(app)
        .get(`/api/market-data/historical/${symbol}?timeframe=${timeframe}&startDate=${startDate}&endDate=${endDate}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(firstResponse.status).toBe(200);

      // Verify cache
      const cacheKey = `historical:${symbol}:${timeframe}:${startDate}:${endDate}`;
      const cachedData = await RedisService.get(cacheKey);
      expect(cachedData).toBeTruthy();

      // Second request should use cache
      const secondResponse = await request(app)
        .get(`/api/market-data/historical/${symbol}?timeframe=${timeframe}&startDate=${startDate}&endDate=${endDate}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(secondResponse.status).toBe(200);
      expect(secondResponse.body.data).toEqual(firstResponse.body.data);
    });

    it('should handle cache invalidation on data updates', async () => {
      const symbol = 'TSLA';

      // Get initial quote
      await request(app)
        .get(`/api/market-data/quote/${symbol}`)
        .set('Authorization', `Bearer ${authToken}`);

      // Simulate data update
      const updateResponse = await request(app)
        .post('/api/market-data/update')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          symbol,
          price: 250.75,
          volume: 1500000,
          timestamp: new Date().toISOString()
        });

      expect(updateResponse.status).toBe(200);

      // Cache should be invalidated
      const cacheKey = `quote:${symbol}`;
      const cachedData = await RedisService.get(cacheKey);
      
      if (cachedData) {
        const parsedCache = JSON.parse(cachedData);
        expect(parsedCache.price).toBe(250.75);
      }
    });
  });

  describe('Real-time Market Data Integration', () => {
    it('should handle WebSocket subscriptions', async () => {
      const client = io('http://localhost:3001', {
        auth: { token: authToken }
      });

      await new Promise((resolve) => {
        client.on('connect', resolve);
      });

      let marketDataReceived = false;
      const symbols = ['AAPL', 'GOOGL'];

      // Subscribe to market data
      client.emit('subscribe:market-data', { symbols });

      client.on('subscription:confirmed', (data) => {
        expect(data.type).toBe('market-data');
        expect(data.symbols).toEqual(symbols);
      });

      client.on('market-data:update', (data) => {
        marketDataReceived = true;
        expect(data).toHaveProperty('symbol');
        expect(data).toHaveProperty('price');
        expect(data).toHaveProperty('timestamp');
        expect(symbols).toContain(data.symbol);
      });

      // Simulate market data update
      await request(app)
        .post('/api/market-data/simulate-update')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          symbol: 'AAPL',
          price: 155.25,
          volume: 2000000
        });

      // Wait for real-time update
      await new Promise(resolve => setTimeout(resolve, 2000));
      expect(marketDataReceived).toBe(true);

      client.disconnect();
    });

    it('should handle multiple concurrent subscriptions', async () => {
      const clients = [];
      const receivedData = [];

      // Create multiple clients
      for (let i = 0; i < 3; i++) {
        const client = io('http://localhost:3001', {
          auth: { token: authToken }
        });

        await new Promise((resolve) => {
          client.on('connect', resolve);
        });

        client.emit('subscribe:market-data', { symbols: ['MSFT'] });
        
        client.on('market-data:update', (data) => {
          receivedData.push({ clientId: i, data });
        });

        clients.push(client);
      }

      // Simulate market data update
      await request(app)
        .post('/api/market-data/simulate-update')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          symbol: 'MSFT',
          price: 300.50,
          volume: 1800000
        });

      // Wait for updates
      await new Promise(resolve => setTimeout(resolve, 2000));

      // All clients should receive the update
      expect(receivedData.length).toBe(3);
      receivedData.forEach(item => {
        expect(item.data.symbol).toBe('MSFT');
        expect(item.data.price).toBe(300.50);
      });

      // Clean up clients
      clients.forEach(client => client.disconnect());
    });

    it('should handle subscription management', async () => {
      const client = io('http://localhost:3001', {
        auth: { token: authToken }
      });

      await new Promise((resolve) => {
        client.on('connect', resolve);
      });

      let subscriptionCount = 0;
      client.on('subscription:confirmed', () => {
        subscriptionCount++;
      });

      // Subscribe to multiple symbols
      client.emit('subscribe:market-data', { symbols: ['AAPL', 'GOOGL'] });
      await new Promise(resolve => setTimeout(resolve, 500));

      // Add more symbols
      client.emit('subscribe:market-data', { symbols: ['MSFT', 'TSLA'] });
      await new Promise(resolve => setTimeout(resolve, 500));

      // Unsubscribe from some symbols
      client.emit('unsubscribe:market-data', { symbols: ['GOOGL'] });
      await new Promise(resolve => setTimeout(resolve, 500));

      expect(subscriptionCount).toBeGreaterThan(0);

      client.disconnect();
    });
  });

  describe('Market Data Validation Integration', () => {
    it('should validate incoming market data', async () => {
      const validData = {
        symbol: 'AAPL',
        data: [
          {
            timestamp: '2023-01-01T10:00:00Z',
            open: 150.00,
            high: 152.00,
            low: 149.50,
            close: 151.25,
            volume: 1000000
          },
          {
            timestamp: '2023-01-01T11:00:00Z',
            open: 151.25,
            high: 153.00,
            low: 150.75,
            close: 152.50,
            volume: 1200000
          }
        ]
      };

      const response = await request(app)
        .post('/api/market-data/validate')
        .set('Authorization', `Bearer ${authToken}`)
        .send(validData);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('isValid');
      expect(response.body.isValid).toBe(true);
      expect(response.body).toHaveProperty('normalizedData');
      expect(response.body.normalizedData).toHaveLength(2);
    });

    it('should reject invalid market data', async () => {
      const invalidDataSets = [
        {
          symbol: 'AAPL',
          data: [{
            timestamp: 'invalid-date',
            open: 150.00,
            high: 152.00,
            low: 149.50,
            close: 151.25,
            volume: 1000000
          }]
        },
        {
          symbol: 'AAPL',
          data: [{
            timestamp: '2023-01-01T10:00:00Z',
            open: 150.00,
            high: 149.00, // High < Open (invalid)
            low: 149.50,
            close: 151.25,
            volume: 1000000
          }]
        },
        {
          symbol: 'AAPL',
          data: [{
            timestamp: '2023-01-01T10:00:00Z',
            open: 150.00,
            high: 152.00,
            low: 153.00, // Low > High (invalid)
            close: 151.25,
            volume: 1000000
          }]
        }
      ];

      for (const invalidData of invalidDataSets) {
        const response = await request(app)
          .post('/api/market-data/validate')
          .set('Authorization', `Bearer ${authToken}`)
          .send(invalidData);

        expect(response.status).toBe(400);
        expect(response.body.error).toHaveProperty('code');
        expect(response.body.error.code).toBe('INVALID_MARKET_DATA');
      }
    });

    it('should normalize market data formats', async () => {
      const unnormalizedData = {
        symbol: 'AAPL',
        data: [
          {
            timestamp: 1672574400000, // Unix timestamp
            o: 150.00, // Different field names
            h: 152.00,
            l: 149.50,
            c: 151.25,
            v: 1000000
          }
        ]
      };

      const response = await request(app)
        .post('/api/market-data/normalize')
        .set('Authorization', `Bearer ${authToken}`)
        .send(unnormalizedData);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('normalizedData');
      
      const normalized = response.body.normalizedData[0];
      expect(normalized).toHaveProperty('timestamp');
      expect(normalized).toHaveProperty('open');
      expect(normalized).toHaveProperty('high');
      expect(normalized).toHaveProperty('low');
      expect(normalized).toHaveProperty('close');
      expect(normalized).toHaveProperty('volume');
      
      expect(typeof normalized.timestamp).toBe('string');
      expect(normalized.open).toBe(150.00);
    });
  });

  describe('Market Data Performance Integration', () => {
    it('should handle high-frequency data requests', async () => {
      const symbols = ['AAPL', 'GOOGL', 'MSFT', 'TSLA', 'AMZN'];
      const startTime = Date.now();

      // Make concurrent requests for multiple symbols
      const promises = symbols.map(symbol =>
        request(app)
          .get(`/api/market-data/quote/${symbol}`)
          .set('Authorization', `Bearer ${authToken}`)
      );

      const responses = await Promise.all(promises);
      const endTime = Date.now();

      // All requests should succeed
      responses.forEach(response => {
        expect(response.status).toBe(200);
      });

      // Should complete within reasonable time
      const duration = endTime - startTime;
      expect(duration).toBeLessThan(5000); // 5 seconds
    });

    it('should handle large historical data requests', async () => {
      const response = await request(app)
        .get('/api/market-data/historical/AAPL?timeframe=1h&startDate=2023-01-01&endDate=2023-12-31')
        .set('Authorization', `Bearer ${authToken}`)
        .timeout(30000); // 30 second timeout

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBeGreaterThan(1000); // Should have many data points
    });

    it('should handle rate limiting gracefully', async () => {
      const requests = [];
      
      // Make many rapid requests
      for (let i = 0; i < 30; i++) {
        requests.push(
          request(app)
            .get('/api/market-data/quote/AAPL')
            .set('Authorization', `Bearer ${authToken}`)
        );
      }

      const responses = await Promise.all(requests);
      
      // Some should succeed, some might be rate limited
      const successfulResponses = responses.filter(r => r.status === 200);
      const rateLimitedResponses = responses.filter(r => r.status === 429);
      
      expect(successfulResponses.length).toBeGreaterThan(0);
      
      // If rate limiting is active, check headers
      rateLimitedResponses.forEach(response => {
        expect(response.headers).toHaveProperty('retry-after');
      });
    });
  });

  describe('Market Data Error Handling Integration', () => {
    it('should handle provider API failures', async () => {
      // Test with invalid symbol that should trigger provider error
      const response = await request(app)
        .get('/api/market-data/quote/INVALID_SYMBOL_12345')
        .set('Authorization', `Bearer ${authToken}`);

      expect([404, 503]).toContain(response.status);
      expect(response.body.error).toHaveProperty('code');
      
      if (response.status === 404) {
        expect(response.body.error.code).toBe('SYMBOL_NOT_FOUND');
      } else {
        expect(response.body.error.code).toBe('PROVIDER_ERROR');
      }
    });

    it('should handle network timeouts', async () => {
      // Test with request that might timeout
      const response = await request(app)
        .get('/api/market-data/historical/AAPL?timeframe=1m&startDate=2020-01-01&endDate=2023-12-31')
        .set('Authorization', `Bearer ${authToken}`)
        .timeout(10000);

      // Should either succeed or timeout gracefully
      expect([200, 408, 504]).toContain(response.status);
      
      if (response.status >= 400) {
        expect(response.body.error).toHaveProperty('code');
      }
    });

    it('should handle Redis connection failures', async () => {
      // Temporarily disconnect Redis
      await RedisService.disconnect();

      // Requests should still work (without caching)
      const response = await request(app)
        .get('/api/market-data/quote/AAPL')
        .set('Authorization', `Bearer ${authToken}`);

      expect([200, 503]).toContain(response.status);

      // Reconnect Redis
      await RedisService.initialize();
    });

    it('should handle malformed data gracefully', async () => {
      const malformedData = {
        symbol: 'AAPL',
        data: 'not_an_array'
      };

      const response = await request(app)
        .post('/api/market-data/validate')
        .set('Authorization', `Bearer ${authToken}`)
        .send(malformedData);

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('INVALID_DATA_FORMAT');
    });
  });
});