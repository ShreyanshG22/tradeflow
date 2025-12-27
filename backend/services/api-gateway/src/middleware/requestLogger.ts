import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

export const requestLogger = (req: Request, res: Response, next: NextFunction): void => {
  const startTime = Date.now();
  
  // Generate or use existing request ID
  const requestId = req.headers['x-request-id'] || 
                   `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  // Add request ID to headers for downstream services
  req.headers['x-request-id'] = requestId as string;
  res.setHeader('x-request-id', requestId);

  // Log incoming request
  logger.info('Incoming request', {
    requestId,
    method: req.method,
    url: req.url,
    userAgent: req.headers['user-agent'],
    ip: req.ip || req.connection.remoteAddress,
    forwardedFor: req.headers['x-forwarded-for'],
    contentLength: req.headers['content-length'],
    timestamp: new Date().toISOString()
  });

  // Override res.end to log response
  const originalEnd = res.end;
  res.end = function(chunk?: any, encoding?: any, cb?: any) {
    const duration = Date.now() - startTime;
    
    // Log response
    logger.info('Request completed', {
      requestId,
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      contentLength: res.getHeader('content-length'),
      timestamp: new Date().toISOString()
    });

    // Call original end method
    originalEnd.call(this, chunk, encoding, cb);
  };

  next();
};