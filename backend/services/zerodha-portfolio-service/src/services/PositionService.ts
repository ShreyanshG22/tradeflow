import { DatabaseService } from './DatabaseService';
import { RedisService } from './RedisService';
import { ZerodhaApiClient } from './ZerodhaApiClient';
import { logger } from '../utils/logger';
import { ZerodhaPosition } from '@tradeflow/types';

export interface Position {
  id: string;
  portfolio_id: string;
  symbol: string;
  exchange: string;
  quantity: number;
  average_price: number;
  current_price: number;
  market_value: number;
  unrealized_pnl: number;
  realized_pnl: number;
  side: 'long' | 'short';
  product: string;
  instrument_token: number;
  opened_at: Date;
  updated_at: Date;
}

export interface PositionSummary {
  total_positions: number;
  total_market_value: number;
  total_unrealized_pnl: number;
  total_realized_pnl: number;
  day_pnl: number;
  positions: Position[];
}

export class PositionService {
  private zerodhaClient: ZerodhaApiClient;
  private userId: string;

  constructor(accessToken: string, userId: string) {
    this.zerodhaClient = new ZerodhaApiClient(accessToken);
    this.userId = userId;
  }

  async fetchPositionsFromZerodha(): Promise<ZerodhaPosition[]> {
    try {
      logger.info(`Fetching positions from Zerodha for user ${this.userId}`);
      const positions = await this.zerodhaClient.getPositions();
      
      // Cache positions in Redis for 30 seconds
      const cacheKey = `positions:${this.userId}`;
      await RedisService.set(cacheKey, JSON.stringify(positions), 30);
      
      return positions;
    } catch (error) {
      logger.error(`Failed to fetch positions for user ${this.userId}:`, error);
      throw error;
    }
  }

  async getCachedPositions(): Promise<ZerodhaPosition[] | null> {
    try {
      const cacheKey = `positions:${this.userId}`;
      const cachedData = await RedisService.get(cacheKey);
      
      if (cachedData) {
        return JSON.parse(cachedData);
      }
      
      return null;
    } catch (error) {
      logger.error(`Failed to get cached positions for user ${this.userId}:`, error);
      return null;
    }
  }

  async syncPositionsToDatabase(zerodhaPositions: ZerodhaPosition[]): Promise<void> {
    try {
      logger.info(`Syncing ${zerodhaPositions.length} positions to database for user ${this.userId}`);
      
      await DatabaseService.transaction(async (client) => {
        // Get or create portfolio for this user
        const portfolioResult = await client.query(
          `INSERT INTO trading.portfolios (user_id, name, portfolio_type, base_currency)
           VALUES ($1, 'Zerodha Portfolio', 'trading', 'INR')
           ON CONFLICT (user_id) WHERE portfolio_type = 'trading'
           DO UPDATE SET updated_at = NOW()
           RETURNING id`,
          [this.userId]
        );
        
        const portfolioId = portfolioResult.rows[0]?.id;
        if (!portfolioId) {
          // If no conflict, try to get existing portfolio
          const existingPortfolio = await client.query(
            `SELECT id FROM trading.portfolios WHERE user_id = $1 AND portfolio_type = 'trading' LIMIT 1`,
            [this.userId]
          );
          
          if (existingPortfolio.rows.length === 0) {
            throw new Error('Failed to create or find portfolio');
          }
        }

        // Clear existing positions for today
        await client.query(
          `DELETE FROM zerodha_positions WHERE user_id = $1 AND position_date = CURRENT_DATE`,
          [this.userId]
        );

        // Insert new positions
        for (const position of zerodhaPositions) {
          if (position.quantity !== 0) { // Only store non-zero positions
            await client.query(
              `INSERT INTO zerodha_positions (
                user_id, tradingsymbol, exchange, quantity, average_price, 
                last_price, pnl, unrealised, realised, position_date,
                product, instrument_token, buy_quantity, sell_quantity,
                buy_price, sell_price, buy_value, sell_value
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_DATE, $10, $11, $12, $13, $14, $15, $16, $17)`,
              [
                this.userId,
                position.tradingsymbol,
                position.exchange,
                position.quantity,
                position.average_price,
                position.last_price,
                position.pnl,
                position.unrealised,
                position.realised,
                position.product,
                position.instrument_token,
                position.buy_quantity,
                position.sell_quantity,
                position.buy_price,
                position.sell_price,
                position.buy_value,
                position.sell_value
              ]
            );
          }
        }
      });

      logger.info(`Successfully synced positions to database for user ${this.userId}`);
    } catch (error) {
      logger.error(`Failed to sync positions to database for user ${this.userId}:`, error);
      throw error;
    }
  }

