import { Router } from 'express';
import { portfolioService } from '../services/portfolioService';
import { positionService } from '../services/positionService';
import { currencyService } from '../services/currencyService';
import { validateRequest, schemas } from '../middleware/validation';
import { asyncHandler } from '../middleware/errorHandler';
import { logger } from '../utils/logger';

const router = Router();

// Get user portfolios
router.get('/', 
  validateRequest({ query: schemas.portfolioQuery }),
  asyncHandler(async (req: any, res: any) => {
    const userId = req.user?.id || req.headers['x-user-id']; // Mock auth for now
    
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'User ID required',
          timestamp: new Date().toISOString()
        }
      });
    }

    const portfolios = await portfolioService.getUserPortfolios({
      userId,
      ...req.query
    });

    res.json({
      success: true,
      data: portfolios,
      timestamp: new Date().toISOString()
    });
  })
);

// Create portfolio
router.post('/',
  validateRequest({ body: schemas.createPortfolio }),
  asyncHandler(async (req: any, res: any) => {
    const userId = req.user?.id || req.headers['x-user-id']; // Mock auth for now
    
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'User ID required',
          timestamp: new Date().toISOString()
        }
      });
    }

    const portfolio = await portfolioService.createPortfolio(userId, req.body);

    res.status(201).json({
      success: true,
      data: portfolio,
      timestamp: new Date().toISOString()
    });
  })
);

// Get portfolio by ID
router.get('/:portfolioId',
  validateRequest({ params: schemas.portfolioId }),
  asyncHandler(async (req: any, res: any) => {
    const portfolio = await portfolioService.getPortfolio(req.params.portfolioId);
    
    if (!portfolio) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Portfolio not found',
          timestamp: new Date().toISOString()
        }
      });
    }

    res.json({
      success: true,
      data: portfolio,
      timestamp: new Date().toISOString()
    });
  })
);

// Update portfolio
router.put('/:portfolioId',
  validateRequest({ 
    params: schemas.portfolioId,
    body: schemas.updatePortfolio 
  }),
  asyncHandler(async (req: any, res: any) => {
    const portfolio = await portfolioService.updatePortfolio(
      req.params.portfolioId, 
      req.body
    );

    res.json({
      success: true,
      data: portfolio,
      timestamp: new Date().toISOString()
    });
  })
);

// Delete portfolio
router.delete('/:portfolioId',
  validateRequest({ params: schemas.portfolioId }),
  asyncHandler(async (req: any, res: any) => {
    await portfolioService.deletePortfolio(req.params.portfolioId);

    res.json({
      success: true,
      message: 'Portfolio deleted successfully',
      timestamp: new Date().toISOString()
    });
  })
);

// Get portfolio valuation
router.get('/:portfolioId/valuation',
  validateRequest({ params: schemas.portfolioId }),
  asyncHandler(async (req: any, res: any) => {
    const valuation = await portfolioService.getPortfolioValuation(req.params.portfolioId);

    res.json({
      success: true,
      data: valuation,
      timestamp: new Date().toISOString()
    });
  })
);

// Get portfolio summary
router.get('/:portfolioId/summary',
  validateRequest({ params: schemas.portfolioId }),
  asyncHandler(async (req: any, res: any) => {
    const summary = await portfolioService.getPortfolioSummary(req.params.portfolioId);

    res.json({
      success: true,
      data: summary,
      timestamp: new Date().toISOString()
    });
  })
);

// Get portfolio positions
router.get('/:portfolioId/positions',
  validateRequest({ 
    params: schemas.portfolioId,
    query: schemas.positionQuery 
  }),
  asyncHandler(async (req: any, res: any) => {
    const positions = await positionService.getPositions({
      portfolioId: req.params.portfolioId,
      ...req.query
    });

    res.json({
      success: true,
      data: positions,
      timestamp: new Date().toISOString()
    });
  })
);

// Get position valuations
router.get('/:portfolioId/positions/valuations',
  validateRequest({ params: schemas.portfolioId }),
  asyncHandler(async (req: any, res: any) => {
    const valuations = await positionService.getPositionValuations(req.params.portfolioId);

    res.json({
      success: true,
      data: valuations,
      timestamp: new Date().toISOString()
    });
  })
);

// Convert portfolio value to different currency
router.post('/:portfolioId/convert',
  validateRequest({ 
    params: schemas.portfolioId,
    body: schemas.currencyConversion 
  }),
  asyncHandler(async (req: any, res: any) => {
    const { amount, fromCurrency, toCurrency } = req.body;
    
    const result = await currencyService.convertPortfolioValue(
      amount, 
      fromCurrency, 
      toCurrency
    );

    res.json({
      success: true,
      data: {
        originalAmount: amount,
        fromCurrency,
        toCurrency,
        ...result
      },
      timestamp: new Date().toISOString()
    });
  })
);

export { router as portfolioRoutes };