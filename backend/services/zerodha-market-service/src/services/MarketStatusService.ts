import { ZerodhaAPIClient } from '@tradeflow/zerodha-utils';
import { ZerodhaQuote, ZERODHA_CONSTANTS, MARKET_UTILS } from '@tradeflow/types';
import { createLogger } from '@tradeflow/zerodha-utils';
import { RedisService } from './RedisService';

const logger = createLogger('MarketStatusService');

export interface MarketStatus {
  exchange: 'NSE' | 'BSE';
  status: 'open' | 'closed' | 'pre_open' | 'break';
  timestamp: string;
  next_open?: string;
  next_close?: string;
  trading_hours: {
    pre_open: { start: string; end: string };
    market: { start: string; end: string };
    post_market: { start: string; end: string };
  };
}

export interface IndexData {
  symbol: string;
  name: string;
  instrument_token: number;
  exchange: string;
  last_price: number;
  change: number;
  change_percent: number;
  ohlc: {
    open: number;
    high: number;
    low: number;
    close: number;
  };
  timestamp: string;
}

export interface MarketHoliday {
  date: string;
  name: string;
  exchanges: string[];
}

export class MarketStatusService {
  private apiClient: ZerodhaAPIClient;
  private redisService: RedisService;
  private statusCheckInterval: NodeJS.Timeout | null = null;
  private indicesUpdateInterval: NodeJS.Timeout | null = null;

  constructor(apiClient: ZerodhaAPIClient, redisService: RedisService) {
    this.apiClient = apiClient;
    this.redisService = redisService;
  }

  public async initialize(): Promise<void> {
    try {
      logger.info('Initializing MarketStatusService...');
      
      // Start periodic status checks
      this.startStatusMonitoring();
      
      // Start indices updates
      this.startIndicesMonitoring();
      
      logger.info('MarketStatusService initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize MarketStatusService:', error);
      throw error;
    }
  }

  public async shutdown(): Promise<void> {
    try {
      logger.info('Shutting down MarketStatusService...');
      
      if (this.statusCheckInterval) {
        clearInterval(this.statusCheckInterval);
        this.statusCheckInterval = null;
      }
      
      if (this.indicesUpdateInterval) {
        clearInterval(this.indicesUpdateInterval);
        this.indicesUpdateInterval = null;
      }
      
      logger.info('MarketStatusService shut down successfully');
    } catch (error) {
      logger.error('Error shutting down MarketStatusService:', error);
    }
  }

  public async getMarketStatus(exchange?: 'NSE' | 'BSE'): Promise<MarketStatus | MarketStatus[]> {
    try {
      if (exchange) {
        return await this.getExchangeStatus(exchange);
      } else {
        const nseStatus = await this.getExchangeStatus('NSE');
        const bseStatus = await this.getExchangeStatus('BSE');
        return [nseStatus, bseStatus];
      }
    } catch (error) {
      logger.error('Failed to get market status:', error);
      throw error;
    }
  }

  public async getIndicesData(): Promise<IndexData[]> {
    try {
      // Check cache first
      const cachedData = await this.redisService.get('indices_data');
      if (cachedData) {
        return cachedData;
      }

      // Fetch fresh data
      const indices = await this.fetchIndicesData();
      
      // Cache for 1 minute
      await this.redisService.set('indices_data', indices, 60);
      
      return indices;
    } catch (error) {
      logger.error('Failed to get indices data:', error);
      throw error;
    }
  }

  public async getIndexData(symbol: string): Promise<IndexData | null> {
    try {
      const allIndices = await this.getIndicesData();
      return allIndices.find(index => index.symbol === symbol) || null;
    } catch (error) {
      logger.error(`Failed to get index data for ${symbol}:`, error);
      throw error;
    }
  }

