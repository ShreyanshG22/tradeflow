import { Request, Response, NextFunction } from 'express';
import { MetricsCollector } from './metrics-collector';

export interface RequestWithMetrics extends Request {
  metricsCollector: MetricsCollector;
  startTime: number;
}

export function createMetricsMiddleware(metricsCollector: MetricsCollector) {
  return (req: RequestWithMetrics, res: Response, next: NextFunction) => {
    req.metricsCollector = metricsCollector;
    req.startTime = Date.now();
    
    // Increment in-flight requests
    metricsCollector.incrementHttpRequestsInFlight();
    
    // Override res.end to capture metrics
    const originalEnd = res.end;
    res.end = function(chunk?: any, encoding?: any) {
      const duration = (Date.now() - req.startTime) / 1000; // Convert to seconds
      const route = req.route?.path || req.path;
      
      // Record HTTP request metrics
      metricsCollector.recordHttpRequest(
        req.method,
        route,
        res.statusCode,
        duration
      );
      
      // Decrement in-flight requests
      metricsCollector.decrementHttpRequestsInFlight();
      
      // Call original end method
      originalEnd.call(this, chunk, encoding);
    };
    
    next();
  };
}

export function createMetricsEndpoint(metricsCollector: MetricsCollector) {
  return async (req: Request, res: Response) => {
    try {
      const metrics = await metricsCollector.getMetrics();
      res.set('Content-Type', 'text/plain');
      res.send(metrics);
    } catch (error) {
      res.status(500).send('Error collecting metrics');
    }
  };
}

// Database operation timing decorator
export function timed(metricsCollector: MetricsCollector, operation: string, table?: string) {
  return function(target: any, propertyName: string, descriptor: PropertyDescriptor) {
    const method = descriptor.value;
    
    descriptor.value = async function(...args: any[]) {
      const startTime = Date.now();
      let success = true;
      
      try {
        const result = await method.apply(this, args);
        return result;
      } catch (error) {
        success = false;
        throw error;
      } finally {
        const duration = (Date.now() - startTime) / 1000;
        if (table) {
          metricsCollector.recordDatabaseQuery(operation, table, duration, success);
        } else {
          metricsCollector.recordBusinessOperation(operation, duration, success);
        }
      }
    };
  };
}

// Business operation timing decorator
export function businessOperation(metricsCollector: MetricsCollector, operationName: string) {
  return function(target: any, propertyName: string, descriptor: PropertyDescriptor) {
    const method = descriptor.value;
    
    descriptor.value = async function(...args: any[]) {
      const startTime = Date.now();
      let success = true;
      
      try {
        const result = await method.apply(this, args);
        return result;
      } catch (error) {
        success = false;
        throw error;
      } finally {
        const duration = (Date.now() - startTime) / 1000;
        metricsCollector.recordBusinessOperation(operationName, duration, success);
      }
    };
  };
}