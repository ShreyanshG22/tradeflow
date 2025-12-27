import { Router, Request, Response } from 'express';
import { MarketStatusService } from '../services/MarketStatusService';
import { RedisService } from '../services/RedisService';
import { ZerodhaAPIClient } from '@tradeflow/zerodha-utils';
import { createLogger } from '@tradeflow/zerodha-utils';

const logger = createLogger('MarketStatusRoutes');
const router = Router();

// Services will be injected via middleware
let marketStatusService: MarketStatusService;
let redisService: RedisService;
let apiClient: ZerodhaAPIClient;

// Middleware to inject services
router.use((req: any, res, next) => {
  if (!marketStatusService) {
    redisService = req.app.locals.redisService;
    apiClient = req.app.locals.apiClient;
    
    if (apiClient) {
      marketStatusService = new MarketStatusService(apiClient, redisService);
    }
  }
  next();
});

/**
 * GET /api/zerodha/market/status
 * Get market status for NSE/BSE
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const { exchange } = req.query;

    if (!marketStatusService) {
      return res.status(503).json({
        success: false,
        error: 'Market status service not available',
      });
    }

    if (exchange && !['NSE', 'BSE'].includes(exchange as string)) {
      return res.status(400).json({
        success: false,
        error: 'exchange must be NSE or BSE',
      });
    }

    const status = await marketStatusService.getMarketStatus(exchange as 'NSE' | 'BSE');

    res.json({
      success: true,
      data: status,
    });
  } catch (error) {
    logger.error('Error fetching market status:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch market status',
    });
  }
});

/**
 * GET /api/zerodha/market/status/indices
 * Get major indices data (Nifty, Sensex)
 */
router.get('/indices', async (req: Request, res: Response) => {
  try {
    if (!marketStatusService) {
      return res.status(503).json({
        success: false,
        error: 'Market status service not available',
      });
    }

    const indices = await marketStatusService.getIndicesData();

    res.json({
      success: true,
      data: indices,
      count: indices.length,
    });
  } catch (error) {
    logger.error('Error fetching indices data:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch indices data',
    });
  }
});

/**
 * GET /api/zerodha/market/status/indices/:symbol
 * Get specific index data
 */
router.get('/indices/:symbol', async (req: Request, res: Response) => {
  try {
    const { symbol } = req.params;

    if (!marketStatusService) {
      return res.status(503).json({
        success: false,
        error: 'Market status service not available',
      });
    }

    const indexData = await marketStatusService.getIndexData(symbol.toUpperCase());

    if (!indexData) {
      return res.status(404).json({
        success: false,
        error: `Index ${symbol} not found`,
      });
    }

    res.json({
      success: true,
      data: indexData,
    });
  } catch (error) {
    logger.error('Error fetching index data:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch index data',
    });
  }
});

/**
 * GET /api/zerodha/market/status/holidays
 * Get market holidays
 */
router.get('/holidays', async (req: Request, res: Response) => {
  try {
    const { year } = req.query;

    if (!marketStatusService) {
      return res.status(503).json({
        success: false,
        error: 'Market status service not available',
      });
    }

    const targetYear = year ? parseInt(year as string) : undefined;
    
    if (year && (isNaN(targetYear!) || targetYear! < 2020 || targetYear! > 2030)) {
      return res.status(400).json({
        success: false,
        error: 'year must be between 2020 and 2030',
      });
    }

    const holidays = marketStatusService.getMarketHolidays(targetYear);

    res.json({
      success: true,
      data: holidays,
      count: holidays.length,
      year: targetYear || new Date().getFullYear(),
    });
  } catch (error) {
    logger.error('Error fetching market holidays:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch market holidays',
    });
  }
});

/**
 * GET /api/zerodha/market/status/check
 * Check if market is currently open
 */
router.get('/check', async (req: Request, res: Response) => {
  try {
    const { exchange } = req.query;

    if (!marketStatusService) {
      return res.status(503).json({
        success: false,
        error: 'Market status service not available',
      });
    }

    if (exchange && !['NSE', 'BSE'].includes(exchange as string)) {
      return res.status(400).json({
        success: false,
        error: 'exchange must be NSE or BSE',
      });
    }

    const targetExchange = (exchange as 'NSE' | 'BSE') || 'NSE';
    
    const isOpen = marketStatusService.isMarketOpen(targetExchange);
    const isPreOpen = marketStatusService.isPreMarketOpen(targetExchange);
    const nextOpen = marketStatusService.getNextMarketOpen(targetExchange);

    res.json({
      success: true,
      data: {
        exchange: targetExchange,
        is_open: isOpen,
        is_pre_open: isPreOpen,
        next_open: nextOpen.toISOString(),
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    logger.error('Error checking market status:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to check market status',
    });
  }
});

/**
 * GET /api/zerodha/market/status/stats
 * Get market status service statistics
 */
router.get('/stats', async (req: Request, res: Response) => {
  try {
    if (!marketStatusService) {
      return res.status(503).json({
        success: false,
        error: 'Market status service not available',
      });
    }

    const stats = marketStatusService.getStats();

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    logger.error('Error fetching market status stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch market status stats',
    });
  }
});

export { router as marketStatusRoutes };