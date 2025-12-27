import request from 'supertest';
import { app } from '../../index';
import { DatabaseService } from '../../services/database';
import { RedisService } from '../../services/redis';
import bcrypt from 'bcrypt';

describe('User Service Functional Tests', () => {
  beforeAll(async () => {
    await DatabaseService.initialize();
    await RedisService.initialize();
  });

  afterAll(async () => {
    await DatabaseService.close();
    await RedisService.close();
  });

  beforeEach(async () => {
    // Clean up test data before each test
    await DatabaseService.query('DELETE FROM users WHERE email LIKE $1', ['%test%']);
  });

  describe('User Registration', () => {
    it('should register a new user successfully', async () => {
      const userData = {
        email: 'test@example.com',
        password: 'TestPassword123',
        firstName: 'Test',
        lastName: 'User'
      };

      const response = await request(app)
        .post('/api/auth/register')
        .send(userData);

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('user');
      expect(response.body).toHaveProperty('accessToken');
      expect(response.body).toHaveProperty('refreshToken');
      expect(response.body.user.email).toBe(userData.email);
      expect(response.body.user.firstName).toBe(userData.firstName);
      expect(response.body.user.lastName).toBe(userData.lastName);
      expect(response.body.user).not.toHaveProperty('password');
    });

    it('should hash password correctly during registration', async () => {
      const userData = {
        email: 'test@example.com',
        password: 'TestPassword123',
        firstName: 'Test',
        lastName: 'User'
      };

      await request(app)
        .post('/api/auth/register')
        .send(userData);

      // Check password is hashed in database
      const result = await DatabaseService.query(
        'SELECT password_hash FROM users WHERE email = $1',
        [userData.email]
      );

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].password_hash).not.toBe(userData.password);
      
      // Verify hash is valid
      const isValid = await bcrypt.compare(userData.password, result.rows[0].password_hash);
      expect(isValid).toBe(true);
    });

    it('should reject duplicate email registration', async () => {
      const userData = {
        email: 'duplicate@example.com',
        password: 'TestPassword123',
        firstName: 'Test',
        lastName: 'User'
      };

      // First registration
      await request(app)
        .post('/api/auth/register')
        .send(userData);

      // Second registration with same email
      const response = await request(app)
        .post('/api/auth/register')
        .send(userData);

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('EMAIL_ALREADY_EXISTS');
    });

    it('should validate required fields', async () => {
      const testCases = [
        { email: 'test@example.com', password: 'TestPassword123', firstName: 'Test' }, // Missing lastName
        { email: 'test@example.com', password: 'TestPassword123', lastName: 'User' }, // Missing firstName
        { email: 'test@example.com', firstName: 'Test', lastName: 'User' }, // Missing password
        { password: 'TestPassword123', firstName: 'Test', lastName: 'User' }, // Missing email
      ];

      for (const testCase of testCases) {
        const response = await request(app)
          .post('/api/auth/register')
          .send(testCase);

        expect(response.status).toBe(400);
        expect(response.body.error).toHaveProperty('message');
      }
    });

    it('should validate email format', async () => {
      const invalidEmails = ['invalid-email', 'test@', '@example.com', 'test.example.com'];

      for (const email of invalidEmails) {
        const response = await request(app)
          .post('/api/auth/register')
          .send({
            email,
            password: 'TestPassword123',
            firstName: 'Test',
            lastName: 'User'
          });

        expect(response.status).toBe(400);
        expect(response.body.error.message).toContain('email');
      }
    });

    it('should validate password strength', async () => {
      const weakPasswords = ['weak', '12345678', 'password', 'Password', 'Password1'];

      for (const password of weakPasswords) {
        const response = await request(app)
          .post('/api/auth/register')
          .send({
            email: 'test@example.com',
            password,
            firstName: 'Test',
            lastName: 'User'
          });

        expect(response.status).toBe(400);
        expect(response.body.error.message).toContain('password');
      }
    });
  });

  describe('User Authentication', () => {
    let testUser: any;

    beforeEach(async () => {
      // Create test user
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'auth-test@example.com',
          password: 'TestPassword123',
          firstName: 'Auth',
          lastName: 'Test'
        });

      testUser = response.body;
    });

    it('should login with valid credentials', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'auth-test@example.com',
          password: 'TestPassword123'
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('user');
      expect(response.body).toHaveProperty('accessToken');
      expect(response.body).toHaveProperty('refreshToken');
      expect(response.body.user.email).toBe('auth-test@example.com');
    });

    it('should reject invalid email', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'nonexistent@example.com',
          password: 'TestPassword123'
        });

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('INVALID_CREDENTIALS');
    });

    it('should reject invalid password', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'auth-test@example.com',
          password: 'WrongPassword'
        });

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('INVALID_CREDENTIALS');
    });

    it('should track failed login attempts', async () => {
      // Make multiple failed attempts
      for (let i = 0; i < 3; i++) {
        await request(app)
          .post('/api/auth/login')
          .send({
            email: 'auth-test@example.com',
            password: 'WrongPassword'
          });
      }

      // Check failed attempts are recorded
      const result = await DatabaseService.query(
        'SELECT failed_login_attempts FROM users WHERE email = $1',
        ['auth-test@example.com']
      );

      expect(result.rows[0].failed_login_attempts).toBe(3);
    });

    it('should reset failed attempts on successful login', async () => {
      // Make failed attempts
      for (let i = 0; i < 2; i++) {
        await request(app)
          .post('/api/auth/login')
          .send({
            email: 'auth-test@example.com',
            password: 'WrongPassword'
          });
      }

      // Successful login
      await request(app)
        .post('/api/auth/login')
        .send({
          email: 'auth-test@example.com',
          password: 'TestPassword123'
        });

      // Check failed attempts are reset
      const result = await DatabaseService.query(
        'SELECT failed_login_attempts FROM users WHERE email = $1',
        ['auth-test@example.com']
      );

      expect(result.rows[0].failed_login_attempts).toBe(0);
    });

    it('should update last login timestamp', async () => {
      const beforeLogin = new Date();

      await request(app)
        .post('/api/auth/login')
        .send({
          email: 'auth-test@example.com',
          password: 'TestPassword123'
        });

      const result = await DatabaseService.query(
        'SELECT last_login_at FROM users WHERE email = $1',
        ['auth-test@example.com']
      );

      const lastLogin = new Date(result.rows[0].last_login_at);
      expect(lastLogin.getTime()).toBeGreaterThanOrEqual(beforeLogin.getTime());
    });
  });

  describe('Token Management', () => {
    let testUser: any;
    let accessToken: string;
    let refreshToken: string;

    beforeEach(async () => {
      const registerResponse = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'token-test@example.com',
          password: 'TestPassword123',
          firstName: 'Token',
          lastName: 'Test'
        });

      testUser = registerResponse.body.user;
      accessToken = registerResponse.body.accessToken;
      refreshToken = registerResponse.body.refreshToken;
    });

    it('should refresh access token with valid refresh token', async () => {
      const response = await request(app)
        .post('/api/auth/refresh')
        .send({
          refreshToken
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('accessToken');
      expect(response.body).toHaveProperty('refreshToken');
      expect(response.body.accessToken).not.toBe(accessToken);
    });

    it('should reject invalid refresh token', async () => {
      const response = await request(app)
        .post('/api/auth/refresh')
        .send({
          refreshToken: 'invalid-token'
        });

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('INVALID_REFRESH_TOKEN');
    });

    it('should invalidate refresh token after use', async () => {
      // Use refresh token
      await request(app)
        .post('/api/auth/refresh')
        .send({
          refreshToken
        });

      // Try to use same refresh token again
      const response = await request(app)
        .post('/api/auth/refresh')
        .send({
          refreshToken
        });

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('REFRESH_TOKEN_USED');
    });

    it('should logout and invalidate tokens', async () => {
      const response = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Logged out successfully');

      // Verify token is invalidated
      const protectedResponse = await request(app)
        .get('/api/users/profile')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(protectedResponse.status).toBe(401);
    });
  });

  describe('User Profile Management', () => {
    let testUser: any;
    let accessToken: string;

    beforeEach(async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'profile-test@example.com',
          password: 'TestPassword123',
          firstName: 'Profile',
          lastName: 'Test'
        });

      testUser = response.body.user;
      accessToken = response.body.accessToken;
    });

    it('should get user profile', async () => {
      const response = await request(app)
        .get('/api/users/profile')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(200);
      expect(response.body.id).toBe(testUser.id);
      expect(response.body.email).toBe('profile-test@example.com');
      expect(response.body.firstName).toBe('Profile');
      expect(response.body.lastName).toBe('Test');
    });

    it('should update user profile', async () => {
      const updates = {
        firstName: 'Updated',
        lastName: 'Name',
        phone: '+1234567890',
        timezone: 'EST'
      };

      const response = await request(app)
        .put('/api/users/profile')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(updates);

      expect(response.status).toBe(200);
      expect(response.body.firstName).toBe('Updated');
      expect(response.body.lastName).toBe('Name');
      expect(response.body.phone).toBe('+1234567890');
      expect(response.body.timezone).toBe('EST');
    });

    it('should reject profile update without authentication', async () => {
      const response = await request(app)
        .put('/api/users/profile')
        .send({
          firstName: 'Updated'
        });

      expect(response.status).toBe(401);
    });

    it('should validate profile update data', async () => {
      const invalidUpdates = [
        { email: 'invalid-email' },
        { phone: 'invalid-phone' },
        { timezone: 'invalid-timezone' }
      ];

      for (const update of invalidUpdates) {
        const response = await request(app)
          .put('/api/users/profile')
          .set('Authorization', `Bearer ${accessToken}`)
          .send(update);

        expect(response.status).toBe(400);
      }
    });
  });

  describe('Password Management', () => {
    let testUser: any;
    let accessToken: string;

    beforeEach(async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'password-test@example.com',
          password: 'TestPassword123',
          firstName: 'Password',
          lastName: 'Test'
        });

      testUser = response.body.user;
      accessToken = response.body.accessToken;
    });

    it('should change password with valid current password', async () => {
      const response = await request(app)
        .put('/api/users/change-password')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          currentPassword: 'TestPassword123',
          newPassword: 'NewPassword456'
        });

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Password changed successfully');

      // Verify new password works
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'password-test@example.com',
          password: 'NewPassword456'
        });

      expect(loginResponse.status).toBe(200);
    });

    it('should reject password change with incorrect current password', async () => {
      const response = await request(app)
        .put('/api/users/change-password')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          currentPassword: 'WrongPassword',
          newPassword: 'NewPassword456'
        });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('INVALID_CURRENT_PASSWORD');
    });

    it('should validate new password strength', async () => {
      const response = await request(app)
        .put('/api/users/change-password')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          currentPassword: 'TestPassword123',
          newPassword: 'weak'
        });

      expect(response.status).toBe(400);
      expect(response.body.error.message).toContain('password');
    });

    it('should initiate password reset', async () => {
      const response = await request(app)
        .post('/api/auth/forgot-password')
        .send({
          email: 'password-test@example.com'
        });

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Password reset email sent');

      // Verify reset token is stored
      const result = await DatabaseService.query(
        'SELECT password_reset_token, password_reset_expires FROM users WHERE email = $1',
        ['password-test@example.com']
      );

      expect(result.rows[0].password_reset_token).toBeTruthy();
      expect(result.rows[0].password_reset_expires).toBeTruthy();
    });

    it('should reset password with valid token', async () => {
      // Initiate reset
      await request(app)
        .post('/api/auth/forgot-password')
        .send({
          email: 'password-test@example.com'
        });

      // Get reset token from database
      const tokenResult = await DatabaseService.query(
        'SELECT password_reset_token FROM users WHERE email = $1',
        ['password-test@example.com']
      );

      const resetToken = tokenResult.rows[0].password_reset_token;

      // Reset password
      const response = await request(app)
        .post('/api/auth/reset-password')
        .send({
          token: resetToken,
          password: 'ResetPassword789'
        });

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Password reset successfully');

      // Verify new password works
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'password-test@example.com',
          password: 'ResetPassword789'
        });

      expect(loginResponse.status).toBe(200);
    });
  });

  describe('User Settings', () => {
    let testUser: any;
    let accessToken: string;

    beforeEach(async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'settings-test@example.com',
          password: 'TestPassword123',
          firstName: 'Settings',
          lastName: 'Test'
        });

      testUser = response.body.user;
      accessToken = response.body.accessToken;
    });

    it('should get user settings', async () => {
      const response = await request(app)
        .get('/api/users/settings')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body.settings)).toBe(true);
    });

    it('should set user setting', async () => {
      const response = await request(app)
        .put('/api/users/settings/theme')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          value: 'dark'
        });

      expect(response.status).toBe(200);
      expect(response.body.settingKey).toBe('theme');
      expect(response.body.settingValue).toBe('dark');
    });

    it('should get specific user setting', async () => {
      // Set a setting first
      await request(app)
        .put('/api/users/settings/notifications')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          value: { email: true, push: false }
        });

      // Get the setting
      const response = await request(app)
        .get('/api/users/settings/notifications')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(200);
      expect(response.body.settingKey).toBe('notifications');
      expect(response.body.settingValue).toEqual({ email: true, push: false });
    });

    it('should delete user setting', async () => {
      // Set a setting first
      await request(app)
        .put('/api/users/settings/temp')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          value: 'temporary'
        });

      // Delete the setting
      const response = await request(app)
        .delete('/api/users/settings/temp')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Setting deleted successfully');

      // Verify setting is deleted
      const getResponse = await request(app)
        .get('/api/users/settings/temp')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(getResponse.status).toBe(404);
    });
  });

  describe('User Statistics', () => {
    let testUser: any;
    let accessToken: string;

    beforeEach(async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'stats-test@example.com',
          password: 'TestPassword123',
          firstName: 'Stats',
          lastName: 'Test'
        });

      testUser = response.body.user;
      accessToken = response.body.accessToken;
    });

    it('should get user statistics', async () => {
      const response = await request(app)
        .get('/api/users/stats')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('totalStrategies');
      expect(response.body).toHaveProperty('activeStrategies');
      expect(response.body).toHaveProperty('totalPortfolios');
      expect(response.body).toHaveProperty('totalBacktests');
      expect(response.body).toHaveProperty('activeSessions');
      
      // New user should have zero stats
      expect(response.body.totalStrategies).toBe(0);
      expect(response.body.activeStrategies).toBe(0);
      expect(response.body.totalPortfolios).toBe(0);
      expect(response.body.totalBacktests).toBe(0);
    });
  });

  describe('Account Management', () => {
    let testUser: any;
    let accessToken: string;

    beforeEach(async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'account-test@example.com',
          password: 'TestPassword123',
          firstName: 'Account',
          lastName: 'Test'
        });

      testUser = response.body.user;
      accessToken = response.body.accessToken;
    });

    it('should deactivate user account', async () => {
      const response = await request(app)
        .post('/api/users/deactivate')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          password: 'TestPassword123'
        });

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Account deactivated successfully');

      // Verify user cannot login after deactivation
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'account-test@example.com',
          password: 'TestPassword123'
        });

      expect(loginResponse.status).toBe(401);
      expect(loginResponse.body.error.code).toBe('ACCOUNT_DEACTIVATED');
    });

    it('should require password for account deactivation', async () => {
      const response = await request(app)
        .post('/api/users/deactivate')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          password: 'WrongPassword'
        });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('INVALID_PASSWORD');
    });
  });

  describe('Error Handling', () => {
    it('should handle database connection errors', async () => {
      // Temporarily close database connection
      await DatabaseService.close();

      const response = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'error-test@example.com',
          password: 'TestPassword123',
          firstName: 'Error',
          lastName: 'Test'
        });

      expect(response.status).toBe(500);
      expect(response.body.error.code).toBe('DATABASE_ERROR');

      // Restore connection
      await DatabaseService.initialize();
    });

    it('should handle Redis connection errors', async () => {
      // Temporarily close Redis connection
      await RedisService.close();

      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test@example.com',
          password: 'TestPassword123'
        });

      // Should still work but might not cache session
      expect(response.status).not.toBe(500);

      // Restore connection
      await RedisService.initialize();
    });
  });
});