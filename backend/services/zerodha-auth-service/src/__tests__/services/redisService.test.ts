import { RedisService } from '../../services/redisService';
import { ZerodhaSession } from '@tradeflow/types';

// Mock Redis client
const mockRedisClient = {
  connect: jest.fn(),
  disconnect: jest.fn(),
  setEx: jest.fn(),
  get: jest.fn(),
  del: jest.fn(),
  exists: jest.fn(),
  ttl: jest.fn(),
  expire: jest.fn(),
  incr: jest.fn(),
  multi: jest.fn(() => ({
    incr: jest.fn().mockReturnThis(),
    expire: jest.fn().mockReturnThis(),
    exec: jest.fn()
  })),
  ping: jest.fn(),
  on: jest.fn()
};

jest.mock('redis', () => ({
  createClient: jest.fn(() => mockRedisClient)
}));

describe('RedisService', () => {
  let redisService: RedisService;
  const redisUrl = 'redis://localhost:6379';

  beforeEach(() => {
    jest.clearAllMocks();
    redisService = new RedisService(redisUrl);
  });

  describe('connect', () => {
    it('should connect to Redis successfully', async () => {
      mockRedisClient.connect.mockResolvedValue(undefined);
      
      await redisService.connect();
      
      expect(mockRedisClient.connect).toHaveBeenCalled();
    });

    it('should handle connection errors', async () => {
      const error = new Error('Connection failed');
      mockRedisClient.connect.mockRejectedValue(error);
      
      await expect(redisService.connect()).rejects.toThrow('Connection failed');
    });
  });

  describe('disconnect', () => {
    it('should disconnect from Redis successfully', async () => {
      mockRedisClient.disconnect.mockResolvedValue(undefined);
      // Set connected state
      (redisService as any).isConnected = true;
      
      await redisService.disconnect();
      
      expect(mockRedisClient.disconnect).toHaveBeenCalled();
    });
  });

  describe('setSession', () => {
    it('should store session in Redis with TTL', async () => {
      const userId = 'test_user_id';
      const session: ZerodhaSession = {
        user_id: 'test_zerodha_id',
        access_token: 'test_access_token',
        public_token: 'test_public_token',
        login_time: '2023-01-01 10:00:00',
        expires_at: '2023-01-01 18:00:00',
        api_key: 'test_api_key'
      };
      const ttl = 3600;

      mockRedisClient.setEx.mockResolvedValue('OK');

      await redisService.setSession(userId, session, ttl);

      expect(mockRedisClient.setEx).toHaveBeenCalledWith(
        'zerodha:session:test_user_id',
        ttl,
        JSON.stringify(session)
      );
    });

    it('should handle Redis errors when storing session', async () => {
      const userId = 'test_user_id';
      const session: ZerodhaSession = {
        user_id: 'test_zerodha_id',
        access_token: 'test_access_token',
        public_token: 'test_public_token',
        login_time: '2023-01-01 10:00:00',
        expires_at: '2023-01-01 18:00:00',
        api_key: 'test_api_key'
      };

      mockRedisClient.setEx.mockRejectedValue(new Error('Redis error'));

      await expect(redisService.setSession(userId, session, 3600))
        .rejects.toThrow('Redis error');
    });
  });

  describe('getSession', () => {
    it('should retrieve session from Redis', async () => {
      const userId = 'test_user_id';
      const session: ZerodhaSession = {
        user_id: 'test_zerodha_id',
        access_token: 'test_access_token',
        public_token: 'test_public_token',
        login_time: '2023-01-01 10:00:00',
        expires_at: '2023-01-01 18:00:00',
        api_key: 'test_api_key'
      };

      mockRedisClient.get.mockResolvedValue(JSON.stringify(session));

      const result = await redisService.getSession(userId);

      expect(result).toEqual(session);
      expect(mockRedisClient.get).toHaveBeenCalledWith('zerodha:session:test_user_id');
    });

    it('should return null when session not found', async () => {
      const userId = 'test_user_id';

      mockRedisClient.get.mockResolvedValue(null);

      const result = await redisService.getSession(userId);

      expect(result).toBeNull();
    });

    it('should handle Redis errors when getting session', async () => {
      const userId = 'test_user_id';

      mockRedisClient.get.mockRejectedValue(new Error('Redis error'));

      const result = await redisService.getSession(userId);

      expect(result).toBeNull();
    });
  });

  describe('deleteSession', () => {
    it('should delete session from Redis', async () => {
      const userId = 'test_user_id';

      mockRedisClient.del.mockResolvedValue(1);

      await redisService.deleteSession(userId);

      expect(mockRedisClient.del).toHaveBeenCalledWith('zerodha:session:test_user_id');
    });

    it('should handle Redis errors when deleting session', async () => {
      const userId = 'test_user_id';

      mockRedisClient.del.mockRejectedValue(new Error('Redis error'));

      await expect(redisService.deleteSession(userId))
        .rejects.toThrow('Redis error');
    });
  });

  describe('sessionExists', () => {
    it('should return true when session exists', async () => {
      const userId = 'test_user_id';

      mockRedisClient.exists.mockResolvedValue(1);

      const exists = await redisService.sessionExists(userId);

      expect(exists).toBe(true);
      expect(mockRedisClient.exists).toHaveBeenCalledWith('zerodha:session:test_user_id');
    });

    it('should return false when session does not exist', async () => {
      const userId = 'test_user_id';

      mockRedisClient.exists.mockResolvedValue(0);

      const exists = await redisService.sessionExists(userId);

      expect(exists).toBe(false);
    });
  });

  describe('getSessionTTL', () => {
    it('should return session TTL', async () => {
      const userId = 'test_user_id';
      const ttl = 3600;

      mockRedisClient.ttl.mockResolvedValue(ttl);

      const result = await redisService.getSessionTTL(userId);

      expect(result).toBe(ttl);
      expect(mockRedisClient.ttl).toHaveBeenCalledWith('zerodha:session:test_user_id');
    });

    it('should handle Redis errors when getting TTL', async () => {
      const userId = 'test_user_id';

      mockRedisClient.ttl.mockRejectedValue(new Error('Redis error'));

      const result = await redisService.getSessionTTL(userId);

      expect(result).toBe(-1);
    });
  });

  describe('extendSession', () => {
    it('should extend session TTL', async () => {
      const userId = 'test_user_id';
      const ttl = 7200;

      mockRedisClient.expire.mockResolvedValue(true);

      await redisService.extendSession(userId, ttl);

      expect(mockRedisClient.expire).toHaveBeenCalledWith('zerodha:session:test_user_id', ttl);
    });

    it('should handle case when session does not exist', async () => {
      const userId = 'test_user_id';
      const ttl = 7200;

      mockRedisClient.expire.mockResolvedValue(false);

      await redisService.extendSession(userId, ttl);

      expect(mockRedisClient.expire).toHaveBeenCalledWith('zerodha:session:test_user_id', ttl);
    });
  });

  describe('incrementRateLimit', () => {
    it('should increment rate limit counter', async () => {
      const userId = 'test_user_id';
      const ttl = 60;
      const count = 5;

      const mockMulti = {
        incr: jest.fn().mockReturnThis(),
        expire: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([count, 'OK'])
      };

      mockRedisClient.multi.mockReturnValue(mockMulti);

      const result = await redisService.incrementRateLimit(userId, ttl);

      expect(result).toBe(count);
      expect(mockMulti.incr).toHaveBeenCalledWith('zerodha:rate_limit:test_user_id');
      expect(mockMulti.expire).toHaveBeenCalledWith('zerodha:rate_limit:test_user_id', ttl);
    });
  });

  describe('setTemporary', () => {
    it('should store temporary data with TTL', async () => {
      const key = 'test_key';
      const value = 'test_value';
      const ttl = 300;

      mockRedisClient.setEx.mockResolvedValue('OK');

      await redisService.setTemporary(key, value, ttl);

      expect(mockRedisClient.setEx).toHaveBeenCalledWith(
        'zerodha:temp:test_key',
        ttl,
        value
      );
    });
  });

  describe('getTemporary', () => {
    it('should retrieve and delete temporary data', async () => {
      const key = 'test_key';
      const value = 'test_value';

      mockRedisClient.get.mockResolvedValue(value);
      mockRedisClient.del.mockResolvedValue(1);

      const result = await redisService.getTemporary(key);

      expect(result).toBe(value);
      expect(mockRedisClient.get).toHaveBeenCalledWith('zerodha:temp:test_key');
      expect(mockRedisClient.del).toHaveBeenCalledWith('zerodha:temp:test_key');
    });

    it('should return null when temporary data not found', async () => {
      const key = 'test_key';

      mockRedisClient.get.mockResolvedValue(null);

      const result = await redisService.getTemporary(key);

      expect(result).toBeNull();
      expect(mockRedisClient.del).not.toHaveBeenCalled();
    });
  });

  describe('healthCheck', () => {
    it('should return healthy status when ping succeeds', async () => {
      mockRedisClient.ping.mockResolvedValue('PONG');

      const result = await redisService.healthCheck();

      expect(result.status).toBe('healthy');
      expect(result.latency).toBeGreaterThanOrEqual(0);
    });

    it('should return unhealthy status when ping fails', async () => {
      mockRedisClient.ping.mockRejectedValue(new Error('Connection failed'));

      const result = await redisService.healthCheck();

      expect(result.status).toBe('unhealthy');
      expect(result.latency).toBeUndefined();
    });
  });
});