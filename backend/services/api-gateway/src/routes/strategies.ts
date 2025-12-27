import { Router } from 'express';
import { validate, commonSchemas } from '../middleware/validation';
import { ServiceProxy } from '../services/serviceProxy';
import { AuthenticatedRequest } from '../middleware/auth';
import Joi from 'joi';

const router = Router();
const strategyServiceProxy = new ServiceProxy('strategyService');

// GET /api/strategies
router.get('/', 
  validate({
    query: commonSchemas.pagination
  }),
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const response = await strategyServiceProxy.get('/strategies', {
        headers: { Authorization: req.headers.authorization },
        params: req.query
      });
      res.json(response.data);
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/strategies/:id
router.get('/:id',
  validate({
    params: commonSchemas.id
  }),
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const response = await strategyServiceProxy.get(`/strategies/${req.params.id}`, {
        headers: { Authorization: req.headers.authorization }
      });
      res.json(response.data);
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/strategies
router.post('/',
  validate({
    body: commonSchemas.strategyConfig
  }),
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const response = await strategyServiceProxy.post('/strategies', req.body, {
        headers: { Authorization: req.headers.authorization }
      });
      res.status(201).json(response.data);
    } catch (error) {
      next(error);
    }
  }
);

// PUT /api/strategies/:id
router.put('/:id',
  validate({
    params: commonSchemas.id,
    body: commonSchemas.strategyConfig
  }),
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const response = await strategyServiceProxy.put(`/strategies/${req.params.id}`, req.body, {
        headers: { Authorization: req.headers.authorization }
      });
      res.json(response.data);
    } catch (error) {
      next(error);
    }
  }
);

// DELETE /api/strategies/:id
router.delete('/:id',
  validate({
    params: commonSchemas.id
  }),
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const response = await strategyServiceProxy.delete(`/strategies/${req.params.id}`, {
        headers: { Authorization: req.headers.authorization }
      });
      res.json(response.data);
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/strategies/:id/validate
router.post('/:id/validate',
  validate({
    params: commonSchemas.id
  }),
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const response = await strategyServiceProxy.post(`/strategies/${req.params.id}/validate`, {}, {
        headers: { Authorization: req.headers.authorization }
      });
      res.json(response.data);
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/strategies/:id/start
router.post('/:id/start',
  validate({
    params: commonSchemas.id,
    body: Joi.object({
      symbol: commonSchemas.symbol.required(),
      capital: Joi.number().positive().required()
    })
  }),
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const response = await strategyServiceProxy.post(`/strategies/${req.params.id}/start`, req.body, {
        headers: { Authorization: req.headers.authorization }
      });
      res.json(response.data);
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/strategies/:id/stop
router.post('/:id/stop',
  validate({
    params: commonSchemas.id
  }),
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const response = await strategyServiceProxy.post(`/strategies/${req.params.id}/stop`, {}, {
        headers: { Authorization: req.headers.authorization }
      });
      res.json(response.data);
    } catch (error) {
      next(error);
    }
  }
);

export { router as strategyRoutes };