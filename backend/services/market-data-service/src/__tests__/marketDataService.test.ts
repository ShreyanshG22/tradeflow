import marketDataService from '../services/marketDataService';
import AlphaVantageProvider from '../providers/alphaVantageProvider';
import YahooFinanceProvider from '../providers/yahooFinanceProvider';
import redisService from '../services/redis';
import dataValidator from '../services/dataValidator';
import { MarketData, RealTimeQuote, HistoricalDataRequest } from '../types';

// Mock dependencies
jest.mock('../providers/alphaVantageProvider');
jest.mock('../providers/yahooFinanceProvider');
jest.mock('../services/redis');
jest.mock('../services/dataValidator');

const mockAlphaVantage = AlphaVantageProvider as jest.MockedClass<typeof AlphaVantageProvider>;
const mockYahooFinance = YahooFinanceProvider as jest.MockedClass<typeof YahooFinanceProvider>;
const mockRedisService = redisService as jest.Mocked<typeof redisService>;
const mockDataValidator = dataValidator as jest.Mocked<typeof dataValidator>;

describe('MarketDataService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup default mocks
    mockRedisService.connect.mockResolvedValue();
    mockRedisService.disconnect.mockResolvedValue();
    
    mockDataValidator.normalizeSymbol.mockImplementation((symbol) => symbol.toUpperCase());
    mockDataValidator.validateSymbol.mockReturnValue({ isValid: true, errors: [], warnings: [] });
    mockDataValidator.validateHistoricalDataRequest.mockReturnValue({ isValid: true, errors: [], warnings: [] });
  });

  describe('initialize', () => {
    it('should initialize successfully', async () => {
      const mockAlphaInstance = new mockAlphaVantage();
      const mockYahooInstance = new mockYahooFinance();
      
      mockAlphaInstance.isAvailable.mockResolvedValue(true);
      mockYahooInstance.isAvailable.mockResolvedValue(true);

      await marketDataService.initialize();

      expect(mockRedisService.connect).toHaveBeenCalled();
    });
  });

  describe('getHistoricalData', () => {
    const mockRequest: HistoricalDataRequest = {
      symbol: 'AAPL',
      timeframe: '1d',
      startDate: new Date('2023-01-01'),
      endDate: new Date('2023-12-31')
    };

    const mockData: MarketData[] = [
      {
        symbol: 'AAPL',
        timestamp: new Date('2023-01-01'),
        open: 100,
        high: 105,
        low: 99,
        close: 104,
        volume: 1000000,
        timeframe: '1d'
      }
    ];

    it('should return data from primary provider', async () => {
      const mockAlphaInstance = new mockAlphaVantage();
      mockAlphaInstance.getHistoricalData.mockResolvedValue(mockData);

      // Mock the providers array in the service
      (marketDataService as any).primaryProvider = mockAlphaInstance;

      const result = await marketDataService.getHistoricalData(mockRequest);

      expect(result).toEqual(mockData);
      expect(mockAlphaInstance.getHistoricalData).toHaveBeenCalledWith(mockRequest);
    });

    it('should fallback to secondary provider when primary fails', async () => {
      const mockAlphaInstance = new mockAlphaVantage();
      const mockYahooInstance = new mockYahooFinance();
      
      mockAlphaInstance.getHistoricalData.mockRejectedValue(new Error('Primary provider failed'));
      mockYahooInstance.getHistoricalData.mockResolvedValue(mockData);

      (marketDataService as any).primaryProvider = mockAlphaInstance;
      (marketDataService as any).fallbackProviders = [mockYahooInstance];

      const result = await marketDataService.getHistoricalData(mockRequest);

      expect(result).toEqual(mockData);
      expect(mockYahooInstance.getHistoricalData).toHaveBeenCalledWith(mockRequest);
    });

    it('should throw error when all providers fail', async () => {
      const mockAlphaInstance = new mockAlphaVantage();
      const mockYahooInstance = new mockYahooFinance();
      
      mockAlphaInstance.getHistoricalData.mockRejectedValue(new Error('Primary failed'));
      mockYahooInstance.getHistoricalData.mockRejectedValue(new Error('Fallback failed'));

      (marketDataService as any).primaryProvider = mockAlphaInstance;
      (marketDataService as any).fallbackProviders = [mockYahooInstance];

      await expect(marketDataService.getHistoricalData(mockRequest))
        .rejects.toThrow('All market data providers failed to retrieve historical data');
    });

    it('should throw error for invalid request', async () => {
      mockDataValidator.validateHistoricalDataRequest.mockReturnValue({
        isValid: false,
        errors: ['Invalid symbol'],
        warnings: []
      });

      await expect(marketDataService.getHistoricalData(mockRequest))
        .rejects.toThrow('Invalid request: Invalid symbol');
    });
  });

  describe('getCurrentQuote', () => {
    const mockQuote: RealTimeQuote = {
      symbol: 'AAPL',
      price: 150.25,
      bid: 150.20,
      ask: 150.30,
      volume: 1000000,
      timestamp: new Date()
    };

    it('should return quote from primary provider', async () => {
      const mockAlphaInstance = new mockAlphaVantage();
      mockAlphaInstance.getCurrentQuote.mockResolvedValue(mockQuote);

      (marketDataService as any).primaryProvider = mockAlphaInstance;

      const result = await marketDataService.getCurrentQuote('AAPL');

      expect(result).toEqual(mockQuote);
      expect(mockAlphaInstance.getCurrentQuote).toHaveBeenCalledWith('AAPL');
    });

    it('should fallback when primary provider fails', async () => {
      const mockAlphaInstance = new mockAlphaVantage();
      const mockYahooInstance = new mockYahooFinance();
      
      mockAlphaInstance.getCurrentQuote.mockRejectedValue(new Error('Primary failed'));
      mockYahooInstance.getCurrentQuote.mockResolvedValue(mockQuote);

      (marketDataService as any).primaryProvider = mockAlphaInstance;
      (marketDataService as any).fallbackProviders = [mockYahooInstance];

      const result = await marketDataService.getCurrentQuote('AAPL');

      expect(result).toEqual(mockQuote);
      expect(mockYahooInstance.getCurrentQuote).toHaveBeenCalledWith('AAPL');
    });

    it('should throw error for invalid symbol', async () => {
      mockDataValidator.validateSymbol.mockReturnValue({
        isValid: false,
        errors: ['Invalid symbol format'],
        warnings: []
      });

      await expect(marketDataService.getCurrentQuote('INVALID'))
        .rejects.toThrow('Invalid symbol: Invalid symbol format');
    });
  });

  describe('getMultipleQuotes', () => {
    const mockQuote1: RealTimeQuote = {
      symbol: 'AAPL',
      price: 150.25,
      bid: 150.20,
      ask: 150.30,
      volume: 1000000,
      timestamp: new Date()
    };

    const mockQuote2: RealTimeQuote = {
      symbol: 'GOOGL',
      price: 2500.50,
      bid: 2500.00,
      ask: 2501.00,
      volume: 500000,
      timestamp: new Date()
    };

    it('should return quotes for multiple symbols', async () => {
      const mockAlphaInstance = new mockAlphaVantage();
      mockAlphaInstance.getCurrentQuote
        .mockResolvedValueOnce(mockQuote1)
        .mockResolvedValueOnce(mockQuote2);

      (marketDataService as any).primaryProvider = mockAlphaInstance;

      const result = await marketDataService.getMultipleQuotes(['AAPL', 'GOOGL']);

      expect(result).toEqual({
        'AAPL': mockQuote1,
        'GOOGL': mockQuote2
      });
    });

    it('should handle partial failures gracefully', async () => {
      const mockAlphaInstance = new mockAlphaVantage();
      mockAlphaInstance.getCurrentQuote
        .mockResolvedValueOnce(mockQuote1)
        .mockRejectedValueOnce(new Error('Failed to get GOOGL'));

      (marketDataService as any).primaryProvider = mockAlphaInstance;
      (marketDataService as any).fallbackProviders = [];

      const result = await marketDataService.getMultipleQuotes(['AAPL', 'GOOGL']);

      expect(result).toEqual({
        'AAPL': mockQuote1
      });
    });
  });

  describe('getMarketSummary', () => {
    it('should calculate market summary correctly', async () => {
      const mockQuote1: RealTimeQuote = {
        symbol: 'AAPL',
        price: 100,
        bid: 99.50,
        ask: 100.50,
        volume: 1000000,
        timestamp: new Date()
      };

      const mockQuote2: RealTimeQuote = {
        symbol: 'GOOGL',
        price: 200,
        bid: 199.50,
        ask: 200.50,
        volume: 500000,
        timestamp: new Date()
      };

      const mockAlphaInstance = new mockAlphaVantage();
      mockAlphaInstance.getCurrentQuote
        .mockResolvedValueOnce(mockQuote1)
        .mockResolvedValueOnce(mockQuote2);

      (marketDataService as any).primaryProvider = mockAlphaInstance;

      const result = await marketDataService.getMarketSummary(['AAPL', 'GOOGL']);

      expect(result).toEqual({
        totalSymbols: 2,
        successfulQuotes: 2,
        failedQuotes: 0,
        averagePrice: 150, // (100 + 200) / 2
        totalVolume: 1500000 // 1000000 + 500000
      });
    });
  });

  describe('getProviderStatus', () => {
    it('should return status of all providers', async () => {
      const mockAlphaInstance = new mockAlphaVantage();
      const mockYahooInstance = new mockYahooFinance();
      
      mockAlphaInstance.isAvailable.mockResolvedValue(true);
      mockYahooInstance.isAvailable.mockResolvedValue(false);
      
      mockAlphaInstance.name = 'AlphaVantage';
      mockYahooInstance.name = 'YahooFinance';

      (marketDataService as any).providers = [mockAlphaInstance, mockYahooInstance];

      const result = await marketDataService.getProviderStatus();

      expect(result).toEqual({
        'AlphaVantage': true,
        'YahooFinance': false
      });
    });
  });
});