  async getPositionsFromDatabase(): Promise<Position[]> {
    try {
      const result = await DatabaseService.query(
        `SELECT 
          id, user_id as portfolio_id, tradingsymbol as symbol, exchange,
          quantity, average_price, last_price as current_price,
          (quantity * last_price) as market_value,
          unrealised as unrealized_pnl, realised as realized_pnl,
          CASE WHEN quantity > 0 THEN 'long' ELSE 'short' END as side,
          product, instrument_token, created_at as opened_at, updated_at
         FROM zerodha_positions 
         WHERE user_id = $1 AND position_date = CURRENT_DATE
         ORDER BY ABS(quantity * last_price) DESC`,
        [this.userId]
      );

      return result.rows.map((row: any) => ({
        ...row,
        quantity: parseFloat(row.quantity),
        average_price: parseFloat(row.average_price),
        current_price: parseFloat(row.current_price),
        market_value: parseFloat(row.market_value),
        unrealized_pnl: parseFloat(row.unrealized_pnl),
        realized_pnl: parseFloat(row.realized_pnl)
      }));
    } catch (error) {
      logger.error(`Failed to get positions from database for user ${this.userId}:`, error);
      throw error;
    }
  }

  async getPositionSummary(): Promise<PositionSummary> {
    try {
      // Try to get fresh data from Zerodha first
      let zerodhaPositions: ZerodhaPosition[];
      
      try {
        zerodhaPositions = await this.fetchPositionsFromZerodha();
        await this.syncPositionsToDatabase(zerodhaPositions);
      } catch (error) {
        logger.warn(`Failed to fetch fresh positions, trying cache for user ${this.userId}:`, error);
        
        // Fallback to cached data
        const cachedPositions = await this.getCachedPositions();
        if (cachedPositions) {
          zerodhaPositions = cachedPositions;
        } else {
          throw new Error('No position data available');
        }
      }

      // Get positions from database
      const positions = await this.getPositionsFromDatabase();

      // Calculate summary
      const summary: PositionSummary = {
        total_positions: positions.length,
        total_market_value: positions.reduce((sum, pos) => sum + pos.market_value, 0),
        total_unrealized_pnl: positions.reduce((sum, pos) => sum + pos.unrealized_pnl, 0),
        total_realized_pnl: positions.reduce((sum, pos) => sum + pos.realized_pnl, 0),
        day_pnl: zerodhaPositions.reduce((sum, pos) => sum + (pos.pnl || 0), 0),
        positions
      };

      return summary;
    } catch (error) {
      logger.error(`Failed to get position summary for user ${this.userId}:`, error);
      throw error;
    }
  }

  async getPositionBySymbol(symbol: string, exchange: string): Promise<Position | null> {
    try {
      const result = await DatabaseService.query(
        `SELECT 
          id, user_id as portfolio_id, tradingsymbol as symbol, exchange,
          quantity, average_price, last_price as current_price,
          (quantity * last_price) as market_value,
          unrealised as unrealized_pnl, realised as realized_pnl,
          CASE WHEN quantity > 0 THEN 'long' ELSE 'short' END as side,
          product, instrument_token, created_at as opened_at, updated_at
         FROM zerodha_positions 
         WHERE user_id = $1 AND tradingsymbol = $2 AND exchange = $3 AND position_date = CURRENT_DATE`,
        [this.userId, symbol, exchange]
      );

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      return {
        ...row,
        quantity: parseFloat(row.quantity),
        average_price: parseFloat(row.average_price),
        current_price: parseFloat(row.current_price),
        market_value: parseFloat(row.market_value),
        unrealized_pnl: parseFloat(row.unrealized_pnl),
        realized_pnl: parseFloat(row.realized_pnl)
      };
    } catch (error) {
      logger.error(`Failed to get position for ${symbol}:${exchange} for user ${this.userId}:`, error);
      throw error;
    }
  }

  async aggregatePositionsBySymbol(): Promise<any[]> {
    try {
      const result = await DatabaseService.query(
        `SELECT 
          tradingsymbol as symbol,
          exchange,
          SUM(quantity) as total_quantity,
          AVG(average_price) as avg_price,
          MAX(last_price) as current_price,
          SUM(quantity * last_price) as total_market_value,
          SUM(unrealised) as total_unrealized_pnl,
          SUM(realised) as total_realized_pnl,
          COUNT(*) as position_count
         FROM zerodha_positions 
         WHERE user_id = $1 AND position_date = CURRENT_DATE
         GROUP BY tradingsymbol, exchange
         HAVING SUM(quantity) != 0
         ORDER BY SUM(ABS(quantity * last_price)) DESC`,
        [this.userId]
      );

      return result.rows.map((row: any) => ({
        ...row,
        total_quantity: parseFloat(row.total_quantity),
        avg_price: parseFloat(row.avg_price),
        current_price: parseFloat(row.current_price),
        total_market_value: parseFloat(row.total_market_value),
        total_unrealized_pnl: parseFloat(row.total_unrealized_pnl),
        total_realized_pnl: parseFloat(row.total_realized_pnl),
        position_count: parseInt(row.position_count)
      }));
    } catch (error) {
      logger.error(`Failed to aggregate positions for user ${this.userId}:`, error);
      throw error;
    }
  }
}