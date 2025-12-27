import { config as dotenvConfig } from 'dotenv';

// Load environment variables
dotenvConfig();

export const config = {
  env: process.env['NODE_ENV'] || 'development',
  port: parseInt(process.env['PORTFOLIO_SERVICE_PORT'] || '3004', 10),
  
  // Database configuration
  database: {
    host: process.env['DB_HOST'] || 'localhost',
    port: parseInt(process.env['DB_PORT'] || '5432', 10),
    name: process.env['DB_NAME'] || 'tradeflow',
    user: process.env['DB_USER'] || 'postgres',
    password: process.env['DB_PASSWORD'] || 'password',
    ssl: process.env['DB_SSL'] === 'true',
    maxConnections: parseInt(process.env['DB_MAX_CONNECTIONS'] || '20', 10)
  },

  // Redis configuration
  redis: {
    host: process.env['REDIS_HOST'] || 'localhost',
    port: parseInt(process.env['REDIS_PORT'] || '6379', 10),
    password: process.env['REDIS_PASSWORD'] || undefined,
    db: parseInt(process.env['REDIS_DB'] || '1', 10) // Use different DB for portfolio service
  },

  // CORS configuration
  cors: {
    origin: process.env['CORS_ORIGIN'] || 'http://localhost:3000'
  },

  // Portfolio service specific configuration
  portfolio: {
    // Real-time update interval in milliseconds
    updateInterval: parseInt(process.env['PORTFOLIO_UPDATE_INTERVAL'] || '1000', 10),
    // Currency conversion cache TTL in seconds
    currencyTtl: parseInt(process.env['CURRENCY_CACHE_TTL'] || '300', 10),
    // Performance metrics calculation interval
    metricsInterval: parseInt(process.env['METRICS_INTERVAL'] || '60000', 10),
    // Maximum positions per portfolio
    maxPositions: parseInt(process.env['MAX_POSITIONS_PER_PORTFOLIO'] || '1000', 10)
  },

  // External services
  services: {
    marketDataService: process.env['MARKET_DATA_SERVICE_URL'] || 'http://localhost:3003',
    userService: process.env['USER_SERVICE_URL'] || 'http://localhost:3001'
  }
};