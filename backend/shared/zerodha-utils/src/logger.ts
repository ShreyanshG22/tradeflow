import winston from 'winston';

export interface LoggerConfig {
  level?: string;
  service?: string;
  environment?: string;
}

/**
 * Create a Winston logger instance with consistent formatting
 */
export const createLogger = (service: string, config?: LoggerConfig): winston.Logger => {
  const logLevel = config?.level || process.env.LOG_LEVEL || 'info';
  const environment = config?.environment || process.env.NODE_ENV || 'development';

  const formats = [
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json(),
  ];

  // Add colorization for development
  if (environment === 'development') {
    formats.unshift(winston.format.colorize());
  }

  const logger = winston.createLogger({
    level: logLevel,
    format: winston.format.combine(...formats),
    defaultMeta: {
      service,
      environment,
    },
    transports: [
      // Console transport
      new winston.transports.Console({
        format: environment === 'development' 
          ? winston.format.combine(
              winston.format.colorize(),
              winston.format.simple()
            )
          : winston.format.json(),
      }),
    ],
  });

  // Add file transports for production
  if (environment === 'production') {
    logger.add(new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }));

    logger.add(new winston.transports.File({
      filename: 'logs/combined.log',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }));
  }

  return logger;
};

/**
 * Create a logger specifically for Zerodha API operations
 */
export const createZerodhaLogger = (service: string): winston.Logger => {
  return createLogger(`zerodha-${service}`, {
    level: process.env.ZERODHA_LOG_LEVEL || 'info',
  });
};

/**
 * Log API request/response for debugging
 */
export const logAPICall = (
  logger: winston.Logger,
  method: string,
  endpoint: string,
  params?: any,
  response?: any,
  error?: any
): void => {
  const logData = {
    method,
    endpoint,
    params: params ? JSON.stringify(params) : undefined,
    responseStatus: response?.status,
    responseData: response?.data ? JSON.stringify(response.data) : undefined,
    error: error ? error.message : undefined,
    timestamp: new Date().toISOString(),
  };

  if (error) {
    logger.error('API Call Failed', logData);
  } else {
    logger.info('API Call Success', logData);
  }
};

/**
 * Log WebSocket events
 */
export const logWebSocketEvent = (
  logger: winston.Logger,
  event: string,
  data?: any,
  error?: any
): void => {
  const logData = {
    event,
    data: data ? JSON.stringify(data) : undefined,
    error: error ? error.message : undefined,
    timestamp: new Date().toISOString(),
  };

  if (error) {
    logger.error('WebSocket Error', logData);
  } else {
    logger.info('WebSocket Event', logData);
  }
};

/**
 * Log order operations
 */
export const logOrderOperation = (
  logger: winston.Logger,
  operation: string,
  orderId?: string,
  orderData?: any,
  error?: any
): void => {
  const logData = {
    operation,
    orderId,
    orderData: orderData ? JSON.stringify(orderData) : undefined,
    error: error ? error.message : undefined,
    timestamp: new Date().toISOString(),
  };

  if (error) {
    logger.error('Order Operation Failed', logData);
  } else {
    logger.info('Order Operation Success', logData);
  }
};

/**
 * Log authentication events
 */
export const logAuthEvent = (
  logger: winston.Logger,
  event: string,
  userId?: string,
  details?: any,
  error?: any
): void => {
  const logData = {
    event,
    userId,
    details: details ? JSON.stringify(details) : undefined,
    error: error ? error.message : undefined,
    timestamp: new Date().toISOString(),
  };

  if (error) {
    logger.error('Auth Event Failed', logData);
  } else {
    logger.info('Auth Event Success', logData);
  }
};

/**
 * Log risk management events
 */
export const logRiskEvent = (
  logger: winston.Logger,
  event: string,
  riskData?: any,
  action?: string,
  error?: any
): void => {
  const logData = {
    event,
    riskData: riskData ? JSON.stringify(riskData) : undefined,
    action,
    error: error ? error.message : undefined,
    timestamp: new Date().toISOString(),
  };

  if (error) {
    logger.error('Risk Event Failed', logData);
  } else {
    logger.warn('Risk Event', logData); // Use warn level for risk events
  }
};

// Export default logger for general use
export const defaultLogger = createLogger('zerodha-integration');