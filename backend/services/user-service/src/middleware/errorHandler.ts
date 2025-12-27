import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

export interface AppError extends Error {
  statusCode?: number;
  code?: string;
  details?: any;
}

export const errorHandler = (error: AppError, req: Request, res: Response, _next: NextFunction) => {
  logger.error('Request error', {
    error: error.message,
    stack: error.stack,
    url: req.url,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });

  // Default error response
  let statusCode = error.statusCode || 500;
  let code = error.code || 'INTERNAL_ERROR';
  let message = error.message || 'Internal server error';

  // Handle specific error types
  if (error.message.includes('duplicate key value')) {
    statusCode = 409;
    code = 'DUPLICATE_RESOURCE';
    message = 'Resource already exists';
  } else if (error.message.includes('violates foreign key constraint')) {
    statusCode = 400;
    code = 'INVALID_REFERENCE';
    message = 'Invalid resource reference';
  } else if (error.message.includes('invalid input syntax')) {
    statusCode = 400;
    code = 'INVALID_INPUT';
    message = 'Invalid input format';
  }

  res.status(statusCode).json({
    success: false,
    error: {
      code,
      message,
      details: error.details,
      timestamp: new Date().toISOString(),
      requestId: req.headers['x-request-id']
    }
  });
};