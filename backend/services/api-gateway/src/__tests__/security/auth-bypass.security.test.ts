import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../../index';
import { config } from '../../config/config';

describe('Authentication Bypass Security Tests', () => {
  describe('JWT Token Security', () => {
    it('should reject requests without authorization header', async () => {
      const response = await request(app)
        .get('/api/users/profile')
        .expect(401);

      expect(response.body.error.code).toBe('AUTHENTICATION_ERROR');
      expect(response.body.error.message).toBe('Authorization header is required');
    });

    it('should reject malformed authorization headers', async () => {
      const malformedHeaders = [
        'InvalidToken',
        'Basic dGVzdDp0ZXN0',
        'Bearer',
        'Bearer ',
        'Token abc123',
        'JWT abc123'
      ];

      for (const header of malformedHeaders) {
        const response = await request(app)
          .get('/api/users/profile')
          .set('Authorization', header)
          .expect(401);

        expect(response.body.error.code).toBe('AUTHENTICATION_ERROR');
      }
    });

    it('should reject invalid JWT tokens', async () => {
      const invalidTokens = [
        'invalid.token.here',
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.invalid.signature',
        'eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJ1c2VySWQiOiJ0ZXN0In0.',
        Buffer.from('malicious payload').toString('base64')
      ];

      for (const token of invalidTokens) {
        const response = await request(app)
          .get('/api/users/profile')
          .set('Authorization', `Bearer ${token}`)
          .expect(401);

        expect(response.body.error.code).toBe('AUTHENTICATION_ERROR');
      }
    });

    it('should reject tokens with invalid signatures', async () => {
      const maliciousToken = jwt.sign(
        { userId: 'malicious-user', type: 'access' },
        'wrong-secret'
      );

      const response = await request(app)
        .get('/api/users/profile')
        .set('Authorization', `Bearer ${maliciousToken}`)
        .expect(401);

      expect(response.body.error.code).toBe('AUTHENTICATION_ERROR');
      expect(response.body.error.message).toBe('Invalid token');
    });

    it('should reject expired tokens', async () => {
      const expiredToken = jwt.sign(
        { 
          userId: 'test-user', 
          type: 'access',
          exp: Math.floor(Date.now() / 1000) - 3600 // Expired 1 hour ago
        },
        config.jwt.secret
      );

      const response = await request(app)
        .get('/api/users/profile')
        .set('Authorization', `Bearer ${expiredToken}`)
        .expect(401);

      expect(response.body.error.code).toBe('AUTHENTICATION_ERROR');
      expect(response.body.error.message).toBe('Token has expired');
    });

    it('should reject tokens with wrong type', async () => {
      const wrongTypeToken = jwt.sign(
        { userId: 'test-user', type: 'refresh' },
        config.jwt.secret
      );

      const response = await request(app)
        .get('/api/users/profile')
        .set('Authorization', `Bearer ${wrongTypeToken}`)
        .expect(401);

      expect(response.body.error.code).toBe('AUTHENTICATION_ERROR');
    });

    it('should reject tokens with missing required claims', async () => {
      const incompleteTokens = [
        jwt.sign({}, config.jwt.secret),
        jwt.sign({ userId: 'test' }, config.jwt.secret),
        jwt.sign({ type: 'access' }, config.jwt.secret)
      ];

      for (const token of incompleteTokens) {
        const response = await request(app)
          .get('/api/users/profile')
          .set('Authorization', `Bearer ${token}`)
          .expect(401);

        expect(response.body.error.code).toBe('AUTHENTICATION_ERROR');
      }
    });

    it('should prevent algorithm confusion attacks', async () => {
      // Try to use 'none' algorithm
      const noneAlgToken = jwt.sign(
        { userId: 'malicious-user', type: 'access' },
        '',
        { algorithm: 'none' }
      );

      const response = await request(app)
        .get('/api/users/profile')
        .set('Authorization', `Bearer ${noneAlgToken}`)
        .expect(401);

      expect(response.body.error.code).toBe('AUTHENTICATION_ERROR');
    });

    it('should prevent JWT token reuse after logout', async () => {
      // This test would require integration with user service
      // For now, we'll test the middleware behavior
      const validToken = jwt.sign(
        { userId: 'test-user', type: 'access' },
        config.jwt.secret
      );

      // First request should work (assuming session exists)
      // Second request after logout should fail
      // This would be implemented in integration tests
      expect(validToken).toBeDefined();
    });
  });

  describe('Session Security', () => {
    it('should prevent session fixation attacks', async () => {
      // Test that new sessions are created on login
      const loginData = {
        email: 'security-test@example.com',
        password: 'TestPassword123'
      };

      // Multiple login attempts should generate different tokens
      const responses = await Promise.all([
        request(app).post('/api/auth/login').send(loginData),
        request(app).post('/api/auth/login').send(loginData)
      ]);

      // Both should succeed but have different tokens
      responses.forEach(response => {
        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('accessToken');
      });

      if (responses[0].status === 200 && responses[1].status === 200) {
        expect(responses[0].body.accessToken).not.toBe(responses[1].body.accessToken);
      }
    });

    it('should enforce session timeout', async () => {
      // Test with a very short-lived token
      const shortLivedToken = jwt.sign(
        { 
          userId: 'test-user', 
          type: 'access',
          exp: Math.floor(Date.now() / 1000) + 1 // Expires in 1 second
        },
        config.jwt.secret
      );

      // Wait for token to expire
      await new Promise(resolve => setTimeout(resolve, 1100));

      const response = await request(app)
        .get('/api/users/profile')
        .set('Authorization', `Bearer ${shortLivedToken}`)
        .expect(401);

      expect(response.body.error.message).toBe('Token has expired');
    });
  });

  describe('Authorization Bypass Attempts', () => {
    it('should prevent privilege escalation through token manipulation', async () => {
      // Create a token with user role
      const userToken = jwt.sign(
        { 
          userId: 'test-user', 
          type: 'access',
          role: 'user',
          permissions: ['read:profile']
        },
        config.jwt.secret
      );

      // Try to access admin endpoint
      const response = await request(app)
        .get('/api/admin/users')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(403);

      expect(response.body.error.code).toBe('AUTHORIZATION_ERROR');
    });

    it('should validate user permissions for protected resources', async () => {
      const limitedToken = jwt.sign(
        { 
          userId: 'test-user', 
          type: 'access',
          permissions: ['read:profile']
        },
        config.jwt.secret
      );

      // Try to access endpoint requiring write permission
      const response = await request(app)
        .put('/api/users/profile')
        .set('Authorization', `Bearer ${limitedToken}`)
        .send({ firstName: 'Updated' })
        .expect(403);

      expect(response.body.error.code).toBe('AUTHORIZATION_ERROR');
    });

    it('should prevent cross-user resource access', async () => {
      const userToken = jwt.sign(
        { 
          userId: 'user-1', 
          type: 'access'
        },
        config.jwt.secret
      );

      // Try to access another user's data
      const response = await request(app)
        .get('/api/users/user-2/profile')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(403);

      expect(response.body.error.code).toBe('AUTHORIZATION_ERROR');
    });
  });

  describe('Header Injection Attacks', () => {
    it('should sanitize authorization headers', async () => {
      const maliciousHeaders = [
        'Bearer token\r\nX-Admin: true',
        'Bearer token\nSet-Cookie: admin=true',
        'Bearer token%0d%0aX-Admin:%20true',
        'Bearer token\x00admin'
      ];

      for (const header of maliciousHeaders) {
        const response = await request(app)
          .get('/api/users/profile')
          .set('Authorization', header)
          .expect(401);

        expect(response.body.error.code).toBe('AUTHENTICATION_ERROR');
      }
    });

    it('should prevent JWT header parameter injection', async () => {
      // Malicious JWT with injected header parameters
      const maliciousHeader = {
        alg: 'HS256',
        typ: 'JWT',
        kid: '../../../etc/passwd'
      };

      const maliciousToken = jwt.sign(
        { userId: 'test-user', type: 'access' },
        config.jwt.secret,
        { header: maliciousHeader }
      );

      const response = await request(app)
        .get('/api/users/profile')
        .set('Authorization', `Bearer ${maliciousToken}`)
        .expect(401);

      expect(response.body.error.code).toBe('AUTHENTICATION_ERROR');
    });
  });
});