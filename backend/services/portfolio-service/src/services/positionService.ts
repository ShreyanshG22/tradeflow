import { databaseService } from './database';
import { redisService } from './redis';
import { logger } from '../utils/logger';
import { 
  Position, 
  PositionFilter,
  MarketPrice,
  PositionValuation
} from '../types';

export class PositionService {

  async getPositions(filter: PositionFilter): Promise<Position[]> {
    try {
      let query = `
        SELECT * FROM trading.positions 
        WHERE portfolio_id = $1
      `;
      const params: any[] = [filter.portfolioId];
      let paramIndex = 2;

      if (filter.symbol) {
        query += ` AND symbol = $${paramIndex}`;
        params.push(filter.symbol);
        paramIndex++;
      }

      if (filter.side) {
        query += ` AND side = $${paramIndex}`;
        params.push(filter.side);
        paramIndex++;
      }

      if (filter.minQuantity !== undefined) {
        query += ` AND ABS(quantity) >= $${paramIndex}`;
        params.push(filter.minQuantity);
        paramIndex++;
      }

      // Only return positions with non-zero quantity
      query += ` AND quantity != 0`;
      query += ` ORDER BY updated_at DESC`;

      if (filter.limit) {
        query += ` LIMIT $${paramIndex}`;
        params.push(filter.limit);
        paramIndex++;
      }

      if (filter.offset) {
        query += ` OFFSET $${paramIndex}`;
        params.push(filter.offset);
      }

      const result = await databaseService.query(query, params);
      
      return result.rows.map(row => this.mapDbRowToPosition(row));
    } catch (error) {
      logger.error('Failed to get positions', { filter, error });
      throw error;
    }
  }

  async getPosition(positionId: string): Promise<Position | null> {
    try {
      const result = await databaseService.query(`
        SELECT * FROM trading.positions WHERE id = $1
      `, [positionId]);

      if (result.rows.length === 0) {
        return null;
      }

      return this.mapDbRowToPosition(result.rows[0]);
    } catch (error) {
      logger.error('Failed to get position', { positionId, error });
      throw error;
    }
  }

  async updatePositionPrices(portfolioId: string, marketPrices: MarketPrice[]): Promise<void> {
    try {
      await databaseService.transaction(async (client) => {
        for (const price of marketPrices) {
          // Update current price and calculate market value and unrealized P&L
          await client.query(`
            UPDATE trading.positions 
            SET 
              current_price = $1,
              market_value = CASE 
                WHEN side = 'long' THEN quantity * $1
                WHEN side = 'short' THEN quantity * avg_price * 2 - quantity * $1
                ELSE 0
              END,
              unrealized_pnl = CASE 
                WHEN side = 'long' THEN (quantity * $1) - (quantity * avg_price)
                WHEN side = 'short' THEN (quantity * avg_price) - (quantity * $1)
                ELSE 0
              END,
              updated_at = NOW()
            WHERE portfolio_id = $2 AND symbol = $3 AND quantity != 0
          `, [price.price, portfolioId, price.symbol]);
        }

        // Update portfolio total value and unrealized P&L
        await client.query(`
          UPDATE trading.portfolios 
          SET 
            total_value = cash_balance + COALESCE((
              SELECT SUM(market_value) 
              FROM trading.positions 
              WHERE portfolio_id = $1 AND quantity != 0
            ), 0),
            unrealized_pnl = COALESCE((
              SELECT SUM(unrealized_pnl) 
              FROM trading.positions 
              WHERE portfolio_id = $1 AND quantity != 0
            ), 0),
            updated_at = NOW()
          WHERE id = $1
        `, [portfolioId]);
      });

      // Invalidate cached valuation
      await this.invalidateValuationCache(portfolioId);

      logger.debug('Position prices updated', { 
        portfolioId, 
        symbolsUpdated: marketPrices.map(p => p.symbol) 
      });
    } catch (error) {
      logger.error('Failed to update position prices', { portfolioId, marketPrices, error });
      throw error;
    }
  }

