import { Request, Response, NextFunction } from 'express';
import { ApiError } from './errorHandler';

export const validateSymbol = (req: Request, res: Response, next: NextFunction) => {
  const { symbol } = req.params;
  
  if (!symbol || typeof symbol !== 'string') {
    const error: ApiError = new Error('Symbol parameter is required');
    error.statusCode = 400;
    return next(error);
  }

  const cleanSymbol = symbol.trim().toUpperCase();
  if (cleanSymbol.length === 0) {
    const error: ApiError = new Error('Symbol cannot be empty');
    error.statusCode = 400;
    return next(error);
  }

  if (cleanSymbol.length > 10) {
    const error: ApiError = new Error('Symbol is too long (max 10 characters)');
    error.statusCode = 400;
    return next(error);
  }

  if (!/^[A-Z0-9.-]+$/.test(cleanSymbol)) {
    const error: ApiError = new Error('Symbol contains invalid characters');
    error.statusCode = 400;
    return next(error);
  }

  // Add normalized symbol to request for downstream use
  req.params.symbol = cleanSymbol;
  next();
};

export const validateTimeframe = (req: Request, res: Response, next: NextFunction) => {
  const { timeframe } = req.query;
  
  if (timeframe) {
    const validTimeframes = ['1min', '5min', '15min', '30min', '60min', '1day'];
    if (!validTimeframes.includes(timeframe as string)) {
      const error: ApiError = new Error(`Invalid timeframe. Must be one of: ${validTimeframes.join(', ')}`);
      error.statusCode = 400;
      return next(error);
    }
  }

  next();
};

export const validateDateRange = (req: Request, res: Response, next: NextFunction) => {
  const { startDate, endDate } = req.query;

  if (startDate) {
    const start = new Date(startDate as string);
    if (isNaN(start.getTime())) {
      const error: ApiError = new Error('Invalid startDate format. Use ISO 8601 format (YYYY-MM-DD)');
      error.statusCode = 400;
      return next(error);
    }
  }

  if (endDate) {
    const end = new Date(endDate as string);
    if (isNaN(end.getTime())) {
      const error: ApiError = new Error('Invalid endDate format. Use ISO 8601 format (YYYY-MM-DD)');
      error.statusCode = 400;
      return next(error);
    }
  }

  if (startDate && endDate) {
    const start = new Date(startDate as string);
    const end = new Date(endDate as string);
    
    if (start >= end) {
      const error: ApiError = new Error('startDate must be before endDate');
      error.statusCode = 400;
      return next(error);
    }

    // Check for reasonable date range (max 2 years)
    const daysDiff = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
    if (daysDiff > 730) {
      const error: ApiError = new Error('Date range cannot exceed 2 years');
      error.statusCode = 400;
      return next(error);
    }
  }

  next();
};

export const validateSymbolsArray = (req: Request, res: Response, next: NextFunction) => {
  const { symbols } = req.body;

  if (!Array.isArray(symbols)) {
    const error: ApiError = new Error('symbols must be an array');
    error.statusCode = 400;
    return next(error);
  }

  if (symbols.length === 0) {
    const error: ApiError = new Error('symbols array cannot be empty');
    error.statusCode = 400;
    return next(error);
  }

  if (symbols.length > 100) {
    const error: ApiError = new Error('Maximum 100 symbols allowed per request');
    error.statusCode = 400;
    return next(error);
  }

  // Validate each symbol
  for (let i = 0; i < symbols.length; i++) {
    const symbol = symbols[i];
    
    if (!symbol || typeof symbol !== 'string') {
      const error: ApiError = new Error(`Symbol at index ${i} must be a non-empty string`);
      error.statusCode = 400;
      return next(error);
    }

    const cleanSymbol = symbol.trim().toUpperCase();
    if (cleanSymbol.length === 0) {
      const error: ApiError = new Error(`Symbol at index ${i} cannot be empty`);
      error.statusCode = 400;
      return next(error);
    }

    if (cleanSymbol.length > 10) {
      const error: ApiError = new Error(`Symbol at index ${i} is too long (max 10 characters)`);
      error.statusCode = 400;
      return next(error);
    }

    if (!/^[A-Z0-9.-]+$/.test(cleanSymbol)) {
      const error: ApiError = new Error(`Symbol at index ${i} contains invalid characters`);
      error.statusCode = 400;
      return next(error);
    }

    // Normalize the symbol
    symbols[i] = cleanSymbol;
  }

  // Remove duplicates
  req.body.symbols = [...new Set(symbols)];
  next();
};

export const rateLimitMiddleware = (maxRequests: number, windowMs: number) => {
  const requests = new Map<string, { count: number; resetTime: number }>();

  return (req: Request, res: Response, next: NextFunction) => {
    const clientId = req.ip || 'unknown';
    const now = Date.now();
    
    const clientData = requests.get(clientId);
    
    if (!clientData || now > clientData.resetTime) {
      // Reset or initialize
      requests.set(clientId, {
        count: 1,
        resetTime: now + windowMs,
      });
      return next();
    }

    if (clientData.count >= maxRequests) {
      const error: ApiError = new Error('Rate limit exceeded');
      error.statusCode = 429;
      return next(error);
    }

    clientData.count++;
    next();
  };
};