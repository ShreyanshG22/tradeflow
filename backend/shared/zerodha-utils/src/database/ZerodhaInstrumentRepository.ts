import { BaseRepository, DatabaseConfig } from './BaseRepository';
import { createLogger } from '../logger';

const logger = createLogger('ZerodhaInstrumentRepository');

export interface ZerodhaInstrument {
  id: string;
  instrument_token: number;
  exchange_token: number;
  tradingsymbol: string;
  name?: string;
  last_price?: number;
  expiry?: string;
  strike?: number;
  tick_size: number;
  lot_size: number;
  instrument_type: 'EQ' | 'FUT' | 'CE' | 'PE';
  segment: string;
  exchange: string;
  created_at: string;
  updated_at: string;
}

export interface CreateZerodhaInstrumentData {
  instrument_token: number;
  exchange_token: number;
  tradingsymbol: string;
  name?: string;
  last_price?: number;
  expiry?: string;
  strike?: number;
  tick_size: number;
  lot_size: number;
  instrument_type: 'EQ' | 'FUT' | 'CE' | 'PE';
  segment: string;
  exchange: string;
}

export interface InstrumentSearchFilters {
  exchange?: string;
  segment?: string;
  instrument_type?: 'EQ' | 'FUT' | 'CE' | 'PE';
  tradingsymbol?: string;
  name?: string;
}

export interface InstrumentSearchResult {
  instrument_token: number;
  tradingsymbol: string;
  name?: string;
  exchange: string;
  segment: string;
  instrument_type: string;
  lot_size: number;
  tick_size: number;
  last_price?: number;
}

export class ZerodhaInstrumentRepository extends BaseRepository {
  constructor(config: DatabaseConfig) {
    super(config, 'zerodha.instruments');
  }

  /**
   * Bulk insert instruments (for initial data load)
   */
  public async bulkInsertInstruments(instruments: CreateZerodhaInstrumentData[]): Promise<number> {
    if (instruments.length === 0) {
      return 0;
    }

    try {
      return await this.transaction(async (client) => {
        // Clear existing instruments for the exchanges being updated
        const exchanges = [...new Set(instruments.map(i => i.exchange))];
        await client.query(
          `DELETE FROM ${this.tableName} WHERE exchange = ANY($1)`,
          [exchanges]
        );

        // Prepare bulk insert
        const columns = Object.keys(instruments[0]);
        const values: any[] = [];
        const placeholders: string[] = [];

        instruments.forEach((instrument, index) => {
          const rowPlaceholders = columns.map((_, colIndex) => 
            `$${index * columns.length + colIndex + 1}`
          ).join(', ');
          placeholders.push(`(${rowPlaceholders})`);
          values.push(...Object.values(instrument));
        });

        const query = `
          INSERT INTO ${this.tableName} (${columns.join(', ')}) 
          VALUES ${placeholders.join(', ')}
          ON CONFLICT (instrument_token) 
          DO UPDATE SET 
            exchange_token = EXCLUDED.exchange_token,
            tradingsymbol = EXCLUDED.tradingsymbol,
            name = EXCLUDED.name,
            last_price = EXCLUDED.last_price,
            expiry = EXCLUDED.expiry,
            strike = EXCLUDED.strike,
            tick_size = EXCLUDED.tick_size,
            lot_size = EXCLUDED.lot_size,
            instrument_type = EXCLUDED.instrument_type,
            segment = EXCLUDED.segment,
            exchange = EXCLUDED.exchange,
            updated_at = NOW()
        `;

        const result = await client.query(query, values);
        
        logger.info('Bulk instruments inserted/updated', { 
          count: instruments.length,
          exchanges: exchanges.join(', ')
        });

        return result.rowCount || 0;
      });
    } catch (error) {
      logger.error('Failed to bulk insert instruments', {
        error: error instanceof Error ? error.message : 'Unknown error',
        count: instruments.length
      });
      throw error;
    }
  }

