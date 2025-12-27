import { Router, Request, Response } from 'express';
import marketDataService from '../services/marketDataService';
import { HistoricalDataRequest } from '../types';
import logger from '../utils/logger';
import { 
  validateSymbol, 
  validateTimeframe, 
  validateDateRange, 
  validateSymbolsArray,
  rateLimitMiddleware 
} from '../middleware/validation';
import { asyncHandler } from '../middleware/errorHandler';

const router = Router();

// Apply rate limiting to all routes
router.use(rateLimitMiddleware(100, 60000)); // 100 requests per minute

// Get historical data
router.get('/historical/:symbol', 
  validateSymbol,
  validateTimeframe,
  validateDateRange,
  asyncHandler(async (req: Request, res: Response) => {
  try {
    const { symbol } = req.params;
    const { 
      timeframe = '1day', 
      startDate, 
      endDate,
      limit = '1000'
    } = req.query;

    // Validate required parameters
    if (!startDate || !endDate) {
      return res.status(400).json({
        error: 'startDate and endDate are required query parameters'
      });
    }

    // Parse dates (validation middleware already checked format)
    const start = new Date(startDate as string);
    const end = new Date(endDate as string);

    const request: HistoricalDataRequest = {
      symbol,
      timeframe: timeframe as any,
      startDate: start,
      endDate: end,
    };

    const data = await marketDataService.getHistoricalData(request);
    
    // Apply limit if specified
    const limitNum = parseInt(limit as string);
    const limitedData = limitNum > 0 ? data.slice(-limitNum) : data;

    res.json({
      symbol,
      timeframe,
      startDate: start.toISOString(),
      endDate: end.toISOString(),
      count: limitedData.length,
      data: limitedData,
    });

  } catch (error) {
    logger.error('Error fetching historical data:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Internal server error'
    });
  }
});

// Get current quote
router.get('/quote/:symbol', 
  validateSymbol,
  asyncHandler(async (req: Request, res: Response) => {
  try {
    const { symbol } = req.params;
    const quote = await marketDataService.getCurrentQuote(symbol);

    res.json(quote);

  } catch (error) {
    logger.error('Error fetching quote:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Internal server error'
    });
  }
});

// Get multiple quotes
router.post('/quotes', 
  validateSymbolsArray,
  asyncHandler(async (req: Request, res: Response) => {
  try {
    const { symbols } = req.body; // Already validated by middleware

    const quotes = await marketDataService.getMultipleQuotes(symbols);

    res.json({
      requestedSymbols: symbols.length,
      successfulQuotes: Object.keys(quotes).length,
      quotes,
    });

  } catch (error) {
    logger.error('Error fetching multiple quotes:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Internal server error'
    });
  }
});

// Get market summary
router.post('/summary', async (req: Request, res: Response) => {
  try {
    const { symbols } = req.body;

    if (!Array.isArray(symbols) || symbols.length === 0) {
      return res.status(400).json({
        error: 'symbols must be a non-empty array'
      });
    }

    if (symbols.length > 100) {
      return res.status(400).json({
        error: 'Maximum 100 symbols allowed for summary'
      });
    }

    const summary = await marketDataService.getMarketSummary(symbols);

    res.json(summary);

  } catch (error) {
    logger.error('Error generating market summary:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Internal server error'
    });
  }
});

// Get provider status
router.get('/providers/status', async (req: Request, res: Response) => {
  try {
    const status = await marketDataService.getProviderStatus();

    res.json({
      providers: status,
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    logger.error('Error checking provider status:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Internal server error'
    });
  }
});

// Clear cache
router.delete('/cache/:symbol?', async (req: Request, res: Response) => {
  try {
    const { symbol } = req.params;
    
    await marketDataService.clearCache(symbol);

    res.json({
      message: symbol 
        ? `Cache cleared for symbol: ${symbol}` 
        : 'Cache clear initiated',
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    logger.error('Error clearing cache:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Internal server error'
    });
  }
});

// Health check endpoint
router.get('/health', async (req: Request, res: Response) => {
  try {
    const providerStatus = await marketDataService.getProviderStatus();
    const availableProviders = Object.values(providerStatus).filter(Boolean).length;

    res.json({
      status: availableProviders > 0 ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      providers: providerStatus,
      availableProviders,
    });

  } catch (error) {
    logger.error('Health check error:', error);
    res.status(503).json({
      status: 'unhealthy',
      error: error instanceof Error ? error.message : 'Internal server error',
      timestamp: new Date().toISOString(),
    });
  }
});

export default router;