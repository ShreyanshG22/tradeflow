/**
 * Zerodha Components Index
 * Exports all Zerodha-related UI components
 */

// Authentication Components
export { ZerodhaLoginButton } from './ZerodhaLoginButton';
export { ZerodhaAuthStatus } from './ZerodhaAuthStatus';
export { ZerodhaSessionManager } from './ZerodhaSessionManager';

// Market Data Components
export { ZerodhaPriceWidget } from './ZerodhaPriceWidget';
export { ZerodhaMarketDepth } from './ZerodhaMarketDepth';
export { ZerodhaHistoricalChart } from './ZerodhaHistoricalChart';

// Trading Components
export { ZerodhaOrderForm } from './ZerodhaOrderForm';
export { ZerodhaOrderBook } from './ZerodhaOrderBook';
export { ZerodhaTradeHistory } from './ZerodhaTradeHistory';

// Portfolio Components
export { ZerodhaPositions } from './ZerodhaPositions';
export { ZerodhaHoldings } from './ZerodhaHoldings';
export { ZerodhaPortfolioSummary } from './ZerodhaPortfolioSummary';

// Re-export the hook for convenience
export { useZerodhaAuth, ZerodhaAuthProvider } from '../../hooks/useZerodhaAuth';

// Export types
export type { 
  ZerodhaAuthResponse, 
  ZerodhaUserProfile,
  ZerodhaLoginRequest,
  ZerodhaCallbackRequest
} from '../../hooks/useZerodhaAuth';

export type {
  ZerodhaQuote
} from './ZerodhaPriceWidget';

export type {
  MarketDepthItem,
  MarketDepthData
} from './ZerodhaMarketDepth';

export type {
  ZerodhaHistoricalData
} from './ZerodhaHistoricalChart';

export type {
  ZerodhaOrderRequest
} from './ZerodhaOrderForm';

export type {
  ZerodhaOrder
} from './ZerodhaOrderBook';

export type {
  ZerodhaTrade
} from './ZerodhaTradeHistory';

export type {
  ZerodhaPosition
} from './ZerodhaPositions';

export type {
  ZerodhaHolding
} from './ZerodhaHoldings';

