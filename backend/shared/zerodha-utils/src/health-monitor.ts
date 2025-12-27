import { createLogger } from './logger';
import { circuitBreakerManager } from './circuit-breaker';
import { ErrorCategory, ErrorSeverity } from './error-handler';

const logger = createLogger('health-monitor');

// Health status levels
export enum HealthStatus {
  HEALTHY = 'HEALTHY',
  DEGRADED = 'DEGRADED',
  UNHEALTHY = 'UNHEALTHY',
  CRITICAL = 'CRITICAL'
}

// Health check result
export interface HealthCheckResult {
  name: string;
  status: HealthStatus;
  message: string;
  timestamp: Date;
  duration: number;
  metadata?: Record<string, any>;
}

// System health summary
export interface SystemHealth {
  status: HealthStatus;
  timestamp: Date;
  checks: HealthCheckResult[];
  uptime: number;
  version?: string;
  environment?: string;
}

// Health check function type
export type HealthCheckFunction = () => Promise<HealthCheckResult>;

// Performance metrics
export interface PerformanceMetrics {
  requestCount: number;
  errorCount: number;
  averageResponseTime: number;
  p95ResponseTime: number;
  p99ResponseTime: number;
  throughput: number;
  errorRate: number;
  lastUpdated: Date;
}

// API connectivity status
export interface APIConnectivityStatus {
  name: string;
  url: string;
  status: HealthStatus;
  responseTime: number;
  lastCheck: Date;
  lastSuccess?: Date;
  lastFailure?: Date;
  consecutiveFailures: number;
}

// Health monitor class
export class HealthMonitor {
  private checks: Map<string, HealthCheckFunction> = new Map();
  private results: Map<string, HealthCheckResult> = new Map();
  private metrics: Map<string, PerformanceMetrics> = new Map();
  private apiConnectivity: Map<string, APIConnectivityStatus> = new Map();
  private startTime: Date = new Date();
  private intervalId?: NodeJS.Timeout;
  private checkInterval: number = 30000; // 30 seconds

  constructor(private serviceName: string) {}

  // Register a health check
  registerCheck(name: string, checkFn: HealthCheckFunction): void {
    this.checks.set(name, checkFn);
    logger.info('Health check registered', {
      service: this.serviceName,
      checkName: name
    });
  }

  // Remove a health check
  unregisterCheck(name: string): void {
    this.checks.delete(name);
    this.results.delete(name);
    logger.info('Health check unregistered', {
      service: this.serviceName,
      checkName: name
    });
  }

  // Run a specific health check
  async runCheck(name: string): Promise<HealthCheckResult> {
    const checkFn = this.checks.get(name);
    if (!checkFn) {
      throw new Error(`Health check '${name}' not found`);
    }

    const startTime = Date.now();
    try {
      const result = await checkFn();
      result.duration = Date.now() - startTime;
      result.timestamp = new Date();
      
      this.results.set(name, result);
      
      logger.debug('Health check completed', {
        service: this.serviceName,
        checkName: name,
        status: result.status,
        duration: result.duration
      });

      return result;
    } catch (error) {
      const result: HealthCheckResult = {
        name,
        status: HealthStatus.CRITICAL,
        message: `Health check failed: ${error.message}`,
        timestamp: new Date(),
        duration: Date.now() - startTime,
        metadata: { error: error.message }
      };

      this.results.set(name, result);
      
      logger.error('Health check failed', {
        service: this.serviceName,
        checkName: name,
        error: error.message,
        duration: result.duration
      });

      return result;
    }
  }

  // Run all health checks
  async runAllChecks(): Promise<HealthCheckResult[]> {
    const results: HealthCheckResult[] = [];
    
    for (const [name] of this.checks) {
      try {
        const result = await this.runCheck(name);
        results.push(result);
      } catch (error) {
        logger.error('Failed to run health check', {
          service: this.serviceName,
          checkName: name,
          error: error.message
        });
      }
    }

    return results;
  }

  // Get system health summary
  async getSystemHealth(): Promise<SystemHealth> {
    const checks = await this.runAllChecks();
    const overallStatus = this.calculateOverallStatus(checks);
    const uptime = Date.now() - this.startTime.getTime();

    return {
      status: overallStatus,
      timestamp: new Date(),
      checks,
      uptime,
      version: process.env.npm_package_version,
      environment: process.env.NODE_ENV
    };
  }

