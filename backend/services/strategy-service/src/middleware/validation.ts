import { Request, Response, NextFunction } from 'express';
import Joi from 'joi';
import { createError } from './errorHandler';

// Strategy node validation schema
const strategyNodeSchema = Joi.object({
  id: Joi.string().required(),
  type: Joi.string().valid('entry', 'exit', 'indicator', 'operator', 'position-size').required(),
  config: Joi.object().required(),
  position: Joi.object({
    x: Joi.number().required(),
    y: Joi.number().required()
  }).required()
});

// Strategy connection validation schema
const strategyConnectionSchema = Joi.object({
  id: Joi.string().required(),
  source: Joi.string().required(),
  target: Joi.string().required(),
  sourceHandle: Joi.string().optional(),
  targetHandle: Joi.string().optional()
});

// Position sizing configuration schema
const positionSizingConfigSchema = Joi.object({
  method: Joi.string().valid('fixed', 'percentage', 'kelly', 'volatility').required(),
  value: Joi.number().positive().required(),
  maxPosition: Joi.number().positive().required()
});

// Risk configuration schema
const riskConfigSchema = Joi.object({
  maxDrawdown: Joi.number().min(0).max(1).required(),
  dailyLossLimit: Joi.number().min(0).max(1).required(),
  positionLimit: Joi.number().positive().required(),
  correlationLimit: Joi.number().min(0).max(1).required()
});

// Strategy parameters schema
const strategyParametersSchema = Joi.object({
  timeframe: Joi.string().valid('1m', '5m', '15m', '30m', '1h', '4h', '1d', '1w').required(),
  positionSizing: positionSizingConfigSchema.required(),
  riskManagement: riskConfigSchema.required()
});

// Strategy configuration schema
const strategyConfigSchema = Joi.object({
  nodes: Joi.array().items(strategyNodeSchema).min(1).required(),
  connections: Joi.array().items(strategyConnectionSchema).required(),
  parameters: strategyParametersSchema.required()
});

// Validation schemas for different endpoints
const validationSchemas = {
  createStrategy: Joi.object({
    name: Joi.string().min(3).max(255).required(),
    description: Joi.string().max(1000).optional(),
    config: strategyConfigSchema.required(),
    tags: Joi.array().items(Joi.string().max(50)).max(10).optional(),
    isTemplate: Joi.boolean().optional()
  }),

  updateStrategy: Joi.object({
    name: Joi.string().min(3).max(255).optional(),
    description: Joi.string().max(1000).allow('').optional(),
    config: strategyConfigSchema.optional(),
    tags: Joi.array().items(Joi.string().max(50)).max(10).optional(),
    isActive: Joi.boolean().optional()
  }).min(1), // At least one field must be provided

  strategyExecution: Joi.object({
    portfolioId: Joi.string().uuid().required(),
    executionMode: Joi.string().valid('paper', 'live', 'backtest').required(),
    executionParams: Joi.object().optional()
  })
};

export const validateRequest = (schemaName: keyof typeof validationSchemas) => {
  return (req: Request, _res: Response, next: NextFunction) => {
    const schema = validationSchemas[schemaName];
    
    if (!schema) {
      return next(createError('Invalid validation schema', 500, 'INVALID_VALIDATION_SCHEMA'));
    }

    const { error, value } = schema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true,
      convert: true
    });

    if (error) {
      const details = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message,
        value: detail.context?.value
      }));

      return next(createError(
        'Validation failed',
        400,
        'VALIDATION_ERROR',
        { details }
      ));
    }

    // Replace req.body with validated and sanitized data
    req.body = value;
    next();
  };
};

export const validateQueryParams = (schema: Joi.ObjectSchema) => {
  return (req: Request, _res: Response, next: NextFunction) => {
    const { error, value } = schema.validate(req.query, {
      abortEarly: false,
      stripUnknown: true,
      convert: true
    });

    if (error) {
      const details = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message,
        value: detail.context?.value
      }));

      return next(createError(
        'Query parameter validation failed',
        400,
        'QUERY_VALIDATION_ERROR',
        { details }
      ));
    }

    // Replace req.query with validated and sanitized data
    req.query = value;
    next();
  };
};

// Common query parameter schemas
export const paginationSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  sortBy: Joi.string().optional(),
  sortOrder: Joi.string().valid('ASC', 'DESC').default('DESC')
});

export const strategyFiltersSchema = Joi.object({
  isActive: Joi.boolean().optional(),
  isTemplate: Joi.boolean().optional(),
  tags: Joi.string().optional(), // Will be split into array
  search: Joi.string().max(255).optional()
}).concat(paginationSchema);