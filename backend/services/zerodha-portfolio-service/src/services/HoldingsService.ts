import { DatabaseService } from './DatabaseService';
import { RedisService } from './RedisService';
import { ZerodhaApiClient } from './ZerodhaApiClient';
import { logger } from '../utils/logger';
import { ZerodhaHolding } from '@tradeflow/types';

export interface Holding {
  id: string;
  user_id: string;
  tradingsymbol: string;
  exchange: string;
  instrument_token: number;
  isin: string;
  product: string;
  quantity: number;
  average_price: number;
  last_price: number;
  current_value: number;
  investment_value: number;
  pnl: number;
  day_change: number;
  day_change_percentage: number;
  unrealized_pnl: number;
  created_at: Date;
  updated_at: Date;
}

export interface HoldingsSummary {
  total_holdings: number;
  total_investment_value: number;
  total_current_value: number;
  total_pnl: number;
  total_day_change: number;
  total_day_change_percentage: number;
  holdings: Holding[];
}

export class HoldingsService {
  private zerodhaClient: ZerodhaApiClient;
  private userId: string;

  constructor(accessToken: string, userId: string) {
    this.zerodhaClient = new ZerodhaApiClient(accessToken);
    this.userId = userId;
  }

  async fetchHoldingsFromZerodha(): Promise<ZerodhaHolding[]> {
    try {
      logger.info(`Fetching holdings from Zerodha for user ${this.userId}`);
      const holdings = await this.zerodhaClient.getHoldings();
      
      // Cache holdings in Redis for 5 minutes
      const cacheKey = `holdings:${this.userId}`;
      await RedisService.set(cacheKey, JSON.stringify(holdings), 300);
      
      return holdings;
    } catch (error) {
      logger.error(`Failed to fetch holdings for user ${this.userId}:`, error);
      throw error;
    }
  }

  async getCachedHoldings(): Promise<ZerodhaHolding[] | null> {
    try {
      const cacheKey = `holdings:${this.userId}`;
      const cachedData = await RedisService.get(cacheKey);
      
      if (cachedData) {
        return JSON.parse(cachedData);
      }
      
      return null;
    } catch (error) {
      logger.error(`Failed to get cached holdings for user ${this.userId}:`, error);
      return null;
    }
  }

  async syncHoldingsToDatabase(zerodhaHoldings: ZerodhaHolding[]): Promise<void> {
    try {
      logger.info(`Syncing ${zerodhaHoldings.length} holdings to database for user ${this.userId}`);
      
      await DatabaseService.transaction(async (client) => {
        // Clear existing holdings for this user
        await client.query(
          `DELETE FROM zerodha_holdings WHERE user_id = $1`,
          [this.userId]
        );

        // Insert new holdings
        for (const holding of zerodhaHoldings) {
          if (holding.quantity > 0) { // Only store holdings with positive quantity
            await client.query(
              `INSERT INTO zerodha_holdings (
                user_id, tradingsymbol, exchange, instrument_token, isin, product,
                price, quantity, used_quantity, t1_quantity, realised_quantity,
                authorised_quantity, authorised_date, opening_quantity,
                collateral_quantity, collateral_type, discrepancy,
                average_price, last_price, close_price, pnl,
                day_change, day_change_percentage
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23)`,
              [
                this.userId,
                holding.tradingsymbol,
                holding.exchange,
                holding.instrument_token,
                holding.isin,
                holding.product,
                holding.price,
                holding.quantity,
                holding.used_quantity,
                holding.t1_quantity,
                holding.realised_quantity,
                holding.authorised_quantity,
                holding.authorised_date || null,
                holding.opening_quantity,
                holding.collateral_quantity,
                holding.collateral_type || null,
                holding.discrepancy,
                holding.average_price,
                holding.last_price,
                holding.close_price,
                holding.pnl,
                holding.day_change,
                holding.day_change_percentage
              ]
            );
          }
        }
      });

      logger.info(`Successfully synced holdings to database for user ${this.userId}`);
    } catch (error) {
      logger.error(`Failed to sync holdings to database for user ${this.userId}:`, error);
      throw error;
    }
  }

