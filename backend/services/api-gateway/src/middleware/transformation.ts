import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

export interface TransformationRule {
  path: string | RegExp;
  method?: string;
  requestTransform?: (data: any) => any;
  responseTransform?: (data: any) => any;
}

export class RequestTransformer {
  private rules: TransformationRule[] = [];

  public addRule(rule: TransformationRule): void {
    this.rules.push(rule);
  }

  public transformRequest(req: Request): any {
    const matchingRule = this.findMatchingRule(req);
    
    if (matchingRule?.requestTransform) {
      try {
        const transformed = matchingRule.requestTransform(req.body);
        logger.debug('Request transformed', {
          path: req.path,
          method: req.method,
          originalSize: JSON.stringify(req.body).length,
          transformedSize: JSON.stringify(transformed).length
        });
        return transformed;
      } catch (error) {
        logger.error('Request transformation failed', {
          path: req.path,
          method: req.method,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        return req.body;
      }
    }

    return req.body;
  }

  public transformResponse(req: Request, data: any): any {
    const matchingRule = this.findMatchingRule(req);
    
    if (matchingRule?.responseTransform) {
      try {
        const transformed = matchingRule.responseTransform(data);
        logger.debug('Response transformed', {
          path: req.path,
          method: req.method,
          originalSize: JSON.stringify(data).length,
          transformedSize: JSON.stringify(transformed).length
        });
        return transformed;
      } catch (error) {
        logger.error('Response transformation failed', {
          path: req.path,
          method: req.method,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        return data;
      }
    }

    return data;
  }

  private findMatchingRule(req: Request): TransformationRule | null {
    return this.rules.find(rule => {
      const pathMatches = typeof rule.path === 'string' 
        ? req.path === rule.path 
        : rule.path.test(req.path);
      
      const methodMatches = !rule.method || rule.method === req.method;
      
      return pathMatches && methodMatches;
    }) || null;
  }
}

// Predefined transformation rules
export const defaultTransformationRules: TransformationRule[] = [
  // Strategy configuration transformation
  {
    path: /^\/api\/strategies/,
    method: 'POST',
    requestTransform: (data) => {
      // Normalize strategy configuration
      if (data.nodes) {
        data.nodes = data.nodes.map((node: any) => ({
          ...node,
          id: node.id.toString(),
          position: {
            x: Math.round(node.position.x),
            y: Math.round(node.position.y)
          }
        }));
      }
      
      if (data.connections) {
        data.connections = data.connections.map((conn: any) => ({
          ...conn,
          id: conn.id.toString(),
          source: conn.source.toString(),
          target: conn.target.toString()
        }));
      }
      
      return data;
    },
    responseTransform: (data) => {
      // Add computed fields to strategy response
      if (data.strategy) {
        data.strategy.nodeCount = data.strategy.nodes?.length || 0;
        data.strategy.connectionCount = data.strategy.connections?.length || 0;
        data.strategy.complexity = calculateStrategyComplexity(data.strategy);
      }
      return data;
    }
  },

  // Backtest results transformation
  {
    path: /^\/api\/backtests\/.*\/results$/,
    responseTransform: (data) => {
      if (data.results) {
        // Add percentage calculations
        if (data.results.totalReturn !== undefined) {
          data.results.totalReturnPercent = (data.results.totalReturn * 100).toFixed(2);
        }
        
        if (data.results.maxDrawdown !== undefined) {
          data.results.maxDrawdownPercent = (data.results.maxDrawdown * 100).toFixed(2);
        }
        
        // Add risk-adjusted metrics
        if (data.results.sharpeRatio !== undefined) {
          data.results.riskAdjustedReturn = data.results.sharpeRatio > 1 ? 'Good' : 
                                          data.results.sharpeRatio > 0.5 ? 'Fair' : 'Poor';
        }
      }
      return data;
    }
  },

  // Portfolio performance transformation
  {
    path: /^\/api\/portfolio\/performance$/,
    responseTransform: (data) => {
      if (data.performance) {
        // Add trend indicators
        const performance = data.performance;
        if (performance.equityCurve && performance.equityCurve.length > 1) {
          const recent = performance.equityCurve.slice(-10);
          const trend = calculateTrend(recent.map((point: any) => point.value));
          performance.trend = trend > 0.05 ? 'up' : trend < -0.05 ? 'down' : 'sideways';
        }
        
        // Add performance grades
        if (performance.metrics) {
          performance.metrics.grade = calculatePerformanceGrade(performance.metrics);
        }
      }
      return data;
    }
  },

  // Market data transformation
  {
    path: /^\/api\/market-data/,
    responseTransform: (data) => {
      // Add computed technical indicators
      if (data.quotes || data.historical) {
        const prices = data.quotes || data.historical;
        if (Array.isArray(prices) && prices.length > 0) {
          // Add simple moving average if not present
          if (!prices[0].sma && prices.length >= 20) {
            addSimpleMovingAverage(prices, 20);
          }
          
          // Add price change indicators
          prices.forEach((price: any, index: number) => {
            if (index > 0) {
              const prevPrice = prices[index - 1];
              price.change = price.close - prevPrice.close;
              price.changePercent = ((price.change / prevPrice.close) * 100).toFixed(2);
            }
          });
        }
      }
      return data;
    }
  }
];

// Helper functions
function calculateStrategyComplexity(strategy: any): string {
  const nodeCount = strategy.nodes?.length || 0;
  const connectionCount = strategy.connections?.length || 0;
  const complexity = nodeCount + (connectionCount * 0.5);
  
  if (complexity < 5) return 'Simple';
  if (complexity < 15) return 'Moderate';
  return 'Complex';
}

function calculateTrend(values: number[]): number {
  if (values.length < 2) return 0;
  
  const firstValue = values[0];
  const lastValue = values[values.length - 1];
  return (lastValue - firstValue) / firstValue;
}

function calculatePerformanceGrade(metrics: any): string {
  let score = 0;
  
  // Sharpe ratio (0-40 points)
  if (metrics.sharpeRatio > 2) score += 40;
  else if (metrics.sharpeRatio > 1) score += 30;
  else if (metrics.sharpeRatio > 0.5) score += 20;
  else if (metrics.sharpeRatio > 0) score += 10;
  
  // Win rate (0-30 points)
  if (metrics.winRate > 0.7) score += 30;
  else if (metrics.winRate > 0.6) score += 25;
  else if (metrics.winRate > 0.5) score += 20;
  else if (metrics.winRate > 0.4) score += 10;
  
  // Max drawdown (0-30 points)
  if (metrics.maxDrawdown < 0.05) score += 30;
  else if (metrics.maxDrawdown < 0.1) score += 25;
  else if (metrics.maxDrawdown < 0.2) score += 20;
  else if (metrics.maxDrawdown < 0.3) score += 10;
  
  if (score >= 80) return 'A';
  if (score >= 70) return 'B';
  if (score >= 60) return 'C';
  if (score >= 50) return 'D';
  return 'F';
}

function addSimpleMovingAverage(prices: any[], period: number): void {
  for (let i = period - 1; i < prices.length; i++) {
    const sum = prices.slice(i - period + 1, i + 1)
                     .reduce((acc: number, price: any) => acc + price.close, 0);
    prices[i].sma = sum / period;
  }
}

// Create transformer instance with default rules
export const requestTransformer = new RequestTransformer();
defaultTransformationRules.forEach(rule => requestTransformer.addRule(rule));

// Middleware function
export const transformationMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // Transform request body
  req.body = requestTransformer.transformRequest(req);
  
  // Override res.json to transform responses
  const originalJson = res.json;
  res.json = function(data: any) {
    const transformedData = requestTransformer.transformResponse(req, data);
    return originalJson.call(this, transformedData);
  };
  
  next();
};