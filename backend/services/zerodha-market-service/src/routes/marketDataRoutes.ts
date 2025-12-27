import { Router, Request, Response } from 'express';
import { MarketDataService } from '../services/MarketDataService';
import { InstrumentService } from '../services/InstrumentService';
import { RedisService } from '../services/RedisService';
import { createLogger } from '@tradeflow/zerodha-utils';

const logger = createLogger('MarketDataRoutes');
const router = Router();

// Services will be injected via middleware
let marketDataService: MarketDataService;
let instrumentService: InstrumentService;
let redisService: RedisService;

// Middleware to inject services
router.use((req: any, res, next) => {
  if (!marketDataService) {
    marketDataService = req.app.locals.marketDataService;
    instrumentService = req.app.locals.instrumentService;
    redisService = req.app.locals.redisService;
  }
  next();
});

/**
 * GET /api/zerodha/market/data/quotes
 * Get real-time quotes for instruments
 */
router.get('/quotes', async (req: Request, res: Response) => {
  try {
    const { instruments } = req.query;

    if (!instruments || typeof instruments !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'instruments parameter is required (format: "NSE:RELIANCE,BSE:SENSEX")',
      });
    }

    if (!marketDataService) {
      return res.status(503).json({
        success: false,
        error: 'Market data service not available',
      });
    }

    // Parse instruments parameter
    const instrumentRequests = instruments.split(',').map(inst => {
      const [exchange, tradingsymbol] = inst.trim().split(':');
      return { exchange: exchange?.toUpperCase(), tradingsymbol: tradingsymbol?.toUpperCase() };
    }).filter(req => req.exchange && req.tradingsymbol);

    if (instrumentRequests.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No valid instruments provided',
      });
    }

    const quotes = await marketDataService.getQuotes(instrumentRequests);

    res.json({
      success: true,
      data: quotes,
      count: Object.keys(quotes).length,
    });
  } catch (error) {
    logger.error('Error fetching quotes:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch quotes',
    });
  }
});

/**
 * POST /api/zerodha/market/data/subscribe
 * Subscribe to real-time market data
 */
router.post('/subscribe', async (req: Request, res: Response) => {
  try {
    const { user_id, instrument_tokens, mode = 'ltp' } = req.body;

    if (!user_id) {
      return res.status(400).json({
        success: false,
        error: 'user_id is required',
      });
    }

    if (!instrument_tokens || !Array.isArray(instrument_tokens)) {
      return res.status(400).json({
        success: false,
        error: 'instrument_tokens array is required',
      });
    }

    if (!['ltp', 'quote', 'full'].includes(mode)) {
      return res.status(400).json({
        success: false,
        error: 'mode must be one of: ltp, quote, full',
      });
    }

    if (!marketDataService) {
      return res.status(503).json({
        success: false,
        error: 'Market data service not available',
      });
    }

    // Convert string tokens to numbers
    const tokens = instrument_tokens.map(token => {
      const num = parseInt(token);
      if (isNaN(num)) {
        throw new Error(`Invalid instrument token: ${token}`);
      }
      return num;
    });

    await marketDataService.subscribe(user_id, tokens, mode);

    res.json({
      success: true,
      message: `Subscribed to ${tokens.length} instruments in ${mode} mode`,
      data: {
        user_id,
        instrument_tokens: tokens,
        mode,
      },
    });
  } catch (error) {
    logger.error('Error subscribing to market data:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to subscribe to market data',
    });
  }
});

/**
 * DELETE /api/zerodha/market/data/unsubscribe
 * Unsubscribe from real-time market data
 */
router.delete('/unsubscribe', async (req: Request, res: Response) => {
  try {
    const { user_id, instrument_tokens } = req.body;

    if (!user_id) {
      return res.status(400).json({
        success: false,
        error: 'user_id is required',
      });
    }

    if (!marketDataService) {
      return res.status(503).json({
        success: false,
        error: 'Market data service not available',
      });
    }

    let tokens: number[] | undefined;
    if (instrument_tokens) {
      if (!Array.isArray(instrument_tokens)) {
        return res.status(400).json({
          success: false,
          error: 'instrument_tokens must be an array',
        });
      }

      tokens = instrument_tokens.map(token => {
        const num = parseInt(token);
        if (isNaN(num)) {
          throw new Error(`Invalid instrument token: ${token}`);
        }
        return num;
      });
    }

    await marketDataService.unsubscribe(user_id, tokens);

    res.json({
      success: true,
      message: tokens 
        ? `Unsubscribed from ${tokens.length} instruments`
        : 'Unsubscribed from all instruments',
      data: {
        user_id,
        instrument_tokens: tokens,
      },
    });
  } catch (error) {
    logger.error('Error unsubscribing from market data:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to unsubscribe from market data',
    });
  }
});

/**
 * GET /api/zerodha/market/data/tick/:instrument_token
 * Get latest tick for an instrument
 */
router.get('/tick/:instrument_token', async (req: Request, res: Response) => {
  try {
    const { instrument_token } = req.params;
    const token = parseInt(instrument_token);

    if (isNaN(token)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid instrument token',
      });
    }

    if (!marketDataService) {
      return res.status(503).json({
        success: false,
        error: 'Market data service not available',
      });
    }

    const tick = marketDataService.getLatestTick(token);

    if (!tick) {
      return res.status(404).json({
        success: false,
        error: 'No tick data available for this instrument',
      });
    }

    res.json({
      success: true,
      data: tick,
    });
  } catch (error) {
    logger.error('Error fetching latest tick:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch latest tick',
    });
  }
});

/**
 * GET /api/zerodha/market/data/stats
 * Get market data service statistics
 */
router.get('/stats', async (req: Request, res: Response) => {
  try {
    if (!marketDataService) {
      return res.status(503).json({
        success: false,
        error: 'Market data service not available',
      });
    }

    const stats = marketDataService.getStats();

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    logger.error('Error fetching market data stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch market data stats',
    });
  }
});

export { router as marketDataRoutes };