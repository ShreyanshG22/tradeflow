// Zerodha Configuration Management

// Configuration Schema (simplified without zod for now)
export interface ZerodhaConfig {
  // Zerodha API Configuration
  zerodha: {
    apiKey: string;
    apiSecret: string;
    redirectUrl: string;
    timeout: number;
    debug: boolean;
    pool: boolean;
  };
  
  // JWT Configuration
  jwt: {
    secret: string;
    expiresIn: string;
    issuer: string;
    audience: string;
  };
  
  // Database Configuration
  database: {
    url: string;
    pool: {
      min: number;
      max: number;
      idle: number;
    };
    ssl: boolean;
  };
  
  // Redis Configuration
  redis: {
    url: string;
    keyPrefix: string;
    ttl: {
      session: number;
      marketData: number;
      instruments: number;
      quotes: number;
    };
  };
  
  // Encryption Configuration
  encryption: {
    key: string;
    algorithm: string;
  };
  
  // Service Configuration
  service: {
    port: number;
    host: string;
    nodeEnv: 'development' | 'production' | 'test';
    logLevel: 'error' | 'warn' | 'info' | 'debug';
  };
  
  // Rate Limiting Configuration
  rateLimiting: {
    enabled: boolean;
    windowMs: number;
    maxRequests: number;
    skipSuccessfulRequests: boolean;
  };
  
  // WebSocket Configuration
  websocket: {
    enabled: boolean;
    reconnectInterval: number;
    maxReconnectAttempts: number;
    pingInterval: number;
    pongTimeout: number;
  };
  
  // Risk Management Configuration
  riskManagement: {
    enabled: boolean;
    maxOrderValue: number;
    maxDailyLoss: number;
    maxPositionSize: number;
    maxOrdersPerMinute: number;
    allowedProducts: string[];
    allowedExchanges: string[];
  };
  
  // Monitoring Configuration
  monitoring: {
    enabled: boolean;
    healthCheckInterval: number;
    metricsEnabled: boolean;
    alertsEnabled: boolean;
  };
}

// Environment Variable Mapping
export const ENV_MAPPING = {
  // Zerodha API
  'ZERODHA_API_KEY': 'zerodha.apiKey',
  'ZERODHA_API_SECRET': 'zerodha.apiSecret',
  'ZERODHA_REDIRECT_URL': 'zerodha.redirectUrl',
  'ZERODHA_TIMEOUT': 'zerodha.timeout',
  'ZERODHA_DEBUG': 'zerodha.debug',
  'ZERODHA_POOL': 'zerodha.pool',
  
  // JWT
  'JWT_SECRET': 'jwt.secret',
  'JWT_EXPIRES_IN': 'jwt.expiresIn',
  'JWT_ISSUER': 'jwt.issuer',
  'JWT_AUDIENCE': 'jwt.audience',
  
  // Database
  'DATABASE_URL': 'database.url',
  'DB_POOL_MIN': 'database.pool.min',
  'DB_POOL_MAX': 'database.pool.max',
  'DB_POOL_IDLE': 'database.pool.idle',
  'DB_SSL': 'database.ssl',
  
  // Redis
  'REDIS_URL': 'redis.url',
  'REDIS_KEY_PREFIX': 'redis.keyPrefix',
  'REDIS_SESSION_TTL': 'redis.ttl.session',
  'REDIS_MARKET_DATA_TTL': 'redis.ttl.marketData',
  'REDIS_INSTRUMENTS_TTL': 'redis.ttl.instruments',
  'REDIS_QUOTES_TTL': 'redis.ttl.quotes',
  
  // Encryption
  'ENCRYPTION_KEY': 'encryption.key',
  'ENCRYPTION_ALGORITHM': 'encryption.algorithm',
  
  // Service
  'PORT': 'service.port',
  'HOST': 'service.host',
  'NODE_ENV': 'service.nodeEnv',
  'LOG_LEVEL': 'service.logLevel',
  
  // Rate Limiting
  'RATE_LIMIT_ENABLED': 'rateLimiting.enabled',
  'RATE_LIMIT_WINDOW_MS': 'rateLimiting.windowMs',
  'RATE_LIMIT_MAX_REQUESTS': 'rateLimiting.maxRequests',
  'RATE_LIMIT_SKIP_SUCCESSFUL': 'rateLimiting.skipSuccessfulRequests',
  
  // WebSocket
  'WS_ENABLED': 'websocket.enabled',
  'WS_RECONNECT_INTERVAL': 'websocket.reconnectInterval',
  'WS_MAX_RECONNECT_ATTEMPTS': 'websocket.maxReconnectAttempts',
  'WS_PING_INTERVAL': 'websocket.pingInterval',
  'WS_PONG_TIMEOUT': 'websocket.pongTimeout',
  
  // Risk Management
  'RISK_MANAGEMENT_ENABLED': 'riskManagement.enabled',
  'RISK_MAX_ORDER_VALUE': 'riskManagement.maxOrderValue',
  'RISK_MAX_DAILY_LOSS': 'riskManagement.maxDailyLoss',
  'RISK_MAX_POSITION_SIZE': 'riskManagement.maxPositionSize',
  'RISK_MAX_ORDERS_PER_MINUTE': 'riskManagement.maxOrdersPerMinute',
  'RISK_ALLOWED_PRODUCTS': 'riskManagement.allowedProducts',
  'RISK_ALLOWED_EXCHANGES': 'riskManagement.allowedExchanges',
  
  // Monitoring
  'MONITORING_ENABLED': 'monitoring.enabled',
  'MONITORING_HEALTH_CHECK_INTERVAL': 'monitoring.healthCheckInterval',
  'MONITORING_METRICS_ENABLED': 'monitoring.metricsEnabled',
  'MONITORING_ALERTS_ENABLED': 'monitoring.alertsEnabled',
} as const;

