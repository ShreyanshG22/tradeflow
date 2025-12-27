import axios from 'axios';
import { ping } from 'ping';
import { Pool } from 'pg';
import { createClient } from 'redis';
import { CentralizedLogger } from '@tradeflow/logging';
import { HealthCheckResult, ServiceHealth } from './types';

export class HealthChecker {
  private logger: CentralizedLogger;

  constructor(logger: CentralizedLogger) {
    this.logger = logger;
  }

  async checkService(service: ServiceHealth): Promise<HealthCheckResult> {
    const startTime = Date.now();
    
    try {
      const result = await this.performHealthCheck(service);
      const responseTime = Date.now() - startTime;
      
      return {
        service: service.name,
        status: 'healthy',
        timestamp: new Date(),
        responseTime,
        details: result
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      
      return {
        service: service.name,
        status: 'unhealthy',
        timestamp: new Date(),
        responseTime,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  private async performHealthCheck(service: ServiceHealth): Promise<any> {
    const url = new URL(service.url);
    
    // Handle different protocols
    switch (url.protocol) {
      case 'http:':
      case 'https:':
        return this.checkHttpService(service);
      case 'tcp:':
        return this.checkTcpService(service);
      case 'redis:':
        return this.checkRedisService(service);
      case 'postgres:':
        return this.checkPostgresService(service);
      default:
        throw new Error(`Unsupported protocol: ${url.protocol}`);
    }
  }

  private async checkHttpService(service: ServiceHealth): Promise<any> {
    const response = await axios({
      method: service.method,
      url: service.url,
      timeout: service.timeout,
      headers: service.headers,
      validateStatus: (status) => {
        if (service.expectedStatus) {
          return status === service.expectedStatus;
        }
        return status >= 200 && status < 300;
      }
    });

    // Check response content if expected
    if (service.expectedResponse && response.data) {
      const responseText = typeof response.data === 'string' 
        ? response.data 
        : JSON.stringify(response.data);
      
      if (!responseText.includes(service.expectedResponse)) {
        throw new Error(`Response does not contain expected text: ${service.expectedResponse}`);
      }
    }

    return {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
      data: response.data
    };
  }

  private async checkTcpService(service: ServiceHealth): Promise<any> {
    const url = new URL(service.url);
    const host = url.hostname;
    
    const result = await ping.promise.probe(host, {
      timeout: service.timeout / 1000 // ping expects seconds
    });

    if (!result.alive) {
      throw new Error(`TCP connection failed to ${host}`);
    }

    return {
      alive: result.alive,
      time: result.time,
      host: result.host
    };
  }

  private async checkRedisService(service: ServiceHealth): Promise<any> {
    const client = createClient({
      url: service.url
    });

    try {
      await client.connect();
      const pong = await client.ping();
      await client.disconnect();

      return {
        connected: true,
        response: pong
      };
    } catch (error) {
      await client.disconnect();
      throw error;
    }
  }

  private async checkPostgresService(service: ServiceHealth): Promise<any> {
    const pool = new Pool({
      connectionString: service.url,
      connectionTimeoutMillis: service.timeout
    });

    try {
      const client = await pool.connect();
      const result = await client.query('SELECT NOW() as timestamp');
      client.release();
      await pool.end();

      return {
        connected: true,
        timestamp: result.rows[0].timestamp
      };
    } catch (error) {
      await pool.end();
      throw error;
    }
  }

  async checkMultipleServices(services: ServiceHealth[]): Promise<HealthCheckResult[]> {
    const promises = services.map(service => 
      this.checkService(service).catch(error => ({
        service: service.name,
        status: 'unhealthy' as const,
        timestamp: new Date(),
        responseTime: 0,
        error: error.message
      }))
    );

    return Promise.all(promises);
  }

  async checkServiceWithRetries(service: ServiceHealth): Promise<HealthCheckResult> {
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= service.retries; attempt++) {
      try {
        const result = await this.checkService(service);
        
        if (result.status === 'healthy') {
          return result;
        }
        
        lastError = new Error(result.error || 'Service unhealthy');
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');
        
        if (attempt < service.retries) {
          // Wait before retry (exponential backoff)
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    return {
      service: service.name,
      status: 'unhealthy',
      timestamp: new Date(),
      responseTime: 0,
      error: lastError?.message || 'All retries failed'
    };
  }
}