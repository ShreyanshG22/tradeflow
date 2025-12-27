import bcrypt from 'bcrypt';
import { DatabaseService } from './database';
import { logger } from '../utils/logger';
import { config } from '../config/config';

export interface UserProfile {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  timezone: string;
  isActive: boolean;
  isVerified: boolean;
  lastLoginAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserSetting {
  id: string;
  userId: string;
  settingKey: string;
  settingValue: any;
  createdAt: Date;
  updatedAt: Date;
}

export interface UpdateProfileRequest {
  firstName?: string;
  lastName?: string;
  phone?: string;
  timezone?: string;
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

export class UserService {

  /**
   * Get user profile by ID
   * Requirements: 1.5 - User profile CRUD operations
   */
  static async getUserProfile(userId: string): Promise<UserProfile | null> {
    const query = `
      SELECT id, email, first_name, last_name, phone, timezone, is_active, is_verified, 
             last_login_at, created_at, updated_at
      FROM auth.users 
      WHERE id = $1
    `;
    
    const result = await DatabaseService.query(query, [userId]);
    
    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      id: row.id,
      email: row.email,
      firstName: row.first_name,
      lastName: row.last_name,
      phone: row.phone,
      timezone: row.timezone,
      isActive: row.is_active,
      isVerified: row.is_verified,
      lastLoginAt: row.last_login_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  /**
   * Update user profile
   * Requirements: 1.5 - User profile CRUD operations
   */
  static async updateUserProfile(userId: string, updates: UpdateProfileRequest): Promise<UserProfile> {
    const setClause: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    // Build dynamic update query
    if (updates.firstName !== undefined) {
      setClause.push(`first_name = $${paramIndex++}`);
      values.push(updates.firstName);
    }
    
    if (updates.lastName !== undefined) {
      setClause.push(`last_name = $${paramIndex++}`);
      values.push(updates.lastName);
    }
    
    if (updates.phone !== undefined) {
      setClause.push(`phone = $${paramIndex++}`);
      values.push(updates.phone);
    }
    
    if (updates.timezone !== undefined) {
      setClause.push(`timezone = $${paramIndex++}`);
      values.push(updates.timezone);
    }

    if (setClause.length === 0) {
      throw new Error('No valid fields to update');
    }

    // Add updated_at and user ID
    setClause.push(`updated_at = NOW()`);
    values.push(userId);

    const query = `
      UPDATE auth.users 
      SET ${setClause.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING id, email, first_name, last_name, phone, timezone, is_active, is_verified,
                last_login_at, created_at, updated_at
    `;

    const result = await DatabaseService.query(query, values);
    
    if (result.rows.length === 0) {
      throw new Error('User not found');
    }

    const row = result.rows[0];
    const updatedProfile: UserProfile = {
      id: row.id,
      email: row.email,
      firstName: row.first_name,
      lastName: row.last_name,
      phone: row.phone,
      timezone: row.timezone,
      isActive: row.is_active,
      isVerified: row.is_verified,
      lastLoginAt: row.last_login_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };

    logger.info('User profile updated', { userId, updates: Object.keys(updates) });
    return updatedProfile;
  }

  /**
   * Change user password
   * Requirements: 1.5 - User profile CRUD operations
   */
  static async changePassword(userId: string, passwordData: ChangePasswordRequest): Promise<void> {
    const { currentPassword, newPassword } = passwordData;

    // Get current password hash
    const userQuery = 'SELECT password_hash FROM auth.users WHERE id = $1';
    const userResult = await DatabaseService.query(userQuery, [userId]);
    
    if (userResult.rows.length === 0) {
      throw new Error('User not found');
    }

    // Verify current password
    const isValidPassword = await bcrypt.compare(currentPassword, userResult.rows[0].password_hash);
    if (!isValidPassword) {
      throw new Error('Current password is incorrect');
    }

    // Hash new password
    const newPasswordHash = await bcrypt.hash(newPassword, config.security.bcryptRounds);

    // Update password
    const updateQuery = `
      UPDATE auth.users 
      SET password_hash = $1, updated_at = NOW()
      WHERE id = $2
    `;
    
    await DatabaseService.query(updateQuery, [newPasswordHash, userId]);

    // Revoke all existing sessions to force re-login
    await DatabaseService.query(
      'UPDATE auth.user_sessions SET is_revoked = true WHERE user_id = $1',
      [userId]
    );

    logger.info('User password changed', { userId });
  }

  /**
   * Get user setting
   * Requirements: 1.5 - User preferences and trading settings
   */
  static async getUserSetting(userId: string, settingKey: string): Promise<UserSetting | null> {
    const query = `
      SELECT id, user_id, setting_key, setting_value, created_at, updated_at
      FROM auth.user_settings 
      WHERE user_id = $1 AND setting_key = $2
    `;
    
    const result = await DatabaseService.query(query, [userId, settingKey]);
    
    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      id: row.id,
      userId: row.user_id,
      settingKey: row.setting_key,
      settingValue: row.setting_value,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  /**
   * Get all user settings
   * Requirements: 1.5 - User preferences and trading settings
   */
  static async getUserSettings(userId: string): Promise<UserSetting[]> {
    const query = `
      SELECT id, user_id, setting_key, setting_value, created_at, updated_at
      FROM auth.user_settings 
      WHERE user_id = $1
      ORDER BY setting_key
    `;
    
    const result = await DatabaseService.query(query, [userId]);
    
    return result.rows.map((row: any) => ({
      id: row.id,
      userId: row.user_id,
      settingKey: row.setting_key,
      settingValue: row.setting_value,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));
  }

  /**
   * Set user setting
   * Requirements: 1.5 - User preferences and trading settings
   */
  static async setUserSetting(userId: string, settingKey: string, settingValue: any): Promise<UserSetting> {
    const query = `
      INSERT INTO auth.user_settings (user_id, setting_key, setting_value)
      VALUES ($1, $2, $3)
      ON CONFLICT (user_id, setting_key) 
      DO UPDATE SET 
        setting_value = EXCLUDED.setting_value,
        updated_at = NOW()
      RETURNING id, user_id, setting_key, setting_value, created_at, updated_at
    `;
    
    const result = await DatabaseService.query(query, [userId, settingKey, JSON.stringify(settingValue)]);
    const row = result.rows[0];

    const setting: UserSetting = {
      id: row.id,
      userId: row.user_id,
      settingKey: row.setting_key,
      settingValue: row.setting_value,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };

    logger.info('User setting updated', { userId, settingKey });
    return setting;
  }

  /**
   * Delete user setting
   * Requirements: 1.5 - User preferences and trading settings
   */
  static async deleteUserSetting(userId: string, settingKey: string): Promise<boolean> {
    const query = `
      DELETE FROM auth.user_settings 
      WHERE user_id = $1 AND setting_key = $2
    `;
    
    const result = await DatabaseService.query(query, [userId, settingKey]);
    
    const deleted = result.rowCount > 0;
    if (deleted) {
      logger.info('User setting deleted', { userId, settingKey });
    }
    
    return deleted;
  }

  /**
   * Deactivate user account
   * Requirements: 1.5 - User role and permission system
   */
  static async deactivateUser(userId: string): Promise<void> {
    const query = `
      UPDATE auth.users 
      SET is_active = false, updated_at = NOW()
      WHERE id = $1
    `;
    
    await DatabaseService.query(query, [userId]);

    // Revoke all sessions
    await DatabaseService.query(
      'UPDATE auth.user_sessions SET is_revoked = true WHERE user_id = $1',
      [userId]
    );

    logger.info('User account deactivated', { userId });
  }

  /**
   * Reactivate user account
   * Requirements: 1.5 - User role and permission system
   */
  static async reactivateUser(userId: string): Promise<void> {
    const query = `
      UPDATE auth.users 
      SET is_active = true, updated_at = NOW()
      WHERE id = $1
    `;
    
    await DatabaseService.query(query, [userId]);

    logger.info('User account reactivated', { userId });
  }

  /**
   * Get user statistics
   */
  static async getUserStats(userId: string): Promise<any> {
    const queries = {
      totalStrategies: `
        SELECT COUNT(*) as count 
        FROM trading.strategies 
        WHERE user_id = $1
      `,
      activeStrategies: `
        SELECT COUNT(*) as count 
        FROM trading.strategies 
        WHERE user_id = $1 AND is_active = true
      `,
      totalPortfolios: `
        SELECT COUNT(*) as count 
        FROM trading.portfolios 
        WHERE user_id = $1
      `,
      totalBacktests: `
        SELECT COUNT(*) as count 
        FROM analytics.backtests 
        WHERE user_id = $1
      `,
      activeSessions: `
        SELECT COUNT(*) as count 
        FROM auth.user_sessions 
        WHERE user_id = $1 AND expires_at > NOW() AND is_revoked = false
      `
    };

    const results = await Promise.all([
      DatabaseService.query(queries.totalStrategies, [userId]),
      DatabaseService.query(queries.activeStrategies, [userId]),
      DatabaseService.query(queries.totalPortfolios, [userId]),
      DatabaseService.query(queries.totalBacktests, [userId]),
      DatabaseService.query(queries.activeSessions, [userId])
    ]);

    return {
      totalStrategies: parseInt(results[0].rows[0].count),
      activeStrategies: parseInt(results[1].rows[0].count),
      totalPortfolios: parseInt(results[2].rows[0].count),
      totalBacktests: parseInt(results[3].rows[0].count),
      activeSessions: parseInt(results[4].rows[0].count)
    };
  }
}