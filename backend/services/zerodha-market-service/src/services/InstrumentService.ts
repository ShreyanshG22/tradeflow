import axios from 'axios';
import { ZerodhaAPIClient } from '@tradeflow/zerodha-utils';
import { ZerodhaInstrument, ZERODHA_CONSTANTS } from '@tradeflow/types';
import { createLogger } from '@tradeflow/zerodha-utils';
import { RedisService } from './RedisService';

const logger = createLogger('InstrumentService');

export interface InstrumentSearchResult {
  instrument_token: number;
  exchange_token: number;
  tradingsymbol: string;
  name: string;
  exchange: string;
  segment: string;
  instrument_type: string;
  lot_size: number;
  tick_size: number;
  last_price?: number;
}

export class InstrumentService {
  private redisService: RedisService;
  private apiClient: ZerodhaAPIClient;
  private instruments: Map<string, ZerodhaInstrument[]> = new Map();
  private instrumentTokenMap: Map<number, ZerodhaInstrument> = new Map();
  private isInitialized: boolean = false;

  constructor(redisService: RedisService) {
    this.redisService = redisService;
    this.apiClient = new ZerodhaAPIClient({
      apiKey: process.env.ZERODHA_API_KEY || '',
      timeout: 30000,
      debug: process.env.NODE_ENV === 'development',
    });
  }

  public async initialize(): Promise<void> {
    try {
      logger.info('Initializing instrument service...');
      
      // Try to load from cache first
      await this.loadFromCache();
      
      // If not cached or cache is stale, download fresh data
      if (!this.isInitialized) {
        await this.downloadInstruments();
      }
      
      logger.info('Instrument service initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize instrument service:', error);
      throw error;
    }
  }

  private async loadFromCache(): Promise<void> {
    try {
      const exchanges = ['NSE', 'BSE'];
      let loadedCount = 0;

      for (const exchange of exchanges) {
        const cachedInstruments = await this.redisService.getCachedInstruments(exchange);
        if (cachedInstruments && cachedInstruments.length > 0) {
          this.instruments.set(exchange, cachedInstruments);
          
          // Build token map
          cachedInstruments.forEach(instrument => {
            this.instrumentTokenMap.set(instrument.instrument_token, instrument);
          });
          
          loadedCount += cachedInstruments.length;
          logger.info(`Loaded ${cachedInstruments.length} instruments for ${exchange} from cache`);
        }
      }

      if (loadedCount > 0) {
        this.isInitialized = true;
        logger.info(`Total instruments loaded from cache: ${loadedCount}`);
      }
    } catch (error) {
      logger.warn('Failed to load instruments from cache:', error);
    }
  }

  public async downloadInstruments(): Promise<void> {
    try {
      logger.info('Downloading fresh instrument data...');
      
      // Download instruments for NSE and BSE
      const exchanges = ['NSE', 'BSE'];
      
      for (const exchange of exchanges) {
        await this.downloadExchangeInstruments(exchange);
      }
      
      this.isInitialized = true;
      logger.info('Instrument download completed');
    } catch (error) {
      logger.error('Failed to download instruments:', error);
      throw error;
    }
  }

  private async downloadExchangeInstruments(exchange: string): Promise<void> {
    try {
      logger.info(`Downloading instruments for ${exchange}...`);
      
      // Zerodha provides instrument lists as CSV files
      const instrumentUrl = `${ZERODHA_CONSTANTS.API_BASE_URL}/instruments/${exchange}`;
      
      const response = await axios.get(instrumentUrl, {
        timeout: 30000,
        headers: {
          'User-Agent': 'TradeFlow/1.0',
        },
      });

      const instruments = this.parseInstrumentCSV(response.data, exchange);
      
      // Store in memory
      this.instruments.set(exchange, instruments);
      
      // Build token map
      instruments.forEach(instrument => {
        this.instrumentTokenMap.set(instrument.instrument_token, instrument);
      });
      
      // Cache in Redis
      await this.redisService.cacheInstruments(exchange, instruments);
      
      logger.info(`Downloaded and cached ${instruments.length} instruments for ${exchange}`);
    } catch (error) {
      logger.error(`Failed to download instruments for ${exchange}:`, error);
      throw error;
    }
  }

  private parseInstrumentCSV(csvData: string, exchange: string): ZerodhaInstrument[] {
    const lines = csvData.trim().split('\n');
    const headers = lines[0].split(',');
    const instruments: ZerodhaInstrument[] = [];

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',');
      
      if (values.length !== headers.length) {
        continue; // Skip malformed lines
      }

