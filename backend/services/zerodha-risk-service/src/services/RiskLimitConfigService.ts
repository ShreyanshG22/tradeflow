import { Pool } from 'pg';
import { RiskLimits, UserRiskLimits, GlobalRiskLimits, RiskLimitValidation } from '../types/riskTypes';
import { DEFAULT_RISK_LIMITS, RISK_LIMIT_PRESETS } from '../config/defaultRiskLimits';
import { logger } from '../utils/logger';

export class RiskLimitConfigService {
  private db: Pool;

  constructor(db: Pool) {
    this.db = db;
  }

  /**
   * Validate risk limit configuration
   */
  validateRiskLimits(limits: Partial<RiskLimits>): RiskLimitValidation {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Validate order limits
    if (limits.max_order_value !== undefined) {
      if (limits.max_order_value <= 0) {
        errors.push('Maximum order value must be greater than 0');
      }
      if (limits.max_order_value > 10000000) { // ₹1 crore
        warnings.push('Maximum order value is very high (>₹1 crore)');
      }
    }

    if (limits.max_position_size !== undefined) {
      if (limits.max_position_size <= 0) {
        errors.push('Maximum position size must be greater than 0');
      }
      if (limits.max_order_value && limits.max_position_size < limits.max_order_value) {
        warnings.push('Position size limit is lower than order value limit');
      }
    }

    if (limits.max_orders_per_minute !== undefined) {
      if (limits.max_orders_per_minute <= 0 || limits.max_orders_per_minute > 100) {
        errors.push('Orders per minute must be between 1 and 100');
      }
    }

    // Validate portfolio limits
    if (limits.max_daily_loss !== undefined) {
      if (limits.max_daily_loss <= 0) {
        errors.push('Maximum daily loss must be greater than 0');
      }
    }

    if (limits.max_portfolio_exposure !== undefined) {
      if (limits.max_portfolio_exposure <= 0) {
        errors.push('Maximum portfolio exposure must be greater than 0');
      }
    }

    // Validate margin settings
    if (limits.margin_multiplier !== undefined) {
      if (limits.margin_multiplier < 1.0 || limits.margin_multiplier > 3.0) {
        errors.push('Margin multiplier must be between 1.0 and 3.0');
      }
    }

    // Validate time settings
    if (limits.trading_hours_start && limits.trading_hours_end) {
      const startTime = new Date(`2000-01-01T${limits.trading_hours_start}:00`);
      const endTime = new Date(`2000-01-01T${limits.trading_hours_end}:00`);
      
      if (startTime >= endTime) {
        errors.push('Trading start time must be before end time');
      }
    }

    // Validate alert thresholds
    if (limits.loss_alert_threshold !== undefined) {
      if (limits.loss_alert_threshold < 0 || limits.loss_alert_threshold > 1) {
        errors.push('Loss alert threshold must be between 0 and 1');
      }
    }

    if (limits.exposure_alert_threshold !== undefined) {
      if (limits.exposure_alert_threshold < 0 || limits.exposure_alert_threshold > 1) {
        errors.push('Exposure alert threshold must be between 0 and 1');
      }
    }

    // Validate arrays
    if (limits.allowed_products && limits.allowed_products.length === 0) {
      errors.push('At least one product must be allowed');
    }

    if (limits.allowed_exchanges && limits.allowed_exchanges.length === 0) {
      errors.push('At least one exchange must be allowed');
    }

    return {
      is_valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Get user-specific risk limits
   */
  async getUserRiskLimits(userId: string): Promise<UserRiskLimits | null> {
    try {
      const query = `
        SELECT * FROM user_risk_limits 
        WHERE user_id = $1 AND is_active = true
      `;
      
      const result = await this.db.query(query, [userId]);
      
      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      return {
        user_id: row.user_id,
        is_active: row.is_active,
        created_at: row.created_at,
        updated_at: row.updated_at,
        ...this.parseRiskLimitsFromDb(row)
      };
    } catch (error) {
      logger.error('Error fetching user risk limits:', error);
      throw error;
    }
  }

  /**
   * Set user-specific risk limits
   */
  async setUserRiskLimits(userId: string, limits: Partial<RiskLimits>): Promise<UserRiskLimits> {
    const validation = this.validateRiskLimits(limits);
    if (!validation.is_valid) {
      throw new Error(`Invalid risk limits: ${validation.errors.join(', ')}`);
    }

    try {
      // Merge with default limits
      const currentLimits = await this.getUserRiskLimits(userId);
      const mergedLimits = {
        ...DEFAULT_RISK_LIMITS,
        ...currentLimits,
        ...limits
      };

      const query = `
        INSERT INTO user_risk_limits (
          user_id, max_order_value, max_position_size, max_orders_per_minute,
          max_daily_loss, max_portfolio_exposure, max_sector_exposure,
          allowed_products, allowed_exchanges, blocked_instruments,
          margin_multiplier, min_margin_balance, trading_hours_start, trading_hours_end,
          auto_square_off_enabled, square_off_time, loss_alert_threshold, exposure_alert_threshold,
          is_active, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, true, NOW(), NOW()
        )
        ON CONFLICT (user_id) 
        DO UPDATE SET
          max_order_value = EXCLUDED.max_order_value,
          max_position_size = EXCLUDED.max_position_size,
          max_orders_per_minute = EXCLUDED.max_orders_per_minute,
          max_daily_loss = EXCLUDED.max_daily_loss,
          max_portfolio_exposure = EXCLUDED.max_portfolio_exposure,
          max_sector_exposure = EXCLUDED.max_sector_exposure,
          allowed_products = EXCLUDED.allowed_products,
          allowed_exchanges = EXCLUDED.allowed_exchanges,
          blocked_instruments = EXCLUDED.blocked_instruments,
          margin_multiplier = EXCLUDED.margin_multiplier,
          min_margin_balance = EXCLUDED.min_margin_balance,
          trading_hours_start = EXCLUDED.trading_hours_start,
          trading_hours_end = EXCLUDED.trading_hours_end,
          auto_square_off_enabled = EXCLUDED.auto_square_off_enabled,
          square_off_time = EXCLUDED.square_off_time,
          loss_alert_threshold = EXCLUDED.loss_alert_threshold,
          exposure_alert_threshold = EXCLUDED.exposure_alert_threshold,
          updated_at = NOW()
        RETURNING *
      `;

      const values = [
        userId,
        mergedLimits.max_order_value,
        mergedLimits.max_position_size,
        mergedLimits.max_orders_per_minute,
        mergedLimits.max_daily_loss,
        mergedLimits.max_portfolio_exposure,
        mergedLimits.max_sector_exposure,
        JSON.stringify(mergedLimits.allowed_products),
        JSON.stringify(mergedLimits.allowed_exchanges),
        JSON.stringify(mergedLimits.blocked_instruments),
        mergedLimits.margin_multiplier,
        mergedLimits.min_margin_balance,
        mergedLimits.trading_hours_start,
        mergedLimits.trading_hours_end,
        mergedLimits.auto_square_off_enabled,
        mergedLimits.square_off_time,
        mergedLimits.loss_alert_threshold,
        mergedLimits.exposure_alert_threshold
      ];

      const result = await this.db.query(query, values);
      const row = result.rows[0];

      logger.info(`Updated risk limits for user ${userId}`);

      return {
        user_id: row.user_id,
        is_active: row.is_active,
        created_at: row.created_at,
        updated_at: row.updated_at,
        ...this.parseRiskLimitsFromDb(row)
      };
    } catch (error) {
      logger.error('Error setting user risk limits:', error);
      throw error;
    }
  }

  /**
   * Get effective risk limits for a user (user-specific or global default)
   */
  async getEffectiveRiskLimits(userId: string): Promise<RiskLimits> {
    try {
      const userLimits = await this.getUserRiskLimits(userId);
      
      if (userLimits) {
        return {
          max_order_value: userLimits.max_order_value,
          max_position_size: userLimits.max_position_size,
          max_orders_per_minute: userLimits.max_orders_per_minute,
          max_daily_loss: userLimits.max_daily_loss,
          max_portfolio_exposure: userLimits.max_portfolio_exposure,
          max_sector_exposure: userLimits.max_sector_exposure,
          allowed_products: userLimits.allowed_products,
          allowed_exchanges: userLimits.allowed_exchanges,
          blocked_instruments: userLimits.blocked_instruments,
          margin_multiplier: userLimits.margin_multiplier,
          min_margin_balance: userLimits.min_margin_balance,
          trading_hours_start: userLimits.trading_hours_start,
          trading_hours_end: userLimits.trading_hours_end,
          auto_square_off_enabled: userLimits.auto_square_off_enabled,
          square_off_time: userLimits.square_off_time,
          loss_alert_threshold: userLimits.loss_alert_threshold,
          exposure_alert_threshold: userLimits.exposure_alert_threshold
        };
      }

      // Return default limits if no user-specific limits found
      return DEFAULT_RISK_LIMITS;
    } catch (error) {
      logger.error('Error getting effective risk limits:', error);
      return DEFAULT_RISK_LIMITS;
    }
  }

  /**
   * Apply risk limit preset to user
   */
  async applyRiskLimitPreset(userId: string, presetName: keyof typeof RISK_LIMIT_PRESETS): Promise<UserRiskLimits> {
    const preset = RISK_LIMIT_PRESETS[presetName];
    if (!preset) {
      throw new Error(`Invalid preset name: ${presetName}`);
    }

    return this.setUserRiskLimits(userId, preset);
  }

  /**
   * Disable risk limits for a user
   */
  async disableUserRiskLimits(userId: string): Promise<void> {
    try {
      const query = `
        UPDATE user_risk_limits 
        SET is_active = false, updated_at = NOW()
        WHERE user_id = $1
      `;
      
      await this.db.query(query, [userId]);
      logger.info(`Disabled risk limits for user ${userId}`);
    } catch (error) {
      logger.error('Error disabling user risk limits:', error);
      throw error;
    }
  }

  /**
   * Parse risk limits from database row
   */
  private parseRiskLimitsFromDb(row: any): RiskLimits {
    return {
      max_order_value: row.max_order_value,
      max_position_size: row.max_position_size,
      max_orders_per_minute: row.max_orders_per_minute,
      max_daily_loss: row.max_daily_loss,
      max_portfolio_exposure: row.max_portfolio_exposure,
      max_sector_exposure: row.max_sector_exposure,
      allowed_products: JSON.parse(row.allowed_products || '[]'),
      allowed_exchanges: JSON.parse(row.allowed_exchanges || '[]'),
      blocked_instruments: JSON.parse(row.blocked_instruments || '[]'),
      margin_multiplier: row.margin_multiplier,
      min_margin_balance: row.min_margin_balance,
      trading_hours_start: row.trading_hours_start,
      trading_hours_end: row.trading_hours_end,
      auto_square_off_enabled: row.auto_square_off_enabled,
      square_off_time: row.square_off_time,
      loss_alert_threshold: row.loss_alert_threshold,
      exposure_alert_threshold: row.exposure_alert_threshold
    };
  }
}