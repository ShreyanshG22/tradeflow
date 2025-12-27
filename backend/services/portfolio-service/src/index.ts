import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { createServer } from 'http';
import { config } from './config/config';
import { logger } from './utils/logger';
import { errorHandler } from './middleware/errorHandler';
import { portfolioRoutes } from './routes/portfolios';
import { tradeRoutes } from './routes/trades';
import { performanceRoutes } from './routes/performance';
import { databaseService } from './services/database';
import { redisService } from './services/redis';
import { currencyService } from './services/currencyService';

const app = express();
const server = createServer(app);

// Security middleware
app.use(helmet());
app.use(cors({
  origin: config.cors.origin,
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // Higher limit for portfolio service due to real-time updates
  message: 'Too many requests from this IP, please try again later.'
});
app.use(limiter);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req, _res, next) => {
  logger.info(`${req.method} ${req.path}`, {
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    requestId: req.headers['x-request-id']
  });
  next();
});

// Health check endpoint
app.get('/health', (_req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'portfolio-service',
    version: process.env['npm_package_version'] || '1.0.0'
  });
});

// API routes
app.use('/api/portfolios', portfolioRoutes);
app.use('/api/trades', tradeRoutes);
app.use('/api/performance', performanceRoutes);

// Currency service endpoints
app.get('/api/currencies/supported', (_req, res) => {
  res.json({
    success: true,
    data: currencyService.getSupportedCurrencies(),
    timestamp: new Date().toISOString()
  });
});

app.get('/api/currencies/rates/:baseCurrency', async (req, res) => {
  try {
    const rates = await currencyService.getMultiCurrencyRates(req.params.baseCurrency);
    res.json({
      success: true,
      data: {
        baseCurrency: req.params.baseCurrency,
        rates
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'CURRENCY_ERROR',
        message: 'Failed to get currency rates',
        timestamp: new Date().toISOString()
      }
    });
  }
});

// Error handling
app.use(errorHandler);

// 404 handler
app.use('*', (_req, res) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: 'Endpoint not found',
      timestamp: new Date().toISOString()
    }
  });
});

async function startServer() {
  try {
    // Initialize database connection
    await databaseService.initialize();
    logger.info('Database connection established');

    // Initialize Redis connection
    await redisService.initialize();
    logger.info('Redis connection established');

    // Start periodic currency rate refresh
    setInterval(async () => {
      try {
        await currencyService.refreshAllRates();
      } catch (error) {
        logger.error('Failed to refresh currency rates', error);
      }
    }, 5 * 60 * 1000); // Every 5 minutes

    // Start server
    server.listen(config.port, () => {
      logger.info(`Portfolio service started on port ${config.port}`, {
        environment: config.env,
        nodeVersion: process.version
      });
    });

    // Graceful shutdown
    process.on('SIGTERM', async () => {
      logger.info('SIGTERM received, shutting down gracefully');
      server.close(async () => {
        await databaseService.close();
        await redisService.close();
        process.exit(0);
      });
    });

    process.on('SIGINT', async () => {
      logger.info('SIGINT received, shutting down gracefully');
      server.close(async () => {
        await databaseService.close();
        await redisService.close();
        process.exit(0);
      });
    });

  } catch (error) {
    logger.error('Failed to start server', error);
    process.exit(1);
  }
}

startServer();