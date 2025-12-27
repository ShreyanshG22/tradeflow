import request from 'supertest';
import { Express } from 'express';
import jwt from 'jsonwebtoken';
import { createTestApp } from '../setup/test-app';
import { TestDataManager } from '../setup/test-data-manager';
import { ZerodhaTestClient } from '../setup/zerodha-test-client';

describe('Authentication Security Tests', () => {
  let app: Express;
  let testDataManager: TestDataManager;
  let zerodhaClient: ZerodhaTestClient;
  let testUserId: string;

  beforeAll(async () => {
    app = await createTestApp();
    testDataManager = new TestDataManager();
    zerodhaClient = new ZerodhaTestClient();
    await testDataManager.setup();
  });

  afterAll(async () => {
    await testDataManager.cleanup();
  });

  beforeEach(async () => {
    testUserId = await testDataManager.createTestUser();
  });

  afterEach(async () => {
    await testDataManager.cleanupTestUser(testUserId);
  });

  describe('JWT Token Security', () => {
    it('should reject invalid JWT tokens', async () => {
      const invalidTokens = [
        'invalid.token.here',
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.invalid.signature',
        '', // Empty token
        'Bearer ', // Empty bearer
        'malformed-token',
        'eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJ1c2VyX2lkIjoidGVzdCJ9.' // None algorithm
      ];

      for (const token of invalidTokens) {
        const response = await request(app)
          .get('/api/zerodha/auth/profile')
          .set('Authorization', `Bearer ${token}`)
          .expect(401);

        expect(response.body).toMatchObject({
          success: false,
          error: {
            code: expect.stringMatching(/INVALID_TOKEN|UNAUTHORIZED/),
            message: expect.any(String)
          }
        });
      }
    });

    it('should reject expired JWT tokens', async () => {
      const expiredPayload = {
        user_id: testUserId,
        exp: Math.floor(Date.now() / 1000) - 3600 // Expired 1 hour ago
      };

      const expiredToken = jwt.sign(expiredPayload, process.env.JWT_SECRET || 'test_jwt_secret');

      const response = await request(app)
        .get('/api/zerodha/auth/profile')
        .set('Authorization', `Bearer ${expiredToken}`)
        .expect(401);

      expect(response.body).toMatchObject({
        success: false,
        error: {
          code: 'TOKEN_EXPIRED',
          message: expect.stringContaining('expired')
        }
      });
    });

    it('should reject tokens with invalid signatures', async () => {
      const validPayload = {
        user_id: testUserId,
        exp: Math.floor(Date.now() / 1000) + 3600
      };

      const tokenWithWrongSecret = jwt.sign(validPayload, 'wrong_secret');

      const response = await request(app)
        .get('/api/zerodha/auth/profile')
        .set('Authorization', `Bearer ${tokenWithWrongSecret}`)
        .expect(401);

      expect(response.body).toMatchObject({
        success: false,
        error: {
          code: 'INVALID_SIGNATURE',
          message: expect.any(String)
        }
      });
    });

    it('should validate token claims properly', async () => {
      // Test missing required claims
      const invalidClaims = [
        { exp: Math.floor(Date.now() / 1000) + 3600 }, // Missing user_id
        { user_id: testUserId }, // Missing exp
        { user_id: '', exp: Math.floor(Date.now() / 1000) + 3600 }, // Empty user_id
        { user_id: null, exp: Math.floor(Date.now() / 1000) + 3600 } // Null user_id
      ];

      for (const claims of invalidClaims) {
        const token = jwt.sign(claims, process.env.JWT_SECRET || 'test_jwt_secret');

        const response = await request(app)
          .get('/api/zerodha/auth/profile')
          .set('Authorization', `Bearer ${token}`)
          .expect(401);

        expect(response.body.success).toBe(false);
      }
    });

    it('should prevent token reuse after logout', async () => {
      const { access_token } = await zerodhaClient.authenticateTestUser(testUserId);

      // Verify token works initially
      await request(app)
        .get('/api/zerodha/auth/profile')
        .set('Authorization', `Bearer ${access_token}`)
        .expect(200);

      // Logout
      await request(app)
        .delete('/api/zerodha/auth/logout')
        .set('Authorization', `Bearer ${access_token}`)
        .expect(200);

      // Token should no longer work
      const response = await request(app)
        .get('/api/zerodha/auth/profile')
        .set('Authorization', `Bearer ${access_token}`)
        .expect(401);

      expect(response.body).toMatchObject({
        success: false,
        error: {
          code: 'TOKEN_REVOKED',
          message: expect.any(String)
        }
      });
    });
  });

  describe('OAuth Flow Security', () => {
    it('should validate state parameter in OAuth callback', async () => {
      // Test missing state
      const response1 = await request(app)
        .get('/api/zerodha/auth/callback')
        .query({
          request_token: 'valid_token',
          action: 'login',
          status: 'success'
        })
        .expect(400);

      expect(response1.body.error.code).toBe('MISSING_STATE');

      // Test invalid state
      const response2 = await request(app)
        .get('/api/zerodha/auth/callback')
        .query({
          request_token: 'valid_token',
          state: 'invalid_state',
          action: 'login',
          status: 'success'
        })
        .expect(400);

      expect(response2.body.error.code).toBe('INVALID_STATE');
    });

    it('should prevent CSRF attacks in OAuth flow', async () => {
      // Initiate login to get valid state
      const loginResponse = await request(app)
        .post('/api/zerodha/auth/login')
        .send({ user_id: testUserId })
        .expect(200);

      const { state } = loginResponse.body.data;

      // Try to use state from different session/user
      const anotherUserId = await testDataManager.createTestUser();
      
      const response = await request(app)
        .get('/api/zerodha/auth/callback')
        .query({
          request_token: zerodhaClient.generateMockRequestToken(),
          state: state, // Using state from different user
          action: 'login',
          status: 'success'
        })
        .expect(400);

      expect(response.body.error.code).toBe('STATE_MISMATCH');

      await testDataManager.cleanupTestUser(anotherUserId);
    });

    it('should validate request token format and authenticity', async () => {
      const loginResponse = await request(app)
        .post('/api/zerodha/auth/login')
        .send({ user_id: testUserId })
        .expect(200);

      const { state } = loginResponse.body.data;

      const invalidTokens = [
        '', // Empty token
        'short', // Too short
        'invalid-format-token',
        'a'.repeat(100), // Too long
        'token with spaces',
        'token/with/slashes',
        '<script>alert("xss")</script>' // XSS attempt
      ];

      for (const invalidToken of invalidTokens) {
        const response = await request(app)
          .get('/api/zerodha/auth/callback')
          .query({
            request_token: invalidToken,
            state: state,
            action: 'login',
            status: 'success'
          })
          .expect(400);

        expect(response.body.success).toBe(false);
      }
    });

    it('should handle OAuth error responses securely', async () => {
      const loginResponse = await request(app)
        .post('/api/zerodha/auth/login')
        .send({ user_id: testUserId })
        .expect(200);

      const { state } = loginResponse.body.data;

      // Test error status from Zerodha
      const response = await request(app)
        .get('/api/zerodha/auth/callback')
        .query({
          state: state,
          action: 'login',
          status: 'error',
          error: 'access_denied'
        })
        .expect(400);

      expect(response.body).toMatchObject({
        success: false,
        error: {
          code: 'OAUTH_ERROR',
          message: expect.stringContaining('access_denied')
        }
      });

      // Should not expose internal error details
      expect(response.body.error.message).not.toContain('database');
      expect(response.body.error.message).not.toContain('redis');
    });
  });

  describe('Session Security', () => {
    it('should implement secure session management', async () => {
      const { access_token } = await zerodhaClient.authenticateTestUser(testUserId);

      // Test session isolation - create another user
      const anotherUserId = await testDataManager.createTestUser();
      const { access_token: anotherToken } = await zerodhaClient.authenticateTestUser(anotherUserId);

      // Each user should only access their own data
      const user1Response = await request(app)
        .get('/api/zerodha/auth/profile')
        .set('Authorization', `Bearer ${access_token}`)
        .expect(200);

      const user2Response = await request(app)
        .get('/api/zerodha/auth/profile')
        .set('Authorization', `Bearer ${anotherToken}`)
        .expect(200);

      expect(user1Response.body.data.user_id).not.toBe(user2Response.body.data.user_id);

      await testDataManager.cleanupTestUser(anotherUserId);
    });

    it('should prevent session fixation attacks', async () => {
      // Attempt to use a pre-generated session ID
      const fixedSessionId = 'fixed_session_id_123';
      
      const response = await request(app)
        .post('/api/zerodha/auth/login')
        .set('Cookie', `session_id=${fixedSessionId}`)
        .send({ user_id: testUserId })
        .expect(200);

      // Should generate new session, not use the fixed one
      const setCookieHeader = response.headers['set-cookie'];
      if (setCookieHeader) {
        expect(setCookieHeader[0]).not.toContain(fixedSessionId);
      }
    });

    it('should implement proper session timeout', async () => {
      // This test would require modifying session timeout for testing
      // In a real implementation, you'd set a very short timeout
      const { access_token } = await zerodhaClient.authenticateTestUser(testUserId);

      // Verify token works initially
      await request(app)
        .get('/api/zerodha/auth/profile')
        .set('Authorization', `Bearer ${access_token}`)
        .expect(200);

      // In a real test, you'd wait for timeout or manipulate system time
      // For now, we'll test the timeout validation logic exists
      const expiredToken = jwt.sign(
        { 
          user_id: testUserId, 
          exp: Math.floor(Date.now() / 1000) - 1 // Expired 1 second ago
        },
        process.env.JWT_SECRET || 'test_jwt_secret'
      );

      await request(app)
        .get('/api/zerodha/auth/profile')
        .set('Authorization', `Bearer ${expiredToken}`)
        .expect(401);
    });
  });

  describe('Rate Limiting Security', () => {
    it('should implement authentication rate limiting', async () => {
      const maxAttempts = 5;
      const responses = [];

      // Make multiple rapid authentication attempts
      for (let i = 0; i < maxAttempts + 2; i++) {
        const response = await request(app)
          .post('/api/zerodha/auth/login')
          .send({ user_id: testUserId });
        
        responses.push(response);
      }

      // First few should succeed, later ones should be rate limited
      const successfulResponses = responses.filter(r => r.status === 200);
      const rateLimitedResponses = responses.filter(r => r.status === 429);

      expect(successfulResponses.length).toBeLessThanOrEqual(maxAttempts);
      expect(rateLimitedResponses.length).toBeGreaterThan(0);

      // Rate limited responses should have proper headers
      rateLimitedResponses.forEach(response => {
        expect(response.headers).toHaveProperty('x-ratelimit-limit');
        expect(response.headers).toHaveProperty('x-ratelimit-remaining');
        expect(response.headers).toHaveProperty('x-ratelimit-reset');
      });
    });

    it('should implement per-user rate limiting', async () => {
      const user1Id = testUserId;
      const user2Id = await testDataManager.createTestUser();

      // Exhaust rate limit for user1
      for (let i = 0; i < 6; i++) {
        await request(app)
          .post('/api/zerodha/auth/login')
          .send({ user_id: user1Id });
      }

      // User1 should be rate limited
      const user1Response = await request(app)
        .post('/api/zerodha/auth/login')
        .send({ user_id: user1Id })
        .expect(429);

      // User2 should still work
      const user2Response = await request(app)
        .post('/api/zerodha/auth/login')
        .send({ user_id: user2Id })
        .expect(200);

      expect(user1Response.body.error.code).toBe('RATE_LIMIT_EXCEEDED');
      expect(user2Response.body.success).toBe(true);

      await testDataManager.cleanupTestUser(user2Id);
    });
  });

  describe('Input Validation Security', () => {
    it('should prevent SQL injection in authentication', async () => {
      const sqlInjectionAttempts = [
        "'; DROP TABLE users; --",
        "' OR '1'='1",
        "admin'--",
        "' UNION SELECT * FROM users --",
        "'; INSERT INTO users (email) VALUES ('hacker@evil.com'); --"
      ];

      for (const maliciousInput of sqlInjectionAttempts) {
        const response = await request(app)
          .post('/api/zerodha/auth/login')
          .send({ user_id: maliciousInput })
          .expect(400);

        expect(response.body.success).toBe(false);
        // Should not expose database errors
        expect(response.body.error.message).not.toContain('SQL');
        expect(response.body.error.message).not.toContain('database');
      }
    });

    it('should prevent XSS in authentication responses', async () => {
      const xssAttempts = [
        '<script>alert("xss")</script>',
        'javascript:alert("xss")',
        '<img src="x" onerror="alert(1)">',
        '"><script>alert("xss")</script>',
        "'; alert('xss'); //"
      ];

      for (const xssInput of xssAttempts) {
        const response = await request(app)
          .post('/api/zerodha/auth/login')
          .send({ user_id: xssInput });

        // Response should not contain unescaped script tags
        const responseText = JSON.stringify(response.body);
        expect(responseText).not.toContain('<script>');
        expect(responseText).not.toContain('javascript:');
        expect(responseText).not.toContain('onerror=');
      }
    });

    it('should validate input lengths and formats', async () => {
      const invalidInputs = [
        { user_id: '' }, // Empty
        { user_id: 'a'.repeat(1000) }, // Too long
        { user_id: null }, // Null
        { user_id: undefined }, // Undefined
        { user_id: 123 }, // Wrong type
        { user_id: {} }, // Object
        { user_id: [] }, // Array
      ];

      for (const invalidInput of invalidInputs) {
        const response = await request(app)
          .post('/api/zerodha/auth/login')
          .send(invalidInput)
          .expect(400);

        expect(response.body).toMatchObject({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: expect.any(String)
          }
        });
      }
    });
  });

  describe('Error Handling Security', () => {
    it('should not expose sensitive information in error messages', async () => {
      // Test various error conditions
      const errorTests = [
        {
          endpoint: '/api/zerodha/auth/profile',
          method: 'get',
          headers: { Authorization: 'Bearer invalid_token' },
          expectedStatus: 401
        },
        {
          endpoint: '/api/zerodha/auth/callback',
          method: 'get',
          query: { request_token: 'invalid', state: 'invalid' },
          expectedStatus: 400
        }
      ];

      for (const test of errorTests) {
        const response = await request(app)
          [test.method](test.endpoint)
          .set(test.headers || {})
          .query(test.query || {})
          .expect(test.expectedStatus);

        // Should not expose sensitive information
        const responseText = JSON.stringify(response.body);
        expect(responseText).not.toContain('password');
        expect(responseText).not.toContain('secret');
        expect(responseText).not.toContain('key');
        expect(responseText).not.toContain('database');
        expect(responseText).not.toContain('redis');
        expect(responseText).not.toContain('stack trace');
        expect(responseText).not.toContain('file path');
      }
    });

    it('should implement proper error logging without exposing logs', async () => {
      // Attempt to access non-existent endpoint
      const response = await request(app)
        .get('/api/zerodha/auth/nonexistent')
        .expect(404);

      // Should return generic error message
      expect(response.body).toMatchObject({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: expect.any(String)
        }
      });

      // Should not expose internal paths or system information
      expect(response.body.error.message).not.toContain('/');
      expect(response.body.error.message).not.toContain('\\');
      expect(response.body.error.message).not.toContain('node_modules');
    });
  });
});