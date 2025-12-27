import { BaseRepository, DatabaseConfig } from './BaseRepository';
import { createLogger } from '../logger';

const logger = createLogger('ZerodhaPositionRepository');

export interface ZerodhaPosition {
  id: string;
  user_id: string;
  tradingsymbol: string;
  exchange: string;
  instrument_token?: number;
  product: 'CNC' | 'MIS' | 'NRML';
  quantity: number;
  overnight_quantity?: number;
  multiplier?: number;
  average_price: number;
  close_price?: number;
  last_price?: number;
  value?: number;
  pnl?: number;
  m2m?: number;
  unrealised?: number;
  realised?: number;
  buy_quantity?: number;
  buy_price?: number;
  buy_value?: number;
  buy_m2m?: number;
  sell_quantity?: number;
  sell_price?: number;
  sell_value?: number;
  sell_m2m?: number;
  day_buy_quantity?: number;
  day_buy_price?: number;
  day_buy_value?: number;
  day_sell_quantity?: number;
  day_sell_price?: number;
  day_sell_value?: number;
  position_date: string;
  created_at: string;
  updated_at: string;
}

export interface CreateZerodhaPositionData {
  user_id: string;
  tradingsymbol: string;
  exchange: string;
  instrument_token?: number;
  product: 'CNC' | 'MIS' | 'NRML';
  quantity: number;
  overnight_quantity?: number;
  multiplier?: number;
  average_price: number;
  close_price?: number;
  last_price?: number;
  value?: number;
  pnl?: number;
  m2m?: number;
  unrealised?: number;
  realised?: number;
  buy_quantity?: number;
  buy_price?: number;
  buy_value?: number;
  buy_m2m?: number;
  sell_quantity?: number;
  sell_price?: number;
  sell_value?: number;
  sell_m2m?: number;
  day_buy_quantity?: number;
  day_buy_price?: number;
  day_buy_value?: number;
  day_sell_quantity?: number;
  day_sell_price?: number;
  day_sell_value?: number;
  position_date: string;
}

export interface UpdateZerodhaPositionData {
  quantity?: number;
  overnight_quantity?: number;
  average_price?: number;
  close_price?: number;
  last_price?: number;
  value?: number;
  pnl?: number;
  m2m?: number;
  unrealised?: number;
  realised?: number;
  buy_quantity?: number;
  buy_price?: number;
  buy_value?: number;
  buy_m2m?: number;
  sell_quantity?: number;
  sell_price?: number;
  sell_value?: number;
  sell_m2m?: number;
  day_buy_quantity?: number;
  day_buy_price?: number;
  day_buy_value?: number;
  day_sell_quantity?: number;
  day_sell_price?: number;
  day_sell_value?: number;
}

export interface PositionFilters {
  user_id?: string;
  exchange?: string;
  tradingsymbol?: string;
  product?: 'CNC' | 'MIS' | 'NRML';
  position_date?: string;
  date_from?: string;
  date_to?: string;
}

export class ZerodhaPositionRepository extends BaseRepository {
  constructor(config: DatabaseConfig) {
    super(config, 'zerodha.positions');
  }

