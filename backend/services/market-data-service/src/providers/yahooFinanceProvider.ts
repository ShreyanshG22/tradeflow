import axios, { AxiosInstance } from 'axios';
import { DataProvider, MarketData, RealTimeQuote, HistoricalDataRequest, YahooFinanceResponse } from '../types';
import { config } from '../config/config';
import logger from '../utils/logger';
import redisService from '../services/redis';
import dataValidator from '../services/dataValidator';

class YahooFinanceProvider implements DataProvider {
  public readonly name = 'Yahoo Finance';
  private client: AxiosInstance;
  private lastRequestTime: number = 0;
  private requestCount: number = 0;
  private readonly rateLimitWindow = 60000; // 1 minute

  constructor() {
    this.client = axios.create({
      baseURL: 'https://query1.finance.yahoo.com',
      timeout: 30000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      },
    });

    // Add request interceptor for rate limiting
    this.client.interceptors.request.use(async (config) => {
      await this.enforceRateLimit();
      return config;
    });

    // Add response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        logger.error('Yahoo Finance API error:', {
          message: error.message,
          status: error.response?.status,
          data: error.response?.data,
        });
        throw error;
      }
    );
  }

  private async enforceRateLimit(): Promise<void> {
    const now = Date.now();
    
    // Reset counter if window has passed
    if (now - this.lastRequestTime > this.rateLimitWindow) {
      this.requestCount = 0;
      this.lastRequestTime = now;
    }

    // Check if we've exceeded rate limit
    if (this.requestCount >= config.rateLimits.yahooFinance) {
      const waitTime = this.rateLimitWindow - (now - this.lastRequestTime);
      logger.warn(`Yahoo Finance rate limit reached, waiting ${waitTime}ms`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      this.requestCount = 0;
      this.lastRequestTime = Date.now();
    }

    this.requestCount++;
  }

  private getYahooInterval(timeframe: string): string {
    const intervalMap: Record<string, string> = {
      '1min': '1m',
      '5min': '5m',
      '15min': '15m',
      '30min': '30m',
      '60min': '1h',
      '1day': '1d',
    };
    return intervalMap[timeframe] || '1d';
  }

  private parseYahooData(response: YahooFinanceResponse, symbol: string, timeframe: string): MarketData[] {
    const result = response.chart.result[0];
    if (!result || !result.timestamp || !result.indicators.quote[0]) {
      return [];
    }

    const { timestamp } = result;
    const { open, high, low, close, volume } = result.indicators.quote[0];

    const data: MarketData[] = [];
    for (let i = 0; i < timestamp.length; i++) {
      // Skip if any required data is missing
      if (
        open[i] == null ||
        high[i] == null ||
        low[i] == null ||
        close[i] == null ||
        volume[i] == null
      ) {
        continue;
      }

      data.push({
        symbol: dataValidator.normalizeSymbol(symbol),
        timestamp: new Date(timestamp[i] * 1000),
        open: open[i],
        high: high[i],
        low: low[i],
        close: close[i],
        volume: volume[i],
        timeframe,
      });
    }

    return data;
  }

  async getHistoricalData(request: HistoricalDataRequest): Promise<MarketData[]> {
    // Validate request
    const validation = dataValidator.validateHistoricalDataRequest(request);
    if (!validation.isValid) {
      throw new Error(`Invalid request: ${validation.errors.join(', ')}`);
    }

    const symbol = dataValidator.normalizeSymbol(request.symbol);
    const cacheKey = redisService.generateCacheKey(
      'historical',
      this.name.toLowerCase().replace(' ', '-'),
      symbol,
      request.timeframe,
      request.startDate.toISOString().split('T')[0],
      request.endDate.toISOString().split('T')[0]
    );

    // Check cache first
    const cached = await redisService.get<MarketData[]>(cacheKey);
    if (cached) {
      logger.info(`Cache hit for historical data: ${symbol} ${request.timeframe}`);
      return cached;
    }

    try {
      const interval = this.getYahooInterval(request.timeframe);
      const period1 = Math.floor(request.startDate.getTime() / 1000);
      const period2 = Math.floor(request.endDate.getTime() / 1000);

      logger.info(`Fetching historical data from Yahoo Finance: ${symbol} ${request.timeframe}`);
      const response = await this.client.get<YahooFinanceResponse>(`/v8/finance/chart/${symbol}`, {
        params: {
          period1,
          period2,
          interval,
          includePrePost: false,
          events: 'div,splits',
        },
      });

      if (!response.data || !response.data.chart || !response.data.chart.result) {
        throw new Error('No data received from Yahoo Finance');
      }

      if (response.data.chart.result.length === 0) {
        logger.warn(`No data available for symbol: ${symbol}`);
        return [];
      }

      // Parse data
      const parsedData = this.parseYahooData(response.data, symbol, request.timeframe);

      // Validate and sanitize data
      const sanitizedData = dataValidator.sanitizeMarketData(parsedData);

      // Cache the result
      await redisService.set(cacheKey, sanitizedData, config.cache.ttlSeconds);

      logger.info(`Retrieved ${sanitizedData.length} data points for ${symbol} ${request.timeframe}`);
      return sanitizedData;

    } catch (error) {
      logger.error('Error fetching historical data from Yahoo Finance:', error);
      throw error;
    }
  }

  async getCurrentQuote(symbol: string): Promise<RealTimeQuote> {
    const validation = dataValidator.validateSymbol(symbol);
    if (!validation.isValid) {
      throw new Error(`Invalid symbol: ${validation.errors.join(', ')}`);
    }

    const normalizedSymbol = dataValidator.normalizeSymbol(symbol);
    const cacheKey = redisService.generateCacheKey('quote', this.name.toLowerCase().replace(' ', '-'), normalizedSymbol);

    // Check cache first (shorter TTL for real-time data)
    const cached = await redisService.get<RealTimeQuote>(cacheKey);
    if (cached) {
      logger.debug(`Cache hit for quote: ${normalizedSymbol}`);
      return cached;
    }

    try {
      logger.info(`Fetching current quote from Yahoo Finance: ${normalizedSymbol}`);
      
      // Get recent data (last 2 days with 1-minute intervals)
      const now = new Date();
      const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
      const period1 = Math.floor(twoDaysAgo.getTime() / 1000);
      const period2 = Math.floor(now.getTime() / 1000);

      const response = await this.client.get<YahooFinanceResponse>(`/v8/finance/chart/${normalizedSymbol}`, {
        params: {
          period1,
          period2,
          interval: '1m',
          includePrePost: false,
        },
      });

      if (!response.data || !response.data.chart || !response.data.chart.result) {
        throw new Error('No quote data received from Yahoo Finance');
      }

      const result = response.data.chart.result[0];
      if (!result || !result.meta) {
        throw new Error('Invalid quote data structure from Yahoo Finance');
      }

      // Use the most recent price from meta data
      const currentPrice = result.meta.regularMarketPrice;
      if (!currentPrice || currentPrice <= 0) {
        throw new Error('Invalid current price from Yahoo Finance');
      }

      const realTimeQuote: RealTimeQuote = {
        symbol: normalizedSymbol,
        price: currentPrice,
        bid: currentPrice * 0.999, // Approximate bid (0.1% below)
        ask: currentPrice * 1.001, // Approximate ask (0.1% above)
        volume: 0, // Yahoo Finance doesn't provide real-time volume in this endpoint
        timestamp: new Date(result.meta.regularMarketTime * 1000),
      };

      // Validate quote
      const quoteValidation = dataValidator.validateRealTimeQuote(realTimeQuote);
      if (!quoteValidation.isValid) {
        throw new Error(`Invalid quote data: ${quoteValidation.errors.join(', ')}`);
      }

      // Cache with shorter TTL for real-time data
      await redisService.set(cacheKey, realTimeQuote, 60); // 1 minute cache

      return realTimeQuote;

    } catch (error) {
      logger.error('Error fetching quote from Yahoo Finance:', error);
      throw error;
    }
  }

  async isAvailable(): Promise<boolean> {
    try {
      // Test with a simple API call
      const now = new Date();
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const period1 = Math.floor(oneDayAgo.getTime() / 1000);
      const period2 = Math.floor(now.getTime() / 1000);

      const response = await this.client.get(`/v8/finance/chart/AAPL`, {
        params: {
          period1,
          period2,
          interval: '1d',
        },
        timeout: 5000,
      });

      return response.status === 200 && response.data?.chart?.result?.length > 0;
    } catch (error) {
      logger.warn('Yahoo Finance availability check failed:', error);
      return false;
    }
  }
}

export default YahooFinanceProvider;