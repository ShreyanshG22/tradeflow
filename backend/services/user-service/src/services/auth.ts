import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config/config';
import { logger } from '../utils/logger';
import { DatabaseService } from './database';
import { RedisService } from './redis';

// Local type definitions
export interface User {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface RegisterRequest {
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface UserSession {
  id: string;
  userId: string;
  tokenHash: string;
  refreshTokenHash: string;
  deviceInfo?: any;
  ipAddress?: string;
  expiresAt: Date;
  createdAt: Date;
  lastUsedAt: Date;
  isRevoked: boolean;
}

export class AuthService {
  
  /**
   * Register a new user
   * Requirements: 1.1 - User registration with email validation
   */
  static async register(userData: RegisterRequest, deviceInfo?: any, ipAddress?: string): Promise<{ user: User; tokens: AuthTokens }> {
    const { email, password, firstName, lastName } = userData;

    // Check if user already exists
    const existingUser = await this.getUserByEmail(email);
    if (existingUser) {
      throw new Error('User with this email already exists');
    }

    // Hash password - Requirements: 1.1 - Secure password hashing with bcrypt
    const passwordHash = await bcrypt.hash(password, config.security.bcryptRounds);

    // Create user in database
    const query = `
      INSERT INTO auth.users (email, password_hash, first_name, last_name)
      VALUES ($1, $2, $3, $4)
      RETURNING id, email, first_name, last_name, is_active, created_at, updated_at
    `;
    
    const result = await DatabaseService.query(query, [email, passwordHash, firstName, lastName]);
    const userRecord = result.rows[0];

    const user: User = {
      id: userRecord.id,
      email: userRecord.email,
      firstName: userRecord.first_name,
      lastName: userRecord.last_name,
      isActive: userRecord.is_active,
      createdAt: userRecord.created_at,
      updatedAt: userRecord.updated_at
    };

    // Generate tokens and create session
    const tokens = await this.createSession(user.id, deviceInfo, ipAddress);

    logger.info('User registered successfully', { userId: user.id, email: user.email });

    return { user, tokens };
  }

  /**
   * Authenticate user login
   * Requirements: 1.2 - User authentication with JWT token generation
   */
  static async login(credentials: LoginRequest, deviceInfo?: any, ipAddress?: string): Promise<{ user: User; tokens: AuthTokens }> {
    const { email, password } = credentials;

    // Check for rate limiting
    await this.checkLoginAttempts(email, ipAddress);

    // Get user by email
    const userRecord = await this.getUserByEmailWithPassword(email);
    if (!userRecord) {
      await this.recordFailedLogin(email, ipAddress);
      throw new Error('Invalid email or password');
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, userRecord.password_hash);
    if (!isValidPassword) {
      await this.recordFailedLogin(email, ipAddress);
      throw new Error('Invalid email or password');
    }

    // Check if user is active
    if (!userRecord.is_active) {
      throw new Error('Account is deactivated');
    }

    const user: User = {
      id: userRecord.id,
      email: userRecord.email,
      firstName: userRecord.first_name,
      lastName: userRecord.last_name,
      isActive: userRecord.is_active,
      createdAt: userRecord.created_at,
      updatedAt: userRecord.updated_at
    };

    // Clear failed login attempts
    await this.clearFailedLogins(email, ipAddress);

    // Update last login
    await DatabaseService.query(
      'UPDATE auth.users SET last_login_at = NOW() WHERE id = $1',
      [user.id]
    );

    // Create session and generate tokens
    const tokens = await this.createSession(user.id, deviceInfo, ipAddress);

    logger.info('User logged in successfully', { userId: user.id, email: user.email });

    return { user, tokens };
  }

  /**
   * Create a new session and generate JWT tokens
   * Requirements: 1.2 - JWT token generation and validation system
   */
  static async createSession(userId: string, deviceInfo?: any, ipAddress?: string): Promise<AuthTokens> {
    // Generate tokens
    const accessToken = jwt.sign(
      { userId, type: 'access' },
      config.jwt.secret
    );

    const refreshToken = jwt.sign(
      { userId, type: 'refresh', sessionId: uuidv4() },
      config.jwt.refreshSecret
    );

    // Hash tokens for storage
    const tokenHash = await bcrypt.hash(accessToken, 10);
    const refreshTokenHash = await bcrypt.hash(refreshToken, 10);

    // Calculate expiry time
    const expiresAt = new Date();
    expiresAt.setTime(expiresAt.getTime() + this.parseExpiry(config.jwt.refreshTokenExpiry));

    // Store session in database
    const sessionQuery = `
      INSERT INTO auth.user_sessions (user_id, token_hash, refresh_token_hash, device_info, ip_address, expires_at)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id
    `;

    await DatabaseService.query(sessionQuery, [
      userId,
      tokenHash,
      refreshTokenHash,
      deviceInfo ? JSON.stringify(deviceInfo) : null,
      ipAddress,
      expiresAt
    ]);

    // Clean up old sessions if user has too many
    await this.cleanupUserSessions(userId);

    return {
      accessToken,
      refreshToken,
      expiresIn: this.parseExpiry(config.jwt.accessTokenExpiry) / 1000 // Convert to seconds
    };
  }

