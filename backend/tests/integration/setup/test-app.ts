import express, { Express } from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { zerodhaAuthRoutes } from '../../../services/api-gateway/src/routes/zerodhaAuth';
import { zerodhaMarketRoutes } from '../../../services/api-gateway/src/routes/zerodhaMarket';
import { zerodhaOrderRoutes } from '../../../services/api-gateway/src/routes/zerodhaOrders';
import { zerodhaPortfolioRoutes } from '../../../services/api-gateway/src/routes/zerodhaPortfolio';
import { zerodhaRiskRoutes } from '../../../services/api-gateway/src/routes/zerodhaRisk';
import { zerodhaWebSocketHandler } from '../../../services/api-gateway/src/websocket/zerodhaWebSocketHandler';
import { errorHandler } from '../../../services/api-gateway/src/middleware/errorHandler';
import { TestDatabaseManager } from './test-database-manager';
import { TestRedisManager } from './test-redis-manager';

export async function createTestApp(): Promise<Express> {
  const app = express();
  
  // Middleware
  app.use(cors());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Test environment configuration
  process.env.NODE_ENV = 'test';
  process.env.TEST_PORT = process.env.TEST_PORT || '3001';
  process.env.ZERODHA_API_KEY = 'test_api_key';
  process.env.ZERODHA_API_SECRET = 'test_api_secret';
  process.env.JWT_SECRET = 'test_jwt_secret';
  process.env.REDIS_URL = 'redis://localhost:6379/1'; // Use test database
  process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/tradeflow_test';

  // Initialize test database and Redis
  const dbManager = new TestDatabaseManager();
  const redisManager = new TestRedisManager();
  
  await dbManager.initialize();
  await redisManager.initialize();

  // Routes
  app.use('/api/zerodha/auth', zerodhaAuthRoutes);
  app.use('/api/zerodha/market', zerodhaMarketRoutes);
  app.use('/api/zerodha/orders', zerodhaOrderRoutes);
  app.use('/api/zerodha/portfolio', zerodhaPortfolioRoutes);
  app.use('/api/zerodha/risk', zerodhaRiskRoutes);

  // Health check endpoint
  app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Error handling
  app.use(errorHandler);

  // Create HTTP server
  const server = createServer(app);

  // Setup WebSocket server
  const wss = new WebSocketServer({ server });
  wss.on('connection', zerodhaWebSocketHandler);

  // Start server
  const port = parseInt(process.env.TEST_PORT);
  server.listen(port, () => {
    console.log(`Test server running on port ${port}`);
  });

  // Store server reference for cleanup
  (app as any).server = server;
  (app as any).wss = wss;
  (app as any).dbManager = dbManager;
  (app as any).redisManager = redisManager;

  return app;
}

export async function closeTestApp(app: Express): Promise<void> {
  const server = (app as any).server;
  const wss = (app as any).wss;
  const dbManager = (app as any).dbManager;
  const redisManager = (app as any).redisManager;

  if (wss) {
    wss.close();
  }

  if (server) {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  }

  if (dbManager) {
    await dbManager.cleanup();
  }

  if (redisManager) {
    await redisManager.cleanup();
  }
}