  public getMarketHolidays(year?: number): MarketHoliday[] {
    const targetYear = year || new Date().getFullYear();
    
    // For now, return 2024 holidays. In production, this should be fetched from API or database
    if (targetYear === 2024) {
      return [
        { date: '2024-01-26', name: 'Republic Day', exchanges: ['NSE', 'BSE'] },
        { date: '2024-03-08', name: 'Holi', exchanges: ['NSE', 'BSE'] },
        { date: '2024-03-29', name: 'Good Friday', exchanges: ['NSE', 'BSE'] },
        { date: '2024-04-11', name: 'Id-Ul-Fitr', exchanges: ['NSE', 'BSE'] },
        { date: '2024-04-17', name: 'Ram Navami', exchanges: ['NSE', 'BSE'] },
        { date: '2024-05-01', name: 'Maharashtra Day', exchanges: ['NSE', 'BSE'] },
        { date: '2024-06-17', name: 'Bakri Id', exchanges: ['NSE', 'BSE'] },
        { date: '2024-08-15', name: 'Independence Day', exchanges: ['NSE', 'BSE'] },
        { date: '2024-10-02', name: 'Gandhi Jayanti', exchanges: ['NSE', 'BSE'] },
        { date: '2024-11-01', name: 'Diwali Laxmi Pujan', exchanges: ['NSE', 'BSE'] },
        { date: '2024-11-15', name: 'Guru Nanak Jayanti', exchanges: ['NSE', 'BSE'] },
        { date: '2024-12-25', name: 'Christmas', exchanges: ['NSE', 'BSE'] },
      ];
    }
    
    return [];
  }

  public isMarketOpen(exchange: 'NSE' | 'BSE' = 'NSE'): boolean {
    const now = new Date();
    const currentTime = now.toTimeString().slice(0, 8);
    const currentDay = now.getDay();
    
    // Check if it's a weekend
    if (currentDay === 0 || currentDay === 6) {
      return false;
    }
    
    // Check if it's a market holiday
    const currentDate = now.toISOString().slice(0, 10);
    const holidays = this.getMarketHolidays(now.getFullYear());
    if (holidays.some(holiday => holiday.date === currentDate && holiday.exchanges.includes(exchange))) {
      return false;
    }
    
    const timings = ZERODHA_CONSTANTS.MARKET_TIMINGS[exchange];
    return currentTime >= timings.MARKET_OPEN && currentTime <= timings.MARKET_CLOSE;
  }

  public isPreMarketOpen(exchange: 'NSE' | 'BSE' = 'NSE'): boolean {
    const now = new Date();
    const currentTime = now.toTimeString().slice(0, 8);
    const currentDay = now.getDay();
    
    if (currentDay === 0 || currentDay === 6) {
      return false;
    }
    
    const timings = ZERODHA_CONSTANTS.MARKET_TIMINGS[exchange];
    return currentTime >= timings.PRE_OPEN_START && currentTime < timings.PRE_OPEN_END;
  }

  public getNextMarketOpen(exchange: 'NSE' | 'BSE' = 'NSE'): Date {
    const now = new Date();
    const nextOpen = new Date(now);
    
    // If it's weekend, move to next Monday
    if (now.getDay() === 0) { // Sunday
      nextOpen.setDate(now.getDate() + 1);
    } else if (now.getDay() === 6) { // Saturday
      nextOpen.setDate(now.getDate() + 2);
    } else {
      // Check if market is already closed for today
      const currentTime = now.toTimeString().slice(0, 8);
      const timings = ZERODHA_CONSTANTS.MARKET_TIMINGS[exchange];
      
      if (currentTime > timings.MARKET_CLOSE) {
        nextOpen.setDate(now.getDate() + 1);
      }
    }
    
    // Set to market open time
    const [hours, minutes, seconds] = ZERODHA_CONSTANTS.MARKET_TIMINGS[exchange].MARKET_OPEN.split(':');
    nextOpen.setHours(parseInt(hours), parseInt(minutes), parseInt(seconds), 0);
    
    return nextOpen;
  }

