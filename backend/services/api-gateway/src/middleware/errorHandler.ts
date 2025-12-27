import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

export interface ApiError extends Error {
  statusCode?: number;
  code?: string;
  details?: any;
}

export class ValidationError extends Error {
  statusCode = 400;
  code = 'VALIDATION_ERROR';
  
  constructor(message: string, public details?: any) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class AuthenticationError extends Error {
  statusCode = 401;
  code = 'AUTHENTICATION_ERROR';
  
  constructor(message: string = 'Authentication required') {
    super(message);
    this.name = 'AuthenticationError';
  }
}

export class AuthorizationError extends Error {
  statusCode = 403;
  code = 'AUTHORIZATION_ERROR';
  
  constructor(message: string = 'Insufficient permissions') {
    super(message);
    this.name = 'AuthorizationError';
  }
}

export class NotFoundError extends Error {
  statusCode = 404;
  code = 'NOT_FOUND';
  
  constructor(message: string = 'Resource not found') {
    super(message);
    this.name = 'NotFoundError';
  }
}

export class ServiceError extends Error {
  statusCode = 503;
  code = 'SERVICE_ERROR';
  
  constructor(message: string = 'Service temporarily unavailable') {
    super(message);
    this.name = 'ServiceError';
  }
}

export const errorHandler = (
  err: ApiError,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // Generate unique request ID for tracking
  const requestId = req.headers['x-request-id'] || 
                   `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  // Log error with context
  logger.error('API Error', {
    requestId,
    error: {
      name: err.name,
      message: err.message,
      stack: err.stack,
      code: err.code,
      statusCode: err.statusCode
    },
    request: {
      method: req.method,
      url: req.url,
      headers: {
        'user-agent': req.headers['user-agent'],
        'x-forwarded-for': req.headers['x-forwarded-for'],
        'authorization': req.headers.authorization ? '[REDACTED]' : undefined
      },
      body: req.method !== 'GET' ? req.body : undefined,
      params: req.params,
      query: req.query
    }
  });

  // Determine status code
  const statusCode = err.statusCode || 500;
  
  // Prepare error response
  const errorResponse = {
    error: {
      code: err.code || 'INTERNAL_SERVER_ERROR',
      message: statusCode === 500 ? 'Internal server error' : err.message,
      requestId,
      timestamp: new Date().toISOString()
    }
  };

  // Add details for non-production environments or client errors (4xx)
  if (process.env.NODE_ENV !== 'production' || (statusCode >= 400 && statusCode < 500)) {
    if (err.details) {
      (errorResponse.error as any).details = err.details;
    }
    
    // Include stack trace in development
    if (process.env.NODE_ENV === 'development') {
      (errorResponse.error as any).stack = err.stack;
    }
  }

  res.status(statusCode).json(errorResponse);
};