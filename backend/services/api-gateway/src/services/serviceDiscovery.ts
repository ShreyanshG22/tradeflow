import { config } from '../config/config';
import { logger } from '../utils/logger';
import axios from 'axios';

export interface ServiceInstance {
  id: string;
  name: string;
  url: string;
  healthy: boolean;
  lastHealthCheck: Date;
  responseTime: number;
}

export class ServiceDiscovery {
  private services: Map<string, ServiceInstance[]> = new Map();
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private readonly HEALTH_CHECK_INTERVAL = 30000; // 30 seconds
  private readonly HEALTH_CHECK_TIMEOUT = 5000; // 5 seconds

  constructor() {
    this.initializeServices();
    this.startHealthChecks();
  }

  private initializeServices(): void {
    // Initialize service instances from config
    Object.entries(config.services).forEach(([serviceName, serviceUrl]) => {
      const instance: ServiceInstance = {
        id: `${serviceName}-1`,
        name: serviceName,
        url: serviceUrl,
        healthy: true,
        lastHealthCheck: new Date(),
        responseTime: 0
      };

      this.services.set(serviceName, [instance]);
    });

    logger.info('Service discovery initialized', {
      services: Array.from(this.services.keys())
    });
  }

  private startHealthChecks(): void {
    this.healthCheckInterval = setInterval(() => {
      this.performHealthChecks();
    }, this.HEALTH_CHECK_INTERVAL);

    // Perform initial health check
    this.performHealthChecks();
  }

  private async performHealthChecks(): Promise<void> {
    const healthCheckPromises: Promise<void>[] = [];

    for (const [serviceName, instances] of this.services.entries()) {
      for (const instance of instances) {
        healthCheckPromises.push(this.checkServiceHealth(instance));
      }
    }

    await Promise.allSettled(healthCheckPromises);
  }

  private async checkServiceHealth(instance: ServiceInstance): Promise<void> {
    const startTime = Date.now();
    
    try {
      const response = await axios.get(`${instance.url}/health`, {
        timeout: this.HEALTH_CHECK_TIMEOUT,
        headers: {
          'User-Agent': 'TradeFlow-API-Gateway-HealthCheck/1.0.0'
        }
      });

      const responseTime = Date.now() - startTime;
      const wasUnhealthy = !instance.healthy;

      instance.healthy = response.status === 200;
      instance.lastHealthCheck = new Date();
      instance.responseTime = responseTime;

      if (wasUnhealthy && instance.healthy) {
        logger.info('Service recovered', {
          service: instance.name,
          instanceId: instance.id,
          responseTime: `${responseTime}ms`
        });
      }

    } catch (error) {
      const responseTime = Date.now() - startTime;
      const wasHealthy = instance.healthy;

      instance.healthy = false;
      instance.lastHealthCheck = new Date();
      instance.responseTime = responseTime;

      if (wasHealthy) {
        logger.error('Service health check failed', {
          service: instance.name,
          instanceId: instance.id,
          error: error instanceof Error ? error.message : 'Unknown error',
          responseTime: `${responseTime}ms`
        });
      }
    }
  }

  public getHealthyInstance(serviceName: string): ServiceInstance | null {
    const instances = this.services.get(serviceName);
    
    if (!instances || instances.length === 0) {
      logger.warn('No instances found for service', { serviceName });
      return null;
    }

    // Filter healthy instances
    const healthyInstances = instances.filter(instance => instance.healthy);
    
    if (healthyInstances.length === 0) {
      logger.warn('No healthy instances found for service', { serviceName });
      return null;
    }

    // Simple round-robin load balancing
    // In production, you might want more sophisticated algorithms
    const selectedInstance = this.selectBestInstance(healthyInstances);
    
    logger.debug('Selected service instance', {
      serviceName,
      instanceId: selectedInstance.id,
      responseTime: `${selectedInstance.responseTime}ms`
    });

    return selectedInstance;
  }

  private selectBestInstance(instances: ServiceInstance[]): ServiceInstance {
    // Load balancing strategy: select instance with lowest response time
    return instances.reduce((best, current) => {
      return current.responseTime < best.responseTime ? current : best;
    });
  }

  public getAllServices(): Map<string, ServiceInstance[]> {
    return new Map(this.services);
  }

  public getServiceHealth(serviceName: string): ServiceInstance[] | null {
    return this.services.get(serviceName) || null;
  }

  public addServiceInstance(serviceName: string, instance: ServiceInstance): void {
    const instances = this.services.get(serviceName) || [];
    instances.push(instance);
    this.services.set(serviceName, instances);
    
    logger.info('Service instance added', {
      serviceName,
      instanceId: instance.id,
      url: instance.url
    });
  }

  public removeServiceInstance(serviceName: string, instanceId: string): void {
    const instances = this.services.get(serviceName);
    
    if (instances) {
      const filteredInstances = instances.filter(instance => instance.id !== instanceId);
      this.services.set(serviceName, filteredInstances);
      
      logger.info('Service instance removed', {
        serviceName,
        instanceId
      });
    }
  }

  public stop(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
    
    logger.info('Service discovery stopped');
  }
}

// Singleton instance
export const serviceDiscovery = new ServiceDiscovery();