import { DatabaseService } from './DatabaseService';
import { RedisService } from './RedisService';
import { logger } from '../utils/logger';

export interface PnLBreakdown {
  realized_pnl: number;
  unrealized_pnl: number;
  day_pnl: number;
  total_pnl: number;
  positions_pnl: number;
  holdings_pnl: number;
}

export interface PnLBySymbol {
  symbol: string;
  exchange: string;
  realized_pnl: number;
  unrealized_pnl: number;
  day_pnl: number;
  total_pnl: number;
  quantity: number;
  average_price: number;
  current_price: number;
}

export interface PnLHistory {
  date: Date;
  realized_pnl: number;
  unrealized_pnl: number;
  total_pnl: number;
  portfolio_value: number;
}

export class PnLService {
  private userId: string;

  constructor(userId: string) {
    this.userId = userId;
  }

  async calculateRealizedPnL(startDate?: Date, endDate?: Date): Promise<number> {
    try {
      const start = startDate || new Date(new Date().getFullYear(), 0, 1); // Start of current year
      const end = endDate || new Date(); // Current date

      // Calculate realized P&L from completed trades
      const result = await DatabaseService.query(
        `WITH trade_pnl AS (
          SELECT 
            t.symbol,
            t.side,
            t.quantity,
            t.price,
            t.executed_at,
            LAG(t.price) OVER (PARTITION BY t.symbol ORDER BY t.executed_at) as prev_price,
            ROW_NUMBER() OVER (PARTITION BY t.symbol ORDER BY t.executed_at) as trade_seq
          FROM trading.trades t
          JOIN trading.portfolios p ON p.id = t.portfolio_id
          WHERE p.user_id = $1
            AND t.status = 'filled'
            AND t.executed_at BETWEEN $2 AND $3
        ),
        realized_trades AS (
          SELECT 
            symbol,
            SUM(
              CASE 
                WHEN side = 'sell' AND prev_price IS NOT NULL 
                THEN (price - prev_price) * quantity
                ELSE 0
              END
            ) as pnl
          FROM trade_pnl
          WHERE trade_seq > 1  -- Only consider sells after buys
          GROUP BY symbol
        )
        SELECT COALESCE(SUM(pnl), 0) as total_realized_pnl
        FROM realized_trades`,
        [this.userId, start, end]
      );

      return parseFloat(result.rows[0].total_realized_pnl) || 0;
    } catch (error) {
      logger.error(`Failed to calculate realized P&L for user ${this.userId}:`, error);
      throw error;
    }
  }

  async calculateUnrealizedPnL(): Promise<number> {
    try {
      // Calculate unrealized P&L from current positions and holdings
      const result = await DatabaseService.query(
        `SELECT 
          COALESCE(
            (SELECT SUM(unrealised) FROM zerodha_positions WHERE user_id = $1 AND position_date = CURRENT_DATE), 0
          ) +
          COALESCE(
            (SELECT SUM((last_price - average_price) * quantity) FROM zerodha_holdings WHERE user_id = $1), 0
          ) as total_unrealized_pnl`,
        [this.userId]
      );

      return parseFloat(result.rows[0].total_unrealized_pnl) || 0;
    } catch (error) {
      logger.error(`Failed to calculate unrealized P&L for user ${this.userId}:`, error);
      throw error;
    }
  }

  async calculateDayPnL(): Promise<number> {
    try {
      // Calculate day P&L from positions and holdings
      const result = await DatabaseService.query(
        `SELECT 
          COALESCE(
            (SELECT SUM(pnl) FROM zerodha_positions WHERE user_id = $1 AND position_date = CURRENT_DATE), 0
          ) +
          COALESCE(
            (SELECT SUM(day_change) FROM zerodha_holdings WHERE user_id = $1), 0
          ) as total_day_pnl`,
        [this.userId]
      );

      return parseFloat(result.rows[0].total_day_pnl) || 0;
    } catch (error) {
      logger.error(`Failed to calculate day P&L for user ${this.userId}:`, error);
      throw error;
    }
  }