// Configuration Loader
export class ZerodhaConfigLoader {
  private static instance: ZerodhaConfigLoader;
  private config: ZerodhaConfig | null = null;
  
  private constructor() {}
  
  public static getInstance(): ZerodhaConfigLoader {
    if (!ZerodhaConfigLoader.instance) {
      ZerodhaConfigLoader.instance = new ZerodhaConfigLoader();
    }
    return ZerodhaConfigLoader.instance;
  }
  
  /**
   * Load configuration from environment variables
   */
  public loadConfig(): ZerodhaConfig {
    if (this.config) {
      return this.config;
    }
    
    const rawConfig = this.buildConfigFromEnv();
    
    try {
      this.config = this.validateAndSetDefaults(rawConfig);
      return this.config;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown configuration error';
      throw new Error(`Configuration validation failed: ${errorMessage}`);
    }
  }
  
  /**
   * Get current configuration
   */
  public getConfig(): ZerodhaConfig {
    if (!this.config) {
      return this.loadConfig();
    }
    return this.config;
  }
  
  /**
   * Reload configuration
   */
  public reloadConfig(): ZerodhaConfig {
    this.config = null;
    return this.loadConfig();
  }
  
  /**
   * Build configuration object from environment variables
   */
  private buildConfigFromEnv(): any {
    const config: any = {
      zerodha: {},
      jwt: {},
      database: { pool: {} },
      redis: { ttl: {} },
      encryption: {},
      service: {},
      rateLimiting: {},
      websocket: {},
      riskManagement: {},
      monitoring: {},
    };
    
    // Map environment variables to configuration structure
    Object.entries(ENV_MAPPING).forEach(([envKey, configPath]) => {
      const envValue = process.env[envKey];
      if (envValue !== undefined) {
        this.setNestedValue(config, configPath, this.parseEnvValue(envValue));
      }
    });
    
    return config;
  }
  
