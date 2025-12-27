import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../../index';
import { DatabaseService } from '../../../user-service/src/services/database';
import { RedisService } from '../../../user-service/src/services/redis';
import { config } from '../../config/config';

describe('Authentication and Authorization Functional Tests', () => {
  let testUserId: string;
  let adminUserId: string;
  let userToken: string;
  let adminToken: string;
  let refreshToken: string;

  beforeAll(async () => {
    // Initialize services
    await DatabaseService.initialize();
    await RedisService.initialize();

    // Create test users with different roles
    const userResponse = await request(app)
      .post('/api/auth/register')
      .send({
        email: 'user@example.com',
        password: 'UserPassword123',
        firstName: 'Test',
        lastName: 'User'
      });

    testUserId = userResponse.body.user.id;
    userToken = userResponse.body.accessToken;

    const adminResponse = await request(app)
      .post('/api/auth/register')
      .send({
        email: 'admin@example.com',
        password: 'AdminPassword123',
        firstName: 'Admin',
        lastName: 'User'
      });

    adminUserId = adminResponse.body.user.id;
    
    // Update admin user role in database
    await DatabaseService.query(
      'UPDATE users SET role = $1 WHERE id = $2',
      ['admin', adminUserId]
    );

    // Get admin token
    const adminLoginResponse = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'admin@example.com',
        password: 'AdminPassword123'
      });

    adminToken = adminLoginResponse.body.accessToken;
    refreshToken = adminLoginResponse.body.refreshToken;
  });

  afterAll(async () => {
    // Clean up test data
    await DatabaseService.query('DELETE FROM users WHERE email IN ($1, $2)', 
      ['user@example.com', 'admin@example.com']);
    await DatabaseService.close();
    await RedisService.close();
  });

  describe('JWT Token Validation', () => {
    it('should accept valid JWT tokens', async () => {
      const response = await request(app)
        .get('/api/portfolio')
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).not.toBe(401);
    });

    it('should reject invalid JWT tokens', async () => {
      const response = await request(app)
        .get('/api/portfolio')
        .set('Authorization', 'Bearer invalid-token');

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('INVALID_TOKEN');
    });

    it('should reject expired JWT tokens', async () => {
      // Create an expired token
      const expiredToken = jwt.sign(
        { userId: testUserId, email: 'user@example.com' },
        config.jwt.secret,
        { expiresIn: '-1h' } // Expired 1 hour ago
      );

      const response = await request(app)
        .get('/api/portfolio')
        .set('Authorization', `Bearer ${expiredToken}`);

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('TOKEN_EXPIRED');
    });

    it('should reject tokens with invalid signature', async () => {
      const invalidToken = jwt.sign(
        { userId: testUserId, email: 'user@example.com' },
        'wrong-secret',
        { expiresIn: '1h' }
      );

      const response = await request(app)
        .get('/api/portfolio')
        .set('Authorization', `Bearer ${invalidToken}`);

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('INVALID_TOKEN');
    });

    it('should reject malformed authorization headers', async () => {
      const testCases = [
        'invalid-header',
        'Basic dXNlcjpwYXNz', // Basic auth instead of Bearer
        'Bearer', // Missing token
        '', // Empty header
      ];

      for (const authHeader of testCases) {
        const response = await request(app)
          .get('/api/portfolio')
          .set('Authorization', authHeader);

        expect(response.status).toBe(401);
      }
    });
  });

  describe('Role-Based Access Control', () => {
    it('should allow admin access to admin endpoints', async () => {
      const response = await request(app)
        .get('/api/admin/users')
        .set('Authorization', `Bearer ${adminToken}`);

      // Should not be 403 (forbidden) - might be 404 if endpoint doesn't exist
      expect(response.status).not.toBe(403);
    });

    it('should deny regular user access to admin endpoints', async () => {
      const response = await request(app)
        .get('/api/admin/users')
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('INSUFFICIENT_PERMISSIONS');
    });

    it('should allow users to access their own resources', async () => {
      const response = await request(app)
        .get('/api/portfolio')
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).not.toBe(403);
    });

    it('should prevent users from accessing other users\' resources', async () => {
      // Create another user's strategy
      const otherUserResponse = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'other@example.com',
          password: 'OtherPassword123',
          firstName: 'Other',
          lastName: 'User'
        });

      const otherToken = otherUserResponse.body.accessToken;

      const strategyResponse = await request(app)
        .post('/api/strategies')
        .set('Authorization', `Bearer ${otherToken}`)
        .send({
          name: 'Other User Strategy',
          description: 'Strategy belonging to other user',
          nodes: [],
          connections: [],
          parameters: { timeframe: '1h' }
        });

      const strategyId = strategyResponse.body.id;

      // Try to access other user's strategy
      const accessResponse = await request(app)
        .get(`/api/strategies/${strategyId}`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(accessResponse.status).toBe(403);
      expect(accessResponse.body.error.code).toBe('ACCESS_DENIED');

      // Clean up
      await DatabaseService.query('DELETE FROM users WHERE email = $1', ['other@example.com']);
    });
  });

  describe('Permission-Based Access Control', () => {
    it('should check specific permissions for actions', async () => {
      // Test trading permission
      const tradeResponse = await request(app)
        .post('/api/portfolio/manual-trade')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          symbol: 'AAPL',
          side: 'buy',
          quantity: 10,
          type: 'market'
        });

      // Should succeed if user has trading permission
      expect(tradeResponse.status).not.toBe(403);
    });

    it('should deny actions without required permissions', async () => {
      // Create a user without trading permissions
      const limitedUserResponse = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'limited@example.com',
          password: 'LimitedPassword123',
          firstName: 'Limited',
          lastName: 'User'
        });

      // Update user to have limited permissions
      await DatabaseService.query(
        'UPDATE users SET permissions = $1 WHERE id = $2',
        [JSON.stringify(['read']), limitedUserResponse.body.user.id]
      );

      const limitedToken = limitedUserResponse.body.accessToken;

      const tradeResponse = await request(app)
        .post('/api/portfolio/manual-trade')
        .set('Authorization', `Bearer ${limitedToken}`)
        .send({
          symbol: 'AAPL',
          side: 'buy',
          quantity: 10,
          type: 'market'
        });

      expect(tradeResponse.status).toBe(403);
      expect(tradeResponse.body.error.code).toBe('INSUFFICIENT_PERMISSIONS');

      // Clean up
      await DatabaseService.query('DELETE FROM users WHERE email = $1', ['limited@example.com']);
    });
  });

  describe('Session Management', () => {
    it('should track active sessions in Redis', async () => {
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'user@example.com',
          password: 'UserPassword123'
        });

      const token = loginResponse.body.accessToken;
      const decoded = jwt.decode(token) as any;

      // Check if session exists in Redis
      const redisClient = RedisService.getClient();
      const sessionKey = `session:${decoded.userId}:${decoded.jti || 'default'}`;
      const sessionExists = await redisClient.exists(sessionKey);

      expect(sessionExists).toBe(1);
    });

    it('should invalidate sessions on logout', async () => {
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'user@example.com',
          password: 'UserPassword123'
        });

      const token = loginResponse.body.accessToken;

      // Logout
      const logoutResponse = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${token}`);

      expect(logoutResponse.status).toBe(200);

      // Try to use the token after logout
      const protectedResponse = await request(app)
        .get('/api/portfolio')
        .set('Authorization', `Bearer ${token}`);

      expect(protectedResponse.status).toBe(401);
      expect(protectedResponse.body.error.code).toBe('TOKEN_INVALIDATED');
    });

    it('should handle multiple concurrent sessions', async () => {
      const sessions = [];

      // Create multiple sessions for the same user
      for (let i = 0; i < 3; i++) {
        const response = await request(app)
          .post('/api/auth/login')
          .send({
            email: 'user@example.com',
            password: 'UserPassword123'
          });

        sessions.push(response.body.accessToken);
      }

      // All sessions should be valid
      for (const token of sessions) {
        const response = await request(app)
          .get('/api/portfolio')
          .set('Authorization', `Bearer ${token}`);

        expect(response.status).not.toBe(401);
      }

      // Logout from one session
      await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${sessions[0]}`);

      // First session should be invalid
      const invalidResponse = await request(app)
        .get('/api/portfolio')
        .set('Authorization', `Bearer ${sessions[0]}`);

      expect(invalidResponse.status).toBe(401);

      // Other sessions should still be valid
      const validResponse = await request(app)
        .get('/api/portfolio')
        .set('Authorization', `Bearer ${sessions[1]}`);

      expect(validResponse.status).not.toBe(401);
    });

    it('should expire sessions after inactivity', async () => {
      // This test would require manipulating time or waiting
      // For now, we'll test the TTL is set correctly
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'user@example.com',
          password: 'UserPassword123'
        });

      const token = loginResponse.body.accessToken;
      const decoded = jwt.decode(token) as any;

      const redisClient = RedisService.getClient();
      const sessionKey = `session:${decoded.userId}:${decoded.jti || 'default'}`;
      const ttl = await redisClient.ttl(sessionKey);

      // Should have a reasonable TTL (not -1 which means no expiration)
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(24 * 60 * 60); // Max 24 hours
    });
  });

  describe('Token Refresh Mechanism', () => {
    it('should refresh tokens with valid refresh token', async () => {
      const response = await request(app)
        .post('/api/auth/refresh')
        .send({
          refreshToken
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('accessToken');
      expect(response.body).toHaveProperty('refreshToken');
      
      // New tokens should be different from old ones
      expect(response.body.accessToken).not.toBe(adminToken);
      expect(response.body.refreshToken).not.toBe(refreshToken);
    });

    it('should reject invalid refresh tokens', async () => {
      const response = await request(app)
        .post('/api/auth/refresh')
        .send({
          refreshToken: 'invalid-refresh-token'
        });

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('INVALID_REFRESH_TOKEN');
    });

    it('should reject expired refresh tokens', async () => {
      // Create an expired refresh token
      const expiredRefreshToken = jwt.sign(
        { userId: testUserId, type: 'refresh' },
        config.jwt.refreshSecret,
        { expiresIn: '-1d' }
      );

      const response = await request(app)
        .post('/api/auth/refresh')
        .send({
          refreshToken: expiredRefreshToken
        });

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('REFRESH_TOKEN_EXPIRED');
    });

    it('should invalidate old refresh token after use', async () => {
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'user@example.com',
          password: 'UserPassword123'
        });

      const oldRefreshToken = loginResponse.body.refreshToken;

      // Use refresh token
      const refreshResponse = await request(app)
        .post('/api/auth/refresh')
        .send({
          refreshToken: oldRefreshToken
        });

      expect(refreshResponse.status).toBe(200);

      // Try to use old refresh token again
      const secondRefreshResponse = await request(app)
        .post('/api/auth/refresh')
        .send({
          refreshToken: oldRefreshToken
        });

      expect(secondRefreshResponse.status).toBe(401);
      expect(secondRefreshResponse.body.error.code).toBe('REFRESH_TOKEN_USED');
    });
  });

  describe('Security Headers and CORS', () => {
    it('should include security headers in responses', async () => {
      const response = await request(app)
        .get('/health');

      expect(response.headers).toHaveProperty('x-content-type-options');
      expect(response.headers).toHaveProperty('x-frame-options');
      expect(response.headers).toHaveProperty('x-xss-protection');
    });

    it('should handle CORS preflight requests', async () => {
      const response = await request(app)
        .options('/api/auth/login')
        .set('Origin', 'http://localhost:3000')
        .set('Access-Control-Request-Method', 'POST')
        .set('Access-Control-Request-Headers', 'Content-Type,Authorization');

      expect(response.status).toBe(200);
      expect(response.headers['access-control-allow-origin']).toBeDefined();
      expect(response.headers['access-control-allow-methods']).toBeDefined();
      expect(response.headers['access-control-allow-headers']).toBeDefined();
    });

    it('should reject requests from unauthorized origins', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .set('Origin', 'http://malicious-site.com')
        .send({
          email: 'user@example.com',
          password: 'UserPassword123'
        });

      // Should either reject or not include CORS headers
      if (response.status === 200) {
        expect(response.headers['access-control-allow-origin']).not.toBe('http://malicious-site.com');
      }
    });
  });

  describe('Rate Limiting and Brute Force Protection', () => {
    it('should rate limit login attempts', async () => {
      const attempts = [];
      
      // Make multiple rapid login attempts
      for (let i = 0; i < 10; i++) {
        attempts.push(
          request(app)
            .post('/api/auth/login')
            .send({
              email: 'user@example.com',
              password: 'WrongPassword'
            })
        );
      }

      const responses = await Promise.all(attempts);
      
      // Some requests should be rate limited
      const rateLimitedResponses = responses.filter(res => res.status === 429);
      expect(rateLimitedResponses.length).toBeGreaterThan(0);
    });

    it('should implement account lockout after failed attempts', async () => {
      // Create a test user for lockout testing
      const lockoutUserResponse = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'lockout@example.com',
          password: 'LockoutPassword123',
          firstName: 'Lockout',
          lastName: 'User'
        });

      // Make multiple failed login attempts
      for (let i = 0; i < 5; i++) {
        await request(app)
          .post('/api/auth/login')
          .send({
            email: 'lockout@example.com',
            password: 'WrongPassword'
          });
      }

      // Account should be locked
      const lockedResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'lockout@example.com',
          password: 'LockoutPassword123' // Correct password
        });

      expect(lockedResponse.status).toBe(423);
      expect(lockedResponse.body.error.code).toBe('ACCOUNT_LOCKED');

      // Clean up
      await DatabaseService.query('DELETE FROM users WHERE email = $1', ['lockout@example.com']);
    });

    it('should reset failed attempts after successful login', async () => {
      // Make a few failed attempts
      for (let i = 0; i < 2; i++) {
        await request(app)
          .post('/api/auth/login')
          .send({
            email: 'user@example.com',
            password: 'WrongPassword'
          });
      }

      // Successful login should reset counter
      const successResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'user@example.com',
          password: 'UserPassword123'
        });

      expect(successResponse.status).toBe(200);

      // Should be able to make more attempts without immediate lockout
      const nextAttemptResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'user@example.com',
          password: 'WrongPassword'
        });

      expect(nextAttemptResponse.status).toBe(401); // Wrong password, not locked
    });
  });

  describe('Password Security', () => {
    it('should enforce password complexity requirements', async () => {
      const weakPasswords = [
        'password', // Too simple
        '12345678', // Only numbers
        'abcdefgh', // Only lowercase
        'ABCDEFGH', // Only uppercase
        'Pass123',  // Too short
      ];

      for (const password of weakPasswords) {
        const response = await request(app)
          .post('/api/auth/register')
          .send({
            email: `weak${Math.random()}@example.com`,
            password,
            firstName: 'Test',
            lastName: 'User'
          });

        expect(response.status).toBe(400);
        expect(response.body.error.message).toContain('password');
      }
    });

    it('should hash passwords securely', async () => {
      // Check that password is not stored in plain text
      const userResult = await DatabaseService.query(
        'SELECT password_hash FROM users WHERE email = $1',
        ['user@example.com']
      );

      const storedHash = userResult.rows[0].password_hash;
      
      // Should not be the plain password
      expect(storedHash).not.toBe('UserPassword123');
      
      // Should look like a bcrypt hash
      expect(storedHash).toMatch(/^\$2[aby]\$\d+\$/);
    });

    it('should require current password for password changes', async () => {
      const response = await request(app)
        .put('/api/users/change-password')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          newPassword: 'NewPassword123'
          // Missing currentPassword
        });

      expect(response.status).toBe(400);
      expect(response.body.error.message).toContain('current password');
    });
  });

  describe('Multi-Factor Authentication', () => {
    it('should support MFA setup', async () => {
      const response = await request(app)
        .post('/api/auth/mfa/setup')
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('qrCode');
      expect(response.body).toHaveProperty('secret');
    });

    it('should require MFA token when enabled', async () => {
      // Enable MFA for user
      await DatabaseService.query(
        'UPDATE users SET mfa_enabled = true, mfa_secret = $1 WHERE id = $2',
        ['test-mfa-secret', testUserId]
      );

      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'user@example.com',
          password: 'UserPassword123'
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('mfaRequired');
      expect(response.body.mfaRequired).toBe(true);
      expect(response.body).toHaveProperty('mfaToken');

      // Disable MFA for cleanup
      await DatabaseService.query(
        'UPDATE users SET mfa_enabled = false, mfa_secret = NULL WHERE id = $1',
        [testUserId]
      );
    });
  });
});