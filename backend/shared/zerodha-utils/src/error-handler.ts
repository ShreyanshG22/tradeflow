import { createLogger } from './logger';
import { Request, Response, NextFunction } from 'express';

const logger = createLogger('error-handler');

// Error categories for better classification
export enum ErrorCategory {
  AUTHENTICATION = 'AUTHENTICATION',
  AUTHORIZATION = 'AUTHORIZATION',
  VALIDATION = 'VALIDATION',
  EXTERNAL_API = 'EXTERNAL_API',
  DATABASE = 'DATABASE',
  NETWORK = 'NETWORK',
  RATE_LIMIT = 'RATE_LIMIT',
  BUSINESS_LOGIC = 'BUSINESS_LOGIC',
  SYSTEM = 'SYSTEM',
  UNKNOWN = 'UNKNOWN'
}

// Error severity levels
export enum ErrorSeverity {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL'
}

// Base error interface
export interface CategorizedError extends Error {
  category: ErrorCategory;
  severity: ErrorSeverity;
  statusCode: number;
  isOperational: boolean;
  context?: Record<string, any>;
  retryable?: boolean;
  timestamp: Date;
}

// Custom error classes
export class ZerodhaError extends Error implements CategorizedError {
  category: ErrorCategory;
  severity: ErrorSeverity;
  statusCode: number;
  isOperational: boolean;
  context?: Record<string, any>;
  retryable?: boolean;
  timestamp: Date;

  constructor(
    message: string,
    category: ErrorCategory = ErrorCategory.UNKNOWN,
    severity: ErrorSeverity = ErrorSeverity.MEDIUM,
    statusCode: number = 500,
    context?: Record<string, any>,
    retryable: boolean = false
  ) {
    super(message);
    this.name = 'ZerodhaError';
    this.category = category;
    this.severity = severity;
    this.statusCode = statusCode;
    this.isOperational = true;
    this.context = context;
    this.retryable = retryable;
    this.timestamp = new Date();
  }
}

// Specific error types
export class AuthenticationError extends ZerodhaError {
  constructor(message: string = 'Authentication failed', context?: Record<string, any>) {
    super(message, ErrorCategory.AUTHENTICATION, ErrorSeverity.HIGH, 401, context, false);
    this.name = 'AuthenticationError';
  }
}

export class AuthorizationError extends ZerodhaError {
  constructor(message: string = 'Access denied', context?: Record<string, any>) {
    super(message, ErrorCategory.AUTHORIZATION, ErrorSeverity.HIGH, 403, context, false);
    this.name = 'AuthorizationError';
  }
}

export class ValidationError extends ZerodhaError {
  constructor(message: string = 'Validation failed', context?: Record<string, any>) {
    super(message, ErrorCategory.VALIDATION, ErrorSeverity.LOW, 400, context, false);
    this.name = 'ValidationError';
  }
}

export class ExternalAPIError extends ZerodhaError {
  constructor(message: string = 'External API error', context?: Record<string, any>, retryable: boolean = true) {
    super(message, ErrorCategory.EXTERNAL_API, ErrorSeverity.MEDIUM, 502, context, retryable);
    this.name = 'ExternalAPIError';
  }
}

export class DatabaseError extends ZerodhaError {
  constructor(message: string = 'Database error', context?: Record<string, any>, retryable: boolean = true) {
    super(message, ErrorCategory.DATABASE, ErrorSeverity.HIGH, 503, context, retryable);
    this.name = 'DatabaseError';
  }
}

export class NetworkError extends ZerodhaError {
  constructor(message: string = 'Network error', context?: Record<string, any>) {
    super(message, ErrorCategory.NETWORK, ErrorSeverity.MEDIUM, 503, context, true);
    this.name = 'NetworkError';
  }
}

export class RateLimitError extends ZerodhaError {
  constructor(message: string = 'Rate limit exceeded', context?: Record<string, any>) {
    super(message, ErrorCategory.RATE_LIMIT, ErrorSeverity.MEDIUM, 429, context, true);
    this.name = 'RateLimitError';
  }
}

export class BusinessLogicError extends ZerodhaError {
  constructor(message: string = 'Business logic error', context?: Record<string, any>) {
    super(message, ErrorCategory.BUSINESS_LOGIC, ErrorSeverity.LOW, 400, context, false);
    this.name = 'BusinessLogicError';
  }
}

export class SystemError extends ZerodhaError {
  constructor(message: string = 'System error', context?: Record<string, any>) {
    super(message, ErrorCategory.SYSTEM, ErrorSeverity.CRITICAL, 500, context, false);
    this.name = 'SystemError';
  }
}