  // Calculate overall system status
  private calculateOverallStatus(checks: HealthCheckResult[]): HealthStatus {
    if (checks.length === 0) {
      return HealthStatus.HEALTHY;
    }

    const statusCounts = {
      [HealthStatus.CRITICAL]: 0,
      [HealthStatus.UNHEALTHY]: 0,
      [HealthStatus.DEGRADED]: 0,
      [HealthStatus.HEALTHY]: 0
    };

    checks.forEach(check => {
      statusCounts[check.status]++;
    });

    // If any critical, system is critical
    if (statusCounts[HealthStatus.CRITICAL] > 0) {
      return HealthStatus.CRITICAL;
    }

    // If more than 50% unhealthy, system is unhealthy
    if (statusCounts[HealthStatus.UNHEALTHY] > checks.length * 0.5) {
      return HealthStatus.UNHEALTHY;
    }

    // If any unhealthy or degraded, system is degraded
    if (statusCounts[HealthStatus.UNHEALTHY] > 0 || statusCounts[HealthStatus.DEGRADED] > 0) {
      return HealthStatus.DEGRADED;
    }

    return HealthStatus.HEALTHY;
  }

  // Start periodic health checks
  startPeriodicChecks(interval: number = this.checkInterval): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }

    this.checkInterval = interval;
    this.intervalId = setInterval(async () => {
      try {
        await this.runAllChecks();
      } catch (error) {
        logger.error('Periodic health check failed', {
          service: this.serviceName,
          error: error.message
        });
      }
    }, interval);

    logger.info('Periodic health checks started', {
      service: this.serviceName,
      interval
    });
  }

  // Stop periodic health checks
  stopPeriodicChecks(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
      
      logger.info('Periodic health checks stopped', {
        service: this.serviceName
      });
    }
  }

  // Record performance metrics
  recordMetrics(name: string, responseTime: number, isError: boolean = false): void {
    let metrics = this.metrics.get(name);
    
    if (!metrics) {
      metrics = {
        requestCount: 0,
        errorCount: 0,
        averageResponseTime: 0,
        p95ResponseTime: 0,
        p99ResponseTime: 0,
        throughput: 0,
        errorRate: 0,
        lastUpdated: new Date()
      };
      this.metrics.set(name, metrics);
    }

    metrics.requestCount++;
    if (isError) {
      metrics.errorCount++;
    }

    // Update average response time (simple moving average)
    metrics.averageResponseTime = (metrics.averageResponseTime * (metrics.requestCount - 1) + responseTime) / metrics.requestCount;
    
    // Calculate error rate
    metrics.errorRate = metrics.errorCount / metrics.requestCount;
    
    // Update timestamp
    metrics.lastUpdated = new Date();

    // Calculate throughput (requests per second over last minute)
    const oneMinuteAgo = new Date(Date.now() - 60000);
    if (metrics.lastUpdated > oneMinuteAgo) {
      metrics.throughput = metrics.requestCount / 60; // Simplified calculation
    }
  }

  // Get performance metrics
  getMetrics(name?: string): Map<string, PerformanceMetrics> | PerformanceMetrics | undefined {
    if (name) {
      return this.metrics.get(name);
    }
    return this.metrics;
  }

  // Check API connectivity
  async checkAPIConnectivity(name: string, url: string, timeout: number = 5000): Promise<APIConnectivityStatus> {
    const startTime = Date.now();
    let status: APIConnectivityStatus = this.apiConnectivity.get(name) || {
      name,
      url,
      status: HealthStatus.HEALTHY,
      responseTime: 0,
      lastCheck: new Date(),
      consecutiveFailures: 0
    };

    try {
      // Simple HTTP check (in real implementation, use actual HTTP client)
      const response = await this.performHTTPCheck(url, timeout);
      const responseTime = Date.now() - startTime;

      status = {
        ...status,
        status: HealthStatus.HEALTHY,
        responseTime,
        lastCheck: new Date(),
        lastSuccess: new Date(),
        consecutiveFailures: 0
      };

      logger.debug('API connectivity check successful', {
        service: this.serviceName,
        apiName: name,
        url,
        responseTime
      });

    } catch (error) {
      const responseTime = Date.now() - startTime;
      status = {
        ...status,
        status: HealthStatus.UNHEALTHY,
        responseTime,
        lastCheck: new Date(),
        lastFailure: new Date(),
        consecutiveFailures: status.consecutiveFailures + 1
      };

      logger.warn('API connectivity check failed', {
        service: this.serviceName,
        apiName: name,
        url,
        error: error.message,
        consecutiveFailures: status.consecutiveFailures
      });
    }

    this.apiConnectivity.set(name, status);
    return status;
  }

  // Perform HTTP check (placeholder - implement with actual HTTP client)
  private async performHTTPCheck(url: string, timeout: number): Promise<any> {
    // This is a placeholder - in real implementation, use axios or fetch
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        // Simulate success for now
        resolve({ status: 200 });
      }, 100);
    });
  }

  // Get all API connectivity statuses
  getAPIConnectivityStatus(): Map<string, APIConnectivityStatus> {
    return this.apiConnectivity;
  }

  // Cleanup resources
  destroy(): void {
    this.stopPeriodicChecks();
    this.checks.clear();
    this.results.clear();
    this.metrics.clear();
    this.apiConnectivity.clear();
    
    logger.info('Health monitor destroyed', {
      service: this.serviceName
    });
  }
}

