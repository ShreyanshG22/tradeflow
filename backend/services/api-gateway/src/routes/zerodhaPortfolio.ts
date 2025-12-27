import { Router } from 'express';
import { validate } from '../middleware/validation';
import { ServiceProxy } from '../services/serviceProxy';
import { authMiddleware } from '../middleware/auth';
import { zerodhaGeneralRateLimit, zerodhaDailyRateLimit } from '../middleware/zerodhaRateLimit';
import Joi from 'joi';

const router = Router();
const zerodhaPortfolioServiceProxy = new ServiceProxy('zerodhaPortfolioService');

// Apply rate limiting to portfolio routes
router.use(zerodhaDailyRateLimit);
router.use(zerodhaGeneralRateLimit);

// Validation schemas
const portfolioQuerySchema = {
  query: Joi.object({
    date: Joi.date().iso().optional(),
    exchange: Joi.string().valid('NSE', 'BSE', 'NFO', 'BFO', 'CDS', 'MCX').optional(),
    product: Joi.string().valid('CNC', 'MIS', 'NRML').optional()
  })
};

const marginsQuerySchema = {
  query: Joi.object({
    segment: Joi.string().valid('equity', 'commodity').optional()
  })
};

const pnlQuerySchema = {
  query: Joi.object({
    from_date: Joi.date().iso().optional(),
    to_date: Joi.date().iso().optional(),
    symbol: Joi.string().optional(),
    exchange: Joi.string().valid('NSE', 'BSE', 'NFO', 'BFO', 'CDS', 'MCX').optional()
  })
};

// GET /api/zerodha/portfolio/positions - Get current positions
router.get('/positions', authMiddleware, validate(portfolioQuerySchema), async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const queryString = new URLSearchParams(req.query as any).toString();
    const response = await zerodhaPortfolioServiceProxy.get(`/positions?${queryString}`, {
      headers: { Authorization: authHeader }
    });
    res.json(response.data);
  } catch (error) {
    next(error);
  }
});

// GET /api/zerodha/portfolio/holdings - Get long-term holdings
router.get('/holdings', authMiddleware, validate(portfolioQuerySchema), async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const queryString = new URLSearchParams(req.query as any).toString();
    const response = await zerodhaPortfolioServiceProxy.get(`/holdings?${queryString}`, {
      headers: { Authorization: authHeader }
    });
    res.json(response.data);
  } catch (error) {
    next(error);
  }
});

// GET /api/zerodha/portfolio/margins - Get margin information
router.get('/margins', authMiddleware, validate(marginsQuerySchema), async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const queryString = new URLSearchParams(req.query as any).toString();
    const response = await zerodhaPortfolioServiceProxy.get(`/margins?${queryString}`, {
      headers: { Authorization: authHeader }
    });
    res.json(response.data);
  } catch (error) {
    next(error);
  }
});

// GET /api/zerodha/portfolio/pnl - Get profit and loss information
router.get('/pnl', authMiddleware, validate(pnlQuerySchema), async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const queryString = new URLSearchParams(req.query as any).toString();
    const response = await zerodhaPortfolioServiceProxy.get(`/pnl?${queryString}`, {
      headers: { Authorization: authHeader }
    });
    res.json(response.data);
  } catch (error) {
    next(error);
  }
});

// GET /api/zerodha/portfolio/summary - Get portfolio summary
router.get('/summary', authMiddleware, async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const response = await zerodhaPortfolioServiceProxy.get('/summary', {
      headers: { Authorization: authHeader }
    });
    res.json(response.data);
  } catch (error) {
    next(error);
  }
});

// GET /api/zerodha/portfolio/auctions - Get auction instruments
router.get('/auctions', authMiddleware, async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const response = await zerodhaPortfolioServiceProxy.get('/auctions', {
      headers: { Authorization: authHeader }
    });
    res.json(response.data);
  } catch (error) {
    next(error);
  }
});

// POST /api/zerodha/portfolio/convert - Convert position product type
router.post('/convert', authMiddleware, validate({
  body: Joi.object({
    exchange: Joi.string().valid('NSE', 'BSE', 'NFO', 'BFO', 'CDS', 'MCX').required(),
    tradingsymbol: Joi.string().min(1).max(50).required(),
    transaction_type: Joi.string().valid('BUY', 'SELL').required(),
    position_type: Joi.string().valid('day', 'overnight').required(),
    quantity: Joi.number().integer().positive().required(),
    old_product: Joi.string().valid('CNC', 'MIS', 'NRML').required(),
    new_product: Joi.string().valid('CNC', 'MIS', 'NRML').required()
  })
}), async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const response = await zerodhaPortfolioServiceProxy.post('/convert', req.body, {
      headers: { Authorization: authHeader }
    });
    res.json(response.data);
  } catch (error) {
    next(error);
  }
});

export { router as zerodhaPortfolioRoutes };