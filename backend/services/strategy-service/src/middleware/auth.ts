import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/config';
import { createError } from './errorHandler';
import { logger } from '../utils/logger';

export interface AuthenticatedUser {
  id: string;
  email: string;
  iat?: number;
  exp?: number;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

export const authMiddleware = (req: Request, _res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      throw createError('Authorization header missing', 401, 'MISSING_AUTH_HEADER');
    }

    const token = authHeader.startsWith('Bearer ') 
      ? authHeader.slice(7) 
      : authHeader;

    if (!token) {
      throw createError('Token missing', 401, 'MISSING_TOKEN');
    }

    try {
      const decoded = jwt.verify(token, config.jwt.secret) as AuthenticatedUser;
      req.user = decoded;
      
      logger.debug('User authenticated', {
        userId: decoded.id,
        email: decoded.email,
        requestId: req.headers['x-request-id']
      });
      
      next();
    } catch (jwtError: any) {
      if (jwtError.name === 'TokenExpiredError') {
        throw createError('Token expired', 401, 'TOKEN_EXPIRED');
      } else if (jwtError.name === 'JsonWebTokenError') {
        throw createError('Invalid token', 401, 'INVALID_TOKEN');
      } else {
        throw createError('Token verification failed', 401, 'TOKEN_VERIFICATION_FAILED');
      }
    }
  } catch (error) {
    next(error);
  }
};

export const optionalAuthMiddleware = (req: Request, _res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      return next();
    }

    const token = authHeader.startsWith('Bearer ') 
      ? authHeader.slice(7) 
      : authHeader;

    if (!token) {
      return next();
    }

    try {
      const decoded = jwt.verify(token, config.jwt.secret) as AuthenticatedUser;
      req.user = decoded;
    } catch (jwtError: any) {
      // For optional auth, we don't throw errors, just continue without user
      logger.debug('Optional auth failed:', jwtError.message);
    }
    
    next();
  } catch (error) {
    next(error);
  }
};