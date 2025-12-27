import winston from 'winston';
import { TraceContextManager } from './tracing';
import { ErrorCategory, ErrorSeverity, categorizeError } from './error-handler';

// Log levels
export enum LogLevel {
  ERROR = 'error',
  WARN = 'warn',
  INFO = 'info',
  HTTP = 'http',
  VERBOSE = 'verbose',
  DEBUG = 'debug',
  SILLY = 'silly'
}

// Log context interface
export interface LogContext {
  traceId?: string;
  spanId?: string;
  userId?: string;
  sessionId?: string;
  requestId?: string;
  correlationId?: string;
  service: string;
  component?: string;
  operation?: string;
  environment: string;
  version?: string;
  [key: string]: any;
}

// Structured log entry
export interface StructuredLogEntry {
  timestamp: string;
  level: string;
  message: string;
  context: LogContext;
  metadata?: Record<string, any>;
  error?: {
    name: string;
    message: string;
    stack?: string;
    category?: ErrorCategory;
    severity?: ErrorSeverity;
  };
}

// Logger configuration
export interface StructuredLoggerConfig {
  service: string;
  level?: LogLevel;
  environment?: string;
  version?: string;
  enableConsole?: boolean;
  enableFile?: boolean;
  enableElastic?: boolean;
  fileConfig?: {
    filename: string;
    maxsize: number;
    maxFiles: number;
  };
  elasticConfig?: {
    host: string;
    index: string;
  };
}

// Structured logger class
export class StructuredLogger {
  private winston: winston.Logger;
  private config: StructuredLoggerConfig;
  private baseContext: Partial<LogContext>;

  constructor(config: StructuredLoggerConfig) {
    this.config = config;
    this.baseContext = {
      service: config.service,
      environment: config.environment || process.env.NODE_ENV || 'development',
      version: config.version || process.env.npm_package_version
    };

    this.winston = this.createWinstonLogger();
  }

