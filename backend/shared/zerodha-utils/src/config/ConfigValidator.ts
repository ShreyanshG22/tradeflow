import Joi from 'joi';
import { logger } from '../logger';

export interface ZerodhaConfig {
  // Zerodha API
  zerodhaApiKey: string;
  zerodhaApiSecret: string;
  zerodhaRedirectUrl: string;

  // Database
  postgresUrl: string;
  postgresMaxConnections: number;
  postgresSsl: boolean;

  // Redis
  redisUrl: string;
  redisMaxRetries: number;
  redisRetryDelay: number;

  // InfluxDB
  influxdbUrl: string;
  influxdbToken: string;
  influxdbOrg: string;
  influxdbBucket: string;

  // Security
  jwtSecret: string;
  jwtExpiresIn: string;
  encryptionKey: string;
  sessionSecret: string;

  // Application
  nodeEnv: string;
  logLevel: string;
  debugMode: boolean;
  enableCors: boolean;
  corsOrigin: string;

  // Service URLs
  zerodhaAuthServiceUrl: string;
  zerodhaMarketServiceUrl: string;
  zerodhaOrderServiceUrl: string;
  zerodhaPortfolioServiceUrl: string;
  zerodhaRiskServiceUrl: string;

  // Rate Limiting
  rateLimitWindowMs: number;
  rateLimitMaxRequests: number;
  rateLimitAuthMax: number;
  rateLimitOrderMax: number;

  // Market Data
  marketDataCacheTtl: number;
  instrumentCacheTtl: number;
  historicalDataCacheTtl: number;
  wsHeartbeatInterval: number;
  wsReconnectInterval: number;
  maxWsReconnectAttempts: number;

  // Order Management
  orderTimeoutMs: number;
  orderRetryAttempts: number;
  orderRetryDelay: number;
  maxOrdersPerMinute: number;
  orderValidationTimeout: number;

  // Risk Management
  defaultMaxOrderValue: number;
  defaultMaxDailyLoss: number;
  defaultMaxPositionSize: number;
  riskCheckTimeout: number;
  portfolioUpdateInterval: number;

  // Circuit Breaker
  circuitBreakerFailureThreshold: number;
  circuitBreakerResetTimeout: number;
  circuitBreakerMonitorTimeout: number;
}

