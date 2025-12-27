import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { logger } from './utils/logger';
import { portfolioRoutes } from './routes/portfolioRoutes';
import { errorHandler } from './middleware/errorHandler';
import { DatabaseService } from './services/DatabaseService';
import { RedisService } from './services/RedisService';

// Load environment variables
dotenv.config();

const app = express();
const server = createServer(app);
const PORT = process.env.PORT || 3006;

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    service: 'zerodha-portfolio-service',
    timestamp: new Date().toISOString() 
  });
});

// API routes
app.use('/api/zerodha/portfolio', portfolioRoutes);

// Error handling middleware
app.use(errorHandler);

// Initialize services and start server
async function startServer() {
  try {
    // Initialize database connection
    await DatabaseService.initialize();
    logger.info('Database connection established');

    // Initialize Redis connection
    await RedisService.initialize();
    logger.info('Redis connection established');

    // Start server
    server.listen(PORT, () => {
      logger.info(`Zerodha Portfolio Service running on port ${PORT}`);
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
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();

export { app, server };