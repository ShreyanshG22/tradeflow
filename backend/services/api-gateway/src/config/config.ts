import dotenv from 'dotenv';

dotenv.config();

export const config = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3001', 10),
  
  // JWT Configuration
  jwt: {
    secret: process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production',
    expiresIn: process.env.JWT_EXPIRES_IN || '24h',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d'
  },

  // CORS Configuration
  cors: {
    origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:3000', 'http://localhost:5173'],
  },

  // Rate Limiting Configuration
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10), // 15 minutes
    max: parseInt(process.env.RATE_LIMIT_MAX || '100', 10), // limit each IP to 100 requests per windowMs
  },

  // Redis Configuration
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD,
    db: parseInt(process.env.REDIS_DB || '0', 10),
  },

  // Database Configuration
  database: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    name: process.env.DB_NAME || 'tradeflow',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'password',
  },

  // Service URLs
  services: {
    userService: process.env.USER_SERVICE_URL || 'http://localhost:3002',
    strategyService: process.env.STRATEGY_SERVICE_URL || 'http://localhost:3003',
    portfolioService: process.env.PORTFOLIO_SERVICE_URL || 'http://localhost:3004',
    marketDataService: process.env.MARKET_DATA_SERVICE_URL || 'http://localhost:3005',
    backtestService: process.env.BACKTEST_SERVICE_URL || 'http://localhost:3006',
    zerodhaAuthService: process.env.ZERODHA_AUTH_SERVICE_URL || 'http://localhost:3007',
    zerodhaMarketService: process.env.ZERODHA_MARKET_SERVICE_URL || 'http://localhost:3008',
    zerodhaOrderService: process.env.ZERODHA_ORDER_SERVICE_URL || 'http://localhost:3009',
    zerodhaPortfolioService: process.env.ZERODHA_PORTFOLIO_SERVICE_URL || 'http://localhost:3010',
    zerodhaRiskService: process.env.ZERODHA_RISK_SERVICE_URL || 'http://localhost:3011',
  },

  // Logging Configuration
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    format: process.env.LOG_FORMAT || 'json',
  },

  // WebSocket Configuration
  websocket: {
    pingTimeout: parseInt(process.env.WS_PING_TIMEOUT || '60000', 10),
    pingInterval: parseInt(process.env.WS_PING_INTERVAL || '25000', 10),
  }
};