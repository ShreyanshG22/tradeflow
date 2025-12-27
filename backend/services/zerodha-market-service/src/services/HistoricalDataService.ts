import { ZerodhaAPIClient } from '@tradeflow/zerodha-utils';
import { ZerodhaHistoricalData, ZerodhaAPIResponse } from '@tradeflow/types';
import { createLogger } from '@tradeflow/zerodha-utils';
import { RedisService } from './RedisService';
import { InstrumentService } from './InstrumentService';

const logger = createLogger('HistoricalDataService');

export interface HistoricalDataRequest {
  instrument_token: number;
  interval: '1minute' | '3minute' | '5minute' | '10minute' | '15minute' | '30minute' | '60minute' | 'day';
  from_date: string; // YYYY-MM-DD format
  to_date: string;   // YYYY-MM-DD format
  continuous?: boolean;
  oi?: boolean;
}

export interface HistoricalDataResponse {
  instrument_token: number;
  interval: string;
  data: ZerodhaHistoricalData[];
  from_date: string;
  to_date: string;
  cached: boolean;
}

export class HistoricalDataService {
  private apiClient: ZerodhaAPIClient;
  private redisService: RedisService;
  private instrumentService: InstrumentService;
  private rateLimitQueue: Map<string, number> = new Map();
  private readonly RATE_LIMIT_DELAY = 20000; // 20 seconds between requests (3 per minute)

  constructor(
    apiClient: ZerodhaAPIClient,
    redisService: RedisService,
    instrumentService: InstrumentService
  ) {
    this.apiClient = apiClient;
    this.redisService = redisService;
    this.instrumentService = instrumentService;
  }

  public async getHistoricalData(request: HistoricalDataRequest): Promise<HistoricalDataResponse> {
    try {
      // Validate request
      this.validateRequest(request);

      // Check cache first
      const cachedData = await this.getCachedData(request);
      if (cachedData) {
        logger.info(`Returning cached historical data for ${request.instrument_token}`);
        return {
          instrument_token: request.instrument_token,
          interval: request.interval,
          data: cachedData,
          from_date: request.from_date,
          to_date: request.to_date,
          cached: true,
        };
      }

      // Check rate limiting
      await this.enforceRateLimit();

      // Fetch from API
      const data = await this.fetchFromAPI(request);

      // Cache the data
      await this.cacheData(request, data);

      logger.info(`Fetched ${data.length} historical data points for ${request.instrument_token}`);

      return {
        instrument_token: request.instrument_token,
        interval: request.interval,
        data,
        from_date: request.from_date,
        to_date: request.to_date,
        cached: false,
      };
    } catch (error) {
      logger.error('Failed to get historical data:', error);
      throw error;
    }
  }

  public async getBulkHistoricalData(
    requests: HistoricalDataRequest[]
  ): Promise<HistoricalDataResponse[]> {
    try {
      const results: HistoricalDataResponse[] = [];
      
      // Process requests in batches to respect rate limits
      const batchSize = 3; // 3 requests per minute
      
      for (let i = 0; i < requests.length; i += batchSize) {
        const batch = requests.slice(i, i + batchSize);
        
        // Process batch concurrently
        const batchPromises = batch.map(request => 
          this.getHistoricalData(request).catch(error => {
            logger.error(`Failed to fetch data for ${request.instrument_token}:`, error);
            return null;
          })
        );

        const batchResults = await Promise.all(batchPromises);
        
        // Add successful results
        batchResults.forEach(result => {
          if (result) {
            results.push(result);
          }
        });

        // Wait before next batch (except for last batch)
        if (i + batchSize < requests.length) {
          logger.info(`Waiting ${this.RATE_LIMIT_DELAY}ms before next batch...`);
          await this.sleep(this.RATE_LIMIT_DELAY);
        }
      }

      return results;
    } catch (error) {
      logger.error('Failed to get bulk historical data:', error);
      throw error;
    }
  }

  public async getOHLCData(
    instrumentToken: number,
    interval: string,
    fromDate: string,
    toDate: string
  ): Promise<ZerodhaHistoricalData[]> {
    const request: HistoricalDataRequest = {
      instrument_token: instrumentToken,
      interval: interval as any,
      from_date: fromDate,
      to_date: toDate,
    };

    const response = await this.getHistoricalData(request);
    return response.data;
  }

  public async getLatestCandles(
    instrumentToken: number,
    interval: string,
    count: number = 100
  ): Promise<ZerodhaHistoricalData[]> {
    try {
      // Calculate date range for the requested number of candles
      const toDate = new Date();
      const fromDate = new Date();
      
      // Estimate days needed based on interval
      let daysNeeded = count;
      switch (interval) {
        case '1minute':
          daysNeeded = Math.ceil(count / (6.25 * 60)); // 6.25 hours trading day
          break;
        case '5minute':
          daysNeeded = Math.ceil(count / (6.25 * 12));
          break;
        case '15minute':
          daysNeeded = Math.ceil(count / (6.25 * 4));
          break;
        case '60minute':
          daysNeeded = Math.ceil(count / 6.25);
          break;
        case 'day':
          daysNeeded = count;
          break;
      }

      fromDate.setDate(toDate.getDate() - Math.max(daysNeeded, 30)); // At least 30 days

      const request: HistoricalDataRequest = {
        instrument_token: instrumentToken,
        interval: interval as any,
        from_date: fromDate.toISOString().split('T')[0],
        to_date: toDate.toISOString().split('T')[0],
      };

      const response = await this.getHistoricalData(request);
      
      // Return the latest 'count' candles
      return response.data.slice(-count);
    } catch (error) {
      logger.error('Failed to get latest candles:', error);
      throw error;
    }
  }

