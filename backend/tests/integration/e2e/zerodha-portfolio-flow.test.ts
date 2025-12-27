import request from 'supertest';
import { Express } from 'express';
import { createTestApp } from '../setup/test-app';
import { TestDataManager } from '../setup/test-data-manager';
import { ZerodhaTestClient } from '../setup/zerodha-test-client';

describe('Zerodha Portfolio End-to-End Flow', () => {
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

  describe('Portfolio Calculations and Updates', () => {
    it('should calculate portfolio values accurately with real-time updates', async () => {
      // Create test positions
      const positions = [
        {
          tradingsymbol: 'RELIANCE',
          exchange: 'NSE',
          quantity: 10,
          average_price: 2500,
          current_price: 2550
        },
        {
          tradingsymbol: 'INFY',
          exchange: 'NSE',
          quantity: 5,
          average_price: 1400,
          current_price: 1380
        },
        {
          tradingsymbol: 'TCS',
          exchange: 'NSE',
          quantity: -3, // Short position
          average_price: 3200,
          current_price: 3180
        }
      ];

      // Create positions in database
      for (const pos of positions) {
        await testDataManager.createTestPosition(testUserId, pos);
      }

      // Get portfolio summary
      const summaryResponse = await request(app)
        .get('/api/zerodha/portfolio/summary')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(summaryResponse.body).toMatchObject({
        success: true,
        data: {
          total_value: expect.any(Number),
          day_change: expect.any(Number),
          day_change_percent: expect.any(Number),
          total_pnl: expect.any(Number),
          unrealised_pnl: expect.any(Number),
          realised_pnl: expect.any(Number)
        }
      });

      const summary = summaryResponse.body.data;

      // Calculate expected values
      const expectedUnrealisedPnL = 
        (10 * (2550 - 2500)) + // RELIANCE: +500
        (5 * (1380 - 1400)) +  // INFY: -100
        (-3 * (3180 - 3200));  // TCS: +60 (short position)
      
      expect(summary.unrealised_pnl).toBeCloseTo(expectedUnrealisedPnL, 2);

      // Get detailed positions
      const positionsResponse = await request(app)
        .get('/api/zerodha/portfolio/positions')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const positionData = positionsResponse.body.data;
      expect(positionData).toHaveLength(3);

      // Verify individual position calculations
      const reliancePos = positionData.find((p: any) => p.tradingsymbol === 'RELIANCE');
      expect(reliancePos).toMatchObject({
        tradingsymbol: 'RELIANCE',
        quantity: 10,
        average_price: 2500,
        last_price: 2550,
        unrealised_pnl: 500,
        pnl_percent: 2.0
      });

      const infyPos = positionData.find((p: any) => p.tradingsymbol === 'INFY');
      expect(infyPos).toMatchObject({
        tradingsymbol: 'INFY',
        quantity: 5,
        average_price: 1400,
        last_price: 1380,
        unrealised_pnl: -100,
        pnl_percent: -1.43
      });

      // Test real-time updates
      // Simulate price change
      await zerodhaClient.updateMarketPrice('NSE:RELIANCE', 2600);

      // Wait for price update propagation
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Get updated portfolio
      const updatedSummaryResponse = await request(app)
        .get('/api/zerodha/portfolio/summary')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const updatedSummary = updatedSummaryResponse.body.data;
      
      // Unrealised P&L should reflect new price
      const expectedUpdatedPnL = 
        (10 * (2600 - 2500)) + // RELIANCE: +1000 (price increased)
        (5 * (1380 - 1400)) +  // INFY: -100 (unchanged)
        (-3 * (3180 - 3200));  // TCS: +60 (unchanged)

      expect(updatedSummary.unrealised_pnl).toBeCloseTo(expectedUpdatedPnL, 2);
    });

    it('should handle holdings and long-term investments correctly', async () => {
      // Create test holdings (long-term positions)
      const holdings = [
        {
          tradingsymbol: 'HDFCBANK',
          exchange: 'NSE',
          quantity: 20,
          average_price: 1500,
          current_price: 1650,
          purchase_date: '2023-01-15'
        },
        {
          tradingsymbol: 'ICICIBANK',
          exchange: 'NSE',
          quantity: 15,
          average_price: 800,
          current_price: 850,
          purchase_date: '2023-03-20'
        }
      ];

      for (const holding of holdings) {
        await testDataManager.createTestHolding(testUserId, holding);
      }

      // Get holdings data
      const holdingsResponse = await request(app)
        .get('/api/zerodha/portfolio/holdings')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(holdingsResponse.body).toMatchObject({
        success: true,
        data: expect.arrayContaining([
          expect.objectContaining({
            tradingsymbol: 'HDFCBANK',
            quantity: 20,
            average_price: 1500,
            last_price: 1650,
            pnl: 3000, // 20 * (1650 - 1500)
            pnl_percent: 10.0,
            day_change: expect.any(Number),
            day_change_percent: expect.any(Number)
          }),
          expect.objectContaining({
            tradingsymbol: 'ICICIBANK',
            quantity: 15,
            average_price: 800,
            last_price: 850,
            pnl: 750, // 15 * (850 - 800)
            pnl_percent: 6.25
          })
        ])
      });

      // Verify total holdings value
      const totalHoldingsValue = (20 * 1650) + (15 * 850);
      const totalInvestment = (20 * 1500) + (15 * 800);
      const totalPnL = totalHoldingsValue - totalInvestment;

      const holdingsData = holdingsResponse.body.data;
      const calculatedTotal = holdingsData.reduce((sum: number, h: any) => sum + h.pnl, 0);
      
      expect(calculatedTotal).toBeCloseTo(totalPnL, 2);
    });

    it('should provide comprehensive P&L analysis and breakdowns', async () => {
      // Create mixed portfolio with realized and unrealized P&L
      await testDataManager.createTestPosition(testUserId, {
        tradingsymbol: 'WIPRO',
        quantity: 8,
        average_price: 400,
        current_price: 420
      });

      // Create some realized P&L from completed trades
      await testDataManager.createCompletedTrade(testUserId, {
        tradingsymbol: 'BHARTIARTL',
        buy_price: 700,
        sell_price: 750,
        quantity: 10,
        trade_date: '2024-01-15'
      });

      await testDataManager.createCompletedTrade(testUserId, {
        tradingsymbol: 'MARUTI',
        buy_price: 9000,
        sell_price: 8800,
        quantity: 2,
        trade_date: '2024-01-20'
      });

      // Get comprehensive P&L analysis
      const pnlResponse = await request(app)
        .get('/api/zerodha/portfolio/pnl')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(pnlResponse.body).toMatchObject({
        success: true,
        data: {
          total_pnl: expect.any(Number),
          unrealised_pnl: expect.any(Number),
          realised_pnl: expect.any(Number),
          day_pnl: expect.any(Number),
          breakdown: {
            by_symbol: expect.any(Object),
            by_exchange: expect.any(Object),
            by_product: expect.any(Object)
          },
          performance_metrics: {
            win_rate: expect.any(Number),
            avg_win: expect.any(Number),
            avg_loss: expect.any(Number),
            profit_factor: expect.any(Number)
          }
        }
      });

      const pnlData = pnlResponse.body.data;

      // Verify calculations
      const expectedUnrealisedPnL = 8 * (420 - 400); // WIPRO: +160
      const expectedRealisedPnL = (10 * (750 - 700)) + (2 * (8800 - 9000)); // +500 - 400 = +100

      expect(pnlData.unrealised_pnl).toBeCloseTo(expectedUnrealisedPnL, 2);
      expect(pnlData.realised_pnl).toBeCloseTo(expectedRealisedPnL, 2);
      expect(pnlData.total_pnl).toBeCloseTo(expectedUnrealisedPnL + expectedRealisedPnL, 2);

      // Verify performance metrics
      expect(pnlData.performance_metrics.win_rate).toBe(50); // 1 win out of 2 trades
      expect(pnlData.performance_metrics.avg_win).toBe(500);
      expect(pnlData.performance_metrics.avg_loss).toBe(-400);

      // Verify breakdown structure
      expect(pnlData.breakdown.by_symbol).toHaveProperty('WIPRO');
      expect(pnlData.breakdown.by_symbol).toHaveProperty('BHARTIARTL');
      expect(pnlData.breakdown.by_symbol).toHaveProperty('MARUTI');
    });

    it('should handle margin calculations and requirements', async () => {
      // Create positions requiring margin
      await testDataManager.createTestPosition(testUserId, {
        tradingsymbol: 'RELIANCE',
        quantity: 100,
        average_price: 2500,
        product: 'MIS' // Intraday product requiring margin
      });

      await testDataManager.createTestPosition(testUserId, {
        tradingsymbol: 'NIFTY24FEB18000CE',
        quantity: 50,
        average_price: 100,
        product: 'NRML' // Options requiring margin
      });

      // Get margin information
      const marginResponse = await request(app)
        .get('/api/zerodha/portfolio/margins')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(marginResponse.body).toMatchObject({
        success: true,
        data: {
          equity: {
            available: expect.any(Number),
            utilised: expect.any(Number),
            total: expect.any(Number)
          },
          commodity: {
            available: expect.any(Number),
            utilised: expect.any(Number),
            total: expect.any(Number)
          },
          total_margin_used: expect.any(Number),
          margin_utilisation_percent: expect.any(Number),
          positions: expect.arrayContaining([
            expect.objectContaining({
              tradingsymbol: expect.any(String),
              margin_required: expect.any(Number),
              margin_used: expect.any(Number)
            })
          ])
        }
      });

      const marginData = marginResponse.body.data;

      // Verify margin calculations
      expect(marginData.total_margin_used).toBeGreaterThan(0);
      expect(marginData.margin_utilisation_percent).toBeGreaterThanOrEqual(0);
      expect(marginData.margin_utilisation_percent).toBeLessThanOrEqual(100);

      // Verify position-wise margin breakdown
      const relianceMargin = marginData.positions.find((p: any) => p.tradingsymbol === 'RELIANCE');
      expect(relianceMargin).toBeDefined();
      expect(relianceMargin.margin_required).toBeGreaterThan(0);
    });
  });

  describe('Portfolio Performance Analytics', () => {
    it('should provide detailed performance analytics and metrics', async () => {
      // Create historical portfolio data
      const historicalTrades = [
        { symbol: 'RELIANCE', pnl: 1000, date: '2024-01-01' },
        { symbol: 'INFY', pnl: -500, date: '2024-01-05' },
        { symbol: 'TCS', pnl: 750, date: '2024-01-10' },
        { symbol: 'HDFCBANK', pnl: -200, date: '2024-01-15' },
        { symbol: 'ICICIBANK', pnl: 300, date: '2024-01-20' }
      ];

      for (const trade of historicalTrades) {
        await testDataManager.createHistoricalTrade(testUserId, trade);
      }

      // Get performance analytics
      const analyticsResponse = await request(app)
        .get('/api/zerodha/portfolio/analytics')
        .query({
          from_date: '2024-01-01',
          to_date: '2024-01-31'
        })
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(analyticsResponse.body).toMatchObject({
        success: true,
        data: {
          summary: {
            total_trades: 5,
            winning_trades: 3,
            losing_trades: 2,
            win_rate: 60,
            total_pnl: 1350,
            avg_pnl_per_trade: 270,
            best_trade: 1000,
            worst_trade: -500
          },
          risk_metrics: {
            sharpe_ratio: expect.any(Number),
            max_drawdown: expect.any(Number),
            volatility: expect.any(Number),
            var_95: expect.any(Number) // Value at Risk
          },
          monthly_performance: expect.any(Array),
          sector_allocation: expect.any(Object),
          top_performers: expect.any(Array),
          worst_performers: expect.any(Array)
        }
      });

      const analytics = analyticsResponse.body.data;

      // Verify calculations
      expect(analytics.summary.total_pnl).toBe(1350);
      expect(analytics.summary.win_rate).toBe(60);
      expect(analytics.summary.avg_pnl_per_trade).toBe(270);

      // Verify risk metrics are reasonable
      expect(analytics.risk_metrics.max_drawdown).toBeLessThanOrEqual(0);
      expect(analytics.risk_metrics.volatility).toBeGreaterThan(0);
    });

    it('should track portfolio composition and diversification', async () => {
      // Create diversified portfolio
      const positions = [
        { symbol: 'RELIANCE', sector: 'Energy', weight: 25 },
        { symbol: 'INFY', sector: 'IT', weight: 20 },
        { symbol: 'HDFCBANK', sector: 'Banking', weight: 15 },
        { symbol: 'BHARTIARTL', sector: 'Telecom', weight: 10 },
        { symbol: 'ASIANPAINT', sector: 'Consumer', weight: 10 },
        { symbol: 'MARUTI', sector: 'Auto', weight: 10 },
        { symbol: 'DRREDDY', sector: 'Pharma', weight: 10 }
      ];

      for (const pos of positions) {
        await testDataManager.createTestPosition(testUserId, {
          tradingsymbol: pos.symbol,
          quantity: pos.weight, // Using weight as quantity for simplicity
          average_price: 1000,
          sector: pos.sector
        });
      }

      // Get portfolio composition
      const compositionResponse = await request(app)
        .get('/api/zerodha/portfolio/composition')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(compositionResponse.body).toMatchObject({
        success: true,
        data: {
          by_sector: expect.any(Object),
          by_market_cap: expect.any(Object),
          by_exchange: expect.any(Object),
          concentration_risk: {
            top_5_holdings_percent: expect.any(Number),
            herfindahl_index: expect.any(Number),
            diversification_score: expect.any(Number)
          },
          allocation_summary: {
            equity_percent: expect.any(Number),
            cash_percent: expect.any(Number),
            derivatives_percent: expect.any(Number)
          }
        }
      });

      const composition = compositionResponse.body.data;

      // Verify sector allocation
      expect(composition.by_sector).toHaveProperty('Energy');
      expect(composition.by_sector).toHaveProperty('IT');
      expect(composition.by_sector).toHaveProperty('Banking');

      // Verify concentration metrics
      expect(composition.concentration_risk.top_5_holdings_percent).toBeLessThanOrEqual(100);
      expect(composition.concentration_risk.diversification_score).toBeGreaterThan(0);
    });
  });

  describe('Real-time Portfolio Updates', () => {
    it('should update portfolio values in real-time with market movements', async () => {
      // Create test position
      await testDataManager.createTestPosition(testUserId, {
        tradingsymbol: 'RELIANCE',
        quantity: 10,
        average_price: 2500
      });

      // Get initial portfolio value
      const initialResponse = await request(app)
        .get('/api/zerodha/portfolio/summary')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const initialValue = initialResponse.body.data.total_value;

      // Simulate market price changes
      const priceUpdates = [2520, 2540, 2530, 2560];
      
      for (const price of priceUpdates) {
        await zerodhaClient.updateMarketPrice('NSE:RELIANCE', price);
        
        // Wait for update propagation
        await new Promise(resolve => setTimeout(resolve, 500));

        const updatedResponse = await request(app)
          .get('/api/zerodha/portfolio/summary')
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(200);

        const updatedValue = updatedResponse.body.data.total_value;
        const expectedChange = 10 * (price - 2500); // Position quantity * price change
        
        // Verify portfolio value reflects price change
        expect(updatedValue - initialValue).toBeCloseTo(expectedChange, 2);
      }
    });

    it('should handle multiple concurrent portfolio updates correctly', async () => {
      // Create multiple positions
      const symbols = ['RELIANCE', 'INFY', 'TCS', 'HDFCBANK'];
      
      for (const symbol of symbols) {
        await testDataManager.createTestPosition(testUserId, {
          tradingsymbol: symbol,
          quantity: 5,
          average_price: 1000
        });
      }

      // Simulate concurrent price updates
      const updatePromises = symbols.map((symbol, index) => 
        zerodhaClient.updateMarketPrice(`NSE:${symbol}`, 1000 + (index * 10))
      );

      await Promise.all(updatePromises);

      // Wait for all updates to propagate
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Verify portfolio reflects all updates
      const portfolioResponse = await request(app)
        .get('/api/zerodha/portfolio/positions')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const positions = portfolioResponse.body.data;
      
      symbols.forEach((symbol, index) => {
        const position = positions.find((p: any) => p.tradingsymbol === symbol);
        expect(position).toBeDefined();
        expect(position.last_price).toBe(1000 + (index * 10));
        expect(position.unrealised_pnl).toBe(5 * (index * 10)); // 5 shares * price change
      });
    });
  });
});