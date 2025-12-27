import { ConfigValidator, ZerodhaConfig } from '../../shared/zerodha-utils/src/config/ConfigValidator';
import { SecretsManager } from '../../shared/zerodha-utils/src/config/SecretsManager';
import { ConfigLoader } from '../../shared/zerodha-utils/src/config/ConfigLoader';

describe('Configuration Validation Tests', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('ConfigValidator', () => {
    it('should validate a complete valid configuration', () => {
      const validConfig = {
        zerodhaApiKey: 'test_api_key_12345',
        zerodhaApiSecret: 'test_api_secret_67890',
        zerodhaRedirectUrl: 'https://example.com/callback',
        postgresUrl: 'postgresql://user:pass@localhost:5432/db',
        postgresMaxConnections: 20,
        postgresSsl: false,
        redisUrl: 'redis://localhost:6379',
        redisMaxRetries: 3,
        redisRetryDelay: 1000,
        influxdbUrl: 'http://localhost:8086',
        influxdbToken: 'test_token',
        influxdbOrg: 'test_org',
        influxdbBucket: 'test_bucket',
        jwtSecret: 'test_jwt_secret_key_minimum_32_characters_long',
        jwtExpiresIn: '8h',
        encryptionKey: 'test_encryption_key_32_characters',
        sessionSecret: 'test_session_secret_key_minimum_32_characters_long',
        nodeEnv: 'test',
        logLevel: 'info',
        debugMode: false,
        enableCors: true,
        corsOrigin: 'https://example.com',
        zerodhaAuthServiceUrl: 'http://localhost:3009',
        zerodhaMarketServiceUrl: 'http://localhost:3005',
        zerodhaOrderServiceUrl: 'http://localhost:3006',
        zerodhaPortfolioServiceUrl: 'http://localhost:3007',
        zerodhaRiskServiceUrl: 'http://localhost:3008',
        rateLimitWindowMs: 60000,
        rateLimitMaxRequests: 100,
        rateLimitAuthMax: 10,
        rateLimitOrderMax: 50,
        marketDataCacheTtl: 60,
        instrumentCacheTtl: 86400,
        historicalDataCacheTtl: 3600,
        wsHeartbeatInterval: 30000,
        wsReconnectInterval: 5000,
        maxWsReconnectAttempts: 10,
        orderTimeoutMs: 30000,
        orderRetryAttempts: 3,
        orderRetryDelay: 1000,
        maxOrdersPerMinute: 60,
        orderValidationTimeout: 5000,
        defaultMaxOrderValue: 100000,
        defaultMaxDailyLoss: 50000,
        defaultMaxPositionSize: 1000000,
        riskCheckTimeout: 3000,
        portfolioUpdateInterval: 30000,
        circuitBreakerFailureThreshold: 5,
        circuitBreakerResetTimeout: 60000,
        circuitBreakerMonitorTimeout: 10000,
      };

      const validator = ConfigValidator.getInstance();
      const result = validator.validateConfig(validConfig);

      expect(result).toBeDefined();
      expect(result.zerodhaApiKey).toBe(validConfig.zerodhaApiKey);
      expect(result.nodeEnv).toBe('test');
    });

    it('should reject configuration with missing required fields', () => {
      const invalidConfig = {
        zerodhaApiKey: 'test_key',
        // Missing zerodhaApiSecret and other required fields
      };

      const validator = ConfigValidator.getInstance();
      
      expect(() => {
        validator.validateConfig(invalidConfig);
      }).toThrow(/Configuration validation failed/);
    });

    it('should reject configuration with invalid JWT secret length', () => {
      const invalidConfig = {
        zerodhaApiKey: 'test_api_key_12345',
        zerodhaApiSecret: 'test_api_secret_67890',
        zerodhaRedirectUrl: 'https://example.com/callback',
        postgresUrl: 'postgresql://user:pass@localhost:5432/db',
        redisUrl: 'redis://localhost:6379',
        influxdbUrl: 'http://localhost:8086',
        influxdbToken: 'test_token',
        influxdbOrg: 'test_org',
        influxdbBucket: 'test_bucket',
        jwtSecret: 'short', // Too short
        encryptionKey: 'test_encryption_key_32_characters',
        sessionSecret: 'test_session_secret_key_minimum_32_characters_long',
        zerodhaAuthServiceUrl: 'http://localhost:3009',
        zerodhaMarketServiceUrl: 'http://localhost:3005',
        zerodhaOrderServiceUrl: 'http://localhost:3006',
        zerodhaPortfolioServiceUrl: 'http://localhost:3007',
        zerodhaRiskServiceUrl: 'http://localhost:3008',
      };

      const validator = ConfigValidator.getInstance();
      
      expect(() => {
        validator.validateConfig(invalidConfig);
      }).toThrow(/JWT Secret/);
    });

    it('should reject configuration with invalid encryption key length', () => {
      const invalidConfig = {
        zerodhaApiKey: 'test_api_key_12345',
        zerodhaApiSecret: 'test_api_secret_67890',
        zerodhaRedirectUrl: 'https://example.com/callback',
        postgresUrl: 'postgresql://user:pass@localhost:5432/db',
        redisUrl: 'redis://localhost:6379',
        influxdbUrl: 'http://localhost:8086',
        influxdbToken: 'test_token',
        influxdbOrg: 'test_org',
        influxdbBucket: 'test_bucket',
        jwtSecret: 'test_jwt_secret_key_minimum_32_characters_long',
        encryptionKey: 'short_key', // Wrong length
        sessionSecret: 'test_session_secret_key_minimum_32_characters_long',
        zerodhaAuthServiceUrl: 'http://localhost:3009',
        zerodhaMarketServiceUrl: 'http://localhost:3005',
        zerodhaOrderServiceUrl: 'http://localhost:3006',
        zerodhaPortfolioServiceUrl: 'http://localhost:3007',
        zerodhaRiskServiceUrl: 'http://localhost:3008',
      };

      const validator = ConfigValidator.getInstance();
      
      expect(() => {
        validator.validateConfig(invalidConfig);
      }).toThrow(/Encryption Key/);
    });

    it('should validate production-specific requirements', () => {
      const productionConfig = {
        zerodhaApiKey: 'prod_api_key_12345',
        zerodhaApiSecret: 'prod_api_secret_67890',
        zerodhaRedirectUrl: 'https://production.com/callback',
        postgresUrl: 'postgresql://user:pass@localhost:5432/db',
        postgresMaxConnections: 50,
        postgresSsl: true,
        redisUrl: 'redis://localhost:6379',
        redisMaxRetries: 5,
        redisRetryDelay: 2000,
        influxdbUrl: 'http://localhost:8086',
        influxdbToken: 'prod_token',
        influxdbOrg: 'prod_org',
        influxdbBucket: 'prod_bucket',
        jwtSecret: 'production_jwt_secret_key_minimum_64_characters_for_security_purposes',
        jwtExpiresIn: '4h',
        encryptionKey: 'prod_encryption_key_32_characters',
        sessionSecret: 'production_session_secret_key_minimum_32_characters_long',
        nodeEnv: 'production',
        logLevel: 'warn',
        debugMode: false,
        enableCors: true,
        corsOrigin: 'https://production.com',
        zerodhaAuthServiceUrl: 'http://zerodha-auth-service:3009',
        zerodhaMarketServiceUrl: 'http://zerodha-market-service:3005',
        zerodhaOrderServiceUrl: 'http://zerodha-order-service:3006',
        zerodhaPortfolioServiceUrl: 'http://zerodha-portfolio-service:3007',
        zerodhaRiskServiceUrl: 'http://zerodha-risk-service:3008',
        rateLimitWindowMs: 60000,
        rateLimitMaxRequests: 200,
        rateLimitAuthMax: 20,
        rateLimitOrderMax: 100,
        marketDataCacheTtl: 30,
        instrumentCacheTtl: 86400,
        historicalDataCacheTtl: 1800,
        wsHeartbeatInterval: 30000,
        wsReconnectInterval: 3000,
        maxWsReconnectAttempts: 20,
        orderTimeoutMs: 15000,
        orderRetryAttempts: 5,
        orderRetryDelay: 500,
        maxOrdersPerMinute: 120,
        orderValidationTimeout: 3000,
        defaultMaxOrderValue: 500000,
        defaultMaxDailyLoss: 100000,
        defaultMaxPositionSize: 2000000,
        riskCheckTimeout: 2000,
        portfolioUpdateInterval: 15000,
        circuitBreakerFailureThreshold: 3,
        circuitBreakerResetTimeout: 30000,
        circuitBreakerMonitorTimeout: 5000,
      };

      const validator = ConfigValidator.getInstance();
      const result = validator.validateConfig(productionConfig);
      
      expect(() => {
        validator.validateEnvironmentSpecific('production');
      }).not.toThrow();
      
      expect(result.nodeEnv).toBe('production');
      expect(result.postgresSsl).toBe(true);
      expect(result.debugMode).toBe(false);
    });
  });

  describe('SecretsManager', () => {
    it('should load secrets from environment variables', async () => {
      process.env.ZERODHA_API_KEY = 'test_api_key';
      process.env.ZERODHA_API_SECRET = 'test_api_secret';
      process.env.JWT_SECRET = 'test_jwt_secret_minimum_32_characters';
      process.env.ENCRYPTION_KEY = 'test_encryption_key_32_characters';
      process.env.SESSION_SECRET = 'test_session_secret_minimum_32_chars';

      const config = SecretsManager.createDefaultConfig();
      const secretsManager = SecretsManager.getInstance(config);
      
      await secretsManager.loadSecrets();
      
      expect(secretsManager.hasSecret('ZERODHA_API_KEY')).toBe(true);
      expect(secretsManager.getSecret('ZERODHA_API_KEY')).toBe('test_api_key');
      expect(secretsManager.hasSecret('JWT_SECRET')).toBe(true);
    });

    it('should validate secret formats', async () => {
      process.env.ZERODHA_API_KEY = 'invalid_key_format!@#';
      process.env.ZERODHA_API_SECRET = 'test_api_secret';
      process.env.JWT_SECRET = 'short'; // Too short
      process.env.ENCRYPTION_KEY = 'wrong_length_key';
      process.env.SESSION_SECRET = 'test_session_secret_minimum_32_chars';

      const config = SecretsManager.createDefaultConfig();
      const secretsManager = SecretsManager.getInstance(config);
      
      await secretsManager.loadSecrets();
      
      expect(secretsManager.validateSecrets()).toBe(false);
    });

    it('should handle missing required secrets', async () => {
      // Clear environment variables
      delete process.env.ZERODHA_API_KEY;
      delete process.env.ZERODHA_API_SECRET;

      const config = SecretsManager.createDefaultConfig();
      const secretsManager = SecretsManager.getInstance(config);
      
      await expect(secretsManager.loadSecrets()).rejects.toThrow();
    });
  });

  describe('ConfigLoader', () => {
    it('should load configuration from environment', async () => {
      // Set up complete environment
      process.env.NODE_ENV = 'test';
      process.env.ZERODHA_API_KEY = 'test_api_key_12345';
      process.env.ZERODHA_API_SECRET = 'test_api_secret_67890';
      process.env.ZERODHA_REDIRECT_URL = 'https://test.com/callback';
      process.env.POSTGRES_URL = 'postgresql://user:pass@localhost:5432/db';
      process.env.REDIS_URL = 'redis://localhost:6379';
      process.env.INFLUXDB_URL = 'http://localhost:8086';
      process.env.INFLUXDB_TOKEN = 'test_token';
      process.env.INFLUXDB_ORG = 'test_org';
      process.env.INFLUXDB_BUCKET = 'test_bucket';
      process.env.JWT_SECRET = 'test_jwt_secret_key_minimum_32_characters_long';
      process.env.ENCRYPTION_KEY = 'test_encryption_key_32_characters';
      process.env.SESSION_SECRET = 'test_session_secret_key_minimum_32_characters_long';
      process.env.ZERODHA_AUTH_SERVICE_URL = 'http://localhost:3009';
      process.env.ZERODHA_MARKET_SERVICE_URL = 'http://localhost:3005';
      process.env.ZERODHA_ORDER_SERVICE_URL = 'http://localhost:3006';
      process.env.ZERODHA_PORTFOLIO_SERVICE_URL = 'http://localhost:3007';
      process.env.ZERODHA_RISK_SERVICE_URL = 'http://localhost:3008';

      const loader = ConfigLoader.getInstance();
      const config = await loader.loadConfiguration({
        loadSecrets: true,
        validateEnvironment: true,
      });

      expect(config).toBeDefined();
      expect(config.nodeEnv).toBe('test');
      expect(config.zerodhaApiKey).toBe('test_api_key_12345');
    });

    it('should validate configuration after loading', async () => {
      // Set up minimal valid environment
      process.env.NODE_ENV = 'development';
      process.env.ZERODHA_API_KEY = 'dev_api_key_12345';
      process.env.ZERODHA_API_SECRET = 'dev_api_secret_67890';
      process.env.ZERODHA_REDIRECT_URL = 'http://localhost:3000/callback';
      process.env.POSTGRES_URL = 'postgresql://user:pass@localhost:5432/db';
      process.env.REDIS_URL = 'redis://localhost:6379';
      process.env.INFLUXDB_URL = 'http://localhost:8086';
      process.env.INFLUXDB_TOKEN = 'dev_token';
      process.env.INFLUXDB_ORG = 'dev_org';
      process.env.INFLUXDB_BUCKET = 'dev_bucket';
      process.env.JWT_SECRET = 'development_jwt_secret_key_minimum_32_characters';
      process.env.ENCRYPTION_KEY = 'dev_encryption_key_32_characters_';
      process.env.SESSION_SECRET = 'development_session_secret_key_minimum_32_characters';
      process.env.ZERODHA_AUTH_SERVICE_URL = 'http://localhost:3009';
      process.env.ZERODHA_MARKET_SERVICE_URL = 'http://localhost:3005';
      process.env.ZERODHA_ORDER_SERVICE_URL = 'http://localhost:3006';
      process.env.ZERODHA_PORTFOLIO_SERVICE_URL = 'http://localhost:3007';
      process.env.ZERODHA_RISK_SERVICE_URL = 'http://localhost:3008';

      const loader = ConfigLoader.getInstance();
      await loader.loadConfiguration();

      expect(loader.validateCurrentConfig()).toBe(true);
    });

    it('should provide configuration summary', async () => {
      process.env.NODE_ENV = 'test';
      process.env.ZERODHA_API_KEY = 'test_key';
      process.env.ZERODHA_API_SECRET = 'test_secret';
      process.env.JWT_SECRET = 'test_jwt_secret_key_minimum_32_characters_long';
      process.env.ENCRYPTION_KEY = 'test_encryption_key_32_characters';
      process.env.SESSION_SECRET = 'test_session_secret_key_minimum_32_characters_long';
      process.env.POSTGRES_URL = 'postgresql://user:pass@localhost:5432/db';
      process.env.REDIS_URL = 'redis://localhost:6379';
      process.env.INFLUXDB_URL = 'http://localhost:8086';
      process.env.INFLUXDB_TOKEN = 'test_token';
      process.env.INFLUXDB_ORG = 'test_org';
      process.env.INFLUXDB_BUCKET = 'test_bucket';
      process.env.ZERODHA_REDIRECT_URL = 'http://localhost:3000/callback';
      process.env.ZERODHA_AUTH_SERVICE_URL = 'http://localhost:3009';
      process.env.ZERODHA_MARKET_SERVICE_URL = 'http://localhost:3005';
      process.env.ZERODHA_ORDER_SERVICE_URL = 'http://localhost:3006';
      process.env.ZERODHA_PORTFOLIO_SERVICE_URL = 'http://localhost:3007';
      process.env.ZERODHA_RISK_SERVICE_URL = 'http://localhost:3008';

      const loader = ConfigLoader.getInstance();
      await loader.loadConfiguration();

      const summary = loader.getConfigSummary();
      
      expect(summary.status).toBe('loaded');
      expect(summary.environment).toBe('test');
      expect(summary.services).toBeDefined();
      expect(summary.secretsLoaded).toBe(true);
    });
  });

  describe('Environment-specific validation', () => {
    it('should enforce production security requirements', () => {
      const validator = ConfigValidator.getInstance();
      
      // Mock a production config with security issues
      const insecureConfig = {
        nodeEnv: 'production',
        debugMode: true, // Should be false in production
        logLevel: 'debug', // Should be warn/error in production
        jwtSecret: 'short_secret', // Too short for production
        postgresSsl: false, // Should be true in production
        zerodhaRedirectUrl: 'http://localhost:3000/callback', // Should not be localhost
        corsOrigin: '*', // Should not be wildcard in production
      };

      validator.validateConfig({
        ...insecureConfig,
        zerodhaApiKey: 'prod_key',
        zerodhaApiSecret: 'prod_secret',
        postgresUrl: 'postgresql://user:pass@localhost:5432/db',
        redisUrl: 'redis://localhost:6379',
        influxdbUrl: 'http://localhost:8086',
        influxdbToken: 'prod_token',
        influxdbOrg: 'prod_org',
        influxdbBucket: 'prod_bucket',
        encryptionKey: 'prod_encryption_key_32_characters',
        sessionSecret: 'production_session_secret_minimum_32_chars',
        zerodhaAuthServiceUrl: 'http://localhost:3009',
        zerodhaMarketServiceUrl: 'http://localhost:3005',
        zerodhaOrderServiceUrl: 'http://localhost:3006',
        zerodhaPortfolioServiceUrl: 'http://localhost:3007',
        zerodhaRiskServiceUrl: 'http://localhost:3008',
      });

      expect(() => {
        validator.validateEnvironmentSpecific('production');
      }).toThrow(/Production configuration validation failed/);
    });

    it('should allow relaxed settings in development', () => {
      const validator = ConfigValidator.getInstance();
      
      const devConfig = {
        nodeEnv: 'development',
        debugMode: true,
        logLevel: 'debug',
        jwtSecret: 'dev_jwt_secret_minimum_32_chars',
        postgresSsl: false,
        zerodhaRedirectUrl: 'http://localhost:3000/callback',
        corsOrigin: '*',
        zerodhaApiKey: 'dev_key',
        zerodhaApiSecret: 'dev_secret',
        postgresUrl: 'postgresql://user:pass@localhost:5432/db',
        redisUrl: 'redis://localhost:6379',
        influxdbUrl: 'http://localhost:8086',
        influxdbToken: 'dev_token',
        influxdbOrg: 'dev_org',
        influxdbBucket: 'dev_bucket',
        encryptionKey: 'dev_encryption_key_32_characters_',
        sessionSecret: 'development_session_secret_minimum_32_chars',
        zerodhaAuthServiceUrl: 'http://localhost:3009',
        zerodhaMarketServiceUrl: 'http://localhost:3005',
        zerodhaOrderServiceUrl: 'http://localhost:3006',
        zerodhaPortfolioServiceUrl: 'http://localhost:3007',
        zerodhaRiskServiceUrl: 'http://localhost:3008',
      };

      validator.validateConfig(devConfig);

      expect(() => {
        validator.validateEnvironmentSpecific('development');
      }).not.toThrow();
    });
  });
});