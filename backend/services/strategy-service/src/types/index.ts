// Local types for strategy service

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