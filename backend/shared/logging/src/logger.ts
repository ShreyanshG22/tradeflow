import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import { ElasticsearchTransport } from 'winston-elasticsearch';
import FluentLogger from 'fluent-logger';
import { LogConfig, LogMetadata, PerformanceMetrics, SecurityEvent, BusinessEvent } from './types';

export class CentralizedLogger {
  private logger: winston.Logger;
  private config: LogConfig;
  private fluentLogger?: any;

  constructor(config: LogConfig) {
    this.config = config;
    this.logger = this.createLogger();
    
    if (config.enableFluentd && config.fluentdConfig) {
      this.setupFluentd();
    }
  }

  private createLogger(): winston.Logger {
    const transports: winston.transport[] = [];

    // Console transport
    if (this.config.enableConsole) {
      transports.push(new winston.transports.Console({
        format: winston.format.combine(
          winston.format.timestamp(),
          winston.format.colorize(),
          winston.format.printf(({ timestamp, level, message, service, ...meta }) => {
            const metaStr = Object.keys(meta).length > 0 ? JSON.stringify(meta) : '';
            return `${timestamp} [${service}] ${level}: ${message} ${metaStr}`;
          })
        )
      }));
    }

    // File transport with rotation
    if (this.config.enableFile && this.config.fileConfig) {
      const fileConfig = this.config.fileConfig;
      
      // Error logs
      transports.push(new DailyRotateFile({
        filename: `${fileConfig.directory}/error-%DATE%.log`,
        datePattern: fileConfig.datePattern,
        level: 'error',
        maxSize: fileConfig.maxSize,
        maxFiles: fileConfig.maxFiles,
        format: winston.format.combine(
          winston.format.timestamp(),
          winston.format.json()
        )
      }));

      // Combined logs
      transports.push(new DailyRotateFile({
        filename: `${fileConfig.directory}/combined-%DATE%.log`,
        datePattern: fileConfig.datePattern,
        maxSize: fileConfig.maxSize,
        maxFiles: fileConfig.maxFiles,
        format: winston.format.combine(
          winston.format.timestamp(),
          winston.format.json()
        )
      }));

      // Performance logs
      transports.push(new DailyRotateFile({
        filename: `${fileConfig.directory}/performance-%DATE%.log`,
        datePattern: fileConfig.datePattern,
        level: 'info',
        maxSize: fileConfig.maxSize,
        maxFiles: fileConfig.maxFiles,
        format: winston.format.combine(
          winston.format.timestamp(),
          winston.format.json()
        ),
        // Only log performance-related entries
        filter: (info) => info.type === 'performance'
      }));

      // Security logs
      transports.push(new DailyRotateFile({
        filename: `${fileConfig.directory}/security-%DATE%.log`,
        datePattern: fileConfig.datePattern,
        level: 'warn',
        maxSize: fileConfig.maxSize,
        maxFiles: fileConfig.maxFiles,
        format: winston.format.combine(
          winston.format.timestamp(),
          winston.format.json()
        ),
        filter: (info) => info.type === 'security'
      }));
    }

    // Elasticsearch transport
    if (this.config.enableElasticsearch && this.config.elasticsearchConfig) {
      const esConfig = this.config.elasticsearchConfig;
      transports.push(new ElasticsearchTransport({
        level: 'info',
        clientOpts: {
          node: esConfig.node,
          auth: esConfig.username && esConfig.password ? {
            username: esConfig.username,
            password: esConfig.password
          } : undefined
        },
        index: esConfig.index,
        transformer: (logData) => {
          return {
            '@timestamp': new Date().toISOString(),
            level: logData.level,
            message: logData.message,
            service: this.config.service,
            environment: this.config.environment,
            ...logData.meta
          };
        }
      }));
    }

    return winston.createLogger({
      level: this.config.level,
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      ),
      defaultMeta: {
        service: this.config.service,
        environment: this.config.environment
      },
      transports
    });
  }

  private setupFluentd(): void {
    if (!this.config.fluentdConfig) return;

    const fluentConfig = this.config.fluentdConfig;
    this.fluentLogger = FluentLogger.createFluentSender(fluentConfig.tag, {
      host: fluentConfig.host,
      port: fluentConfig.port,
      timeout: fluentConfig.timeout
    });
  }

  // Standard logging methods
  debug(message: string, metadata?: LogMetadata): void {
    this.logger.debug(message, metadata);
    this.sendToFluentd('debug', message, metadata);
  }

  info(message: string, metadata?: LogMetadata): void {
    this.logger.info(message, metadata);
    this.sendToFluentd('info', message, metadata);
  }

  warn(message: string, metadata?: LogMetadata): void {
    this.logger.warn(message, metadata);
    this.sendToFluentd('warn', message, metadata);
  }

  error(message: string, error?: Error, metadata?: LogMetadata): void {
    const logData = {
      ...metadata,
      error: error ? {
        name: error.name,
        message: error.message,
        stack: error.stack
      } : undefined
    };
    this.logger.error(message, logData);
    this.sendToFluentd('error', message, logData);
  }

  // Specialized logging methods
  logPerformance(metrics: PerformanceMetrics): void {
    const logData = {
      type: 'performance',
      operation: metrics.operation,
      duration: metrics.duration,
      timestamp: metrics.timestamp,
      success: metrics.success,
      ...metrics.metadata
    };
    this.logger.info(`Performance: ${metrics.operation}`, logData);
    this.sendToFluentd('performance', `Performance: ${metrics.operation}`, logData);
  }

  logSecurity(event: SecurityEvent): void {
    const logData = {
      type: 'security',
      eventType: event.type,
      severity: event.severity,
      userId: event.userId,
      ipAddress: event.ipAddress,
      userAgent: event.userAgent,
      ...event.details
    };
    
    const level = event.severity === 'critical' || event.severity === 'high' ? 'error' : 'warn';
    this.logger.log(level, `Security Event: ${event.type}`, logData);
    this.sendToFluentd('security', `Security Event: ${event.type}`, logData);
  }

  logBusiness(event: BusinessEvent): void {
    const logData = {
      type: 'business',
      eventType: event.type,
      entity: event.entity,
      entityId: event.entityId,
      action: event.action,
      userId: event.userId,
      ...event.metadata
    };
    this.logger.info(`Business Event: ${event.type}`, logData);
    this.sendToFluentd('business', `Business Event: ${event.type}`, logData);
  }

  // Request/Response logging
  logRequest(method: string, url: string, metadata?: LogMetadata): void {
    this.logger.info(`Request: ${method} ${url}`, {
      type: 'request',
      method,
      url,
      ...metadata
    });
  }

  logResponse(method: string, url: string, statusCode: number, duration: number, metadata?: LogMetadata): void {
    this.logger.info(`Response: ${method} ${url} ${statusCode}`, {
      type: 'response',
      method,
      url,
      statusCode,
      duration,
      ...metadata
    });
  }

  private sendToFluentd(level: string, message: string, metadata?: any): void {
    if (!this.fluentLogger) return;

    try {
      this.fluentLogger.emit(level, {
        timestamp: new Date().toISOString(),
        level,
        message,
        service: this.config.service,
        environment: this.config.environment,
        ...metadata
      });
    } catch (error) {
      // Fallback to console if Fluentd fails
      console.error('Failed to send log to Fluentd:', error);
    }
  }

  // Graceful shutdown
  async close(): Promise<void> {
    return new Promise((resolve) => {
      this.logger.end(() => {
        if (this.fluentLogger) {
          this.fluentLogger.end();
        }
        resolve();
      });
    });
  }
}