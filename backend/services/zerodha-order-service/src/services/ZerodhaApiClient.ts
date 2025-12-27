import axios, { AxiosInstance, AxiosResponse } from 'axios';
import { 
  ZerodhaOrderRequest, 
  ZerodhaOrder, 
  ZerodhaAPIResponse,
  ZERODHA_CONSTANTS 
} from '@tradeflow/types';
import { logger } from '../utils/logger';

export class ZerodhaApiClient {
  private client: AxiosInstance;
  private readonly baseURL: string;

  constructor() {
    this.baseURL = ZERODHA_CONSTANTS.API_BASE_URL;
    
    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: 10000, // 10 second timeout
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'TradeFlow/1.0'
      }
    });

    // Request interceptor for logging
    this.client.interceptors.request.use(
      (config) => {
        logger.debug(`Zerodha API Request: ${config.method?.toUpperCase()} ${config.url}`);
        return config;
      },
      (error) => {
        logger.error('Zerodha API Request Error:', error);
        return Promise.reject(error);
      }
    );

    // Response interceptor for logging and error handling
    this.client.interceptors.response.use(
      (response) => {
        logger.debug(`Zerodha API Response: ${response.status} ${response.config.url}`);
        return response;
      },
      (error) => {
        logger.error('Zerodha API Response Error:', {
          status: error.response?.status,
          data: error.response?.data,
          url: error.config?.url
        });
        return Promise.reject(error);
      }
    );
  }

  /**
   * Place a new order
   */
  async placeOrder(orderRequest: ZerodhaOrderRequest, accessToken: string): Promise<ZerodhaAPIResponse> {
    try {
      const formData = new URLSearchParams();
      formData.append('exchange', orderRequest.exchange);
      formData.append('tradingsymbol', orderRequest.tradingsymbol);
      formData.append('transaction_type', orderRequest.transaction_type);
      formData.append('quantity', orderRequest.quantity.toString());
      formData.append('product', orderRequest.product);
      formData.append('order_type', orderRequest.order_type);
      
      if (orderRequest.price) {
        formData.append('price', orderRequest.price.toString());
      }
      
      if (orderRequest.trigger_price) {
        formData.append('trigger_price', orderRequest.trigger_price.toString());
      }
      
      if (orderRequest.validity) {
        formData.append('validity', orderRequest.validity);
      }
      
      if (orderRequest.disclosed_quantity) {
        formData.append('disclosed_quantity', orderRequest.disclosed_quantity.toString());
      }
      
      if (orderRequest.tag) {
        formData.append('tag', orderRequest.tag);
      }

      const response = await this.client.post('/orders/regular', formData, {
        headers: {
          'Authorization': `token ${process.env.ZERODHA_API_KEY}:${accessToken}`
        }
      });

      return this.handleResponse(response);

    } catch (error) {
      return this.handleError(error, 'placeOrder');
    }
  }

  /**
   * Modify an existing order
   */
  async modifyOrder(
    orderId: string, 
    modifications: Partial<ZerodhaOrderRequest>, 
    accessToken: string
  ): Promise<ZerodhaAPIResponse> {
    try {
      const formData = new URLSearchParams();
      
      if (modifications.quantity) {
        formData.append('quantity', modifications.quantity.toString());
      }
      
      if (modifications.price) {
        formData.append('price', modifications.price.toString());
      }
      
      if (modifications.trigger_price) {
        formData.append('trigger_price', modifications.trigger_price.toString());
      }
      
      if (modifications.order_type) {
        formData.append('order_type', modifications.order_type);
      }
      
      if (modifications.validity) {
        formData.append('validity', modifications.validity);
      }

      const response = await this.client.put(`/orders/regular/${orderId}`, formData, {
        headers: {
          'Authorization': `token ${process.env.ZERODHA_API_KEY}:${accessToken}`
        }
      });

      return this.handleResponse(response);

    } catch (error) {
      return this.handleError(error, 'modifyOrder');
    }
  }

  /**
   * Cancel an order
   */
  async cancelOrder(orderId: string, accessToken: string): Promise<ZerodhaAPIResponse> {
    try {
      const response = await this.client.delete(`/orders/regular/${orderId}`, {
        headers: {
          'Authorization': `token ${process.env.ZERODHA_API_KEY}:${accessToken}`
        }
      });

      return this.handleResponse(response);

    } catch (error) {
      return this.handleError(error, 'cancelOrder');
    }
  }

  /**
   * Get order details
   */
  async getOrder(orderId: string, accessToken: string): Promise<ZerodhaAPIResponse<ZerodhaOrder>> {
    try {
      const response = await this.client.get(`/orders/${orderId}`, {
        headers: {
          'Authorization': `token ${process.env.ZERODHA_API_KEY}:${accessToken}`
        }
      });

      return this.handleResponse(response);

    } catch (error) {
      return this.handleError(error, 'getOrder');
    }
  }

  /**
   * Get all orders for the day
   */
  async getOrders(accessToken: string): Promise<ZerodhaAPIResponse<ZerodhaOrder[]>> {
    try {
      const response = await this.client.get('/orders', {
        headers: {
          'Authorization': `token ${process.env.ZERODHA_API_KEY}:${accessToken}`
        }
      });

      return this.handleResponse(response);

    } catch (error) {
      return this.handleError(error, 'getOrders');
    }
  }

  /**
   * Get order history/trades
   */
  async getOrderHistory(orderId: string, accessToken: string): Promise<ZerodhaAPIResponse> {
    try {
      const response = await this.client.get(`/orders/${orderId}/trades`, {
        headers: {
          'Authorization': `token ${process.env.ZERODHA_API_KEY}:${accessToken}`
        }
      });

      return this.handleResponse(response);

    } catch (error) {
      return this.handleError(error, 'getOrderHistory');
    }
  }

  /**
   * Get all trades for the day
   */
  async getTrades(accessToken: string): Promise<ZerodhaAPIResponse> {
    try {
      const response = await this.client.get('/trades', {
        headers: {
          'Authorization': `token ${process.env.ZERODHA_API_KEY}:${accessToken}`
        }
      });

      return this.handleResponse(response);

    } catch (error) {
      return this.handleError(error, 'getTrades');
    }
  }

  /**
   * Handle successful API responses
   */
  private handleResponse(response: AxiosResponse): ZerodhaAPIResponse {
    const data = response.data;
    
    if (data.status === 'success') {
      return {
        status: 'success',
        data: data.data
      };
    } else {
      return {
        status: 'error',
        message: data.message || 'API request failed',
        error_type: data.error_type || 'GeneralException'
      };
    }
  }

  /**
   * Handle API errors
   */
  private handleError(error: any, operation: string): ZerodhaAPIResponse {
    logger.error(`Zerodha API ${operation} error:`, error);

    if (error.response) {
      // API responded with error status
      const errorData = error.response.data;
      return {
        status: 'error',
        message: errorData.message || `${operation} failed`,
        error_type: errorData.error_type || 'APIException',
        data: errorData
      };
    } else if (error.request) {
      // Network error
      return {
        status: 'error',
        message: 'Network error - unable to reach Zerodha API',
        error_type: 'NetworkException'
      };
    } else {
      // Other error
      return {
        status: 'error',
        message: error.message || `${operation} failed`,
        error_type: 'GeneralException'
      };
    }
  }

  /**
   * Check API connectivity
   */
  async checkConnectivity(accessToken: string): Promise<boolean> {
    try {
      const response = await this.client.get('/user/profile', {
        headers: {
          'Authorization': `token ${process.env.ZERODHA_API_KEY}:${accessToken}`
        },
        timeout: 5000
      });

      return response.status === 200 && response.data.status === 'success';
    } catch (error) {
      logger.error('Zerodha API connectivity check failed:', error);
      return false;
    }
  }

  /**
   * Get rate limit status
   */
  getRateLimitInfo(): { ordersPerSecond: number; quotesPerSecond: number } {
    return {
      ordersPerSecond: ZERODHA_CONSTANTS.RATE_LIMITS.ORDERS_PER_SECOND,
      quotesPerSecond: ZERODHA_CONSTANTS.RATE_LIMITS.QUOTE_REQUESTS_PER_SECOND
    };
  }
}