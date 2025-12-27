import { Router } from 'express';
import { validate } from '../middleware/validation';
import { ServiceProxy } from '../services/serviceProxy';
import { authMiddleware } from '../middleware/auth';
import { zerodhaMarketDataRateLimit, zerodhaDailyRateLimit } from '../middleware/zerodhaRateLimit';
import Joi from 'joi';

const router = Router();
const zerodhaMarketServiceProxy = new ServiceProxy('zerodhaMarketService');

// Apply rate limiting to all market data routes
router.use(zerodhaDailyRateLimit);
router.use(zerodhaMarketDataRateLimit);

// Validation schemas
const subscribeSchema = {
  body: Joi.object({
    instruments: Joi.array().items(Joi.number().integer().positive()).min(1).max(100).required(),
    mode: Joi.string().valid('ltp', 'quote', 'full').default('quote')
  })
};

const unsubscribeSchema = {
  body: Joi.object({
    instruments: Joi.array().items(Joi.number().integer().positive()).min(1).required()
  })
};

const quotesSchema = {
  body: Joi.object({
    instruments: Joi.array().items(Joi.string()).min(1).max(100).required()
  })
};

const historicalSchema = {
  query: Joi.object({
    instrument_token: Joi.number().integer().positive().required(),
    interval: Joi.string().valid('minute', '3minute', '5minute', '10minute', '15minute', '30minute', 'hour', 'day').required(),
    from: Joi.date().iso().required(),
    to: Joi.date().iso().required(),
    continuous: Joi.boolean().default(false),
    oi: Joi.boolean().default(false)
  })
};

const searchSchema = {
  query: Joi.object({
    q: Joi.string().min(1).max(50).required(),
    exchange: Joi.string().valid('NSE', 'BSE', 'NFO', 'BFO', 'CDS', 'MCX').optional()
  })
};

// GET /api/zerodha/market/instruments - Get all instruments
router.get('/instruments', authMiddleware, async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const queryString = new URLSearchParams(req.query as any).toString();
    const response = await zerodhaMarketServiceProxy.get(`/instruments?${queryString}`, {
      headers: { Authorization: authHeader }
    });
    res.json(response.data);
  } catch (error) {
    next(error);
  }
});

// GET /api/zerodha/market/search - Search instruments
router.get('/search', authMiddleware, validate(searchSchema), async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const queryString = new URLSearchParams(req.query as any).toString();
    const response = await zerodhaMarketServiceProxy.get(`/search?${queryString}`, {
      headers: { Authorization: authHeader }
    });
    res.json(response.data);
  } catch (error) {
    next(error);
  }
});

// POST /api/zerodha/market/subscribe - Subscribe to market data
router.post('/subscribe', authMiddleware, validate(subscribeSchema), async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const response = await zerodhaMarketServiceProxy.post('/subscribe', req.body, {
      headers: { Authorization: authHeader }
    });
    res.json(response.data);
  } catch (error) {
    next(error);
  }
});

// DELETE /api/zerodha/market/unsubscribe - Unsubscribe from market data
router.delete('/unsubscribe', authMiddleware, validate(unsubscribeSchema), async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const response = await zerodhaMarketServiceProxy.delete('/unsubscribe', {
      data: req.body,
      headers: { Authorization: authHeader }
    });
    res.json(response.data);
  } catch (error) {
    next(error);
  }
});

// POST /api/zerodha/market/quotes - Get quotes for instruments
router.post('/quotes', authMiddleware, validate(quotesSchema), async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const response = await zerodhaMarketServiceProxy.post('/quotes', req.body, {
      headers: { Authorization: authHeader }
    });
    res.json(response.data);
  } catch (error) {
    next(error);
  }
});

// GET /api/zerodha/market/historical - Get historical data
router.get('/historical', authMiddleware, validate(historicalSchema), async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const queryString = new URLSearchParams(req.query as any).toString();
    const response = await zerodhaMarketServiceProxy.get(`/historical?${queryString}`, {
      headers: { Authorization: authHeader }
    });
    res.json(response.data);
  } catch (error) {
    next(error);
  }
});

// GET /api/zerodha/market/indices - Get market indices
router.get('/indices', authMiddleware, async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const response = await zerodhaMarketServiceProxy.get('/indices', {
      headers: { Authorization: authHeader }
    });
    res.json(response.data);
  } catch (error) {
    next(error);
  }
});

// GET /api/zerodha/market/status - Get market status
router.get('/status', authMiddleware, async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const response = await zerodhaMarketServiceProxy.get('/status', {
      headers: { Authorization: authHeader }
    });
    res.json(response.data);
  } catch (error) {
    next(error);
  }
});

export { router as zerodhaMarketRoutes };