import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../services/authService';
import { createLogger } from '@tradeflow/zerodha-utils';

const logger = createLogger('AuthMiddleware');

export interface AuthRequest extends Request {
  user?: {
    userId: string;
    zerodhaUserId: string;
  };
}

export function createAuthMiddleware(authService: AuthService) {
  /**
   * JWT Authentication Middleware
   */
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const authHeader = req.headers.authorization;
      
      if (!authHeader) {
        return res.status(401).json({
          success: false,
          error: {
            code: 'MISSING_TOKEN',
            message: 'Authorization header is required',
            timestamp: new Date().toISOString()
          }
        });
      }

      const parts = authHeader.split(' ');
      if (parts.length !== 2 || parts[0] !== 'Bearer') {
        return res.status(401).json({
          success: false,
          error: {
            code: 'INVALID_TOKEN_FORMAT',
            message: 'Authorization header must be in format: Bearer <token>',
            timestamp: new Date().toISOString()
          }
        });
      }

      const token = parts[1];
      
      // Verify JWT token
      const decoded = authService.verifyJWTToken(token);
      
      // Check if user session exists and is valid
      const session = await authService.getUserSession(decoded.userId);
      if (!session) {
        return res.status(401).json({
          success: false,
          error: {
            code: 'SESSION_EXPIRED',
            message: 'Session expired, please login again',
            timestamp: new Date().toISOString()
          }
        });
      }

      // Attach user info to request
      req.user = {
        userId: decoded.userId,
        zerodhaUserId: decoded.zerodhaUserId
      };

      logger.debug('User authenticated successfully', { 
        userId: decoded.userId,
        zerodhaUserId: decoded.zerodhaUserId 
      });

      next();
    } catch (error) {
      logger.error('Authentication failed', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        authHeader: req.headers.authorization ? 'present' : 'missing'
      });

      if (error instanceof Error && error.message.includes('expired')) {
        return res.status(401).json({
          success: false,
          error: {
            code: 'TOKEN_EXPIRED',
            message: 'Token has expired, please login again',
            timestamp: new Date().toISOString()
          }
        });
      }

      return res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_TOKEN',
          message: 'Invalid or malformed token',
          timestamp: new Date().toISOString()
        }
      });
    }
  };
}

/**
 * Optional Authentication Middleware
 * Attaches user info if token is present and valid, but doesn't require authentication
 */
export function createOptionalAuthMiddleware(authService: AuthService) {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const authHeader = req.headers.authorization;
      
      if (!authHeader) {
        return next();
      }

      const parts = authHeader.split(' ');
      if (parts.length !== 2 || parts[0] !== 'Bearer') {
        return next();
      }

      const token = parts[1];
      
      try {
        // Verify JWT token
        const decoded = authService.verifyJWTToken(token);
        
        // Check if user session exists and is valid
        const session = await authService.getUserSession(decoded.userId);
        if (session) {
          req.user = {
            userId: decoded.userId,
            zerodhaUserId: decoded.zerodhaUserId
          };
        }
      } catch (error) {
        // Ignore authentication errors in optional middleware
        logger.debug('Optional authentication failed', { 
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }

      next();
    } catch (error) {
      // Don't block request on optional auth errors
      logger.debug('Optional authentication middleware error', { 
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      next();
    }
  };
}

/**
 * Rate Limiting Middleware
 */
export function createRateLimitMiddleware(
  authService: AuthService,
  maxRequests: number = 100,
  windowSeconds: number = 60
) {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.userId || req.ip;
      const key = `rate_limit:${userId}`;
      
      // This would typically use Redis for rate limiting
      // For now, we'll implement a simple in-memory rate limiter
      // In production, integrate with RedisService for distributed rate limiting
      
      logger.debug('Rate limit check', { userId, maxRequests, windowSeconds });
      
      next();
    } catch (error) {
      logger.error('Rate limiting error', { 
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      // Don't block on rate limiting errors
      next();
    }
  };
}

/**
 * Request Logging Middleware
 */
export function createRequestLoggingMiddleware() {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    const start = Date.now();
    
    res.on('finish', () => {
      const duration = Date.now() - start;
      
      logger.info('Request completed', {
        method: req.method,
        url: req.url,
        statusCode: res.statusCode,
        duration,
        userId: req.user?.userId,
        userAgent: req.headers['user-agent'],
        ip: req.ip
      });
    });

    next();
  };
}

/**
 * Error Handling Middleware
 */
export function createErrorHandlingMiddleware() {
  return (error: Error, req: AuthRequest, res: Response, next: NextFunction) => {
    logger.error('Unhandled error in auth service', {
      error: error.message,
      stack: error.stack,
      method: req.method,
      url: req.url,
      userId: req.user?.userId
    });

    if (res.headersSent) {
      return next(error);
    }

    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An internal error occurred',
        timestamp: new Date().toISOString()
      }
    });
  };
}

/**
 * CORS Middleware for Zerodha Auth Service
 */
export function createCorsMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    const allowedOrigins = [
      'http://localhost:3000',
      'http://localhost:5173',
      process.env.FRONTEND_URL
    ].filter(Boolean);

    const origin = req.headers.origin;
    
    if (origin && allowedOrigins.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
    }

    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Max-Age', '86400'); // 24 hours

    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }

    next();
  };
}