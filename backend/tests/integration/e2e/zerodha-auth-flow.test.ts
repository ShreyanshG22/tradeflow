import request from 'supertest';
import { Express } from 'express';
import { createTestApp } from '../setup/test-app';
import { TestDataManager } from '../setup/test-data-manager';
import { ZerodhaTestClient } from '../setup/zerodha-test-client';

describe('Zerodha Authentication End-to-End Flow', () => {
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

  describe('Complete Authentication Flow', () => {
    it('should complete full OAuth flow from login to authenticated API calls', async () => {
      // Step 1: Initiate login
      const loginResponse = await request(app)
        .post('/api/zerodha/auth/login')
        .send({ user_id: testUserId })
        .expect(200);

      expect(loginResponse.body).toMatchObject({
        success: true,
        data: {
          login_url: expect.stringContaining('kite.zerodha.com'),
          state: expect.any(String)
        }
      });

      const { state } = loginResponse.body.data;

      // Step 2: Simulate callback with request token
      const mockRequestToken = zerodhaClient.generateMockRequestToken();
      const callbackResponse = await request(app)
        .get('/api/zerodha/auth/callback')
        .query({
          request_token: mockRequestToken,
          state: state,
          action: 'login',
          status: 'success'
        })
        .expect(200);

      expect(callbackResponse.body).toMatchObject({
        success: true,
        data: {
          access_token: expect.any(String),
          user_profile: expect.objectContaining({
            user_id: expect.any(String),
            user_name: expect.any(String),
            email: expect.any(String)
          })
        }
      });

      const { access_token } = callbackResponse.body.data;

      // Step 3: Verify authenticated API access
      const profileResponse = await request(app)
        .get('/api/zerodha/auth/profile')
        .set('Authorization', `Bearer ${access_token}`)
        .expect(200);

      expect(profileResponse.body).toMatchObject({
        success: true,
        data: expect.objectContaining({
          user_id: expect.any(String),
          user_name: expect.any(String),
          email: expect.any(String),
          broker: 'ZERODHA'
        })
      });

      // Step 4: Test token refresh
      const refreshResponse = await request(app)
        .post('/api/zerodha/auth/refresh')
        .set('Authorization', `Bearer ${access_token}`)
        .expect(200);

      expect(refreshResponse.body).toMatchObject({
        success: true,
        data: {
          access_token: expect.any(String),
          expires_at: expect.any(String)
        }
      });

      // Step 5: Test logout
      const logoutResponse = await request(app)
        .delete('/api/zerodha/auth/logout')
        .set('Authorization', `Bearer ${access_token}`)
        .expect(200);

      expect(logoutResponse.body).toMatchObject({
        success: true,
        message: 'Successfully logged out'
      });

      // Step 6: Verify token is invalidated
      await request(app)
        .get('/api/zerodha/auth/profile')
        .set('Authorization', `Bearer ${access_token}`)
        .expect(401);
    });

    it('should handle authentication errors gracefully', async () => {
      // Test invalid request token
      const invalidCallbackResponse = await request(app)
        .get('/api/zerodha/auth/callback')
        .query({
          request_token: 'invalid_token',
          state: 'invalid_state',
          action: 'login',
          status: 'success'
        })
        .expect(400);

      expect(invalidCallbackResponse.body).toMatchObject({
        success: false,
        error: {
          code: 'INVALID_REQUEST_TOKEN',
          message: expect.any(String)
        }
      });

      // Test expired token access
      const expiredToken = zerodhaClient.generateExpiredToken();
      await request(app)
        .get('/api/zerodha/auth/profile')
        .set('Authorization', `Bearer ${expiredToken}`)
        .expect(401);
    });
  });

  describe('Session Management', () => {
    it('should maintain session state across requests', async () => {
      const { access_token } = await zerodhaClient.authenticateTestUser(testUserId);

      // Make multiple authenticated requests
      const requests = Array.from({ length: 5 }, (_, i) =>
        request(app)
          .get('/api/zerodha/auth/profile')
          .set('Authorization', `Bearer ${access_token}`)
          .expect(200)
      );

      const responses = await Promise.all(requests);
      
      // All requests should return the same user profile
      const profiles = responses.map(r => r.body.data);
      profiles.forEach(profile => {
        expect(profile).toMatchObject(profiles[0]);
      });
    });

    it('should handle concurrent authentication requests', async () => {
      const concurrentLogins = Array.from({ length: 3 }, () =>
        request(app)
          .post('/api/zerodha/auth/login')
          .send({ user_id: testUserId })
      );

      const responses = await Promise.all(concurrentLogins);
      
      // All should succeed with different states
      responses.forEach(response => {
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
      });

      const states = responses.map(r => r.body.data.state);
      const uniqueStates = new Set(states);
      expect(uniqueStates.size).toBe(states.length);
    });
  });
});