const configSchema = Joi.object<ZerodhaConfig>({
  // Zerodha API - Required
  zerodhaApiKey: Joi.string().required().min(1).description('Zerodha API Key'),
  zerodhaApiSecret: Joi.string().required().min(1).description('Zerodha API Secret'),
  zerodhaRedirectUrl: Joi.string().uri().required().description('Zerodha OAuth Redirect URL'),

  // Database - Required
  postgresUrl: Joi.string().uri().required().description('PostgreSQL Connection URL'),
  postgresMaxConnections: Joi.number().integer().min(1).max(100).default(20),
  postgresSsl: Joi.boolean().default(false),

  // Redis - Required
  redisUrl: Joi.string().uri().required().description('Redis Connection URL'),
  redisMaxRetries: Joi.number().integer().min(0).max(10).default(3),
  redisRetryDelay: Joi.number().integer().min(100).max(10000).default(1000),

  // InfluxDB - Required for market data
  influxdbUrl: Joi.string().uri().required().description('InfluxDB URL'),
  influxdbToken: Joi.string().required().min(1).description('InfluxDB Token'),
  influxdbOrg: Joi.string().required().min(1).description('InfluxDB Organization'),
  influxdbBucket: Joi.string().required().min(1).description('InfluxDB Bucket'),

  // Security - Required
  jwtSecret: Joi.string().required().min(32).description('JWT Secret (min 32 chars)'),
  jwtExpiresIn: Joi.string().default('8h').description('JWT Expiration Time'),
  encryptionKey: Joi.string().required().length(32).description('Encryption Key (32 chars)'),
  sessionSecret: Joi.string().required().min(32).description('Session Secret (min 32 chars)'),

  // Application
  nodeEnv: Joi.string().valid('development', 'staging', 'production').default('development'),
  logLevel: Joi.string().valid('error', 'warn', 'info', 'debug').default('info'),
  debugMode: Joi.boolean().default(false),
  enableCors: Joi.boolean().default(true),
  corsOrigin: Joi.string().default('*'),

  // Service URLs
  zerodhaAuthServiceUrl: Joi.string().uri().required(),
  zerodhaMarketServiceUrl: Joi.string().uri().required(),
  zerodhaOrderServiceUrl: Joi.string().uri().required(),
  zerodhaPortfolioServiceUrl: Joi.string().uri().required(),
  zerodhaRiskServiceUrl: Joi.string().uri().required(),

  // Rate Limiting
  rateLimitWindowMs: Joi.number().integer().min(1000).max(3600000).default(60000),
  rateLimitMaxRequests: Joi.number().integer().min(1).max(10000).default(100),
  rateLimitAuthMax: Joi.number().integer().min(1).max(1000).default(10),
  rateLimitOrderMax: Joi.number().integer().min(1).max(1000).default(50),

  // Market Data
  marketDataCacheTtl: Joi.number().integer().min(1).max(3600).default(60),
  instrumentCacheTtl: Joi.number().integer().min(3600).max(604800).default(86400),
  historicalDataCacheTtl: Joi.number().integer().min(300).max(86400).default(3600),
  wsHeartbeatInterval: Joi.number().integer().min(5000).max(120000).default(30000),
  wsReconnectInterval: Joi.number().integer().min(1000).max(60000).default(5000),
  maxWsReconnectAttempts: Joi.number().integer().min(1).max(50).default(10),

  // Order Management
  orderTimeoutMs: Joi.number().integer().min(1000).max(120000).default(30000),
  orderRetryAttempts: Joi.number().integer().min(0).max(10).default(3),
  orderRetryDelay: Joi.number().integer().min(100).max(10000).default(1000),
  maxOrdersPerMinute: Joi.number().integer().min(1).max(1000).default(60),
  orderValidationTimeout: Joi.number().integer().min(1000).max(30000).default(5000),

  // Risk Management
  defaultMaxOrderValue: Joi.number().min(1000).max(10000000).default(100000),
  defaultMaxDailyLoss: Joi.number().min(1000).max(10000000).default(50000),
  defaultMaxPositionSize: Joi.number().min(10000).max(100000000).default(1000000),
  riskCheckTimeout: Joi.number().integer().min(1000).max(30000).default(3000),
  portfolioUpdateInterval: Joi.number().integer().min(5000).max(300000).default(30000),

  // Circuit Breaker
  circuitBreakerFailureThreshold: Joi.number().integer().min(1).max(20).default(5),
  circuitBreakerResetTimeout: Joi.number().integer().min(10000).max(600000).default(60000),
  circuitBreakerMonitorTimeout: Joi.number().integer().min(1000).max(60000).default(10000),
});

export class ConfigValidator {
  private static instance: ConfigValidator;
  private validatedConfig: ZerodhaConfig | null = null;

  private constructor() {}

  public static getInstance(): ConfigValidator {
    if (!ConfigValidator.instance) {
      ConfigValidator.instance = new ConfigValidator();
    }
    return ConfigValidator.instance;
  }

  public validateConfig(config: Record<string, any>): ZerodhaConfig {
    try {
      const { error, value } = configSchema.validate(config, {
        abortEarly: false,
        allowUnknown: true,
        stripUnknown: true,
      });

      if (error) {
        const errorMessages = error.details.map(detail => detail.message).join(', ');
        logger.error('Configuration validation failed', { errors: errorMessages });
        throw new Error(`Configuration validation failed: ${errorMessages}`);
      }

      this.validatedConfig = value;
      logger.info('Configuration validation successful');
      
      // Log configuration summary (without secrets)
      this.logConfigSummary(value);
      
      return value;
    } catch (error) {
      logger.error('Configuration validation error', { error: error.message });
      throw error;
    }
  }

  public getValidatedConfig(): ZerodhaConfig {
    if (!this.validatedConfig) {
      throw new Error('Configuration has not been validated yet');
    }
    return this.validatedConfig;
  }

  public validateEnvironmentSpecific(nodeEnv: string): void {
    if (!this.validatedConfig) {
      throw new Error('Configuration must be validated first');
    }

    const config = this.validatedConfig;

    switch (nodeEnv) {
      case 'production':
        this.validateProductionConfig(config);
        break;
      case 'staging':
        this.validateStagingConfig(config);
        break;
      case 'development':
        this.validateDevelopmentConfig(config);
        break;
      default:
        throw new Error(`Unknown environment: ${nodeEnv}`);
    }
  }