  async getPnLBreakdown(): Promise<PnLBreakdown> {
    try {
      const [realizedPnL, unrealizedPnL, dayPnL] = await Promise.all([
        this.calculateRealizedPnL(),
        this.calculateUnrealizedPnL(),
        this.calculateDayPnL()
      ]);

      // Get positions and holdings P&L separately
      const positionsResult = await DatabaseService.query(
        `SELECT COALESCE(SUM(unrealised), 0) as positions_pnl
         FROM zerodha_positions 
         WHERE user_id = $1 AND position_date = CURRENT_DATE`,
        [this.userId]
      );

      const holdingsResult = await DatabaseService.query(
        `SELECT COALESCE(SUM(pnl), 0) as holdings_pnl
         FROM zerodha_holdings 
         WHERE user_id = $1`,
        [this.userId]
      );

      const positionsPnL = parseFloat(positionsResult.rows[0].positions_pnl) || 0;
      const holdingsPnL = parseFloat(holdingsResult.rows[0].holdings_pnl) || 0;

      return {
        realized_pnl: realizedPnL,
        unrealized_pnl: unrealizedPnL,
        day_pnl: dayPnL,
        total_pnl: realizedPnL + unrealizedPnL,
        positions_pnl: positionsPnL,
        holdings_pnl: holdingsPnL
      };
    } catch (error) {
      logger.error(`Failed to get P&L breakdown for user ${this.userId}:`, error);
      throw error;
    }
  }

  async getPnLBySymbol(): Promise<PnLBySymbol[]> {
    try {
      // Get P&L breakdown by symbol from both positions and holdings
      const result = await DatabaseService.query(
        `WITH symbol_pnl AS (
          -- P&L from current positions
          SELECT 
            tradingsymbol as symbol,
            exchange,
            SUM(realised) as realized_pnl,
            SUM(unrealised) as unrealized_pnl,
            SUM(pnl) as day_pnl,
            SUM(quantity) as quantity,
            AVG(average_price) as average_price,
            MAX(last_price) as current_price,
            'position' as source
          FROM zerodha_positions 
          WHERE user_id = $1 AND position_date = CURRENT_DATE
          GROUP BY tradingsymbol, exchange
          
          UNION ALL
          
          -- P&L from holdings
          SELECT 
            tradingsymbol as symbol,
            exchange,
            0 as realized_pnl,  -- Holdings don't have realized P&L until sold
            (last_price - average_price) * quantity as unrealized_pnl,
            day_change as day_pnl,
            quantity::decimal as quantity,
            average_price,
            last_price as current_price,
            'holding' as source
          FROM zerodha_holdings 
          WHERE user_id = $1
        )
        SELECT 
          symbol,
          exchange,
          SUM(realized_pnl) as realized_pnl,
          SUM(unrealized_pnl) as unrealized_pnl,
          SUM(day_pnl) as day_pnl,
          SUM(realized_pnl + unrealized_pnl) as total_pnl,
          SUM(quantity) as quantity,
          AVG(average_price) as average_price,
          MAX(current_price) as current_price
        FROM symbol_pnl
        GROUP BY symbol, exchange
        HAVING SUM(quantity) != 0  -- Only show symbols with non-zero positions
        ORDER BY ABS(SUM(realized_pnl + unrealized_pnl)) DESC`,
        [this.userId]
      );

      return result.rows.map((row: any) => ({
        symbol: row.symbol,
        exchange: row.exchange,
        realized_pnl: parseFloat(row.realized_pnl) || 0,
        unrealized_pnl: parseFloat(row.unrealized_pnl) || 0,
        day_pnl: parseFloat(row.day_pnl) || 0,
        total_pnl: parseFloat(row.total_pnl) || 0,
        quantity: parseFloat(row.quantity) || 0,
        average_price: parseFloat(row.average_price) || 0,
        current_price: parseFloat(row.current_price) || 0
      }));
    } catch (error) {
      logger.error(`Failed to get P&L by symbol for user ${this.userId}:`, error);
      throw error;
    }
  }