  private validateRequest(request: HistoricalDataRequest): void {
    if (!request.instrument_token || request.instrument_token <= 0) {
      throw new Error('Invalid instrument token');
    }

    const validIntervals = ['1minute', '3minute', '5minute', '10minute', '15minute', '30minute', '60minute', 'day'];
    if (!validIntervals.includes(request.interval)) {
      throw new Error(`Invalid interval. Must be one of: ${validIntervals.join(', ')}`);
    }

    // Validate date format
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(request.from_date) || !dateRegex.test(request.to_date)) {
      throw new Error('Invalid date format. Use YYYY-MM-DD');
    }

    const fromDate = new Date(request.from_date);
    const toDate = new Date(request.to_date);

    if (fromDate >= toDate) {
      throw new Error('from_date must be before to_date');
    }

    // Check if date range is not too large (max 2000 candles from Zerodha)
    const daysDiff = Math.ceil((toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24));
    let maxDays = 2000;

    switch (request.interval) {
      case '1minute':
        maxDays = 60; // ~2000 minutes
        break;
      case '3minute':
        maxDays = 180;
        break;
      case '5minute':
        maxDays = 300;
        break;
      case '15minute':
        maxDays = 900;
        break;
      case '60minute':
        maxDays = 2000;
        break;
      case 'day':
        maxDays = 2000;
        break;
    }

    if (daysDiff > maxDays) {
      throw new Error(`Date range too large. Maximum ${maxDays} days for ${request.interval} interval`);
    }

    // Validate instrument exists
    const instrument = this.instrumentService.getInstrumentByToken(request.instrument_token);
    if (!instrument) {
      throw new Error(`Instrument not found: ${request.instrument_token}`);
    }
  }

  private async getCachedData(request: HistoricalDataRequest): Promise<ZerodhaHistoricalData[] | null> {
    try {
      return await this.redisService.getCachedHistoricalData(
        request.instrument_token,
        request.interval,
        request.from_date,
        request.to_date
      );
    } catch (error) {
      logger.warn('Failed to get cached data:', error);
      return null;
    }
  }

  private async cacheData(request: HistoricalDataRequest, data: ZerodhaHistoricalData[]): Promise<void> {
    try {
      await this.redisService.cacheHistoricalData(
        request.instrument_token,
        request.interval,
        request.from_date,
        request.to_date,
        data
      );
    } catch (error) {
      logger.warn('Failed to cache historical data:', error);
    }
  }

  private async fetchFromAPI(request: HistoricalDataRequest): Promise<ZerodhaHistoricalData[]> {
    try {
      if (!this.apiClient.hasValidToken()) {
        throw new Error('No valid access token');
      }

      const params: any = {
        from: request.from_date,
        to: request.to_date,
        interval: request.interval,
      };

      if (request.continuous !== undefined) {
        params.continuous = request.continuous ? 1 : 0;
      }

      if (request.oi !== undefined) {
        params.oi = request.oi ? 1 : 0;
      }

      const endpoint = `/instruments/historical/${request.instrument_token}/${request.interval}`;
      const response = await this.apiClient.get<{ candles: any[] }>(endpoint, params);

      if (response.status !== 'success' || !response.data?.candles) {
        throw new Error('Invalid response from historical data API');
      }

      // Transform API response to our format
      const historicalData: ZerodhaHistoricalData[] = response.data.candles.map((candle: any[]) => ({
        date: candle[0], // ISO date string
        open: parseFloat(candle[1]),
        high: parseFloat(candle[2]),
        low: parseFloat(candle[3]),
        close: parseFloat(candle[4]),
        volume: parseInt(candle[5]),
        oi: candle[6] ? parseInt(candle[6]) : undefined,
      }));

      return historicalData;
    } catch (error) {
      logger.error('Failed to fetch from API:', error);
      throw error;
    }
  }

  private async enforceRateLimit(): Promise<void> {
    const now = Date.now();
    const lastRequest = this.rateLimitQueue.get('last_request') || 0;
    const timeSinceLastRequest = now - lastRequest;

    if (timeSinceLastRequest < this.RATE_LIMIT_DELAY) {
      const waitTime = this.RATE_LIMIT_DELAY - timeSinceLastRequest;
      logger.info(`Rate limit: waiting ${waitTime}ms before next request`);
      await this.sleep(waitTime);
    }

    this.rateLimitQueue.set('last_request', Date.now());
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  public async clearCache(instrumentToken?: number, interval?: string): Promise<void> {
    try {
      let pattern = 'historical:*';
      
      if (instrumentToken && interval) {
        pattern = `historical:${instrumentToken}:${interval}:*`;
      } else if (instrumentToken) {
        pattern = `historical:${instrumentToken}:*`;
      }

      await this.redisService.flushPattern(pattern);
      logger.info(`Cleared historical data cache with pattern: ${pattern}`);
    } catch (error) {
      logger.error('Failed to clear cache:', error);
      throw error;
    }
  }

  public getStats(): {
    rateLimitQueue: number;
    lastRequest: number | null;
  } {
    return {
      rateLimitQueue: this.rateLimitQueue.size,
      lastRequest: this.rateLimitQueue.get('last_request') || null,
    };
  }
}