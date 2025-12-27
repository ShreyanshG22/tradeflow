import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';
import { ApiResponse } from '../types';

export interface AppError extends Error {
  statusCode?: number;
  code?: string;
  details?: Record<string, any>;
}

export const errorHandler = (
  error: AppError,
  req: Request,
  res: Response,
  _next: NextFunction
) => {
  logger.error('Error occurred:', {
    error: error.message,
    stack: error.stack,
    url: req.url,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
  });

  const statusCode = error.statusCode || 500;
  const errorCode = error.code || 'INTERNAL_SERVER_ERROR';
  const message = error.message || 'An unexpected error occurred';

  const response: ApiResponse = {
    success: false,
    error: {
      code: errorCode,
      message,
      details: error.details,
    },
    timestamp: new Date(),
    requestId: req.headers['x-request-id'] as string || 'unknown',
  };

  res.status(statusCode).json(response);
};

export const createError = (
  message: string,
  statusCode: number = 500,
  code?: string,
  details?: Record<string, any>
): AppError => {
  const error = new Error(message) as AppError;
  error.statusCode = statusCode;
  if (code) error.code = code;
  if (details) error.details = details;
  return error;
};