  async updatePositionFromTrade(
    portfolioId: string, 
    symbol: string, 
    side: 'buy' | 'sell', 
    quantity: number, 
    price: number
  ): Promise<Position> {
    try {
      return await databaseService.transaction(async (client) => {
        // Determine position side based on trade
        const positionSide = side === 'buy' ? 'long' : 'short';
        const quantityChange = side === 'buy' ? quantity : -quantity;

        // Check for existing position
        const existingResult = await client.query(`
          SELECT * FROM trading.positions 
          WHERE portfolio_id = $1 AND symbol = $2 AND side = $3
        `, [portfolioId, symbol, positionSide]);

        let position: Position;

        if (existingResult.rows.length > 0) {
          // Update existing position
          const existing = existingResult.rows[0];
          const currentQuantity = parseFloat(existing.quantity);
          const currentAvgPrice = parseFloat(existing.avg_price);
          
          const newQuantity = currentQuantity + Math.abs(quantityChange);
          const newAvgPrice = newQuantity > 0 
            ? ((currentQuantity * currentAvgPrice) + (Math.abs(quantityChange) * price)) / newQuantity
            : price;

          const updateResult = await client.query(`
            UPDATE trading.positions 
            SET 
              quantity = $1,
              avg_price = $2,
              updated_at = NOW()
            WHERE id = $3
            RETURNING *
          `, [newQuantity, newAvgPrice, existing.id]);

          position = this.mapDbRowToPosition(updateResult.rows[0]);
        } else {
          // Create new position
          const insertResult = await client.query(`
            INSERT INTO trading.positions (
              portfolio_id, symbol, quantity, avg_price, side
            ) VALUES ($1, $2, $3, $4, $5)
            RETURNING *
          `, [portfolioId, symbol, Math.abs(quantityChange), price, positionSide]);

          position = this.mapDbRowToPosition(insertResult.rows[0]);
        }

        // Update portfolio cash balance
        const cashChange = side === 'buy' ? -(quantity * price) : (quantity * price);
        await client.query(`
          UPDATE trading.portfolios 
          SET 
            cash_balance = cash_balance + $1,
            updated_at = NOW()
          WHERE id = $2
        `, [cashChange, portfolioId]);

        return position;
      });
    } catch (error) {
      logger.error('Failed to update position from trade', { 
        portfolioId, symbol, side, quantity, price, error 
      });
      throw error;
    }
  }

  async closePosition(positionId: string, price: number): Promise<void> {
    try {
      await databaseService.transaction(async (client) => {
        const positionResult = await client.query(`
          SELECT * FROM trading.positions WHERE id = $1
        `, [positionId]);

        if (positionResult.rows.length === 0) {
          throw new Error('Position not found');
        }

        const position = positionResult.rows[0];
        const quantity = parseFloat(position.quantity);
        const avgPrice = parseFloat(position.avg_price);
        
        // Calculate realized P&L
        const realizedPnl = position.side === 'long' 
          ? (price - avgPrice) * quantity
          : (avgPrice - price) * quantity;

        // Update position to zero quantity
        await client.query(`
          UPDATE trading.positions 
          SET 
            quantity = 0,
            current_price = $1,
            market_value = 0,
            unrealized_pnl = 0,
            realized_pnl = realized_pnl + $2,
            updated_at = NOW()
          WHERE id = $3
        `, [price, realizedPnl, positionId]);

        // Update portfolio cash and realized P&L
        const cashChange = position.side === 'long' 
          ? quantity * price 
          : quantity * (2 * avgPrice - price);

        await client.query(`
          UPDATE trading.portfolios 
          SET 
            cash_balance = cash_balance + $1,
            realized_pnl = realized_pnl + $2,
            updated_at = NOW()
          WHERE id = $3
        `, [cashChange, realizedPnl, position.portfolio_id]);
      });

      logger.info('Position closed', { positionId, price });
    } catch (error) {
      logger.error('Failed to close position', { positionId, price, error });
      throw error;
    }
  }

