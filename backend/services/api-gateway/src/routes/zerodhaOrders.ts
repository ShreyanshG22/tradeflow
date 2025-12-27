import { Router } from 'express';
import { validate } from '../middleware/validation';
import { ServiceProxy } from '../services/serviceProxy';
import { authMiddleware } from '../middleware/auth';
import { zerodhaOrderRateLimit, zerodhaDailyRateLimit } from '../middleware/zerodhaRateLimit';
import Joi from 'joi';

const router = Router();
const zerodhaOrderServiceProxy = new ServiceProxy('zerodhaOrderService');

// Apply rate limiting to all order routes
router.use(zerodhaDailyRateLimit);
router.use(zerodhaOrderRateLimit);

// Validation schemas
const orderPlacementSchema = {
  body: Joi.object({
    exchange: Joi.string().valid('NSE', 'BSE', 'NFO', 'BFO', 'CDS', 'MCX').required(),
    tradingsymbol: Joi.string().min(1).max(50).required(),
    transaction_type: Joi.string().valid('BUY', 'SELL').required(),
    quantity: Joi.number().integer().positive().required(),
    product: Joi.string().valid('CNC', 'MIS', 'NRML').required(),
    order_type: Joi.string().valid('MARKET', 'LIMIT', 'SL', 'SL-M').required(),
    price: Joi.number().positive().when('order_type', {
      is: Joi.string().valid('LIMIT', 'SL'),
      then: Joi.required(),
      otherwise: Joi.optional()
    }),
    trigger_price: Joi.number().positive().when('order_type', {
      is: Joi.string().valid('SL', 'SL-M'),
      then: Joi.required(),
      otherwise: Joi.optional()
    }),
    validity: Joi.string().valid('DAY', 'IOC').default('DAY'),
    disclosed_quantity: Joi.number().integer().min(0).optional(),
    squareoff: Joi.number().positive().optional(),
    stoploss: Joi.number().positive().optional(),
    trailing_stoploss: Joi.number().positive().optional(),
    tag: Joi.string().max(20).optional()
  })
};

const orderModificationSchema = {
  body: Joi.object({
    quantity: Joi.number().integer().positive().optional(),
    price: Joi.number().positive().optional(),
    trigger_price: Joi.number().positive().optional(),
    order_type: Joi.string().valid('MARKET', 'LIMIT', 'SL', 'SL-M').optional(),
    validity: Joi.string().valid('DAY', 'IOC').optional(),
    disclosed_quantity: Joi.number().integer().min(0).optional()
  }).min(1)
};

const orderIdSchema = {
  params: Joi.object({
    orderId: Joi.string().required()
  })
};

const ordersQuerySchema = {
  query: Joi.object({
    status: Joi.string().valid('OPEN', 'COMPLETE', 'CANCELLED', 'REJECTED', 'TRIGGER PENDING').optional(),
    from_date: Joi.date().iso().optional(),
    to_date: Joi.date().iso().optional(),
    limit: Joi.number().integer().min(1).max(100).default(50),
    offset: Joi.number().integer().min(0).default(0)
  })
};

// POST /api/zerodha/orders - Place a new order
router.post('/', authMiddleware, validate(orderPlacementSchema), async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const response = await zerodhaOrderServiceProxy.post('/orders', req.body, {
      headers: { Authorization: authHeader }
    });
    res.status(201).json(response.data);
  } catch (error) {
    next(error);
  }
});

// GET /api/zerodha/orders - Get all orders
router.get('/', authMiddleware, validate(ordersQuerySchema), async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const queryString = new URLSearchParams(req.query as any).toString();
    const response = await zerodhaOrderServiceProxy.get(`/orders?${queryString}`, {
      headers: { Authorization: authHeader }
    });
    res.json(response.data);
  } catch (error) {
    next(error);
  }
});

// GET /api/zerodha/orders/:orderId - Get specific order details
router.get('/:orderId', authMiddleware, validate(orderIdSchema), async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const { orderId } = req.params;
    const response = await zerodhaOrderServiceProxy.get(`/orders/${orderId}`, {
      headers: { Authorization: authHeader }
    });
    res.json(response.data);
  } catch (error) {
    next(error);
  }
});

// PUT /api/zerodha/orders/:orderId - Modify an existing order
router.put('/:orderId', authMiddleware, validate({ ...orderIdSchema, ...orderModificationSchema }), async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const { orderId } = req.params;
    const response = await zerodhaOrderServiceProxy.put(`/orders/${orderId}`, req.body, {
      headers: { Authorization: authHeader }
    });
    res.json(response.data);
  } catch (error) {
    next(error);
  }
});

// DELETE /api/zerodha/orders/:orderId - Cancel an order
router.delete('/:orderId', authMiddleware, validate(orderIdSchema), async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const { orderId } = req.params;
    const response = await zerodhaOrderServiceProxy.delete(`/orders/${orderId}`, {
      headers: { Authorization: authHeader }
    });
    res.json(response.data);
  } catch (error) {
    next(error);
  }
});

// GET /api/zerodha/orders/:orderId/history - Get order history
router.get('/:orderId/history', authMiddleware, validate(orderIdSchema), async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const { orderId } = req.params;
    const response = await zerodhaOrderServiceProxy.get(`/orders/${orderId}/history`, {
      headers: { Authorization: authHeader }
    });
    res.json(response.data);
  } catch (error) {
    next(error);
  }
});

// GET /api/zerodha/orders/trades - Get all trades
router.get('/trades/all', authMiddleware, validate(ordersQuerySchema), async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const queryString = new URLSearchParams(req.query as any).toString();
    const response = await zerodhaOrderServiceProxy.get(`/orders/trades?${queryString}`, {
      headers: { Authorization: authHeader }
    });
    res.json(response.data);
  } catch (error) {
    next(error);
  }
});

// GET /api/zerodha/orders/:orderId/trades - Get trades for specific order
router.get('/:orderId/trades', authMiddleware, validate(orderIdSchema), async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const { orderId } = req.params;
    const response = await zerodhaOrderServiceProxy.get(`/orders/${orderId}/trades`, {
      headers: { Authorization: authHeader }
    });
    res.json(response.data);
  } catch (error) {
    next(error);
  }
});

export { router as zerodhaOrderRoutes };