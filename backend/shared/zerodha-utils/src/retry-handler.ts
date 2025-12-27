import { createLogger } from './logger';
import { ErrorCategory, ErrorSeverity, ZerodhaError, categorizeError } from './error-handler';

const logger = createLogger('retry-handler');

// Retry configuration
export interface RetryConfig {
  maxAttempts: number;           // Maximum number of retry attempts
  baseDelay: number;             // Base delay in milliseconds
  maxDelay: number;              // Maximum delay in milliseconds
  backoffMultiplier: number;     // Multiplier for exponential backoff
  jitter: boolean;               // Add random jitter to prevent thundering herd
  retryableErrors: ErrorCategory[]; // Which error categories should be retried
}

// Default retry configuration
const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  baseDelay: 1000,              // 1 second
  maxDelay: 30000,              // 30 seconds
  backoffMultiplier: 2,
  jitter: true,
  retryableErrors: [
    ErrorCategory.NETWORK,
    ErrorCategory.EXTERNAL_API,
    ErrorCategory.DATABASE,
    ErrorCategory.RATE_LIMIT
  ]
};

// Retry attempt information
export interface RetryAttempt {
  attemptNumber: number;
  delay: number;
  error: any;
  timestamp: Date;
}

// Retry result
export interface RetryResult<T> {
  success: boolean;
  result?: T;
  error?: any;
  attempts: RetryAttempt[];
  totalDuration: number;
}

// Retry handler class
export class RetryHandler {
  private config: RetryConfig;
  private name: string;

  constructor(name: string, config?: Partial<RetryConfig>) {
    this.name = name;
    this.config = { ...DEFAULT_RETRY_CONFIG, ...config };
  }

  // Execute function with retry logic
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    const startTime = Date.now();
    const attempts: RetryAttempt[] = [];
    let lastError: any;

    for (let attempt = 1; attempt <= this.config.maxAttempts; attempt++) {
      try {
        logger.debug('Executing function with retry', {
          name: this.name,
          attempt,
          maxAttempts: this.config.maxAttempts
        });

        const result = await fn();
        
        // Success - log if there were previous attempts
        if (attempt > 1) {
          logger.info('Function succeeded after retries', {
            name: this.name,
            attempt,
            totalDuration: Date.now() - startTime,
            attempts: attempts.length
          });
        }

        return result;
      } catch (error) {
        lastError = error;
        const categorizedError = categorizeError(error);
        
        const attemptInfo: RetryAttempt = {
          attemptNumber: attempt,
          delay: 0,
          error: error,
          timestamp: new Date()
        };

        attempts.push(attemptInfo);

        // Check if error is retryable
        if (!this.isRetryableError(categorizedError)) {
          logger.warn('Non-retryable error encountered', {
            name: this.name,
            attempt,
            category: categorizedError.category,
            message: categorizedError.message
          });
          throw error;
        }

        // Don't retry on last attempt
        if (attempt === this.config.maxAttempts) {
          logger.error('All retry attempts exhausted', {
            name: this.name,
            attempts: attempts.length,
            totalDuration: Date.now() - startTime,
            finalError: categorizedError.message
          });
          throw error;
        }

        // Calculate delay for next attempt
        const delay = this.calculateDelay(attempt);
        attemptInfo.delay = delay;

        logger.warn('Function failed, retrying', {
          name: this.name,
          attempt,
          nextAttempt: attempt + 1,
          delay,
          category: categorizedError.category,
          message: categorizedError.message
        });

        // Wait before next attempt
        await this.sleep(delay);
      }
    }