  /**
   * Create or update position (upsert)
   */
  public async upsertPosition(data: CreateZerodhaPositionData): Promise<ZerodhaPosition> {
    try {
      const position = await this.upsert<ZerodhaPosition>(
        data,
        ['user_id', 'tradingsymbol', 'exchange', 'product', 'position_date']
      );
      
      logger.info('Position upserted', { 
        userId: position.user_id,
        symbol: position.tradingsymbol,
        exchange: position.exchange,
        product: position.product,
        quantity: position.quantity
      });
      
      return position;
    } catch (error) {
      logger.error('Failed to upsert position', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId: data.user_id,
        symbol: data.tradingsymbol
      });
      throw error;
    }
  }

  /**
   * Get positions by user ID
   */
  public async getPositionsByUserId(
    userId: string,
    positionDate?: string
  ): Promise<ZerodhaPosition[]> {
    try {
      const criteria: any = { user_id: userId };
      if (positionDate) {
        criteria.position_date = positionDate;
      }

      return await this.findBy<ZerodhaPosition>(
        criteria,
        'tradingsymbol ASC'
      );
    } catch (error) {
      logger.error('Failed to get positions by user ID', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId,
        positionDate
      });
      return [];
    }
  }

  /**
   * Get position by symbol
   */
  public async getPositionBySymbol(
    userId: string,
    tradingsymbol: string,
    exchange: string,
    product: string,
    positionDate: string
  ): Promise<ZerodhaPosition | null> {
    try {
      const positions = await this.findBy<ZerodhaPosition>({
        user_id: userId,
        tradingsymbol,
        exchange,
        product,
        position_date: positionDate
      });
      
      return positions.length > 0 ? positions[0] : null;
    } catch (error) {
      logger.error('Failed to get position by symbol', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId,
        tradingsymbol,
        exchange,
        product
      });
      return null;
    }
  }

  /**
   * Get positions with filters
   */
  public async getPositionsWithFilters(
    filters: PositionFilters,
    limit: number = 100,
    offset: number = 0
  ): Promise<ZerodhaPosition[]> {
    try {
      const whereConditions: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;

      // Build WHERE clause dynamically
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined) {
          if (key === 'date_from') {
            whereConditions.push(`position_date >= $${paramIndex}`);
            values.push(value);
            paramIndex++;
          } else if (key === 'date_to') {
            whereConditions.push(`position_date <= $${paramIndex}`);
            values.push(value);
            paramIndex++;
          } else {
            whereConditions.push(`${key} = $${paramIndex}`);
            values.push(value);
            paramIndex++;
          }
        }
      });

      let query = `SELECT * FROM ${this.tableName}`;
      if (whereConditions.length > 0) {
        query += ` WHERE ${whereConditions.join(' AND ')}`;
      }
      query += ` ORDER BY position_date DESC, tradingsymbol ASC LIMIT ${limit} OFFSET ${offset}`;

      const result = await this.query<ZerodhaPosition>(query, values);
      return result.rows;
    } catch (error) {
      logger.error('Failed to get positions with filters', {
        error: error instanceof Error ? error.message : 'Unknown error',
        filters
      });
      return [];
    }
  }

  /**
   * Update position prices and P&L
   */
  public async updatePositionPrices(
    userId: string,
    tradingsymbol: string,
    exchange: string,
    product: string,
    positionDate: string,
    priceData: {
      last_price?: number;
      close_price?: number;
    }
  ): Promise<ZerodhaPosition | null> {
    try {
      const result = await this.query<ZerodhaPosition>(
        `UPDATE ${this.tableName} 
         SET last_price = COALESCE($6, last_price),
             close_price = COALESCE($7, close_price),
             updated_at = NOW()
         WHERE user_id = $1 AND tradingsymbol = $2 AND exchange = $3 
               AND product = $4 AND position_date = $5
         RETURNING *`,
        [
          userId, 
          tradingsymbol, 
          exchange, 
          product, 
          positionDate,
          priceData.last_price,
          priceData.close_price
        ]
      );

      if (result.rows.length > 0) {
        logger.debug('Position prices updated', { 
          userId,
          tradingsymbol,
          exchange,
          product,
          lastPrice: priceData.last_price,
          closePrice: priceData.close_price
        });
        return result.rows[0];
      }

      return null;
    } catch (error) {
      logger.error('Failed to update position prices', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId,
        tradingsymbol,
        exchange
      });
      throw error;
    }
  }

  /**
   * Get current positions (today's date)
   */
  public async getCurrentPositions(userId: string): Promise<ZerodhaPosition[]> {
    try {
      const today = new Date().toISOString().split('T')[0];
      return await this.getPositionsByUserId(userId, today);
    } catch (error) {
      logger.error('Failed to get current positions', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId
      });
      return [];
    }
  }

  /**
   * Get position summary for user
   */
  public async getPositionSummary(userId: string, positionDate?: string): Promise<{
    total_positions: number;
    total_value: number;
    total_pnl: number;
    total_unrealised: number;
    total_realised: number;
    profitable_positions: number;
    losing_positions: number;
  }> {
    try {
      let query = `
        SELECT 
          COUNT(*) as total_positions,
          COALESCE(SUM(value), 0) as total_value,
          COALESCE(SUM(pnl), 0) as total_pnl,
          COALESCE(SUM(unrealised), 0) as total_unrealised,
          COALESCE(SUM(realised), 0) as total_realised,
          COUNT(CASE WHEN pnl > 0 THEN 1 END) as profitable_positions,
          COUNT(CASE WHEN pnl < 0 THEN 1 END) as losing_positions
        FROM ${this.tableName} 
        WHERE user_id = $1
      `;
      
      const params = [userId];
      
      if (positionDate) {
        query += ' AND position_date = $2';
        params.push(positionDate);
      }

      const result = await this.query<{
        total_positions: string;
        total_value: string;
        total_pnl: string;
        total_unrealised: string;
        total_realised: string;
        profitable_positions: string;
        losing_positions: string;
      }>(query, params);

      const summary = result.rows[0];
      return {
        total_positions: parseInt(summary.total_positions, 10),
        total_value: parseFloat(summary.total_value),
        total_pnl: parseFloat(summary.total_pnl),
        total_unrealised: parseFloat(summary.total_unrealised),
        total_realised: parseFloat(summary.total_realised),
        profitable_positions: parseInt(summary.profitable_positions, 10),
        losing_positions: parseInt(summary.losing_positions, 10)
      };
    } catch (error) {
      logger.error('Failed to get position summary', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId,
        positionDate
      });
      return {
        total_positions: 0,
        total_value: 0,
        total_pnl: 0,
        total_unrealised: 0,
        total_realised: 0,
        profitable_positions: 0,
        losing_positions: 0
      };
    }
  }

  /**
   * Close position (set quantity to 0)
   */
  public async closePosition(
    userId: string,
    tradingsymbol: string,
    exchange: string,
    product: string,
    positionDate: string
  ): Promise<ZerodhaPosition | null> {
    try {
      const result = await this.query<ZerodhaPosition>(
        `UPDATE ${this.tableName} 
         SET quantity = 0, updated_at = NOW()
         WHERE user_id = $1 AND tradingsymbol = $2 AND exchange = $3 
               AND product = $4 AND position_date = $5
         RETURNING *`,
        [userId, tradingsymbol, exchange, product, positionDate]
      );

      if (result.rows.length > 0) {
        logger.info('Position closed', { 
          userId,
          tradingsymbol,
          exchange,
          product
        });
        return result.rows[0];
      }

      return null;
    } catch (error) {
      logger.error('Failed to close position', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId,
        tradingsymbol,
        exchange
      });
      throw error;
    }
  }

  /**
   * Delete old positions (cleanup)
   */
  public async deleteOldPositions(daysOld: number = 365): Promise<number> {
    try {
      const result = await this.query(
        `DELETE FROM ${this.tableName} 
         WHERE position_date < CURRENT_DATE - INTERVAL '${daysOld} days'`
      );

      const deletedCount = result.rowCount;
      
      if (deletedCount > 0) {
        logger.info('Old positions deleted', { deletedCount, daysOld });
      }

      return deletedCount;
    } catch (error) {
      logger.error('Failed to delete old positions', {
        error: error instanceof Error ? error.message : 'Unknown error',
        daysOld
      });
      return 0;
    }
  }
}