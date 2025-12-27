export interface Portfolio {
  id: string;
  userId: string;
  name: string;
  description?: string;
  portfolioType: 'trading' | 'paper' | 'backtest';
  baseCurrency: string;
  initialCash: number;
  cashBalance: number;
  totalValue: number;
  unrealizedPnl: number;
  realizedPnl: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Position {
  id: string;
  portfolioId: string;
  symbol: string;
  quantity: number;
  avgPrice: number;
  currentPrice?: number;
  marketValue?: number;
  unrealizedPnl: number;
  realizedPnl: number;
  side: 'long' | 'short';
  openedAt: Date;
  updatedAt: Date;
}

export interface Trade {
  id: string;
  portfolioId: string;
  strategyId?: string;
  positionId?: string;
  symbol: string;
  side: 'buy' | 'sell';
  quantity: number;
  price: number;
  totalAmount: number;
  fees: number;
  commission: number;
  tradeType: 'market' | 'limit' | 'stop' | 'stop_limit';
  status: 'pending' | 'filled' | 'cancelled' | 'rejected' | 'partial';
  orderId?: string;
  brokerTradeId?: string;
  executedAt?: Date;
  createdAt: Date;
}

export interface PerformanceMetrics {
  id: string;
  portfolioId: string;
  periodStart: Date;
  periodEnd: Date;
  totalReturn?: number;
  annualizedReturn?: number;
  volatility?: number;
  sharpeRatio?: number;
  sortinoRatio?: number;
  maxDrawdown?: number;
  winRate?: number;
  profitFactor?: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  avgWin?: number;
  avgLoss?: number;
  largestWin?: number;
  largestLoss?: number;
  calculatedAt: Date;
}

export interface CurrencyRate {
  fromCurrency: string;
  toCurrency: string;
  rate: number;
  timestamp: Date;
}

export interface MarketPrice {
  symbol: string;
  price: number;
  bid?: number;
  ask?: number;
  timestamp: Date;
}

export interface PortfolioValuation {
  portfolioId: string;
  totalValue: number;
  cashBalance: number;
  positionsValue: number;
  unrealizedPnl: number;
  realizedPnl: number;
  dayChange: number;
  dayChangePercent: number;
  positions: PositionValuation[];
  timestamp: Date;
}

export interface PositionValuation {
  positionId: string;
  symbol: string;
  quantity: number;
  avgPrice: number;
  currentPrice: number;
  marketValue: number;
  unrealizedPnl: number;
  unrealizedPnlPercent: number;
  dayChange: number;
  dayChangePercent: number;
}

export interface PortfolioSummary {
  portfolio: Portfolio;
  valuation: PortfolioValuation;
  metrics: PerformanceMetrics;
  recentTrades: Trade[];
}

export interface CreatePortfolioRequest {
  name: string;
  description?: string;
  portfolioType: 'trading' | 'paper' | 'backtest';
  baseCurrency?: string;
  initialCash: number;
}

export interface UpdatePortfolioRequest {
  name?: string;
  description?: string;
  isActive?: boolean;
}

export interface PortfolioFilter {
  userId: string;
  portfolioType?: 'trading' | 'paper' | 'backtest';
  isActive?: boolean;
  limit?: number;
  offset?: number;
}

export interface PositionFilter {
  portfolioId: string;
  symbol?: string;
  side?: 'long' | 'short';
  minQuantity?: number;
  limit?: number;
  offset?: number;
}

export interface TradeFilter {
  portfolioId: string;
  strategyId?: string;
  symbol?: string;
  side?: 'buy' | 'sell';
  status?: 'pending' | 'filled' | 'cancelled' | 'rejected' | 'partial';
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}