  /**
   * Validate JWT token
   * Requirements: 1.2 - JWT token validation system
   */
  static async validateToken(token: string): Promise<{ userId: string; sessionId?: string }> {
    try {
      const decoded = jwt.verify(token, config.jwt.secret) as any;
      
      if (decoded.type !== 'access') {
        throw new Error('Invalid token type');
      }

      // Check if session exists and is not revoked
      const sessionQuery = `
        SELECT id, is_revoked, expires_at 
        FROM auth.user_sessions 
        WHERE user_id = $1 AND expires_at > NOW() AND is_revoked = false
        LIMIT 1
      `;
      
      const sessionResult = await DatabaseService.query(sessionQuery, [decoded.userId]);
      
      if (sessionResult.rows.length === 0) {
        throw new Error('Session not found or expired');
      }

      return { userId: decoded.userId, sessionId: sessionResult.rows[0].id };
    } catch (error) {
      logger.warn('Token validation failed', { error: (error as Error).message });
      throw new Error('Invalid or expired token');
    }
  }

  /**
   * Refresh access token using refresh token
   * Requirements: 1.3 - JWT refresh token rotation
   */
  static async refreshToken(refreshToken: string): Promise<AuthTokens> {
    try {
      const decoded = jwt.verify(refreshToken, config.jwt.refreshSecret) as any;
      
      if (decoded.type !== 'refresh') {
        throw new Error('Invalid token type');
      }

      // Find session by refresh token
      const sessionQuery = `
        SELECT id, user_id, refresh_token_hash, expires_at, is_revoked
        FROM auth.user_sessions 
        WHERE user_id = $1 AND expires_at > NOW() AND is_revoked = false
      `;
      
      const sessionResult = await DatabaseService.query(sessionQuery, [decoded.userId]);
      
      if (sessionResult.rows.length === 0) {
        throw new Error('Session not found or expired');
      }

      // Verify refresh token hash
      let validSession = null;
      for (const session of sessionResult.rows) {
        const isValid = await bcrypt.compare(refreshToken, session.refresh_token_hash);
        if (isValid) {
          validSession = session;
          break;
        }
      }

      if (!validSession) {
        throw new Error('Invalid refresh token');
      }

      // Generate new tokens
      const newAccessToken = jwt.sign(
        { userId: decoded.userId, type: 'access' },
        config.jwt.secret
      );

      const newRefreshToken = jwt.sign(
        { userId: decoded.userId, type: 'refresh', sessionId: uuidv4() },
        config.jwt.refreshSecret
      );

      // Hash new tokens
      const newTokenHash = await bcrypt.hash(newAccessToken, 10);
      const newRefreshTokenHash = await bcrypt.hash(newRefreshToken, 10);

      // Update session with new tokens
      const updateQuery = `
        UPDATE auth.user_sessions 
        SET token_hash = $1, refresh_token_hash = $2, last_used_at = NOW()
        WHERE id = $3
      `;
      
      await DatabaseService.query(updateQuery, [newTokenHash, newRefreshTokenHash, validSession.id]);

      logger.info('Token refreshed successfully', { userId: decoded.userId });

      return {
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
        expiresIn: this.parseExpiry(config.jwt.accessTokenExpiry) / 1000
      };
    } catch (error) {
      logger.warn('Token refresh failed', { error: (error as Error).message });
      throw new Error('Invalid or expired refresh token');
    }
  }