  // Create Winston logger instance
  private createWinstonLogger(): winston.Logger {
    const transports: winston.transport[] = [];

    // Console transport
    if (this.config.enableConsole !== false) {
      transports.push(new winston.transports.Console({
        format: this.config.environment === 'development' 
          ? winston.format.combine(
              winston.format.colorize(),
              winston.format.timestamp(),
              winston.format.printf(this.developmentFormatter)
            )
          : winston.format.combine(
              winston.format.timestamp(),
              winston.format.json()
            )
      }));
    }

    // File transport
    if (this.config.enableFile) {
      const fileConfig = this.config.fileConfig || {
        filename: 'logs/app.log',
        maxsize: 5242880, // 5MB
        maxFiles: 5
      };

      transports.push(new winston.transports.File({
        ...fileConfig,
        format: winston.format.combine(
          winston.format.timestamp(),
          winston.format.json()
        )
      }));

      // Separate error log file
      transports.push(new winston.transports.File({
        filename: 'logs/error.log',
        level: 'error',
        maxsize: fileConfig.maxsize,
        maxFiles: fileConfig.maxFiles,
        format: winston.format.combine(
          winston.format.timestamp(),
          winston.format.json()
        )
      }));
    }

    return winston.createLogger({
      level: this.config.level || LogLevel.INFO,
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      ),
      transports,
      defaultMeta: this.baseContext
    });
  }

  // Development formatter for console output
  private developmentFormatter = (info: any): string => {
    const { timestamp, level, message, ...meta } = info;
    const traceInfo = meta.traceId ? `[${meta.traceId.substr(0, 8)}]` : '';
    return `${timestamp} ${level}: ${traceInfo} ${message} ${Object.keys(meta).length ? JSON.stringify(meta, null, 2) : ''}`;
  };

  // Create log context with trace information
  private createContext(additionalContext?: Partial<LogContext>): LogContext {
    const traceContext = TraceContextManager.getInstance().getContext();
    
    return {
      ...this.baseContext,
      traceId: traceContext?.traceId,
      spanId: traceContext?.spanId,
      timestamp: new Date().toISOString(),
      ...additionalContext
    } as LogContext;
  }

  // Log with structured format
  private log(level: LogLevel, message: string, metadata?: Record<string, any>, context?: Partial<LogContext>): void {
    const logContext = this.createContext(context);
    
    const logEntry: StructuredLogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context: logContext,
      metadata
    };

    this.winston.log(level, message, logEntry);
  }

  // Error logging with categorization
  error(message: string, error?: Error | any, metadata?: Record<string, any>, context?: Partial<LogContext>): void {
    const logContext = this.createContext(context);
    let errorInfo;

    if (error) {
      const categorizedError = categorizeError(error);
      errorInfo = {
        name: error.name || 'Error',
        message: error.message || 'Unknown error',
        stack: error.stack,
        category: categorizedError.category,
        severity: categorizedError.severity
      };
    }

    const logEntry: StructuredLogEntry = {
      timestamp: new Date().toISOString(),
      level: LogLevel.ERROR,
      message,
      context: logContext,
      metadata,
      error: errorInfo
    };

    this.winston.error(message, logEntry);
  }

  // Warning logging
  warn(message: string, metadata?: Record<string, any>, context?: Partial<LogContext>): void {
    this.log(LogLevel.WARN, message, metadata, context);
  }

  // Info logging
  info(message: string, metadata?: Record<string, any>, context?: Partial<LogContext>): void {
    this.log(LogLevel.INFO, message, metadata, context);
  }

  // Debug logging
  debug(message: string, metadata?: Record<string, any>, context?: Partial<LogContext>): void {
    this.log(LogLevel.DEBUG, message, metadata, context);
  }

  // HTTP request logging
  http(message: string, requestData: {
    method: string;
    url: string;
    statusCode?: number;
    duration?: number;
    userAgent?: string;
    ip?: string;
  }, context?: Partial<LogContext>): void {
    this.log(LogLevel.HTTP, message, requestData, {
      ...context,
      component: 'http'
    });
  }

  // API call logging
  apiCall(message: string, apiData: {
    endpoint: string;
    method: string;
    statusCode?: number;
    duration?: number;
    requestSize?: number;
    responseSize?: number;
  }, context?: Partial<LogContext>): void {
    this.log(LogLevel.INFO, message, apiData, {
      ...context,
      component: 'api-client'
    });
  }

  // Database operation logging
  database(message: string, dbData: {
    operation: string;
    table?: string;
    query?: string;
    duration?: number;
    rowsAffected?: number;
  }, context?: Partial<LogContext>): void {
    this.log(LogLevel.DEBUG, message, dbData, {
      ...context,
      component: 'database'
    });
  }

  // Business event logging
  business(message: string, eventData: {
    event: string;
    entity?: string;
    entityId?: string;
    userId?: string;
    amount?: number;
    currency?: string;
  }, context?: Partial<LogContext>): void {
    this.log(LogLevel.INFO, message, eventData, {
      ...context,
      component: 'business'
    });
  }

  // Security event logging
  security(message: string, securityData: {
    event: string;
    userId?: string;
    ip?: string;
    userAgent?: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
  }, context?: Partial<LogContext>): void {
    const level = securityData.severity === 'critical' || securityData.severity === 'high' 
      ? LogLevel.ERROR 
      : LogLevel.WARN;
    
    this.log(level, message, securityData, {
      ...context,
      component: 'security'
    });
  }

  // Performance logging
  performance(message: string, perfData: {
    operation: string;
    duration: number;
    memoryUsage?: number;
    cpuUsage?: number;
    throughput?: number;
  }, context?: Partial<LogContext>): void {
    this.log(LogLevel.INFO, message, perfData, {
      ...context,
      component: 'performance'
    });
  }

  // Audit logging
  audit(message: string, auditData: {
    action: string;
    resource: string;
    resourceId?: string;
    userId?: string;
    result: 'success' | 'failure';
    reason?: string;
  }, context?: Partial<LogContext>): void {
    this.log(LogLevel.INFO, message, auditData, {
      ...context,
      component: 'audit'
    });
  }

  // Create child logger with additional context
  child(additionalContext: Partial<LogContext>): StructuredLogger {
    const childConfig = {
      ...this.config,
      service: this.config.service
    };

    const childLogger = new StructuredLogger(childConfig);
    childLogger.baseContext = {
      ...this.baseContext,
      ...additionalContext
    };

    return childLogger;
  }

  // Set log level
  setLevel(level: LogLevel): void {
    this.winston.level = level;
  }

  // Get current log level
  getLevel(): string {
    return this.winston.level;
  }

  // Flush logs (useful for testing)
  async flush(): Promise<void> {
    return new Promise((resolve) => {
      this.winston.on('finish', resolve);
      this.winston.end();
    });
  }
}