      try {
        const instrument: ZerodhaInstrument = {
          instrument_token: parseInt(values[0]) || 0,
          exchange_token: parseInt(values[1]) || 0,
          tradingsymbol: values[2] || '',
          name: values[3] || '',
          last_price: parseFloat(values[4]) || 0,
          expiry: values[5] || undefined,
          strike: parseFloat(values[6]) || undefined,
          tick_size: parseFloat(values[7]) || 0.05,
          lot_size: parseInt(values[8]) || 1,
          instrument_type: values[9] || '',
          segment: values[10] || '',
          exchange: exchange as any,
        };

        // Only include valid instruments
        if (instrument.instrument_token > 0 && instrument.tradingsymbol) {
          instruments.push(instrument);
        }
      } catch (error) {
        logger.warn(`Failed to parse instrument line: ${lines[i]}`, error);
      }
    }

    return instruments;
  }

  public async searchInstruments(query: string, exchange?: string, limit: number = 50): Promise<InstrumentSearchResult[]> {
    try {
      // Check cache first
      const cacheKey = `${query}:${exchange || 'all'}:${limit}`;
      const cachedResults = await this.redisService.getCachedInstrumentSearch(cacheKey);
      if (cachedResults) {
        return cachedResults;
      }

      const results: InstrumentSearchResult[] = [];
      const searchQuery = query.toLowerCase();
      
      const exchangesToSearch = exchange ? [exchange] : ['NSE', 'BSE'];
      
      for (const ex of exchangesToSearch) {
        const exchangeInstruments = this.instruments.get(ex) || [];
        
        for (const instrument of exchangeInstruments) {
          if (results.length >= limit) break;
          
          const symbolMatch = instrument.tradingsymbol.toLowerCase().includes(searchQuery);
          const nameMatch = instrument.name.toLowerCase().includes(searchQuery);
          
          if (symbolMatch || nameMatch) {
            results.push({
              instrument_token: instrument.instrument_token,
              exchange_token: instrument.exchange_token,
              tradingsymbol: instrument.tradingsymbol,
              name: instrument.name,
              exchange: instrument.exchange,
              segment: instrument.segment,
              instrument_type: instrument.instrument_type,
              lot_size: instrument.lot_size,
              tick_size: instrument.tick_size,
              last_price: instrument.last_price,
            });
          }
        }
      }

      // Sort results by relevance (exact matches first, then partial matches)
      results.sort((a, b) => {
        const aExactSymbol = a.tradingsymbol.toLowerCase() === searchQuery;
        const bExactSymbol = b.tradingsymbol.toLowerCase() === searchQuery;
        const aExactName = a.name.toLowerCase() === searchQuery;
        const bExactName = b.name.toLowerCase() === searchQuery;
        
        if (aExactSymbol && !bExactSymbol) return -1;
        if (!aExactSymbol && bExactSymbol) return 1;
        if (aExactName && !bExactName) return -1;
        if (!aExactName && bExactName) return 1;
        
        return a.tradingsymbol.localeCompare(b.tradingsymbol);
      });

      // Cache results
      await this.redisService.cacheInstrumentSearch(cacheKey, results);
      
      return results;
    } catch (error) {
      logger.error('Failed to search instruments:', error);
      throw error;
    }
  }

  public getInstrumentByToken(instrumentToken: number): ZerodhaInstrument | null {
    return this.instrumentTokenMap.get(instrumentToken) || null;
  }

  public getInstrumentBySymbol(exchange: string, tradingsymbol: string): ZerodhaInstrument | null {
    const exchangeInstruments = this.instruments.get(exchange) || [];
    return exchangeInstruments.find(inst => inst.tradingsymbol === tradingsymbol) || null;
  }

  public getAllInstruments(exchange?: string): ZerodhaInstrument[] {
    if (exchange) {
      return this.instruments.get(exchange) || [];
    }
    
    const allInstruments: ZerodhaInstrument[] = [];
    for (const instruments of this.instruments.values()) {
      allInstruments.push(...instruments);
    }
    return allInstruments;
  }

  public getInstrumentsByType(exchange: string, instrumentType: string): ZerodhaInstrument[] {
    const exchangeInstruments = this.instruments.get(exchange) || [];
    return exchangeInstruments.filter(inst => inst.instrument_type === instrumentType);
  }

  public getInstrumentsBySegment(exchange: string, segment: string): ZerodhaInstrument[] {
    const exchangeInstruments = this.instruments.get(exchange) || [];
    return exchangeInstruments.filter(inst => inst.segment === segment);
  }

  public async refreshInstruments(exchange?: string): Promise<void> {
    try {
      if (exchange) {
        await this.downloadExchangeInstruments(exchange);
      } else {
        await this.downloadInstruments();
      }
      logger.info(`Instruments refreshed for ${exchange || 'all exchanges'}`);
    } catch (error) {
      logger.error('Failed to refresh instruments:', error);
      throw error;
    }
  }

  public getStats(): { [exchange: string]: number } {
    const stats: { [exchange: string]: number } = {};
    for (const [exchange, instruments] of this.instruments.entries()) {
      stats[exchange] = instruments.length;
    }
    return stats;
  }

  public isReady(): boolean {
    return this.isInitialized;
  }
}