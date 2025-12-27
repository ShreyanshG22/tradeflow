import { HoldingsService } from '../../services/HoldingsService';
import { DatabaseService } from '../../services/DatabaseService';
import { ZerodhaHolding } from '@tradeflow/types';

// Mock the ZerodhaApiClient
jest.mock('../../services/ZerodhaApiClient', () => {
  return {
    ZerodhaApiClient: jest.fn().mockImplementation(() => ({
      getHoldings: jest.fn()
    }))
  };
});

describe('HoldingsService', () => {
  let holdingsService: HoldingsService;
  const testUserId = 'test-user-456';
  const testAccessToken = 'test-access-token';

  beforeEach(() => {
    holdingsService = new HoldingsService(testAccessToken, testUserId);
  });

  describe('syncHoldingsToDatabase', () => {
    it('should sync holdings to database correctly', async () => {
      const mockHoldings: ZerodhaHolding[] = [
        {
          account_id: 'test-account',
          tradingsymbol: 'INFY',
          exchange: 'NSE',
          instrument_token: 408065,
          isin: 'INE009A01021',
          product: 'CNC',
          price: 1500.00,
          quantity: 50,
          used_quantity: 0,
          t1_quantity: 0,
          realised_quantity: 50,
          authorised_quantity: 50,
          authorised_date: '2024-01-15',
          opening_quantity: 50,
          collateral_quantity: 0,
          collateral_type: null,
          discrepancy: false,
          average_price: 1450.00,
          last_price: 1500.00,
          close_price: 1480.00,
          pnl: 2500.00,
          day_change: 20.00,
          day_change_percentage: 1.35
        }
      ];

      await holdingsService.syncHoldingsToDatabase(mockHoldings);

      // Verify holding was inserted
      const result = await DatabaseService.query(
        'SELECT * FROM zerodha_holdings WHERE user_id = $1 AND tradingsymbol = $2',
        [testUserId, 'INFY']
      );

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].tradingsymbol).toBe('INFY');
      expect(parseInt(result.rows[0].quantity)).toBe(50);
      expect(parseFloat(result.rows[0].average_price)).toBe(1450.00);
      expect(parseFloat(result.rows[0].last_price)).toBe(1500.00);
    });

    it('should not insert holdings with zero quantity', async () => {
      const mockHoldings: ZerodhaHolding[] = [
        {
          account_id: 'test-account',
          tradingsymbol: 'ZEROHOLD',
          exchange: 'NSE',
          instrument_token: 123456,
          isin: 'INE000A00000',
          product: 'CNC',
          price: 100.00,
          quantity: 0,
          used_quantity: 0,
          t1_quantity: 0,
          realised_quantity: 0,
          authorised_quantity: 0,
          authorised_date: '2024-01-15',
          opening_quantity: 0,
          collateral_quantity: 0,
          collateral_type: null,
          discrepancy: false,
          average_price: 100.00,
          last_price: 100.00,
          close_price: 100.00,
          pnl: 0,
          day_change: 0,
          day_change_percentage: 0
        }
      ];

      await holdingsService.syncHoldingsToDatabase(mockHoldings);

      // Verify holding was not inserted
      const result = await DatabaseService.query(
        'SELECT * FROM zerodha_holdings WHERE user_id = $1 AND tradingsymbol = $2',
        [testUserId, 'ZEROHOLD']
      );

      expect(result.rows).toHaveLength(0);
    });
  });

  describe('getHoldingsFromDatabase', () => {
    beforeEach(async () => {
      // Insert test holding
      await DatabaseService.query(
        `INSERT INTO zerodha_holdings (
          user_id, tradingsymbol, exchange, instrument_token, isin, product,
          price, quantity, average_price, last_price, close_price, pnl,
          day_change, day_change_percentage
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
        [
          testUserId, 'TCS', 'NSE', 2953217, 'INE467B01029', 'CNC',
          3500.00, 25, 3400.00, 3500.00, 3450.00, 2500.00, 50.00, 1.45
        ]
      );
    });

    it('should retrieve holdings from database correctly', async () => {
      const holdings = await holdingsService.getHoldingsFromDatabase();

      expect(holdings).toHaveLength(1);
      expect(holdings[0].tradingsymbol).toBe('TCS');
      expect(holdings[0].quantity).toBe(25);
      expect(holdings[0].average_price).toBe(3400.00);
      expect(holdings[0].last_price).toBe(3500.00);
      expect(holdings[0].current_value).toBe(87500.00); // 25 * 3500
      expect(holdings[0].investment_value).toBe(85000.00); // 25 * 3400
      expect(holdings[0].unrealized_pnl).toBe(2500.00); // (3500 - 3400) * 25
    });
  });

  describe('calculateRealizedPnL', () => {
    beforeEach(async () => {
      // Create test portfolio and trades
      const portfolioResult = await DatabaseService.query(
        `INSERT INTO trading.portfolios (user_id, name, portfolio_type, base_currency)
         VALUES ($1, 'Test Portfolio', 'trading', 'INR') RETURNING id`,
        [testUserId]
      );
      const portfolioId = portfolioResult.rows[0].id;

      // Insert test trades
      await DatabaseService.query(
        `INSERT INTO trading.trades (
          portfolio_id, symbol, side, quantity, price, total_amount, 
          status, executed_at
        ) VALUES 
        ($1, 'TESTSTOCK', 'buy', 10, 1000.00, 10000.00, 'filled', NOW() - INTERVAL '5 days'),
        ($1, 'TESTSTOCK', 'sell', 5, 1100.00, 5500.00, 'filled', NOW() - INTERVAL '2 days')`,
        [portfolioId]
      );

      // Insert position for cost basis
      await DatabaseService.query(
        `INSERT INTO zerodha_positions (
          user_id, tradingsymbol, exchange, quantity, average_price, 
          last_price, position_date, product, instrument_token
        ) VALUES ($1, 'TESTSTOCK', 'NSE', 5, 1000.00, 1050.00, CURRENT_DATE, 'CNC', 123456)`,
        [testUserId]
      );
    });

    it('should calculate realized P&L correctly', async () => {
      const realizedPnL = await holdingsService.calculateRealizedPnL();
      
      // Should calculate P&L from the sell trade: (1100 - 1000) * 5 = 500
      expect(realizedPnL).toBe(500.00);
    });
  });

  describe('calculateUnrealizedPnL', () => {
    beforeEach(async () => {
      await DatabaseService.query(
        `INSERT INTO zerodha_holdings (
          user_id, tradingsymbol, exchange, instrument_token, isin, product,
          price, quantity, average_price, last_price, close_price, pnl,
          day_change, day_change_percentage
        ) VALUES 
        ($1, 'STOCK1', 'NSE', 111111, 'INE111A11111', 'CNC', 200.00, 10, 180.00, 200.00, 190.00, 200.00, 10.00, 5.26),
        ($1, 'STOCK2', 'NSE', 222222, 'INE222A22222', 'CNC', 150.00, 20, 160.00, 150.00, 155.00, -200.00, -5.00, -3.23)`,
        [testUserId]
      );
    });

    it('should calculate unrealized P&L correctly', async () => {
      const unrealizedPnL = await holdingsService.calculateUnrealizedPnL();
      
      // STOCK1: (200 - 180) * 10 = 200
      // STOCK2: (150 - 160) * 20 = -200
      // Total: 200 + (-200) = 0
      expect(unrealizedPnL).toBe(0.00);
    });
  });

  describe('updateHoldingPrices', () => {
    beforeEach(async () => {
      await DatabaseService.query(
        `INSERT INTO zerodha_holdings (
          user_id, tradingsymbol, exchange, instrument_token, isin, product,
          price, quantity, average_price, last_price, close_price, pnl,
          day_change, day_change_percentage
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
        [
          testUserId, 'UPDATETEST', 'NSE', 333333, 'INE333A33333', 'CNC',
          1000.00, 10, 950.00, 1000.00, 980.00, 500.00, 20.00, 2.04
        ]
      );
    });

    it('should update holding prices correctly', async () => {
      const priceUpdates = [
        { symbol: 'UPDATETEST', exchange: 'NSE', price: 1050.00 }
      ];

      await holdingsService.updateHoldingPrices(priceUpdates);

      // Verify price was updated
      const result = await DatabaseService.query(
        'SELECT * FROM zerodha_holdings WHERE user_id = $1 AND tradingsymbol = $2',
        [testUserId, 'UPDATETEST']
      );

      expect(result.rows).toHaveLength(1);
      expect(parseFloat(result.rows[0].last_price)).toBe(1050.00);
      expect(parseFloat(result.rows[0].day_change)).toBe(70.00); // 1050 - 980
      expect(parseFloat(result.rows[0].pnl)).toBe(1000.00); // (1050 - 950) * 10
    });
  });
});