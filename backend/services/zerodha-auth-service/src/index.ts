import express from 'express';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { createLogger, initializeEncryption } from '@tradeflow/zerodha-utils';
import { AuthService, AuthConfig } from './services/authService';
import { RedisService } from './services/redisService';
import { DatabaseService } from './services/databaseService';
import { createAuthRoutes } from './routes/authRoutes';
import {
  createAuthMiddleware,
  createOptionalAuthMiddleware,
  createRateLimitMiddleware,
  createRequestLoggingMiddleware,
  createErrorHandlingMiddleware,
  createCorsMiddleware
} from './middleware/authMiddleware';

// Load environment variables
dotenv.config();

const logger = createLogger('ZerodhaAuthService');

// Basic configuration validation
const requiredEnvVars = [
  'ZERODHA_API_KEY',
  'ZERODHA_API_SECRET',
  'ZERODHA_REDIRECT_URL',
  'JWT_SECRET',
  'DATABASE_URL',
  'REDIS_URL',
  'ENCRYPTION_KEY',
];

const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
if (missingVars.length > 0) {
  logger.error('Missing required environment variables', { missingVars });
  process.exit(1);
}

// Initialize services
async function initializeServices() {
  try {
    // Initialize encryption service
    initializeEncryption({ key: process.env.ENCRYPTION_KEY! });
    logger.info('Encryption service initialized');

    // Initialize Redis service
    const redisService = new RedisService(process.env.REDIS_URL!);
    await redisService.connect();
    logger.info('Redis service connected');

    // Initialize Database service
    const databaseService = new DatabaseService(process.env.DATABASE_URL!);
    await databaseService.initialize();
    logger.info('Database service initialized');

    // Initialize Auth service
    const authConfig: AuthConfig = {
      apiKey: process.env.ZERODHA_API_KEY!,
      apiSecret: process.env.ZERODHA_API_SECRET!,
      redirectUrl: process.env.ZERODHA_REDIRECT_URL!,
      jwtSecret: process.env.JWT_SECRET!,
      jwtExpiresIn: process.env.JWT_EXPIRES_IN || '8h',
      encryptionKey: process.env.ENCRYPTION_KEY!
    };

    const authService = new AuthService(authConfig, redisService, databaseService);
    logger.info('Auth service initialized');

    return { authService, redisService, databaseService };
  } catch (error) {
    logger.error('Failed to initialize services', { 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
    throw error;
  }
}

// Create Express app
const app = express();

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https://kite.trade", "https://api.kite.trade"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false
}));

// CORS middleware
app.use(createCorsMiddleware());

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging middleware
app.use(createRequestLoggingMiddleware());

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    const services = await initializeServices();
    
    // Check service health
    const redisHealth = await services.redisService.healthCheck();
    const dbHealth = await services.databaseService.healthCheck();
    
    const isHealthy = redisHealth.status === 'healthy' && dbHealth.status === 'healthy';
    
    res.status(isHealthy ? 200 : 503).json({
      status: isHealthy ? 'healthy' : 'unhealthy',
      service: 'zerodha-auth-service',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      services: {
        redis: redisHealth,
        database: dbHealth
      }
    });
  } catch (error) {
    logger.error('Health check failed', { 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
    
    res.status(503).json({
      status: 'unhealthy',
      service: 'zerodha-auth-service',
      timestamp: new Date().toISOString(),
      error: 'Service initialization failed'
    });
  }
});

// Initialize and start server
async function startServer() {
  try {
    const services = await initializeServices();
    
    // Create middleware instances
    const authMiddleware = createAuthMiddleware(services.authService);
    const optionalAuthMiddleware = createOptionalAuthMiddleware(services.authService);
    const rateLimitMiddleware = createRateLimitMiddleware(services.authService);
    
    // Create routes
    const authRoutes = createAuthRoutes(services.authService, services.redisService);
    
    // Mount routes
    app.use('/api/zerodha/auth', rateLimitMiddleware, authRoutes);
    
    // Protected routes example (for future use)
    app.get('/api/zerodha/auth/protected', authMiddleware, (req, res) => {
      res.json({
        success: true,
        message: 'This is a protected route',
        user: (req as any).user
      });
    });
    
    // Error handling middleware (must be last)
    app.use(createErrorHandlingMiddleware());
    
    // 404 handler
    app.use('*', (req, res) => {
      res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Endpoint not found',
          timestamp: new Date().toISOString()
        }
      });
    });

    const port = process.env.PORT || 3001;
    
    const server = app.listen(port, () => {
      logger.info('Zerodha Auth Service started', {
        port,
        environment: process.env.NODE_ENV || 'development',
        version: process.env.npm_package_version || '1.0.0'
      });
    });

    // Graceful shutdown
    process.on('SIGTERM', async () => {
      logger.info('SIGTERM received, shutting down gracefully');
      
      server.close(async () => {
        try {
          await services.redisService.disconnect();
          await services.databaseService.close();
          logger.info('Services closed successfully');
          process.exit(0);
        } catch (error) {
          logger.error('Error during shutdown', { 
            error: error instanceof Error ? error.message : 'Unknown error' 
          });
          process.exit(1);
        }
      });
    });

    process.on('SIGINT', async () => {
      logger.info('SIGINT received, shutting down gracefully');
      
      server.close(async () => {
        try {
          await services.redisService.disconnect();
          await services.databaseService.close();
          logger.info('Services closed successfully');
          process.exit(0);
        } catch (error) {
          logger.error('Error during shutdown', { 
            error: error instanceof Error ? error.message : 'Unknown error' 
          });
          process.exit(1);
        }
      });
    });

    return server;
  } catch (error) {
    logger.error('Failed to start server', { 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
    process.exit(1);
  }
}

// Start the server
if (require.main === module) {
  startServer().catch((error) => {
    logger.error('Unhandled error during startup', { 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
    process.exit(1);
  });
}

export default app;