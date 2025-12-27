import * as dotenv from 'dotenv';
import * as path from 'path';
import { ConfigValidator, ZerodhaConfig } from './ConfigValidator';
import { SecretsManager, SecretConfig } from './SecretsManager';
import { logger } from '../logger';

export interface ConfigLoaderOptions {
  envFile?: string;
  secretsConfig?: SecretConfig;
  validateEnvironment?: boolean;
  loadSecrets?: boolean;
}

export class ConfigLoader {
  private static instance: ConfigLoader;
  private config: ZerodhaConfig | null = null;
  private secretsManager: SecretsManager | null = null;

  private constructor() {}

  public static getInstance(): ConfigLoader {
    if (!ConfigLoader.instance) {
      ConfigLoader.instance = new ConfigLoader();
    }
    return ConfigLoader.instance;
  }

  public async loadConfiguration(options: ConfigLoaderOptions = {}): Promise<ZerodhaConfig> {
    try {
      logger.info('Starting configuration loading process');

      // Step 1: Load environment file if specified
      if (options.envFile) {
        this.loadEnvironmentFile(options.envFile);
      }

      // Step 2: Load secrets if enabled
      if (options.loadSecrets !== false) {
        await this.loadSecrets(options.secretsConfig);
      }

      // Step 3: Validate and load configuration
      this.config = ConfigValidator.loadFromEnvironment();

      // Step 4: Environment-specific validation
      if (options.validateEnvironment !== false) {
        const validator = ConfigValidator.getInstance();
        validator.validateEnvironmentSpecific(this.config.nodeEnv);
      }

      logger.info('Configuration loaded successfully', {
        environment: this.config.nodeEnv,
        secretsLoaded: this.secretsManager !== null,
      });

      return this.config;
    } catch (error) {
      logger.error('Failed to load configuration', { error: error.message });
      throw error;
    }
  }

  private loadEnvironmentFile(envFile: string): void {
    try {
      const envPath = path.resolve(envFile);
      const result = dotenv.config({ path: envPath });

      if (result.error) {
        logger.warn(`Failed to load environment file: ${envFile}`, { error: result.error.message });
      } else {
        logger.info(`Loaded environment file: ${envFile}`);
      }
    } catch (error) {
      logger.error(`Error loading environment file: ${envFile}`, { error: error.message });
      throw error;
    }
  }

  private async loadSecrets(secretsConfig?: SecretConfig): void {
    try {
      const config = secretsConfig || this.getSecretsConfigForEnvironment();
      this.secretsManager = SecretsManager.getInstance(config);
      
      await this.secretsManager.loadSecrets();
      
      if (!this.secretsManager.validateSecrets()) {
        throw new Error('Secret validation failed');
      }

      // Export secrets to environment for ConfigValidator to pick up
      this.secretsManager.exportToEnvironment();
      
      logger.info('Secrets loaded and validated successfully');
    } catch (error) {
      logger.error('Failed to load secrets', { error: error.message });
      throw error;
    }
  }

  private getSecretsConfigForEnvironment(): SecretConfig {
    const nodeEnv = process.env.NODE_ENV || 'development';
    const platform = process.env.DEPLOYMENT_PLATFORM || 'docker';

    switch (platform) {
      case 'kubernetes':
        return SecretsManager.createKubernetesConfig();
      case 'docker-swarm':
        return SecretsManager.createDockerSecretsConfig();
      default:
        return SecretsManager.createDefaultConfig();
    }
  }

  public getConfig(): ZerodhaConfig {
    if (!this.config) {
      throw new Error('Configuration not loaded. Call loadConfiguration() first.');
    }
    return this.config;
  }

  public getSecretsManager(): SecretsManager | null {
    return this.secretsManager;
  }

  public async reloadConfiguration(options: ConfigLoaderOptions = {}): Promise<ZerodhaConfig> {
    logger.info('Reloading configuration');
    
    // Clear existing configuration
    this.config = null;
    if (this.secretsManager) {
      this.secretsManager.clearSecrets();
      this.secretsManager = null;
    }

    return this.loadConfiguration(options);
  }

  public static async loadForEnvironment(environment: string): Promise<ZerodhaConfig> {
    const loader = ConfigLoader.getInstance();
    
    const envFileMap: Record<string, string> = {
      development: '.env.zerodha.example',
      staging: '.env.zerodha.staging',
      production: '.env.zerodha.production',
    };

    const envFile = envFileMap[environment];
    if (!envFile) {
      throw new Error(`Unknown environment: ${environment}`);
    }

    return loader.loadConfiguration({
      envFile: path.join(process.cwd(), envFile),
      validateEnvironment: true,
      loadSecrets: true,
    });
  }

  public static async quickLoad(): Promise<ZerodhaConfig> {
    const loader = ConfigLoader.getInstance();
    const nodeEnv = process.env.NODE_ENV || 'development';
    
    // Try to load environment-specific file first
    const envFiles = [
      `.env.zerodha.${nodeEnv}`,
      '.env.zerodha.example',
      '.env.local',
      '.env',
    ];

    let envFile: string | undefined;
    for (const file of envFiles) {
      const fullPath = path.join(process.cwd(), file);
      try {
        require('fs').accessSync(fullPath);
        envFile = fullPath;
        break;
      } catch {
        // File doesn't exist, try next
      }
    }

    return loader.loadConfiguration({
      envFile,
      validateEnvironment: true,
      loadSecrets: true,
    });
  }

  public validateCurrentConfig(): boolean {
    if (!this.config) {
      logger.error('No configuration loaded to validate');
      return false;
    }

    try {
      const validator = ConfigValidator.getInstance();
      validator.validateEnvironmentSpecific(this.config.nodeEnv);
      
      if (this.secretsManager) {
        return this.secretsManager.validateSecrets();
      }
      
      return true;
    } catch (error) {
      logger.error('Configuration validation failed', { error: error.message });
      return false;
    }
  }

  public getConfigSummary(): Record<string, any> {
    if (!this.config) {
      return { status: 'not_loaded' };
    }

    return {
      status: 'loaded',
      environment: this.config.nodeEnv,
      logLevel: this.config.logLevel,
      debugMode: this.config.debugMode,
      services: {
        auth: this.config.zerodhaAuthServiceUrl,
        market: this.config.zerodhaMarketServiceUrl,
        order: this.config.zerodhaOrderServiceUrl,
        portfolio: this.config.zerodhaPortfolioServiceUrl,
        risk: this.config.zerodhaRiskServiceUrl,
      },
      database: {
        ssl: this.config.postgresSsl,
        maxConnections: this.config.postgresMaxConnections,
      },
      security: {
        corsEnabled: this.config.enableCors,
        jwtExpiresIn: this.config.jwtExpiresIn,
      },
      secretsLoaded: this.secretsManager !== null,
      secretCount: this.secretsManager?.getAllSecretNames().length || 0,
    };
  }
}