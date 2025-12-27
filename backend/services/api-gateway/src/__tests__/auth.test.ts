import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { authMiddleware, requireRole, requirePermission, optionalAuth, AuthenticatedRequest } from '../middleware/auth';
import { AuthenticationError, AuthorizationError } from '../middleware/errorHandler';

// Mock jwt
jest.mock('jsonwebtoken');
const mockJwt = jwt as jest.Mocked<typeof jwt>;

describe('Auth Middleware', () => {
  let mockReq: Partial<AuthenticatedRequest>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    mockReq = {
      headers: {},
      user: undefined
    };
    mockRes = {};
    mockNext = jest.fn();
    jest.clearAllMocks();
  });

  describe('authMiddleware', () => {
    it('should authenticate valid token', async () => {
      mockReq.headers = {
        authorization: 'Bearer valid-token'
      };

      const mockPayload = {
        userId: 'user-123',
        email: 'test@example.com',
        role: 'trader',
        permissions: ['read', 'write']
      };

      mockJwt.verify.mockReturnValue(mockPayload);

      await authMiddleware(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      expect(mockReq.user).toEqual({
        id: 'user-123',
        email: 'test@example.com',
        role: 'trader',
        permissions: ['read', 'write']
      });
      expect(mockNext).toHaveBeenCalledWith();
    });

    it('should throw error when authorization header is missing', async () => {
      await authMiddleware(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Authorization header is required'
        })
      );
    });

    it('should throw error when authorization header does not start with Bearer', async () => {
      mockReq.headers = {
        authorization: 'Basic invalid-token'
      };

      await authMiddleware(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Authorization header must start with Bearer'
        })
      );
    });

    it('should throw error when token is empty', async () => {
      mockReq.headers = {
        authorization: 'Bearer '
      };

      await authMiddleware(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Token is required'
        })
      );
    });

    it('should throw error when token is expired', async () => {
      mockReq.headers = {
        authorization: 'Bearer expired-token'
      };

      mockJwt.verify.mockImplementation(() => {
        throw new jwt.TokenExpiredError('Token expired', new Date());
      });

      await authMiddleware(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Token has expired'
        })
      );
    });

    it('should throw error when token is invalid', async () => {
      mockReq.headers = {
        authorization: 'Bearer invalid-token'
      };

      mockJwt.verify.mockImplementation(() => {
        throw new jwt.JsonWebTokenError('Invalid token');
      });

      await authMiddleware(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Invalid token'
        })
      );
    });
  });

  describe('requireRole', () => {
    it('should allow access when user has required role', () => {
      mockReq.user = {
        id: 'user-123',
        email: 'test@example.com',
        role: 'admin'
      };

      const middleware = requireRole('admin');
      middleware(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith();
    });

    it('should deny access when user does not have required role', () => {
      mockReq.user = {
        id: 'user-123',
        email: 'test@example.com',
        role: 'trader'
      };

      const middleware = requireRole('admin');
      middleware(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({
          message: "Role 'admin' is required"
        })
      );
    });

    it('should deny access when user is not authenticated', () => {
      const middleware = requireRole('admin');
      middleware(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'User not authenticated'
        })
      );
    });
  });

  describe('requirePermission', () => {
    it('should allow access when user has required permission', () => {
      mockReq.user = {
        id: 'user-123',
        email: 'test@example.com',
        permissions: ['read', 'write', 'delete']
      };

      const middleware = requirePermission('write');
      middleware(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith();
    });

    it('should deny access when user does not have required permission', () => {
      mockReq.user = {
        id: 'user-123',
        email: 'test@example.com',
        permissions: ['read']
      };

      const middleware = requirePermission('write');
      middleware(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({
          message: "Permission 'write' is required"
        })
      );
    });

    it('should deny access when user has no permissions', () => {
      mockReq.user = {
        id: 'user-123',
        email: 'test@example.com'
      };

      const middleware = requirePermission('write');
      middleware(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({
          message: "Permission 'write' is required"
        })
      );
    });
  });

  describe('optionalAuth', () => {
    it('should authenticate valid token when provided', async () => {
      mockReq.headers = {
        authorization: 'Bearer valid-token'
      };

      const mockPayload = {
        userId: 'user-123',
        email: 'test@example.com'
      };

      mockJwt.verify.mockReturnValue(mockPayload);

      await optionalAuth(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      expect(mockReq.user).toEqual({
        id: 'user-123',
        email: 'test@example.com',
        role: undefined,
        permissions: undefined
      });
      expect(mockNext).toHaveBeenCalledWith();
    });

    it('should continue without authentication when no token provided', async () => {
      await optionalAuth(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      expect(mockReq.user).toBeUndefined();
      expect(mockNext).toHaveBeenCalledWith();
    });

    it('should continue without authentication when invalid token provided', async () => {
      mockReq.headers = {
        authorization: 'Bearer invalid-token'
      };

      mockJwt.verify.mockImplementation(() => {
        throw new jwt.JsonWebTokenError('Invalid token');
      });

      await optionalAuth(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      expect(mockReq.user).toBeUndefined();
      expect(mockNext).toHaveBeenCalledWith();
    });
  });
});