  /**
   * Logout user and revoke session
   * Requirements: 1.4 - Session invalidation and cleanup
   */
  static async logout(userId: string, sessionId?: string): Promise<void> {
    let query: string;
    let params: any[];

    if (sessionId) {
      // Revoke specific session
      query = 'UPDATE auth.user_sessions SET is_revoked = true WHERE id = $1 AND user_id = $2';
      params = [sessionId, userId];
    } else {
      // Revoke all sessions for user
      query = 'UPDATE auth.user_sessions SET is_revoked = true WHERE user_id = $1';
      params = [userId];
    }

    await DatabaseService.query(query, params);
    
    logger.info('User logged out', { userId, sessionId });
  }

  /**
   * Get user sessions
   * Requirements: 1.4 - Multi-device session tracking
   */
  static async getUserSessions(userId: string): Promise<UserSession[]> {
    const query = `
      SELECT id, user_id, device_info, ip_address, expires_at, created_at, last_used_at, is_revoked
      FROM auth.user_sessions 
      WHERE user_id = $1 AND expires_at > NOW()
      ORDER BY last_used_at DESC
    `;
    
    const result = await DatabaseService.query(query, [userId]);
    
    return result.rows.map((row: any) => ({
      id: row.id,
      userId: row.user_id,
      tokenHash: '', // Don't expose token hashes
      refreshTokenHash: '',
      deviceInfo: row.device_info,
      ipAddress: row.ip_address,
      expiresAt: row.expires_at,
      createdAt: row.created_at,
      lastUsedAt: row.last_used_at,
      isRevoked: row.is_revoked
    }));
  }

  // Helper methods

  private static async getUserByEmail(email: string): Promise<User | null> {
    const query = `
      SELECT id, email, first_name, last_name, is_active, created_at, updated_at
      FROM auth.users 
      WHERE email = $1
    `;
    
    const result = await DatabaseService.query(query, [email]);
    
    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      id: row.id,
      email: row.email,
      firstName: row.first_name,
      lastName: row.last_name,
      isActive: row.is_active,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  private static async getUserByEmailWithPassword(email: string): Promise<any | null> {
    const query = `
      SELECT id, email, password_hash, first_name, last_name, is_active, created_at, updated_at
      FROM auth.users 
      WHERE email = $1
    `;
    
    const result = await DatabaseService.query(query, [email]);
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  private static async checkLoginAttempts(email: string, ipAddress?: string): Promise<void> {
    const key = `login_attempts:${email}:${ipAddress || 'unknown'}`;
    const attempts = await RedisService.get(key);
    
    if (attempts && parseInt(attempts) >= config.security.maxLoginAttempts) {
      throw new Error('Too many failed login attempts. Please try again later.');
    }
  }

  private static async recordFailedLogin(email: string, ipAddress?: string): Promise<void> {
    const key = `login_attempts:${email}:${ipAddress || 'unknown'}`;
    const attempts = await RedisService.incr(key);
    
    if (attempts === 1) {
      await RedisService.expire(key, config.security.lockoutDuration / 1000);
    }
  }

  private static async clearFailedLogins(email: string, ipAddress?: string): Promise<void> {
    const key = `login_attempts:${email}:${ipAddress || 'unknown'}`;
    await RedisService.del(key);
  }

  private static async cleanupUserSessions(userId: string): Promise<void> {
    // Get active session count
    const countQuery = `
      SELECT COUNT(*) as count 
      FROM auth.user_sessions 
      WHERE user_id = $1 AND expires_at > NOW() AND is_revoked = false
    `;
    
    const countResult = await DatabaseService.query(countQuery, [userId]);
    const sessionCount = parseInt(countResult.rows[0].count);

    // If user has too many sessions, revoke the oldest ones
    if (sessionCount >= config.session.maxSessions) {
      const cleanupQuery = `
        UPDATE auth.user_sessions 
        SET is_revoked = true 
        WHERE id IN (
          SELECT id FROM auth.user_sessions 
          WHERE user_id = $1 AND expires_at > NOW() AND is_revoked = false
          ORDER BY last_used_at ASC 
          LIMIT $2
        )
      `;
      
      const sessionsToRevoke = sessionCount - config.session.maxSessions + 1;
      await DatabaseService.query(cleanupQuery, [userId, sessionsToRevoke]);
    }
  }

  private static parseExpiry(expiry: string): number {
    const unit = expiry.slice(-1);
    const value = parseInt(expiry.slice(0, -1));
    
    switch (unit) {
      case 's': return value * 1000;
      case 'm': return value * 60 * 1000;
      case 'h': return value * 60 * 60 * 1000;
      case 'd': return value * 24 * 60 * 60 * 1000;
      default: return parseInt(expiry) * 1000;
    }
  }
}