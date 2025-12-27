import crypto from 'crypto';

export interface EncryptionConfig {
  key: string;
  algorithm?: string;
}

export class EncryptionService {
  private key: Buffer;
  private algorithm: string;

  constructor(config: EncryptionConfig) {
    this.key = Buffer.from(config.key, 'utf8');
    this.algorithm = config.algorithm || 'aes-256-cbc';
  }

  /**
   * Encrypt a string value
   */
  public encrypt(text: string): string {
    try {
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipher(this.algorithm, this.key);
      
      let encrypted = cipher.update(text, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      return iv.toString('hex') + ':' + encrypted;
    } catch (error) {
      throw new Error(`Encryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Decrypt an encrypted string
   */
  public decrypt(encryptedText: string): string {
    try {
      const parts = encryptedText.split(':');
      if (parts.length !== 2) {
        throw new Error('Invalid encrypted text format');
      }

      const iv = Buffer.from(parts[0], 'hex');
      const encrypted = parts[1];
      
      const decipher = crypto.createDecipher(this.algorithm, this.key);
      
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      return decrypted;
    } catch (error) {
      throw new Error(`Decryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Generate a secure hash of a string
   */
  public hash(text: string): string {
    return crypto.createHash('sha256').update(text).digest('hex');
  }

  /**
   * Generate a secure random string
   */
  public generateRandomString(length: number = 32): string {
    return crypto.randomBytes(length).toString('hex');
  }

  /**
   * Generate checksum for Zerodha API authentication
   */
  public generateChecksum(apiKey: string, requestToken: string, apiSecret: string): string {
    const data = apiKey + requestToken + apiSecret;
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  /**
   * Verify checksum
   */
  public verifyChecksum(apiKey: string, requestToken: string, apiSecret: string, checksum: string): boolean {
    const expectedChecksum = this.generateChecksum(apiKey, requestToken, apiSecret);
    return expectedChecksum === checksum;
  }

  /**
   * Generate JWT-compatible secret
   */
  public generateJWTSecret(length: number = 64): string {
    return crypto.randomBytes(length).toString('base64');
  }

  /**
   * Encrypt sensitive configuration data
   */
  public encryptConfig(config: Record<string, any>): Record<string, any> {
    const sensitiveFields = ['apiSecret', 'accessToken', 'refreshToken', 'password'];
    const encryptedConfig = { ...config };

    for (const field of sensitiveFields) {
      if (encryptedConfig[field]) {
        encryptedConfig[field] = this.encrypt(encryptedConfig[field]);
      }
    }

    return encryptedConfig;
  }

  /**
   * Decrypt sensitive configuration data
   */
  public decryptConfig(encryptedConfig: Record<string, any>): Record<string, any> {
    const sensitiveFields = ['apiSecret', 'accessToken', 'refreshToken', 'password'];
    const decryptedConfig = { ...encryptedConfig };

    for (const field of sensitiveFields) {
      if (decryptedConfig[field]) {
        try {
          decryptedConfig[field] = this.decrypt(decryptedConfig[field]);
        } catch (error) {
          // If decryption fails, assume the value is not encrypted
          // This allows for gradual migration to encrypted storage
        }
      }
    }

    return decryptedConfig;
  }
}

// Singleton instance for global use
let encryptionService: EncryptionService | null = null;

export const getEncryptionService = (config?: EncryptionConfig): EncryptionService => {
  if (!encryptionService && config) {
    encryptionService = new EncryptionService(config);
  }
  
  if (!encryptionService) {
    throw new Error('EncryptionService not initialized. Provide config on first call.');
  }
  
  return encryptionService;
};

export const initializeEncryption = (config: EncryptionConfig): EncryptionService => {
  encryptionService = new EncryptionService(config);
  return encryptionService;
};