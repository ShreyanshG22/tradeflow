import axios, { AxiosInstance } from 'axios';
import { DataProvider, MarketData, RealTimeQuote, HistoricalDataRequest, AlphaVantageResponse, AlphaVantageDataPoint } from '../types';
import { config } from '../config/config';
import logger from '../utils/logger';
import redisService from '../services/redis';
import dataValidator from '../services/dataValidator';

class AlphaVantageProvider implements DataProvider {
  public readonly name = 'Alpha Vantage';
  private client: AxiosInstance;
  private lastRequestTime: number = 0;
  private requestCount: number = 0;
  private readonly rateLimitWindow = 60000; // 1 minute

  constructor() {
    this.client = axios.create({
      baseURL: config.alphaVantage.baseUrl,
      timeout: 30000,
      headers: {
        'User-Agent': 'TradeFlow-MarketData/1.0',
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
        logger.error('Alpha Vantage API error:', {
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
    if (this.requestCount >= config.alphaVantage.rateLimit) {
      const waitTime = this.rateLimitWindow - (now - this.lastRequestTime);
      logger.warn(`Alpha Vantage rate limit reached, waiting ${waitTime}ms`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      this.requestCount = 0;
      this.lastRequestTime = Date.now();
    }

    this.requestCount++;
  }

  private getTimeSeriesFunction(timeframe: string): string {
    const functionMap: Record<string, string> = {
      '1min': 'TIME_SERIES_INTRADAY',
      '5min': 'TIME_SERIES_INTRADAY',
      '15min': 'TIME_SERIES_INTRADAY',
      '30min': 'TIME_SERIES_INTRADAY',
      '60min': 'TIME_SERIES_INTRADAY',
      '1day': 'TIME_SERIES_DAILY',
    };
    return functionMap[timeframe] || 'TIME_SERIES_DAILY';
  }

  private getTimeSeriesKey(timeframe: string): string {
    const keyMap: Record<string, string> = {
      '1min': 'Time Series (1min)',
      '5min': 'Time Series (5min)',
      '15min': 'Time Series (15min)',
      '30min': 'Time Series (30min)',
      '60min': 'Time Series (60min)',
      '1day': 'Time Series (Daily)',
    };
    return keyMap[timeframe] || 'Time Series (Daily)';
  }

  private parseDataPoint(timestamp: string, data: AlphaVantageDataPoint, symbol: string, timeframe: string): MarketData {
    return {
      symbol: dataValidator.normalizeSymbol(symbol),
      timestamp: new Date(timestamp),
      open: parseFloat(data['1. open']),
      high: parseFloat(data['2. high']),
      low: parseFloat(data['3. low']),
      close: parseFloat(data['4. close']),
      volume: parseInt(data['5. volume']),
      timeframe,
    };
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
      const func = this.getTimeSeriesFunction(request.timeframe);
      const params: Record<string, string> = {
        function: func,
        symbol,
        apikey: config.alphaVantage.apiKey,
        outputsize: 'full',
        datatype: 'json',
      };

      // Add interval for intraday data
      if (func === 'TIME_SERIES_INTRADAY') {
        params.interval = request.timeframe;
      }

      logger.info(`Fetching historical data from Alpha Vantage: ${symbol} ${request.timeframe}`);
      const response = await this.client.get<AlphaVantageResponse>('', { params });

      if (!response.data) {
        throw new Error('No data received from Alpha Vantage');
      }

      // Check for API errors
      if ('Error Message' in response.data) {
        throw new Error(`Alpha Vantage API error: ${(response.data as any)['Error Message']}`);
      }

      if ('Note' in response.data) {
        throw new Error(`Alpha Vantage API limit: ${(response.data as any)['Note']}`);
      }

      const timeSeriesKey = this.getTimeSeriesKey(request.timeframe);
      const timeSeries = response.data[timeSeriesKey as keyof AlphaVantageResponse] as Record<string, AlphaVantageDataPoint>;

      if (!timeSeries) {
        throw new Error(`No time series data found for key: ${timeSeriesKey}`);
      }

      // Parse and filter data
      const allData: MarketData[] = [];
      for (const [timestamp, dataPoint] of Object.entries(timeSeries)) {
        const parsedData = this.parseDataPoint(timestamp, dataPoint, symbol, request.timeframe);
        
        // Filter by date range
        if (parsedData.timestamp >= request.startDate && parsedData.timestamp <= request.endDate) {
          allData.push(parsedData);
        }
      }

      // Validate and sanitize data
      const sanitizedData = dataValidator.sanitizeMarketData(allData);

      // Cache the result
      await redisService.set(cacheKey, sanitizedData, config.cache.ttlSeconds);

      logger.info(`Retrieved ${sanitizedData.length} data points for ${symbol} ${request.timeframe}`);
      return sanitizedData;

    } catch (error) {
      logger.error('Error fetching historical data from Alpha Vantage:', error);
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
      logger.info(`Fetching current quote from Alpha Vantage: ${normalizedSymbol}`);
      const response = await this.client.get<any>('', {
        params: {
          function: 'GLOBAL_QUOTE',
          symbol: normalizedSymbol,
          apikey: config.alphaVantage.apiKey,
          datatype: 'json',
        },
      });

      if (!response.data || !response.data['Global Quote']) {
        throw new Error('No quote data received from Alpha Vantage');
      }

      const quote = response.data['Global Quote'];
      const realTimeQuote: RealTimeQuote = {
        symbol: normalizedSymbol,
        price: parseFloat(quote['05. price']),
        bid: parseFloat(quote['05. price']) * 0.999, // Approximate bid
        ask: parseFloat(quote['05. price']) * 1.001, // Approximate ask
        volume: parseInt(quote['06. volume']),
        timestamp: new Date(),
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
      logger.error('Error fetching quote from Alpha Vantage:', error);
      throw error;
    }
  }

  async isAvailable(): Promise<boolean> {
    try {
      // Test with a simple API call
      const response = await this.client.get('', {
        params: {
          function: 'GLOBAL_QUOTE',
          symbol: 'AAPL',
          apikey: config.alphaVantage.apiKey,
        },
        timeout: 5000,
      });

      return response.status === 200 && !('Error Message' in response.data);
    } catch (error) {
      logger.warn('Alpha Vantage availability check failed:', error);
      return false;
    }
  }
}

export default AlphaVantageProvider;