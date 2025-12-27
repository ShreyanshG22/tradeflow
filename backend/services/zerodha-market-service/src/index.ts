import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { ZerodhaAPIClient, createLogger } from '@tradeflow/zerodha-utils';
import { instrumentRoutes } from './routes/instrumentRoutes';
import { marketDataRoutes } from './routes/marketDataRoutes';
import { historicalDataRoutes } from './routes/historicalDataRoutes';
import { marketStatusRoutes } from './routes/marketStatusRoutes';
import { errorHandler } from './middleware/errorHandler';
import { InstrumentService } from './services/InstrumentService';
import { RedisService } from './services/RedisService';
import { MarketDataService } from './services/MarketDataService';
import { MarketStatusService } from './services/MarketStatusService';
import { MarketDataWebSocketServer } from './services/WebSocketServer';

// Load environment variables
dotenv.config();

const logger = createLogger('ZerodhaMarketService');

class ZerodhaMarketService {
  private app: express.Application;
  private server: any;
  private port: number;
  private redisService: RedisService;
  private instrumentService: InstrumentService;
  private marketDataService: MarketDataService;
  private marketStatusService: MarketStatusService;
  private wsServer: MarketDataWebSocketServer | null = null;
  private apiClient: ZerodhaAPIClient;

  constructor() {
    this.app = express();
    this.port = parseInt(process.env.PORT || '3003');
    this.redisService = new RedisService();
    this.instrumentService = new InstrumentService(this.redisService);
    
    // Initialize API client
    this.apiClient = new ZerodhaAPIClient({
      apiKey: process.env.ZERODHA_API_KEY || '',
      timeout: 30000,
      debug: process.env.NODE_ENV === 'development',
    });

    this.marketDataService = new MarketDataService(
      this.apiClient,
      this.redisService,
      this.instrumentService
    );

    this.marketStatusService = new MarketStatusService(
      this.apiClient,
      this.redisService
    );
    
    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandling();
  }

  private setupMiddleware(): void {
    this.app.use(helmet());
    this.app.use(cors({
      origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
      credentials: true,
    }));
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));
  }

  private setupRoutes(): void {
    // Inject services into app locals for routes to access
    this.app.locals.instrumentService = this.instrumentService;
    this.app.locals.redisService = this.redisService;
    this.app.locals.marketDataService = this.marketDataService;
    this.app.locals.marketStatusService = this.marketStatusService;
    this.app.locals.apiClient = this.apiClient;

    // Health check
    this.app.get('/health', (req, res) => {
      const marketDataStats = this.marketDataService.getStats();
      const marketStatusStats = this.marketStatusService.getStats();
      const wsStats = this.wsServer?.getStats() || { totalClients: 0, connectedClients: 0, totalSubscriptions: 0 };
      
      res.json({ 
        status: 'healthy', 
        service: 'zerodha-market-service',
        timestamp: new Date().toISOString(),
        instrumentsReady: this.instrumentService.isReady(),
        redisReady: this.redisService.isReady(),
        marketDataConnected: marketDataStats.isConnected,
        marketStatusMonitoring: marketStatusStats.statusMonitoringActive,
        websocketClients: wsStats.connectedClients,
      });
    });

    // API routes
    this.app.use('/api/zerodha/market/instruments', instrumentRoutes);
    this.app.use('/api/zerodha/market/data', marketDataRoutes);
    this.app.use('/api/zerodha/market/historical', historicalDataRoutes);
    this.app.use('/api/zerodha/market/status', marketStatusRoutes);
  }

  private setupErrorHandling(): void {
    this.app.use(errorHandler);
  }

  public async start(): Promise<void> {
    try {
      // Initialize Redis connection
      await this.redisService.connect();
      logger.info('Redis connection established');

      // Initialize instrument service
      await this.instrumentService.initialize();
      logger.info('Instrument service initialized');

      // Create HTTP server
      this.server = createServer(this.app);

      // Initialize services if access token is available
      const accessToken = process.env.ZERODHA_ACCESS_TOKEN;
      if (accessToken) {
        // Set access token for API client
        this.apiClient.setAccessToken(accessToken);

        // Initialize market data service
        await this.marketDataService.initialize(accessToken);
        logger.info('Market data service initialized');

        // Initialize market status service
        await this.marketStatusService.initialize();
        logger.info('Market status service initialized');

        // Setup WebSocket server
        this.wsServer = new MarketDataWebSocketServer(this.server, this.marketDataService);
        logger.info('WebSocket server initialized');
      } else {
        logger.warn('No access token provided, real-time services disabled');
      }

      // Start server
      this.server.listen(this.port, () => {
        logger.info(`Zerodha Market Service running on port ${this.port}`);
        logger.info(`WebSocket endpoint: ws://localhost:${this.port}/ws/market-data`);
      });
    } catch (error) {
      logger.error('Failed to start service:', error);
      process.exit(1);
    }
  }

  public async stop(): Promise<void> {
    try {
      logger.info('Stopping Zerodha Market Service...');

      // Shutdown WebSocket server
      if (this.wsServer) {
        this.wsServer.shutdown();
      }

      // Shutdown services
      await this.marketDataService.shutdown();
      await this.marketStatusService.shutdown();

      // Close HTTP server
      if (this.server) {
        this.server.close();
      }

      // Disconnect Redis
      await this.redisService.disconnect();
      
      logger.info('Service stopped gracefully');
    } catch (error) {
      logger.error('Error stopping service:', error);
    }
  }
}
}

// Start service
const service = new ZerodhaMarketService();

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  await service.stop();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully');
  await service.stop();
  process.exit(0);
});

// Start the service
service.start().catch((error) => {
  logger.error('Failed to start service:', error);
  process.exit(1);
});