import { Router, Request, Response } from 'express';
import { InstrumentService } from '../services/InstrumentService';
import { RedisService } from '../services/RedisService';
import { createLogger } from '@tradeflow/zerodha-utils';

const logger = createLogger('InstrumentRoutes');
const router = Router();

// Initialize services (these will be injected in the main app)
let instrumentService: InstrumentService;
let redisService: RedisService;

// Middleware to inject services
router.use((req: any, res, next) => {
  if (!instrumentService) {
    instrumentService = req.app.locals.instrumentService;
    redisService = req.app.locals.redisService;
  }
  next();
});

/**
 * GET /api/zerodha/market/instruments
 * Get all instruments or filter by exchange
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const { exchange, type, segment, limit } = req.query;
    
    if (!instrumentService.isReady()) {
      return res.status(503).json({
        success: false,
        error: 'Instrument service not ready. Please try again later.',
      });
    }

    let instruments = instrumentService.getAllInstruments(exchange as string);

    // Apply filters
    if (type) {
      instruments = instruments.filter(inst => inst.instrument_type === type);
    }

    if (segment) {
      instruments = instruments.filter(inst => inst.segment === segment);
    }

    // Apply limit
    if (limit) {
      const limitNum = parseInt(limit as string);
      if (!isNaN(limitNum) && limitNum > 0) {
        instruments = instruments.slice(0, limitNum);
      }
    }

    res.json({
      success: true,
      data: instruments,
      count: instruments.length,
    });
  } catch (error) {
    logger.error('Error fetching instruments:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch instruments',
    });
  }
});

/**
 * GET /api/zerodha/market/instruments/search
 * Search instruments by symbol or name
 */
router.get('/search', async (req: Request, res: Response) => {
  try {
    const { q, exchange, limit } = req.query;

    if (!q || typeof q !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Query parameter "q" is required',
      });
    }

    if (!instrumentService.isReady()) {
      return res.status(503).json({
        success: false,
        error: 'Instrument service not ready. Please try again later.',
      });
    }

    const limitNum = limit ? parseInt(limit as string) : 50;
    const results = await instrumentService.searchInstruments(
      q,
      exchange as string,
      limitNum
    );

    res.json({
      success: true,
      data: results,
      count: results.length,
      query: q,
    });
  } catch (error) {
    logger.error('Error searching instruments:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to search instruments',
    });
  }
});

/**
 * GET /api/zerodha/market/instruments/:token
 * Get instrument by token
 */
router.get('/:token', async (req: Request, res: Response) => {
  try {
    const { token } = req.params;
    const instrumentToken = parseInt(token);

    if (isNaN(instrumentToken)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid instrument token',
      });
    }

    if (!instrumentService.isReady()) {
      return res.status(503).json({
        success: false,
        error: 'Instrument service not ready. Please try again later.',
      });
    }

    const instrument = instrumentService.getInstrumentByToken(instrumentToken);

    if (!instrument) {
      return res.status(404).json({
        success: false,
        error: 'Instrument not found',
      });
    }

    res.json({
      success: true,
      data: instrument,
    });
  } catch (error) {
    logger.error('Error fetching instrument by token:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch instrument',
    });
  }
});

/**
 * GET /api/zerodha/market/instruments/:exchange/:symbol
 * Get instrument by exchange and symbol
 */
router.get('/:exchange/:symbol', async (req: Request, res: Response) => {
  try {
    const { exchange, symbol } = req.params;

    if (!instrumentService.isReady()) {
      return res.status(503).json({
        success: false,
        error: 'Instrument service not ready. Please try again later.',
      });
    }

    const instrument = instrumentService.getInstrumentBySymbol(
      exchange.toUpperCase(),
      symbol.toUpperCase()
    );

    if (!instrument) {
      return res.status(404).json({
        success: false,
        error: 'Instrument not found',
      });
    }

    res.json({
      success: true,
      data: instrument,
    });
  } catch (error) {
    logger.error('Error fetching instrument by exchange and symbol:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch instrument',
    });
  }
});

/**
 * POST /api/zerodha/market/instruments/refresh
 * Refresh instrument data
 */
router.post('/refresh', async (req: Request, res: Response) => {
  try {
    const { exchange } = req.body;

    logger.info(`Refreshing instruments for ${exchange || 'all exchanges'}`);
    await instrumentService.refreshInstruments(exchange);

    res.json({
      success: true,
      message: `Instruments refreshed for ${exchange || 'all exchanges'}`,
    });
  } catch (error) {
    logger.error('Error refreshing instruments:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to refresh instruments',
    });
  }
});

/**
 * GET /api/zerodha/market/instruments/stats
 * Get instrument statistics
 */
router.get('/stats', async (req: Request, res: Response) => {
  try {
    if (!instrumentService.isReady()) {
      return res.status(503).json({
        success: false,
        error: 'Instrument service not ready. Please try again later.',
      });
    }

    const stats = instrumentService.getStats();

    res.json({
      success: true,
      data: {
        exchanges: stats,
        total: Object.values(stats).reduce((sum, count) => sum + count, 0),
        ready: instrumentService.isReady(),
      },
    });
  } catch (error) {
    logger.error('Error fetching instrument stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch instrument stats',
    });
  }
});

export { router as instrumentRoutes };