import request from 'supertest';
import { app } from '../../index';
import { DatabaseService } from '../../services/database';
import { RedisService } from '../../services/redis';

describe('User Service Integration Tests', () => {
  beforeAll(async () => {
    await DatabaseService.initialize();
    await RedisService.initialize();
  });

  afterAll(async () => {
    await DatabaseService.close();
    await RedisService.close();
  });

  beforeEach(async () => {
    // Clean up test data
    await DatabaseService.query('DELETE FROM users WHERE email LIKE $1', ['%integration-test%']);
  });

  describe('User Service Database Integration', () => {
    it('should handle user creation with database transactions', async () => {
      const userData = {
        email: 'user-integration-test@example.com',
        password: 'TestPassword123',
        firstName: 'User',
        lastName: 'Integration'
      };

      const response = await request(app)
        .post('/api/auth/register')
        .send(userData);

      expect(response.status).toBe(201);

      // Verify user exists in database
      const dbResult = await DatabaseService.query(
        'SELECT * FROM users WHERE email = $1',
        [userData.email]
      );

      expect(dbResult.rows).toHaveLength(1);
      expect(dbResult.rows[0].email).toBe(userData.email);
      expect(dbResult.rows[0].first_name).toBe(userData.firstName);
      expect(dbResult.rows[0].last_name).toBe(userData.lastName);
    });

    it('should handle user authentication with Redis session storage', async () => {
      // Create user first
      const userData = {
        email: 'auth-integration-test@example.com',
        password: 'TestPassword123',
        firstName: 'Auth',
        lastName: 'Integration'
      };

      await request(app)
        .post('/api/auth/register')
        .send(userData);

      // Login user
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: userData.email,
          password: userData.password
        });

      expect(loginResponse.status).toBe(200);
      const { accessToken, refreshToken } = loginResponse.body;

      // Verify session stored in Redis
      const sessionKey = `session:${loginResponse.body.user.id}`;
      const sessionData = await RedisService.get(sessionKey);
      expect(sessionData).toBeTruthy();

      // Verify token validation works
      const profileResponse = await request(app)
        .get('/api/users/profile')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(profileResponse.status).toBe(200);
      expect(profileResponse.body.email).toBe(userData.email);
    });

    it('should handle concurrent user operations', async () => {
      const users = [
        { email: 'concurrent1-integration-test@example.com', firstName: 'Concurrent1' },
        { email: 'concurrent2-integration-test@example.com', firstName: 'Concurrent2' },
        { email: 'concurrent3-integration-test@example.com', firstName: 'Concurrent3' }
      ];

      // Create users concurrently
      const createPromises = users.map(user =>
        request(app)
          .post('/api/auth/register')
          .send({
            ...user,
            password: 'TestPassword123',
            lastName: 'Test'
          })
      );

      const responses = await Promise.all(createPromises);

      // All should succeed
      responses.forEach(response => {
        expect(response.status).toBe(201);
      });

      // Verify all users exist in database
      const dbResult = await DatabaseService.query(
        'SELECT * FROM users WHERE email LIKE $1',
        ['%concurrent%-integration-test%']
      );

      expect(dbResult.rows).toHaveLength(3);
    });

    it('should handle user profile updates with data consistency', async () => {
      // Create user
      const registerResponse = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'profile-integration-test@example.com',
          password: 'TestPassword123',
          firstName: 'Profile',
          lastName: 'Integration'
        });

      const { accessToken, user } = registerResponse.body;

      // Update profile
      const updateData = {
        firstName: 'UpdatedProfile',
        lastName: 'UpdatedIntegration',
        phone: '+1234567890',
        timezone: 'EST'
      };

      const updateResponse = await request(app)
        .put('/api/users/profile')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(updateData);

      expect(updateResponse.status).toBe(200);

      // Verify database consistency
      const dbResult = await DatabaseService.query(
        'SELECT * FROM users WHERE id = $1',
        [user.id]
      );

      expect(dbResult.rows[0].first_name).toBe(updateData.firstName);
      expect(dbResult.rows[0].last_name).toBe(updateData.lastName);
      expect(dbResult.rows[0].phone).toBe(updateData.phone);
      expect(dbResult.rows[0].timezone).toBe(updateData.timezone);

      // Verify cache invalidation
      const profileResponse = await request(app)
        .get('/api/users/profile')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(profileResponse.body.firstName).toBe(updateData.firstName);
    });

    it('should handle password changes with security measures', async () => {
      // Create user
      const registerResponse = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'password-integration-test@example.com',
          password: 'TestPassword123',
          firstName: 'Password',
          lastName: 'Integration'
        });

      const { accessToken, user } = registerResponse.body;

      // Change password
      const changeResponse = await request(app)
        .put('/api/users/change-password')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          currentPassword: 'TestPassword123',
          newPassword: 'NewPassword456'
        });

      expect(changeResponse.status).toBe(200);

      // Verify old password no longer works
      const oldPasswordResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'password-integration-test@example.com',
          password: 'TestPassword123'
        });

      expect(oldPasswordResponse.status).toBe(401);

      // Verify new password works
      const newPasswordResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'password-integration-test@example.com',
          password: 'NewPassword456'
        });

      expect(newPasswordResponse.status).toBe(200);

      // Verify all existing sessions are invalidated
      const profileResponse = await request(app)
        .get('/api/users/profile')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(profileResponse.status).toBe(401);
    });
  });

  describe('User Service Redis Integration', () => {
    it('should handle session management with Redis', async () => {
      // Create and login user
      const registerResponse = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'redis-integration-test@example.com',
          password: 'TestPassword123',
          firstName: 'Redis',
          lastName: 'Integration'
        });

      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'redis-integration-test@example.com',
          password: 'TestPassword123'
        });

      const { accessToken, refreshToken, user } = loginResponse.body;

      // Verify session data in Redis
      const sessionKey = `session:${user.id}`;
      const sessionData = await RedisService.get(sessionKey);
      expect(sessionData).toBeTruthy();

      const parsedSession = JSON.parse(sessionData);
      expect(parsedSession).toHaveProperty('userId');
      expect(parsedSession.userId).toBe(user.id);

      // Test session refresh
      const refreshResponse = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken });

      expect(refreshResponse.status).toBe(200);

      // Verify old refresh token is invalidated
      const oldRefreshResponse = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken });

      expect(oldRefreshResponse.status).toBe(401);
    });

    it('should handle user settings caching', async () => {
      // Create user
      const registerResponse = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'settings-integration-test@example.com',
          password: 'TestPassword123',
          firstName: 'Settings',
          lastName: 'Integration'
        });

      const { accessToken, user } = registerResponse.body;

      // Set user setting
      const settingResponse = await request(app)
        .put('/api/users/settings/theme')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ value: 'dark' });

      expect(settingResponse.status).toBe(200);

      // Verify setting is cached in Redis
      const cacheKey = `user_settings:${user.id}`;
      const cachedSettings = await RedisService.get(cacheKey);
      expect(cachedSettings).toBeTruthy();

      const parsedSettings = JSON.parse(cachedSettings);
      expect(parsedSettings.theme).toBe('dark');

      // Get setting (should use cache)
      const getResponse = await request(app)
        .get('/api/users/settings/theme')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(getResponse.status).toBe(200);
      expect(getResponse.body.settingValue).toBe('dark');
    });

    it('should handle Redis failover scenarios', async () => {
      // Create user
      const registerResponse = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'failover-integration-test@example.com',
          password: 'TestPassword123',
          firstName: 'Failover',
          lastName: 'Integration'
        });

      const { accessToken } = registerResponse.body;

      // Temporarily disconnect Redis
      await RedisService.disconnect();

      // Operations should still work (fallback to database)
      const profileResponse = await request(app)
        .get('/api/users/profile')
        .set('Authorization', `Bearer ${accessToken}`);

      // Should either work with database fallback or return appropriate error
      expect([200, 503]).toContain(profileResponse.status);

      // Reconnect Redis
      await RedisService.initialize();

      // Operations should work normally again
      const profileResponse2 = await request(app)
        .get('/api/users/profile')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(profileResponse2.status).toBe(200);
    });
  });

  describe('User Service Error Handling Integration', () => {
    it('should handle database connection errors', async () => {
      // Temporarily close database connection
      await DatabaseService.close();

      const response = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'db-error-integration-test@example.com',
          password: 'TestPassword123',
          firstName: 'DbError',
          lastName: 'Integration'
        });

      expect(response.status).toBe(500);
      expect(response.body.error.code).toBe('DATABASE_ERROR');

      // Restore connection
      await DatabaseService.initialize();
    });

    it('should handle validation errors consistently', async () => {
      const invalidRequests = [
        { email: 'invalid-email', password: 'TestPassword123', firstName: 'Test', lastName: 'User' },
        { email: 'test@example.com', password: 'weak', firstName: 'Test', lastName: 'User' },
        { email: 'test@example.com', password: 'TestPassword123', lastName: 'User' }, // Missing firstName
      ];

      for (const invalidRequest of invalidRequests) {
        const response = await request(app)
          .post('/api/auth/register')
          .send(invalidRequest);

        expect(response.status).toBe(400);
        expect(response.body.error).toHaveProperty('code');
        expect(response.body.error).toHaveProperty('message');
      }
    });

    it('should handle rate limiting integration', async () => {
      const email = 'rate-limit-integration-test@example.com';

      // Make multiple rapid requests
      const requests = [];
      for (let i = 0; i < 20; i++) {
        requests.push(
          request(app)
            .post('/api/auth/login')
            .send({
              email,
              password: 'WrongPassword'
            })
        );
      }

      const responses = await Promise.all(requests);

      // Some should be rate limited
      const rateLimitedResponses = responses.filter(r => r.status === 429);
      expect(rateLimitedResponses.length).toBeGreaterThan(0);

      // Rate limited responses should have proper headers
      rateLimitedResponses.forEach(response => {
        expect(response.headers).toHaveProperty('retry-after');
      });
    });
  });

  describe('User Service Performance Integration', () => {
    it('should handle bulk user operations efficiently', async () => {
      const startTime = Date.now();
      const userCount = 50;
      const users = [];

      // Create multiple users
      for (let i = 0; i < userCount; i++) {
        users.push({
          email: `bulk-user-${i}-integration-test@example.com`,
          password: 'TestPassword123',
          firstName: `User${i}`,
          lastName: 'Bulk'
        });
      }

      const createPromises = users.map(user =>
        request(app)
          .post('/api/auth/register')
          .send(user)
      );

      const responses = await Promise.all(createPromises);
      const endTime = Date.now();

      // All should succeed
      responses.forEach(response => {
        expect(response.status).toBe(201);
      });

      // Should complete within reasonable time (adjust threshold as needed)
      const duration = endTime - startTime;
      expect(duration).toBeLessThan(30000); // 30 seconds

      // Verify all users exist
      const dbResult = await DatabaseService.query(
        'SELECT COUNT(*) as count FROM users WHERE email LIKE $1',
        ['%bulk-user-%integration-test%']
      );

      expect(parseInt(dbResult.rows[0].count)).toBe(userCount);
    });

    it('should handle concurrent authentication efficiently', async () => {
      // Create test user first
      await request(app)
        .post('/api/auth/register')
        .send({
          email: 'concurrent-auth-integration-test@example.com',
          password: 'TestPassword123',
          firstName: 'Concurrent',
          lastName: 'Auth'
        });

      const startTime = Date.now();
      const concurrentLogins = 20;

      // Perform concurrent logins
      const loginPromises = [];
      for (let i = 0; i < concurrentLogins; i++) {
        loginPromises.push(
          request(app)
            .post('/api/auth/login')
            .send({
              email: 'concurrent-auth-integration-test@example.com',
              password: 'TestPassword123'
            })
        );
      }

      const responses = await Promise.all(loginPromises);
      const endTime = Date.now();

      // All should succeed
      responses.forEach(response => {
        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('accessToken');
      });

      // Should complete within reasonable time
      const duration = endTime - startTime;
      expect(duration).toBeLessThan(10000); // 10 seconds
    });
  });
});