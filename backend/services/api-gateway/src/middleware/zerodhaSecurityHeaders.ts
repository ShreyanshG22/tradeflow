import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

export interface ZerodhaSecurityConfig {
  enableCSP: boolean;
  enableHSTS: boolean;
  enableXFrameOptions: boolean;
  enableXContentTypeOptions: boolean;
  enableReferrerPolicy: boolean;
  enablePermissionsPolicy: boolean;
}

const defaultConfig: ZerodhaSecurityConfig = {
  enableCSP: true,
  enableHSTS: true,
  enableXFrameOptions: true,
  enableXContentTypeOptions: true,
  enableReferrerPolicy: true,
  enablePermissionsPolicy: true
};

export function zerodhaSecurityHeaders(config: Partial<ZerodhaSecurityConfig> = {}) {
  const finalConfig = { ...defaultConfig, ...config };

  return (req: Request, res: Response, next: NextFunction) => {
    // Content Security Policy - Strict for financial data
    if (finalConfig.enableCSP) {
      res.setHeader('Content-Security-Policy', [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline'", // Allow inline scripts for WebSocket connections
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: https:",
        "connect-src 'self' wss: https://api.kite.trade https://kite.zerodha.com",
        "font-src 'self'",
        "object-src 'none'",
        "media-src 'none'",
        "frame-src 'none'",
        "base-uri 'self'",
        "form-action 'self'"
      ].join('; '));
    }

    // HTTP Strict Transport Security - Force HTTPS
    if (finalConfig.enableHSTS) {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
    }

    // Prevent clickjacking
    if (finalConfig.enableXFrameOptions) {
      res.setHeader('X-Frame-Options', 'DENY');
    }

    // Prevent MIME type sniffing
    if (finalConfig.enableXContentTypeOptions) {
      res.setHeader('X-Content-Type-Options', 'nosniff');
    }

    // Referrer Policy - Strict for financial data
    if (finalConfig.enableReferrerPolicy) {
      res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    }

    // Permissions Policy - Restrict sensitive features
    if (finalConfig.enablePermissionsPolicy) {
      res.setHeader('Permissions-Policy', [
        'camera=()',
        'microphone=()',
        'geolocation=()',
        'payment=()',
        'usb=()',
        'magnetometer=()',
        'gyroscope=()',
        'accelerometer=()'
      ].join(', '));
    }

    // Additional security headers for financial APIs
    res.setHeader('X-DNS-Prefetch-Control', 'off');
    res.setHeader('X-Download-Options', 'noopen');
    res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
    res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');

    // Cache control for sensitive endpoints
    if (req.path.includes('/zerodha/')) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }

    // Add request ID for tracking
    const requestId = req.headers['x-request-id'] || 
                     Math.random().toString(36).substr(2, 9);
    res.setHeader('X-Request-ID', requestId);

    // Log security headers application
    logger.debug('Applied Zerodha security headers', {
      path: req.path,
      method: req.method,
      requestId,
      userAgent: req.headers['user-agent']
    });

    next();
  };
}

// Middleware for API versioning
export function apiVersioning(req: Request, res: Response, next: NextFunction) {
  // Set API version header
  res.setHeader('X-API-Version', 'v1');
  
  // Check if client supports the API version
  const clientVersion = req.headers['x-api-version'] || req.headers['accept-version'];
  
  if (clientVersion && clientVersion !== 'v1') {
    logger.warn('Unsupported API version requested', {
      requestedVersion: clientVersion,
      supportedVersion: 'v1',
      path: req.path,
      userAgent: req.headers['user-agent']
    });
    
    return res.status(400).json({
      error: {
        code: 'UNSUPPORTED_API_VERSION',
        message: 'API version not supported',
        supportedVersions: ['v1'],
        requestedVersion: clientVersion
      }
    });
  }

  next();
}

// Request sanitization middleware
export function requestSanitization(req: Request, res: Response, next: NextFunction) {
  // Sanitize query parameters
  if (req.query) {
    Object.keys(req.query).forEach(key => {
      if (typeof req.query[key] === 'string') {
        // Remove potentially dangerous characters
        req.query[key] = (req.query[key] as string)
          .replace(/[<>\"']/g, '')
          .trim();
      }
    });
  }

  // Sanitize request body for string fields
  if (req.body && typeof req.body === 'object') {
    sanitizeObject(req.body);
  }

  // Log sanitization
  logger.debug('Request sanitized', {
    path: req.path,
    method: req.method,
    hasQuery: Object.keys(req.query || {}).length > 0,
    hasBody: req.body !== undefined
  });

  next();
}

function sanitizeObject(obj: any): void {
  Object.keys(obj).forEach(key => {
    if (typeof obj[key] === 'string') {
      // Basic XSS prevention
      obj[key] = obj[key]
        .replace(/[<>\"']/g, '')
        .trim();
    } else if (typeof obj[key] === 'object' && obj[key] !== null) {
      sanitizeObject(obj[key]);
    }
  });
}

// Enhanced CORS configuration for Zerodha endpoints
export function zerodhaCorsPreflight(req: Request, res: Response, next: NextFunction) {
  const origin = req.headers.origin;
  const allowedOrigins = [
    'http://localhost:3000',
    'http://localhost:5173',
    'https://tradeflow.app',
    'https://app.tradeflow.com'
  ];

  // Check if origin is allowed
  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', [
      'Content-Type',
      'Authorization',
      'X-Requested-With',
      'X-API-Version',
      'X-Request-ID'
    ].join(', '));
    res.setHeader('Access-Control-Max-Age', '86400'); // 24 hours
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    
    logger.debug('CORS preflight handled', {
      origin,
      method: req.method,
      path: req.path
    });
    
    return res.status(204).end();
  }

  next();
}

// IP whitelist middleware for production
export function ipWhitelist(allowedIPs: string[] = []) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (process.env.NODE_ENV !== 'production' || allowedIPs.length === 0) {
      return next();
    }

    const clientIP = req.ip || 
                    req.connection.remoteAddress || 
                    req.headers['x-forwarded-for'] as string;

    if (!clientIP || !allowedIPs.includes(clientIP)) {
      logger.warn('IP not whitelisted', {
        clientIP,
        path: req.path,
        userAgent: req.headers['user-agent']
      });

      return res.status(403).json({
        error: {
          code: 'IP_NOT_WHITELISTED',
          message: 'Access denied from this IP address'
        }
      });
    }

    next();
  };
}