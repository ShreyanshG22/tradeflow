import request from 'supertest';
import { Express } from 'express';
import { createTestApp } from '../setup/test-app';
import { TestDataManager } from '../setup/test-data-manager';
import { ZerodhaTestClient } from '../setup/zerodha-test-client';

describe('Zerodha Trading End-to-End Flow', () => {
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

  describe('Complete Order Flow', () => {
    it('should execute complete buy-sell cycle with portfolio updates', async () => {
      const testSymbol = 'RELIANCE';
      const quantity = 1;

      // Step 1: Get initial portfolio state
      const initialPortfolio = await request(app)
        .get('/api/zerodha/portfolio/summary')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      // Step 2: Place buy order
      const buyOrderResponse = await request(app)
        .post('/api/zerodha/orders')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          exchange: 'NSE',
          tradingsymbol: testSymbol,
          transaction_type: 'BUY',
          quantity: quantity,
          product: 'CNC',
          order_type: 'MARKET'
        })
        .expect(201);

      expect(buyOrderResponse.body).toMatchObject({
        success: true,
        data: {
          order_id: expect.any(String),
          status: 'OPEN'
        }
      });

      const buyOrderId = buyOrderResponse.body.data.order_id;

      // Step 3: Wait for order execution (simulate)
      await zerodhaClient.simulateOrderExecution(buyOrderId, 'COMPLETE');

      // Step 4: Verify order status
      const orderStatusResponse = await request(app)
        .get(`/api/zerodha/orders/${buyOrderId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(orderStatusResponse.body.data.status).toBe('COMPLETE');
      expect(orderStatusResponse.body.data.filled_quantity).toBe(quantity);

      // Step 5: Verify position created
      const positionsResponse = await request(app)
        .get('/api/zerodha/portfolio/positions')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const position = positionsResponse.body.data.find(
        (p: any) => p.tradingsymbol === testSymbol
      );
      expect(position).toBeDefined();
      expect(position.quantity).toBe(quantity);

      // Step 6: Place sell order
      const sellOrderResponse = await request(app)
        .post('/api/zerodha/orders')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          exchange: 'NSE',
          tradingsymbol: testSymbol,
          transaction_type: 'SELL',
          quantity: quantity,
          product: 'CNC',
          order_type: 'MARKET'
        })
        .expect(201);

      const sellOrderId = sellOrderResponse.body.data.order_id;

      // Step 7: Execute sell order
      await zerodhaClient.simulateOrderExecution(sellOrderId, 'COMPLETE');

      // Step 8: Verify position closed
      const finalPositionsResponse = await request(app)
        .get('/api/zerodha/portfolio/positions')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const finalPosition = finalPositionsResponse.body.data.find(
        (p: any) => p.tradingsymbol === testSymbol
      );
      expect(finalPosition?.quantity || 0).toBe(0);

      // Step 9: Verify P&L calculation
      const pnlResponse = await request(app)
        .get('/api/zerodha/portfolio/pnl')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(pnlResponse.body.data).toMatchObject({
        realised_pnl: expect.any(Number),
        unrealised_pnl: expect.any(Number),
        total_pnl: expect.any(Number)
      });
    });

    it('should handle order modifications correctly', async () => {
      // Place initial order
      const orderResponse = await request(app)
        .post('/api/zerodha/orders')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          exchange: 'NSE',
          tradingsymbol: 'INFY',
          transaction_type: 'BUY',
          quantity: 1,
          product: 'CNC',
          order_type: 'LIMIT',
          price: 1500
        })
        .expect(201);

      const orderId = orderResponse.body.data.order_id;

      // Modify order price
      const modifyResponse = await request(app)
        .put(`/api/zerodha/orders/${orderId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          price: 1450,
          quantity: 2
        })
        .expect(200);

      expect(modifyResponse.body).toMatchObject({
        success: true,
        data: {
          order_id: orderId,
          status: 'OPEN'
        }
      });

      // Verify modification
      const updatedOrderResponse = await request(app)
        .get(`/api/zerodha/orders/${orderId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(updatedOrderResponse.body.data).toMatchObject({
        price: 1450,
        quantity: 2
      });

      // Cancel order
      const cancelResponse = await request(app)
        .delete(`/api/zerodha/orders/${orderId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(cancelResponse.body.success).toBe(true);

      // Verify cancellation
      const cancelledOrderResponse = await request(app)
        .get(`/api/zerodha/orders/${orderId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(cancelledOrderResponse.body.data.status).toBe('CANCELLED');
    });
  });

  describe('Risk Management Integration', () => {
    it('should enforce risk limits during order placement', async () => {
      // Set low risk limits for testing
      await testDataManager.setRiskLimits(testUserId, {
        max_order_value: 1000,
        max_daily_loss: 500,
        max_position_size: 1
      });

      // Try to place order exceeding limits
      const highValueOrderResponse = await request(app)
        .post('/api/zerodha/orders')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          exchange: 'NSE',
          tradingsymbol: 'RELIANCE',
          transaction_type: 'BUY',
          quantity: 100, // High quantity to exceed value limit
          product: 'CNC',
          order_type: 'MARKET'
        })
        .expect(400);

      expect(highValueOrderResponse.body).toMatchObject({
        success: false,
        error: {
          code: 'RISK_LIMIT_EXCEEDED',
          message: expect.stringContaining('order value')
        }
      });

      // Place valid order within limits
      const validOrderResponse = await request(app)
        .post('/api/zerodha/orders')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          exchange: 'NSE',
          tradingsymbol: 'INFY',
          transaction_type: 'BUY',
          quantity: 1,
          product: 'CNC',
          order_type: 'MARKET'
        })
        .expect(201);

      expect(validOrderResponse.body.success).toBe(true);
    });

    it('should monitor portfolio risk in real-time', async () => {
      // Create position that approaches risk limits
      await testDataManager.createTestPosition(testUserId, {
        tradingsymbol: 'RELIANCE',
        quantity: 5,
        average_price: 2500,
        unrealised_pnl: -400 // Close to daily loss limit
      });

      // Check risk status
      const riskStatusResponse = await request(app)
        .get('/api/zerodha/risk/status')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(riskStatusResponse.body.data).toMatchObject({
        risk_level: expect.stringMatching(/^(LOW|MEDIUM|HIGH)$/),
        daily_pnl: expect.any(Number),
        exposure_percentage: expect.any(Number),
        warnings: expect.any(Array)
      });

      // Simulate further loss to trigger risk breach
      await testDataManager.updatePositionPnL(testUserId, 'RELIANCE', -600);

      const breachStatusResponse = await request(app)
        .get('/api/zerodha/risk/status')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(breachStatusResponse.body.data.risk_level).toBe('HIGH');
      expect(breachStatusResponse.body.data.warnings).toContain('DAILY_LOSS_LIMIT_EXCEEDED');
    });
  });

  describe('Error Handling and Recovery', () => {
    it('should handle API failures gracefully', async () => {
      // Simulate Zerodha API failure
      zerodhaClient.simulateApiFailure('orders', 500);

      const orderResponse = await request(app)
        .post('/api/zerodha/orders')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          exchange: 'NSE',
          tradingsymbol: 'INFY',
          transaction_type: 'BUY',
          quantity: 1,
          product: 'CNC',
          order_type: 'MARKET'
        })
        .expect(503);

      expect(orderResponse.body).toMatchObject({
        success: false,
        error: {
          code: 'SERVICE_UNAVAILABLE',
          message: expect.stringContaining('temporarily unavailable')
        }
      });

      // Restore API and retry
      zerodhaClient.restoreApiService('orders');

      const retryResponse = await request(app)
        .post('/api/zerodha/orders')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          exchange: 'NSE',
          tradingsymbol: 'INFY',
          transaction_type: 'BUY',
          quantity: 1,
          product: 'CNC',
          order_type: 'MARKET'
        })
        .expect(201);

      expect(retryResponse.body.success).toBe(true);
    });

    it('should maintain data consistency during failures', async () => {
      // Place order
      const orderResponse = await request(app)
        .post('/api/zerodha/orders')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          exchange: 'NSE',
          tradingsymbol: 'TCS',
          transaction_type: 'BUY',
          quantity: 1,
          product: 'CNC',
          order_type: 'MARKET'
        })
        .expect(201);

      const orderId = orderResponse.body.data.order_id;

      // Simulate database failure during order update
      testDataManager.simulateDatabaseFailure();

      // Try to modify order (should fail but not corrupt data)
      await request(app)
        .put(`/api/zerodha/orders/${orderId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ price: 3000 })
        .expect(500);

      // Restore database
      testDataManager.restoreDatabase();

      // Verify order data is still consistent
      const orderStatusResponse = await request(app)
        .get(`/api/zerodha/orders/${orderId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(orderStatusResponse.body.data).toMatchObject({
        order_id: orderId,
        status: expect.any(String)
      });
    });
  });
});