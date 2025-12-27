import { MarketData, RealTimeQuote, ValidationResult, HistoricalDataRequest } from '../types';
import logger from '../utils/logger';

class DataValidator {
  validateSymbol(symbol: string): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!symbol || typeof symbol !== 'string') {
      errors.push('Symbol must be a non-empty string');
    } else {
      const cleanSymbol = symbol.trim().toUpperCase();
      if (cleanSymbol.length === 0) {
        errors.push('Symbol cannot be empty');
      } else if (cleanSymbol.length > 10) {
        warnings.push('Symbol is unusually long');
      } else if (!/^[A-Z0-9.-]+$/.test(cleanSymbol)) {
        errors.push('Symbol contains invalid characters');
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  validateHistoricalDataRequest(request: HistoricalDataRequest): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Validate symbol
    const symbolValidation = this.validateSymbol(request.symbol);
    errors.push(...symbolValidation.errors);
    warnings.push(...symbolValidation.warnings);

    // Validate timeframe
    const validTimeframes = ['1min', '5min', '15min', '30min', '60min', '1day'];
    if (!validTimeframes.includes(request.timeframe)) {
      errors.push(`Invalid timeframe. Must be one of: ${validTimeframes.join(', ')}`);
    }

    // Validate dates
    if (!(request.startDate instanceof Date) || isNaN(request.startDate.getTime())) {
      errors.push('Start date must be a valid Date object');
    }

    if (!(request.endDate instanceof Date) || isNaN(request.endDate.getTime())) {
      errors.push('End date must be a valid Date object');
    }

    if (request.startDate && request.endDate && request.startDate >= request.endDate) {
      errors.push('Start date must be before end date');
    }

    // Check date range
    if (request.startDate && request.endDate) {
      const daysDiff = (request.endDate.getTime() - request.startDate.getTime()) / (1000 * 60 * 60 * 24);
      
      if (daysDiff > 365) {
        warnings.push('Date range exceeds 1 year, this may result in large data sets');
      }

      const now = new Date();
      if (request.endDate > now) {
        warnings.push('End date is in the future');
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  validateMarketData(data: MarketData): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Validate symbol
    const symbolValidation = this.validateSymbol(data.symbol);
    errors.push(...symbolValidation.errors);
    warnings.push(...symbolValidation.warnings);

    // Validate timestamp
    if (!(data.timestamp instanceof Date) || isNaN(data.timestamp.getTime())) {
      errors.push('Timestamp must be a valid Date object');
    }

    // Validate price data
    const priceFields = ['open', 'high', 'low', 'close'];
    for (const field of priceFields) {
      const value = data[field as keyof MarketData] as number;
      if (typeof value !== 'number' || isNaN(value) || value <= 0) {
        errors.push(`${field} must be a positive number`);
      }
    }

    // Validate volume
    if (typeof data.volume !== 'number' || isNaN(data.volume) || data.volume < 0) {
      errors.push('Volume must be a non-negative number');
    }

    // Validate price relationships
    if (data.high < data.low) {
      errors.push('High price cannot be less than low price');
    }

    if (data.high < data.open || data.high < data.close) {
      errors.push('High price must be >= open and close prices');
    }

    if (data.low > data.open || data.low > data.close) {
      errors.push('Low price must be <= open and close prices');
    }

    // Check for unusual price movements
    if (data.open > 0 && data.close > 0) {
      const changePercent = Math.abs((data.close - data.open) / data.open) * 100;
      if (changePercent > 50) {
        warnings.push(`Unusual price movement: ${changePercent.toFixed(2)}% change`);
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  validateRealTimeQuote(quote: RealTimeQuote): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Validate symbol
    const symbolValidation = this.validateSymbol(quote.symbol);
    errors.push(...symbolValidation.errors);
    warnings.push(...symbolValidation.warnings);

    // Validate timestamp
    if (!(quote.timestamp instanceof Date) || isNaN(quote.timestamp.getTime())) {
      errors.push('Timestamp must be a valid Date object');
    }

    // Validate prices
    const priceFields = ['price', 'bid', 'ask'];
    for (const field of priceFields) {
      const value = quote[field as keyof RealTimeQuote] as number;
      if (typeof value !== 'number' || isNaN(value) || value <= 0) {
        errors.push(`${field} must be a positive number`);
      }
    }

    // Validate volume
    if (typeof quote.volume !== 'number' || isNaN(quote.volume) || quote.volume < 0) {
      errors.push('Volume must be a non-negative number');
    }

    // Validate bid-ask spread
    if (quote.bid > 0 && quote.ask > 0 && quote.bid >= quote.ask) {
      errors.push('Bid price must be less than ask price');
    }

    // Check for reasonable bid-ask spread
    if (quote.bid > 0 && quote.ask > 0) {
      const spread = quote.ask - quote.bid;
      const spreadPercent = (spread / quote.price) * 100;
      if (spreadPercent > 10) {
        warnings.push(`Wide bid-ask spread: ${spreadPercent.toFixed(2)}%`);
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  normalizeSymbol(symbol: string): string {
    return symbol.trim().toUpperCase();
  }

  sanitizeMarketData(data: MarketData[]): MarketData[] {
    return data
      .filter(item => {
        const validation = this.validateMarketData(item);
        if (!validation.isValid) {
          logger.warn(`Filtering out invalid market data for ${item.symbol}:`, validation.errors);
          return false;
        }
        return true;
      })
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }
}

export default new DataValidator();