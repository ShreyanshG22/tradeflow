import { Router } from 'express';
import { validate, commonSchemas } from '../middleware/validation';
import { ServiceProxy } from '../services/serviceProxy';
import { AuthenticatedRequest } from '../middleware/auth';
import Joi from 'joi';

const router = Router();
const backtestServiceProxy = new ServiceProxy('backtestService');

// GET /api/backtests
router.get('/',
  validate({
    query: Joi.object({
      ...commonSchemas.pagination.describe().keys,
      strategyId: Joi.string().uuid().optional(),
      status: Joi.string().valid('pending', 'running', 'completed', 'failed').optional()
    })
  }),
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const response = await backtestServiceProxy.get('/backtests', {
        headers: { Authorization: req.headers.authorization },
        params: req.query
      });
      res.json(response.data);
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/backtests/:id
router.get('/:id',
  validate({
    params: commonSchemas.id
  }),
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const response = await backtestServiceProxy.get(`/backtests/${req.params.id}`, {
        headers: { Authorization: req.headers.authorization }
      });
      res.json(response.data);
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/backtests
router.post('/',
  validate({
    body: commonSchemas.backtestParams
  }),
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const response = await backtestServiceProxy.post('/backtests', req.body, {
        headers: { Authorization: req.headers.authorization }
      });
      res.status(201).json(response.data);
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/backtests/:id/results
router.get('/:id/results',
  validate({
    params: commonSchemas.id
  }),
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const response = await backtestServiceProxy.get(`/backtests/${req.params.id}/results`, {
        headers: { Authorization: req.headers.authorization }
      });
      res.json(response.data);
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/backtests/:id/trades
router.get('/:id/trades',
  validate({
    params: commonSchemas.id,
    query: commonSchemas.pagination
  }),
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const response = await backtestServiceProxy.get(`/backtests/${req.params.id}/trades`, {
        headers: { Authorization: req.headers.authorization },
        params: req.query
      });
      res.json(response.data);
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/backtests/:id/metrics
router.get('/:id/metrics',
  validate({
    params: commonSchemas.id
  }),
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const response = await backtestServiceProxy.get(`/backtests/${req.params.id}/metrics`, {
        headers: { Authorization: req.headers.authorization }
      });
      res.json(response.data);
    } catch (error) {
      next(error);
    }
  }
);

// DELETE /api/backtests/:id
router.delete('/:id',
  validate({
    params: commonSchemas.id
  }),
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const response = await backtestServiceProxy.delete(`/backtests/${req.params.id}`, {
        headers: { Authorization: req.headers.authorization }
      });
      res.json(response.data);
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/backtests/:id/cancel
router.post('/:id/cancel',
  validate({
    params: commonSchemas.id
  }),
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const response = await backtestServiceProxy.post(`/backtests/${req.params.id}/cancel`, {}, {
        headers: { Authorization: req.headers.authorization }
      });
      res.json(response.data);
    } catch (error) {
      next(error);
    }
  }
);

export { router as backtestRoutes };