  private validateProductionConfig(config: ZerodhaConfig): void {
    const productionChecks = [
      {
        condition: config.debugMode === false,
        message: 'Debug mode must be disabled in production'
      },
      {
        condition: config.logLevel === 'warn' || config.logLevel === 'error',
        message: 'Log level should be warn or error in production'
      },
      {
        condition: config.jwtSecret.length >= 64,
        message: 'JWT secret should be at least 64 characters in production'
      },
      {
        condition: config.postgresSsl === true,
        message: 'PostgreSQL SSL must be enabled in production'
      },
      {
        condition: !config.zerodhaRedirectUrl.includes('localhost'),
        message: 'Redirect URL should not contain localhost in production'
      },
      {
        condition: config.corsOrigin !== '*',
        message: 'CORS origin should not be wildcard in production'
      }
    ];

    const failures = productionChecks.filter(check => !check.condition);
    if (failures.length > 0) {
      const messages = failures.map(f => f.message).join(', ');
      throw new Error(`Production configuration validation failed: ${messages}`);
    }

    logger.info('Production configuration validation passed');
  }

  private validateStagingConfig(config: ZerodhaConfig): void {
    const stagingChecks = [
      {
        condition: config.zerodhaRedirectUrl.includes('staging') || config.zerodhaRedirectUrl.includes('test'),
        message: 'Staging should use staging/test redirect URL'
      }
    ];

    const failures = stagingChecks.filter(check => !check.condition);
    if (failures.length > 0) {
      const messages = failures.map(f => f.message).join(', ');
      logger.warn(`Staging configuration warnings: ${messages}`);
    }

    logger.info('Staging configuration validation passed');
  }

  private validateDevelopmentConfig(config: ZerodhaConfig): void {
    // Development is more permissive, just log warnings for potential issues
    const warnings = [];

    if (config.jwtSecret.length < 32) {
      warnings.push('JWT secret is shorter than recommended');
    }

    if (config.corsOrigin === '*') {
      warnings.push('CORS is set to wildcard (acceptable for development)');
    }

    if (warnings.length > 0) {
      logger.warn('Development configuration warnings', { warnings });
    }

    logger.info('Development configuration validation passed');
  }

  private logConfigSummary(config: ZerodhaConfig): void {
    const summary = {
      environment: config.nodeEnv,
      logLevel: config.logLevel,
      debugMode: config.debugMode,
      corsEnabled: config.enableCors,
      databaseSsl: config.postgresSsl,
      services: {
        auth: config.zerodhaAuthServiceUrl,
        market: config.zerodhaMarketServiceUrl,
        order: config.zerodhaOrderServiceUrl,
        portfolio: config.zerodhaPortfolioServiceUrl,
        risk: config.zerodhaRiskServiceUrl,
      },
      rateLimits: {
        window: config.rateLimitWindowMs,
        maxRequests: config.rateLimitMaxRequests,
        authMax: config.rateLimitAuthMax,
        orderMax: config.rateLimitOrderMax,
      },
      timeouts: {
        order: config.orderTimeoutMs,
        riskCheck: config.riskCheckTimeout,
        wsReconnect: config.wsReconnectInterval,
      }
    };

    logger.info('Configuration summary', summary);
  }

