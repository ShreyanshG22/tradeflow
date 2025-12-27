import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../services/auth';
import { logger } from '../utils/logger';

export interface AuthenticatedRequest extends Request {
  user?: {
    userId: string;
    sessionId?: string;
  };
}

/**
 * Authentication middleware
 * Requirements: 1.3 - API Gateway validates JWT token and authorizes access
 */
export const authenticateToken = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      res.status(401).json({
        success: false,
        error: {
          code: 'MISSING_TOKEN',
          message: 'Access token is required',
          timestamp: new Date().toISOString()
        }
      });
      return;
    }

    const decoded = await AuthService.validateToken(token);
    req.user = decoded;
    
    next();
  } catch (error) {
    logger.warn('Authentication failed', {
      error: (error as Error).message,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });

    res.status(401).json({
      success: false,
      error: {
        code: 'INVALID_TOKEN',
        message: 'Invalid or expired access token',
        timestamp: new Date().toISOString()
      }
    });
  }
};

/**
 * Optional authentication middleware - doesn't fail if no token provided
 */
export const optionalAuth = async (req: AuthenticatedRequest, _res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];

    if (token) {
      const decoded = await AuthService.validateToken(token);
      req.user = decoded;
    }
    
    next();
  } catch (error) {
    // Continue without authentication
    next();
  }
};