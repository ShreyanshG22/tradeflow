import { createLogger } from './logger';
import { ErrorCategory, ErrorSeverity, ZerodhaError } from './error-handler';

const logger = createLogger('circuit-breaker');

// Circuit breaker states
export enum CircuitBreakerState {
  CLOSED = 'CLOSED',     // Normal operation
  OPEN = 'OPEN',         // Circuit is open, requests fail fast
  HALF_OPEN = 'HALF_OPEN' // Testing if service has recovered
}

// Circuit breaker configuration
export interface CircuitBreakerConfig {
  failureThreshold: number;      // Number of failures before opening circuit
  recoveryTimeout: number;       // Time to wait before trying half-open (ms)
  monitoringPeriod: number;      // Time window for failure counting (ms)
  successThreshold: number;      // Successes needed in half-open to close circuit
  timeout: number;               // Request timeout (ms)
}

// Default configuration
const DEFAULT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  recoveryTimeout: 60000,      // 1 minute
  monitoringPeriod: 60000,     // 1 minute
  successThreshold: 3,
  timeout: 30000               // 30 seconds
};

// Circuit breaker metrics
interface CircuitBreakerMetrics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  timeouts: number;
  circuitOpenCount: number;
  lastFailureTime?: Date;
  lastSuccessTime?: Date;
}

// Circuit breaker implementation
export class CircuitBreaker {
  private state: CircuitBreakerState = CircuitBreakerState.CLOSED;
  private config: CircuitBreakerConfig;
  private failures: Date[] = [];
  private successes: number = 0;
  private lastFailureTime?: Date;
  private nextAttemptTime?: Date;
  private metrics: CircuitBreakerMetrics;
  private name: string;

