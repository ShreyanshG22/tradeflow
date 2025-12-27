import { Router } from 'express';
import { tradeService } from '../services/tradeService';
import { validateRequest, schemas } from '../middleware/validation';
import { asyncHandler } from '../middleware/errorHandler';
import Joi from 'joi';

const router = Router();

// Validation schemas for trades
const createTradeSchema = Joi.object({
  portfolioId: Joi.string().uuid().required(),
  strategyId: Joi.string().uuid().optional(),
  symbol: Joi.string().min(1).max(20).required(),
  side: Joi.string().valid('buy', 'sell').required(),
  quantity: Joi.number().positive().required(),
  price: Joi.number().positive().required(),
  tradeType: Joi.string().valid('market', 'limit', 'stop', 'stop_limit').optional(),
  fees: Joi.number().min(0).optional(),
  commission: Joi.number().min(0).optional(),
  orderId: Joi.string().max(100).optional(),
  brokerTradeId: Joi.string().max(100).optional()
});

const updateTradeStatusSchema = Joi.object({
  status: Joi.string().valid('pending', 'filled', 'cancelled', 'rejected', 'partial').required(),
  brokerTradeId: Joi.string().max(100).optional()
});

const reconcileTradesSchema = Joi.object({
  brokerTrades: Joi.array().items(Joi.object({
    id: Joi.string().required(),
    orderId: Joi.string().optional(),
    symbol: Joi.string().required(),
    side: Joi.string().valid('buy', 'sell').required(),
    quantity: Joi.number().positive().required(),
    price: Joi.number().positive().required(),
    executedAt: Joi.date().optional()
  })).required()
});

const tradeStatsQuerySchema = Joi.object({
  startDate: Joi.date().optional(),
  endDate: Joi.date().optional()
});

// Record a new trade
router.post('/',
  validateRequest({ body: createTradeSchema }),
  asyncHandler(async (req: any, res: any) => {
    const trade = await tradeService.recordTrade(req.body);

    res.status(201).json({
      success: true,
      data: trade,
      timestamp: new Date().toISOString()
    });
  })
);

// Get trades for a portfolio
router.get('/portfolio/:portfolioId',
  validateRequest({ 
    params: schemas.portfolioId,
    query: schemas.tradeQuery 
  }),
  asyncHandler(async (req: any, res: any) => {
    const trades = await tradeService.getTrades({
      portfolioId: req.params.portfolioId,
      ...req.query
    });

    res.json({
      success: true,
      data: trades,
      timestamp: new Date().toISOString()
    });
  })
);

// Get specific trade
router.get('/:tradeId',
  validateRequest({ 
    params: Joi.object({ tradeId: Joi.string().uuid().required() })
  }),
  asyncHandler(async (req: any, res: any) => {
    const trade = await tradeService.getTrade(req.params.tradeId);
    
    if (!trade) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Trade not found',
          timestamp: new Date().toISOString()
        }
      });
    }

    res.json({
      success: true,
      data: trade,
      timestamp: new Date().toISOString()
    });
  })
);

// Update trade status
router.patch('/:tradeId/status',
  validateRequest({ 
    params: Joi.object({ tradeId: Joi.string().uuid().required() }),
    body: updateTradeStatusSchema
  }),
  asyncHandler(async (req: any, res: any) => {
    const trade = await tradeService.updateTradeStatus(
      req.params.tradeId,
      req.body.status,
      req.body.brokerTradeId
    );

    res.json({
      success: true,
      data: trade,
      timestamp: new Date().toISOString()
    });
  })
);

// Reconcile trades with broker
router.post('/portfolio/:portfolioId/reconcile',
  validateRequest({ 
    params: schemas.portfolioId,
    body: reconcileTradesSchema
  }),
  asyncHandler(async (req: any, res: any) => {
    const results = await tradeService.reconcileTrades(
      req.params.portfolioId,
      req.body.brokerTrades
    );

    const summary = {
      totalBrokerTrades: req.body.brokerTrades.length,
      matched: results.filter(r => r.status === 'matched').length,
      unmatched: results.filter(r => r.status === 'unmatched').length,
      discrepancies: results.filter(r => r.status === 'discrepancy').length
    };

    res.json({
      success: true,
      data: {
        summary,
        results
      },
      timestamp: new Date().toISOString()
    });
  })
);

// Get trade statistics
router.get('/portfolio/:portfolioId/statistics',
  validateRequest({ 
    params: schemas.portfolioId,
    query: tradeStatsQuerySchema
  }),
  asyncHandler(async (req: any, res: any) => {
    const statistics = await tradeService.getTradeStatistics(
      req.params.portfolioId,
      req.query.startDate ? new Date(req.query.startDate) : undefined,
      req.query.endDate ? new Date(req.query.endDate) : undefined
    );

    res.json({
      success: true,
      data: statistics,
      timestamp: new Date().toISOString()
    });
  })
);

export { router as tradeRoutes };