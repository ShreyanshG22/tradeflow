import { AuthService, AuthConfig } from '../../services/authService';
import { RedisService } from '../../services/redisService';
import { DatabaseService } from '../../services/databaseService';
import { initializeEncryption } from '@tradeflow/zerodha-utils';
import { ZerodhaAuthResponse, ZerodhaUserProfile } from '@tradeflow/types';

// Mock dependencies
jest.mock('@tradeflow/zerodha-utils', () => ({
  ZerodhaAPIClient: jest.fn().mockImplementation(() => ({
    post: jest.fn(),
    get: jest.fn(),
    setAccessToken: jest.fn(),
    clearAccessToken: jest.fn()
  })),
  getEncryptionService: jest.fn(() => ({
    encrypt: jest.fn((text) => `encrypted_${text}`),
    decrypt: jest.fn((text) => text.replace('encrypted_', '')),
    generateChecksum: jest.fn(() => 'test_checksum'),
    verifyChecksum: jest.fn(() => true)
  })),
  initializeEncryption: jest.fn(),
  createLogger: jest.fn(() => ({
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn()
  }))
}));

jest.mock('jsonwebtoken', () => ({
  sign: jest.fn(() => 'test_jwt_token'),
  verify: jest.fn(() => ({ userId: 'test_user_id', zerodhaUserId: 'test_zerodha_id' }))
}));

