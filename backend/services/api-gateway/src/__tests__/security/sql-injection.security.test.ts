import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../../index';
import { config } from '../../config/config';

describe('SQL Injection Security Tests', () => {
  let validToken: string;

  beforeAll(() => {
    validToken = jwt.sign(
      { userId: 'test-user', type: 'access' },
      config.jwt.secret
    );
  });

  describe('Authentication Endpoints SQL Injection', () => {
    it('should prevent SQL injection in login email field', async () => {
      const sqlInjectionPayloads = [
        "admin@example.com' OR '1'='1",
        "admin@example.com'; DROP TABLE users; --",
        "admin@example.com' UNION SELECT * FROM users --",
        "admin@example.com' OR 1=1 --",
        "admin@example.com'; INSERT INTO users (email, password) VALUES ('hacker@evil.com', 'password'); --",
        "admin@example.com' OR EXISTS(SELECT * FROM users WHERE email='admin@example.com') --",
        "'; EXEC xp_cmdshell('dir'); --",
        "admin@example.com' AND (SELECT COUNT(*) FROM users) > 0 --"
      ];

      for (const payload of sqlInjectionPayloads) {
        const response = await request(app)
          .post('/api/auth/login')
          .send({
            email: payload,
            password: 'password123'
          });

        // Should either return validation error or authentication error, not 500
        expect([400, 401, 422]).toContain(response.status);
        expect(response.body.error).toBeDefined();
        
        // Should not contain SQL error messages
        const responseText = JSON.stringify(response.body).toLowerCase();
        expect(responseText).not.toMatch(/syntax error|sql|database|table|column/);
      }
    });

    it('should prevent SQL injection in registration fields', async () => {
      const sqlPayloads = [
        "'; DROP TABLE users; --",
        "' OR '1'='1",
        "' UNION SELECT password FROM users WHERE email='admin@example.com' --",
        "'; UPDATE users SET password='hacked' WHERE email='admin@example.com'; --"
      ];

      for (const payload of sqlPayloads) {
        const response = await request(app)
          .post('/api/auth/register')
          .send({
            email: `test${payload}@example.com`,
            password: 'TestPassword123',
            firstName: payload,
            lastName: payload
          });

        expect([400, 422]).toContain(response.status);
        
        const responseText = JSON.stringify(response.body).toLowerCase();
        expect(responseText).not.toMatch(/syntax error|sql|database|table|column/);
      }
    });

    it('should prevent blind SQL injection timing attacks', async () => {
      const timingPayloads = [
        "admin@example.com'; WAITFOR DELAY '00:00:05'; --",
        "admin@example.com' AND (SELECT COUNT(*) FROM users WHERE SUBSTRING(password,1,1)='a') > 0; WAITFOR DELAY '00:00:05'; --",
        "admin@example.com'; IF (1=1) WAITFOR DELAY '00:00:05'; --"
      ];

      for (const payload of timingPayloads) {
        const startTime = Date.now();
        
        const response = await request(app)
          .post('/api/auth/login')
          .send({
            email: payload,
            password: 'password123'
          });

        const endTime = Date.now();
        const duration = endTime - startTime;

        // Response should not be delayed by SQL injection
        expect(duration).toBeLessThan(2000); // Should respond within 2 seconds
        expect([400, 401, 422]).toContain(response.status);
      }
    });
  });

  describe('User Profile SQL Injection', () => {
    it('should prevent SQL injection in profile updates', async () => {
      const sqlPayloads = [
        "'; UPDATE users SET email='hacker@evil.com' WHERE id='1'; --",
        "' OR '1'='1",
        "'; DROP TABLE user_profiles; --",
        "' UNION SELECT password FROM users --"
      ];

      for (const payload of sqlPayloads) {
        const response = await request(app)
          .put('/api/users/profile')
          .set('Authorization', `Bearer ${validToken}`)
          .send({
            firstName: payload,
            lastName: payload,
            bio: payload
          });

        expect([400, 422]).toContain(response.status);
        
        const responseText = JSON.stringify(response.body).toLowerCase();
        expect(responseText).not.toMatch(/syntax error|sql|database|table|column/);
      }
    });

    it('should prevent SQL injection in user search', async () => {
      const searchPayloads = [
        "'; SELECT * FROM users WHERE role='admin'; --",
        "' OR 1=1 --",
        "' UNION SELECT email, password FROM users --",
        "'; INSERT INTO users (email, role) VALUES ('hacker@evil.com', 'admin'); --"
      ];

      for (const payload of searchPayloads) {
        const response = await request(app)
          .get('/api/users/search')
          .set('Authorization', `Bearer ${validToken}`)
          .query({ q: payload });

        expect([400, 422]).toContain(response.status);
        
        const responseText = JSON.stringify(response.body).toLowerCase();
        expect(responseText).not.toMatch(/syntax error|sql|database|table|column/);
      }
    });
  });

  describe('Strategy and Portfolio SQL Injection', () => {
    it('should prevent SQL injection in strategy creation', async () => {
      const sqlPayloads = [
        "'; DROP TABLE strategies; --",
        "' OR '1'='1",
        "'; UPDATE strategies SET user_id='hacker' WHERE id='1'; --"
      ];

      for (const payload of sqlPayloads) {
        const response = await request(app)
          .post('/api/strategies')
          .set('Authorization', `Bearer ${validToken}`)
          .send({
            name: payload,
            description: payload,
            config: {
              nodes: [],
              connections: [],
              parameters: {
                timeframe: '1h',
                positionSizing: { type: 'fixed', value: 1000 }
              }
            }
          });

        expect([400, 422]).toContain(response.status);
        
        const responseText = JSON.stringify(response.body).toLowerCase();
        expect(responseText).not.toMatch(/syntax error|sql|database|table|column/);
      }
    });

    it('should prevent SQL injection in portfolio queries', async () => {
      const sqlPayloads = [
        "'; SELECT * FROM portfolios WHERE user_id != 'current_user'; --",
        "' OR '1'='1",
        "' UNION SELECT balance FROM portfolios --"
      ];

      for (const payload of sqlPayloads) {
        const response = await request(app)
          .get('/api/portfolio/positions')
          .set('Authorization', `Bearer ${validToken}`)
          .query({ 
            symbol: payload,
            startDate: '2023-01-01',
            endDate: '2023-12-31'
          });

        expect([400, 422]).toContain(response.status);
        
        const responseText = JSON.stringify(response.body).toLowerCase();
        expect(responseText).not.toMatch(/syntax error|sql|database|table|column/);
      }
    });
  });

  describe('Advanced SQL Injection Techniques', () => {
    it('should prevent second-order SQL injection', async () => {
      // First, try to inject malicious data
      const maliciousData = "'; DROP TABLE users; --";
      
      const createResponse = await request(app)
        .post('/api/users/settings')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          key: 'display_name',
          value: maliciousData
        });

      // Then try to trigger it by retrieving the data
      const retrieveResponse = await request(app)
        .get('/api/users/settings/display_name')
        .set('Authorization', `Bearer ${validToken}`);

      // Both operations should be safe
      expect([200, 400, 422]).toContain(createResponse.status);
      expect([200, 400, 422]).toContain(retrieveResponse.status);
      
      const responseText = JSON.stringify(retrieveResponse.body).toLowerCase();
      expect(responseText).not.toMatch(/syntax error|sql|database|table|column/);
    });

    it('should prevent SQL injection through JSON fields', async () => {
      const jsonPayloads = [
        { "malicious": "'; DROP TABLE users; --" },
        { "query": "' OR '1'='1" },
        { "nested": { "sql": "'; SELECT * FROM users; --" } }
      ];

      for (const payload of jsonPayloads) {
        const response = await request(app)
          .post('/api/strategies')
          .set('Authorization', `Bearer ${validToken}`)
          .send({
            name: 'Test Strategy',
            description: 'Test',
            config: payload
          });

        expect([400, 422]).toContain(response.status);
        
        const responseText = JSON.stringify(response.body).toLowerCase();
        expect(responseText).not.toMatch(/syntax error|sql|database|table|column/);
      }
    });

    it('should prevent SQL injection through URL parameters', async () => {
      const urlPayloads = [
        "'; DROP TABLE users; --",
        "' OR '1'='1",
        "' UNION SELECT * FROM users --"
      ];

      for (const payload of urlPayloads) {
        const encodedPayload = encodeURIComponent(payload);
        
        const response = await request(app)
          .get(`/api/strategies/${encodedPayload}`)
          .set('Authorization', `Bearer ${validToken}`);

        expect([400, 404, 422]).toContain(response.status);
        
        const responseText = JSON.stringify(response.body).toLowerCase();
        expect(responseText).not.toMatch(/syntax error|sql|database|table|column/);
      }
    });

    it('should prevent SQL injection through HTTP headers', async () => {
      const headerPayloads = [
        "'; DROP TABLE users; --",
        "' OR '1'='1",
        "' UNION SELECT password FROM users --"
      ];

      for (const payload of headerPayloads) {
        const response = await request(app)
          .get('/api/users/profile')
          .set('Authorization', `Bearer ${validToken}`)
          .set('X-User-Agent', payload)
          .set('X-Forwarded-For', payload);

        // Should still work or return appropriate error
        expect([200, 400, 401]).toContain(response.status);
        
        const responseText = JSON.stringify(response.body).toLowerCase();
        expect(responseText).not.toMatch(/syntax error|sql|database|table|column/);
      }
    });
  });

  describe('NoSQL Injection Prevention', () => {
    it('should prevent NoSQL injection in MongoDB-style queries', async () => {
      const noSqlPayloads = [
        { "$ne": null },
        { "$gt": "" },
        { "$where": "function() { return true; }" },
        { "$regex": ".*" },
        { "$or": [{"email": "admin@example.com"}, {"role": "admin"}] }
      ];

      for (const payload of noSqlPayloads) {
        const response = await request(app)
          .post('/api/auth/login')
          .send({
            email: payload,
            password: 'password123'
          });

        expect([400, 401, 422]).toContain(response.status);
        expect(response.body.error).toBeDefined();
      }
    });

    it('should prevent JavaScript injection in JSON queries', async () => {
      const jsPayloads = [
        "function() { return db.users.find(); }",
        "this.constructor.constructor('return process')().exit()",
        "require('child_process').exec('rm -rf /')"
      ];

      for (const payload of jsPayloads) {
        const response = await request(app)
          .get('/api/users/search')
          .set('Authorization', `Bearer ${validToken}`)
          .query({ filter: payload });

        expect([400, 422]).toContain(response.status);
        
        const responseText = JSON.stringify(response.body).toLowerCase();
        expect(responseText).not.toMatch(/syntax error|reference error|type error/);
      }
    });
  });
});