  async getHoldingsFromDatabase(): Promise<Holding[]> {
    try {
      const result = await DatabaseService.query(
        `SELECT 
          id, user_id, tradingsymbol, exchange, instrument_token, isin, product,
          quantity, average_price, last_price,
          (quantity * last_price) as current_value,
          (quantity * average_price) as investment_value,
          pnl, day_change, day_change_percentage,
          ((last_price - average_price) * quantity) as unrealized_pnl,
          created_at, updated_at
         FROM zerodha_holdings 
         WHERE user_id = $1
         ORDER BY (quantity * last_price) DESC`,
        [this.userId]
      );

      return result.rows.map((row: any) => ({
        ...row,
        quantity: parseInt(row.quantity),
        average_price: parseFloat(row.average_price),
        last_price: parseFloat(row.last_price),
        current_value: parseFloat(row.current_value),
        investment_value: parseFloat(row.investment_value),
        pnl: parseFloat(row.pnl),
        day_change: parseFloat(row.day_change),
        day_change_percentage: parseFloat(row.day_change_percentage),
        unrealized_pnl: parseFloat(row.unrealized_pnl)
      }));
    } catch (error) {
      logger.error(`Failed to get holdings from database for user ${this.userId}:`, error);
      throw error;
    }
  }

  async getHoldingsSummary(): Promise<HoldingsSummary> {
    try {
      // Try to get fresh data from Zerodha first
      let zerodhaHoldings: ZerodhaHolding[];
      
      try {
        zerodhaHoldings = await this.fetchHoldingsFromZerodha();
        await this.syncHoldingsToDatabase(zerodhaHoldings);
      } catch (error) {
        logger.warn(`Failed to fetch fresh holdings, trying cache for user ${this.userId}:`, error);
        
        // Fallback to cached data
        const cachedHoldings = await this.getCachedHoldings();
        if (cachedHoldings) {
          zerodhaHoldings = cachedHoldings;
          await this.syncHoldingsToDatabase(zerodhaHoldings);
        } else {
          throw new Error('No holdings data available');
        }
      }

      // Get holdings from database
      const holdings = await this.getHoldingsFromDatabase();

      // Calculate summary
      const summary: HoldingsSummary = {
        total_holdings: holdings.length,
        total_investment_value: holdings.reduce((sum, holding) => sum + holding.investment_value, 0),
        total_current_value: holdings.reduce((sum, holding) => sum + holding.current_value, 0),
        total_pnl: holdings.reduce((sum, holding) => sum + holding.pnl, 0),
        total_day_change: holdings.reduce((sum, holding) => sum + holding.day_change, 0),
        total_day_change_percentage: 0, // Will calculate below
        holdings
      };

      // Calculate overall day change percentage
      if (summary.total_investment_value > 0) {
        summary.total_day_change_percentage = 
          (summary.total_day_change / summary.total_investment_value) * 100;
      }

      return summary;
    } catch (error) {
      logger.error(`Failed to get holdings summary for user ${this.userId}:`, error);
      throw error;
    }
  }

  async getHoldingBySymbol(symbol: string, exchange: string): Promise<Holding | null> {
    try {
      const result = await DatabaseService.query(
        `SELECT 
          id, user_id, tradingsymbol, exchange, instrument_token, isin, product,
          quantity, average_price, last_price,
          (quantity * last_price) as current_value,
          (quantity * average_price) as investment_value,
          pnl, day_change, day_change_percentage,
          ((last_price - average_price) * quantity) as unrealized_pnl,
          created_at, updated_at
         FROM zerodha_holdings 
         WHERE user_id = $1 AND tradingsymbol = $2 AND exchange = $3`,
        [this.userId, symbol, exchange]
      );

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      return {
        ...row,
        quantity: parseInt(row.quantity),
        average_price: parseFloat(row.average_price),
        last_price: parseFloat(row.last_price),
        current_value: parseFloat(row.current_value),
        investment_value: parseFloat(row.investment_value),
        pnl: parseFloat(row.pnl),
        day_change: parseFloat(row.day_change),
        day_change_percentage: parseFloat(row.day_change_percentage),
        unrealized_pnl: parseFloat(row.unrealized_pnl)
      };
    } catch (error) {
      logger.error(`Failed to get holding for ${symbol}:${exchange} for user ${this.userId}:`, error);
      throw error;
    }
  }