describe('AuthService', () => {
  let authService: AuthService;
  let mockRedisService: jest.Mocked<RedisService>;
  let mockDatabaseService: jest.Mocked<DatabaseService>;
  let authConfig: AuthConfig;

  beforeEach(() => {
    // Initialize encryption
    initializeEncryption({ key: 'test_encryption_key_32_characters' });

    // Mock services
    mockRedisService = {
      setSession: jest.fn(),
      getSession: jest.fn(),
      deleteSession: jest.fn(),
      connect: jest.fn(),
      disconnect: jest.fn(),
      isReady: jest.fn(() => true),
      sessionExists: jest.fn(),
      getSessionTTL: jest.fn(),
      extendSession: jest.fn(),
      setRateLimit: jest.fn(),
      getRateLimit: jest.fn(),
      incrementRateLimit: jest.fn(),
      setTemporary: jest.fn(),
      getTemporary: jest.fn(),
      healthCheck: jest.fn()
    } as any;

    mockDatabaseService = {
      storeUserTokens: jest.fn(),
      getUserTokens: jest.fn(),
      expireUserTokens: jest.fn(),
      initialize: jest.fn(),
      close: jest.fn(),
      healthCheck: jest.fn(),
      getUserByZerodhaId: jest.fn(),
      cleanupExpiredTokens: jest.fn(),
      getTokenStats: jest.fn()
    } as any;

    authConfig = {
      apiKey: 'test_api_key',
      apiSecret: 'test_api_secret',
      redirectUrl: 'http://localhost:3000/callback',
      jwtSecret: 'test_jwt_secret',
      jwtExpiresIn: '8h',
      encryptionKey: 'test_encryption_key_32_characters'
    };

    authService = new AuthService(authConfig, mockRedisService, mockDatabaseService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('generateLoginUrl', () => {
    it('should generate correct login URL without state', () => {
      const loginUrl = authService.generateLoginUrl();
      
      expect(loginUrl).toContain('https://kite.trade/connect/login');
      expect(loginUrl).toContain('api_key=test_api_key');
      expect(loginUrl).toContain('v=3');
    });

    it('should generate correct login URL with state', () => {
      const state = 'test_state_123';
      const loginUrl = authService.generateLoginUrl(state);
      
      expect(loginUrl).toContain('https://kite.trade/connect/login');
      expect(loginUrl).toContain('api_key=test_api_key');
      expect(loginUrl).toContain('v=3');
      expect(loginUrl).toContain(`state=${state}`);
    });
  });

  describe('generateChecksum', () => {
    it('should generate checksum for request token', () => {
      const requestToken = 'test_request_token';
      const checksum = authService.generateChecksum(requestToken);
      
      expect(checksum).toBe('test_checksum');
    });
  });

  describe('verifyChecksum', () => {
    it('should verify checksum correctly', () => {
      const requestToken = 'test_request_token';
      const checksum = 'test_checksum';
      
      const isValid = authService.verifyChecksum(requestToken, checksum);
      
      expect(isValid).toBe(true);
    });
  });

  describe('exchangeRequestToken', () => {
    it('should exchange request token for access token successfully', async () => {
      const mockAuthResponse: ZerodhaAuthResponse = {
        access_token: 'test_access_token',
        public_token: 'test_public_token',
        refresh_token: 'test_refresh_token',
        login_time: '2023-01-01 10:00:00',
        user_id: 'test_zerodha_id',
        user_name: 'Test User',
        user_shortname: 'Test',
        user_type: 'individual',
        email: 'test@example.com',
        broker: 'ZERODHA',
        exchanges: ['NSE', 'BSE'],
        products: ['CNC', 'MIS'],
        order_types: ['MARKET', 'LIMIT'],
        api_key: 'test_api_key'
      };

      const mockApiClient = require('@tradeflow/zerodha-utils').ZerodhaAPIClient;
      mockApiClient.mockImplementation(() => ({
        post: jest.fn().mockResolvedValue({
          status: 'success',
          data: mockAuthResponse
        }),
        setAccessToken: jest.fn()
      }));

      authService = new AuthService(authConfig, mockRedisService, mockDatabaseService);
      
      const result = await authService.exchangeRequestToken('test_request_token');
      
      expect(result).toEqual(mockAuthResponse);
    });

    it('should throw error when token exchange fails', async () => {
      const mockApiClient = require('@tradeflow/zerodha-utils').ZerodhaAPIClient;
      mockApiClient.mockImplementation(() => ({
        post: jest.fn().mockResolvedValue({
          status: 'error',
          message: 'Invalid request token'
        })
      }));

      authService = new AuthService(authConfig, mockRedisService, mockDatabaseService);
      
      await expect(authService.exchangeRequestToken('invalid_token'))
        .rejects.toThrow('Invalid request token');
    });
  });

  describe('getUserProfile', () => {
    it('should get user profile successfully', async () => {
      const mockProfile: ZerodhaUserProfile = {
        user_id: 'test_zerodha_id',
        user_name: 'Test User',
        user_shortname: 'Test',
        user_type: 'individual',
        email: 'test@example.com',
        phone: '+91-9876543210',
        broker: 'ZERODHA',
        exchanges: ['NSE', 'BSE'],
        products: ['CNC', 'MIS'],
        order_types: ['MARKET', 'LIMIT']
      };

      const mockApiClient = require('@tradeflow/zerodha-utils').ZerodhaAPIClient;
      mockApiClient.mockImplementation(() => ({
        get: jest.fn().mockResolvedValue({
          status: 'success',
          data: mockProfile
        }),
        setAccessToken: jest.fn()
      }));

      authService = new AuthService(authConfig, mockRedisService, mockDatabaseService);
      
      const result = await authService.getUserProfile('test_access_token');
      
      expect(result).toEqual(mockProfile);
    });

    it('should throw error when profile fetch fails', async () => {
      const mockApiClient = require('@tradeflow/zerodha-utils').ZerodhaAPIClient;
      mockApiClient.mockImplementation(() => ({
        get: jest.fn().mockResolvedValue({
          status: 'error',
          message: 'Invalid access token'
        }),
        setAccessToken: jest.fn()
      }));

      authService = new AuthService(authConfig, mockRedisService, mockDatabaseService);
      
      await expect(authService.getUserProfile('invalid_token'))
        .rejects.toThrow('Invalid access token');
    });
  });

  describe('createJWTToken', () => {
    it('should create JWT token with correct payload', () => {
      const userId = 'test_user_id';
      const zerodhaUserId = 'test_zerodha_id';
      
      const token = authService.createJWTToken(userId, zerodhaUserId);
      
      expect(token).toBe('test_jwt_token');
    });
  });

  describe('verifyJWTToken', () => {
    it('should verify JWT token and return user info', () => {
      const token = 'test_jwt_token';
      
      const result = authService.verifyJWTToken(token);
      
      expect(result).toEqual({
        userId: 'test_user_id',
        zerodhaUserId: 'test_zerodha_id'
      });
    });

    it('should throw error for invalid token', () => {
      const jwt = require('jsonwebtoken');
      jwt.verify.mockImplementation(() => {
        throw new Error('Invalid token');
      });

      expect(() => authService.verifyJWTToken('invalid_token'))
        .toThrow('Invalid or expired token');
    });
  });

  describe('storeUserSession', () => {
    it('should store user session successfully', async () => {
      const userId = 'test_user_id';
      const zerodhaUserId = 'test_zerodha_id';
      const mockAuthResponse: ZerodhaAuthResponse = {
        access_token: 'test_access_token',
        public_token: 'test_public_token',
        refresh_token: 'test_refresh_token',
        login_time: '2023-01-01 10:00:00',
        user_id: zerodhaUserId,
        user_name: 'Test User',
        user_shortname: 'Test',
        user_type: 'individual',
        email: 'test@example.com',
        broker: 'ZERODHA',
        exchanges: ['NSE', 'BSE'],
        products: ['CNC', 'MIS'],
        order_types: ['MARKET', 'LIMIT'],
        api_key: 'test_api_key'
      };

      mockRedisService.setSession.mockResolvedValue();
      mockDatabaseService.storeUserTokens.mockResolvedValue();

      const session = await authService.storeUserSession(userId, zerodhaUserId, mockAuthResponse);

      expect(session.user_id).toBe(zerodhaUserId);
      expect(session.access_token).toBe('test_access_token');
      expect(mockRedisService.setSession).toHaveBeenCalled();
      expect(mockDatabaseService.storeUserTokens).toHaveBeenCalled();
    });
  });

  describe('getUserSession', () => {
    it('should get user session from Redis', async () => {
      const userId = 'test_user_id';
      const mockSession = {
        user_id: 'test_zerodha_id',
        access_token: 'encrypted_test_access_token',
        public_token: 'encrypted_test_public_token',
        login_time: '2023-01-01 10:00:00',
        expires_at: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(), // 8 hours from now
        api_key: 'test_api_key'
      };

      mockRedisService.getSession.mockResolvedValue(mockSession);

      const session = await authService.getUserSession(userId);

      expect(session).toBeDefined();
      expect(session?.user_id).toBe('test_zerodha_id');
      expect(session?.access_token).toBe('test_access_token'); // Decrypted
    });

    it('should return null for expired session', async () => {
      const userId = 'test_user_id';
      const mockSession = {
        user_id: 'test_zerodha_id',
        access_token: 'encrypted_test_access_token',
        public_token: 'encrypted_test_public_token',
        login_time: '2023-01-01 10:00:00',
        expires_at: new Date(Date.now() - 1000).toISOString(), // Expired
        api_key: 'test_api_key'
      };

      mockRedisService.getSession.mockResolvedValue(mockSession);
      mockRedisService.deleteSession.mockResolvedValue();
      mockDatabaseService.expireUserTokens.mockResolvedValue();

      const session = await authService.getUserSession(userId);

      expect(session).toBeNull();
      expect(mockRedisService.deleteSession).toHaveBeenCalledWith(userId);
      expect(mockDatabaseService.expireUserTokens).toHaveBeenCalledWith(userId);
    });
  });

  describe('clearUserSession', () => {
    it('should clear user session successfully', async () => {
      const userId = 'test_user_id';

      mockRedisService.deleteSession.mockResolvedValue();
      mockDatabaseService.expireUserTokens.mockResolvedValue();

      await authService.clearUserSession(userId);

      expect(mockRedisService.deleteSession).toHaveBeenCalledWith(userId);
      expect(mockDatabaseService.expireUserTokens).toHaveBeenCalledWith(userId);
    });
  });

  describe('validateAccessToken', () => {
    it('should validate access token successfully', async () => {
      const mockApiClient = require('@tradeflow/zerodha-utils').ZerodhaAPIClient;
      mockApiClient.mockImplementation(() => ({
        get: jest.fn().mockResolvedValue({
          status: 'success'
        }),
        setAccessToken: jest.fn()
      }));

      authService = new AuthService(authConfig, mockRedisService, mockDatabaseService);

      const isValid = await authService.validateAccessToken('test_access_token');

      expect(isValid).toBe(true);
    });

    it('should return false for invalid access token', async () => {
      const mockApiClient = require('@tradeflow/zerodha-utils').ZerodhaAPIClient;
      mockApiClient.mockImplementation(() => ({
        get: jest.fn().mockResolvedValue({
          status: 'error'
        }),
        setAccessToken: jest.fn()
      }));

      authService = new AuthService(authConfig, mockRedisService, mockDatabaseService);

      const isValid = await authService.validateAccessToken('invalid_token');

      expect(isValid).toBe(false);
    });
  });

  describe('refreshAccessToken', () => {
    it('should return null as refresh is not supported', async () => {
      const result = await authService.refreshAccessToken('test_refresh_token');
      
      expect(result).toBeNull();
    });
  });
});