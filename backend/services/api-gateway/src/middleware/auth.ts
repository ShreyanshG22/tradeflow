import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/config';
import { AuthenticationError, AuthorizationError } from './errorHandler';
import { logger } from '../utils/logger';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    role?: string;
    permissions?: string[];
  };
}

export interface JwtPayload {
  userId: string;
  email: string;
  role?: string;
  permissions?: string[];
  iat?: number;
  exp?: number;
}

export const authMiddleware = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      throw new AuthenticationError('Authorization header is required');
    }

    if (!authHeader.startsWith('Bearer ')) {
      throw new AuthenticationError('Authorization header must start with Bearer');
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix
    
    if (!token) {
      throw new AuthenticationError('Token is required');
    }

    try {
      const decoded = jwt.verify(token, config.jwt.secret) as JwtPayload;
      
      // Add user information to request
      req.user = {
        id: decoded.userId,
        email: decoded.email,
        role: decoded.role,
        permissions: decoded.permissions
      };

      logger.debug('User authenticated', {
        userId: decoded.userId,
        email: decoded.email,
        requestId: req.headers['x-request-id']
      });

      next();
    } catch (jwtError) {
      if (jwtError instanceof jwt.TokenExpiredError) {
        throw new AuthenticationError('Token has expired');
      } else if (jwtError instanceof jwt.JsonWebTokenError) {
        throw new AuthenticationError('Invalid token');
      } else {
        throw new AuthenticationError('Token verification failed');
      }
    }
  } catch (error) {
    next(error);
  }
};

export const requireRole = (requiredRole: string) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(new AuthenticationError('User not authenticated'));
    }

    if (req.user.role !== requiredRole) {
      return next(new AuthorizationError(`Role '${requiredRole}' is required`));
    }

    next();
  };
};

export const requirePermission = (requiredPermission: string) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(new AuthenticationError('User not authenticated'));
    }

    if (!req.user.permissions || !req.user.permissions.includes(requiredPermission)) {
      return next(new AuthorizationError(`Permission '${requiredPermission}' is required`));
    }

    next();
  };
};

// Optional auth middleware - doesn't throw error if no token provided
export const optionalAuth = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      
      if (token) {
        try {
          const decoded = jwt.verify(token, config.jwt.secret) as JwtPayload;
          req.user = {
            id: decoded.userId,
            email: decoded.email,
            role: decoded.role,
            permissions: decoded.permissions
          };
        } catch (jwtError) {
          // Silently ignore invalid tokens for optional auth
          logger.debug('Optional auth failed', {
            error: jwtError instanceof Error ? jwtError.message : 'Unknown error',
            requestId: req.headers['x-request-id']
          });
        }
      }
    }
    
    next();
  } catch (error) {
    // For optional auth, we don't want to block the request
    next();
  }
};