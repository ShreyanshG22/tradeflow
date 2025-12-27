import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { createServer } from 'http';
import { config } from './config/config';
import { logger } from './utils/logger';
import { createLoggingMiddleware, createErrorLoggingMiddleware } from '@tradeflow/logging';
import { errorHandler } from './middleware/errorHandler';
import { authRoutes } from './routes/auth';
import { userRoutes } from './routes/user';
import { DatabaseService } from './services/database';
import { RedisService } from './services/redis';

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
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});
app.use(limiter);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use(createLoggingMiddleware(logger));

// Health check endpoint
app.get('/health', (_req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'user-service',
    version: process.env['npm_package_version'] || '1.0.0'
  });
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);

// Error handling
app.use(createErrorLoggingMiddleware(logger));
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
    await DatabaseService.initialize();
    logger.info('Database connection established');

    // Initialize Redis connection
    await RedisService.initialize();
    logger.info('Redis connection established');

    // Start server
    server.listen(config.port, () => {
      logger.info(`User service started on port ${config.port}`, {
        environment: config.env,
        nodeVersion: process.version
      });
    });

    // Graceful shutdown
    process.on('SIGTERM', async () => {
      logger.info('SIGTERM received, shutting down gracefully');
      server.close(async () => {
        await DatabaseService.close();
        await RedisService.close();
        process.exit(0);
      });
    });

  } catch (error) {
    logger.error('Failed to start server', error);
    process.exit(1);
  }
}

startServer();