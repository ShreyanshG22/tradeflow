import { ZerodhaInstrument } from '@tradeflow/types';
import { RedisService } from './RedisService';
import { logger } from '../utils/logger';

export class InstrumentService {
  private redisService: RedisService;

  constructor() {
    this.redisService = new RedisService();
  }

  /**
   * Get instrument details by trading symbol and exchange
   */
  async getInstrument(tradingsymbol: string, exchange: string): Promise<ZerodhaInstrument> {
    try {
      const cacheKey = `instrument:${exchange}:${tradingsymbol}`;
      
      // Try to get from cache first
      const cachedInstrument = await this.redisService.get(cacheKey);
      if (cachedInstrument) {
        return JSON.parse(cachedInstrument);
      }

      // If not in cache, this would typically fetch from database or API
      // For now, we'll throw an error as the instrument service should be implemented
      // as part of the market data service
      throw new Error(`Instrument ${tradingsymbol} not found in cache for exchange ${exchange}`);

    } catch (error) {
      logger.error(`Error fetching instrument ${tradingsymbol}:`, error);
      throw error;
    }
  }

  /**
   * Check if instrument exists
   */
  async instrumentExists(tradingsymbol: string, exchange: string): Promise<boolean> {
    try {
      await this.getInstrument(tradingsymbol, exchange);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get multiple instruments
   */
  async getInstruments(symbols: Array<{tradingsymbol: string, exchange: string}>): Promise<ZerodhaInstrument[]> {
    const instruments: ZerodhaInstrument[] = [];
    
    for (const symbol of symbols) {
      try {
        const instrument = await this.getInstrument(symbol.tradingsymbol, symbol.exchange);
        instruments.push(instrument);
      } catch (error) {
        logger.warn(`Instrument not found: ${symbol.tradingsymbol} on ${symbol.exchange}`);
      }
    }

    return instruments;
  }
}