import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { CentralizedLogger } from './logger';

export interface RequestWithLogger extends Request {
  logger: CentralizedLogger;
  requestId: string;
  startTime: number;
}

export function createLoggingMiddleware(logger: CentralizedLogger) {
  return (req: RequestWithLogger, res: Response, next: NextFunction) => {
    // Add request ID and logger to request object
    req.requestId = uuidv4();
    req.logger = logger;
    req.startTime = Date.now();

    // Log incoming request
    logger.logRequest(req.method, req.url, {
      requestId: req.requestId,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      userId: (req as any).user?.userId
    });

    // Override res.end to log response
    const originalEnd = res.end;
    res.end = function(chunk?: any, encoding?: any) {
      const duration = Date.now() - req.startTime;
      
      logger.logResponse(req.method, req.url, res.statusCode, duration, {
        requestId: req.requestId,
        userId: (req as any).user?.userId,
        responseSize: res.get('Content-Length')
      });

      // Call original end method
      originalEnd.call(this, chunk, encoding);
    };

    next();
  };
}

export function createErrorLoggingMiddleware(logger: CentralizedLogger) {
  return (error: Error, req: RequestWithLogger, res: Response, next: NextFunction) => {
    logger.error('Request error', error, {
      requestId: req.requestId,
      method: req.method,
      url: req.url,
      userId: (req as any).user?.userId,
      ip: req.ip
    });

    next(error);
  };
}