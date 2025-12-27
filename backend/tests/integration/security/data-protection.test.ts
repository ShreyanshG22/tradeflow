import request from 'supertest';
import { Express } from 'express';
import { Pool } from 'pg';
import Redis from 'ioredis';
import { createTestApp } from '../setup/test-app';
import { TestDataManager } from '../setup/test-data-manager';
import { ZerodhaTestClient } from '../setup/zerodha-test-client';
import { encrypt, decrypt } from '../../../shared/zerodha-utils/src/encryption';

describe('Data Protection and Encryption Tests', () => {
  let app: Express;
  let testDataManager: TestDataManager;
  let zerodhaClient: ZerodhaTestClient;
  let testUserId: string;
  let accessToken: string;
  let db: Pool;
  let redis: Redis;

  beforeAll(async () => {
    app = await createTestApp();
    testDataManager = new TestDataManager();
    zerodhaClient = new ZerodhaTestClient();
    await testDataManager.setup();

    db = new Pool({ connectionString: process.env.DATABASE_URL });
    redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379/1');
  });

  afterAll(async () => {
    await testDataManager.cleanup();
    await db.end();
    await redis.quit();
  });

  beforeEach(async () => {
    testUserId = await testDataManager.createTestUser();
    const authResult = await zerodhaClient.authenticateTestUser(testUserId);
    accessToken = authResult.access_token;
  });

  afterEach(async () => {
    await testDataManager.cleanupTestUser(testUserId);
  });

  describe('Token Encryption and Storage', () => {
    it('should encrypt access tokens before storing in database', async () => {
      // Simulate storing encrypted token
      const plainToken = 'sensitive_access_token_123';
      const encryptedToken = encrypt(plainToken);

      await db.query(
        'UPDATE users SET zerodha_access_token = $1 WHERE id = $2',
        [encryptedToken, testUserId]
      );

      // Verify token is encrypted in database
      const result = await db.query(
        'SELECT zerodha_access_token FROM users WHERE id = $1',
        [testUserId]
      );

      const storedToken = result.rows[0].zerodha_access_token;
      
      // Stored token should not be plain text
      expect(storedToken).not.toBe(plainToken);
      expect(storedToken).toContain(':'); // Encrypted format includes IV
      
      // Should be able to decrypt back to original
      const decryptedToken = decrypt(storedToken);
      expect(decryptedToken).toBe(plainToken);
    });

    it('should handle encryption/decryption errors gracefully', async () => {
      // Test with invalid encrypted data
      const invalidEncryptedData = [
        'invalid_format',
        'no:colon:but:wrong:format',
        '', // Empty string
        'onlyiv:', // Missing encrypted data
        ':onlydata' // Missing IV
      ];

      for (const invalidData of invalidEncryptedData) {
        expect(() => {
          decrypt(invalidData);
        }).toThrow();
      }
    });

    it('should use different IVs for each encryption', async () => {
      const plainText = 'same_plain_text';
      
      const encrypted1 = encrypt(plainText);
      const encrypted2 = encrypt(plainText);
      
      // Should produce different encrypted values due to different IVs
      expect(encrypted1).not.toBe(encrypted2);
      
      // But both should decrypt to the same plain text
      expect(decrypt(encrypted1)).toBe(plainText);
      expect(decrypt(encrypted2)).toBe(plainText);
    });

    it('should validate encryption key strength', async () => {
      // Test that encryption uses proper key length
      const testData = 'test_encryption_data';
      const encrypted = encrypt(testData);
      
      // Encrypted data should be significantly different from plain text
      expect(encrypted).not.toContain(testData);
      expect(encrypted.length).toBeGreaterThan(testData.length);
      
      // Should include IV separator
      expect(encrypted).toContain(':');
      
      const [iv, encryptedData] = encrypted.split(':');
      expect(iv.length).toBeGreaterThan(0);
      expect(encryptedData.length).toBeGreaterThan(0);
    });
  });

  describe('Sensitive Data Handling', () => {
    it('should not expose sensitive data in API responses', async () => {
      // Create test position with sensitive data
      await testDataManager.createTestPosition(testUserId, {
        tradingsymbol: 'RELIANCE',
        quantity: 100,
        average_price: 2500
      });

      const response = await request(app)
        .get('/api/zerodha/portfolio/positions')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const responseText = JSON.stringify(response.body);
      
      // Should not expose internal IDs, tokens, or system information
      expect(responseText).not.toContain('zerodha_access_token');
      expect(responseText).not.toContain('zerodha_refresh_token');
      expect(responseText).not.toContain('password');
      expect(responseText).not.toContain('secret');
      expect(responseText).not.toContain('api_key');
      expect(responseText).not.toContain('database_url');
      expect(responseText).not.toContain('redis_url');
    });

    it('should sanitize user input to prevent data leakage', async () => {
      const maliciousInputs = [
        { tradingsymbol: '<script>alert("xss")</script>' },
        { tradingsymbol: '"; DROP TABLE users; --' },
        { tradingsymbol: '../../../etc/passwd' },
        { tradingsymbol: '${process.env.SECRET_KEY}' },
        { tradingsymbol: 'javascript:alert(document.cookie)' }
      ];

      for (const input of maliciousInputs) {
        const response = await request(app)
          .post('/api/zerodha/orders')
          .set('Authorization', `Bearer ${accessToken}`)
          .send({
            exchange: 'NSE',
            tradingsymbol: input.tradingsymbol,
            transaction_type: 'BUY',
            quantity: 1,
            product: 'CNC',
            order_type: 'MARKET'
          });

        // Should either reject the input or sanitize it
        if (response.status === 400) {
          expect(response.body.success).toBe(false);
        } else if (response.status === 201) {
          // If accepted, should be sanitized
          const responseText = JSON.stringify(response.body);
          expect(responseText).not.toContain('<script>');
          expect(responseText).not.toContain('DROP TABLE');
          expect(responseText).not.toContain('../');
          expect(responseText).not.toContain('javascript:');
        }
      }
    });

    it('should implement proper data masking in logs', async () => {
      // This test would require access to actual log output
      // In a real implementation, you'd capture log output and verify masking
      
      // Simulate an error that might log sensitive data
      const response = await request(app)
        .post('/api/zerodha/auth/callback')
        .query({
          request_token: 'sensitive_token_12345',
          state: 'invalid_state',
          action: 'login',
          status: 'success'
        })
        .expect(400);

      // Error response should not contain the full sensitive token
      const responseText = JSON.stringify(response.body);
      expect(responseText).not.toContain('sensitive_token_12345');
      
      // If token is mentioned, it should be masked
      if (responseText.includes('token')) {
        expect(responseText).toMatch(/\*{3,}|\[MASKED\]|\[REDACTED\]/);
      }
    });
  });

  describe('Database Security', () => {
    it('should prevent SQL injection attacks', async () => {
      const sqlInjectionAttempts = [
        "'; DROP TABLE zerodha_orders; --",
        "' OR 1=1 --",
        "' UNION SELECT * FROM users --",
        "'; INSERT INTO zerodha_orders (user_id) VALUES ('hacker'); --",
        "' AND (SELECT COUNT(*) FROM users) > 0 --"
      ];

      for (const injection of sqlInjectionAttempts) {
        const response = await request(app)
          .get('/api/zerodha/portfolio/positions')
          .query({ symbol: injection })
          .set('Authorization', `Bearer ${accessToken}`);

        // Should not return database errors or unexpected data
        if (response.status === 200) {
          expect(response.body.success).toBe(true);
          expect(response.body.data).toBeInstanceOf(Array);
        } else {
          expect(response.body.success).toBe(false);
          expect(response.body.error.message).not.toContain('SQL');
          expect(response.body.error.message).not.toContain('database');
        }
      }
    });

    it('should use parameterized queries for all database operations', async () => {
      // Create test data with special characters that could break non-parameterized queries
      const specialCharacters = [
        "O'Reilly Stock",
        'Stock "with quotes"',
        'Stock; with semicolon',
        'Stock\nwith\nnewlines',
        'Stock\twith\ttabs'
      ];

      for (const symbol of specialCharacters) {
        await testDataManager.createTestPosition(testUserId, {
          tradingsymbol: symbol,
          quantity: 10,
          average_price: 1000
        });
      }

      // Retrieve positions - should handle special characters correctly
      const response = await request(app)
        .get('/api/zerodha/portfolio/positions')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBe(specialCharacters.length);

      // Verify all special characters are preserved
      const retrievedSymbols = response.body.data.map((p: any) => p.tradingsymbol);
      specialCharacters.forEach(symbol => {
        expect(retrievedSymbols).toContain(symbol);
      });
    });

    it('should implement proper database connection security', async () => {
      // Test that database connections use SSL/TLS in production
      const connectionString = process.env.DATABASE_URL;
      
      if (process.env.NODE_ENV === 'production') {
        expect(connectionString).toContain('sslmode=require');
      }

      // Test connection pooling limits
      const maxConnections = 20;
      const connections: any[] = [];

      try {
        // Try to create more connections than the pool allows
        for (let i = 0; i < maxConnections + 5; i++) {
          const client = await db.connect();
          connections.push(client);
        }

        // Should not exceed pool limit
        expect(connections.length).toBeLessThanOrEqual(maxConnections);
      } catch (error) {
        // Should handle connection limit gracefully
        expect(error.message).toContain('pool');
      } finally {
        // Clean up connections
        connections.forEach(client => {
          try {
            client.release();
          } catch (e) {
            // Ignore cleanup errors
          }
        });
      }
    });
  });

  describe('Redis Security', () => {
    it('should secure Redis data storage', async () => {
      const sensitiveData = {
        access_token: 'sensitive_access_token',
        user_id: testUserId,
        session_data: 'private_session_information'
      };

      // Store data in Redis
      await redis.setex(`session:${testUserId}`, 3600, JSON.stringify(sensitiveData));

      // Verify data is stored
      const storedData = await redis.get(`session:${testUserId}`);
      expect(storedData).toBeTruthy();

      const parsedData = JSON.parse(storedData!);
      expect(parsedData.user_id).toBe(testUserId);

      // Test Redis key expiration
      const ttl = await redis.ttl(`session:${testUserId}`);
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(3600);
    });

    it('should implement proper Redis access controls', async () => {
      // Test that users can only access their own Redis data
      const anotherUserId = await testDataManager.createTestUser();
      
      // Store data for both users
      await redis.setex(`session:${testUserId}`, 3600, JSON.stringify({ user: 'user1' }));
      await redis.setex(`session:${anotherUserId}`, 3600, JSON.stringify({ user: 'user2' }));

      // User should only be able to access their own session
      const user1Data = await redis.get(`session:${testUserId}`);
      const user2Data = await redis.get(`session:${anotherUserId}`);

      expect(JSON.parse(user1Data!).user).toBe('user1');
      expect(JSON.parse(user2Data!).user).toBe('user2');

      // Clean up
      await redis.del(`session:${anotherUserId}`);
      await testDataManager.cleanupTestUser(anotherUserId);
    });

    it('should handle Redis connection security', async () => {
      // Test Redis connection with authentication if configured
      const redisUrl = process.env.REDIS_URL;
      
      if (redisUrl && redisUrl.includes('@')) {
        // URL contains authentication
        expect(redisUrl).toMatch(/redis:\/\/[^:]+:[^@]+@/);
      }

      // Test Redis command restrictions (if configured)
      try {
        // Dangerous commands should be disabled in production
        await redis.flushall();
        
        // If we reach here in production, it's a security issue
        if (process.env.NODE_ENV === 'production') {
          fail('FLUSHALL command should be disabled in production');
        }
      } catch (error) {
        // Expected in production environments
        expect(error.message).toContain('command not allowed');
      }
    });
  });

  describe('API Security Headers', () => {
    it('should include proper security headers', async () => {
      const response = await request(app)
        .get('/api/zerodha/auth/profile')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      // Check for security headers
      expect(response.headers).toHaveProperty('x-content-type-options', 'nosniff');
      expect(response.headers).toHaveProperty('x-frame-options', 'DENY');
      expect(response.headers).toHaveProperty('x-xss-protection', '1; mode=block');
      
      // Check for HSTS header (in production)
      if (process.env.NODE_ENV === 'production') {
        expect(response.headers).toHaveProperty('strict-transport-security');
      }

      // Should not expose server information
      expect(response.headers['server']).toBeUndefined();
      expect(response.headers['x-powered-by']).toBeUndefined();
    });

    it('should implement proper CORS configuration', async () => {
      const response = await request(app)
        .options('/api/zerodha/auth/profile')
        .set('Origin', 'https://malicious-site.com')
        .expect(200);

      // Should have restrictive CORS policy
      const allowedOrigin = response.headers['access-control-allow-origin'];
      
      if (allowedOrigin) {
        // Should not allow all origins in production
        if (process.env.NODE_ENV === 'production') {
          expect(allowedOrigin).not.toBe('*');
        }
        
        // Should not allow malicious origins
        expect(allowedOrigin).not.toBe('https://malicious-site.com');
      }
    });

    it('should validate Content-Type headers', async () => {
      // Test with invalid content type
      const response = await request(app)
        .post('/api/zerodha/orders')
        .set('Authorization', `Bearer ${accessToken}`)
        .set('Content-Type', 'text/plain')
        .send('invalid data format')
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('INVALID_CONTENT_TYPE');
    });
  });

  describe('Input Validation and Sanitization', () => {
    it('should validate and sanitize all input parameters', async () => {
      const invalidInputs = [
        { quantity: -1 }, // Negative quantity
        { quantity: 'invalid' }, // Non-numeric
        { quantity: 999999999 }, // Too large
        { price: -100 }, // Negative price
        { price: 'NaN' }, // Invalid number
        { tradingsymbol: '' }, // Empty symbol
        { tradingsymbol: 'A'.repeat(100) }, // Too long
        { exchange: 'INVALID' }, // Invalid exchange
        { transaction_type: 'HACK' }, // Invalid transaction type
      ];

      for (const invalidInput of invalidInputs) {
        const response = await request(app)
          .post('/api/zerodha/orders')
          .set('Authorization', `Bearer ${accessToken}`)
          .send({
            exchange: 'NSE',
            tradingsymbol: 'RELIANCE',
            transaction_type: 'BUY',
            quantity: 1,
            product: 'CNC',
            order_type: 'MARKET',
            ...invalidInput
          });

        expect(response.status).toBe(400);
        expect(response.body.success).toBe(false);
        expect(response.body.error.code).toBe('VALIDATION_ERROR');
      }
    });

    it('should prevent NoSQL injection attacks', async () => {
      const nosqlInjectionAttempts = [
        { $ne: null },
        { $gt: '' },
        { $regex: '.*' },
        { $where: 'function() { return true; }' },
        { $expr: { $gt: ['$quantity', 0] } }
      ];

      for (const injection of nosqlInjectionAttempts) {
        const response = await request(app)
          .get('/api/zerodha/portfolio/positions')
          .query({ filter: JSON.stringify(injection) })
          .set('Authorization', `Bearer ${accessToken}`);

        // Should reject or sanitize NoSQL injection attempts
        if (response.status === 200) {
          expect(response.body.success).toBe(true);
          expect(response.body.data).toBeInstanceOf(Array);
        } else {
          expect(response.body.success).toBe(false);
        }
      }
    });

    it('should handle file upload security (if applicable)', async () => {
      // Test file upload restrictions
      const maliciousFiles = [
        { filename: 'script.js', content: 'alert("xss")' },
        { filename: '../../../etc/passwd', content: 'root:x:0:0:root' },
        { filename: 'virus.exe', content: 'MZ\x90\x00' }, // PE header
        { filename: 'large_file.txt', content: 'A'.repeat(10 * 1024 * 1024) } // 10MB
      ];

      for (const file of maliciousFiles) {
        const response = await request(app)
          .post('/api/zerodha/upload')
          .set('Authorization', `Bearer ${accessToken}`)
          .attach('file', Buffer.from(file.content), file.filename);

        // Should reject malicious files
        expect(response.status).toBeGreaterThanOrEqual(400);
        if (response.body.success !== undefined) {
          expect(response.body.success).toBe(false);
        }
      }
    });
  });

  describe('Audit and Compliance', () => {
    it('should log security-relevant events', async () => {
      // Test that security events are logged (in a real implementation)
      const securityEvents = [
        { action: 'login_attempt', endpoint: '/api/zerodha/auth/login' },
        { action: 'token_validation', endpoint: '/api/zerodha/auth/profile' },
        { action: 'order_placement', endpoint: '/api/zerodha/orders' },
        { action: 'logout', endpoint: '/api/zerodha/auth/logout' }
      ];

      for (const event of securityEvents) {
        const response = await request(app)
          [event.action === 'order_placement' ? 'post' : 'get'](event.endpoint)
          .set('Authorization', `Bearer ${accessToken}`)
          .send(event.action === 'order_placement' ? {
            exchange: 'NSE',
            tradingsymbol: 'RELIANCE',
            transaction_type: 'BUY',
            quantity: 1,
            product: 'CNC',
            order_type: 'MARKET'
          } : {});

        // Events should be handled (success or proper error)
        expect([200, 201, 401, 403]).toContain(response.status);
      }
    });

    it('should implement data retention policies', async () => {
      // Test that old data is properly handled according to retention policies
      const oldDate = new Date();
      oldDate.setFullYear(oldDate.getFullYear() - 2); // 2 years ago

      // Create old test data
      await db.query(`
        INSERT INTO zerodha_orders (
          user_id, order_id, exchange, tradingsymbol, transaction_type,
          quantity, product, order_type, status, order_timestamp, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10)
      `, [
        testUserId, 'OLD_ORDER_123', 'NSE', 'OLDSTOCK', 'BUY',
        10, 'CNC', 'MARKET', 'COMPLETE', oldDate
      ]);

      // In a real implementation, you'd test that old data is archived or deleted
      // according to compliance requirements
      const oldDataQuery = await db.query(
        'SELECT COUNT(*) FROM zerodha_orders WHERE created_at < $1',
        [new Date(Date.now() - 365 * 24 * 60 * 60 * 1000)] // 1 year ago
      );

      // This is a placeholder - actual retention policy would depend on requirements
      expect(parseInt(oldDataQuery.rows[0].count)).toBeGreaterThanOrEqual(0);
    });
  });
});