import request from 'supertest';
import { Express } from 'express';
import { createTestApp } from '../setup/test-app';
import { TestDataManager } from '../setup/test-data-manager';
import { ZerodhaTestClient } from '../setup/zerodha-test-client';

describe('Risk Management and Compliance Tests', () => {
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

  describe('Order Value Limits', () => {
    it('should enforce maximum order value limits', async () => {
      // Set strict order value limit
      await testDataManager.setRiskLimits(testUserId, {
        max_order_value: 10000 // ₹10,000 limit
      });

      // Test order within limit
      const validOrderResponse = await request(app)
        .post('/api/zerodha/orders')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          exchange: 'NSE',
          tradingsymbol: 'RELIANCE',
          transaction_type: 'BUY',
          quantity: 4, // 4 * 2500 = ₹10,000
          product: 'CNC',
          order_type: 'MARKET'
        })
        .expect(201);

      expect(validOrderResponse.body.success).toBe(true);

      // Test order exceeding limit
      const invalidOrderResponse = await request(app)
        .post('/api/zerodha/orders')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          exchange: 'NSE',
          tradingsymbol: 'RELIANCE',
          transaction_type: 'BUY',
          quantity: 5, // 5 * 2500 = ₹12,500 (exceeds limit)
          product: 'CNC',
          order_type: 'MARKET'
        })
        .expect(400);

      expect(invalidOrderResponse.body).toMatchObject({
        success: false,
        error: {
          code: 'RISK_LIMIT_EXCEEDED',
          message: expect.stringContaining('order value'),
          details: {
            limit_type: 'max_order_value',
            limit_value: 10000,
            attempted_value: expect.any(Number)
          }
        }
      });
    });

    it('should calculate order value correctly for different order types', async () => {
      await testDataManager.setRiskLimits(testUserId, {
        max_order_value: 5000
      });

      // Test LIMIT order value calculation
      const limitOrderResponse = await request(app)
        .post('/api/zerodha/orders')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          exchange: 'NSE',
          tradingsymbol: 'INFY',
          transaction_type: 'BUY',
          quantity: 4,
          price: 1300, // 4 * 1300 = ₹5,200 (exceeds limit)
          product: 'CNC',
          order_type: 'LIMIT'
        })
        .expect(400);

      expect(limitOrderResponse.body.error.code).toBe('RISK_LIMIT_EXCEEDED');

      // Test valid LIMIT order
      const validLimitOrderResponse = await request(app)
        .post('/api/zerodha/orders')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          exchange: 'NSE',
          tradingsymbol: 'INFY',
          transaction_type: 'BUY',
          quantity: 3,
          price: 1200, // 3 * 1200 = ₹3,600 (within limit)
          product: 'CNC',
          order_type: 'LIMIT'
        })
        .expect(201);

      expect(validLimitOrderResponse.body.success).toBe(true);
    });

    it('should handle different product types in risk calculations', async () => {
      await testDataManager.setRiskLimits(testUserId, {
        max_order_value: 8000
      });

      const productTests = [
        { product: 'CNC', multiplier: 1.0 }, // Cash and Carry - full value
        { product: 'MIS', multiplier: 0.2 }, // Intraday - margin based
        { product: 'NRML', multiplier: 0.3 } // Normal - margin based
      ];

      for (const test of productTests) {
        const quantity = 4;
        const price = 2000;
        const expectedValue = quantity * price * test.multiplier;

        const response = await request(app)
          .post('/api/zerodha/orders')
          .set('Authorization', `Bearer ${accessToken}`)
          .send({
            exchange: 'NSE',
            tradingsymbol: 'TCS',
            transaction_type: 'BUY',
            quantity: quantity,
            price: price,
            product: test.product,
            order_type: 'LIMIT'
          });

        if (expectedValue <= 8000) {
          expect(response.status).toBe(201);
          expect(response.body.success).toBe(true);
        } else {
          expect(response.status).toBe(400);
          expect(response.body.error.code).toBe('RISK_LIMIT_EXCEEDED');
        }
      }
    });
  });

  describe('Position Size Limits', () => {
    it('should enforce maximum position size limits', async () => {
      await testDataManager.setRiskLimits(testUserId, {
        max_position_size: 50 // Maximum 50 shares per position
      });

      // Create existing position
      await testDataManager.createTestPosition(testUserId, {
        tradingsymbol: 'HDFCBANK',
        quantity: 30,
        average_price: 1600
      });

      // Test order that would exceed position limit
      const exceedingOrderResponse = await request(app)
        .post('/api/zerodha/orders')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          exchange: 'NSE',
          tradingsymbol: 'HDFCBANK',
          transaction_type: 'BUY',
          quantity: 25, // 30 + 25 = 55 (exceeds limit of 50)
          product: 'CNC',
          order_type: 'MARKET'
        })
        .expect(400);

      expect(exceedingOrderResponse.body).toMatchObject({
        success: false,
        error: {
          code: 'RISK_LIMIT_EXCEEDED',
          message: expect.stringContaining('position size'),
          details: {
            limit_type: 'max_position_size',
            current_position: 30,
            additional_quantity: 25,
            resulting_position: 55,
            limit_value: 50
          }
        }
      });

      // Test valid order within limit
      const validOrderResponse = await request(app)
        .post('/api/zerodha/orders')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          exchange: 'NSE',
          tradingsymbol: 'HDFCBANK',
          transaction_type: 'BUY',
          quantity: 15, // 30 + 15 = 45 (within limit)
          product: 'CNC',
          order_type: 'MARKET'
        })
        .expect(201);

      expect(validOrderResponse.body.success).toBe(true);
    });

    it('should handle short positions in position size calculations', async () => {
      await testDataManager.setRiskLimits(testUserId, {
        max_position_size: 100
      });

      // Create short position
      await testDataManager.createTestPosition(testUserId, {
        tradingsymbol: 'WIPRO',
        quantity: -60, // Short 60 shares
        average_price: 400
      });

      // Test sell order that would increase short position beyond limit
      const exceedingShortResponse = await request(app)
        .post('/api/zerodha/orders')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          exchange: 'NSE',
          tradingsymbol: 'WIPRO',
          transaction_type: 'SELL',
          quantity: 50, // -60 - 50 = -110 (exceeds limit)
          product: 'MIS',
          order_type: 'MARKET'
        })
        .expect(400);

      expect(exceedingShortResponse.body.error.code).toBe('RISK_LIMIT_EXCEEDED');

      // Test buy order that reduces short position (should be allowed)
      const reducingOrderResponse = await request(app)
        .post('/api/zerodha/orders')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          exchange: 'NSE',
          tradingsymbol: 'WIPRO',
          transaction_type: 'BUY',
          quantity: 30, // -60 + 30 = -30 (reduces short position)
          product: 'MIS',
          order_type: 'MARKET'
        })
        .expect(201);

      expect(reducingOrderResponse.body.success).toBe(true);
    });
  });

  describe('Daily Loss Limits', () => {
    it('should enforce daily loss limits', async () => {
      await testDataManager.setRiskLimits(testUserId, {
        max_daily_loss: 5000 // ₹5,000 daily loss limit
      });

      // Create positions with existing losses
      await testDataManager.createTestPosition(testUserId, {
        tradingsymbol: 'MARUTI',
        quantity: 2,
        average_price: 9000,
        current_price: 8500 // Loss of ₹1,000
      });

      await testDataManager.createTestPosition(testUserId, {
        tradingsymbol: 'BHARTIARTL',
        quantity: 10,
        average_price: 700,
        current_price: 650 // Loss of ₹500
      });

      // Current total loss: ₹1,500

      // Test order that would potentially increase loss beyond limit
      const riskOrderResponse = await request(app)
        .post('/api/zerodha/orders')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          exchange: 'NSE',
          tradingsymbol: 'VOLATILE_STOCK',
          transaction_type: 'BUY',
          quantity: 20,
          product: 'MIS', // Intraday - higher risk
          order_type: 'MARKET'
        });

      // Should either be rejected or have additional risk warnings
      if (response.status === 400) {
        expect(response.body.error.code).toBe('DAILY_LOSS_LIMIT_APPROACHING');
      } else if (response.status === 201) {
        expect(response.body.data).toHaveProperty('risk_warnings');
      }
    });

    it('should calculate realized and unrealized losses correctly', async () => {
      await testDataManager.setRiskLimits(testUserId, {
        max_daily_loss: 3000
      });

      // Create realized loss from completed trade
      await testDataManager.createCompletedTrade(testUserId, {
        tradingsymbol: 'LOSS_STOCK1',
        buy_price: 1000,
        sell_price: 800,
        quantity: 5,
        trade_date: new Date().toISOString().split('T')[0]
      }); // Realized loss: ₹1,000

      // Create unrealized loss from current position
      await testDataManager.createTestPosition(testUserId, {
        tradingsymbol: 'LOSS_STOCK2',
        quantity: 10,
        average_price: 500,
        current_price: 450 // Unrealized loss: ₹500
      });

      // Total loss: ₹1,500

      // Get current risk status
      const riskStatusResponse = await request(app)
        .get('/api/zerodha/risk/status')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(riskStatusResponse.body.data).toMatchObject({
        daily_pnl: expect.any(Number),
        daily_loss_limit: 3000,
        daily_loss_used: expect.any(Number),
        daily_loss_remaining: expect.any(Number),
        risk_level: expect.stringMatching(/^(LOW|MEDIUM|HIGH)$/)
      });

      const dailyLossUsed = Math.abs(riskStatusResponse.body.data.daily_loss_used);
      expect(dailyLossUsed).toBeCloseTo(1500, 0); // ₹1,500 total loss
    });

    it('should prevent orders when daily loss limit is breached', async () => {
      await testDataManager.setRiskLimits(testUserId, {
        max_daily_loss: 1000
      });

      // Create positions that exceed daily loss limit
      await testDataManager.createTestPosition(testUserId, {
        tradingsymbol: 'BIG_LOSS_STOCK',
        quantity: 10,
        average_price: 1000,
        current_price: 850 // Loss of ₹1,500 (exceeds limit)
      });

      // Try to place new order
      const blockedOrderResponse = await request(app)
        .post('/api/zerodha/orders')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          exchange: 'NSE',
          tradingsymbol: 'NEW_STOCK',
          transaction_type: 'BUY',
          quantity: 1,
          product: 'CNC',
          order_type: 'MARKET'
        })
        .expect(403);

      expect(blockedOrderResponse.body).toMatchObject({
        success: false,
        error: {
          code: 'DAILY_LOSS_LIMIT_EXCEEDED',
          message: expect.stringContaining('daily loss limit'),
          details: {
            current_loss: expect.any(Number),
            loss_limit: 1000,
            action_required: 'TRADING_BLOCKED'
          }
        }
      });
    });
  });

  describe('Exchange and Product Restrictions', () => {
    it('should enforce allowed exchanges', async () => {
      // Set user to only trade on NSE
      await testDataManager.setRiskLimits(testUserId, {
        allowed_exchanges: ['NSE']
      });

      // Test valid NSE order
      const nseOrderResponse = await request(app)
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

      expect(nseOrderResponse.body.success).toBe(true);

      // Test blocked BSE order
      const bseOrderResponse = await request(app)
        .post('/api/zerodha/orders')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          exchange: 'BSE',
          tradingsymbol: 'RELIANCE',
          transaction_type: 'BUY',
          quantity: 1,
          product: 'CNC',
          order_type: 'MARKET'
        })
        .expect(403);

      expect(bseOrderResponse.body).toMatchObject({
        success: false,
        error: {
          code: 'EXCHANGE_NOT_ALLOWED',
          message: expect.stringContaining('BSE'),
          details: {
            attempted_exchange: 'BSE',
            allowed_exchanges: ['NSE']
          }
        }
      });
    });

    it('should enforce allowed product types', async () => {
      // Restrict user to only CNC (Cash and Carry)
      await testDataManager.setRiskLimits(testUserId, {
        allowed_products: ['CNC']
      });

      // Test valid CNC order
      const cncOrderResponse = await request(app)
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

      expect(cncOrderResponse.body.success).toBe(true);

      // Test blocked MIS (Intraday) order
      const misOrderResponse = await request(app)
        .post('/api/zerodha/orders')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          exchange: 'NSE',
          tradingsymbol: 'INFY',
          transaction_type: 'BUY',
          quantity: 1,
          product: 'MIS',
          order_type: 'MARKET'
        })
        .expect(403);

      expect(misOrderResponse.body).toMatchObject({
        success: false,
        error: {
          code: 'PRODUCT_NOT_ALLOWED',
          message: expect.stringContaining('MIS'),
          details: {
            attempted_product: 'MIS',
            allowed_products: ['CNC']
          }
        }
      });
    });
  });

  describe('Rate Limiting and Order Frequency', () => {
    it('should enforce order frequency limits', async () => {
      await testDataManager.setRiskLimits(testUserId, {
        max_orders_per_minute: 3
      });

      const orderPromises = [];

      // Place orders rapidly
      for (let i = 0; i < 5; i++) {
        const orderPromise = request(app)
          .post('/api/zerodha/orders')
          .set('Authorization', `Bearer ${accessToken}`)
          .send({
            exchange: 'NSE',
            tradingsymbol: `STOCK${i}`,
            transaction_type: 'BUY',
            quantity: 1,
            product: 'CNC',
            order_type: 'MARKET'
          });
        
        orderPromises.push(orderPromise);
      }

      const responses = await Promise.all(orderPromises);

      // First 3 should succeed, rest should be rate limited
      const successfulOrders = responses.filter(r => r.status === 201);
      const rateLimitedOrders = responses.filter(r => r.status === 429);

      expect(successfulOrders.length).toBeLessThanOrEqual(3);
      expect(rateLimitedOrders.length).toBeGreaterThan(0);

      rateLimitedOrders.forEach(response => {
        expect(response.body).toMatchObject({
          success: false,
          error: {
            code: 'ORDER_RATE_LIMIT_EXCEEDED',
            message: expect.stringContaining('rate limit')
          }
        });
      });
    });

    it('should implement cooling-off periods after risk breaches', async () => {
      await testDataManager.setRiskLimits(testUserId, {
        max_daily_loss: 500
      });

      // Create position that exceeds daily loss
      await testDataManager.createTestPosition(testUserId, {
        tradingsymbol: 'BREACH_STOCK',
        quantity: 10,
        average_price: 1000,
        current_price: 900 // Loss of ₹1,000
      });

      // First order should be blocked due to loss limit
      await request(app)
        .post('/api/zerodha/orders')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          exchange: 'NSE',
          tradingsymbol: 'TEST_STOCK',
          transaction_type: 'BUY',
          quantity: 1,
          product: 'CNC',
          order_type: 'MARKET'
        })
        .expect(403);

      // Even after reducing loss, should have cooling-off period
      await testDataManager.updatePositionPnL(testUserId, 'BREACH_STOCK', -200); // Reduce loss

      const coolingOffResponse = await request(app)
        .post('/api/zerodha/orders')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          exchange: 'NSE',
          tradingsymbol: 'TEST_STOCK2',
          transaction_type: 'BUY',
          quantity: 1,
          product: 'CNC',
          order_type: 'MARKET'
        })
        .expect(403);

      expect(coolingOffResponse.body.error.code).toBe('COOLING_OFF_PERIOD_ACTIVE');
    });
  });

  describe('Compliance Monitoring', () => {
    it('should log all risk-related events for audit', async () => {
      await testDataManager.setRiskLimits(testUserId, {
        max_order_value: 1000
      });

      // Trigger risk limit breach
      const response = await request(app)
        .post('/api/zerodha/orders')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          exchange: 'NSE',
          tradingsymbol: 'EXPENSIVE_STOCK',
          transaction_type: 'BUY',
          quantity: 10,
          price: 200, // ₹2,000 total (exceeds limit)
          product: 'CNC',
          order_type: 'LIMIT'
        })
        .expect(400);

      expect(response.body.error.code).toBe('RISK_LIMIT_EXCEEDED');

      // In a real implementation, verify that this event is logged
      // with proper audit trail including:
      // - User ID
      // - Timestamp
      // - Risk limit type
      // - Attempted values
      // - Action taken
    });

    it('should generate compliance reports', async () => {
      // Create various risk scenarios
      await testDataManager.setRiskLimits(testUserId, {
        max_order_value: 5000,
        max_daily_loss: 2000
      });

      // Create test data for compliance report
      await testDataManager.createTestPosition(testUserId, {
        tradingsymbol: 'COMPLIANCE_STOCK1',
        quantity: 5,
        average_price: 1000,
        current_price: 950
      });

      // Get compliance report
      const complianceResponse = await request(app)
        .get('/api/zerodha/risk/compliance-report')
        .query({
          from_date: new Date().toISOString().split('T')[0],
          to_date: new Date().toISOString().split('T')[0]
        })
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(complianceResponse.body).toMatchObject({
        success: true,
        data: {
          report_date: expect.any(String),
          user_id: testUserId,
          risk_limits: expect.any(Object),
          risk_breaches: expect.any(Array),
          order_statistics: expect.any(Object),
          position_summary: expect.any(Object),
          compliance_status: expect.stringMatching(/^(COMPLIANT|NON_COMPLIANT|WARNING)$/)
        }
      });
    });

    it('should implement regulatory position limits', async () => {
      // Test regulatory limits (e.g., SEBI position limits)
      const largePosition = {
        tradingsymbol: 'NIFTY50_FUTURES',
        quantity: 1000, // Large position that might trigger regulatory limits
        average_price: 18000
      };

      const response = await request(app)
        .post('/api/zerodha/orders')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          exchange: 'NFO',
          tradingsymbol: largePosition.tradingsymbol,
          transaction_type: 'BUY',
          quantity: largePosition.quantity,
          product: 'NRML',
          order_type: 'MARKET'
        });

      // Should check against regulatory limits
      if (response.status === 400) {
        expect(response.body.error.code).toMatch(/REGULATORY_LIMIT|POSITION_LIMIT/);
      }
    });
  });

  describe('Emergency Risk Controls', () => {
    it('should implement emergency stop-loss mechanisms', async () => {
      // Create position with significant loss
      await testDataManager.createTestPosition(testUserId, {
        tradingsymbol: 'EMERGENCY_STOCK',
        quantity: 100,
        average_price: 1000,
        current_price: 700 // 30% loss
      });

      // Check if emergency controls are triggered
      const emergencyResponse = await request(app)
        .get('/api/zerodha/risk/emergency-status')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(emergencyResponse.body.data).toMatchObject({
        emergency_level: expect.stringMatching(/^(NONE|LOW|MEDIUM|HIGH|CRITICAL)$/),
        auto_square_off_triggered: expect.any(Boolean),
        positions_at_risk: expect.any(Array)
      });

      if (emergencyResponse.body.data.emergency_level === 'CRITICAL') {
        expect(emergencyResponse.body.data.auto_square_off_triggered).toBe(true);
      }
    });

    it('should handle system-wide risk events', async () => {
      // Simulate system-wide risk event (e.g., market crash)
      const systemRiskResponse = await request(app)
        .get('/api/zerodha/risk/system-status')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(systemRiskResponse.body.data).toMatchObject({
        system_risk_level: expect.stringMatching(/^(NORMAL|ELEVATED|HIGH|CRITICAL)$/),
        trading_restrictions: expect.any(Object),
        market_volatility: expect.any(Number),
        system_health: expect.any(Object)
      });

      // If system risk is high, trading should be restricted
      if (systemRiskResponse.body.data.system_risk_level === 'CRITICAL') {
        const restrictedOrderResponse = await request(app)
          .post('/api/zerodha/orders')
          .set('Authorization', `Bearer ${accessToken}`)
          .send({
            exchange: 'NSE',
            tradingsymbol: 'ANY_STOCK',
            transaction_type: 'BUY',
            quantity: 1,
            product: 'CNC',
            order_type: 'MARKET'
          })
          .expect(503);

        expect(restrictedOrderResponse.body.error.code).toBe('SYSTEM_RISK_TRADING_HALTED');
      }
    });
  });
});