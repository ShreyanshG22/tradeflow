import { Router } from 'express';
import { validate, commonSchemas } from '../middleware/validation';
import { ServiceProxy } from '../services/serviceProxy';
import { AuthenticatedRequest } from '../middleware/auth';
import Joi from 'joi';

const router = Router();
const portfolioServiceProxy = new ServiceProxy('portfolioService');

// GET /api/portfolio
router.get('/',
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const response = await portfolioServiceProxy.get('/portfolio', {
        headers: { Authorization: req.headers.authorization }
      });
      res.json(response.data);
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/portfolio/positions
router.get('/positions',
  validate({
    query: Joi.object({
      ...commonSchemas.pagination.describe().keys,
      symbol: commonSchemas.symbol.optional(),
      status: Joi.string().valid('open', 'closed').optional()
    })
  }),
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const response = await portfolioServiceProxy.get('/portfolio/positions', {
        headers: { Authorization: req.headers.authorization },
        params: req.query
      });
      res.json(response.data);
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/portfolio/trades
router.get('/trades',
  validate({
    query: Joi.object({
      ...commonSchemas.pagination.describe().keys,
      ...commonSchemas.dateRange.describe().keys,
      symbol: commonSchemas.symbol.optional(),
      strategyId: Joi.string().uuid().optional()
    })
  }),
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const response = await portfolioServiceProxy.get('/portfolio/trades', {
        headers: { Authorization: req.headers.authorization },
        params: req.query
      });
      res.json(response.data);
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/portfolio/performance
router.get('/performance',
  validate({
    query: Joi.object({
      ...commonSchemas.dateRange.describe().keys,
      timeframe: Joi.string().valid('1d', '1w', '1m', '3m', '6m', '1y', 'all').default('1m')
    })
  }),
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const response = await portfolioServiceProxy.get('/portfolio/performance', {
        headers: { Authorization: req.headers.authorization },
        params: req.query
      });
      res.json(response.data);
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/portfolio/metrics
router.get('/metrics',
  validate({
    query: commonSchemas.dateRange
  }),
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const response = await portfolioServiceProxy.get('/portfolio/metrics', {
        headers: { Authorization: req.headers.authorization },
        params: req.query
      });
      res.json(response.data);
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/portfolio/equity-curve
router.get('/equity-curve',
  validate({
    query: Joi.object({
      ...commonSchemas.dateRange.describe().keys,
      resolution: Joi.string().valid('1h', '1d', '1w').default('1d')
    })
  }),
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const response = await portfolioServiceProxy.get('/portfolio/equity-curve', {
        headers: { Authorization: req.headers.authorization },
        params: req.query
      });
      res.json(response.data);
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/portfolio/positions/:id
router.get('/positions/:id',
  validate({
    params: commonSchemas.id
  }),
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const response = await portfolioServiceProxy.get(`/portfolio/positions/${req.params.id}`, {
        headers: { Authorization: req.headers.authorization }
      });
      res.json(response.data);
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/portfolio/trades/:id
router.get('/trades/:id',
  validate({
    params: commonSchemas.id
  }),
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const response = await portfolioServiceProxy.get(`/portfolio/trades/${req.params.id}`, {
        headers: { Authorization: req.headers.authorization }
      });
      res.json(response.data);
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/portfolio/manual-trade
router.post('/manual-trade',
  validate({
    body: Joi.object({
      symbol: commonSchemas.symbol.required(),
      side: Joi.string().valid('buy', 'sell').required(),
      quantity: Joi.number().positive().required(),
      price: Joi.number().positive().optional(),
      type: Joi.string().valid('market', 'limit').default('market'),
      strategyId: Joi.string().uuid().optional()
    })
  }),
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const response = await portfolioServiceProxy.post('/portfolio/manual-trade', req.body, {
        headers: { Authorization: req.headers.authorization }
      });
      res.status(201).json(response.data);
    } catch (error) {
      next(error);
    }
  }
);

export { router as portfolioRoutes };