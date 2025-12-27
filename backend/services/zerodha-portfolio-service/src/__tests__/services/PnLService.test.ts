import { PnLService } from '../../services/PnLService';
import { DatabaseService } from '../../services/DatabaseService';

describe('PnLService', () => {
  let pnlService: PnLService;
  const testUserId = 'test-user-789';

  beforeEach(() => {
    pnlService = new PnLService(testUserId);
  });

  describe('calculateRealizedPnL', () => {
    beforeEach(async () => {
      // Create test portfolio
      const portfolioResult = await DatabaseService.query(
        `INSERT INTO trading.portfolios (user_id, name, portfolio_type, base_currency)
         VALUES ($1, 'Test Portfolio', 'trading', 'INR') RETURNING id`,
        [testUserId]
      );
      const portfolioId = portfolioResult.rows[0].id;

      // Insert test trades with different dates
      await DatabaseService.query(
        `INSERT INTO trading.trades (
          portfolio_id, symbol, side, quantity, price, total_amount, 
          status, executed_at
        ) VALUES 
        ($1, 'PNLTEST1', 'buy', 10, 1000.00, 10000.00, 'filled', '2024-01-15 10:00:00'),
        ($1, 'PNLTEST1', 'sell', 5, 1200.00, 6000.00, 'filled', '2024-01-20 14:00:00'),
        ($1, 'PNLTEST2', 'buy', 20, 500.00, 10000.00, 'filled', '2024-01-10 09:00:00'),
        ($1, 'PNLTEST2', 'sell', 10, 450.00, 4500.00, 'filled', '2024-01-25 11:00:00')`,
        [portfolioId]
      );
    });

    it('should calculate realized P&L correctly for the current year', async () => {
      const realizedPnL = await pnlService.calculateRealizedPnL();
      
      // PNLTEST1: (1200 - 1000) * 5 = 1000 profit
      // PNLTEST2: (450 - 500) * 10 = -500 loss
      // Total: 1000 - 500 = 500
      expect(realizedPnL).toBeCloseTo(500.00, 2);
    });

    it('should calculate realized P&L for specific date range', async () => {
      const startDate = new Date('2024-01-18');
      const endDate = new Date('2024-01-22');
      
      const realizedPnL = await pnlService.calculateRealizedPnL(startDate, endDate);
      
      // Only PNLTEST1 sell trade falls in this range: (1200 - 1000) * 5 = 1000
      expect(realizedPnL).toBeCloseTo(1000.00, 2);
    });
  });

  describe('calculateUnrealizedPnL', () => {
    beforeEach(async () => {
      // Insert test positions and holdings
      await DatabaseService.query(
        `INSERT INTO zerodha_positions (
          user_id, tradingsymbol, exchange, quantity, average_price, 
          last_price, unrealised, position_date, product, instrument_token
        ) VALUES 
        ($1, 'POS1', 'NSE', 10, 1000.00, 1100.00, 1000.00, CURRENT_DATE, 'CNC', 111111),
        ($1, 'POS2', 'NSE', -5, 2000.00, 1900.00, 500.00, CURRENT_DATE, 'MIS', 222222)`,
        [testUserId]
      );

      await DatabaseService.query(
        `INSERT INTO zerodha_holdings (
          user_id, tradingsymbol, exchange, instrument_token, isin, product,
          quantity, average_price, last_price
        ) VALUES 
        ($1, 'HOLD1', 'NSE', 333333, 'INE333A33333', 'CNC', 20, 500.00, 550.00),
        ($1, 'HOLD2', 'BSE', 444444, 'INE444A44444', 'CNC', 15, 800.00, 750.00)`,
        [testUserId]
      );
    });

    it('should calculate unrealized P&L correctly', async () => {
      const unrealizedPnL = await pnlService.calculateUnrealizedPnL();
      
      // Positions: 1000 + 500 = 1500
      // Holdings: (550-500)*20 + (750-800)*15 = 1000 - 750 = 250
      // Total: 1500 + 250 = 1750
      expect(unrealizedPnL).toBeCloseTo(1750.00, 2);
    });
  });

  describe('calculateDayPnL', () => {
    beforeEach(async () => {
      await DatabaseService.query(
        `INSERT INTO zerodha_positions (
          user_id, tradingsymbol, exchange, quantity, pnl, position_date, 
          product, instrument_token, average_price, last_price
        ) VALUES 
        ($1, 'DAYPOS1', 'NSE', 10, 500.00, CURRENT_DATE, 'CNC', 111111, 1000.00, 1050.00),
        ($1, 'DAYPOS2', 'NSE', -5, -200.00, CURRENT_DATE, 'MIS', 222222, 2000.00, 2040.00)`,
        [testUserId]
      );

      await DatabaseService.query(
        `INSERT INTO zerodha_holdings (
          user_id, tradingsymbol, exchange, instrument_token, isin, product,
          quantity, average_price, last_price, day_change
        ) VALUES 
        ($1, 'DAYHOLD1', 'NSE', 333333, 'INE333A33333', 'CNC', 20, 500.00, 520.00, 400.00),
        ($1, 'DAYHOLD2', 'BSE', 444444, 'INE444A44444', 'CNC', 10, 1000.00, 980.00, -200.00)`,
        [testUserId]
      );
    });

    it('should calculate day P&L correctly', async () => {
      const dayPnL = await pnlService.calculateDayPnL();
      
      // Positions: 500 + (-200) = 300
      // Holdings: 400 + (-200) = 200
      // Total: 300 + 200 = 500
      expect(dayPnL).toBeCloseTo(500.00, 2);
    });
  });

  describe('getPnLBreakdown', () => {
    beforeEach(async () => {
      // Setup test data for comprehensive P&L calculation
      const portfolioResult = await DatabaseService.query(
        `INSERT INTO trading.portfolios (user_id, name, portfolio_type, base_currency)
         VALUES ($1, 'Test Portfolio', 'trading', 'INR') RETURNING id`,
        [testUserId]
      );
      const portfolioId = portfolioResult.rows[0].id;

      // Insert trades for realized P&L
      await DatabaseService.query(
        `INSERT INTO trading.trades (
          portfolio_id, symbol, side, quantity, price, total_amount, 
          status, executed_at
        ) VALUES 
        ($1, 'BREAKDOWN1', 'buy', 10, 1000.00, 10000.00, 'filled', NOW() - INTERVAL '5 days'),
        ($1, 'BREAKDOWN1', 'sell', 5, 1100.00, 5500.00, 'filled', NOW() - INTERVAL '2 days')`,
        [portfolioId]
      );

      // Insert positions for unrealized P&L
      await DatabaseService.query(
        `INSERT INTO zerodha_positions (
          user_id, tradingsymbol, exchange, quantity, unrealised, pnl, position_date, 
          product, instrument_token, average_price, last_price
        ) VALUES ($1, 'BREAKDOWN2', 'NSE', 8, 800.00, 400.00, CURRENT_DATE, 'CNC', 111111, 1000.00, 1100.00)`,
        [testUserId]
      );

      // Insert holdings
      await DatabaseService.query(
        `INSERT INTO zerodha_holdings (
          user_id, tradingsymbol, exchange, instrument_token, isin, product,
          quantity, average_price, last_price, pnl, day_change
        ) VALUES ($1, 'BREAKDOWN3', 'NSE', 222222, 'INE222A22222', 'CNC', 10, 500.00, 550.00, 500.00, 100.00)`,
        [testUserId]
      );
    });

    it('should provide complete P&L breakdown', async () => {
      const breakdown = await pnlService.getPnLBreakdown();
      
      expect(breakdown).toHaveProperty('realized_pnl');
      expect(breakdown).toHaveProperty('unrealized_pnl');
      expect(breakdown).toHaveProperty('day_pnl');
      expect(breakdown).toHaveProperty('total_pnl');
      expect(breakdown).toHaveProperty('positions_pnl');
      expect(breakdown).toHaveProperty('holdings_pnl');
      
      expect(breakdown.total_pnl).toBe(breakdown.realized_pnl + breakdown.unrealized_pnl);
      expect(breakdown.positions_pnl).toBe(800.00); // From position unrealised
      expect(breakdown.holdings_pnl).toBe(500.00); // From holding pnl
    });
  });

  describe('calculatePortfolioMetrics', () => {
    beforeEach(async () => {
      await DatabaseService.query(
        `INSERT INTO zerodha_holdings (
          user_id, tradingsymbol, exchange, instrument_token, isin, product,
          quantity, average_price, last_price, day_change
        ) VALUES 
        ($1, 'METRIC1', 'NSE', 111111, 'INE111A11111', 'CNC', 10, 1000.00, 1100.00, 50.00),
        ($1, 'METRIC2', 'BSE', 222222, 'INE222A22222', 'CNC', 5, 2000.00, 1900.00, -25.00)`,
        [testUserId]
      );

      await DatabaseService.query(
        `INSERT INTO zerodha_positions (
          user_id, tradingsymbol, exchange, quantity, average_price, 
          last_price, pnl, position_date, product, instrument_token
        ) VALUES ($1, 'METRIC3', 'NSE', 20, 500.00, 520.00, 200.00, CURRENT_DATE, 'CNC', 333333)`,
        [testUserId]
      );
    });

    it('should calculate portfolio metrics correctly', async () => {
      const metrics = await pnlService.calculatePortfolioMetrics();
      
      // Total investment: (10*1000) + (5*2000) + (20*500) = 10000 + 10000 + 10000 = 30000
      // Current value: (10*1100) + (5*1900) + (20*520) = 11000 + 9500 + 10400 = 30900
      // Total return: 30900 - 30000 = 900
      // Day change: 50 + (-25) + 200 = 225
      
      expect(metrics.total_investment).toBe(30000.00);
      expect(metrics.current_value).toBe(30900.00);
      expect(metrics.total_return).toBe(900.00);
      expect(metrics.total_return_percentage).toBeCloseTo(3.00, 2); // 900/30000 * 100
      expect(metrics.day_change).toBe(225.00);
      expect(metrics.day_change_percentage).toBeCloseTo(0.75, 2); // 225/30000 * 100
    });
  });
});