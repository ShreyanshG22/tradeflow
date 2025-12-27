import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../logger';

export interface SecretSource {
  type: 'env' | 'file' | 'vault' | 'k8s';
  path?: string;
  key?: string;
}

export interface SecretConfig {
  [key: string]: SecretSource;
}

export class SecretsManager {
  private static instance: SecretsManager;
  private secrets: Map<string, string> = new Map();
  private secretsConfig: SecretConfig;

  private constructor(config: SecretConfig) {
    this.secretsConfig = config;
  }

  public static getInstance(config?: SecretConfig): SecretsManager {
    if (!SecretsManager.instance) {
      if (!config) {
        throw new Error('SecretsManager must be initialized with config on first call');
      }
      SecretsManager.instance = new SecretsManager(config);
    }
    return SecretsManager.instance;
  }

  public async loadSecrets(): Promise<void> {
    logger.info('Loading secrets from configured sources');

    for (const [secretName, source] of Object.entries(this.secretsConfig)) {
      try {
        const value = await this.loadSecret(secretName, source);
        if (value) {
          this.secrets.set(secretName, value);
          logger.debug(`Loaded secret: ${secretName} from ${source.type}`);
        } else {
          logger.warn(`Secret ${secretName} not found in ${source.type}`);
        }
      } catch (error) {
        logger.error(`Failed to load secret ${secretName}`, { error: error.message });
        throw new Error(`Failed to load required secret: ${secretName}`);
      }
    }

    logger.info(`Successfully loaded ${this.secrets.size} secrets`);
  }

  private async loadSecret(name: string, source: SecretSource): Promise<string | null> {
    switch (source.type) {
      case 'env':
        return this.loadFromEnvironment(source.key || name);
      
      case 'file':
        return this.loadFromFile(source.path || `/run/secrets/${name}`);
      
      case 'k8s':
        return this.loadFromKubernetesSecret(source.path || `/var/run/secrets/${name}`);
      
      case 'vault':
        return this.loadFromVault(source.path || name);
      
      default:
        throw new Error(`Unknown secret source type: ${source.type}`);
    }
  }

  private loadFromEnvironment(key: string): string | null {
    const value = process.env[key];
    return value || null;
  }

  private loadFromFile(filePath: string): string | null {
    try {
      if (!fs.existsSync(filePath)) {
        return null;
      }
      
      const content = fs.readFileSync(filePath, 'utf8').trim();
      return content || null;
    } catch (error) {
      logger.error(`Failed to read secret file: ${filePath}`, { error: error.message });
      return null;
    }
  }

  private loadFromKubernetesSecret(secretPath: string): string | null {
    // Kubernetes mounts secrets as files in the pod
    return this.loadFromFile(secretPath);
  }

  private async loadFromVault(vaultPath: string): Promise<string | null> {
    // Placeholder for HashiCorp Vault integration
    // In a real implementation, you would use the Vault API
    logger.warn('Vault integration not implemented, falling back to environment');
    return this.loadFromEnvironment(vaultPath.replace('/', '_').toUpperCase());
  }

  public getSecret(name: string): string {
    const secret = this.secrets.get(name);
    if (!secret) {
      throw new Error(`Secret ${name} not found or not loaded`);
    }
    return secret;
  }

  public hasSecret(name: string): boolean {
    return this.secrets.has(name);
  }

  public getAllSecretNames(): string[] {
    return Array.from(this.secrets.keys());
  }

  public rotateSecret(name: string, newValue: string): void {
    if (!this.secrets.has(name)) {
      throw new Error(`Cannot rotate unknown secret: ${name}`);
    }
    
    this.secrets.set(name, newValue);
    logger.info(`Secret ${name} rotated successfully`);
  }

