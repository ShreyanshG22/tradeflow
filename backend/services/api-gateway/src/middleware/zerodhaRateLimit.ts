import rateLimit from 'express-rate-limit';
import { Request, Response } from 'express';
import { logger } from '../utils/logger';

// Zerodha API has specific rate limits
// Market data: 3 requests per second
// Orders: 10 requests per second
// Other APIs: 10 requests per second

export const zerodhaMarketDataRateLimit = rateLimit({
  windowMs: 1000, // 1 second
  max: 3, // 3 requests per second
  message: {
    error: 'Too many market data requests. Zerodha allows maximum 3 requests per second.',
    code: 'ZERODHA_MARKET_RATE_LIMIT_EXCEEDED'
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => {
    // Rate limit per user for authenticated requests
    const userId = (req as any).user?.id;
    return userId ? `zerodha_market_${userId}` : req.ip;
  },
  onLimitReached: (req: Request, res: Response) => {
    logger.warn('Zerodha market data rate limit exceeded', {
      ip: req.ip,
      userId: (req as any).user?.id,
      path: req.path,
      method: req.method
    });
  }
});

export const zerodhaOrderRateLimit = rateLimit({
  windowMs: 1000, // 1 second
  max: 10, // 10 requests per second
  message: {
    error: 'Too many order requests. Zerodha allows maximum 10 requests per second.',
    code: 'ZERODHA_ORDER_RATE_LIMIT_EXCEEDED'
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => {
    const userId = (req as any).user?.id;
    return userId ? `zerodha_order_${userId}` : req.ip;
  },
  onLimitReached: (req: Request, res: Response) => {
    logger.warn('Zerodha order rate limit exceeded', {
      ip: req.ip,
      userId: (req as any).user?.id,
      path: req.path,
      method: req.method
    });
  }
});

export const zerodhaGeneralRateLimit = rateLimit({
  windowMs: 1000, // 1 second
  max: 10, // 10 requests per second
  message: {
    error: 'Too many API requests. Zerodha allows maximum 10 requests per second.',
    code: 'ZERODHA_GENERAL_RATE_LIMIT_EXCEEDED'
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => {
    const userId = (req as any).user?.id;
    return userId ? `zerodha_general_${userId}` : req.ip;
  },
  onLimitReached: (req: Request, res: Response) => {
    logger.warn('Zerodha general rate limit exceeded', {
      ip: req.ip,
      userId: (req as any).user?.id,
      path: req.path,
      method: req.method
    });
  }
});

// Daily rate limits for certain operations
export const zerodhaDailyRateLimit = rateLimit({
  windowMs: 24 * 60 * 60 * 1000, // 24 hours
  max: 1000, // 1000 requests per day
  message: {
    error: 'Daily API limit exceeded. Please try again tomorrow.',
    code: 'ZERODHA_DAILY_RATE_LIMIT_EXCEEDED'
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => {
    const userId = (req as any).user?.id;
    return userId ? `zerodha_daily_${userId}` : req.ip;
  },
  onLimitReached: (req: Request, res: Response) => {
    logger.warn('Zerodha daily rate limit exceeded', {
      ip: req.ip,
      userId: (req as any).user?.id,
      path: req.path,
      method: req.method
    });
  }
});