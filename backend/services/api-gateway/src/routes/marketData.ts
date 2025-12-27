import { Router } from 'express';
import { validate, commonSchemas } from '../middleware/validation';
import { ServiceProxy } from '../services/serviceProxy';
import { AuthenticatedRequest, optionalAuth } from '../middleware/auth';
import Joi from 'joi';

const router = Router();
const marketDataServiceProxy = new ServiceProxy('marketDataService');

// GET /api/market-data/quote/:symbol
router.get('/quote/:symbol',
  validate({
    params: Joi.object({
      symbol: commonSchemas.symbol.required()
    })
  }),
  optionalAuth, // Market data can be accessed without auth for basic quotes
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const response = await marketDataServiceProxy.get(`/quote/${req.params.symbol}`, {
        headers: req.headers.authorization ? { Authorization: req.headers.authorization } : {}
      });
      res.json(response.data);
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/market-data/historical/:symbol
router.get('/historical/:symbol',
  validate({
    params: Joi.object({
      symbol: commonSchemas.symbol.required()
    }),
    query: Joi.object({
      timeframe: Joi.string().valid('1m', '5m', '15m', '30m', '1h', '4h', '1d', '1w', '1M').required(),
      startDate: Joi.date().iso().required(),
      endDate: Joi.date().iso().min(Joi.ref('startDate')).required(),
      limit: Joi.number().integer().min(1).max(5000).default(1000)
    })
  }),
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const response = await marketDataServiceProxy.get(`/historical/${req.params.symbol}`, {
        headers: { Authorization: req.headers.authorization },
        params: req.query
      });
      res.json(response.data);
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/market-data/search
router.get('/search',
  validate({
    query: Joi.object({
      query: Joi.string().min(1).max(50).required(),
      limit: Joi.number().integer().min(1).max(50).default(10)
    })
  }),
  optionalAuth,
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const response = await marketDataServiceProxy.get('/search', {
        headers: req.headers.authorization ? { Authorization: req.headers.authorization } : {},
        params: req.query
      });
      res.json(response.data);
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/market-data/market-status
router.get('/market-status',
  optionalAuth,
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const response = await marketDataServiceProxy.get('/market-status', {
        headers: req.headers.authorization ? { Authorization: req.headers.authorization } : {}
      });
      res.json(response.data);
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/market-data/watchlist
router.get('/watchlist',
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const response = await marketDataServiceProxy.get('/watchlist', {
        headers: { Authorization: req.headers.authorization }
      });
      res.json(response.data);
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/market-data/watchlist
router.post('/watchlist',
  validate({
    body: Joi.object({
      symbol: commonSchemas.symbol.required(),
      name: Joi.string().min(1).max(100).optional()
    })
  }),
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const response = await marketDataServiceProxy.post('/watchlist', req.body, {
        headers: { Authorization: req.headers.authorization }
      });
      res.status(201).json(response.data);
    } catch (error) {
      next(error);
    }
  }
);

// DELETE /api/market-data/watchlist/:symbol
router.delete('/watchlist/:symbol',
  validate({
    params: Joi.object({
      symbol: commonSchemas.symbol.required()
    })
  }),
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const response = await marketDataServiceProxy.delete(`/watchlist/${req.params.symbol}`, {
        headers: { Authorization: req.headers.authorization }
      });
      res.json(response.data);
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/market-data/indicators/:symbol
router.get('/indicators/:symbol',
  validate({
    params: Joi.object({
      symbol: commonSchemas.symbol.required()
    }),
    query: Joi.object({
      timeframe: Joi.string().valid('1m', '5m', '15m', '30m', '1h', '4h', '1d').required(),
      indicators: Joi.string().required(), // comma-separated list like "sma,rsi,macd"
      period: Joi.number().integer().min(1).max(200).default(20),
      startDate: Joi.date().iso().optional(),
      endDate: Joi.date().iso().optional()
    })
  }),
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const response = await marketDataServiceProxy.get(`/indicators/${req.params.symbol}`, {
        headers: { Authorization: req.headers.authorization },
        params: req.query
      });
      res.json(response.data);
    } catch (error) {
      next(error);
    }
  }
);

export { router as marketDataRoutes };