  /**
   * Get instrument by token
   */
  public async getInstrumentByToken(instrumentToken: number): Promise<ZerodhaInstrument | null> {
    try {
      const instruments = await this.findBy<ZerodhaInstrument>({ 
        instrument_token: instrumentToken 
      });
      return instruments.length > 0 ? instruments[0] : null;
    } catch (error) {
      logger.error('Failed to get instrument by token', {
        error: error instanceof Error ? error.message : 'Unknown error',
        instrumentToken
      });
      return null;
    }
  }

  /**
   * Get instrument by trading symbol
   */
  public async getInstrumentBySymbol(
    tradingsymbol: string,
    exchange: string
  ): Promise<ZerodhaInstrument | null> {
    try {
      const instruments = await this.findBy<ZerodhaInstrument>({ 
        tradingsymbol,
        exchange
      });
      return instruments.length > 0 ? instruments[0] : null;
    } catch (error) {
      logger.error('Failed to get instrument by symbol', {
        error: error instanceof Error ? error.message : 'Unknown error',
        tradingsymbol,
        exchange
      });
      return null;
    }
  }

  /**
   * Search instruments by text
   */
  public async searchInstruments(
    searchText: string,
    filters: InstrumentSearchFilters = {},
    limit: number = 50
  ): Promise<InstrumentSearchResult[]> {
    try {
      const whereConditions: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;

      // Add text search condition
      if (searchText.trim()) {
        whereConditions.push(`(
          tradingsymbol ILIKE $${paramIndex} OR 
          name ILIKE $${paramIndex}
        )`);
        values.push(`%${searchText.trim()}%`);
        paramIndex++;
      }

      // Add filter conditions
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined) {
          whereConditions.push(`${key} = $${paramIndex}`);
          values.push(value);
          paramIndex++;
        }
      });

      let query = `
        SELECT 
          instrument_token,
          tradingsymbol,
          name,
          exchange,
          segment,
          instrument_type,
          lot_size,
          tick_size,
          last_price
        FROM ${this.tableName}
      `;

      if (whereConditions.length > 0) {
        query += ` WHERE ${whereConditions.join(' AND ')}`;
      }

      query += ` ORDER BY 
        CASE 
          WHEN tradingsymbol ILIKE $1 THEN 1
          WHEN name ILIKE $1 THEN 2
          ELSE 3
        END,
        tradingsymbol ASC
        LIMIT ${limit}
      `;

      const result = await this.query<InstrumentSearchResult>(query, values);
      
      logger.debug('Instruments searched', { 
        searchText, 
        filters, 
        resultCount: result.rows.length 
      });

      return result.rows;
    } catch (error) {
      logger.error('Failed to search instruments', {
        error: error instanceof Error ? error.message : 'Unknown error',
        searchText,
        filters
      });
      return [];
    }
  }

  /**
   * Get instruments by exchange
   */
  public async getInstrumentsByExchange(
    exchange: string,
    instrumentType?: 'EQ' | 'FUT' | 'CE' | 'PE',
    limit: number = 1000,
    offset: number = 0
  ): Promise<ZerodhaInstrument[]> {
    try {
      const criteria: any = { exchange };
      if (instrumentType) {
        criteria.instrument_type = instrumentType;
      }

      return await this.findBy<ZerodhaInstrument>(
        criteria,
        'tradingsymbol ASC',
        limit,
        offset
      );
    } catch (error) {
      logger.error('Failed to get instruments by exchange', {
        error: error instanceof Error ? error.message : 'Unknown error',
        exchange,
        instrumentType
      });
      return [];
    }
  }

  /**
   * Update instrument price
   */
  public async updateInstrumentPrice(
    instrumentToken: number,
    lastPrice: number
  ): Promise<ZerodhaInstrument | null> {
    try {
      const result = await this.query<ZerodhaInstrument>(
        `UPDATE ${this.tableName} 
         SET last_price = $2, updated_at = NOW() 
         WHERE instrument_token = $1 
         RETURNING *`,
        [instrumentToken, lastPrice]
      );

      if (result.rows.length > 0) {
        logger.debug('Instrument price updated', { 
          instrumentToken, 
          lastPrice 
        });
        return result.rows[0];
      }

      return null;
    } catch (error) {
      logger.error('Failed to update instrument price', {
        error: error instanceof Error ? error.message : 'Unknown error',
        instrumentToken,
        lastPrice
      });
      throw error;
    }
  }

  /**
   * Get popular instruments (most searched/traded)
   */
  public async getPopularInstruments(
    exchange?: string,
    limit: number = 20
  ): Promise<InstrumentSearchResult[]> {
    try {
      let query = `
        SELECT 
          instrument_token,
          tradingsymbol,
          name,
          exchange,
          segment,
          instrument_type,
          lot_size,
          tick_size,
          last_price
        FROM ${this.tableName}
        WHERE instrument_type = 'EQ'
      `;

      const values: any[] = [];
      if (exchange) {
        query += ' AND exchange = $1';
        values.push(exchange);
      }

      query += ` ORDER BY 
        CASE 
          WHEN name IS NOT NULL THEN 1 
          ELSE 2 
        END,
        tradingsymbol ASC
        LIMIT ${limit}
      `;

      const result = await this.query<InstrumentSearchResult>(query, values);
      return result.rows;
    } catch (error) {
      logger.error('Failed to get popular instruments', {
        error: error instanceof Error ? error.message : 'Unknown error',
        exchange
      });
      return [];
    }
  }

  /**
   * Get instrument statistics
   */
  public async getInstrumentStats(): Promise<{
    total: number;
    by_exchange: Record<string, number>;
    by_type: Record<string, number>;
  }> {
    try {
      const totalResult = await this.query<{ count: string }>(
        `SELECT COUNT(*) as count FROM ${this.tableName}`
      );

      const exchangeResult = await this.query<{ exchange: string; count: string }>(
        `SELECT exchange, COUNT(*) as count FROM ${this.tableName} GROUP BY exchange`
      );

      const typeResult = await this.query<{ instrument_type: string; count: string }>(
        `SELECT instrument_type, COUNT(*) as count FROM ${this.tableName} GROUP BY instrument_type`
      );

      const byExchange: Record<string, number> = {};
      exchangeResult.rows.forEach(row => {
        byExchange[row.exchange] = parseInt(row.count, 10);
      });

      const byType: Record<string, number> = {};
      typeResult.rows.forEach(row => {
        byType[row.instrument_type] = parseInt(row.count, 10);
      });

      return {
        total: parseInt(totalResult.rows[0].count, 10),
        by_exchange: byExchange,
        by_type: byType
      };
    } catch (error) {
      logger.error('Failed to get instrument statistics', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return {
        total: 0,
        by_exchange: {},
        by_type: {}
      };
    }
  }

  /**
   * Get instruments for options chain
   */
  public async getOptionsChain(
    underlyingSymbol: string,
    exchange: string,
    expiry?: string
  ): Promise<ZerodhaInstrument[]> {
    try {
      let query = `
        SELECT * FROM ${this.tableName}
        WHERE exchange = $1 
        AND tradingsymbol LIKE $2
        AND instrument_type IN ('CE', 'PE')
      `;

      const values = [exchange, `${underlyingSymbol}%`];

      if (expiry) {
        query += ' AND expiry = $3';
        values.push(expiry);
      }

      query += ' ORDER BY expiry ASC, strike ASC, instrument_type ASC';

      const result = await this.query<ZerodhaInstrument>(query, values);
      return result.rows;
    } catch (error) {
      logger.error('Failed to get options chain', {
        error: error instanceof Error ? error.message : 'Unknown error',
        underlyingSymbol,
        exchange,
        expiry
      });
      return [];
    }
  }
}