    // This should never be reached, but just in case
    throw lastError;
  }

  // Check if error should be retried
  private isRetryableError(error: any): boolean {
    const categorizedError = categorizeError(error);
    
    // Check if error is explicitly marked as retryable
    if (categorizedError.retryable !== undefined) {
      return categorizedError.retryable;
    }

    // Check if error category is in retryable list
    return this.config.retryableErrors.includes(categorizedError.category);
  }

  // Calculate delay with exponential backoff and jitter
  private calculateDelay(attempt: number): number {
    // Calculate exponential backoff
    let delay = this.config.baseDelay * Math.pow(this.config.backoffMultiplier, attempt - 1);
    
    // Apply maximum delay limit
    delay = Math.min(delay, this.config.maxDelay);
    
    // Add jitter to prevent thundering herd problem
    if (this.config.jitter) {
      // Add random jitter of ±25%
      const jitterRange = delay * 0.25;
      const jitter = (Math.random() - 0.5) * 2 * jitterRange;
      delay = Math.max(0, delay + jitter);
    }
    
    return Math.round(delay);
  }

  // Sleep utility
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Get configuration
  getConfig(): RetryConfig {
    return { ...this.config };
  }

  // Update configuration
  updateConfig(config: Partial<RetryConfig>): void {
    this.config = { ...this.config, ...config };
    logger.info('Retry configuration updated', {
      name: this.name,
      config: this.config
    });
  }
}

// Retry with circuit breaker integration
export class RetryWithCircuitBreaker extends RetryHandler {
  private circuitBreaker?: any; // Will be set if circuit breaker is provided

  constructor(name: string, config?: Partial<RetryConfig>, circuitBreaker?: any) {
    super(name, config);
    this.circuitBreaker = circuitBreaker;
  }

  // Execute with both retry and circuit breaker
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.circuitBreaker) {
      return super.execute(() => this.circuitBreaker.execute(fn));
    } else {
      return super.execute(fn);
    }
  }
}

// Convenience functions for common retry scenarios

// Retry for Zerodha API calls
export const createZerodhaRetryHandler = (serviceName: string): RetryHandler => {
  return new RetryHandler(`zerodha-${serviceName}`, {
    maxAttempts: 3,
    baseDelay: 1000,
    maxDelay: 10000,
    backoffMultiplier: 2,
    jitter: true,
    retryableErrors: [
      ErrorCategory.NETWORK,
      ErrorCategory.EXTERNAL_API,
      ErrorCategory.RATE_LIMIT
    ]
  });
};

// Retry for database operations
export const createDatabaseRetryHandler = (serviceName: string): RetryHandler => {
  return new RetryHandler(`database-${serviceName}`, {
    maxAttempts: 5,
    baseDelay: 500,
    maxDelay: 5000,
    backoffMultiplier: 1.5,
    jitter: true,
    retryableErrors: [
      ErrorCategory.DATABASE,
      ErrorCategory.NETWORK
    ]
  });
};

// Retry for WebSocket connections
export const createWebSocketRetryHandler = (serviceName: string): RetryHandler => {
  return new RetryHandler(`websocket-${serviceName}`, {
    maxAttempts: 10,
    baseDelay: 2000,
    maxDelay: 30000,
    backoffMultiplier: 1.5,
    jitter: true,
    retryableErrors: [
      ErrorCategory.NETWORK,
      ErrorCategory.EXTERNAL_API
    ]
  });
};

// Decorator function for automatic retry
export function withRetry(retryHandler: RetryHandler) {
  return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
    const method = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      return retryHandler.execute(() => method.apply(this, args));
    };

    return descriptor;
  };
}

// Utility function to execute with retry
export async function executeWithRetry<T>(
  fn: () => Promise<T>,
  name: string,
  config?: Partial<RetryConfig>
): Promise<T> {
  const retryHandler = new RetryHandler(name, config);
  return retryHandler.execute(fn);
}

// Utility function to execute with retry and circuit breaker
export async function executeWithRetryAndCircuitBreaker<T>(
  fn: () => Promise<T>,
  name: string,
  retryConfig?: Partial<RetryConfig>,
  circuitBreaker?: any
): Promise<T> {
  const retryHandler = new RetryWithCircuitBreaker(name, retryConfig, circuitBreaker);
  return retryHandler.execute(fn);
}