  /**
   * Validate and set default values for configuration
   */
  private validateAndSetDefaults(rawConfig: any): ZerodhaConfig {
    const config: ZerodhaConfig = {
      zerodha: {
        apiKey: rawConfig.zerodha?.apiKey || '',
        apiSecret: rawConfig.zerodha?.apiSecret || '',
        redirectUrl: rawConfig.zerodha?.redirectUrl || '',
        timeout: rawConfig.zerodha?.timeout || 10000,
        debug: rawConfig.zerodha?.debug || false,
        pool: rawConfig.zerodha?.pool !== undefined ? rawConfig.zerodha.pool : true,
      },
      jwt: {
        secret: rawConfig.jwt?.secret || '',
        expiresIn: rawConfig.jwt?.expiresIn || '8h',
        issuer: rawConfig.jwt?.issuer || 'tradeflow',
        audience: rawConfig.jwt?.audience || 'tradeflow-users',
      },
      database: {
        url: rawConfig.database?.url || '',
        pool: {
          min: rawConfig.database?.pool?.min || 2,
          max: rawConfig.database?.pool?.max || 10,
          idle: rawConfig.database?.pool?.idle || 10000,
        },
        ssl: rawConfig.database?.ssl || false,
      },
      redis: {
        url: rawConfig.redis?.url || '',
        keyPrefix: rawConfig.redis?.keyPrefix || 'tradeflow:zerodha:',
        ttl: {
          session: rawConfig.redis?.ttl?.session || 28800,
          marketData: rawConfig.redis?.ttl?.marketData || 60,
          instruments: rawConfig.redis?.ttl?.instruments || 86400,
          quotes: rawConfig.redis?.ttl?.quotes || 30,
        },
      },
      encryption: {
        key: rawConfig.encryption?.key || '',
        algorithm: rawConfig.encryption?.algorithm || 'aes-256-cbc',
      },
      service: {
        port: rawConfig.service?.port || 3001,
        host: rawConfig.service?.host || '0.0.0.0',
        nodeEnv: rawConfig.service?.nodeEnv || 'development',
        logLevel: rawConfig.service?.logLevel || 'info',
      },
      rateLimiting: {
        enabled: rawConfig.rateLimiting?.enabled !== undefined ? rawConfig.rateLimiting.enabled : true,
        windowMs: rawConfig.rateLimiting?.windowMs || 60000,
        maxRequests: rawConfig.rateLimiting?.maxRequests || 100,
        skipSuccessfulRequests: rawConfig.rateLimiting?.skipSuccessfulRequests || false,
      },
      websocket: {
        enabled: rawConfig.websocket?.enabled !== undefined ? rawConfig.websocket.enabled : true,
        reconnectInterval: rawConfig.websocket?.reconnectInterval || 5000,
        maxReconnectAttempts: rawConfig.websocket?.maxReconnectAttempts || 10,
        pingInterval: rawConfig.websocket?.pingInterval || 30000,
        pongTimeout: rawConfig.websocket?.pongTimeout || 5000,
      },
      riskManagement: {
        enabled: rawConfig.riskManagement?.enabled !== undefined ? rawConfig.riskManagement.enabled : true,
        maxOrderValue: rawConfig.riskManagement?.maxOrderValue || 100000,
        maxDailyLoss: rawConfig.riskManagement?.maxDailyLoss || 50000,
        maxPositionSize: rawConfig.riskManagement?.maxPositionSize || 10000,
        maxOrdersPerMinute: rawConfig.riskManagement?.maxOrdersPerMinute || 10,
        allowedProducts: rawConfig.riskManagement?.allowedProducts || ['CNC', 'MIS', 'NRML'],
        allowedExchanges: rawConfig.riskManagement?.allowedExchanges || ['NSE', 'BSE'],
      },
      monitoring: {
        enabled: rawConfig.monitoring?.enabled !== undefined ? rawConfig.monitoring.enabled : true,
        healthCheckInterval: rawConfig.monitoring?.healthCheckInterval || 30000,
        metricsEnabled: rawConfig.monitoring?.metricsEnabled !== undefined ? rawConfig.monitoring.metricsEnabled : true,
        alertsEnabled: rawConfig.monitoring?.alertsEnabled !== undefined ? rawConfig.monitoring.alertsEnabled : true,
      },
    };

    // Validate required fields
    const requiredFields = [
      { path: 'zerodha.apiKey', value: config.zerodha.apiKey },
      { path: 'zerodha.apiSecret', value: config.zerodha.apiSecret },
      { path: 'zerodha.redirectUrl', value: config.zerodha.redirectUrl },
      { path: 'jwt.secret', value: config.jwt.secret },
      { path: 'database.url', value: config.database.url },
      { path: 'redis.url', value: config.redis.url },
      { path: 'encryption.key', value: config.encryption.key },
    ];

    const missingFields = requiredFields.filter(field => !field.value);
    if (missingFields.length > 0) {
      throw new Error(`Missing required configuration fields: ${missingFields.map(f => f.path).join(', ')}`);
    }

    return config;
  }
  
  /**
   * Set nested object value using dot notation path
   */
  private setNestedValue(obj: any, path: string, value: any): void {
    const keys = path.split('.');
    let current = obj;
    
    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i];
      if (key && !(key in current)) {
        current[key] = {};
      }
      if (key) {
        current = current[key];
      }
    }
    
    const lastKey = keys[keys.length - 1];
    if (lastKey) {
      current[lastKey] = value;
    }
  }
  
  /**
   * Parse environment variable value to appropriate type
   */
  private parseEnvValue(value: string): any {
    // Boolean values
    if (value.toLowerCase() === 'true') return true;
    if (value.toLowerCase() === 'false') return false;
    
    // Number values
    if (/^\d+$/.test(value)) return parseInt(value, 10);
    if (/^\d+\.\d+$/.test(value)) return parseFloat(value);
    
    // Array values (comma-separated)
    if (value.includes(',')) {
      return value.split(',').map(item => item.trim());
    }
    
    // String values
    return value;
  }
  
  /**
   * Validate required environment variables
   */
  public validateRequiredEnvVars(): void {
    const requiredVars = [
      'ZERODHA_API_KEY',
      'ZERODHA_API_SECRET',
      'ZERODHA_REDIRECT_URL',
      'JWT_SECRET',
      'DATABASE_URL',
      'REDIS_URL',
      'ENCRYPTION_KEY',
    ];
    
    const missingVars = requiredVars.filter(varName => !process.env[varName]);
    
    if (missingVars.length > 0) {
      throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
    }
  }
  
  /**
   * Get configuration for specific service
   */
  public getServiceConfig<K extends keyof ZerodhaConfig>(service: K): ZerodhaConfig[K] {
    return this.getConfig()[service];
  }
}

// Export singleton instance
export const configLoader = ZerodhaConfigLoader.getInstance();

// Utility functions
export const getZerodhaConfig = () => configLoader.getConfig();
export const getServiceConfig = <K extends keyof ZerodhaConfig>(service: K) => configLoader.getServiceConfig(service);

// Configuration validation helper
export const validateConfig = () => {
  try {
    configLoader.validateRequiredEnvVars();
    configLoader.loadConfig();
    return { valid: true, errors: [] };
  } catch (error) {
    return {
      valid: false,
      errors: error instanceof Error ? [error.message] : ['Unknown configuration error'],
    };
  }
};