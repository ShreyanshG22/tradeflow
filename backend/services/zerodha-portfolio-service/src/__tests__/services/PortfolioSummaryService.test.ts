import { PortfolioSummaryService } from '../../services/PortfolioSummaryService';
import { DatabaseService } from '../../services/DatabaseService';

// Mock the ZerodhaApiClient
jest.mock('../../services/ZerodhaApiClient', () => {
  return {
    ZerodhaApiClient: jest.fn().mockImplementation(() => ({
      getMargins: jest.fn().mockResolvedValue({
        equity: {
          enabled: true,
          net: 100000.00,
          available: {
            cash: 50000.00,
            live_balance: 75000.00
          },
          utilised: {
            exposure: 20000.00,
            span: 5000.00
          }
        }
      })
    }))
  };
});

// Mock the other services
jest.mock('../../services/PositionService', () => {
  return {
    PositionService: jest.fn().mockImplementation(() => ({
      getPositionSummary: jest.fn().mockResolvedValue({
        total_positions: 3,
        total_market_value: 150000.00,
        total_unrealized_pnl: 5000.00,
        total_realized_pnl: 2000.00,
        day_pnl: 1500.00,
        positions: []
      })
    }))
  };
});

jest.mock('../../services/HoldingsService', () => {
  return {
    HoldingsService: jest.fn().mockImplementation(() => ({
      getHoldingsSummary: jest.fn().mockResolvedValue({
        total_holdings: 5,
        total_investment_value: 200000.00,
        total_current_value: 220000.00,
        total_pnl: 20000.00,
        total_day_change: 3000.00,
        total_day_change_percentage: 1.5,
        holdings: []
      })
    }))
  };
});

jest.mock('../../services/PnLService', () => {
  return {
    PnLService: jest.fn().mockImplementation(() => ({
      getPnLBreakdown: jest.fn().mockResolvedValue({
        realized_pnl: 2000.00,
        unrealized_pnl: 23000.00,
        day_pnl: 4500.00,
        total_pnl: 25000.00,
        positions_pnl: 5000.00,
        holdings_pnl: 20000.00
      }),
      calculatePortfolioMetrics: jest.fn().mockResolvedValue({
        total_investment: 350000.00,
        current_value: 370000.00,
        total_return: 20000.00,
        total_return_percentage: 5.71,
        day_change: 4500.00,
        day_change_percentage: 1.29
      })
    }))
  };
});