  async getPnLHistory(days: number = 30): Promise<PnLHistory[]> {
    try {
      // Get historical P&L data from portfolio summary cache
      const result = await DatabaseService.query(
        `SELECT 
          summary_date as date,
          total_pnl as total_pnl,
          0 as realized_pnl,  -- We'll calculate this separately if needed
          total_pnl as unrealized_pnl,  -- Approximation
          total_current_value as portfolio_value
         FROM zerodha_portfolio_summary
         WHERE user_id = $1 
           AND summary_date >= CURRENT_DATE - INTERVAL '${days} days'
         ORDER BY summary_date DESC`,
        [this.userId]
      );

      return result.rows.map((row: any) => ({
        date: new Date(row.date),
        realized_pnl: parseFloat(row.realized_pnl) || 0,
        unrealized_pnl: parseFloat(row.unrealized_pnl) || 0,
        total_pnl: parseFloat(row.total_pnl) || 0,
        portfolio_value: parseFloat(row.portfolio_value) || 0
      }));
    } catch (error) {
      logger.error(`Failed to get P&L history for user ${this.userId}:`, error);
      throw error;
    }
  }

  async cachePnLData(pnlBreakdown: PnLBreakdown): Promise<void> {
    try {
      const cacheKey = `pnl:${this.userId}`;
      const cacheData = {
        ...pnlBreakdown,
        timestamp: new Date().toISOString()
      };
      
      // Cache for 1 minute
      await RedisService.set(cacheKey, JSON.stringify(cacheData), 60);
      
      logger.debug(`Cached P&L data for user ${this.userId}`);
    } catch (error) {
      logger.error(`Failed to cache P&L data for user ${this.userId}:`, error);
      // Don't throw error for caching failures
    }
  }

  async getCachedPnLData(): Promise<PnLBreakdown | null> {
    try {
      const cacheKey = `pnl:${this.userId}`;
      const cachedData = await RedisService.get(cacheKey);
      
      if (cachedData) {
        const data = JSON.parse(cachedData);
        // Remove timestamp before returning
        delete data.timestamp;
        return data;
      }
      
      return null;
    } catch (error) {
      logger.error(`Failed to get cached P&L data for user ${this.userId}:`, error);
      return null;
    }
  }

  async calculatePortfolioMetrics(): Promise<{
    total_investment: number;
    current_value: number;
    total_return: number;
    total_return_percentage: number;
    day_change: number;
    day_change_percentage: number;
  }> {
    try {
      const result = await DatabaseService.query(
        `SELECT 
          -- Total investment (cost basis)
          COALESCE(
            (SELECT SUM(quantity * average_price) FROM zerodha_holdings WHERE user_id = $1), 0
          ) +
          COALESCE(
            (SELECT SUM(ABS(quantity) * average_price) FROM zerodha_positions WHERE user_id = $1 AND position_date = CURRENT_DATE), 0
          ) as total_investment,
          
          -- Current value
          COALESCE(
            (SELECT SUM(quantity * last_price) FROM zerodha_holdings WHERE user_id = $1), 0
          ) +
          COALESCE(
            (SELECT SUM(ABS(quantity) * last_price) FROM zerodha_positions WHERE user_id = $1 AND position_date = CURRENT_DATE), 0
          ) as current_value,
          
          -- Day change
          COALESCE(
            (SELECT SUM(day_change) FROM zerodha_holdings WHERE user_id = $1), 0
          ) +
          COALESCE(
            (SELECT SUM(pnl) FROM zerodha_positions WHERE user_id = $1 AND position_date = CURRENT_DATE), 0
          ) as day_change`,
        [this.userId]
      );

      const row = result.rows[0];
      const totalInvestment = parseFloat(row.total_investment) || 0;
      const currentValue = parseFloat(row.current_value) || 0;
      const dayChange = parseFloat(row.day_change) || 0;

      const totalReturn = currentValue - totalInvestment;
      const totalReturnPercentage = totalInvestment > 0 ? (totalReturn / totalInvestment) * 100 : 0;
      const dayChangePercentage = totalInvestment > 0 ? (dayChange / totalInvestment) * 100 : 0;

      return {
        total_investment: totalInvestment,
        current_value: currentValue,
        total_return: totalReturn,
        total_return_percentage: totalReturnPercentage,
        day_change: dayChange,
        day_change_percentage: dayChangePercentage
      };
    } catch (error) {
      logger.error(`Failed to calculate portfolio metrics for user ${this.userId}:`, error);
      throw error;
    }
  }
}