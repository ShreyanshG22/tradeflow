import { InstrumentService } from '../../services/InstrumentService';
import { RedisService } from '../../services/RedisService';
import { ZerodhaInstrument } from '@tradeflow/types';

// Mock RedisService
jest.mock('../../services/RedisService');
const MockedRedisService = RedisService as jest.MockedClass<typeof RedisService>;

// Mock axios for instrument CSV download
jest.mock('axios');
import axios from 'axios';
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('InstrumentService', () => {
  let instrumentService: InstrumentService;
  let mockRedisService: jest.Mocked<RedisService>;

  const mockInstrumentCSV = `instrument_token,exchange_token,tradingsymbol,name,last_price,expiry,strike,tick_size,lot_size,instrument_type,segment,exchange
256265,1009,NIFTY 50,NIFTY 50,18500.0,,0,0.05,50,EQ,INDICES,NSE
260105,1016,NIFTY BANK,NIFTY BANK,42000.0,,0,0.05,25,EQ,INDICES,NSE
738561,2884,RELIANCE,RELIANCE INDUSTRIES LTD,2500.0,,0,0.05,1,EQ,EQ,NSE`;

  const mockInstruments: ZerodhaInstrument[] = [
    {
      instrument_token: 256265,
      exchange_token: 1009,
      tradingsymbol: 'NIFTY 50',
      name: 'NIFTY 50',
      last_price: 18500.0,
      tick_size: 0.05,
      lot_size: 50,
      instrument_type: 'EQ',
      segment: 'INDICES',
      exchange: 'NSE',
    },
    {
      instrument_token: 260105,
      exchange_token: 1016,
      tradingsymbol: 'NIFTY BANK',
      name: 'NIFTY BANK',
      last_price: 42000.0,
      tick_size: 0.05,
      lot_size: 25,
      instrument_type: 'EQ',
      segment: 'INDICES',
      exchange: 'NSE',
    },
    {
      instrument_token: 738561,
      exchange_token: 2884,
      tradingsymbol: 'RELIANCE',
      name: 'RELIANCE INDUSTRIES LTD',
      last_price: 2500.0,
      tick_size: 0.05,
      lot_size: 1,
      instrument_type: 'EQ',
      segment: 'EQ',
      exchange: 'NSE',
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockRedisService = new MockedRedisService() as jest.Mocked<RedisService>;
    instrumentService = new InstrumentService(mockRedisService);
  });

  describe('initialize', () => {
    it('should initialize successfully with cached data', async () => {
      mockRedisService.getCachedInstruments.mockResolvedValue(mockInstruments);

      await instrumentService.initialize();

      expect(instrumentService.isReady()).toBe(true);
      expect(mockRedisService.getCachedInstruments).toHaveBeenCalledWith('NSE');
      expect(mockRedisService.getCachedInstruments).toHaveBeenCalledWith('BSE');
    });

    it('should download fresh data when cache is empty', async () => {
      mockRedisService.getCachedInstruments.mockResolvedValue(null);
      mockedAxios.get.mockResolvedValue({ data: mockInstrumentCSV });

      await instrumentService.initialize();

      expect(instrumentService.isReady()).toBe(true);
      expect(mockedAxios.get).toHaveBeenCalled();
      expect(mockRedisService.cacheInstruments).toHaveBeenCalled();
    });
  });

  describe('searchInstruments', () => {
    beforeEach(async () => {
      mockRedisService.getCachedInstruments.mockResolvedValue(mockInstruments);
      await instrumentService.initialize();
    });

    it('should search instruments by symbol', async () => {
      mockRedisService.getCachedInstrumentSearch.mockResolvedValue(null);

      const results = await instrumentService.searchInstruments('NIFTY');

      expect(results).toHaveLength(2);
      expect(results[0].tradingsymbol).toBe('NIFTY 50');
      expect(results[1].tradingsymbol).toBe('NIFTY BANK');
      expect(mockRedisService.cacheInstrumentSearch).toHaveBeenCalled();
    });

    it('should search instruments by name', async () => {
      mockRedisService.getCachedInstrumentSearch.mockResolvedValue(null);

      const results = await instrumentService.searchInstruments('RELIANCE');

      expect(results).toHaveLength(1);
      expect(results[0].tradingsymbol).toBe('RELIANCE');
      expect(results[0].name).toBe('RELIANCE INDUSTRIES LTD');
    });

    it('should return cached search results', async () => {
      const cachedResults = [mockInstruments[0]];
      mockRedisService.getCachedInstrumentSearch.mockResolvedValue(cachedResults);

      const results = await instrumentService.searchInstruments('NIFTY');

      expect(results).toEqual(cachedResults);
      expect(mockRedisService.getCachedInstrumentSearch).toHaveBeenCalled();
    });

    it('should limit search results', async () => {
      mockRedisService.getCachedInstrumentSearch.mockResolvedValue(null);

      const results = await instrumentService.searchInstruments('NIFTY', undefined, 1);

      expect(results).toHaveLength(1);
    });

    it('should filter by exchange', async () => {
      mockRedisService.getCachedInstrumentSearch.mockResolvedValue(null);

      const results = await instrumentService.searchInstruments('NIFTY', 'NSE');

      expect(results).toHaveLength(2);
      expect(results.every(r => r.exchange === 'NSE')).toBe(true);
    });
  });

  describe('getInstrumentByToken', () => {
    beforeEach(async () => {
      mockRedisService.getCachedInstruments.mockResolvedValue(mockInstruments);
      await instrumentService.initialize();
    });

    it('should return instrument by token', () => {
      const instrument = instrumentService.getInstrumentByToken(256265);

      expect(instrument).toBeDefined();
      expect(instrument?.tradingsymbol).toBe('NIFTY 50');
    });

    it('should return null for invalid token', () => {
      const instrument = instrumentService.getInstrumentByToken(999999);

      expect(instrument).toBeNull();
    });
  });

  describe('getInstrumentBySymbol', () => {
    beforeEach(async () => {
      mockRedisService.getCachedInstruments.mockResolvedValue(mockInstruments);
      await instrumentService.initialize();
    });

    it('should return instrument by exchange and symbol', () => {
      const instrument = instrumentService.getInstrumentBySymbol('NSE', 'RELIANCE');

      expect(instrument).toBeDefined();
      expect(instrument?.tradingsymbol).toBe('RELIANCE');
      expect(instrument?.exchange).toBe('NSE');
    });

    it('should return null for invalid symbol', () => {
      const instrument = instrumentService.getInstrumentBySymbol('NSE', 'INVALID');

      expect(instrument).toBeNull();
    });
  });

  describe('getAllInstruments', () => {
    beforeEach(async () => {
      mockRedisService.getCachedInstruments.mockResolvedValue(mockInstruments);
      await instrumentService.initialize();
    });

    it('should return all instruments for exchange', () => {
      const instruments = instrumentService.getAllInstruments('NSE');

      expect(instruments).toHaveLength(3);
      expect(instruments.every(i => i.exchange === 'NSE')).toBe(true);
    });

    it('should return all instruments when no exchange specified', () => {
      const instruments = instrumentService.getAllInstruments();

      expect(instruments).toHaveLength(3);
    });
  });

  describe('getStats', () => {
    beforeEach(async () => {
      mockRedisService.getCachedInstruments.mockResolvedValue(mockInstruments);
      await instrumentService.initialize();
    });

    it('should return instrument statistics', () => {
      const stats = instrumentService.getStats();

      expect(stats).toHaveProperty('NSE');
      expect(stats.NSE).toBe(3);
    });
  });

  describe('refreshInstruments', () => {
    beforeEach(async () => {
      mockRedisService.getCachedInstruments.mockResolvedValue(mockInstruments);
      await instrumentService.initialize();
    });

    it('should refresh instruments for specific exchange', async () => {
      mockedAxios.get.mockResolvedValue({ data: mockInstrumentCSV });

      await instrumentService.refreshInstruments('NSE');

      expect(mockedAxios.get).toHaveBeenCalledWith(
        expect.stringContaining('/instruments/NSE'),
        expect.any(Object)
      );
      expect(mockRedisService.cacheInstruments).toHaveBeenCalledWith('NSE', expect.any(Array));
    });

    it('should refresh all instruments when no exchange specified', async () => {
      mockedAxios.get.mockResolvedValue({ data: mockInstrumentCSV });

      await instrumentService.refreshInstruments();

      expect(mockedAxios.get).toHaveBeenCalledTimes(2); // NSE and BSE
    });
  });
});