  async getPositionValuations(portfolioId: string): Promise<PositionValuation[]> {
    try {
      const result = await databaseService.query(`
        SELECT 
          pos.id as position_id,
          pos.symbol,
          pos.quantity,
          pos.avg_price,
          pos.current_price,
          pos.market_value,
          pos.unrealized_pnl,
          CASE 
            WHEN pos.avg_price > 0 AND pos.quantity != 0 THEN 
              (pos.unrealized_pnl / (pos.avg_price * ABS(pos.quantity))) * 100
            ELSE 0
          END as unrealized_pnl_percent
        FROM trading.positions pos
        WHERE pos.portfolio_id = $1 AND pos.quantity != 0
        ORDER BY ABS(pos.market_value) DESC
      `, [portfolioId]);

      return result.rows.map(row => ({
        positionId: row.position_id,
        symbol: row.symbol,
        quantity: parseFloat(row.quantity),
        avgPrice: parseFloat(row.avg_price),
        currentPrice: parseFloat(row.current_price) || parseFloat(row.avg_price),
        marketValue: parseFloat(row.market_value) || 0,
        unrealizedPnl: parseFloat(row.unrealized_pnl) || 0,
        unrealizedPnlPercent: parseFloat(row.unrealized_pnl_percent) || 0,
        dayChange: await this.calculateDayChange(row.symbol, parseFloat(row.current_price)),
        dayChangePercent: await this.calculateDayChangePercent(row.symbol, parseFloat(row.current_price))
      }));
    } catch (error) {
      logger.error('Failed to get position valuations', { portfolioId, error });
      throw error;
    }
  }

  private async calculateDayChange(symbol: string, currentPrice: number): Promise<number> {
    try {
      // Get yesterday's closing price from Redis cache or market data service
      const cacheKey = `price_history:${symbol}:daily`;
      const cachedData = await redisService.get(cacheKey);
      
      if (cachedData) {
        const priceHistory = JSON.parse(cachedData);
        const yesterdayClose = priceHistory.previousClose || currentPrice;
        return currentPrice - yesterdayClose;
      }
      
      // Fallback: fetch from market data service
      const marketDataResponse = await fetch(`${process.env.MARKET_DATA_SERVICE_URL}/api/market-data/quote/${symbol}`);
      if (marketDataResponse.ok) {
        const marketData = await marketDataResponse.json();
        const previousClose = marketData.data?.previousClose || currentPrice;
        return currentPrice - previousClose;
      }
      
      return 0;
    } catch (error) {
      logger.error('Failed to calculate day change', { symbol, error });
      return 0;
    }
  }

  private async calculateDayChangePercent(symbol: string, currentPrice: number): Promise<number> {
    try {
      const dayChange = await this.calculateDayChange(symbol, currentPrice);
      const previousClose = currentPrice - dayChange;
      
      if (previousClose === 0) return 0;
      
      return (dayChange / previousClose) * 100;
    } catch (error) {
      logger.error('Failed to calculate day change percent', { symbol, error });
      return 0;
    }
  }

  private mapDbRowToPosition(row: any): Position {
    return {
      id: row.id,
      portfolioId: row.portfolio_id,
      symbol: row.symbol,
      quantity: parseFloat(row.quantity),
      avgPrice: parseFloat(row.avg_price),
      currentPrice: row.current_price ? parseFloat(row.current_price) : undefined,
      marketValue: row.market_value ? parseFloat(row.market_value) : undefined,
      unrealizedPnl: parseFloat(row.unrealized_pnl) || 0,
      realizedPnl: parseFloat(row.realized_pnl) || 0,
      side: row.side,
      openedAt: new Date(row.opened_at),
      updatedAt: new Date(row.updated_at)
    };
  }

  private async invalidateValuationCache(portfolioId: string): Promise<void> {
    const key = `valuation:${portfolioId}`;
    await redisService.del(key);
  }
}

export const positionService = new PositionService();