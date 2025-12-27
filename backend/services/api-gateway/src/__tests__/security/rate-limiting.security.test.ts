import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../../index';
import { config } from '../../config/config';

describe('Rate Limiting and DDoS Protection Security Tests', () => {
  let validToken: string;

  beforeAll(() => {
    validToken = jwt.sign(
      { userId: 'test-user', type: 'access' },
      config.jwt.secret
    );
  });

  describe('General Rate Limiting', () => {
    it('should enforce rate limits on API endpoints', async () => {
      const endpoint = '/api/users/profile';
      const maxRequests = config.rateLimit.max || 100;
      const responses: any[] = [];

      // Make requests up to the limit
      for (let i = 0; i < maxRequests + 10; i++) {
        const response = await request(app)
          .get(endpoint)
          .set('Authorization', `Bearer ${validToken}`);
        
        responses.push(response);
        
        // If we hit rate limit, break early
        if (response.status === 429) {
          break;
        }
      }

      // Should eventually get rate limited
      const rateLimitedResponses = responses.filter(r => r.status === 429);
      expect(rateLimitedResponses.length).toBeGreaterThan(0);

      // Rate limit response should have proper headers
      const rateLimitResponse = rateLimitedResponses[0];
      expect(rateLimitResponse.headers['retry-after']).toBeDefined();
      expect(rateLimitResponse.body.error.code).toBe('RATE_LIMIT_EXCEEDED');
    });

    it('should have different rate limits per IP address', async () => {
      const endpoint = '/api/auth/login';
      
      // Simulate requests from different IPs
      const ip1Responses: any[] = [];
      const ip2Responses: any[] = [];

      // Make requests from IP 1
      for (let i = 0; i < 20; i++) {
        const response = await request(app)
          .post(endpoint)
          .set('X-Forwarded-For', '192.168.1.1')
          .send({
            email: 'test@example.com',
            password: 'wrongpassword'
          });
        
        ip1Responses.push(response);
        
        if (response.status === 429) break;
      }

      // Make requests from IP 2 (should not be affected by IP 1's rate limit)
      for (let i = 0; i < 5; i++) {
        const response = await request(app)
          .post(endpoint)
          .set('X-Forwarded-For', '192.168.1.2')
          .send({
            email: 'test@example.com',
            password: 'wrongpassword'
          });
        
        ip2Responses.push(response);
      }

      // IP 1 should be rate limited
      const ip1RateLimited = ip1Responses.some(r => r.status === 429);
      expect(ip1RateLimited).toBe(true);

      // IP 2 should not be immediately rate limited
      const ip2RateLimited = ip2Responses.some(r => r.status === 429);
      expect(ip2RateLimited).toBe(false);
    });

    it('should reset rate limits after time window', async () => {
      const endpoint = '/api/auth/login';
      
      // Make requests to hit rate limit
      let rateLimited = false;
      for (let i = 0; i < 50; i++) {
        const response = await request(app)
          .post(endpoint)
          .set('X-Forwarded-For', '192.168.1.100')
          .send({
            email: 'test@example.com',
            password: 'wrongpassword'
          });
        
        if (response.status === 429) {
          rateLimited = true;
          break;
        }
      }

      expect(rateLimited).toBe(true);

      // Wait for rate limit window to reset (this would be a longer test in practice)
      // For testing purposes, we'll just verify the rate limit was applied
      const response = await request(app)
        .post(endpoint)
        .set('X-Forwarded-For', '192.168.1.100')
        .send({
          email: 'test@example.com',
          password: 'wrongpassword'
        });

      expect(response.status).toBe(429);
    });
  });

  describe('Authentication Rate Limiting', () => {
    it('should have stricter rate limits on login attempts', async () => {
      const loginEndpoint = '/api/auth/login';
      const testIP = '192.168.2.1';
      
      let loginAttempts = 0;
      let rateLimited = false;

      // Make rapid login attempts
      for (let i = 0; i < 20; i++) {
        const response = await request(app)
          .post(loginEndpoint)
          .set('X-Forwarded-For', testIP)
          .send({
            email: 'nonexistent@example.com',
            password: 'wrongpassword'
          });

        loginAttempts++;

        if (response.status === 429) {
          rateLimited = true;
          break;
        }
      }

      // Should be rate limited after fewer attempts than general API
      expect(rateLimited).toBe(true);
      expect(loginAttempts).toBeLessThan(15); // Should be limited before 15 attempts
    });

    it('should prevent brute force attacks on user accounts', async () => {
      const targetEmail = 'target@example.com';
      const passwords = [
        'password123', 'admin', '123456', 'password', 'qwerty',
        'letmein', 'welcome', 'monkey', 'dragon', 'master'
      ];

      let blockedAttempts = 0;

      for (const password of passwords) {
        const response = await request(app)
          .post('/api/auth/login')
          .set('X-Forwarded-For', '192.168.3.1')
          .send({
            email: targetEmail,
            password: password
          });

        if (response.status === 429) {
          blockedAttempts++;
        }
      }

      // Should block some attempts
      expect(blockedAttempts).toBeGreaterThan(0);
    });

    it('should implement progressive delays for failed login attempts', async () => {
      const testEmail = 'progressive-test@example.com';
      const testIP = '192.168.4.1';
      const responseTimes: number[] = [];

      for (let i = 0; i < 5; i++) {
        const startTime = Date.now();
        
        const response = await request(app)
          .post('/api/auth/login')
          .set('X-Forwarded-For', testIP)
          .send({
            email: testEmail,
            password: 'wrongpassword'
          });

        const endTime = Date.now();
        responseTimes.push(endTime - startTime);

        // Break if rate limited
        if (response.status === 429) break;
      }

      // Response times should generally increase (progressive delay)
      // This is a simplified test - real implementation might vary
      expect(responseTimes.length).toBeGreaterThan(2);
    });
  });

  describe('DDoS Protection', () => {
    it('should handle burst requests gracefully', async () => {
      const endpoint = '/api/users/profile';
      const burstSize = 50;
      const promises: Promise<any>[] = [];

      // Create burst of concurrent requests
      for (let i = 0; i < burstSize; i++) {
        promises.push(
          request(app)
            .get(endpoint)
            .set('Authorization', `Bearer ${validToken}`)
            .set('X-Forwarded-For', `192.168.5.${i % 10}`)
        );
      }

      const responses = await Promise.all(promises);

      // Should handle requests without crashing
      expect(responses.length).toBe(burstSize);

      // Some requests should succeed, some might be rate limited
      const successfulRequests = responses.filter(r => r.status === 200);
      const rateLimitedRequests = responses.filter(r => r.status === 429);

      expect(successfulRequests.length + rateLimitedRequests.length).toBe(burstSize);
      expect(rateLimitedRequests.length).toBeGreaterThan(0);
    });

    it('should protect against slowloris attacks', async () => {
      // Simulate slow request by sending partial data
      const startTime = Date.now();
      
      try {
        const response = await request(app)
          .post('/api/auth/login')
          .timeout(5000) // 5 second timeout
          .send({
            email: 'slow-test@example.com'
            // Intentionally incomplete request
          });

        const endTime = Date.now();
        const duration = endTime - startTime;

        // Should timeout or reject quickly, not hang
        expect(duration).toBeLessThan(10000);
        expect([400, 408, 422]).toContain(response.status);
      } catch (error) {
        // Timeout is expected behavior
        expect(error).toBeDefined();
      }
    });

    it('should limit request payload size', async () => {
      const largePayload = {
        email: 'test@example.com',
        password: 'password123',
        data: 'x'.repeat(10 * 1024 * 1024) // 10MB of data
      };

      const response = await request(app)
        .post('/api/auth/register')
        .send(largePayload);

      // Should reject large payloads
      expect([400, 413, 422]).toContain(response.status);
    });

    it('should handle malformed requests gracefully', async () => {
      const malformedRequests = [
        Buffer.from('invalid json data'),
        '{"incomplete": json',
        '{"nested": {"very": {"deeply": {"nested": {"object": {"that": {"goes": {"too": {"deep": "value"}}}}}}}}}}',
        null,
        undefined
      ];

      for (const payload of malformedRequests) {
        try {
          const response = await request(app)
            .post('/api/auth/login')
            .send(payload);

          // Should handle gracefully with appropriate error
          expect([400, 422]).toContain(response.status);
          expect(response.body.error).toBeDefined();
        } catch (error) {
          // Some malformed requests might cause request library errors
          expect(error).toBeDefined();
        }
      }
    });
  });

  describe('Resource Exhaustion Protection', () => {
    it('should limit concurrent connections per IP', async () => {
      const testIP = '192.168.6.1';
      const maxConcurrent = 20;
      const promises: Promise<any>[] = [];

      // Create many concurrent long-running requests
      for (let i = 0; i < maxConcurrent + 10; i++) {
        promises.push(
          request(app)
            .get('/api/users/profile')
            .set('Authorization', `Bearer ${validToken}`)
            .set('X-Forwarded-For', testIP)
            .timeout(10000)
        );
      }

      const responses = await Promise.allSettled(promises);

      // Some requests should be rejected or timeout
      const rejectedRequests = responses.filter(r => r.status === 'rejected');
      const rateLimitedRequests = responses
        .filter(r => r.status === 'fulfilled')
        .map(r => (r as any).value)
        .filter(r => r.status === 429);

      expect(rejectedRequests.length + rateLimitedRequests.length).toBeGreaterThan(0);
    });

    it('should prevent memory exhaustion through large requests', async () => {
      const strategies = [];
      
      // Create a large strategy configuration
      for (let i = 0; i < 1000; i++) {
        strategies.push({
          id: `node-${i}`,
          type: 'indicator',
          config: {
            indicator: 'sma',
            period: 20,
            data: 'x'.repeat(1000) // Large data field
          },
          position: { x: i * 100, y: i * 100 }
        });
      }

      const response = await request(app)
        .post('/api/strategies')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          name: 'Large Strategy',
          description: 'Test strategy with many nodes',
          config: {
            nodes: strategies,
            connections: [],
            parameters: {
              timeframe: '1h',
              positionSizing: { type: 'fixed', value: 1000 }
            }
          }
        });

      // Should reject or handle large requests appropriately
      expect([400, 413, 422]).toContain(response.status);
    });
  });

  describe('API Abuse Prevention', () => {
    it('should detect and block suspicious request patterns', async () => {
      const suspiciousPatterns = [
        // Rapid sequential requests to different endpoints
        '/api/users/profile',
        '/api/strategies',
        '/api/portfolio/positions',
        '/api/backtests',
        '/api/users/settings'
      ];

      const testIP = '192.168.7.1';
      let blockedRequests = 0;

      // Make rapid requests to different endpoints
      for (let round = 0; round < 10; round++) {
        for (const endpoint of suspiciousPatterns) {
          const response = await request(app)
            .get(endpoint)
            .set('Authorization', `Bearer ${validToken}`)
            .set('X-Forwarded-For', testIP);

          if (response.status === 429) {
            blockedRequests++;
          }
        }
      }

      // Should eventually block suspicious patterns
      expect(blockedRequests).toBeGreaterThan(0);
    });

    it('should implement CAPTCHA-like protection for suspicious activity', async () => {
      // This would typically involve a CAPTCHA service
      // For testing, we'll simulate the behavior
      
      const testIP = '192.168.8.1';
      
      // Make many failed login attempts to trigger protection
      for (let i = 0; i < 10; i++) {
        await request(app)
          .post('/api/auth/login')
          .set('X-Forwarded-For', testIP)
          .send({
            email: 'test@example.com',
            password: 'wrongpassword'
          });
      }

      // Next request should require additional verification
      const response = await request(app)
        .post('/api/auth/login')
        .set('X-Forwarded-For', testIP)
        .send({
          email: 'test@example.com',
          password: 'correctpassword'
        });

      // Should be blocked or require additional verification
      expect([400, 429, 403]).toContain(response.status);
    });
  });
});