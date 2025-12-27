import { HistoricalDataService } from '../../services/HistoricalDataService';
import { RedisService } from '../../services/RedisService';
import { InstrumentService } from '../../services/InstrumentService';
import { ZerodhaAPIClient } from '@tradeflow/zerodha-utils';
import { ZerodhaHistoricalData } from '@tradeflow/types';

// Mock dependencies
jest.mock('../../services/RedisService');
jest.mock('../../services/InstrumentService');
jest.mock('@tradeflow/zerodha-utils');

const MockedRedisService = RedisService as jest.MockedClass<typeof RedisService>;
const MockedInstrumentService = InstrumentService as jest.MockedClass<typeof InstrumentService>;
const MockedZerodhaAPIClient = ZerodhaAPIClient as jest.MockedClass<typeof ZerodhaAPIClient>;

describe('HistoricalDataService', () => {
  let historicalDataService: HistoricalDataService;
  let mockApiClient: jest.Mocked<ZerodhaAPIClient>;
  let mockRedisService: jest.Mocked<RedisService>;
  let mockInstrumentService: jest.Mocked<InstrumentService>;

  const mockHistoricalData: ZerodhaHistoricalData[] = [
    {
      date: '2024-01-01T09:15:00+05:30',
      open: 18500,
      high: 18600,
      low: 18450,
      close: 18550,
      volume: 1000000,
    },
    {
      date: '2024-01-01T09:16:00+05:30',
      open: 18550,
      high: 18650,
      low: 18500,
      close: 18600,
      volume: 1200000,
    },
  ];

  const mockInstrument = {
    instrument_token: 256265,
    exchange_token: 1009,
    tradingsymbol: 'NIFTY 50',
    name: 'NIFTY 50',
    last_price: 18500,
    tick_size: 0.05,
    lot_size: 50,
    instrument_type: 'EQ',
    segment: 'INDICES',
    exchange: 'NSE' as const,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockApiClient = new MockedZerodhaAPIClient({} as any) as jest.Mocked<ZerodhaAPIClient>;
    mockRedisService = new MockedRedisService() as jest.Mocked<RedisService>;
    mockInstrumentService = new MockedInstrumentService({} as any) as jest.Mocked<InstrumentService>;
    
    historicalDataService = new HistoricalDataService(
      mockApiClient,
      mockRedisService,
      mockInstrumentService
    );
  });

  describe('getHistoricalData', () => {
    const validRequest = {
      instrument_token: 256265,
      interval: '1minute' as const,
      from_date: '2024-01-01',
      to_date: '2024-01-02',
    };

    beforeEach(() => {
      mockInstrumentService.getInstrumentByToken.mockReturnValue(mockInstrument);
      mockApiClient.hasValidToken.mockReturnValue(true);
    });

    it('should return cached data when available', async () => {
      mockRedisService.getCachedHistoricalData.mockResolvedValue(mockHistoricalData);

      const result = await historicalDataService.getHistoricalData(validRequest);

      expect(result.cached).toBe(true);
      expect(result.data).toEqual(mockHistoricalData);
      expect(mockApiClient.get).not.toHaveBeenCalled();
    });

    it('should fetch from API when cache is empty', async () => {
      mockRedisService.getCachedHistoricalData.mockResolvedValue(null);
      mockApiClient.get.mockResolvedValue({
        status: 'success',
        data: {
          candles: [
            ['2024-01-01T09:15:00+05:30', 18500, 18600, 18450, 18550, 1000000],
            ['2024-01-01T09:16:00+05:30', 18550, 18650, 18500, 18600, 1200000],
          ],
        },
      });

      const result = await historicalDataService.getHistoricalData(validRequest);

      expect(result.cached).toBe(false);
      expect(result.data).toHaveLength(2);
      expect(result.data[0].open).toBe(18500);
      expect(result.data[0].close).toBe(18550);
      expect(mockRedisService.cacheHistoricalData).toHaveBeenCalled();
    });

    it('should validate request parameters', async () => {
      const invalidRequest = {
        ...validRequest,
        instrument_token: 0,
      };

      await expect(historicalDataService.getHistoricalData(invalidRequest))
        .rejects.toThrow('Invalid instrument token');
    });

    it('should validate date format', async () => {
      const invalidRequest = {
        ...validRequest,
        from_date: 'invalid-date',
      };

      await expect(historicalDataService.getHistoricalData(invalidRequest))
        .rejects.toThrow('Invalid date format');
    });

    it('should validate date range', async () => {
      const invalidRequest = {
        ...validRequest,
        from_date: '2024-01-02',
        to_date: '2024-01-01',
      };

      await expect(historicalDataService.getHistoricalData(invalidRequest))
        .rejects.toThrow('from_date must be before to_date');
    });

    it('should validate instrument exists', async () => {
      mockInstrumentService.getInstrumentByToken.mockReturnValue(null);

      await expect(historicalDataService.getHistoricalData(validRequest))
        .rejects.toThrow('Instrument not found');
    });

    it('should validate interval', async () => {
      const invalidRequest = {
        ...validRequest,
        interval: 'invalid' as any,
      };

      await expect(historicalDataService.getHistoricalData(invalidRequest))
        .rejects.toThrow('Invalid interval');
    });

    it('should handle API errors', async () => {
      mockRedisService.getCachedHistoricalData.mockResolvedValue(null);
      mockApiClient.get.mockResolvedValue({
        status: 'error',
        message: 'API Error',
        error_type: 'GeneralException',
      });

      await expect(historicalDataService.getHistoricalData(validRequest))
        .rejects.toThrow('Invalid response from historical data API');
    });
  });

  describe('getBulkHistoricalData', () => {
    const validRequests = [
      {
        instrument_token: 256265,
        interval: '1minute' as const,
        from_date: '2024-01-01',
        to_date: '2024-01-02',
      },
      {
        instrument_token: 260105,
        interval: '1minute' as const,
        from_date: '2024-01-01',
        to_date: '2024-01-02',
      },
    ];

    beforeEach(() => {
      mockInstrumentService.getInstrumentByToken.mockReturnValue(mockInstrument);
      mockApiClient.hasValidToken.mockReturnValue(true);
      mockRedisService.getCachedHistoricalData.mockResolvedValue(null);
      mockApiClient.get.mockResolvedValue({
        status: 'success',
        data: {
          candles: [
            ['2024-01-01T09:15:00+05:30', 18500, 18600, 18450, 18550, 1000000],
          ],
        },
      });
    });

    it('should process multiple requests', async () => {
      const results = await historicalDataService.getBulkHistoricalData(validRequests);

      expect(results).toHaveLength(2);
      expect(results[0].instrument_token).toBe(256265);
      expect(results[1].instrument_token).toBe(260105);
    });

    it('should handle partial failures', async () => {
      mockApiClient.get
        .mockResolvedValueOnce({
          status: 'success',
          data: { candles: [['2024-01-01T09:15:00+05:30', 18500, 18600, 18450, 18550, 1000000]] },
        })
        .mockRejectedValueOnce(new Error('API Error'));

      const results = await historicalDataService.getBulkHistoricalData(validRequests);

      expect(results).toHaveLength(1);
      expect(results[0].instrument_token).toBe(256265);
    });
  });

  describe('getLatestCandles', () => {
    beforeEach(() => {
      mockInstrumentService.getInstrumentByToken.mockReturnValue(mockInstrument);
      mockApiClient.hasValidToken.mockReturnValue(true);
      mockRedisService.getCachedHistoricalData.mockResolvedValue(null);
    });

    it('should return latest candles', async () => {
      const extendedData = [...mockHistoricalData];
      for (let i = 0; i < 150; i++) {
        extendedData.push({
          date: `2024-01-01T${String(9 + Math.floor(i / 60)).padStart(2, '0')}:${String(15 + (i % 60)).padStart(2, '0')}:00+05:30`,
          open: 18500 + i,
          high: 18600 + i,
          low: 18450 + i,
          close: 18550 + i,
          volume: 1000000 + i * 1000,
        });
      }

      mockApiClient.get.mockResolvedValue({
        status: 'success',
        data: {
          candles: extendedData.map(d => [d.date, d.open, d.high, d.low, d.close, d.volume]),
        },
      });

      const result = await historicalDataService.getLatestCandles(256265, '1minute', 100);

      expect(result).toHaveLength(100);
      expect(result[result.length - 1].close).toBe(18550 + 151); // Last candle
    });

    it('should calculate appropriate date range for different intervals', async () => {
      mockApiClient.get.mockResolvedValue({
        status: 'success',
        data: { candles: [] },
      });

      await historicalDataService.getLatestCandles(256265, 'day', 30);

      expect(mockApiClient.get).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          from: expect.any(String),
          to: expect.any(String),
          interval: 'day',
        })
      );
    });
  });

  describe('clearCache', () => {
    it('should clear cache for specific instrument and interval', async () => {
      await historicalDataService.clearCache(256265, '1minute');

      expect(mockRedisService.flushPattern).toHaveBeenCalledWith('historical:256265:1minute:*');
    });

    it('should clear cache for specific instrument', async () => {
      await historicalDataService.clearCache(256265);

      expect(mockRedisService.flushPattern).toHaveBeenCalledWith('historical:256265:*');
    });

    it('should clear all historical cache', async () => {
      await historicalDataService.clearCache();

      expect(mockRedisService.flushPattern).toHaveBeenCalledWith('historical:*');
    });
  });

  describe('rate limiting', () => {
    beforeEach(() => {
      mockInstrumentService.getInstrumentByToken.mockReturnValue(mockInstrument);
      mockApiClient.hasValidToken.mockReturnValue(true);
      mockRedisService.getCachedHistoricalData.mockResolvedValue(null);
      mockApiClient.get.mockResolvedValue({
        status: 'success',
        data: {
          candles: [['2024-01-01T09:15:00+05:30', 18500, 18600, 18450, 18550, 1000000]],
        },
      });
    });

    it('should enforce rate limiting between requests', async () => {
      jest.useFakeTimers();
      
      const request = {
        instrument_token: 256265,
        interval: '1minute' as const,
        from_date: '2024-01-01',
        to_date: '2024-01-02',
      };

      // First request should go through immediately
      const promise1 = historicalDataService.getHistoricalData(request);
      await promise1;

      // Second request should be delayed
      const promise2 = historicalDataService.getHistoricalData({
        ...request,
        instrument_token: 260105,
      });

      // Fast-forward time to trigger rate limit delay
      jest.advanceTimersByTime(20000);
      await promise2;

      expect(mockApiClient.get).toHaveBeenCalledTimes(2);
      
      jest.useRealTimers();
    });
  });

  describe('getStats', () => {
    it('should return service statistics', () => {
      const stats = historicalDataService.getStats();

      expect(stats).toHaveProperty('rateLimitQueue');
      expect(stats).toHaveProperty('lastRequest');
      expect(typeof stats.rateLimitQueue).toBe('number');
    });
  });
});