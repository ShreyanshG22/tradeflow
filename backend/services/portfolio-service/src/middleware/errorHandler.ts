import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

export interface ApiError extends Error {
  statusCode?: number;
  code?: string;
  details?: any;
}

export const errorHandler = (
  error: ApiError,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  logger.error('API Error', {
    error: error.message,
    stack: error.stack,
    path: req.path,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });

  // Default error response
  let statusCode = error.statusCode || 500;
  let code = error.code || 'INTERNAL_ERROR';
  let message = error.message || 'An unexpected error occurred';

  // Handle specific error types
  if (error.message.includes('not found')) {
    statusCode = 404;
    code = 'NOT_FOUND';
  } else if (error.message.includes('already exists')) {
    statusCode = 409;
    code = 'CONFLICT';
  } else if (error.message.includes('validation')) {
    statusCode = 400;
    code = 'VALIDATION_ERROR';
  } else if (error.message.includes('unauthorized')) {
    statusCode = 401;
    code = 'UNAUTHORIZED';
  } else if (error.message.includes('forbidden')) {
    statusCode = 403;
    code = 'FORBIDDEN';
  }

  res.status(statusCode).json({
    success: false,
    error: {
      code,
      message,
      details: error.details,
      timestamp: new Date().toISOString(),
      requestId: req.headers['x-request-id'] || 'unknown'
    }
  });
};

export const asyncHandler = (fn: Function) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};