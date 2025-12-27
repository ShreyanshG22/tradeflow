import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { config } from './config/config';
import { logger } from './utils/logger';
import { errorHandler } from './middleware/errorHandler';
import { requestLogger } from './middleware/requestLogger';
import { authMiddleware } from './middleware/auth';
import { validationMiddleware } from './middleware/validation';
import { transformationMiddleware } from './middleware/transformation';
import { authRoutes } from './routes/auth';
import { strategyRoutes } from './routes/strategies';
import { backtestRoutes } from './routes/backtests';
import { portfolioRoutes } from './routes/portfolio';
import { marketDataRoutes } from './routes/marketData';
import { healthRoutes } from './routes/health';
import { zerodhaAuthRoutes } from './routes/zerodhaAuth';
import { zerodhaMarketRoutes } from './routes/zerodhaMarket';
import { zerodhaOrderRoutes } from './routes/zerodhaOrders';
import { zerodhaPortfolioRoutes } from './routes/zerodhaPortfolio';
import { zerodhaRiskRoutes } from './routes/zerodhaRisk';
import { 
  zerodhaSecurityHeaders, 
  apiVersioning, 
  requestSanitization, 
  zerodhaCorsPreflight 
} from './middleware/zerodhaSecurityHeaders';
import { apiDocumentationMiddleware } from './middleware/apiDocumentation';
import { setupWebSocket } from './websocket/socketHandler';

const app = express();
const server = createServer(app);
const io = new SocketIOServer(server, {
  cors: {
    origin: config.cors.origin,
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
  crossOriginEmbedderPolicy: false
}));

// CORS configuration
app.use(cors({
  origin: config.cors.origin,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.max,
  message: {
    error: 'Too many requests from this IP, please try again later.',
    code: 'RATE_LIMIT_EXCEEDED'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Skip rate limiting for health checks
    return req.path === '/health';
  }
});

app.use(limiter);

// Request parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging
app.use(requestLogger);

// Request/Response transformation
app.use(transformationMiddleware);

// Health check endpoint (no auth required)
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: process.env.npm_package_version || '1.0.0'
  });
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/health', healthRoutes);
app.use('/api/strategies', authMiddleware, strategyRoutes);
app.use('/api/backtests', authMiddleware, backtestRoutes);
app.use('/api/portfolio', authMiddleware, portfolioRoutes);
app.use('/api/market-data', authMiddleware, marketDataRoutes);

// Zerodha API routes with enhanced security
app.use('/api/zerodha', zerodhaCorsPreflight);
app.use('/api/zerodha', zerodhaSecurityHeaders());
app.use('/api/zerodha', apiVersioning);
app.use('/api/zerodha', requestSanitization);
app.use('/api/zerodha', apiDocumentationMiddleware);
app.use('/api/zerodha/auth', zerodhaAuthRoutes);
app.use('/api/zerodha/market', zerodhaMarketRoutes);
app.use('/api/zerodha/orders', zerodhaOrderRoutes);
app.use('/api/zerodha/portfolio', zerodhaPortfolioRoutes);
app.use('/api/zerodha/risk', zerodhaRiskRoutes);

// WebSocket setup
setupWebSocket(io);

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: 'The requested resource was not found',
      path: req.originalUrl
    }
  });
});

// Error handling middleware (must be last)
app.use(errorHandler);

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  server.close(() => {
    logger.info('Process terminated');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  server.close(() => {
    logger.info('Process terminated');
    process.exit(0);
  });
});

const PORT = config.port || 3001;

server.listen(PORT, () => {
  logger.info(`API Gateway server running on port ${PORT}`);
  logger.info(`Environment: ${config.nodeEnv}`);
});

export { app, server, io };