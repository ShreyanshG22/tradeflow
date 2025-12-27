import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import {
  ErrorCategory,
  ErrorSeverity,
  ZerodhaError,
  AuthenticationError,
  ValidationError,
  ExternalAPIError,
  categorizeError,
  errorHandlerMiddleware,
  setupGlobalErrorHandlers
} from '../error-handler';

describe('Error Handler', () => {
  describe('ZerodhaError', () => {
    it('should create error with correct properties', () => {
      const error = new ZerodhaError(
        'Test error',
        ErrorCategory.VALIDATION,
        ErrorSeverity.HIGH,
        400,
        { field: 'test' },
        true
      );

      expect(error.message).toBe('Test error');
      expect(error.category).toBe(ErrorCategory.VALIDATION);
      expect(error.severity).toBe(ErrorSeverity.HIGH);
      expect(error.statusCode).toBe(400);
      expect(error.context).toEqual({ field: 'test' });
      expect(error.retryable).toBe(true);
      expect(error.isOperational).toBe(true);
      expect(error.timestamp).toBeInstanceOf(Date);
    });

    it('should use default values when not provided', () => {
      const error = new ZerodhaError('Test error');

      expect(error.category).toBe(ErrorCategory.UNKNOWN);
      expect(error.severity).toBe(ErrorSeverity.MEDIUM);
      expect(error.statusCode).toBe(500);
      expect(error.retryable).toBe(false);
    });
  });

  describe('Specific Error Types', () => {
    it('should create AuthenticationError with correct properties', () => {
      const error = new AuthenticationError('Invalid token');

      expect(error.message).toBe('Invalid token');
      expect(error.category).toBe(ErrorCategory.AUTHENTICATION);
      expect(error.severity).toBe(ErrorSeverity.HIGH);
      expect(error.statusCode).toBe(401);
      expect(error.retryable).toBe(false);
    });

    it('should create ValidationError with correct properties', () => {
      const error = new ValidationError('Invalid input');

      expect(error.message).toBe('Invalid input');
      expect(error.category).toBe(ErrorCategory.VALIDATION);
      expect(error.severity).toBe(ErrorSeverity.LOW);
      expect(error.statusCode).toBe(400);
      expect(error.retryable).toBe(false);
    });

    it('should create ExternalAPIError with correct properties', () => {
      const error = new ExternalAPIError('API timeout');

      expect(error.message).toBe('API timeout');
      expect(error.category).toBe(ErrorCategory.EXTERNAL_API);
      expect(error.severity).toBe(ErrorSeverity.MEDIUM);
      expect(error.statusCode).toBe(502);
      expect(error.retryable).toBe(true);
    });
  });

  describe('categorizeError', () => {
    it('should return ZerodhaError as-is', () => {
      const originalError = new ValidationError('Test error');
      const categorized = categorizeError(originalError);

      expect(categorized).toBe(originalError);
    });

    it('should categorize authentication errors', () => {
      const error = new Error('Authentication failed');
      const categorized = categorizeError(error);

      expect(categorized.category).toBe(ErrorCategory.AUTHENTICATION);
      expect(categorized.severity).toBe(ErrorSeverity.HIGH);
      expect(categorized.statusCode).toBe(401);
    });

    it('should categorize validation errors', () => {
      const error = new Error('Validation failed: required field missing');
      const categorized = categorizeError(error);

      expect(categorized.category).toBe(ErrorCategory.VALIDATION);
      expect(categorized.severity).toBe(ErrorSeverity.LOW);
      expect(categorized.statusCode).toBe(400);
    });

    it('should categorize external API errors', () => {
      const error = new Error('Zerodha API error');
      const categorized = categorizeError(error);

      expect(categorized.category).toBe(ErrorCategory.EXTERNAL_API);
      expect(categorized.severity).toBe(ErrorSeverity.MEDIUM);
      expect(categorized.statusCode).toBe(502);
      expect(categorized.retryable).toBe(true);
    });

    it('should categorize database errors', () => {
      const error = new Error('Database connection failed');
      const categorized = categorizeError(error);

      expect(categorized.category).toBe(ErrorCategory.DATABASE);
      expect(categorized.severity).toBe(ErrorSeverity.HIGH);
      expect(categorized.statusCode).toBe(503);
      expect(categorized.retryable).toBe(true);
    });

    it('should categorize network errors', () => {
      const error = new Error('Network timeout occurred');
      const categorized = categorizeError(error);

      expect(categorized.category).toBe(ErrorCategory.NETWORK);
      expect(categorized.severity).toBe(ErrorSeverity.MEDIUM);
      expect(categorized.statusCode).toBe(503);
      expect(categorized.retryable).toBe(true);
    });

    it('should categorize rate limit errors', () => {
      const error = new Error('Rate limit exceeded');
      const categorized = categorizeError(error);

      expect(categorized.category).toBe(ErrorCategory.RATE_LIMIT);
      expect(categorized.severity).toBe(ErrorSeverity.MEDIUM);
      expect(categorized.statusCode).toBe(429);
      expect(categorized.retryable).toBe(true);
    });

    it('should handle unknown errors', () => {
      const error = new Error('Unknown error');
      const categorized = categorizeError(error);

      expect(categorized.category).toBe(ErrorCategory.UNKNOWN);
      expect(categorized.severity).toBe(ErrorSeverity.MEDIUM);
      expect(categorized.statusCode).toBe(500);
      expect(categorized.retryable).toBe(false);
    });
  });

  describe('errorHandlerMiddleware', () => {
    let mockReq: any;
    let mockRes: any;
    let mockNext: any;

    beforeEach(() => {
      mockReq = {
        url: '/test',
        method: 'GET',
        user: { id: 'user123' },
        body: { test: 'data' },
        query: { param: 'value' },
        params: { id: '123' },
        get: jest.fn().mockReturnValue('test-agent'),
        ip: '127.0.0.1'
      };

      mockRes = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis()
      };

      mockNext = jest.fn();
    });

    it('should handle ZerodhaError correctly', () => {
      const error = new ValidationError('Invalid input', { field: 'email' });
      
      errorHandlerMiddleware(error, mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: expect.objectContaining({
          message: 'Invalid input',
          category: ErrorCategory.VALIDATION,
          severity: ErrorSeverity.LOW,
          retryable: false
        })
      });
    });

    it('should handle generic errors', () => {
      const error = new Error('Generic error');
      
      errorHandlerMiddleware(error, mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: expect.objectContaining({
          message: 'Generic error',
          category: ErrorCategory.UNKNOWN
        })
      });
    });

    it('should include stack trace in development', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      const error = new Error('Test error');
      errorHandlerMiddleware(error, mockReq, mockRes, mockNext);

      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: expect.objectContaining({
          stack: expect.any(String),
          context: expect.any(Object)
        })
      });

      process.env.NODE_ENV = originalEnv;
    });

    it('should not include stack trace in production', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      const error = new Error('Test error');
      errorHandlerMiddleware(error, mockReq, mockRes, mockNext);

      const callArgs = (mockRes.json as jest.Mock).mock.calls[0][0];
      expect(callArgs.error.stack).toBeUndefined();

      process.env.NODE_ENV = originalEnv;
    });
  });

  describe('setupGlobalErrorHandlers', () => {
    let originalListeners: any;

    beforeEach(() => {
      // Store original listeners
      originalListeners = {
        unhandledRejection: process.listeners('unhandledRejection'),
        uncaughtException: process.listeners('uncaughtException'),
        SIGTERM: process.listeners('SIGTERM'),
        SIGINT: process.listeners('SIGINT')
      };

      // Remove existing listeners
      process.removeAllListeners('unhandledRejection');
      process.removeAllListeners('uncaughtException');
      process.removeAllListeners('SIGTERM');
      process.removeAllListeners('SIGINT');

      // Mock process.exit
      jest.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit called');
      });
    });

    afterEach(() => {
      // Restore original listeners
      process.removeAllListeners('unhandledRejection');
      process.removeAllListeners('uncaughtException');
      process.removeAllListeners('SIGTERM');
      process.removeAllListeners('SIGINT');

      Object.entries(originalListeners).forEach(([event, listeners]) => {
        (listeners as any[]).forEach(listener => {
          process.on(event as any, listener);
        });
      });

      jest.restoreAllMocks();
    });

    it('should setup global error handlers', () => {
      setupGlobalErrorHandlers('test-service');

      expect(process.listenerCount('unhandledRejection')).toBe(1);
      expect(process.listenerCount('uncaughtException')).toBe(1);
      expect(process.listenerCount('SIGTERM')).toBe(1);
      expect(process.listenerCount('SIGINT')).toBe(1);
    });

    it('should handle unhandled promise rejection', () => {
      setupGlobalErrorHandlers('test-service');

      expect(() => {
        process.emit('unhandledRejection', new Error('Test rejection'), Promise.resolve());
      }).toThrow('process.exit called');

      expect(process.exit).toHaveBeenCalledWith(1);
    });

    it('should handle uncaught exception', () => {
      setupGlobalErrorHandlers('test-service');

      expect(() => {
        process.emit('uncaughtException', new Error('Test exception'));
      }).toThrow('process.exit called');

      expect(process.exit).toHaveBeenCalledWith(1);
    });

    it('should handle SIGTERM gracefully', () => {
      setupGlobalErrorHandlers('test-service');

      expect(() => {
        process.emit('SIGTERM');
      }).toThrow('process.exit called');

      expect(process.exit).toHaveBeenCalledWith(0);
    });

    it('should handle SIGINT gracefully', () => {
      setupGlobalErrorHandlers('test-service');

      expect(() => {
        process.emit('SIGINT');
      }).toThrow('process.exit called');

      expect(process.exit).toHaveBeenCalledWith(0);
    });
  });
});