  private async getExchangeStatus(exchange: 'NSE' | 'BSE'): Promise<MarketStatus> {
    try {
      // Check cache first
      const cachedStatus = await this.redisService.getCachedMarketStatus(exchange);
      if (cachedStatus) {
        return cachedStatus;
      }

      // Calculate status
      const now = new Date();
      const currentTime = now.toTimeString().slice(0, 8);
      const timings = ZERODHA_CONSTANTS.MARKET_TIMINGS[exchange];
      
      let status: 'open' | 'closed' | 'pre_open' | 'break' = 'closed';
      
      if (this.isPreMarketOpen(exchange)) {
        status = 'pre_open';
      } else if (this.isMarketOpen(exchange)) {
        status = 'open';
      } else {
        status = 'closed';
      }

      const marketStatus: MarketStatus = {
        exchange,
        status,
        timestamp: now.toISOString(),
        next_open: this.getNextMarketOpen(exchange).toISOString(),
        next_close: status === 'open' ? 
          new Date(`${now.toDateString()} ${timings.MARKET_CLOSE}`).toISOString() : 
          undefined,
        trading_hours: {
          pre_open: {
            start: timings.PRE_OPEN_START,
            end: timings.PRE_OPEN_END,
          },
          market: {
            start: timings.MARKET_OPEN,
            end: timings.MARKET_CLOSE,
          },
          post_market: {
            start: timings.POST_MARKET_START,
            end: timings.POST_MARKET_END,
          },
        },
      };

      // Cache for 5 minutes
      await this.redisService.cacheMarketStatus(exchange, marketStatus);
      
      return marketStatus;
    } catch (error) {
      logger.error(`Failed to get ${exchange} status:`, error);
      throw error;
    }
  }

  private async fetchIndicesData(): Promise<IndexData[]> {
    try {
      if (!this.apiClient.hasValidToken()) {
        throw new Error('No valid access token');
      }

      const indices: IndexData[] = [];
      
      // Fetch data for major indices
      for (const [key, indexInfo] of Object.entries(MARKET_UTILS.INDICES)) {
        try {
          const response = await this.apiClient.get<{ [key: string]: ZerodhaQuote }>(
            `/quote?i=${indexInfo.exchange}:${indexInfo.symbol}`
          );

          if (response.status === 'success' && response.data) {
            const quoteKey = `${indexInfo.exchange}:${indexInfo.symbol}`;
            const quote = response.data[quoteKey];
            
            if (quote) {
              const indexData: IndexData = {
                symbol: indexInfo.symbol,
                name: indexInfo.symbol,
                instrument_token: indexInfo.instrument_token,
                exchange: indexInfo.exchange,
                last_price: quote.last_price,
                change: quote.net_change,
                change_percent: quote.ohlc.close > 0 ? 
                  ((quote.last_price - quote.ohlc.close) / quote.ohlc.close) * 100 : 0,
                ohlc: quote.ohlc,
                timestamp: new Date().toISOString(),
              };
              
              indices.push(indexData);
            }
          }
        } catch (error) {
          logger.warn(`Failed to fetch data for ${indexInfo.symbol}:`, error);
        }
      }

      return indices;
    } catch (error) {
      logger.error('Failed to fetch indices data:', error);
      throw error;
    }
  }

  private startStatusMonitoring(): void {
    // Check market status every 5 minutes
    this.statusCheckInterval = setInterval(async () => {
      try {
        // Clear cached status to force refresh
        await this.redisService.del('market_status:NSE');
        await this.redisService.del('market_status:BSE');
        
        // Fetch fresh status (will be cached automatically)
        await this.getMarketStatus();
        
        logger.debug('Market status updated');
      } catch (error) {
        logger.error('Error updating market status:', error);
      }
    }, 5 * 60 * 1000); // 5 minutes
  }

  private startIndicesMonitoring(): void {
    // Update indices data every minute during market hours
    this.indicesUpdateInterval = setInterval(async () => {
      try {
        if (this.isMarketOpen('NSE') || this.isMarketOpen('BSE')) {
          // Clear cached indices data to force refresh
          await this.redisService.del('indices_data');
          
          // Fetch fresh data (will be cached automatically)
          await this.getIndicesData();
          
          logger.debug('Indices data updated');
        }
      } catch (error) {
        logger.error('Error updating indices data:', error);
      }
    }, 60 * 1000); // 1 minute
  }

  public getStats(): {
    statusMonitoringActive: boolean;
    indicesMonitoringActive: boolean;
    marketOpen: { NSE: boolean; BSE: boolean };
    preMarketOpen: { NSE: boolean; BSE: boolean };
  } {
    return {
      statusMonitoringActive: this.statusCheckInterval !== null,
      indicesMonitoringActive: this.indicesUpdateInterval !== null,
      marketOpen: {
        NSE: this.isMarketOpen('NSE'),
        BSE: this.isMarketOpen('BSE'),
      },
      preMarketOpen: {
        NSE: this.isPreMarketOpen('NSE'),
        BSE: this.isPreMarketOpen('BSE'),
      },
    };
  }
}