import { Router, Request, Response } from 'express';
import { HistoricalDataService } from '../services/HistoricalDataService';
import { InstrumentService } from '../services/InstrumentService';
import { RedisService } from '../services/RedisService';
import { ZerodhaAPIClient } from '@tradeflow/zerodha-utils';
import { createLogger } from '@tradeflow/zerodha-utils';

const logger = createLogger('HistoricalDataRoutes');
const router = Router();

// Services will be injected via middleware
let historicalDataService: HistoricalDataService;
let instrumentService: InstrumentService;
let redisService: RedisService;
let apiClient: ZerodhaAPIClient;

// Middleware to inject services
router.use((req: any, res, next) => {
  if (!historicalDataService) {
    instrumentService = req.app.locals.instrumentService;
    redisService = req.app.locals.redisService;
    apiClient = req.app.locals.apiClient;
    
    if (apiClient) {
      historicalDataService = new HistoricalDataService(apiClient, redisService, instrumentService);
    }
  }
  next();
});

/**
 * GET /api/zerodha/market/historical/:instrument_token
 * Get historical OHLCV data for an instrument
 */
router.get('/:instrument_token', async (req: Request, res: Response) => {
  try {
    const { instrument_token } = req.params;
    const { interval, from_date, to_date, continuous, oi } = req.query;

    // Validate required parameters
    if (!interval || !from_date || !to_date) {
      return res.status(400).json({
        success: false,
        error: 'interval, from_date, and to_date are required',
      });
    }

    const instrumentToken = parseInt(instrument_token);
    if (isNaN(instrumentToken)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid instrument token',
      });
    }

    if (!historicalDataService) {
      return res.status(503).json({
        success: false,
        error: 'Historical data service not available',
      });
    }

    const request = {
      instrument_token: instrumentToken,
      interval: interval as string,
      from_date: from_date as string,
      to_date: to_date as string,
      continuous: continuous === 'true',
      oi: oi === 'true',
    };

    const response = await historicalDataService.getHistoricalData(request as any);

    res.json({
      success: true,
      data: response,
    });
  } catch (error) {
    logger.error('Error fetching historical data:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch historical data',
    });
  }
});

/**
 * GET /api/zerodha/market/historical/:instrument_token/ohlc
 * Get OHLC data for an instrument
 */
router.get('/:instrument_token/ohlc', async (req: Request, res: Response) => {
  try {
    const { instrument_token } = req.params;
    const { interval, from_date, to_date } = req.query;

    if (!interval || !from_date || !to_date) {
      return res.status(400).json({
        success: false,
        error: 'interval, from_date, and to_date are required',
      });
    }

    const instrumentToken = parseInt(instrument_token);
    if (isNaN(instrumentToken)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid instrument token',
      });
    }

    if (!historicalDataService) {
      return res.status(503).json({
        success: false,
        error: 'Historical data service not available',
      });
    }

    const data = await historicalDataService.getOHLCData(
      instrumentToken,
      interval as string,
      from_date as string,
      to_date as string
    );

    res.json({
      success: true,
      data,
      count: data.length,
    });
  } catch (error) {
    logger.error('Error fetching OHLC data:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch OHLC data',
    });
  }
});

/**
 * GET /api/zerodha/market/historical/:instrument_token/latest
 * Get latest candles for an instrument
 */
router.get('/:instrument_token/latest', async (req: Request, res: Response) => {
  try {
    const { instrument_token } = req.params;
    const { interval, count = '100' } = req.query;

    if (!interval) {
      return res.status(400).json({
        success: false,
        error: 'interval is required',
      });
    }

    const instrumentToken = parseInt(instrument_token);
    const candleCount = parseInt(count as string);

    if (isNaN(instrumentToken)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid instrument token',
      });
    }

    if (isNaN(candleCount) || candleCount <= 0 || candleCount > 2000) {
      return res.status(400).json({
        success: false,
        error: 'count must be between 1 and 2000',
      });
    }

    if (!historicalDataService) {
      return res.status(503).json({
        success: false,
        error: 'Historical data service not available',
      });
    }

    const data = await historicalDataService.getLatestCandles(
      instrumentToken,
      interval as string,
      candleCount
    );

    res.json({
      success: true,
      data,
      count: data.length,
    });
  } catch (error) {
    logger.error('Error fetching latest candles:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch latest candles',
    });
  }
});

/**
 * POST /api/zerodha/market/historical/bulk
 * Get historical data for multiple instruments
 */
router.post('/bulk', async (req: Request, res: Response) => {
  try {
    const { requests } = req.body;

    if (!requests || !Array.isArray(requests)) {
      return res.status(400).json({
        success: false,
        error: 'requests array is required',
      });
    }

    if (requests.length === 0 || requests.length > 50) {
      return res.status(400).json({
        success: false,
        error: 'requests array must contain 1-50 items',
      });
    }

    if (!historicalDataService) {
      return res.status(503).json({
        success: false,
        error: 'Historical data service not available',
      });
    }

    // Validate each request
    for (const request of requests) {
      if (!request.instrument_token || !request.interval || !request.from_date || !request.to_date) {
        return res.status(400).json({
          success: false,
          error: 'Each request must have instrument_token, interval, from_date, and to_date',
        });
      }
    }

    const responses = await historicalDataService.getBulkHistoricalData(requests);

    res.json({
      success: true,
      data: responses,
      count: responses.length,
    });
  } catch (error) {
    logger.error('Error fetching bulk historical data:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch bulk historical data',
    });
  }
});

/**
 * DELETE /api/zerodha/market/historical/cache
 * Clear historical data cache
 */
router.delete('/cache', async (req: Request, res: Response) => {
  try {
    const { instrument_token, interval } = req.query;

    if (!historicalDataService) {
      return res.status(503).json({
        success: false,
        error: 'Historical data service not available',
      });
    }

    const instrumentToken = instrument_token ? parseInt(instrument_token as string) : undefined;
    
    if (instrument_token && isNaN(instrumentToken!)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid instrument token',
      });
    }

    await historicalDataService.clearCache(instrumentToken, interval as string);

    res.json({
      success: true,
      message: 'Cache cleared successfully',
    });
  } catch (error) {
    logger.error('Error clearing cache:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to clear cache',
    });
  }
});

/**
 * GET /api/zerodha/market/historical/stats
 * Get historical data service statistics
 */
router.get('/stats', async (req: Request, res: Response) => {
  try {
    if (!historicalDataService) {
      return res.status(503).json({
        success: false,
        error: 'Historical data service not available',
      });
    }

    const stats = historicalDataService.getStats();

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    logger.error('Error fetching historical data stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch historical data stats',
    });
  }
});

export { router as historicalDataRoutes };