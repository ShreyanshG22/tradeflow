import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../../services/authService';
import { 
  createAuthMiddleware, 
  createOptionalAuthMiddleware,
  createRequestLoggingMiddleware,
  createErrorHandlingMiddleware,
  AuthRequest 
} from '../../middleware/authMiddleware';

// Mock AuthService
const mockAuthService = {
  verifyJWTToken: jest.fn(),
  getUserSession: jest.fn()
} as jest.Mocked<Partial<AuthService>>;

describe('AuthMiddleware', () => {
  let req: Partial<AuthRequest>;
  let res: Partial<Response>;
  let next: NextFunction;

  beforeEach(() => {
    req = {
      headers: {},
      user: undefined
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
    next = jest.fn();
    jest.clearAllMocks();
  });

  describe('createAuthMiddleware', () => {
    let authMiddleware: ReturnType<typeof createAuthMiddleware>;

    beforeEach(() => {
      authMiddleware = createAuthMiddleware(mockAuthService as AuthService);
    });

    it('should authenticate user with valid token', async () => {
      req.headers!.authorization = 'Bearer valid_token';
      
      mockAuthService.verifyJWTToken!.mockReturnValue({
        userId: 'test_user_id',
        zerodhaUserId: 'test_zerodha_id'
      });

      mockAuthService.getUserSession!.mockResolvedValue({
        user_id: 'test_zerodha_id',
        access_token: 'test_access_token',
        public_token: 'test_public_token',
        login_time: '2023-01-01 10:00:00',
        expires_at: '2023-01-01 18:00:00',
        api_key: 'test_api_key'
      });

      await authMiddleware(req as AuthRequest, res as Response, next);

      expect(req.user).toEqual({
        userId: 'test_user_id',
        zerodhaUserId: 'test_zerodha_id'
      });
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should return 401 when authorization header is missing', async () => {
      await authMiddleware(req as AuthRequest, res as Response, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: {
          code: 'MISSING_TOKEN',
          message: 'Authorization header is required',
          timestamp: expect.any(String)
        }
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 401 when authorization header format is invalid', async () => {
      req.headers!.authorization = 'InvalidFormat token';

      await authMiddleware(req as AuthRequest, res as Response, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: {
          code: 'INVALID_TOKEN_FORMAT',
          message: 'Authorization header must be in format: Bearer <token>',
          timestamp: expect.any(String)
        }
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 401 when JWT token is invalid', async () => {
      req.headers!.authorization = 'Bearer invalid_token';
      
      mockAuthService.verifyJWTToken!.mockImplementation(() => {
        throw new Error('Invalid token');
      });

      await authMiddleware(req as AuthRequest, res as Response, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: {
          code: 'INVALID_TOKEN',
          message: 'Invalid or malformed token',
          timestamp: expect.any(String)
        }
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 401 when JWT token is expired', async () => {
      req.headers!.authorization = 'Bearer expired_token';
      
      mockAuthService.verifyJWTToken!.mockImplementation(() => {
        throw new Error('Token expired');
      });

      await authMiddleware(req as AuthRequest, res as Response, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: {
          code: 'TOKEN_EXPIRED',
          message: 'Token has expired, please login again',
          timestamp: expect.any(String)
        }
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 401 when session is expired', async () => {
      req.headers!.authorization = 'Bearer valid_token';
      
      mockAuthService.verifyJWTToken!.mockReturnValue({
        userId: 'test_user_id',
        zerodhaUserId: 'test_zerodha_id'
      });

      mockAuthService.getUserSession!.mockResolvedValue(null);

      await authMiddleware(req as AuthRequest, res as Response, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: {
          code: 'SESSION_EXPIRED',
          message: 'Session expired, please login again',
          timestamp: expect.any(String)
        }
      });
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('createOptionalAuthMiddleware', () => {
    let optionalAuthMiddleware: ReturnType<typeof createOptionalAuthMiddleware>;

    beforeEach(() => {
      optionalAuthMiddleware = createOptionalAuthMiddleware(mockAuthService as AuthService);
    });

    it('should proceed without authentication when no token provided', async () => {
      await optionalAuthMiddleware(req as AuthRequest, res as Response, next);

      expect(req.user).toBeUndefined();
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should authenticate user when valid token provided', async () => {
      req.headers!.authorization = 'Bearer valid_token';
      
      mockAuthService.verifyJWTToken!.mockReturnValue({
        userId: 'test_user_id',
        zerodhaUserId: 'test_zerodha_id'
      });

      mockAuthService.getUserSession!.mockResolvedValue({
        user_id: 'test_zerodha_id',
        access_token: 'test_access_token',
        public_token: 'test_public_token',
        login_time: '2023-01-01 10:00:00',
        expires_at: '2023-01-01 18:00:00',
        api_key: 'test_api_key'
      });

      await optionalAuthMiddleware(req as AuthRequest, res as Response, next);

      expect(req.user).toEqual({
        userId: 'test_user_id',
        zerodhaUserId: 'test_zerodha_id'
      });
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should proceed without authentication when token is invalid', async () => {
      req.headers!.authorization = 'Bearer invalid_token';
      
      mockAuthService.verifyJWTToken!.mockImplementation(() => {
        throw new Error('Invalid token');
      });

      await optionalAuthMiddleware(req as AuthRequest, res as Response, next);

      expect(req.user).toBeUndefined();
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should proceed without authentication when session is expired', async () => {
      req.headers!.authorization = 'Bearer valid_token';
      
      mockAuthService.verifyJWTToken!.mockReturnValue({
        userId: 'test_user_id',
        zerodhaUserId: 'test_zerodha_id'
      });

      mockAuthService.getUserSession!.mockResolvedValue(null);

      await optionalAuthMiddleware(req as AuthRequest, res as Response, next);

      expect(req.user).toBeUndefined();
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });
  });

  describe('createRequestLoggingMiddleware', () => {
    let requestLoggingMiddleware: ReturnType<typeof createRequestLoggingMiddleware>;

    beforeEach(() => {
      requestLoggingMiddleware = createRequestLoggingMiddleware();
    });

    it('should log request completion', () => {
      req.method = 'GET';
      req.url = '/test';
      req.ip = '127.0.0.1';
      req.headers = { 'user-agent': 'test-agent' };
      req.user = { userId: 'test_user', zerodhaUserId: 'test_zerodha' };

      const mockFinish = jest.fn();
      res.on = jest.fn((event, callback) => {
        if (event === 'finish') {
          mockFinish.mockImplementation(callback);
        }
      });
      res.statusCode = 200;

      requestLoggingMiddleware(req as AuthRequest, res as Response, next);

      expect(next).toHaveBeenCalled();
      expect(res.on).toHaveBeenCalledWith('finish', expect.any(Function));

      // Simulate response finish
      mockFinish();
    });
  });

  describe('createErrorHandlingMiddleware', () => {
    let errorHandlingMiddleware: ReturnType<typeof createErrorHandlingMiddleware>;

    beforeEach(() => {
      errorHandlingMiddleware = createErrorHandlingMiddleware();
    });

    it('should handle errors and return 500 response', () => {
      const error = new Error('Test error');
      req.method = 'GET';
      req.url = '/test';

      res.headersSent = false;

      errorHandlingMiddleware(error, req as AuthRequest, res as Response, next);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'An internal error occurred',
          timestamp: expect.any(String)
        }
      });
    });

    it('should call next when headers already sent', () => {
      const error = new Error('Test error');
      res.headersSent = true;

      errorHandlingMiddleware(error, req as AuthRequest, res as Response, next);

      expect(next).toHaveBeenCalledWith(error);
      expect(res.status).not.toHaveBeenCalled();
    });
  });
});