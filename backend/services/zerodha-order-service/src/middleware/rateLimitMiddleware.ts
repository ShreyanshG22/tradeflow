import { Request, Response, NextFunction } from 'express';
import { RedisService } from '../services/RedisService';
import { ZERODHA_CONSTANTS } from '@tradeflow/types';
import { logger } from '../utils/logger';

const redisService = new RedisService();

export const rateLimitMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?.id;
    
    if (!userId) {
      // If no user ID, skip rate limiting (auth middleware should handle this)
      next();
      return;
    }

    // Different rate limits for different operations
    const rateLimits = {
      orders: {
        windowMs: 60 * 1000, // 1 minute
        maxRequests: ZERODHA_CONSTANTS.RATE_LIMITS.ORDERS_PER_SECOND * 60 // 10 per second = 600 per minute
      },
      general: {
        windowMs: 60 * 1000, // 1 minute
        maxRequests: 100 // General API calls
      }
    };

    // Determine rate limit type based on route
    const isOrderOperation = req.method === 'POST' || req.method === 'PUT' || req.method === 'DELETE';
    const limit = isOrderOperation ? rateLimits.orders : rateLimits.general;

    // Create rate limit key
    const rateLimitKey = `rate_limit:${userId}:${isOrderOperation ? 'orders' : 'general'}`;
    
    // Get current count
    const currentCount = await redisService.get(rateLimitKey);
    const count = currentCount ? parseInt(currentCount) : 0;

    if (count >= limit.maxRequests) {
      logger.warn(`Rate limit exceeded for user ${userId}:`, {
        operation: isOrderOperation ? 'orders' : 'general',
        count,
        limit: limit.maxRequests
      });

      res.status(429).json({
        success: false,
        error: 'Rate limit exceeded',
        retryAfter: Math.ceil(limit.windowMs / 1000),
        details: {
          limit: limit.maxRequests,
          windowMs: limit.windowMs,
          current: count
        }
      });
      return;
    }

    // Increment counter
    if (count === 0) {
      // First request in window, set with expiry
      await redisService.set(rateLimitKey, '1', Math.ceil(limit.windowMs / 1000));
    } else {
      // Increment existing counter
      await redisService.incr(rateLimitKey);
    }

    // Add rate limit headers
    res.setHeader('X-RateLimit-Limit', limit.maxRequests);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, limit.maxRequests - count - 1));
    res.setHeader('X-RateLimit-Reset', Date.now() + limit.windowMs);

    next();

  } catch (error) {
    logger.error('Rate limit middleware error:', error);
    // Don't block request on rate limit errors, just log and continue
    next();
  }
};

export const createCustomRateLimit = (
  maxRequests: number,
  windowMs: number,
  keyGenerator?: (req: Request) => string
) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const key = keyGenerator ? keyGenerator(req) : `rate_limit:${req.user?.id || req.ip}:custom`;
      
      const currentCount = await redisService.get(key);
      const count = currentCount ? parseInt(currentCount) : 0;

      if (count >= maxRequests) {
        res.status(429).json({
          success: false,
          error: 'Rate limit exceeded',
          retryAfter: Math.ceil(windowMs / 1000)
        });
        return;
      }

      if (count === 0) {
        await redisService.set(key, '1', Math.ceil(windowMs / 1000));
      } else {
        await redisService.incr(key);
      }

      res.setHeader('X-RateLimit-Limit', maxRequests);
      res.setHeader('X-RateLimit-Remaining', Math.max(0, maxRequests - count - 1));
      res.setHeader('X-RateLimit-Reset', Date.now() + windowMs);

      next();

    } catch (error) {
      logger.error('Custom rate limit error:', error);
      next();
    }
  };
};

// Specific rate limiters for different operations
export const orderPlacementRateLimit = createCustomRateLimit(
  10, // 10 orders per minute
  60 * 1000,
  (req) => `rate_limit:${req.user?.id}:order_placement`
);

export const orderModificationRateLimit = createCustomRateLimit(
  20, // 20 modifications per minute
  60 * 1000,
  (req) => `rate_limit:${req.user?.id}:order_modification`
);

export const batchOperationRateLimit = createCustomRateLimit(
  5, // 5 batch operations per minute
  60 * 1000,
  (req) => `rate_limit:${req.user?.id}:batch_operation`
);