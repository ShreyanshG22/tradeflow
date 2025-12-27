import dotenv from 'dotenv';

dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '3003'),
  nodeEnv: process.env.NODE_ENV || 'development',
  
  // Alpha Vantage Configuration
  alphaVantage: {
    apiKey: process.env.ALPHA_VANTAGE_API_KEY || '',
    baseUrl: process.env.ALPHA_VANTAGE_BASE_URL || 'https://www.alphavantage.co/query',
    rateLimit: parseInt(process.env.ALPHA_VANTAGE_RATE_LIMIT || '5'),
  },
  
  // Redis Configuration
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD || undefined,
    db: parseInt(process.env.REDIS_DB || '0'),
  },
  
  // Cache Settings
  cache: {
    ttlSeconds: parseInt(process.env.CACHE_TTL_SECONDS || '300'),
    maxSize: parseInt(process.env.MAX_CACHE_SIZE || '1000'),
  },
  
  // Rate Limiting
  rateLimits: {
    yahooFinance: parseInt(process.env.YAHOO_FINANCE_RATE_LIMIT || '100'),
  },
  
  // Logging
  logLevel: process.env.LOG_LEVEL || 'info',
};