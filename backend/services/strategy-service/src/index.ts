import express from 'express';
import { config } from './config/config';
import { logger } from './utils/logger';
import { errorHandler } from './middleware/errorHandler';
import { requestLogger } from './middleware/requestLogger';
import { strategyRoutes } from './routes/strategies';
import { healthRoutes } from './routes/health';
import { DatabaseService } from './services/database';
import { RedisService } from './services/redis';

const app = express();

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(requestLogger);

// Routes
app.use('/health', healthRoutes);
app.use('/api/strategies', strategyRoutes);

// Error handling
app.use(errorHandler);

// Initialize services
async function initializeServices() {
  try {
    await DatabaseService.initialize();
    await RedisService.initialize();
    logger.info('All services initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize services:', error);
    process.exit(1);
  }
}

// Start server
async function startServer() {
  try {
    await initializeServices();
    
    const server = app.listen(config.port, () => {
      logger.info(`Strategy Service running on port ${config.port}`);
      logger.info(`Environment: ${config.nodeEnv}`);
    });

    // Graceful shutdown
    process.on('SIGTERM', () => {
      logger.info('SIGTERM received, shutting down gracefully');
      server.close(() => {
        DatabaseService.close();
        RedisService.close();
        process.exit(0);
      });
    });

    process.on('SIGINT', () => {
      logger.info('SIGINT received, shutting down gracefully');
      server.close(() => {
        DatabaseService.close();
        RedisService.close();
        process.exit(0);
      });
    });

  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();