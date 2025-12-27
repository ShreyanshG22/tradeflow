import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { ZerodhaAPIClient } from '@tradeflow/zerodha-utils';
import { getEncryptionService } from '@tradeflow/zerodha-utils';
import { ZerodhaAuthResponse, ZerodhaUserProfile, ZerodhaSession } from '@tradeflow/types';
import { createLogger } from '@tradeflow/zerodha-utils';
import { RedisService } from './redisService';
import { DatabaseService } from './databaseService';

const logger = createLogger('AuthService');

export interface AuthConfig {
  apiKey: string;
  apiSecret: string;
  redirectUrl: string;
  jwtSecret: string;
  jwtExpiresIn: string;
  encryptionKey: string;
}

export class AuthService {
  private apiClient: ZerodhaAPIClient;
  private config: AuthConfig;
  private redisService: RedisService;
  private databaseService: DatabaseService;

  constructor(
    config: AuthConfig,
    redisService: RedisService,
    databaseService: DatabaseService
  ) {
    this.config = config;
    this.redisService = redisService;
    this.databaseService = databaseService;
    
    // Initialize encryption service
    getEncryptionService({ key: config.encryptionKey });
    
    // Initialize API client
    this.apiClient = new ZerodhaAPIClient({
      apiKey: config.apiKey,
      debug: process.env.NODE_ENV === 'development'
    });
  }

  /**
   * Generate Zerodha login URL
   */
  public generateLoginUrl(state?: string): string {
    const baseUrl = 'https://kite.trade/connect/login';
    const params = new URLSearchParams({
      api_key: this.config.apiKey,
      v: '3'
    });

    if (state) {
      params.append('state', state);
    }

    const loginUrl = `${baseUrl}?${params.toString()}`;
    
    logger.info('Generated login URL', { 
      apiKey: this.config.apiKey.substring(0, 8) + '...',
      state 
    });

    return loginUrl;
  }

  /**
   * Generate checksum for token exchange
   */
  public generateChecksum(requestToken: string): string {
    const encryptionService = getEncryptionService();
    return encryptionService.generateChecksum(
      this.config.apiKey,
      requestToken,
      this.config.apiSecret
    );
  }

  /**
   * Verify checksum
   */
  public verifyChecksum(requestToken: string, checksum: string): boolean {
    const encryptionService = getEncryptionService();
    return encryptionService.verifyChecksum(
      this.config.apiKey,
      requestToken,
      this.config.apiSecret,
      checksum
    );
  }

