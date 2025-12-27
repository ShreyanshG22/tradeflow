import request from 'supertest';
import { Express } from 'express';
import { performance } from 'perf_hooks';
import { createTestApp } from '../setup/test-app';
import { TestDataManager } from '../setup/test-data-manager';
import { ZerodhaTestClient } from '../setup/zerodha-test-client';

describe('Zerodha API Performance Tests', () => {
  let app: Express;
  let testDataManager: TestDataManager;
  let zerodhaClient: ZerodhaTestClient;
  let testUserId: string;
  let accessToken: string;

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
    const authResult = await zerodhaClient.authenticateTestUser(testUserId);
    accessToken = authResult.access_token;
  });

  afterEach(async () => {
    await testDataManager.cleanupTestUser(testUserId);
  });

  describe('API Response Time Requirements', () => {
    it('should handle order placement within 50ms requirement', async () => {
      const iterations = 10;
      const responseTimes: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const startTime = performance.now();
        
        const response = await request(app)
          .post('/api/zerodha/orders')
          .set('Authorization', `Bearer ${accessToken}`)
          .send({
            exchange: 'NSE',
            tradingsymbol: 'RELIANCE',
            transaction_type: 'BUY',
            quantity: 1,
            product: 'CNC',
            order_type: 'MARKET'
          })
          .expect(201);

        const endTime = performance.now();
        const responseTime = endTime - startTime;
        responseTimes.push(responseTime);

        expect(response.body.success).toBe(true);
      }

      // Calculate statistics
      const avgResponseTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
      const maxResponseTime = Math.max(...responseTimes);
      const p95ResponseTime = responseTimes.sort((a, b) => a - b)[Math.floor(responseTimes.length * 0.95)];

      console.log(`Order Placement Performance:
        Average: ${avgResponseTime.toFixed(2)}ms
        Maximum: ${maxResponseTime.toFixed(2)}ms
        95th Percentile: ${p95ResponseTime.toFixed(2)}ms`);

      // Verify performance requirements
      expect(avgResponseTime).toBeLessThan(50);
      expect(p95ResponseTime).toBeLessThan(100);
      expect(maxResponseTime).toBeLessThan(200);
    });

    it('should handle market data requests efficiently', async () => {
      const iterations = 20;
      const responseTimes: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const startTime = performance.now();
        
        const response = await request(app)
          .get('/api/zerodha/market/quotes')
          .query({ instruments: 'NSE:RELIANCE,NSE:INFY,NSE:TCS' })
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(200);

        const endTime = performance.now();
        const responseTime = endTime - startTime;
        responseTimes.push(responseTime);

        expect(response.body.success).toBe(true);
        expect(Object.keys(response.body.data)).toHaveLength(3);
      }

      const avgResponseTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
      const maxResponseTime = Math.max(...responseTimes);

      console.log(`Market Data Performance:
        Average: ${avgResponseTime.toFixed(2)}ms
        Maximum: ${maxResponseTime.toFixed(2)}ms`);

      // Market data should be very fast
      expect(avgResponseTime).toBeLessThan(30);
      expect(maxResponseTime).toBeLessThan(100);
    });

    it('should handle portfolio calculations within acceptable time', async () => {
      // Create multiple positions for complex calculations
      const positions = Array.from({ length: 50 }, (_, i) => ({
        tradingsymbol: `STOCK${i}`,
        quantity: Math.floor(Math.random() * 100) + 1,
        average_price: Math.floor(Math.random() * 1000) + 100
      }));

      for (const pos of positions) {
        await testDataManager.createTestPosition(testUserId, pos);
      }

      const iterations = 5;
      const responseTimes: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const startTime = performance.now();
        
        const response = await request(app)
          .get('/api/zerodha/portfolio/summary')
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(200);

        const endTime = performance.now();
        const responseTime = endTime - startTime;
        responseTimes.push(responseTime);

        expect(response.body.success).toBe(true);
        expect(response.body.data).toHaveProperty('total_value');
      }

      const avgResponseTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;

      console.log(`Portfolio Calculation Performance:
        Average: ${avgResponseTime.toFixed(2)}ms
        Positions: ${positions.length}`);

      // Portfolio calculations should complete within reasonable time
      expect(avgResponseTime).toBeLessThan(500);
    });

    it('should handle authentication requests efficiently', async () => {
      const iterations = 10;
      const responseTimes: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const startTime = performance.now();
        
        const response = await request(app)
          .post('/api/zerodha/auth/login')
          .send({ user_id: testUserId })
          .expect(200);

        const endTime = performance.now();
        const responseTime = endTime - startTime;
        responseTimes.push(responseTime);

        expect(response.body.success).toBe(true);
      }

      const avgResponseTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;

      console.log(`Authentication Performance:
        Average: ${avgResponseTime.toFixed(2)}ms`);

      // Authentication should be fast
      expect(avgResponseTime).toBeLessThan(100);
    });
  });

  describe('Throughput Testing', () => {
    it('should handle concurrent order requests', async () => {
      const concurrentRequests = 20;
      const startTime = performance.now();

      const promises = Array.from({ length: concurrentRequests }, (_, i) =>
        request(app)
          .post('/api/zerodha/orders')
          .set('Authorization', `Bearer ${accessToken}`)
          .send({
            exchange: 'NSE',
            tradingsymbol: `STOCK${i}`,
            transaction_type: 'BUY',
            quantity: 1,
            product: 'CNC',
            order_type: 'MARKET'
          })
      );

      const responses = await Promise.all(promises);
      const endTime = performance.now();
      const totalTime = endTime - startTime;

      // All requests should succeed
      responses.forEach(response => {
        expect(response.status).toBe(201);
        expect(response.body.success).toBe(true);
      });

      const throughput = (concurrentRequests / totalTime) * 1000; // requests per second

      console.log(`Concurrent Order Throughput:
        Total Time: ${totalTime.toFixed(2)}ms
        Throughput: ${throughput.toFixed(2)} requests/second`);

      // Should handle at least 50 requests per second
      expect(throughput).toBeGreaterThan(50);
    });

    it('should handle concurrent market data requests', async () => {
      const concurrentRequests = 50;
      const startTime = performance.now();

      const promises = Array.from({ length: concurrentRequests }, () =>
        request(app)
          .get('/api/zerodha/market/quotes')
          .query({ instruments: 'NSE:RELIANCE' })
          .set('Authorization', `Bearer ${accessToken}`)
      );

      const responses = await Promise.all(promises);
      const endTime = performance.now();
      const totalTime = endTime - startTime;

      // All requests should succeed
      responses.forEach(response => {
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
      });

      const throughput = (concurrentRequests / totalTime) * 1000;

      console.log(`Market Data Throughput:
        Total Time: ${totalTime.toFixed(2)}ms
        Throughput: ${throughput.toFixed(2)} requests/second`);

      // Market data should have high throughput
      expect(throughput).toBeGreaterThan(100);
    });
  });

  describe('Memory and Resource Usage', () => {
    it('should not have memory leaks during sustained load', async () => {
      const initialMemory = process.memoryUsage();
      const iterations = 100;

      // Perform sustained operations
      for (let i = 0; i < iterations; i++) {
        await request(app)
          .get('/api/zerodha/market/quotes')
          .query({ instruments: 'NSE:RELIANCE' })
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(200);

        // Trigger garbage collection periodically
        if (i % 20 === 0 && global.gc) {
          global.gc();
        }
      }

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }

      const finalMemory = process.memoryUsage();
      const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;
      const memoryIncreasePercent = (memoryIncrease / initialMemory.heapUsed) * 100;

      console.log(`Memory Usage:
        Initial: ${(initialMemory.heapUsed / 1024 / 1024).toFixed(2)} MB
        Final: ${(finalMemory.heapUsed / 1024 / 1024).toFixed(2)} MB
        Increase: ${(memoryIncrease / 1024 / 1024).toFixed(2)} MB (${memoryIncreasePercent.toFixed(2)}%)`);

      // Memory increase should be reasonable (less than 50% increase)
      expect(memoryIncreasePercent).toBeLessThan(50);
    });

    it('should handle large payload requests efficiently', async () => {
      // Create large order batch
      const largeOrderBatch = Array.from({ length: 100 }, (_, i) => ({
        exchange: 'NSE',
        tradingsymbol: `STOCK${i}`,
        transaction_type: 'BUY',
        quantity: 1,
        product: 'CNC',
        order_type: 'MARKET'
      }));

      const startTime = performance.now();

      const response = await request(app)
        .post('/api/zerodha/orders/batch')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ orders: largeOrderBatch })
        .expect(200);

      const endTime = performance.now();
      const responseTime = endTime - startTime;

      console.log(`Large Payload Performance:
        Orders: ${largeOrderBatch.length}
        Response Time: ${responseTime.toFixed(2)}ms`);

      expect(response.body.success).toBe(true);
      expect(responseTime).toBeLessThan(2000); // Should complete within 2 seconds
    });
  });

  describe('Database Performance', () => {
    it('should handle database queries efficiently under load', async () => {
      // Create test data
      const positions = Array.from({ length: 100 }, (_, i) => ({
        tradingsymbol: `STOCK${i}`,
        quantity: Math.floor(Math.random() * 100) + 1,
        average_price: Math.floor(Math.random() * 1000) + 100
      }));

      for (const pos of positions) {
        await testDataManager.createTestPosition(testUserId, pos);
      }

      const iterations = 10;
      const responseTimes: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const startTime = performance.now();
        
        const response = await request(app)
          .get('/api/zerodha/portfolio/positions')
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(200);

        const endTime = performance.now();
        const responseTime = endTime - startTime;
        responseTimes.push(responseTime);

        expect(response.body.data).toHaveLength(100);
      }

      const avgResponseTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;

      console.log(`Database Query Performance:
        Records: ${positions.length}
        Average Response Time: ${avgResponseTime.toFixed(2)}ms`);

      // Database queries should be efficient
      expect(avgResponseTime).toBeLessThan(200);
    });

    it('should handle concurrent database operations', async () => {
      const concurrentOperations = 20;
      const startTime = performance.now();

      const promises = Array.from({ length: concurrentOperations }, (_, i) =>
        testDataManager.createTestPosition(testUserId, {
          tradingsymbol: `CONCURRENT_STOCK${i}`,
          quantity: 10,
          average_price: 1000
        })
      );

      await Promise.all(promises);
      const endTime = performance.now();
      const totalTime = endTime - startTime;

      console.log(`Concurrent Database Operations:
        Operations: ${concurrentOperations}
        Total Time: ${totalTime.toFixed(2)}ms`);

      // Verify all positions were created
      const response = await request(app)
        .get('/api/zerodha/portfolio/positions')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const concurrentPositions = response.body.data.filter((p: any) => 
        p.tradingsymbol.startsWith('CONCURRENT_STOCK')
      );

      expect(concurrentPositions).toHaveLength(concurrentOperations);
      expect(totalTime).toBeLessThan(5000); // Should complete within 5 seconds
    });
  });
});