  async calculateRealizedPnL(startDate?: Date, endDate?: Date): Promise<number> {
    try {
      const start = startDate || new Date(new Date().getFullYear(), 0, 1); // Start of current year
      const end = endDate || new Date(); // Current date

      // Get realized P&L from completed trades
      const result = await DatabaseService.query(
        `SELECT COALESCE(SUM(
          CASE 
            WHEN side = 'sell' THEN (price - avg_cost) * quantity
            ELSE 0
          END
        ), 0) as realized_pnl
         FROM (
           SELECT 
             t.side, t.price, t.quantity,
             COALESCE(p.average_price, t.price) as avg_cost
           FROM trading.trades t
           LEFT JOIN zerodha_positions p ON p.tradingsymbol = t.symbol AND p.user_id = $1
           WHERE t.portfolio_id IN (
             SELECT id FROM trading.portfolios WHERE user_id = $1
           )
           AND t.status = 'filled'
           AND t.executed_at BETWEEN $2 AND $3
         ) trade_pnl`,
        [this.userId, start, end]
      );

      return parseFloat(result.rows[0].realized_pnl) || 0;
    } catch (error) {
      logger.error(`Failed to calculate realized P&L for user ${this.userId}:`, error);
      throw error;
    }
  }

  async calculateUnrealizedPnL(): Promise<number> {
    try {
      const result = await DatabaseService.query(
        `SELECT COALESCE(SUM((last_price - average_price) * quantity), 0) as unrealized_pnl
         FROM zerodha_holdings 
         WHERE user_id = $1`,
        [this.userId]
      );

      return parseFloat(result.rows[0].unrealized_pnl) || 0;
    } catch (error) {
      logger.error(`Failed to calculate unrealized P&L for user ${this.userId}:`, error);
      throw error;
    }
  }

  async getTotalPnL(): Promise<{
    realized_pnl: number;
    unrealized_pnl: number;
    total_pnl: number;
  }> {
    try {
      const [realizedPnL, unrealizedPnL] = await Promise.all([
        this.calculateRealizedPnL(),
        this.calculateUnrealizedPnL()
      ]);

      return {
        realized_pnl: realizedPnL,
        unrealized_pnl: unrealizedPnL,
        total_pnl: realizedPnL + unrealizedPnL
      };
    } catch (error) {
      logger.error(`Failed to calculate total P&L for user ${this.userId}:`, error);
      throw error;
    }
  }

  async updateHoldingPrices(priceUpdates: { symbol: string; exchange: string; price: number }[]): Promise<void> {
    try {
      await DatabaseService.transaction(async (client) => {
        for (const update of priceUpdates) {
          await client.query(
            `UPDATE zerodha_holdings 
             SET 
               last_price = $1,
               day_change = $1 - close_price,
               day_change_percentage = CASE 
                 WHEN close_price > 0 THEN (($1 - close_price) / close_price) * 100
                 ELSE 0
               END,
               pnl = ($1 - average_price) * quantity,
               updated_at = NOW()
             WHERE user_id = $2 AND tradingsymbol = $3 AND exchange = $4`,
            [update.price, this.userId, update.symbol, update.exchange]
          );
        }
      });

      logger.info(`Updated prices for ${priceUpdates.length} holdings for user ${this.userId}`);
    } catch (error) {
      logger.error(`Failed to update holding prices for user ${this.userId}:`, error);
      throw error;
    }
  }
}