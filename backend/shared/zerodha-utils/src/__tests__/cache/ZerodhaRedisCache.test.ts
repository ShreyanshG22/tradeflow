import { ZerodhaRedisCache, RedisCacheConfig, MarketQuote, InstrumentData, SessionData } from '../../cache/ZerodhaRedisCache';

// Mock redis module
jest.mock('redis', () => ({
  createClient: jest.fn().mockImplementation(() => ({
    connect: jest.fn(),
    disconnect: jest.fn(),
    on: jest.fn(),
    setEx: jest.fn(),
    get: jest.fn(),
    mGet: jest.fn(),
    del: jest.fn(),
    incr: jest.fn(),
    expire: jest.fn(),
    multi: jest.fn().mockReturnValue({
      setEx: jest.fn().mockReturnThis(),
      incr: jest.fn().mockReturnThis(),
      expire: jest.fn().mockReturnThis(),
      exec: jest.fn()
    }),
    ping: jest.fn(),
    keys: jest.fn(),
    info: jest.fn(),
    dbSize: jest.fn()
  }))
}));

describe('ZerodhaRedisCache', () => {
  let cache: ZerodhaRedisCache;
  let mockClient: any;

  beforeEach(() => {
    const { createClient } = require('redis');
    mockClient = createClient();
    
    const config: RedisCacheConfig = {
      url: 'redis://localhost:6379',
      keyPrefix: 'test_zerodha',
      defaultTTL: 3600
    };

    cache = new ZerodhaRedisCache(config);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with correct configuration', () => {
      const { createClient } = require('redis');
      
      expect(createClient).toHaveBeenCalledWith({
        url: 'redis://localhost:6379',
        socket: {
          reconnectStrategy: expect.any(Function)
        }
      });
    });

    it('should setup event handlers', () => {
      expect(mockClient.on).toHaveBeenCalledWith('connect', expect.any(Function));
      expect(mockClient.on).toHaveBeenCalledWith('ready', expect.any(Function));
      expect(mockClient.on).toHaveBeenCalledWith('error', expect.any(Function));
      expect(mockClient.on).toHaveBeenCalledWith('end', expect.any(Function));
      expect(mockClient.on).toHaveBeenCalledWith('reconnecting', expect.any(Function));
    });
  });

  describe('connect', () => {
    it('should connect to Redis successfully', async () => {
      mockClient.connect.mockResolvedValue(undefined);

      await cache.connect();

      expect(mockClient.connect).toHaveBeenCalled();
    });

    it('should handle connection errors', async () => {
      const error = new Error('Connection failed');
      mockClient.connect.mockRejectedValue(error);

      await expect(cache.connect()).rejects.toThrow('Connection failed');
    });
  });

  describe('disconnect', () => {
    it('should disconnect from Redis successfully', async () => {
      mockClient.disconnect.mockResolvedValue(undefined);
      // Simulate connected state
      cache['isConnected'] = true;

      await cache.disconnect();

      expect(mockClient.disconnect).toHaveBeenCalled();
    });
  });

  describe('cacheMarketQuote', () => {
    it('should cache market quote successfully', async () => {
      const quote: MarketQuote = {
        instrument_token: 123456,
        tradingsymbol: 'RELIANCE',
        exchange: 'NSE',
        last_price: 2500.50,
        volume: 1000000,
        ohlc: { open: 2480.00, high: 2520.00, low: 2475.00, close: 2500.50 },
        net_change: 20.50,
        timestamp: '2024-12-27T10:00:00Z'
      };

      mockClient.setEx.mockResolvedValue('OK');

      await cache.cacheMarketQuote(123456, quote, { ttl: 60 });

      expect(mockClient.setEx).toHaveBeenCalledWith(
        'test_zerodha:quote:123456',
        60,
        JSON.stringify(quote)
      );
    });

    it('should handle cache errors gracefully', async () => {
      const quote: MarketQuote = {
        instrument_token: 123456,
        tradingsymbol: 'RELIANCE',
        exchange: 'NSE',
        last_price: 2500.50,
        volume: 1000000,
        ohlc: { open: 2480.00, high: 2520.00, low: 2475.00, close: 2500.50 },
        net_change: 20.50,
        timestamp: '2024-12-27T10:00:00Z'
      };

      mockClient.setEx.mockRejectedValue(new Error('Redis error'));

      // Should not throw error
      await expect(cache.cacheMarketQuote(123456, quote)).resolves.not.toThrow();
    });
  });

  describe('getMarketQuote', () => {
    it('should get cached market quote successfully', async () => {
      const quote: MarketQuote = {
        instrument_token: 123456,
        tradingsymbol: 'RELIANCE',
        exchange: 'NSE',
        last_price: 2500.50,
        volume: 1000000,
        ohlc: { open: 2480.00, high: 2520.00, low: 2475.00, close: 2500.50 },
        net_change: 20.50,
        timestamp: '2024-12-27T10:00:00Z'
      };

      mockClient.get.mockResolvedValue(JSON.stringify(quote));

      const result = await cache.getMarketQuote(123456);

      expect(mockClient.get).toHaveBeenCalledWith('test_zerodha:quote:123456');
      expect(result).toEqual(quote);
    });

    it('should return null when quote not found', async () => {
      mockClient.get.mockResolvedValue(null);

      const result = await cache.getMarketQuote(123456);

      expect(result).toBeNull();
    });

    it('should handle get errors', async () => {
      mockClient.get.mockRejectedValue(new Error('Redis error'));

      const result = await cache.getMarketQuote(123456);

      expect(result).toBeNull();
    });
  });

  describe('cacheMarketQuotes', () => {
    it('should cache multiple market quotes successfully', async () => {
      const quotes: MarketQuote[] = [
        {
          instrument_token: 123456,
          tradingsymbol: 'RELIANCE',
          exchange: 'NSE',
          last_price: 2500.50,
          volume: 1000000,
          ohlc: { open: 2480.00, high: 2520.00, low: 2475.00, close: 2500.50 },
          net_change: 20.50,
          timestamp: '2024-12-27T10:00:00Z'
        },
        {
          instrument_token: 789012,
          tradingsymbol: 'TCS',
          exchange: 'NSE',
          last_price: 3800.75,
          volume: 500000,
          ohlc: { open: 3780.00, high: 3820.00, low: 3775.00, close: 3800.75 },
          net_change: 15.75,
          timestamp: '2024-12-27T10:00:00Z'
        }
      ];

      const mockMulti = {
        setEx: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(['OK', 'OK'])
      };
      mockClient.multi.mockReturnValue(mockMulti);

      await cache.cacheMarketQuotes(quotes, { ttl: 60 });

      expect(mockClient.multi).toHaveBeenCalled();
      expect(mockMulti.setEx).toHaveBeenCalledTimes(2);
      expect(mockMulti.exec).toHaveBeenCalled();
    });
  });

  describe('getMarketQuotes', () => {
    it('should get multiple cached market quotes successfully', async () => {
      const quotes: MarketQuote[] = [
        {
          instrument_token: 123456,
          tradingsymbol: 'RELIANCE',
          exchange: 'NSE',
          last_price: 2500.50,
          volume: 1000000,
          ohlc: { open: 2480.00, high: 2520.00, low: 2475.00, close: 2500.50 },
          net_change: 20.50,
          timestamp: '2024-12-27T10:00:00Z'
        }
      ];

      mockClient.mGet.mockResolvedValue([JSON.stringify(quotes[0]), null]);

      const result = await cache.getMarketQuotes([123456, 789012]);

      expect(mockClient.mGet).toHaveBeenCalledWith([
        'test_zerodha:quote:123456',
        'test_zerodha:quote:789012'
      ]);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(quotes[0]);
    });
  });

  describe('cacheInstrument', () => {
    it('should cache instrument successfully', async () => {
      const instrument: InstrumentData = {
        instrument_token: 123456,
        tradingsymbol: 'RELIANCE',
        name: 'Reliance Industries Limited',
        exchange: 'NSE',
        segment: 'NSE',
        instrument_type: 'EQ',
        lot_size: 1,
        tick_size: 0.05
      };

      mockClient.setEx.mockResolvedValue('OK');

      await cache.cacheInstrument(123456, instrument, { ttl: 86400 });

      expect(mockClient.setEx).toHaveBeenCalledWith(
        'test_zerodha:instrument:123456',
        86400,
        JSON.stringify(instrument)
      );
    });
  });

  describe('getInstrument', () => {
    it('should get cached instrument successfully', async () => {
      const instrument: InstrumentData = {
        instrument_token: 123456,
        tradingsymbol: 'RELIANCE',
        name: 'Reliance Industries Limited',
        exchange: 'NSE',
        segment: 'NSE',
        instrument_type: 'EQ',
        lot_size: 1,
        tick_size: 0.05
      };

      mockClient.get.mockResolvedValue(JSON.stringify(instrument));

      const result = await cache.getInstrument(123456);

      expect(mockClient.get).toHaveBeenCalledWith('test_zerodha:instrument:123456');
      expect(result).toEqual(instrument);
    });
  });

  describe('cacheSession', () => {
    it('should cache session successfully', async () => {
      const session: SessionData = {
        user_id: 'ZU1234',
        access_token: 'access_token_123',
        public_token: 'public_token_123',
        refresh_token: 'refresh_token_123',
        login_time: '2024-12-27T10:00:00Z',
        expires_at: '2024-12-27T18:00:00Z',
        api_key: 'api_key_123'
      };

      mockClient.setEx.mockResolvedValue('OK');

      await cache.cacheSession('user-1', session, { ttl: 28800 });

      expect(mockClient.setEx).toHaveBeenCalledWith(
        'test_zerodha:session:user-1',
        28800,
        JSON.stringify(session)
      );
    });
  });

  describe('getSession', () => {
    it('should get cached session successfully', async () => {
      const session: SessionData = {
        user_id: 'ZU1234',
        access_token: 'access_token_123',
        public_token: 'public_token_123',
        refresh_token: 'refresh_token_123',
        login_time: '2024-12-27T10:00:00Z',
        expires_at: '2024-12-27T18:00:00Z',
        api_key: 'api_key_123'
      };

      mockClient.get.mockResolvedValue(JSON.stringify(session));

      const result = await cache.getSession('user-1');

      expect(mockClient.get).toHaveBeenCalledWith('test_zerodha:session:user-1');
      expect(result).toEqual(session);
    });
  });

  describe('deleteSession', () => {
    it('should delete session successfully', async () => {
      mockClient.del.mockResolvedValue(1);

      await cache.deleteSession('user-1');

      expect(mockClient.del).toHaveBeenCalledWith('test_zerodha:session:user-1');
    });
  });

  describe('incrementRateLimit', () => {
    it('should increment rate limit successfully', async () => {
      const mockMulti = {
        incr: jest.fn().mockReturnThis(),
        expire: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([5, 'OK'])
      };
      mockClient.multi.mockReturnValue(mockMulti);

      const result = await cache.incrementRateLimit('user-1', 60);

      expect(mockClient.multi).toHaveBeenCalled();
      expect(mockMulti.incr).toHaveBeenCalledWith('test_zerodha:rate_limit:user-1');
      expect(mockMulti.expire).toHaveBeenCalledWith('test_zerodha:rate_limit:user-1', 60);
      expect(result).toBe(5);
    });
  });

  describe('getRateLimit', () => {
    it('should get rate limit successfully', async () => {
      mockClient.get.mockResolvedValue('3');

      const result = await cache.getRateLimit('user-1');

      expect(mockClient.get).toHaveBeenCalledWith('test_zerodha:rate_limit:user-1');
      expect(result).toBe(3);
    });

    it('should return 0 when no rate limit found', async () => {
      mockClient.get.mockResolvedValue(null);

      const result = await cache.getRateLimit('user-1');

      expect(result).toBe(0);
    });
  });

  describe('invalidatePattern', () => {
    it('should invalidate cache by pattern successfully', async () => {
      const keys = ['test_zerodha:quote:123456', 'test_zerodha:quote:789012'];
      mockClient.keys.mockResolvedValue(keys);
      mockClient.del.mockResolvedValue(2);

      const result = await cache.invalidatePattern('quote:*');

      expect(mockClient.keys).toHaveBeenCalledWith('test_zerodha:quote:*');
      expect(mockClient.del).toHaveBeenCalledWith(keys);
      expect(result).toBe(2);
    });

    it('should return 0 when no keys found', async () => {
      mockClient.keys.mockResolvedValue([]);

      const result = await cache.invalidatePattern('quote:*');

      expect(result).toBe(0);
    });
  });

  describe('healthCheck', () => {
    it('should return healthy status', async () => {
      mockClient.ping.mockResolvedValue('PONG');

      const result = await cache.healthCheck();

      expect(mockClient.ping).toHaveBeenCalled();
      expect(result.status).toBe('healthy');
      expect(result.latency).toBeGreaterThanOrEqual(0);
    });

    it('should return unhealthy status on error', async () => {
      mockClient.ping.mockRejectedValue(new Error('Connection failed'));

      const result = await cache.healthCheck();

      expect(result.status).toBe('unhealthy');
      expect(result.latency).toBeUndefined();
    });
  });

  describe('getStats', () => {
    it('should get cache statistics successfully', async () => {
      mockClient.info.mockResolvedValue('used_memory_human:10.5M\r\n');
      mockClient.dbSize.mockResolvedValue(1000);
      mockClient.keys.mockResolvedValue(['key1', 'key2', 'key3']);
      cache['isConnected'] = true;

      const result = await cache.getStats();

      expect(result).toEqual({
        connected: true,
        memory_usage: '10.5M',
        total_keys: 1000,
        zerodha_keys: 3
      });
    });

    it('should return disconnected status when not connected', async () => {
      cache['isConnected'] = false;

      const result = await cache.getStats();

      expect(result).toEqual({ connected: false });
    });
  });
});