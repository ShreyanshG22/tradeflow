import { Router, Request, Response, NextFunction } from 'express';
import { PositionService } from '../services/PositionService';
import { HoldingsService } from '../services/HoldingsService';
import { PnLService } from '../services/PnLService';
import { PortfolioSummaryService } from '../services/PortfolioSummaryService';
import { createError } from '../middleware/errorHandler';
import { logger } from '../utils/logger';

const router = Router();

// Middleware to extract user info from token (simplified for now)
const authenticateUser = (req: Request, res: Response, next: NextFunction) => {
  // In a real implementation, this would validate JWT token and extract user info
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(createError('Authorization token required', 401));
  }

  // Mock user extraction - in real implementation, decode JWT
  req.user = {
    id: req.headers['x-user-id'] as string || 'test-user-id',
    accessToken: authHeader.replace('Bearer ', '')
  };

  if (!req.user.id || !req.user.accessToken) {
    return next(createError('Invalid authorization token', 401));
  }

  next();
};

// Apply authentication middleware to all routes
router.use(authenticateUser);

// GET /api/zerodha/portfolio/positions - Get current positions
router.get('/positions', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const positionService = new PositionService(req.user.accessToken, req.user.id);
    const summary = await positionService.getPositionSummary();
    
    res.json({
      success: true,
      data: summary
    });
  } catch (error) {
    logger.error('Failed to get positions:', error);
    next(createError('Failed to fetch positions', 500));
  }
});

// GET /api/zerodha/portfolio/positions/:symbol - Get position for specific symbol
router.get('/positions/:symbol', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { symbol } = req.params;
    const { exchange = 'NSE' } = req.query;
    
    const positionService = new PositionService(req.user.accessToken, req.user.id);
    const position = await positionService.getPositionBySymbol(symbol, exchange as string);
    
    if (!position) {
      return next(createError('Position not found', 404));
    }
    
    res.json({
      success: true,
      data: position
    });
  } catch (error) {
    logger.error('Failed to get position:', error);
    next(createError('Failed to fetch position', 500));
  }
});

// GET /api/zerodha/portfolio/positions/aggregate - Get aggregated positions by symbol
router.get('/positions/aggregate', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const positionService = new PositionService(req.user.accessToken, req.user.id);
    const aggregatedPositions = await positionService.aggregatePositionsBySymbol();
    
    res.json({
      success: true,
      data: aggregatedPositions
    });
  } catch (error) {
    logger.error('Failed to get aggregated positions:', error);
    next(createError('Failed to fetch aggregated positions', 500));
  }
});

// GET /api/zerodha/portfolio/holdings - Get current holdings
router.get('/holdings', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const holdingsService = new HoldingsService(req.user.accessToken, req.user.id);
    const summary = await holdingsService.getHoldingsSummary();
    
    res.json({
      success: true,
      data: summary
    });
  } catch (error) {
    logger.error('Failed to get holdings:', error);
    next(createError('Failed to fetch holdings', 500));
  }
});

// GET /api/zerodha/portfolio/holdings/:symbol - Get holding for specific symbol
router.get('/holdings/:symbol', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { symbol } = req.params;
    const { exchange = 'NSE' } = req.query;
    
    const holdingsService = new HoldingsService(req.user.accessToken, req.user.id);
    const holding = await holdingsService.getHoldingBySymbol(symbol, exchange as string);
    
    if (!holding) {
      return next(createError('Holding not found', 404));
    }
    
    res.json({
      success: true,
      data: holding
    });
  } catch (error) {
    logger.error('Failed to get holding:', error);
    next(createError('Failed to fetch holding', 500));
  }
});

// GET /api/zerodha/portfolio/pnl - Get P&L breakdown
router.get('/pnl', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const pnlService = new PnLService(req.user.id);
    
    // Try to get cached data first
    let pnlBreakdown = await pnlService.getCachedPnLData();
    
    if (!pnlBreakdown) {
      pnlBreakdown = await pnlService.getPnLBreakdown();
      await pnlService.cachePnLData(pnlBreakdown);
    }
    
    res.json({
      success: true,
      data: pnlBreakdown
    });
  } catch (error) {
    logger.error('Failed to get P&L breakdown:', error);
    next(createError('Failed to fetch P&L data', 500));
  }
});