// Logger factory
export class LoggerFactory {
  private static loggers: Map<string, StructuredLogger> = new Map();
  private static defaultConfig: Partial<StructuredLoggerConfig> = {};

  // Set default configuration
  static setDefaultConfig(config: Partial<StructuredLoggerConfig>): void {
    LoggerFactory.defaultConfig = config;
  }

  // Create or get logger for service
  static getLogger(service: string, config?: Partial<StructuredLoggerConfig>): StructuredLogger {
    if (!LoggerFactory.loggers.has(service)) {
      const loggerConfig: StructuredLoggerConfig = {
        service,
        ...LoggerFactory.defaultConfig,
        ...config
      };

      const logger = new StructuredLogger(loggerConfig);
      LoggerFactory.loggers.set(service, logger);
    }

    return LoggerFactory.loggers.get(service)!;
  }

  // Create logger for specific component
  static getComponentLogger(service: string, component: string, config?: Partial<StructuredLoggerConfig>): StructuredLogger {
    const logger = LoggerFactory.getLogger(service, config);
    return logger.child({ component });
  }
}

// Middleware for request logging
export const requestLoggingMiddleware = (logger: StructuredLogger) => {
  return (req: any, res: any, next: any) => {
    const startTime = Date.now();
    
    // Log request start
    logger.http('Request started', {
      method: req.method,
      url: req.url,
      userAgent: req.get('User-Agent'),
      ip: req.ip
    }, {
      userId: req.user?.id,
      sessionId: req.sessionID
    });

    // Log response
    res.on('finish', () => {
      const duration = Date.now() - startTime;
      
      logger.http('Request completed', {
        method: req.method,
        url: req.url,
        statusCode: res.statusCode,
        duration,
        userAgent: req.get('User-Agent'),
        ip: req.ip
      }, {
        userId: req.user?.id,
        sessionId: req.sessionID
      });
    });

    next();
  };
};

// Decorator for automatic operation logging
export function logged(operationName?: string, component?: string) {
  return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
    const method = descriptor.value;
    const opName = operationName || `${target.constructor.name}.${propertyName}`;

    descriptor.value = async function (...args: any[]) {
      const logger = LoggerFactory.getLogger('default');
      const startTime = Date.now();

      logger.debug('Operation started', { operation: opName }, { component });

      try {
        const result = await method.apply(this, args);
        const duration = Date.now() - startTime;
        
        logger.debug('Operation completed', { 
          operation: opName, 
          duration 
        }, { component });
        
        return result;
      } catch (error) {
        const duration = Date.now() - startTime;
        
        logger.error('Operation failed', error, { 
          operation: opName, 
          duration 
        }, { component });
        
        throw error;
      }
    };

    return descriptor;
  };
}

// Export default logger instance
export const defaultLogger = LoggerFactory.getLogger('zerodha-integration', {
  level: LogLevel.INFO,
  environment: process.env.NODE_ENV || 'development',
  enableConsole: true,
  enableFile: process.env.NODE_ENV === 'production'
});