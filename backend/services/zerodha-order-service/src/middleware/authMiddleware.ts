import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

// Extend Request interface to include user
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        accessToken: string;
        email?: string;
      };
    }
  }
}

export const authMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        success: false,
        error: 'Authorization header required'
      });
      return;
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // In a real implementation, this would:
    // 1. Verify JWT token
    // 2. Extract user information
    // 3. Validate token expiry
    // 4. Check user permissions

    // For now, we'll do a basic validation
    if (!token || token.length < 10) {
      res.status(401).json({
        success: false,
        error: 'Invalid token'
      });
      return;
    }

    // Mock user extraction (in real implementation, decode JWT)
    // This would typically involve:
    // - JWT verification
    // - Database lookup for user details
    // - Zerodha access token validation
    
    const mockUser = {
      id: 'user_123', // Would be extracted from JWT
      accessToken: token, // Would be fetched from database/cache
      email: 'user@example.com'
    };

    req.user = mockUser;
    next();

  } catch (error) {
    logger.error('Authentication middleware error:', error);
    res.status(401).json({
      success: false,
      error: 'Authentication failed'
    });
  }
};