  constructor(name: string, config?: Partial<CircuitBreakerConfig>) {
    this.name = name;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      timeouts: 0,
      circuitOpenCount: 0
    };
  }

  // Execute a function with circuit breaker protection
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    this.metrics.totalRequests++;

    // Check if circuit is open
    if (this.state === CircuitBreakerState.OPEN) {
      if (this.shouldAttemptReset()) {
        this.state = CircuitBreakerState.HALF_OPEN;
        this.successes = 0;
        logger.info('Circuit breaker transitioning to HALF_OPEN', {
          name: this.name,
          state: this.state,
          metrics: this.metrics
        });
      } else {
        this.metrics.failedRequests++;
        throw new ZerodhaError(
          `Circuit breaker is OPEN for ${this.name}`,
          ErrorCategory.EXTERNAL_API,
          ErrorSeverity.MEDIUM,
          503,
          { circuitBreakerName: this.name, state: this.state },
          true
        );
      }
    }

    try {
      // Execute with timeout
      const result = await this.executeWithTimeout(fn);
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure(error);
      throw error;
    }
  }

  // Execute function with timeout
  private async executeWithTimeout<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.metrics.timeouts++;
        reject(new ZerodhaError(
          `Request timeout after ${this.config.timeout}ms`,
          ErrorCategory.NETWORK,
          ErrorSeverity.MEDIUM,
          408,
          { circuitBreakerName: this.name, timeout: this.config.timeout },
          true
        ));
      }, this.config.timeout);

      fn()
        .then((result) => {
          clearTimeout(timeoutId);
          resolve(result);
        })
        .catch((error) => {
          clearTimeout(timeoutId);
          reject(error);
        });
    });
  }

  // Handle successful execution
  private onSuccess(): void {
    this.metrics.successfulRequests++;
    this.metrics.lastSuccessTime = new Date();
    this.failures = [];

    if (this.state === CircuitBreakerState.HALF_OPEN) {
      this.successes++;
      if (this.successes >= this.config.successThreshold) {
        this.state = CircuitBreakerState.CLOSED;
        logger.info('Circuit breaker CLOSED after successful recovery', {
          name: this.name,
          state: this.state,
          successes: this.successes,
          metrics: this.metrics
        });
      }
    }
  }

  // Handle failed execution
  private onFailure(error: any): void {
    this.metrics.failedRequests++;
    this.lastFailureTime = new Date();
    this.metrics.lastFailureTime = this.lastFailureTime;
    this.failures.push(this.lastFailureTime);

    // Clean old failures outside monitoring period
    const cutoff = new Date(Date.now() - this.config.monitoringPeriod);
    this.failures = this.failures.filter(failure => failure > cutoff);

    // Check if we should open the circuit
    if (this.state === CircuitBreakerState.CLOSED && this.failures.length >= this.config.failureThreshold) {
      this.openCircuit();
    } else if (this.state === CircuitBreakerState.HALF_OPEN) {
      this.openCircuit();
    }

    logger.warn('Circuit breaker recorded failure', {
      name: this.name,
      state: this.state,
      failureCount: this.failures.length,
      error: error.message,
      metrics: this.metrics
    });
  }

  // Open the circuit
  private openCircuit(): void {
    this.state = CircuitBreakerState.OPEN;
    this.nextAttemptTime = new Date(Date.now() + this.config.recoveryTimeout);
    this.metrics.circuitOpenCount++;

    logger.error('Circuit breaker OPENED', {
      name: this.name,
      state: this.state,
      failureCount: this.failures.length,
      nextAttemptTime: this.nextAttemptTime,
      metrics: this.metrics
    });
  }

  // Check if we should attempt to reset the circuit
  private shouldAttemptReset(): boolean {
    return this.nextAttemptTime ? new Date() >= this.nextAttemptTime : false;
  }

  // Get current state
  getState(): CircuitBreakerState {
    return this.state;
  }

  // Get metrics
  getMetrics(): CircuitBreakerMetrics {
    return { ...this.metrics };
  }

  // Get health status
  getHealthStatus(): {
    name: string;
    state: CircuitBreakerState;
    healthy: boolean;
    failureRate: number;
    metrics: CircuitBreakerMetrics;
  } {
    const failureRate = this.metrics.totalRequests > 0 
      ? this.metrics.failedRequests / this.metrics.totalRequests 
      : 0;

    return {
      name: this.name,
      state: this.state,
      healthy: this.state === CircuitBreakerState.CLOSED,
      failureRate,
      metrics: this.metrics
    };
  }

  // Reset circuit breaker (for testing or manual intervention)
  reset(): void {
    this.state = CircuitBreakerState.CLOSED;
    this.failures = [];
    this.successes = 0;
    this.lastFailureTime = undefined;
    this.nextAttemptTime = undefined;

    logger.info('Circuit breaker manually reset', {
      name: this.name,
      state: this.state
    });
  }
}

// Circuit breaker manager for multiple services
export class CircuitBreakerManager {
  private breakers: Map<string, CircuitBreaker> = new Map();

  // Get or create a circuit breaker
  getCircuitBreaker(name: string, config?: Partial<CircuitBreakerConfig>): CircuitBreaker {
    if (!this.breakers.has(name)) {
      this.breakers.set(name, new CircuitBreaker(name, config));
    }
    return this.breakers.get(name)!;
  }

  // Get all circuit breakers
  getAllCircuitBreakers(): CircuitBreaker[] {
    return Array.from(this.breakers.values());
  }

  // Get health status of all circuit breakers
  getHealthStatus(): Array<{
    name: string;
    state: CircuitBreakerState;
    healthy: boolean;
    failureRate: number;
    metrics: CircuitBreakerMetrics;
  }> {
    return Array.from(this.breakers.values()).map(breaker => breaker.getHealthStatus());
  }

  // Reset all circuit breakers
  resetAll(): void {
    this.breakers.forEach(breaker => breaker.reset());
    logger.info('All circuit breakers reset');
  }
}

// Global circuit breaker manager instance
export const circuitBreakerManager = new CircuitBreakerManager();

// Convenience function to create circuit breaker for Zerodha API calls
export const createZerodhaCircuitBreaker = (serviceName: string): CircuitBreaker => {
  return circuitBreakerManager.getCircuitBreaker(`zerodha-${serviceName}`, {
    failureThreshold: 3,
    recoveryTimeout: 30000,    // 30 seconds for Zerodha API
    monitoringPeriod: 60000,   // 1 minute
    successThreshold: 2,
    timeout: 10000             // 10 seconds for API calls
  });
};