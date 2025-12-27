import { config as dotenvConfig } from 'dotenv';

// Load environment variables
dotenvConfig();

export const config = {
  env: process.env['NODE_ENV'] || 'development',
  port: parseInt(process.env['PORT'] || '3001', 10),
  
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
    db: parseInt(process.env['REDIS_DB'] || '0', 10)
  },

  // JWT configuration
  jwt: {
    secret: process.env['JWT_SECRET'] || 'your-super-secret-jwt-key-change-in-production',
    refreshSecret: process.env['JWT_REFRESH_SECRET'] || 'your-super-secret-refresh-key-change-in-production',
    accessTokenExpiry: process.env['JWT_ACCESS_EXPIRY'] || '15m',
    refreshTokenExpiry: process.env['JWT_REFRESH_EXPIRY'] || '7d'
  },

  // CORS configuration
  cors: {
    origin: process.env['CORS_ORIGIN'] || 'http://localhost:3000'
  },

  // Security configuration
  security: {
    bcryptRounds: parseInt(process.env['BCRYPT_ROUNDS'] || '12', 10),
    maxLoginAttempts: parseInt(process.env['MAX_LOGIN_ATTEMPTS'] || '5', 10),
    lockoutDuration: parseInt(process.env['LOCKOUT_DURATION'] || '900000', 10) // 15 minutes
  },

  // Session configuration
  session: {
    maxSessions: parseInt(process.env['MAX_SESSIONS_PER_USER'] || '5', 10),
    cleanupInterval: parseInt(process.env['SESSION_CLEANUP_INTERVAL'] || '3600000', 10) // 1 hour
  }
};