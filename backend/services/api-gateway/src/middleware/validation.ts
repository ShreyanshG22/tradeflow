import { Request, Response, NextFunction } from 'express';
import Joi from 'joi';
import { ValidationError } from './errorHandler';

export interface ValidationSchema {
  body?: Joi.ObjectSchema;
  query?: Joi.ObjectSchema;
  params?: Joi.ObjectSchema;
  headers?: Joi.ObjectSchema;
}

export const validate = (schema: ValidationSchema) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const errors: any = {};

    // Validate request body
    if (schema.body) {
      const { error, value } = schema.body.validate(req.body, {
        abortEarly: false,
        stripUnknown: true,
        convert: true
      });
      
      if (error) {
        errors.body = error.details.map(detail => ({
          field: detail.path.join('.'),
          message: detail.message,
          value: detail.context?.value
        }));
      } else {
        req.body = value;
      }
    }

    // Validate query parameters
    if (schema.query) {
      const { error, value } = schema.query.validate(req.query, {
        abortEarly: false,
        stripUnknown: true,
        convert: true
      });
      
      if (error) {
        errors.query = error.details.map(detail => ({
          field: detail.path.join('.'),
          message: detail.message,
          value: detail.context?.value
        }));
      } else {
        req.query = value;
      }
    }

    // Validate URL parameters
    if (schema.params) {
      const { error, value } = schema.params.validate(req.params, {
        abortEarly: false,
        stripUnknown: true,
        convert: true
      });
      
      if (error) {
        errors.params = error.details.map(detail => ({
          field: detail.path.join('.'),
          message: detail.message,
          value: detail.context?.value
        }));
      } else {
        req.params = value;
      }
    }

    // Validate headers
    if (schema.headers) {
      const { error, value } = schema.headers.validate(req.headers, {
        abortEarly: false,
        stripUnknown: true,
        convert: true
      });
      
      if (error) {
        errors.headers = error.details.map(detail => ({
          field: detail.path.join('.'),
          message: detail.message,
          value: detail.context?.value
        }));
      } else {
        req.headers = { ...req.headers, ...value };
      }
    }

    // If there are validation errors, throw ValidationError
    if (Object.keys(errors).length > 0) {
      throw new ValidationError('Validation failed', errors);
    }

    next();
  };
};

// Common validation schemas
export const commonSchemas = {
  // Pagination
  pagination: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20),
    sort: Joi.string().optional(),
    order: Joi.string().valid('asc', 'desc').default('desc')
  }),

  // ID parameter
  id: Joi.object({
    id: Joi.string().uuid().required()
  }),

  // Date range
  dateRange: Joi.object({
    startDate: Joi.date().iso().optional(),
    endDate: Joi.date().iso().min(Joi.ref('startDate')).optional()
  }),

  // Symbol validation
  symbol: Joi.string().uppercase().min(1).max(10).pattern(/^[A-Z]+$/),

  // Strategy validation
  strategyConfig: Joi.object({
    name: Joi.string().min(1).max(100).required(),
    description: Joi.string().max(500).optional(),
    nodes: Joi.array().items(Joi.object({
      id: Joi.string().required(),
      type: Joi.string().valid('entry', 'exit', 'indicator', 'operator', 'position-size').required(),
      config: Joi.object().required(),
      position: Joi.object({
        x: Joi.number().required(),
        y: Joi.number().required()
      }).required()
    })).min(1).required(),
    connections: Joi.array().items(Joi.object({
      id: Joi.string().required(),
      source: Joi.string().required(),
      target: Joi.string().required(),
      sourceHandle: Joi.string().optional(),
      targetHandle: Joi.string().optional()
    })).required(),
    parameters: Joi.object({
      timeframe: Joi.string().valid('1m', '5m', '15m', '30m', '1h', '4h', '1d').required(),
      positionSizing: Joi.object({
        type: Joi.string().valid('fixed', 'percentage', 'risk-based').required(),
        value: Joi.number().positive().required()
      }).required(),
      riskManagement: Joi.object({
        maxDrawdown: Joi.number().min(0).max(1).optional(),
        maxPositionSize: Joi.number().positive().optional(),
        stopLoss: Joi.number().positive().optional(),
        takeProfit: Joi.number().positive().optional()
      }).optional()
    }).required()
  }),

  // Backtest parameters
  backtestParams: Joi.object({
    strategyId: Joi.string().uuid().required(),
    symbol: commonSchemas.symbol.required(),
    startDate: Joi.date().iso().required(),
    endDate: Joi.date().iso().min(Joi.ref('startDate')).required(),
    initialCapital: Joi.number().positive().default(10000),
    commission: Joi.number().min(0).max(1).default(0.001)
  })
};

// Sanitization helpers
export const sanitizeInput = {
  // Remove potentially dangerous characters
  cleanString: (str: string): string => {
    return str.replace(/[<>\"'%;()&+]/g, '');
  },

  // Normalize email
  normalizeEmail: (email: string): string => {
    return email.toLowerCase().trim();
  },

  // Clean numeric input
  cleanNumber: (num: any): number | null => {
    const parsed = parseFloat(num);
    return isNaN(parsed) ? null : parsed;
  }
};