// Pre-built health checks for common scenarios

// Database connectivity check
export const createDatabaseHealthCheck = (name: string, checkFn: () => Promise<boolean>): HealthCheckFunction => {
  return async (): Promise<HealthCheckResult> => {
    try {
      const isConnected = await checkFn();
      return {
        name,
        status: isConnected ? HealthStatus.HEALTHY : HealthStatus.UNHEALTHY,
        message: isConnected ? 'Database connection healthy' : 'Database connection failed',
        timestamp: new Date(),
        duration: 0
      };
    } catch (error) {
      return {
        name,
        status: HealthStatus.CRITICAL,
        message: `Database check failed: ${error.message}`,
        timestamp: new Date(),
        duration: 0,
        metadata: { error: error.message }
      };
    }
  };
};

// Redis connectivity check
export const createRedisHealthCheck = (name: string, checkFn: () => Promise<boolean>): HealthCheckFunction => {
  return async (): Promise<HealthCheckResult> => {
    try {
      const isConnected = await checkFn();
      return {
        name,
        status: isConnected ? HealthStatus.HEALTHY : HealthStatus.UNHEALTHY,
        message: isConnected ? 'Redis connection healthy' : 'Redis connection failed',
        timestamp: new Date(),
        duration: 0
      };
    } catch (error) {
      return {
        name,
        status: HealthStatus.CRITICAL,
        message: `Redis check failed: ${error.message}`,
        timestamp: new Date(),
        duration: 0,
        metadata: { error: error.message }
      };
    }
  };
};

// Circuit breaker health check
export const createCircuitBreakerHealthCheck = (): HealthCheckFunction => {
  return async (): Promise<HealthCheckResult> => {
    const circuitBreakers = circuitBreakerManager.getHealthStatus();
    const unhealthyBreakers = circuitBreakers.filter(cb => !cb.healthy);
    
    let status = HealthStatus.HEALTHY;
    let message = 'All circuit breakers healthy';
    
    if (unhealthyBreakers.length > 0) {
      status = HealthStatus.DEGRADED;
      message = `${unhealthyBreakers.length} circuit breaker(s) open: ${unhealthyBreakers.map(cb => cb.name).join(', ')}`;
    }

    return {
      name: 'circuit-breakers',
      status,
      message,
      timestamp: new Date(),
      duration: 0,
      metadata: { circuitBreakers }
    };
  };
};

// Memory usage health check
export const createMemoryHealthCheck = (thresholdPercent: number = 80): HealthCheckFunction => {
  return async (): Promise<HealthCheckResult> => {
    const memUsage = process.memoryUsage();
    const totalMem = memUsage.heapTotal;
    const usedMem = memUsage.heapUsed;
    const usagePercent = (usedMem / totalMem) * 100;

    let status = HealthStatus.HEALTHY;
    let message = `Memory usage: ${usagePercent.toFixed(1)}%`;

    if (usagePercent > thresholdPercent) {
      status = usagePercent > 90 ? HealthStatus.CRITICAL : HealthStatus.DEGRADED;
      message = `High memory usage: ${usagePercent.toFixed(1)}%`;
    }

    return {
      name: 'memory-usage',
      status,
      message,
      timestamp: new Date(),
      duration: 0,
      metadata: {
        heapUsed: usedMem,
        heapTotal: totalMem,
        usagePercent: usagePercent.toFixed(1)
      }
    };
  };
};

// Export singleton instance for global use
export const globalHealthMonitor = new HealthMonitor('global');