  public static loadFromEnvironment(): ZerodhaConfig {
    const validator = ConfigValidator.getInstance();
    
    const config = {
      // Zerodha API
      zerodhaApiKey: process.env.ZERODHA_API_KEY,
      zerodhaApiSecret: process.env.ZERODHA_API_SECRET,
      zerodhaRedirectUrl: process.env.ZERODHA_REDIRECT_URL,

      // Database
      postgresUrl: process.env.POSTGRES_URL,
      postgresMaxConnections: parseInt(process.env.POSTGRES_MAX_CONNECTIONS || '20'),
      postgresSsl: process.env.POSTGRES_SSL === 'true',

      // Redis
      redisUrl: process.env.REDIS_URL,
      redisMaxRetries: parseInt(process.env.REDIS_MAX_RETRIES || '3'),
      redisRetryDelay: parseInt(process.env.REDIS_RETRY_DELAY || '1000'),

      // InfluxDB
      influxdbUrl: process.env.INFLUXDB_URL,
      influxdbToken: process.env.INFLUXDB_TOKEN,
      influxdbOrg: process.env.INFLUXDB_ORG,
      influxdbBucket: process.env.INFLUXDB_BUCKET,

      // Security
      jwtSecret: process.env.JWT_SECRET,
      jwtExpiresIn: process.env.JWT_EXPIRES_IN || '8h',
      encryptionKey: process.env.ENCRYPTION_KEY,
      sessionSecret: process.env.SESSION_SECRET,

      // Application
      nodeEnv: process.env.NODE_ENV || 'development',
      logLevel: process.env.LOG_LEVEL || 'info',
      debugMode: process.env.DEBUG_MODE === 'true',
      enableCors: process.env.ENABLE_CORS !== 'false',
      corsOrigin: process.env.CORS_ORIGIN || '*',

      // Service URLs
      zerodhaAuthServiceUrl: process.env.ZERODHA_AUTH_SERVICE_URL,
      zerodhaMarketServiceUrl: process.env.ZERODHA_MARKET_SERVICE_URL,
      zerodhaOrderServiceUrl: process.env.ZERODHA_ORDER_SERVICE_URL,
      zerodhaPortfolioServiceUrl: process.env.ZERODHA_PORTFOLIO_SERVICE_URL,
      zerodhaRiskServiceUrl: process.env.ZERODHA_RISK_SERVICE_URL,

      // Rate Limiting
      rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000'),
      rateLimitMaxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100'),
      rateLimitAuthMax: parseInt(process.env.RATE_LIMIT_AUTH_MAX || '10'),
      rateLimitOrderMax: parseInt(process.env.RATE_LIMIT_ORDER_MAX || '50'),

      // Market Data
      marketDataCacheTtl: parseInt(process.env.MARKET_DATA_CACHE_TTL || '60'),
      instrumentCacheTtl: parseInt(process.env.INSTRUMENT_CACHE_TTL || '86400'),
      historicalDataCacheTtl: parseInt(process.env.HISTORICAL_DATA_CACHE_TTL || '3600'),
      wsHeartbeatInterval: parseInt(process.env.WS_HEARTBEAT_INTERVAL || '30000'),
      wsReconnectInterval: parseInt(process.env.WS_RECONNECT_INTERVAL || '5000'),
      maxWsReconnectAttempts: parseInt(process.env.MAX_WS_RECONNECT_ATTEMPTS || '10'),

      // Order Management
      orderTimeoutMs: parseInt(process.env.ORDER_TIMEOUT_MS || '30000'),
      orderRetryAttempts: parseInt(process.env.ORDER_RETRY_ATTEMPTS || '3'),
      orderRetryDelay: parseInt(process.env.ORDER_RETRY_DELAY || '1000'),
      maxOrdersPerMinute: parseInt(process.env.MAX_ORDERS_PER_MINUTE || '60'),
      orderValidationTimeout: parseInt(process.env.ORDER_VALIDATION_TIMEOUT || '5000'),

      // Risk Management
      defaultMaxOrderValue: parseFloat(process.env.DEFAULT_MAX_ORDER_VALUE || '100000'),
      defaultMaxDailyLoss: parseFloat(process.env.DEFAULT_MAX_DAILY_LOSS || '50000'),
      defaultMaxPositionSize: parseFloat(process.env.DEFAULT_MAX_POSITION_SIZE || '1000000'),
      riskCheckTimeout: parseInt(process.env.RISK_CHECK_TIMEOUT || '3000'),
      portfolioUpdateInterval: parseInt(process.env.PORTFOLIO_UPDATE_INTERVAL || '30000'),

      // Circuit Breaker
      circuitBreakerFailureThreshold: parseInt(process.env.CIRCUIT_BREAKER_FAILURE_THRESHOLD || '5'),
      circuitBreakerResetTimeout: parseInt(process.env.CIRCUIT_BREAKER_RESET_TIMEOUT || '60000'),
      circuitBreakerMonitorTimeout: parseInt(process.env.CIRCUIT_BREAKER_MONITOR_TIMEOUT || '10000'),
    };

    const validatedConfig = validator.validateConfig(config);
    validator.validateEnvironmentSpecific(validatedConfig.nodeEnv);
    
    return validatedConfig;
  }
}