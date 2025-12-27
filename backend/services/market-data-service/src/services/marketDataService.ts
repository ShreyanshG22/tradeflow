import { DataProvider, MarketData, RealTimeQuote, HistoricalDataRequest } from '../types';
import AlphaVantageProvider from '../providers/alphaVantageProvider';
import YahooFinanceProvider from '../providers/yahooFinanceProvider';
import logger from '../utils/logger';
import redisService from './redis';
import dataValidator from './dataValidator';

class MarketDataService {
  private providers: DataProvider[];
  private primaryProvider: DataProvider;
  private fallbackProviders: DataProvider[];

  constructor() {
    // Initialize providers
    this.providers = [
      new AlphaVantageProvider(),
      new YahooFinanceProvider(),
    ];

    this.primaryProvider = this.providers[0]; // Alpha Vantage as primary
    this.fallbackProviders = this.providers.slice(1); // Yahoo Finance as fallback
  }

  async initialize(): Promise<void> {
    logger.info('Initializing Market Data Service...');
    
    // Connect to Redis
    await redisService.connect();
    
    // Check provider availability
    for (const provider of this.providers) {
      const isAvailable = await provider.isAvailable();
      logger.info(`Provider ${provider.name} availability: ${isAvailable ? 'Available' : 'Unavailable'}`);
    }

    logger.info('Market Data Service initialized successfully');
  }

  async shutdown(): Promise<void> {
    logger.info('Shutting down Market Data Service...');
    await redisService.disconnect();
    logger.info('Market Data Service shutdown complete');
  }

  async getHistoricalData(request: HistoricalDataRequest): Promise<MarketData[]> {
    // Validate request
    const validation = dataValidator.validateHistoricalDataRequest(request);
    if (!validation.isValid) {
      throw new Error(`Invalid request: ${validation.errors.join(', ')}`);
    }

    if (validation.warnings.length > 0) {
      logger.warn('Request warnings:', validation.warnings);
    }

    const symbol = dataValidator.normalizeSymbol(request.symbol);
    logger.info(`Fetching historical data for ${symbol} ${request.timeframe} from ${request.startDate.toISOString().split('T')[0]} to ${request.endDate.toISOString().split('T')[0]}`);

    // Try primary provider first
    try {
      const data = await this.primaryProvider.getHistoricalData(request);
      logger.info(`Successfully retrieved ${data.length} data points from ${this.primaryProvider.name}`);
      return data;
    } catch (error) {
      logger.warn(`Primary provider ${this.primaryProvider.name} failed:`, error);
    }

    // Try fallback providers
    for (const provider of this.fallbackProviders) {
      try {
        logger.info(`Trying fallback provider: ${provider.name}`);
        const data = await provider.getHistoricalData(request);
        logger.info(`Successfully retrieved ${data.length} data points from ${provider.name}`);
        return data;
      } catch (error) {
        logger.warn(`Fallback provider ${provider.name} failed:`, error);
      }
    }

    throw new Error('All market data providers failed to retrieve historical data');
  }

  async getCurrentQuote(symbol: string): Promise<RealTimeQuote> {
    const validation = dataValidator.validateSymbol(symbol);
    if (!validation.isValid) {
      throw new Error(`Invalid symbol: ${validation.errors.join(', ')}`);
    }

    const normalizedSymbol = dataValidator.normalizeSymbol(symbol);
    logger.info(`Fetching current quote for ${normalizedSymbol}`);

    // Try primary provider first
    try {
      const quote = await this.primaryProvider.getCurrentQuote(normalizedSymbol);
      logger.info(`Successfully retrieved quote from ${this.primaryProvider.name}`);
      return quote;
    } catch (error) {
      logger.warn(`Primary provider ${this.primaryProvider.name} failed:`, error);
    }

    // Try fallback providers
    for (const provider of this.fallbackProviders) {
      try {
        logger.info(`Trying fallback provider: ${provider.name}`);
        const quote = await provider.getCurrentQuote(normalizedSymbol);
        logger.info(`Successfully retrieved quote from ${provider.name}`);
        return quote;
      } catch (error) {
        logger.warn(`Fallback provider ${provider.name} failed:`, error);
      }
    }

    throw new Error('All market data providers failed to retrieve current quote');
  }

  async getMultipleQuotes(symbols: string[]): Promise<Record<string, RealTimeQuote>> {
    const results: Record<string, RealTimeQuote> = {};
    const errors: Record<string, string> = {};

    // Process quotes in parallel with concurrency limit
    const concurrencyLimit = 5;
    const chunks = this.chunkArray(symbols, concurrencyLimit);

    for (const chunk of chunks) {
      const promises = chunk.map(async (symbol) => {
        try {
          const quote = await this.getCurrentQuote(symbol);
          results[symbol] = quote;
        } catch (error) {
          errors[symbol] = error instanceof Error ? error.message : 'Unknown error';
          logger.error(`Failed to get quote for ${symbol}:`, error);
        }
      });

      await Promise.all(promises);
    }

    if (Object.keys(errors).length > 0) {
      logger.warn('Some quotes failed to retrieve:', errors);
    }

    return results;
  }

  async getProviderStatus(): Promise<Record<string, boolean>> {
    const status: Record<string, boolean> = {};

    const promises = this.providers.map(async (provider) => {
      try {
        const isAvailable = await provider.isAvailable();
        status[provider.name] = isAvailable;
      } catch (error) {
        logger.error(`Error checking provider ${provider.name} status:`, error);
        status[provider.name] = false;
      }
    });

    await Promise.all(promises);
    return status;
  }

  async clearCache(symbol?: string): Promise<void> {
    if (symbol) {
      const normalizedSymbol = dataValidator.normalizeSymbol(symbol);
      // Clear specific symbol cache
      const patterns = [
        redisService.generateCacheKey('historical', '*', normalizedSymbol, '*'),
        redisService.generateCacheKey('quote', '*', normalizedSymbol),
      ];

      for (const pattern of patterns) {
        await redisService.del(pattern);
      }

      logger.info(`Cache cleared for symbol: ${normalizedSymbol}`);
    } else {
      // This would require a more sophisticated cache clearing mechanism
      // For now, we'll log that full cache clear is not implemented
      logger.warn('Full cache clear not implemented - clear specific symbols instead');
    }
  }

  private chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }

  // Utility methods for data analysis
  async getMarketSummary(symbols: string[]): Promise<{
    totalSymbols: number;
    successfulQuotes: number;
    failedQuotes: number;
    averagePrice: number;
    totalVolume: number;
  }> {
    const quotes = await this.getMultipleQuotes(symbols);
    const successfulQuotes = Object.values(quotes);

    const totalVolume = successfulQuotes.reduce((sum, quote) => sum + quote.volume, 0);
    const averagePrice = successfulQuotes.length > 0 
      ? successfulQuotes.reduce((sum, quote) => sum + quote.price, 0) / successfulQuotes.length 
      : 0;

    return {
      totalSymbols: symbols.length,
      successfulQuotes: successfulQuotes.length,
      failedQuotes: symbols.length - successfulQuotes.length,
      averagePrice,
      totalVolume,
    };
  }
}

export default new MarketDataService();