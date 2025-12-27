import { PositionService } from '../../services/PositionService';
import { DatabaseService } from '../../services/DatabaseService';
import { RedisService } from '../../services/RedisService';
import { ZerodhaPosition } from '@tradeflow/types';

// Mock the ZerodhaApiClient
jest.mock('../../services/ZerodhaApiClient', () => {
  return {
    ZerodhaApiClient: jest.fn().mockImplementation(() => ({
      getPositions: jest.fn()
    }))
  };
});

describe('PositionService', () => {
  let positionService: PositionService;
  const testUserId = 'test-user-123';
  const testAccessToken = 'test-access-token';

  beforeEach(() => {
    positionService = new PositionService(testAccessToken, testUserId);
  });

  describe('syncPositionsToDatabase', () => {
    it('should sync positions to database correctly', async () => {
      const mockPositions: ZerodhaPosition[] = [
        {
          account_id: 'test-account',
          tradingsymbol: 'RELIANCE',
          exchange: 'NSE',
          instrument_token: 738561,
          product: 'CNC',
          quantity: 10,
          overnight_quantity: 0,
          multiplier: 1,
          average_price: 2500.50,
          close_price: 2480.00,
          last_price: 2520.75,
          value: 25207.50,
          pnl: 202.50,
          m2m: 202.50,
          unrealised: 202.50,
          realised: 0,
          buy_quantity: 10,
          buy_price: 2500.50,
          buy_value: 25005.00,
          buy_m2m: 202.50,
          sell_quantity: 0,
          sell_price: 0,
          sell_value: 0,
          sell_m2m: 0,
          day_buy_quantity: 0,
          day_buy_price: 0,
          day_buy_value: 0,
          day_sell_quantity: 0,
          day_sell_price: 0,
          day_sell_value: 0
        }
      ];

      await positionService.syncPositionsToDatabase(mockPositions);

      // Verify position was inserted
      const result = await DatabaseService.query(
        'SELECT * FROM zerodha_positions WHERE user_id = $1 AND tradingsymbol = $2',
        [testUserId, 'RELIANCE']
      );

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].tradingsymbol).toBe('RELIANCE');
      expect(parseFloat(result.rows[0].quantity)).toBe(10);
      expect(parseFloat(result.rows[0].average_price)).toBe(2500.50);
    });

    it('should not insert positions with zero quantity', async () => {
      const mockPositions: ZerodhaPosition[] = [
        {
          account_id: 'test-account',
          tradingsymbol: 'ZEROPOS',
          exchange: 'NSE',
          instrument_token: 123456,
          product: 'CNC',
          quantity: 0,
          overnight_quantity: 0,
          multiplier: 1,
          average_price: 100.00,
          close_price: 100.00,
          last_price: 100.00,
          value: 0,
          pnl: 0,
          m2m: 0,
          unrealised: 0,
          realised: 0,
          buy_quantity: 0,
          buy_price: 0,
          buy_value: 0,
          buy_m2m: 0,
          sell_quantity: 0,
          sell_price: 0,
          sell_value: 0,
          sell_m2m: 0,
          day_buy_quantity: 0,
          day_buy_price: 0,
          day_buy_value: 0,
          day_sell_quantity: 0,
          day_sell_price: 0,
          day_sell_value: 0
        }
      ];

      await positionService.syncPositionsToDatabase(mockPositions);

      // Verify position was not inserted
      const result = await DatabaseService.query(
        'SELECT * FROM zerodha_positions WHERE user_id = $1 AND tradingsymbol = $2',
        [testUserId, 'ZEROPOS']
      );

      expect(result.rows).toHaveLength(0);
    });
  });

  describe('getPositionsFromDatabase', () => {
    beforeEach(async () => {
      // Insert test position
      await DatabaseService.query(
        `INSERT INTO zerodha_positions (
          user_id, tradingsymbol, exchange, quantity, average_price, 
          last_price, pnl, unrealised, realised, position_date,
          product, instrument_token
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_DATE, $10, $11)`,
        [testUserId, 'TESTSTOCK', 'NSE', 5, 1000.00, 1050.00, 250.00, 250.00, 0, 'CNC', 123456]
      );
    });

    it('should retrieve positions from database correctly', async () => {
      const positions = await positionService.getPositionsFromDatabase();

      expect(positions).toHaveLength(1);
      expect(positions[0].symbol).toBe('TESTSTOCK');
      expect(positions[0].quantity).toBe(5);
      expect(positions[0].average_price).toBe(1000.00);
      expect(positions[0].current_price).toBe(1050.00);
      expect(positions[0].market_value).toBe(5250.00); // 5 * 1050
    });
  });

  describe('aggregatePositionsBySymbol', () => {
    beforeEach(async () => {
      // Insert multiple positions for same symbol
      await DatabaseService.query(
        `INSERT INTO zerodha_positions (
          user_id, tradingsymbol, exchange, quantity, average_price, 
          last_price, pnl, unrealised, realised, position_date,
          product, instrument_token
        ) VALUES 
        ($1, 'AGGTEST', 'NSE', 10, 100.00, 110.00, 100.00, 100.00, 0, 'CNC', 111111),
        ($1, 'AGGTEST', 'NSE', 5, 120.00, 110.00, -50.00, -50.00, 0, 'MIS', 111111)`,
        [testUserId]
      );
    });

    it('should aggregate positions by symbol correctly', async () => {
      const aggregated = await positionService.aggregatePositionsBySymbol();

      expect(aggregated).toHaveLength(1);
      expect(aggregated[0].symbol).toBe('AGGTEST');
      expect(aggregated[0].total_quantity).toBe(15); // 10 + 5
      expect(aggregated[0].total_market_value).toBe(1650.00); // (10 + 5) * 110
      expect(aggregated[0].position_count).toBe(2);
    });
  });

  describe('getPositionBySymbol', () => {
    beforeEach(async () => {
      await DatabaseService.query(
        `INSERT INTO zerodha_positions (
          user_id, tradingsymbol, exchange, quantity, average_price, 
          last_price, pnl, unrealised, realised, position_date,
          product, instrument_token
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_DATE, $10, $11)`,
        [testUserId, 'SINGLEPOS', 'BSE', 20, 500.00, 520.00, 400.00, 400.00, 0, 'CNC', 222222]
      );
    });

    it('should retrieve specific position by symbol and exchange', async () => {
      const position = await positionService.getPositionBySymbol('SINGLEPOS', 'BSE');

      expect(position).not.toBeNull();
      expect(position!.symbol).toBe('SINGLEPOS');
      expect(position!.exchange).toBe('BSE');
      expect(position!.quantity).toBe(20);
      expect(position!.average_price).toBe(500.00);
    });

    it('should return null for non-existent position', async () => {
      const position = await positionService.getPositionBySymbol('NONEXISTENT', 'NSE');
      expect(position).toBeNull();
    });
  });
});