  public validateSecrets(): boolean {
    const requiredSecrets = [
      'ZERODHA_API_KEY',
      'ZERODHA_API_SECRET',
      'JWT_SECRET',
      'ENCRYPTION_KEY',
      'SESSION_SECRET'
    ];

    const missingSecrets = requiredSecrets.filter(secret => !this.hasSecret(secret));
    
    if (missingSecrets.length > 0) {
      logger.error('Missing required secrets', { missingSecrets });
      return false;
    }

    // Validate secret formats
    const validationErrors = [];

    // JWT Secret should be at least 32 characters
    const jwtSecret = this.getSecret('JWT_SECRET');
    if (jwtSecret.length < 32) {
      validationErrors.push('JWT_SECRET must be at least 32 characters');
    }

    // Encryption key must be exactly 32 characters
    const encryptionKey = this.getSecret('ENCRYPTION_KEY');
    if (encryptionKey.length !== 32) {
      validationErrors.push('ENCRYPTION_KEY must be exactly 32 characters');
    }

    // Zerodha API key format validation (basic)
    const apiKey = this.getSecret('ZERODHA_API_KEY');
    if (!/^[a-zA-Z0-9]{15,}$/.test(apiKey)) {
      validationErrors.push('ZERODHA_API_KEY format appears invalid');
    }

    if (validationErrors.length > 0) {
      logger.error('Secret validation failed', { validationErrors });
      return false;
    }

    logger.info('All secrets validated successfully');
    return true;
  }

  public static createDefaultConfig(): SecretConfig {
    return {
      'ZERODHA_API_KEY': { type: 'env', key: 'ZERODHA_API_KEY' },
      'ZERODHA_API_SECRET': { type: 'env', key: 'ZERODHA_API_SECRET' },
      'JWT_SECRET': { type: 'env', key: 'JWT_SECRET' },
      'ENCRYPTION_KEY': { type: 'env', key: 'ENCRYPTION_KEY' },
      'SESSION_SECRET': { type: 'env', key: 'SESSION_SECRET' },
      'POSTGRES_PASSWORD': { type: 'env', key: 'POSTGRES_PASSWORD' },
      'REDIS_PASSWORD': { type: 'env', key: 'REDIS_PASSWORD' },
      'INFLUXDB_TOKEN': { type: 'env', key: 'INFLUXDB_TOKEN' },
      'INFLUXDB_PASSWORD': { type: 'env', key: 'INFLUXDB_PASSWORD' },
    };
  }

  public static createKubernetesConfig(): SecretConfig {
    return {
      'ZERODHA_API_KEY': { type: 'k8s', path: '/var/run/secrets/zerodha/api-key' },
      'ZERODHA_API_SECRET': { type: 'k8s', path: '/var/run/secrets/zerodha/api-secret' },
      'JWT_SECRET': { type: 'k8s', path: '/var/run/secrets/jwt/secret' },
      'ENCRYPTION_KEY': { type: 'k8s', path: '/var/run/secrets/encryption/key' },
      'SESSION_SECRET': { type: 'k8s', path: '/var/run/secrets/session/secret' },
      'POSTGRES_PASSWORD': { type: 'k8s', path: '/var/run/secrets/postgres/password' },
      'REDIS_PASSWORD': { type: 'k8s', path: '/var/run/secrets/redis/password' },
      'INFLUXDB_TOKEN': { type: 'k8s', path: '/var/run/secrets/influxdb/token' },
      'INFLUXDB_PASSWORD': { type: 'k8s', path: '/var/run/secrets/influxdb/password' },
    };
  }

  public static createDockerSecretsConfig(): SecretConfig {
    return {
      'ZERODHA_API_KEY': { type: 'file', path: '/run/secrets/zerodha_api_key' },
      'ZERODHA_API_SECRET': { type: 'file', path: '/run/secrets/zerodha_api_secret' },
      'JWT_SECRET': { type: 'file', path: '/run/secrets/jwt_secret' },
      'ENCRYPTION_KEY': { type: 'file', path: '/run/secrets/encryption_key' },
      'SESSION_SECRET': { type: 'file', path: '/run/secrets/session_secret' },
      'POSTGRES_PASSWORD': { type: 'file', path: '/run/secrets/postgres_password' },
      'REDIS_PASSWORD': { type: 'file', path: '/run/secrets/redis_password' },
      'INFLUXDB_TOKEN': { type: 'file', path: '/run/secrets/influxdb_token' },
      'INFLUXDB_PASSWORD': { type: 'file', path: '/run/secrets/influxdb_password' },
    };
  }

  public exportToEnvironment(): void {
    for (const [name, value] of this.secrets) {
      process.env[name] = value;
    }
    logger.debug('Secrets exported to environment variables');
  }

  public clearSecrets(): void {
    this.secrets.clear();
    logger.info('All secrets cleared from memory');
  }
}