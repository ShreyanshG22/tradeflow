import { config as dotenvConfig } from 'dotenv';

// Load environment variables
dotenvConfig();

export const config = {
  nodeEnv: process.env['NODE_ENV'] || 'development',
  port: parseInt(process.env['PORT'] || '3003', 10),
  
  // Database configuration
  database: {
    host: process.env['DB_HOST'] || 'localhost',
    port: parseInt(process.env['DB_PORT'] || '5432', 10),
    name: process.env['DB_NAME'] || 'tradeflow',
    user: process.env['DB_USER'] || 'postgres',
    password: process.env['DB_PASSWORD'] || 'password',
    ssl: process.env['DB_SSL'] === 'true',
    maxConnections: parseInt(process.env['DB_MAX_CONNECTIONS'] || '20', 10),
  },
  
  // Redis configuration
  redis: {
    host: process.env['REDIS_HOST'] || 'localhost',
    port: parseInt(process.env['REDIS_PORT'] || '6379', 10),
    password: process.env['REDIS_PASSWORD'] || undefined,
    db: parseInt(process.env['REDIS_DB'] || '0', 10),
  },
  
  // JWT configuration
  jwt: {
    secret: process.env['JWT_SECRET'] || 'your-secret-key',
    expiresIn: process.env['JWT_EXPIRES_IN'] || '1h',
    refreshExpiresIn: process.env['JWT_REFRESH_EXPIRES_IN'] || '7d',
  },
  
  // Strategy execution configuration
  execution: {
    maxConcurrentStrategies: parseInt(process.env['MAX_CONCURRENT_STRATEGIES'] || '10', 10),
    defaultTimeframe: process.env['DEFAULT_TIMEFRAME'] || '1h',
    maxBacktestDuration: parseInt(process.env['MAX_BACKTEST_DURATION'] || '365', 10), // days
  },
  
  // Logging configuration
  logging: {
    level: process.env['LOG_LEVEL'] || 'info',
    format: process.env['LOG_FORMAT'] || 'json',
  },
};