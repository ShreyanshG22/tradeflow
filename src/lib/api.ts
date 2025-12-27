/**
 * TradeFlow API Client
 * Production-ready API client for connecting frontend with backend services
 */

import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';

// API Configuration
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';
const API_TIMEOUT = 30000; // 30 seconds

// API Response Types
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  timestamp: string;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// Authentication Types
export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
}

export interface AuthResponse {
  token: string;
  refreshToken: string;
  user: User;
  expiresIn: number;
}

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  isEmailVerified: boolean;
  preferences: UserPreferences;
  createdAt: string;
  updatedAt: string;
}

export interface UserPreferences {
  theme: 'light' | 'dark' | 'system';
  timezone: string;
  currency: string;
  language: string;
  notifications: {
    email: boolean;
    push: boolean;
    trading: boolean;
    portfolio: boolean;
  };
}

// Portfolio Types
export interface Portfolio {
  id: string;
  userId: string;
  name: string;
  description?: string;
  cashBalance: number;
  totalValue: number;
  unrealizedPnl: number;
  realizedPnl: number;
  dayChange: number;
  dayChangePercent: number;
  positions: Position[];
  createdAt: string;
  updatedAt: string;
}

export interface Position {
  id: string;
  portfolioId: string;
  symbol: string;
  quantity: number;
  averagePrice: number;
  currentPrice: number;
  marketValue: number;
  unrealizedPnl: number;
  unrealizedPnlPercent: number;
  dayChange: number;
  dayChangePercent: number;
  createdAt: string;
  updatedAt: string;
}

export interface Trade {
  id: string;
  portfolioId: string;
  strategyId?: string;
  symbol: string;
  side: 'buy' | 'sell';
  quantity: number;
  price: number;
  executedAt: string;
  commission: number;
  status: 'pending' | 'filled' | 'cancelled' | 'rejected';
  createdAt: string;
}

// Strategy Types
export interface Strategy {
  id: string;
  userId: string;
  name: string;
  description?: string;
  config: StrategyConfig;
  status: 'draft' | 'active' | 'paused' | 'archived';
  performance: StrategyPerformance;
  createdAt: string;
  updatedAt: string;
}

export interface StrategyConfig {
  type: string;
  parameters: Record<string, any>;
  riskManagement: {
    maxPositionSize: number;
    stopLoss?: number;
    takeProfit?: number;
    maxDrawdown: number;
  };
  symbols: string[];
  timeframe: string;
}

export interface StrategyPerformance {
  totalReturn: number;
  totalReturnPercent: number;
  sharpeRatio: number;
  maxDrawdown: number;
  winRate: number;
  profitFactor: number;
  totalTrades: number;
  avgTradeReturn: number;
}

// Backtest Types
export interface BacktestRequest {
  strategyId: string;
  startDate: string;
  endDate: string;
  initialCapital: number;
  symbols: string[];
  parameters: Record<string, any>;
}

export interface BacktestResult {
  id: string;
  strategyId: string;
  status: 'running' | 'completed' | 'failed';
  progress: number;
  results?: {
    performance: StrategyPerformance;
    trades: Trade[];
    equityCurve: Array<{ date: string; equity: number }>;
    drawdownCurve: Array<{ date: string; drawdown: number }>;
    monthlyReturns: Array<{ month: string; return: number }>;
  };
  startedAt: string;
  completedAt?: string;
  error?: string;
}

// Market Data Types
export interface MarketData {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  high: number;
  low: number;
  open: number;
  previousClose: number;
  timestamp: string;
}

export interface Candlestick {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// API Client Class
class ApiClient {
  private client: AxiosInstance;
  private token: string | null = null;

