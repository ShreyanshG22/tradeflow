import { Router } from 'express';
import { validate } from '../middleware/validation';
import { ServiceProxy } from '../services/serviceProxy';
import { authMiddleware } from '../middleware/auth';
import { zerodhaGeneralRateLimit, zerodhaDailyRateLimit } from '../middleware/zerodhaRateLimit';
import Joi from 'joi';

const router = Router();
const zerodhaRiskServiceProxy = new ServiceProxy('zerodhaRiskService');

// Apply rate limiting to risk routes
router.use(zerodhaDailyRateLimit);
router.use(zerodhaGeneralRateLimit);

// Validation schemas
const riskLimitsSchema = {
  body: Joi.object({
    max_order_value: Joi.number().positive().optional(),
    max_daily_loss: Joi.number().positive().optional(),
    max_position_size: Joi.number().positive().optional(),
    max_orders_per_minute: Joi.number().integer().positive().optional(),
    allowed_products: Joi.array().items(Joi.string().valid('CNC', 'MIS', 'NRML')).optional(),
    allowed_exchanges: Joi.array().items(Joi.string().valid('NSE', 'BSE', 'NFO', 'BFO', 'CDS', 'MCX')).optional(),
    max_leverage: Joi.number().positive().optional(),
    stop_loss_percentage: Joi.number().min(0).max(100).optional(),
    auto_square_off: Joi.boolean().optional(),
    square_off_time: Joi.string().pattern(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/).optional()
  }).min(1)
};

const orderValidationSchema = {
  body: Joi.object({
    exchange: Joi.string().valid('NSE', 'BSE', 'NFO', 'BFO', 'CDS', 'MCX').required(),
    tradingsymbol: Joi.string().min(1).max(50).required(),
    transaction_type: Joi.string().valid('BUY', 'SELL').required(),
    quantity: Joi.number().integer().positive().required(),
    product: Joi.string().valid('CNC', 'MIS', 'NRML').required(),
    order_type: Joi.string().valid('MARKET', 'LIMIT', 'SL', 'SL-M').required(),
    price: Joi.number().positive().optional(),
    trigger_price: Joi.number().positive().optional()
  })
};

const riskReportSchema = {
  query: Joi.object({
    from_date: Joi.date().iso().optional(),
    to_date: Joi.date().iso().optional(),
    type: Joi.string().valid('daily', 'weekly', 'monthly').default('daily')
  })
};

// GET /api/zerodha/risk/limits - Get current risk limits
router.get('/limits', authMiddleware, async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const response = await zerodhaRiskServiceProxy.get('/limits', {
      headers: { Authorization: authHeader }
    });
    res.json(response.data);
  } catch (error) {
    next(error);
  }
});

// PUT /api/zerodha/risk/limits - Update risk limits
router.put('/limits', authMiddleware, validate(riskLimitsSchema), async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const response = await zerodhaRiskServiceProxy.put('/limits', req.body, {
      headers: { Authorization: authHeader }
    });
    res.json(response.data);
  } catch (error) {
    next(error);
  }
});

// POST /api/zerodha/risk/validate-order - Validate order against risk limits
router.post('/validate-order', authMiddleware, validate(orderValidationSchema), async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const response = await zerodhaRiskServiceProxy.post('/validate-order', req.body, {
      headers: { Authorization: authHeader }
    });
    res.json(response.data);
  } catch (error) {
    next(error);
  }
});

// GET /api/zerodha/risk/exposure - Get current risk exposure
router.get('/exposure', authMiddleware, async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const response = await zerodhaRiskServiceProxy.get('/exposure', {
      headers: { Authorization: authHeader }
    });
    res.json(response.data);
  } catch (error) {
    next(error);
  }
});

// GET /api/zerodha/risk/alerts - Get risk alerts
router.get('/alerts', authMiddleware, async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const queryString = new URLSearchParams(req.query as any).toString();
    const response = await zerodhaRiskServiceProxy.get(`/alerts?${queryString}`, {
      headers: { Authorization: authHeader }
    });
    res.json(response.data);
  } catch (error) {
    next(error);
  }
});

// POST /api/zerodha/risk/alerts/acknowledge - Acknowledge risk alerts
router.post('/alerts/acknowledge', authMiddleware, validate({
  body: Joi.object({
    alert_ids: Joi.array().items(Joi.string().uuid()).min(1).required()
  })
}), async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const response = await zerodhaRiskServiceProxy.post('/alerts/acknowledge', req.body, {
      headers: { Authorization: authHeader }
    });
    res.json(response.data);
  } catch (error) {
    next(error);
  }
});

// GET /api/zerodha/risk/report - Get risk report
router.get('/report', authMiddleware, validate(riskReportSchema), async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const queryString = new URLSearchParams(req.query as any).toString();
    const response = await zerodhaRiskServiceProxy.get(`/report?${queryString}`, {
      headers: { Authorization: authHeader }
    });
    res.json(response.data);
  } catch (error) {
    next(error);
  }
});

// POST /api/zerodha/risk/square-off - Manually trigger square off
router.post('/square-off', authMiddleware, validate({
  body: Joi.object({
    positions: Joi.array().items(
      Joi.object({
        exchange: Joi.string().valid('NSE', 'BSE', 'NFO', 'BFO', 'CDS', 'MCX').required(),
        tradingsymbol: Joi.string().min(1).max(50).required(),
        quantity: Joi.number().integer().required()
      })
    ).min(1).optional(),
    square_off_all: Joi.boolean().default(false)
  })
}), async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const response = await zerodhaRiskServiceProxy.post('/square-off', req.body, {
      headers: { Authorization: authHeader }
    });
    res.json(response.data);
  } catch (error) {
    next(error);
  }
});

export { router as zerodhaRiskRoutes };