import { serviceDiscovery, ServiceInstance } from './serviceDiscovery';
import { logger } from '../utils/logger';
import { ServiceError } from '../middleware/errorHandler';

export interface LoadBalancerStats {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageResponseTime: number;
  requestsPerService: Map<string, number>;
}

export class LoadBalancer {
  private stats: LoadBalancerStats = {
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    averageResponseTime: 0,
    requestsPerService: new Map()
  };

  private responseTimeHistory: number[] = [];
  private readonly MAX_HISTORY_SIZE = 1000;

  public async getServiceUrl(serviceName: string): Promise<string> {
    const instance = serviceDiscovery.getHealthyInstance(serviceName);
    
    if (!instance) {
      this.recordFailedRequest(serviceName);
      throw new ServiceError(`No healthy instances available for service: ${serviceName}`);
    }

    this.recordRequest(serviceName);
    return instance.url;
  }

  public recordRequest(serviceName: string): void {
    this.stats.totalRequests++;
    
    const currentCount = this.stats.requestsPerService.get(serviceName) || 0;
    this.stats.requestsPerService.set(serviceName, currentCount + 1);
  }

  public recordSuccessfulRequest(serviceName: string, responseTime: number): void {
    this.stats.successfulRequests++;
    this.updateResponseTime(responseTime);
    
    logger.debug('Request completed successfully', {
      serviceName,
      responseTime: `${responseTime}ms`,
      totalRequests: this.stats.totalRequests
    });
  }

  public recordFailedRequest(serviceName: string, error?: string): void {
    this.stats.failedRequests++;
    
    logger.warn('Request failed', {
      serviceName,
      error,
      totalRequests: this.stats.totalRequests,
      failureRate: (this.stats.failedRequests / this.stats.totalRequests * 100).toFixed(2) + '%'
    });
  }

  private updateResponseTime(responseTime: number): void {
    this.responseTimeHistory.push(responseTime);
    
    // Keep only recent response times
    if (this.responseTimeHistory.length > this.MAX_HISTORY_SIZE) {
      this.responseTimeHistory.shift();
    }
    
    // Calculate average response time
    const sum = this.responseTimeHistory.reduce((acc, time) => acc + time, 0);
    this.stats.averageResponseTime = sum / this.responseTimeHistory.length;
  }

  public getStats(): LoadBalancerStats {
    return {
      ...this.stats,
      requestsPerService: new Map(this.stats.requestsPerService)
    };
  }

  public getHealthStatus(): {
    healthy: boolean;
    services: Array<{
      name: string;
      healthy: boolean;
      instanceCount: number;
      healthyInstanceCount: number;
    }>;
  } {
    const services = serviceDiscovery.getAllServices();
    const serviceHealth = Array.from(services.entries()).map(([name, instances]) => ({
      name,
      healthy: instances.some(instance => instance.healthy),
      instanceCount: instances.length,
      healthyInstanceCount: instances.filter(instance => instance.healthy).length
    }));

    const overallHealthy = serviceHealth.every(service => service.healthy);

    return {
      healthy: overallHealthy,
      services: serviceHealth
    };
  }

  // Circuit breaker pattern implementation
  private circuitBreakers: Map<string, {
    failures: number;
    lastFailureTime: Date;
    state: 'closed' | 'open' | 'half-open';
  }> = new Map();

  private readonly FAILURE_THRESHOLD = 5;
  private readonly RECOVERY_TIMEOUT = 60000; // 1 minute

  public isCircuitOpen(serviceName: string): boolean {
    const breaker = this.circuitBreakers.get(serviceName);
    
    if (!breaker) {
      return false;
    }

    if (breaker.state === 'open') {
      const timeSinceLastFailure = Date.now() - breaker.lastFailureTime.getTime();
      
      if (timeSinceLastFailure > this.RECOVERY_TIMEOUT) {
        breaker.state = 'half-open';
        logger.info('Circuit breaker entering half-open state', { serviceName });
        return false;
      }
      
      return true;
    }

    return false;
  }

  public recordCircuitBreakerFailure(serviceName: string): void {
    let breaker = this.circuitBreakers.get(serviceName);
    
    if (!breaker) {
      breaker = {
        failures: 0,
        lastFailureTime: new Date(),
        state: 'closed'
      };
      this.circuitBreakers.set(serviceName, breaker);
    }

    breaker.failures++;
    breaker.lastFailureTime = new Date();

    if (breaker.failures >= this.FAILURE_THRESHOLD && breaker.state === 'closed') {
      breaker.state = 'open';
      logger.error('Circuit breaker opened', {
        serviceName,
        failures: breaker.failures,
        threshold: this.FAILURE_THRESHOLD
      });
    }
  }

  public recordCircuitBreakerSuccess(serviceName: string): void {
    const breaker = this.circuitBreakers.get(serviceName);
    
    if (breaker) {
      if (breaker.state === 'half-open') {
        breaker.state = 'closed';
        breaker.failures = 0;
        logger.info('Circuit breaker closed after successful request', { serviceName });
      } else if (breaker.state === 'closed') {
        breaker.failures = Math.max(0, breaker.failures - 1);
      }
    }
  }
}

// Singleton instance
export const loadBalancer = new LoadBalancer();