  constructor() {
    this.client = axios.create({
      baseURL: API_BASE_URL,
      timeout: API_TIMEOUT,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Request interceptor to add auth token
    this.client.interceptors.request.use(
      (config) => {
        if (this.token) {
          config.headers.Authorization = `Bearer ${this.token}`;
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      async (error) => {
        if (error.response?.status === 401) {
          // Token expired, try to refresh
          await this.refreshToken();
          // Retry the original request
          return this.client.request(error.config);
        }
        return Promise.reject(error);
      }
    );

    // Load token from localStorage
    this.loadToken();
  }

  private loadToken(): void {
    const token = localStorage.getItem('tradeflow_token');
    if (token) {
      this.token = token;
    }
  }

  private saveToken(token: string): void {
    this.token = token;
    localStorage.setItem('tradeflow_token', token);
  }

  private clearToken(): void {
    this.token = null;
    localStorage.removeItem('tradeflow_token');
    localStorage.removeItem('tradeflow_refresh_token');
  }

  private async refreshToken(): Promise<void> {
    try {
      const refreshToken = localStorage.getItem('tradeflow_refresh_token');
      if (!refreshToken) {
        throw new Error('No refresh token available');
      }

      const response = await this.client.post('/api/auth/refresh', {
        refreshToken,
      });

      const { token, refreshToken: newRefreshToken } = response.data.data;
      this.saveToken(token);
      localStorage.setItem('tradeflow_refresh_token', newRefreshToken);
    } catch (error) {
      this.clearToken();
      window.location.href = '/login';
      throw error;
    }
  }

  // Authentication Methods
  async login(credentials: LoginRequest): Promise<AuthResponse> {
    const response = await this.client.post<ApiResponse<AuthResponse>>(
      '/api/auth/login',
      credentials
    );
    
    if (response.data.success && response.data.data) {
      const authData = response.data.data;
      this.saveToken(authData.token);
      localStorage.setItem('tradeflow_refresh_token', authData.refreshToken);
      return authData;
    }
    
    throw new Error(response.data.error?.message || 'Login failed');
  }

  async register(userData: RegisterRequest): Promise<AuthResponse> {
    const response = await this.client.post<ApiResponse<AuthResponse>>(
      '/api/auth/register',
      userData
    );
    
    if (response.data.success && response.data.data) {
      const authData = response.data.data;
      this.saveToken(authData.token);
      localStorage.setItem('tradeflow_refresh_token', authData.refreshToken);
      return authData;
    }
    
    throw new Error(response.data.error?.message || 'Registration failed');
  }

  async logout(): Promise<void> {
    try {
      await this.client.post('/api/auth/logout');
    } finally {
      this.clearToken();
    }
  }

  async getCurrentUser(): Promise<User> {
    const response = await this.client.get<ApiResponse<User>>('/api/auth/me');
    
    if (response.data.success && response.data.data) {
      return response.data.data;
    }
    
    throw new Error(response.data.error?.message || 'Failed to get user data');
  }

  // Portfolio Methods
  async getPortfolios(): Promise<Portfolio[]> {
    const response = await this.client.get<ApiResponse<Portfolio[]>>('/api/portfolio');
    
    if (response.data.success && response.data.data) {
      return response.data.data;
    }
    
    throw new Error(response.data.error?.message || 'Failed to get portfolios');
  }

  async getPortfolio(id: string): Promise<Portfolio> {
    const response = await this.client.get<ApiResponse<Portfolio>>(`/api/portfolio/${id}`);
    
    if (response.data.success && response.data.data) {
      return response.data.data;
    }
    
    throw new Error(response.data.error?.message || 'Failed to get portfolio');
  }

  async createPortfolio(portfolio: Partial<Portfolio>): Promise<Portfolio> {
    const response = await this.client.post<ApiResponse<Portfolio>>(
      '/api/portfolio',
      portfolio
    );
    
    if (response.data.success && response.data.data) {
      return response.data.data;
    }
    
    throw new Error(response.data.error?.message || 'Failed to create portfolio');
  }

  async updatePortfolio(id: string, updates: Partial<Portfolio>): Promise<Portfolio> {
    const response = await this.client.put<ApiResponse<Portfolio>>(
      `/api/portfolio/${id}`,
      updates
    );
    
    if (response.data.success && response.data.data) {
      return response.data.data;
    }
    
    throw new Error(response.data.error?.message || 'Failed to update portfolio');
  }

  async deletePortfolio(id: string): Promise<void> {
    const response = await this.client.delete<ApiResponse>(`/api/portfolio/${id}`);
    
    if (!response.data.success) {
      throw new Error(response.data.error?.message || 'Failed to delete portfolio');
    }
  }

  // Trade Methods
  async getTrades(portfolioId?: string, limit = 50, offset = 0): Promise<PaginatedResponse<Trade>> {
    const params = new URLSearchParams({
      limit: limit.toString(),
      offset: offset.toString(),
    });
    
    if (portfolioId) {
      params.append('portfolioId', portfolioId);
    }

    const response = await this.client.get<PaginatedResponse<Trade>>(
      `/api/trades?${params.toString()}`
    );
    
    if (response.data.success) {
      return response.data;
    }
    
    throw new Error(response.data.error?.message || 'Failed to get trades');
  }

  async createTrade(trade: Partial<Trade>): Promise<Trade> {
    const response = await this.client.post<ApiResponse<Trade>>('/api/trades', trade);
    
    if (response.data.success && response.data.data) {
      return response.data.data;
    }
    
    throw new Error(response.data.error?.message || 'Failed to create trade');
  }

  // Strategy Methods
  async getStrategies(): Promise<Strategy[]> {
    const response = await this.client.get<ApiResponse<Strategy[]>>('/api/strategies');
    
    if (response.data.success && response.data.data) {
      return response.data.data;
    }
    
    throw new Error(response.data.error?.message || 'Failed to get strategies');
  }

  async getStrategy(id: string): Promise<Strategy> {
    const response = await this.client.get<ApiResponse<Strategy>>(`/api/strategies/${id}`);
    
    if (response.data.success && response.data.data) {
      return response.data.data;
    }
    
    throw new Error(response.data.error?.message || 'Failed to get strategy');
  }

  async createStrategy(strategy: Partial<Strategy>): Promise<Strategy> {
    const response = await this.client.post<ApiResponse<Strategy>>(
      '/api/strategies',
      strategy
    );
    
    if (response.data.success && response.data.data) {
      return response.data.data;
    }
    
    throw new Error(response.data.error?.message || 'Failed to create strategy');
  }

  async updateStrategy(id: string, updates: Partial<Strategy>): Promise<Strategy> {
    const response = await this.client.put<ApiResponse<Strategy>>(
      `/api/strategies/${id}`,
      updates
    );
    
    if (response.data.success && response.data.data) {
      return response.data.data;
    }
    
    throw new Error(response.data.error?.message || 'Failed to update strategy');
  }

  async deleteStrategy(id: string): Promise<void> {
    const response = await this.client.delete<ApiResponse>(`/api/strategies/${id}`);
    
    if (!response.data.success) {
      throw new Error(response.data.error?.message || 'Failed to delete strategy');
    }
  }

  // Backtest Methods
  async createBacktest(request: BacktestRequest): Promise<BacktestResult> {
    const response = await this.client.post<ApiResponse<BacktestResult>>(
      '/api/backtests',
      request
    );
    
    if (response.data.success && response.data.data) {
      return response.data.data;
    }
    
    throw new Error(response.data.error?.message || 'Failed to create backtest');
  }

  async getBacktest(id: string): Promise<BacktestResult> {
    const response = await this.client.get<ApiResponse<BacktestResult>>(`/api/backtests/${id}`);
    
    if (response.data.success && response.data.data) {
      return response.data.data;
    }
    
    throw new Error(response.data.error?.message || 'Failed to get backtest');
  }

  async getBacktests(strategyId?: string): Promise<BacktestResult[]> {
    const params = strategyId ? `?strategyId=${strategyId}` : '';
    const response = await this.client.get<ApiResponse<BacktestResult[]>>(
      `/api/backtests${params}`
    );
    
    if (response.data.success && response.data.data) {
      return response.data.data;
    }
    
    throw new Error(response.data.error?.message || 'Failed to get backtests');
  }

  // Market Data Methods
  async getMarketData(symbols: string[]): Promise<MarketData[]> {
    const response = await this.client.get<ApiResponse<MarketData[]>>(
      `/api/market-data/quotes?symbols=${symbols.join(',')}`
    );
    
    if (response.data.success && response.data.data) {
      return response.data.data;
    }
    
    throw new Error(response.data.error?.message || 'Failed to get market data');
  }

  async getHistoricalData(
    symbol: string,
    timeframe: string,
    startDate: string,
    endDate: string
  ): Promise<Candlestick[]> {
    const response = await this.client.get<ApiResponse<Candlestick[]>>(
      `/api/market-data/historical/${symbol}?timeframe=${timeframe}&start=${startDate}&end=${endDate}`
    );
    
    if (response.data.success && response.data.data) {
      return response.data.data;
    }
    
    throw new Error(response.data.error?.message || 'Failed to get historical data');
  }

  async searchSymbols(query: string): Promise<string[]> {
    const response = await this.client.get<ApiResponse<string[]>>(
      `/api/market-data/search?q=${encodeURIComponent(query)}`
    );
    
    if (response.data.success && response.data.data) {
      return response.data.data;
    }
    
    throw new Error(response.data.error?.message || 'Failed to search symbols');
  }

  // WebSocket Connection
  connectWebSocket(): WebSocket {
    const wsUrl = API_BASE_URL.replace('http', 'ws') + '/ws';
    const ws = new WebSocket(wsUrl);
    
    ws.onopen = () => {
      console.log('WebSocket connected');
      // Send authentication if token exists
      if (this.token) {
        ws.send(JSON.stringify({
          type: 'auth',
          token: this.token
        }));
      }
    };
    
    ws.onclose = () => {
      console.log('WebSocket disconnected');
    };
    
    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
    
    return ws;
  }

  // Health Check
  async healthCheck(): Promise<{ status: string; timestamp: string }> {
    const response = await this.client.get('/health');
    return response.data;
  }
}

// Create singleton instance
export const apiClient = new ApiClient();

// Export types and client
export default apiClient;