  /**
   * Exchange request token for access token
   */
  public async exchangeRequestToken(requestToken: string): Promise<ZerodhaAuthResponse> {
    try {
      logger.info('Exchanging request token for access token', { 
        requestToken: requestToken.substring(0, 8) + '...' 
      });

      const checksum = this.generateChecksum(requestToken);
      
      const response = await this.apiClient.post<ZerodhaAuthResponse>('/session/token', {
        api_key: this.config.apiKey,
        request_token: requestToken,
        checksum: checksum
      });

      if (response.status === 'error') {
        logger.error('Token exchange failed', { 
          error: response.message,
          errorType: response.error_type 
        });
        throw new Error(response.message || 'Token exchange failed');
      }

      if (!response.data) {
        throw new Error('No data received from token exchange');
      }

      logger.info('Token exchange successful', { 
        userId: response.data.user_id,
        userName: response.data.user_name 
      });

      return response.data;
    } catch (error) {
      logger.error('Token exchange error', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        requestToken: requestToken.substring(0, 8) + '...'
      });
      throw error;
    }
  }

  /**
   * Get user profile from Zerodha
   */
  public async getUserProfile(accessToken: string): Promise<ZerodhaUserProfile> {
    try {
      this.apiClient.setAccessToken(accessToken);
      
      const response = await this.apiClient.get<ZerodhaUserProfile>('/user/profile');
      
      if (response.status === 'error') {
        logger.error('Failed to fetch user profile', { 
          error: response.message,
          errorType: response.error_type 
        });
        throw new Error(response.message || 'Failed to fetch user profile');
      }

      if (!response.data) {
        throw new Error('No profile data received');
      }

      logger.info('User profile fetched successfully', { 
        userId: response.data.user_id,
        userName: response.data.user_name 
      });

      return response.data;
    } catch (error) {
      logger.error('Get user profile error', { 
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Create JWT token for authenticated user
   */
  public createJWTToken(userId: string, zerodhaUserId: string): string {
    const payload = {
      userId,
      zerodhaUserId,
      type: 'access'
    };

    const token = jwt.sign(payload, this.config.jwtSecret, {
      expiresIn: this.config.jwtExpiresIn,
      issuer: 'tradeflow-zerodha-auth',
      audience: 'tradeflow-platform'
    });

    logger.info('JWT token created', { userId, zerodhaUserId });

    return token;
  }

  /**
   * Verify JWT token
   */
  public verifyJWTToken(token: string): { userId: string; zerodhaUserId: string } {
    try {
      const decoded = jwt.verify(token, this.config.jwtSecret, {
        issuer: 'tradeflow-zerodha-auth',
        audience: 'tradeflow-platform'
      }) as any;

      return {
        userId: decoded.userId,
        zerodhaUserId: decoded.zerodhaUserId
      };
    } catch (error) {
      logger.error('JWT verification failed', { 
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw new Error('Invalid or expired token');
    }
  }

  /**
   * Store user session
   */
  public async storeUserSession(
    userId: string,
    zerodhaUserId: string,
    authResponse: ZerodhaAuthResponse
  ): Promise<ZerodhaSession> {
    try {
      const encryptionService = getEncryptionService();
      
      // Calculate expiration time (8 hours from now)
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 8);

      const session: ZerodhaSession = {
        user_id: zerodhaUserId,
        access_token: authResponse.access_token,
        public_token: authResponse.public_token,
        refresh_token: authResponse.refresh_token,
        login_time: authResponse.login_time,
        expires_at: expiresAt.toISOString(),
        api_key: this.config.apiKey
      };

      // Encrypt sensitive data
      const encryptedSession = {
        ...session,
        access_token: encryptionService.encrypt(session.access_token),
        public_token: encryptionService.encrypt(session.public_token),
        refresh_token: session.refresh_token ? encryptionService.encrypt(session.refresh_token) : undefined
      };

      // Store in Redis with TTL
      await this.redisService.setSession(userId, encryptedSession, 8 * 60 * 60); // 8 hours

      // Store in database
      await this.databaseService.storeUserTokens(userId, zerodhaUserId, encryptedSession);

      logger.info('User session stored', { userId, zerodhaUserId });

      return session;
    } catch (error) {
      logger.error('Failed to store user session', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        userId,
        zerodhaUserId
      });
      throw error;
    }
  }

  /**
   * Get user session
   */
  public async getUserSession(userId: string): Promise<ZerodhaSession | null> {
    try {
      // Try Redis first
      let encryptedSession = await this.redisService.getSession(userId);
      
      if (!encryptedSession) {
        // Fallback to database
        encryptedSession = await this.databaseService.getUserTokens(userId);
        
        if (!encryptedSession) {
          return null;
        }

        // Restore to Redis
        await this.redisService.setSession(userId, encryptedSession, 8 * 60 * 60);
      }

      // Decrypt sensitive data
      const encryptionService = getEncryptionService();
      const session: ZerodhaSession = {
        ...encryptedSession,
        access_token: encryptionService.decrypt(encryptedSession.access_token),
        public_token: encryptionService.decrypt(encryptedSession.public_token),
        refresh_token: encryptedSession.refresh_token ? 
          encryptionService.decrypt(encryptedSession.refresh_token) : undefined
      };

      // Check if session is expired
      if (new Date(session.expires_at) < new Date()) {
        logger.info('Session expired', { userId });
        await this.clearUserSession(userId);
        return null;
      }

      return session;
    } catch (error) {
      logger.error('Failed to get user session', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        userId
      });
      return null;
    }
  }

  /**
   * Clear user session (logout)
   */
  public async clearUserSession(userId: string): Promise<void> {
    try {
      // Remove from Redis
      await this.redisService.deleteSession(userId);
      
      // Mark as expired in database
      await this.databaseService.expireUserTokens(userId);

      logger.info('User session cleared', { userId });
    } catch (error) {
      logger.error('Failed to clear user session', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        userId
      });
      throw error;
    }
  }

  /**
   * Validate access token with Zerodha
   */
  public async validateAccessToken(accessToken: string): Promise<boolean> {
    try {
      this.apiClient.setAccessToken(accessToken);
      
      const response = await this.apiClient.get('/user/profile');
      
      return response.status === 'success';
    } catch (error) {
      logger.error('Access token validation failed', { 
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return false;
    }
  }

  /**
   * Refresh access token (if supported by Zerodha in future)
   */
  public async refreshAccessToken(refreshToken: string): Promise<ZerodhaAuthResponse | null> {
    // Note: Zerodha doesn't currently support token refresh
    // This method is prepared for future implementation
    logger.warn('Token refresh not supported by Zerodha API');
    return null;
  }
}