describe('PortfolioSummaryService', () => {
  let portfolioSummaryService: PortfolioSummaryService;
  const testUserId = 'test-user-summary';
  const testAccessToken = 'test-access-token';

  beforeEach(() => {
    portfolioSummaryService = new PortfolioSummaryService(testAccessToken, testUserId);
  });

  describe('getPortfolioSummary', () => {
    it('should generate complete portfolio summary', async () => {
      const summary = await portfolioSummaryService.getPortfolioSummary();
      
      expect(summary).toHaveProperty('user_id', testUserId);
      expect(summary).toHaveProperty('total_portfolio_value');
      expect(summary).toHaveProperty('total_investment');
      expect(summary).toHaveProperty('total_current_value');
      expect(summary).toHaveProperty('total_pnl');
      expect(summary).toHaveProperty('total_return_percentage');
      expect(summary).toHaveProperty('day_change');
      expect(summary).toHaveProperty('day_change_percentage');
      expect(summary).toHaveProperty('positions_count');
      expect(summary).toHaveProperty('holdings_count');
      expect(summary).toHaveProperty('cash_balance');
      expect(summary).toHaveProperty('margin_available');
      expect(summary).toHaveProperty('margin_used');
      expect(summary).toHaveProperty('buying_power');
      expect(summary).toHaveProperty('last_updated');
      
      // Verify calculated values
      expect(summary.total_portfolio_value).toBe(420000.00); // 370000 + 50000 cash
      expect(summary.total_investment).toBe(350000.00);
      expect(summary.total_current_value).toBe(370000.00);
      expect(summary.total_pnl).toBe(25000.00);
      expect(summary.positions_count).toBe(3);
      expect(summary.holdings_count).toBe(5);
      expect(summary.cash_balance).toBe(50000.00);
      expect(summary.margin_available).toBe(100000.00);
      expect(summary.margin_used).toBe(25000.00); // 20000 + 5000
      expect(summary.buying_power).toBe(75000.00);
    });

    it('should store portfolio summary in database', async () => {
      await portfolioSummaryService.getPortfolioSummary();
      
      // Verify summary was stored
      const result = await DatabaseService.query(
        'SELECT * FROM zerodha_portfolio_summary WHERE user_id = $1 AND summary_date = CURRENT_DATE',
        [testUserId]
      );
      
      expect(result.rows).toHaveLength(1);
      expect(parseFloat(result.rows[0].total_portfolio_value)).toBe(420000.00);
      expect(parseFloat(result.rows[0].total_investment)).toBe(350000.00);
      expect(parseFloat(result.rows[0].total_current_value)).toBe(370000.00);
      expect(parseFloat(result.rows[0].total_pnl)).toBe(25000.00);
      expect(parseInt(result.rows[0].positions_count)).toBe(3);
      expect(parseInt(result.rows[0].holdings_count)).toBe(5);
    });
  });

  describe('getPortfolioAnalytics', () => {
    beforeEach(async () => {
      // Setup test data for analytics calculations
      const portfolioResult = await DatabaseService.query(
        `INSERT INTO trading.portfolios (user_id, name, portfolio_type, base_currency)
         VALUES ($1, 'Test Portfolio', 'trading', 'INR') RETURNING id`,
        [testUserId]
      );
      const portfolioId = portfolioResult.rows[0].id;

      // Insert test trades for activity metrics
      await DatabaseService.query(
        `INSERT INTO trading.trades (
          portfolio_id, symbol, side, quantity, price, total_amount, 
          status, executed_at
        ) VALUES 
        ($1, 'ANALYTICS1', 'buy', 10, 1000.00, 10000.00, 'filled', NOW() - INTERVAL '3 days'),
        ($1, 'ANALYTICS1', 'sell', 5, 1100.00, 5500.00, 'filled', NOW() - INTERVAL '1 day'),
        ($1, 'ANALYTICS2', 'buy', 20, 500.00, 10000.00, 'filled', NOW() - INTERVAL '15 days')`,
        [portfolioId]
      );

      // Insert test positions for allocation
      await DatabaseService.query(
        `INSERT INTO zerodha_positions (
          user_id, tradingsymbol, exchange, quantity, average_price, 
          last_price, position_date, product, instrument_token
        ) VALUES 
        ($1, 'NSE_STOCK1', 'NSE', 10, 1000.00, 1100.00, CURRENT_DATE, 'CNC', 111111),
        ($1, 'BSE_STOCK1', 'BSE', 5, 2000.00, 2100.00, CURRENT_DATE, 'CNC', 222222)`,
        [testUserId]
      );

      // Insert test holdings
      await DatabaseService.query(
        `INSERT INTO zerodha_holdings (
          user_id, tradingsymbol, exchange, instrument_token, isin, product,
          quantity, average_price, last_price
        ) VALUES 
        ($1, 'NSE_HOLD1', 'NSE', 333333, 'INE333A33333', 'CNC', 20, 500.00, 550.00),
        ($1, 'BSE_HOLD1', 'BSE', 444444, 'INE444A44444', 'CNC', 15, 800.00, 850.00)`,
        [testUserId]
      );
    });

    it('should generate portfolio analytics', async () => {
      const analytics = await portfolioSummaryService.getPortfolioAnalytics();
      
      expect(analytics).toHaveProperty('performance_metrics');
      expect(analytics).toHaveProperty('allocation');
      expect(analytics).toHaveProperty('risk_metrics');
      expect(analytics).toHaveProperty('recent_activity');
      
      // Check performance metrics structure
      expect(analytics.performance_metrics).toHaveProperty('total_return');
      expect(analytics.performance_metrics).toHaveProperty('total_return_percentage');
      expect(analytics.performance_metrics).toHaveProperty('annualized_return');
      expect(analytics.performance_metrics).toHaveProperty('volatility');
      expect(analytics.performance_metrics).toHaveProperty('sharpe_ratio');
      expect(analytics.performance_metrics).toHaveProperty('max_drawdown');
      expect(analytics.performance_metrics).toHaveProperty('win_rate');
      
      // Check allocation structure
      expect(analytics.allocation).toHaveProperty('by_sector');
      expect(analytics.allocation).toHaveProperty('by_exchange');
      expect(analytics.allocation).toHaveProperty('by_asset_type');
      expect(Array.isArray(analytics.allocation.by_exchange)).toBe(true);
      
      // Check risk metrics structure
      expect(analytics.risk_metrics).toHaveProperty('portfolio_beta');
      expect(analytics.risk_metrics).toHaveProperty('value_at_risk');
      expect(analytics.risk_metrics).toHaveProperty('concentration_risk');
      expect(analytics.risk_metrics).toHaveProperty('largest_position_percentage');
      
      // Check recent activity structure
      expect(analytics.recent_activity).toHaveProperty('trades_count_7d');
      expect(analytics.recent_activity).toHaveProperty('trades_count_30d');
      expect(analytics.recent_activity).toHaveProperty('avg_trade_size');
      expect(analytics.recent_activity).toHaveProperty('most_traded_symbols');
      expect(Array.isArray(analytics.recent_activity.most_traded_symbols)).toBe(true);
    });

    it('should calculate recent activity correctly', async () => {
      const analytics = await portfolioSummaryService.getPortfolioAnalytics();
      
      // Should have 2 trades in last 7 days and 3 trades in last 30 days
      expect(analytics.recent_activity.trades_count_7d).toBe(2);
      expect(analytics.recent_activity.trades_count_30d).toBe(3);
      expect(analytics.recent_activity.avg_trade_size).toBeCloseTo(8500.00, 2); // (10000 + 5500 + 10000) / 3
    });
  });

  describe('getCachedPortfolioSummary', () => {
    it('should return null when no cached data exists', async () => {
      const cachedSummary = await portfolioSummaryService.getCachedPortfolioSummary();
      expect(cachedSummary).toBeNull();
    });
  });
});