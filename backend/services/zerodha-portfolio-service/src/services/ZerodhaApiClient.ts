import axios, { AxiosInstance, AxiosResponse } from 'axios';
import { logger } from '../utils/logger';
import { ZerodhaPosition, ZerodhaHolding, ZerodhaMargin, ZerodhaAPIResponse } from '@tradeflow/types';

export class ZerodhaApiClient {
  private client: AxiosInstance;
  private accessToken: string;

  constructor(accessToken: string) {
    this.accessToken = accessToken;
    this.client = axios.create({
      baseURL: 'https://api.kite.trade',
      timeout: 10000,
      headers: {
        'Authorization': `token ${process.env.ZERODHA_API_KEY}:${accessToken}`,
        'X-Kite-Version': '3',
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });

    // Request interceptor for logging
    this.client.interceptors.request.use(
      (config) => {
        logger.debug('Zerodha API request:', {
          method: config.method?.toUpperCase(),
          url: config.url,
          params: config.params
        });
        return config;
      },
      (error) => {
        logger.error('Zerodha API request error:', error);
        return Promise.reject(error);
      }
    );

    // Response interceptor for logging and error handling
    this.client.interceptors.response.use(
      (response: AxiosResponse<ZerodhaAPIResponse>) => {
        logger.debug('Zerodha API response:', {
          status: response.status,
          url: response.config.url,
          dataStatus: response.data.status
        });
        
        if (response.data.status === 'error') {
          throw new Error(response.data.message || 'Zerodha API error');
        }
        
        return response;
      },
      (error) => {
        logger.error('Zerodha API response error:', {
          status: error.response?.status,
          message: error.response?.data?.message || error.message,
          url: error.config?.url
        });
        throw error;
      }
    );
  }

  async getPositions(): Promise<ZerodhaPosition[]> {
    try {
      const response = await this.client.get<ZerodhaAPIResponse<{
        net: ZerodhaPosition[];
        day: ZerodhaPosition[];
      }>>('/portfolio/positions');
      
      return response.data.data?.net || [];
    } catch (error) {
      logger.error('Failed to fetch positions from Zerodha:', error);
      throw new Error('Failed to fetch positions from Zerodha API');
    }
  }

  async getHoldings(): Promise<ZerodhaHolding[]> {
    try {
      const response = await this.client.get<ZerodhaAPIResponse<ZerodhaHolding[]>>('/portfolio/holdings');
      return response.data.data || [];
    } catch (error) {
      logger.error('Failed to fetch holdings from Zerodha:', error);
      throw new Error('Failed to fetch holdings from Zerodha API');
    }
  }

  async getMargins(): Promise<ZerodhaMargin> {
    try {
      const response = await this.client.get<ZerodhaAPIResponse<ZerodhaMargin>>('/user/margins');
      return response.data.data!;
    } catch (error) {
      logger.error('Failed to fetch margins from Zerodha:', error);
      throw new Error('Failed to fetch margins from Zerodha API');
    }
  }

  async getUserProfile(): Promise<any> {
    try {
      const response = await this.client.get<ZerodhaAPIResponse>('/user/profile');
      return response.data.data;
    } catch (error) {
      logger.error('Failed to fetch user profile from Zerodha:', error);
      throw new Error('Failed to fetch user profile from Zerodha API');
    }
  }
}