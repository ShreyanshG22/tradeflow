import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import { ZerodhaAPIResponse, ZerodhaAPIError, ZERODHA_CONSTANTS } from '@tradeflow/types';
import { createLogger } from './logger';

const logger = createLogger('ZerodhaAPIClient');

export interface ZerodhaAPIClientConfig {
  apiKey: string;
  accessToken?: string;
  timeout?: number;
  debug?: boolean;
}

export class ZerodhaAPIClient {
  private client: AxiosInstance;
  private apiKey: string;
  private accessToken?: string;
  private debug: boolean;

  constructor(config: ZerodhaAPIClientConfig) {
    this.apiKey = config.apiKey;
    this.accessToken = config.accessToken;
    this.debug = config.debug || false;

    this.client = axios.create({
      baseURL: ZERODHA_CONSTANTS.API_BASE_URL,
      timeout: config.timeout || 10000,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'TradeFlow/1.0',
      },
    });

    this.setupInterceptors();
  }

  /**
   * Set access token for authenticated requests
   */
  public setAccessToken(token: string): void {
    this.accessToken = token;
    this.client.defaults.headers.common['Authorization'] = `token ${this.apiKey}:${token}`;
  }

  /**
   * Remove access token
   */
  public clearAccessToken(): void {
    this.accessToken = undefined;
    delete this.client.defaults.headers.common['Authorization'];
  }

  /**
   * Make GET request to Zerodha API
   */
  public async get<T = any>(endpoint: string, params?: Record<string, any>): Promise<ZerodhaAPIResponse<T>> {
    try {
      const response = await this.client.get(endpoint, { params });
      return this.handleResponse<T>(response);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Make POST request to Zerodha API
   */
  public async post<T = any>(endpoint: string, data?: Record<string, any>): Promise<ZerodhaAPIResponse<T>> {
    try {
      const response = await this.client.post(endpoint, this.formatFormData(data));
      return this.handleResponse<T>(response);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Make PUT request to Zerodha API
   */
  public async put<T = any>(endpoint: string, data?: Record<string, any>): Promise<ZerodhaAPIResponse<T>> {
    try {
      const response = await this.client.put(endpoint, this.formatFormData(data));
      return this.handleResponse<T>(response);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Make DELETE request to Zerodha API
   */
  public async delete<T = any>(endpoint: string, data?: Record<string, any>): Promise<ZerodhaAPIResponse<T>> {
    try {
      const response = await this.client.delete(endpoint, { data: this.formatFormData(data) });
      return this.handleResponse<T>(response);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Setup request/response interceptors
   */
  private setupInterceptors(): void {
    // Request interceptor
    this.client.interceptors.request.use(
      (config) => {
        if (this.debug) {
          logger.debug('API Request:', {
            method: config.method?.toUpperCase(),
            url: config.url,
            params: config.params,
            data: config.data,
          });
        }
        return config;
      },
      (error) => {
        logger.error('Request interceptor error:', error);
        return Promise.reject(error);
      }
    );

    // Response interceptor
    this.client.interceptors.response.use(
      (response) => {
        if (this.debug) {
          logger.debug('API Response:', {
            status: response.status,
            data: response.data,
          });
        }
        return response;
      },
      (error) => {
        if (this.debug) {
          logger.error('Response interceptor error:', {
            status: error.response?.status,
            data: error.response?.data,
            message: error.message,
          });
        }
        return Promise.reject(error);
      }
    );
  }

  /**
   * Handle successful API response
   */
  private handleResponse<T>(response: AxiosResponse): ZerodhaAPIResponse<T> {
    const { data } = response;
    
    if (data.status === 'success') {
      return {
        status: 'success',
        data: data.data,
      };
    } else {
      return {
        status: 'error',
        message: data.message || 'Unknown error',
        error_type: data.error_type || 'GeneralException',
        data: data.data,
      };
    }
  }

  /**
   * Handle API error
   */
  private handleError(error: any): ZerodhaAPIResponse {
    if (error.response) {
      // Server responded with error status
      const { data, status } = error.response;
      
      logger.error('API Error Response:', {
        status,
        data,
        url: error.config?.url,
        method: error.config?.method,
      });

      return {
        status: 'error',
        message: data.message || `HTTP ${status} Error`,
        error_type: data.error_type || 'NetworkException',
        data: data.data,
      };
    } else if (error.request) {
      // Request was made but no response received
      logger.error('API Network Error:', {
        message: error.message,
        code: error.code,
        url: error.config?.url,
      });

      return {
        status: 'error',
        message: 'Network error - no response from server',
        error_type: 'NetworkException',
      };
    } else {
      // Something else happened
      logger.error('API Request Setup Error:', error.message);

      return {
        status: 'error',
        message: error.message || 'Request setup error',
        error_type: 'GeneralException',
      };
    }
  }

  /**
   * Format data as form-encoded string for Zerodha API
   */
  private formatFormData(data?: Record<string, any>): string {
    if (!data) return '';
    
    const params = new URLSearchParams();
    Object.entries(data).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        params.append(key, String(value));
      }
    });
    
    return params.toString();
  }

  /**
   * Check if client has valid access token
   */
  public hasValidToken(): boolean {
    return !!this.accessToken;
  }

  /**
   * Get current API key
   */
  public getApiKey(): string {
    return this.apiKey;
  }
}