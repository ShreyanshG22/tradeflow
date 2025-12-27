// Shared TypeScript types for TradeFlow services

export interface User {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Strategy {
  id: string;
  userId: string;
  name: string;
  description?: string;
  config: StrategyConfig;
  version: number;
  isActive: boolean;
  isTemplate?: boolean;
  tags?: string[];
  parentStrategyId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface StrategyConfig {
  nodes: StrategyNode[];
  connections: StrategyConnection[];
  parameters: StrategyParameters;
}

export interface StrategyNode {
  id: string;
  type: 'entry' | 'exit' | 'indicator' | 'operator' | 'position-size';
  config: Record<string, any>;
  position: { x: number; y: number };
}

export interface StrategyConnection {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
}

export interface StrategyParameters {
  timeframe: string;
  positionSizing: PositionSizingConfig;
  riskManagement: RiskConfig;
}

export interface PositionSizingConfig {
  method: 'fixed' | 'percentage' | 'kelly' | 'volatility';
  value: number;
  maxPosition: number;
}

export interface RiskConfig {
  maxDrawdown: number;
  dailyLossLimit: number;
  positionLimit: number;
  correlationLimit: number;
}

export interface Portfolio {
  id: string;
  userId: string;
  name: string;
  cashBalance: number;
  totalValue: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface Position {
  id: string;
  portfolioId: string;
  symbol: string;
  quantity: number;
  avgPrice: number;
  currentPrice: number;
  unrealizedPnL: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface Trade {
  id: string;
  portfolioId: string;
  strategyId?: string;
  symbol: string;
  side: 'buy' | 'sell';
  quantity: number;
  price: number;
  fees: number;
  status: 'pending' | 'filled' | 'cancelled';
  timestamp: Date;
}

export interface MarketData {
  symbol: string;
  timestamp: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  timeframe: string;
}

export interface RealTimeQuote {
  symbol: string;
  price: number;
  bid: number;
  ask: number;
  volume: number;
  timestamp: Date;
}

export interface BacktestRequest {
  strategyId: string;
  symbol: string;
  startDate: Date;
  endDate: Date;
  initialCapital: number;
  parameters?: Record<string, any>;
}

export interface BacktestResult {
  id: string;
  strategyId: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress: number;
  results?: BacktestMetrics;
  createdAt: Date;
  completedAt?: Date;
}

export interface BacktestMetrics {
  totalReturn: number;
  annualizedReturn: number;
  sharpeRatio: number;
  sortinoRatio: number;
  maxDrawdown: number;
  winRate: number;
  profitFactor: number;
  totalTrades: number;
  avgTrade: number;
  equity: EquityPoint[];
  trades: Trade[];
}

export interface EquityPoint {
  timestamp: Date;
  value: number;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: Record<string, any>;
  };
  timestamp: Date;
  requestId: string;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
}

export interface WebSocketMessage {
  type: string;
  payload: any;
  timestamp: Date;
}

export interface PerformanceMetrics {
  latency: {
    avg: number;
    p50: number;
    p95: number;
    p99: number;
  };
  throughput: {
    requestsPerSecond: number;
    messagesPerSecond: number;
  };
  system: {
    cpuUsage: number;
    memoryUsage: number;
    diskUsage: number;
  };
}

// Zerodha Integration Types
export * from './zerodha';
export * from './zerodha-constants';
export * from './zerodha-config';