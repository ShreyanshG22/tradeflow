import { Request, Response, NextFunction } from 'express';
import Joi from 'joi';

export const validateRequest = (schema: {
  body?: Joi.ObjectSchema;
  params?: Joi.ObjectSchema;
  query?: Joi.ObjectSchema;
}) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const errors: string[] = [];

    // Validate request body
    if (schema.body) {
      const { error } = schema.body.validate(req.body);
      if (error) {
        errors.push(`Body: ${error.details.map(d => d.message).join(', ')}`);
      }
    }

    // Validate request params
    if (schema.params) {
      const { error } = schema.params.validate(req.params);
      if (error) {
        errors.push(`Params: ${error.details.map(d => d.message).join(', ')}`);
      }
    }

    // Validate request query
    if (schema.query) {
      const { error } = schema.query.validate(req.query);
      if (error) {
        errors.push(`Query: ${error.details.map(d => d.message).join(', ')}`);
      }
    }

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request validation failed',
          details: errors,
          timestamp: new Date().toISOString()
        }
      });
    }

    next();
  };
};

// Common validation schemas
export const schemas = {
  portfolioId: Joi.object({
    portfolioId: Joi.string().uuid().required()
  }),

  createPortfolio: Joi.object({
    name: Joi.string().min(3).max(255).required(),
    description: Joi.string().max(1000).optional(),
    portfolioType: Joi.string().valid('trading', 'paper', 'backtest').required(),
    baseCurrency: Joi.string().length(3).uppercase().optional(),
    initialCash: Joi.number().min(0).required()
  }),

  updatePortfolio: Joi.object({
    name: Joi.string().min(3).max(255).optional(),
    description: Joi.string().max(1000).optional(),
    isActive: Joi.boolean().optional()
  }).min(1),

  portfolioQuery: Joi.object({
    portfolioType: Joi.string().valid('trading', 'paper', 'backtest').optional(),
    isActive: Joi.boolean().optional(),
    limit: Joi.number().integer().min(1).max(100).optional(),
    offset: Joi.number().integer().min(0).optional()
  }),

  positionQuery: Joi.object({
    symbol: Joi.string().max(20).optional(),
    side: Joi.string().valid('long', 'short').optional(),
    minQuantity: Joi.number().min(0).optional(),
    limit: Joi.number().integer().min(1).max(100).optional(),
    offset: Joi.number().integer().min(0).optional()
  }),

  tradeQuery: Joi.object({
    strategyId: Joi.string().uuid().optional(),
    symbol: Joi.string().max(20).optional(),
    side: Joi.string().valid('buy', 'sell').optional(),
    status: Joi.string().valid('pending', 'filled', 'cancelled', 'rejected', 'partial').optional(),
    startDate: Joi.date().optional(),
    endDate: Joi.date().optional(),
    limit: Joi.number().integer().min(1).max(100).optional(),
    offset: Joi.number().integer().min(0).optional()
  }),

  currencyConversion: Joi.object({
    amount: Joi.number().required(),
    fromCurrency: Joi.string().length(3).uppercase().required(),
    toCurrency: Joi.string().length(3).uppercase().required()
  })
};