// Error categorization function
export const categorizeError = (error: any): CategorizedError => {
  if (error instanceof ZerodhaError) {
    return error;
  }

  let category = ErrorCategory.UNKNOWN;
  let severity = ErrorSeverity.MEDIUM;
  let statusCode = 500;
  let retryable = false;

  const message = error.message || 'Unknown error';
  const lowerMessage = message.toLowerCase();

  // Categorize based on error message and type
  if (lowerMessage.includes('auth') || lowerMessage.includes('token') || lowerMessage.includes('login')) {
    category = ErrorCategory.AUTHENTICATION;
    severity = ErrorSeverity.HIGH;
    statusCode = 401;
  } else if (lowerMessage.includes('permission') || lowerMessage.includes('forbidden') || lowerMessage.includes('access')) {
    category = ErrorCategory.AUTHORIZATION;
    severity = ErrorSeverity.HIGH;
    statusCode = 403;
  } else if (lowerMessage.includes('validation') || lowerMessage.includes('invalid') || lowerMessage.includes('required')) {
    category = ErrorCategory.VALIDATION;
    severity = ErrorSeverity.LOW;
    statusCode = 400;
  } else if (lowerMessage.includes('zerodha') || lowerMessage.includes('kite') || lowerMessage.includes('api')) {
    category = ErrorCategory.EXTERNAL_API;
    severity = ErrorSeverity.MEDIUM;
    statusCode = 502;
    retryable = true;
  } else if (lowerMessage.includes('database') || lowerMessage.includes('connection') || lowerMessage.includes('query')) {
    category = ErrorCategory.DATABASE;
    severity = ErrorSeverity.HIGH;
    statusCode = 503;
    retryable = true;
  } else if (lowerMessage.includes('network') || lowerMessage.includes('timeout') || lowerMessage.includes('econnrefused')) {
    category = ErrorCategory.NETWORK;
    severity = ErrorSeverity.MEDIUM;
    statusCode = 503;
    retryable = true;
  } else if (lowerMessage.includes('rate limit') || lowerMessage.includes('too many requests')) {
    category = ErrorCategory.RATE_LIMIT;
    severity = ErrorSeverity.MEDIUM;
    statusCode = 429;
    retryable = true;
  }

  return new ZerodhaError(message, category, severity, statusCode, { originalError: error }, retryable);
};

// Express error handler middleware
export const errorHandlerMiddleware = (
  error: any,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const categorizedError = categorizeError(error);

  // Log the error with context
  const logContext = {
    errorId: generateErrorId(),
    category: categorizedError.category,
    severity: categorizedError.severity,
    message: categorizedError.message,
    stack: categorizedError.stack,
    url: req.url,
    method: req.method,
    userId: (req as any).user?.id,
    userAgent: req.get('User-Agent'),
    ip: req.ip,
    body: req.body,
    query: req.query,
    params: req.params,
    context: categorizedError.context,
    timestamp: categorizedError.timestamp
  };

  // Log based on severity
  switch (categorizedError.severity) {
    case ErrorSeverity.CRITICAL:
      logger.error('CRITICAL ERROR', logContext);
      break;
    case ErrorSeverity.HIGH:
      logger.error('HIGH SEVERITY ERROR', logContext);
      break;
    case ErrorSeverity.MEDIUM:
      logger.warn('MEDIUM SEVERITY ERROR', logContext);
      break;
    case ErrorSeverity.LOW:
      logger.info('LOW SEVERITY ERROR', logContext);
      break;
  }

  // Prepare response
  const errorResponse = {
    success: false,
    error: {
      id: logContext.errorId,
      message: categorizedError.message,
      category: categorizedError.category,
      severity: categorizedError.severity,
      timestamp: categorizedError.timestamp.toISOString(),
      retryable: categorizedError.retryable,
      ...(process.env.NODE_ENV === 'development' && {
        stack: categorizedError.stack,
        context: categorizedError.context
      })
    }
  };

  res.status(categorizedError.statusCode).json(errorResponse);
};

// Async handler wrapper
export const asyncHandler = (fn: Function) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

// Generate unique error ID for tracking
const generateErrorId = (): string => {
  return `ERR_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

// Global error handlers
export const setupGlobalErrorHandlers = (serviceName: string): void => {
  // Handle unhandled promise rejections
  process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
    const error = categorizeError(reason);
    logger.error('Unhandled Promise Rejection', {
      service: serviceName,
      errorId: generateErrorId(),
      category: error.category,
      severity: ErrorSeverity.CRITICAL,
      reason: reason,
      promise: promise.toString(),
      timestamp: new Date().toISOString()
    });
    
    // Graceful shutdown
    process.exit(1);
  });

  // Handle uncaught exceptions
  process.on('uncaughtException', (error: Error) => {
    const categorizedError = categorizeError(error);
    logger.error('Uncaught Exception', {
      service: serviceName,
      errorId: generateErrorId(),
      category: categorizedError.category,
      severity: ErrorSeverity.CRITICAL,
      message: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });
    
    // Graceful shutdown
    process.exit(1);
  });

  // Handle SIGTERM
  process.on('SIGTERM', () => {
    logger.info('SIGTERM received, shutting down gracefully', {
      service: serviceName,
      timestamp: new Date().toISOString()
    });
    process.exit(0);
  });

  // Handle SIGINT
  process.on('SIGINT', () => {
    logger.info('SIGINT received, shutting down gracefully', {
      service: serviceName,
      timestamp: new Date().toISOString()
    });
    process.exit(0);
  });
};