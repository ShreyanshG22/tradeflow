import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import { config } from '../config/config';
import { logger } from '../utils/logger';
import { ServiceError, NotFoundError, ValidationError, AuthenticationError } from '../middleware/errorHandler';
import { loadBalancer } from './loadBalancer';

export type ServiceName = keyof typeof config.services;

export class ServiceProxy {
  private client: AxiosInstance;
  private serviceName: ServiceName;
  private baseURL: string;

  constructor(serviceName: ServiceName) {
    this.serviceName = serviceName;
    this.baseURL = config.services[serviceName];
    
    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: 30000, // 30 seconds
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'TradeFlow-API-Gateway/1.0.0'
      }
    });

    this.setupInterceptors();
  }

  private setupInterceptors(): void {
    // Request interceptor
    this.client.interceptors.request.use(
      async (config) => {
        const requestId = Math.random().toString(36).substr(2, 9);
        config.headers['x-request-id'] = requestId;
        
        // Check circuit breaker
        if (loadBalancer.isCircuitOpen(this.serviceName)) {
          throw new ServiceError(`Circuit breaker is open for ${this.serviceName}`);
        }
        
        // Get service URL from load balancer
        try {
          const serviceUrl = await loadBalancer.getServiceUrl(this.serviceName);
          config.baseURL = serviceUrl;
        } catch (error) {
          throw new ServiceError(`Service discovery failed for ${this.serviceName}`);
        }
        
        logger.debug(`Proxying request to ${this.serviceName}`, {
          service: this.serviceName,
          method: config.method?.toUpperCase(),
          url: config.url,
          requestId,
          baseURL: config.baseURL
        });

        return config;
      },
      (error) => {
        logger.error(`Request interceptor error for ${this.serviceName}`, {
          service: this.serviceName,
          error: error.message
        });
        loadBalancer.recordCircuitBreakerFailure(this.serviceName);
        return Promise.reject(error);
      }
    );

    // Response interceptor
    this.client.interceptors.response.use(
      (response) => {
        const responseTime = response.config.metadata?.endTime - response.config.metadata?.startTime || 0;
        
        loadBalancer.recordSuccessfulRequest(this.serviceName, responseTime);
        loadBalancer.recordCircuitBreakerSuccess(this.serviceName);
        
        logger.debug(`Response from ${this.serviceName}`, {
          service: this.serviceName,
          status: response.status,
          responseTime: `${responseTime}ms`,
          requestId: response.config.headers['x-request-id']
        });
        return response;
      },
      (error) => {
        const requestId = error.config?.headers?.['x-request-id'];
        
        loadBalancer.recordFailedRequest(this.serviceName, error.message);
        loadBalancer.recordCircuitBreakerFailure(this.serviceName);
        
        logger.error(`Error from ${this.serviceName}`, {
          service: this.serviceName,
          requestId,
          status: error.response?.status,
          message: error.message,
          data: error.response?.data
        });

        // Transform service errors to API Gateway errors
        if (error.response) {
          const { status, data } = error.response;
          
          switch (status) {
            case 400:
              throw new ValidationError(
                data?.error?.message || 'Bad request',
                data?.error?.details
              );
            case 401:
              throw new AuthenticationError(
                data?.error?.message || 'Authentication failed'
              );
            case 404:
              throw new NotFoundError(
                data?.error?.message || 'Resource not found'
              );
            case 500:
            case 502:
            case 503:
            case 504:
              throw new ServiceError(
                `${this.serviceName} is temporarily unavailable`
              );
            default:
              throw new ServiceError(
                data?.error?.message || `Error from ${this.serviceName}`
              );
          }
        } else if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
          throw new ServiceError(`${this.serviceName} is not available`);
        } else {
          throw new ServiceError(`Network error communicating with ${this.serviceName}`);
        }
      }
    );

    // Add timing interceptor
    this.client.interceptors.request.use((config) => {
      config.metadata = { startTime: Date.now() };
      return config;
    });

    this.client.interceptors.response.use(
      (response) => {
        response.config.metadata.endTime = Date.now();
        return response;
      },
      (error) => {
        if (error.config) {
          error.config.metadata = error.config.metadata || {};
          error.config.metadata.endTime = Date.now();
        }
        return Promise.reject(error);
      }
    );
  }

  async get(url: string, config?: AxiosRequestConfig): Promise<AxiosResponse> {
    return this.client.get(url, config);
  }

  async post(url: string, data?: any, config?: AxiosRequestConfig): Promise<AxiosResponse> {
    return this.client.post(url, data, config);
  }

  async put(url: string, data?: any, config?: AxiosRequestConfig): Promise<AxiosResponse> {
    return this.client.put(url, data, config);
  }

  async patch(url: string, data?: any, config?: AxiosRequestConfig): Promise<AxiosResponse> {
    return this.client.patch(url, data, config);
  }

  async delete(url: string, config?: AxiosRequestConfig): Promise<AxiosResponse> {
    return this.client.delete(url, config);
  }

  // Helper method to forward requests with authentication
  async forwardRequest(
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    url: string,
    data?: any,
    headers?: Record<string, string>
  ): Promise<AxiosResponse> {
    const config: AxiosRequestConfig = {
      method,
      url,
      data,
      headers
    };

    return this.client.request(config);
  }
}