import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { createServer } from 'http';
import { CentralizedLogger, createLogConfig, createLoggingMiddleware, createErrorLoggingMiddleware } from '@tradeflow/logging';
import { MonitoringService } from '@tradeflow/monitoring';
import { config } from './config/config';
import { monitoringConfig } from './config/monitoring-config';
import { createMonitoringRoutes } from './routes/monitoring';

// Initialize logger
const logConfig = createLogConfig('monitoring-service', {
  enableFile: config.logging.enableFile,
  enableElasticsearch: config.logging.enableElasticsearch,
  enableFluentd: config.logging.enableFluentd,
  fileConfig: {
    directory: './logs',
    maxSize: '20m',
    maxFiles: 14,
    datePattern: 'YYYY-MM-DD'
  },
  elasticsearchConfig: config.logging.enableElasticsearch ? {
    node: config.elasticsearch.node,
    index: config.elasticsearch.index,
    username: config.elasticsearch.username,
    password: config.elasticsearch.password
  } : undefined,
  fluentdConfig: config.logging.enableFluentd ? {
    host: config.fluentd.host,
    port: config.fluentd.port,
    tag: config.fluentd.tag,
    timeout: 3000
  } : undefined
});

const logger = new CentralizedLogger(logConfig);

// Initialize monitoring service
const monitoringService = new MonitoringService(logger, monitoringConfig);

// Create Express app
const app = express();
const server = createServer(app);

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Logging middleware
app.use(createLoggingMiddleware(logger));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'monitoring-service',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: '1.0.0'
  });
});

// API routes
app.use('/api/monitoring', createMonitoringRoutes(monitoringService));

// Error handling
app.use(createErrorLoggingMiddleware(logger));

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: 'Endpoint not found',
      timestamp: new Date().toISOString()
    }
  });
});

// Global error handler
app.use((error: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error('Unhandled error', error);
  
  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
      timestamp: new Date().toISOString()
    }
  });
});

async function startServer() {
  try {
    // Start monitoring service
    await monitoringService.start();
    logger.info('Monitoring service initialized');

    // Start HTTP server
    server.listen(config.port, () => {
      logger.info(`Monitoring service started on port ${config.port}`, {
        environment: config.env,
        nodeVersion: process.version,
        pid: process.pid
      });
    });

    // Graceful shutdown
    const shutdown = async (signal: string) => {
      logger.info(`${signal} received, shutting down gracefully`);
      
      server.close(async () => {
        try {
          await monitoringService.stop();
          await logger.close();
          process.exit(0);
        } catch (error) {
          logger.error('Error during shutdown', error as Error);
          process.exit(1);
        }
      });
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

  } catch (error) {
    logger.error('Failed to start monitoring service', error as Error);
    process.exit(1);
  }
}

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection', new Error(String(reason)), {
    promise: promise.toString()
  });
  process.exit(1);
});

// Start the server
startServer();