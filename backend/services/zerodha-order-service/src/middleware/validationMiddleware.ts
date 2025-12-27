import { Request, Response, NextFunction } from 'express';
import { ZerodhaValidators } from '@tradeflow/zerodha-utils';
import { logger } from '../utils/logger';

export const validateOrderRequest = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  try {
    const orderRequest = req.body;

    // Validate order request parameters
    const validation = ZerodhaValidators.validateOrderRequest(orderRequest);

    if (!validation.valid) {
      logger.warn('Order validation failed:', {
        errors: validation.errors,
        orderRequest
      });

      res.status(400).json({
        success: false,
        errors: validation.errors,
        warnings: validation.warnings
      });
      return;
    }

    // Add warnings to request for later use
    if (validation.warnings && validation.warnings.length > 0) {
      req.body._warnings = validation.warnings;
    }

    next();

  } catch (error) {
    logger.error('Validation middleware error:', error);
    res.status(500).json({
      success: false,
      error: 'Validation error occurred'
    });
  }
};

export const validateOrderModification = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  try {
    const modifications = req.body;
    const { orderId } = req.params;

    // Basic validation for modification parameters
    if (!orderId) {
      res.status(400).json({
        success: false,
        error: 'Order ID is required'
      });
      return;
    }

    // Validate that at least one modifiable field is provided
    const modifiableFields = ['quantity', 'price', 'trigger_price', 'order_type', 'validity'];
    const providedFields = Object.keys(modifications);
    const validFields = providedFields.filter(field => modifiableFields.includes(field));

    if (validFields.length === 0) {
      res.status(400).json({
        success: false,
        error: 'At least one modifiable field is required',
        validFields: modifiableFields
      });
      return;
    }

    // Validate individual field values
    const errors: string[] = [];

    if (modifications.quantity !== undefined) {
      if (typeof modifications.quantity !== 'number' || modifications.quantity <= 0) {
        errors.push('Quantity must be a positive number');
      }
    }

    if (modifications.price !== undefined) {
      if (typeof modifications.price !== 'number' || modifications.price <= 0) {
        errors.push('Price must be a positive number');
      }
    }

    if (modifications.trigger_price !== undefined) {
      if (typeof modifications.trigger_price !== 'number' || modifications.trigger_price <= 0) {
        errors.push('Trigger price must be a positive number');
      }
    }

    if (errors.length > 0) {
      res.status(400).json({
        success: false,
        errors
      });
      return;
    }

    next();

  } catch (error) {
    logger.error('Order modification validation error:', error);
    res.status(500).json({
      success: false,
      error: 'Validation error occurred'
    });
  }
};

export const validateBatchRequest = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  try {
    const { orders } = req.body;

    if (!Array.isArray(orders)) {
      res.status(400).json({
        success: false,
        error: 'Orders must be an array'
      });
      return;
    }

    if (orders.length === 0) {
      res.status(400).json({
        success: false,
        error: 'At least one order is required'
      });
      return;
    }

    if (orders.length > 50) {
      res.status(400).json({
        success: false,
        error: 'Maximum 50 orders allowed in batch'
      });
      return;
    }

    // Validate each order in the batch
    const errors: string[] = [];
    const warnings: string[] = [];

    orders.forEach((order, index) => {
      const validation = ZerodhaValidators.validateOrderRequest(order);
      
      if (!validation.valid) {
        errors.push(`Order ${index + 1}: ${validation.errors.join(', ')}`);
      }

      if (validation.warnings) {
        warnings.push(`Order ${index + 1}: ${validation.warnings.join(', ')}`);
      }
    });

    if (errors.length > 0) {
      res.status(400).json({
        success: false,
        errors,
        warnings: warnings.length > 0 ? warnings : undefined
      });
      return;
    }

    // Add warnings to request
    if (warnings.length > 0) {
      req.body._warnings = warnings;
    }

    next();

  } catch (error) {
    logger.error('Batch validation error:', error);
    res.status(500).json({
      success: false,
      error: 'Validation error occurred'
    });
  }
};

export const validateQueryParams = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  try {
    const { limit, offset, fromDate, toDate } = req.query;

    // Validate limit
    if (limit !== undefined) {
      const limitNum = parseInt(limit as string);
      if (isNaN(limitNum) || limitNum <= 0 || limitNum > 1000) {
        res.status(400).json({
          success: false,
          error: 'Limit must be a number between 1 and 1000'
        });
        return;
      }
    }

    // Validate offset
    if (offset !== undefined) {
      const offsetNum = parseInt(offset as string);
      if (isNaN(offsetNum) || offsetNum < 0) {
        res.status(400).json({
          success: false,
          error: 'Offset must be a non-negative number'
        });
        return;
      }
    }

    // Validate date range
    if (fromDate || toDate) {
      const from = fromDate ? new Date(fromDate as string) : null;
      const to = toDate ? new Date(toDate as string) : null;

      if (from && isNaN(from.getTime())) {
        res.status(400).json({
          success: false,
          error: 'Invalid fromDate format'
        });
        return;
      }

      if (to && isNaN(to.getTime())) {
        res.status(400).json({
          success: false,
          error: 'Invalid toDate format'
        });
        return;
      }

      if (from && to && from >= to) {
        res.status(400).json({
          success: false,
          error: 'fromDate must be before toDate'
        });
        return;
      }
    }

    next();

  } catch (error) {
    logger.error('Query params validation error:', error);
    res.status(500).json({
      success: false,
      error: 'Validation error occurred'
    });
  }
};