// GET /api/zerodha/portfolio/pnl/by-symbol - Get P&L by symbol
router.get('/pnl/by-symbol', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const pnlService = new PnLService(req.user.id);
    const pnlBySymbol = await pnlService.getPnLBySymbol();
    
    res.json({
      success: true,
      data: pnlBySymbol
    });
  } catch (error) {
    logger.error('Failed to get P&L by symbol:', error);
    next(createError('Failed to fetch P&L by symbol', 500));
  }
});

// GET /api/zerodha/portfolio/pnl/history - Get P&L history
router.get('/pnl/history', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { days = '30' } = req.query;
    const pnlService = new PnLService(req.user.id);
    const pnlHistory = await pnlService.getPnLHistory(parseInt(days as string));
    
    res.json({
      success: true,
      data: pnlHistory
    });
  } catch (error) {
    logger.error('Failed to get P&L history:', error);
    next(createError('Failed to fetch P&L history', 500));
  }
});

// GET /api/zerodha/portfolio/summary - Get complete portfolio summary
router.get('/summary', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const portfolioService = new PortfolioSummaryService(req.user.accessToken, req.user.id);
    
    // Try to get cached summary first
    let summary = await portfolioService.getCachedPortfolioSummary();
    
    if (!summary) {
      summary = await portfolioService.getPortfolioSummary();
    }
    
    res.json({
      success: true,
      data: summary
    });
  } catch (error) {
    logger.error('Failed to get portfolio summary:', error);
    next(createError('Failed to fetch portfolio summary', 500));
  }
});

// GET /api/zerodha/portfolio/analytics - Get portfolio analytics
router.get('/analytics', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const portfolioService = new PortfolioSummaryService(req.user.accessToken, req.user.id);
    const analytics = await portfolioService.getPortfolioAnalytics();
    
    res.json({
      success: true,
      data: analytics
    });
  } catch (error) {
    logger.error('Failed to get portfolio analytics:', error);
    next(createError('Failed to fetch portfolio analytics', 500));
  }
});

// POST /api/zerodha/portfolio/sync - Force sync portfolio data from Zerodha
router.post('/sync', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const positionService = new PositionService(req.user.accessToken, req.user.id);
    const holdingsService = new HoldingsService(req.user.accessToken, req.user.id);
    
    // Fetch fresh data from Zerodha and sync to database
    const [positions, holdings] = await Promise.all([
      positionService.fetchPositionsFromZerodha(),
      holdingsService.fetchHoldingsFromZerodha()
    ]);
    
    await Promise.all([
      positionService.syncPositionsToDatabase(positions),
      holdingsService.syncHoldingsToDatabase(holdings)
    ]);
    
    res.json({
      success: true,
      message: 'Portfolio data synced successfully',
      data: {
        positions_synced: positions.length,
        holdings_synced: holdings.length
      }
    });
  } catch (error) {
    logger.error('Failed to sync portfolio data:', error);
    next(createError('Failed to sync portfolio data', 500));
  }
});

// PUT /api/zerodha/portfolio/holdings/prices - Update holding prices
router.put('/holdings/prices', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { price_updates } = req.body;
    
    if (!Array.isArray(price_updates)) {
      return next(createError('price_updates must be an array', 400));
    }
    
    const holdingsService = new HoldingsService(req.user.accessToken, req.user.id);
    await holdingsService.updateHoldingPrices(price_updates);
    
    res.json({
      success: true,
      message: 'Holding prices updated successfully'
    });
  } catch (error) {
    logger.error('Failed to update holding prices:', error);
    next(createError('Failed to update holding prices', 500));
  }
});

// Extend Request interface to include user
declare global {
  namespace Express {
    interface Request {
      user: {
        id: string;
        accessToken: string;
      };
    }
  }
}

export { router as portfolioRoutes };