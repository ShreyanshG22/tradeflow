import { Pool } from 'pg';
import { RiskCheckResult, RiskBreach, RiskLimits } from '../types/riskTypes';
import { RiskLimitConfigService } from './RiskLimitConfigService';
import { logger } from '../utils/logger';

interface PortfolioMetrics {
  total_exposure: number;
  daily_pnl: number;
  unrealized_pnl: number;
  realized_pnl: number;
  margin_used: number;
  available_margin: number;
  sector_exposures: { [sector: string]: number };
}

interface AlertConfig {
  user_id: string;
  email?: string;
  phone?: string;
  webhook_url?: string;
  alert_types: string[];
}

export class PortfolioRiskMonitorService {
  private db: Pool;
  private riskLimitService: RiskLimitConfigService;

  constructor(db: Pool, riskLimitService: RiskLimitConfigService) {
    this.db = db;
    this.riskLimitService = riskLimitService;
  }

  /**
   * Monitor portfolio-level risks for a user
   */
  async monitorPortfolioRisks(userId: string): Promise<RiskCheckResult[]> {
    try {
      const riskLimits = await this.riskLimitService.getEffectiveRiskLimits(userId);
      const portfolioMetrics = await this.getPortfolioMetrics(userId);
      const results: RiskCheckResult[] = [];

      // Check daily loss limit
      const dailyLossCheck = this.checkDailyLossLimit(portfolioMetrics, riskLimits);
      results.push(dailyLossCheck);

      // Check portfolio exposure limit
      const exposureCheck = this.checkPortfolioExposureLimit(portfolioMetrics, riskLimits);
      results.push(exposureCheck);

      // Check sector exposure limits
      const sectorChecks = this.checkSectorExposureLimits(portfolioMetrics, riskLimits);
      results.push(...sectorChecks);

      // Check margin requirements
      const marginCheck = this.checkMarginLimits(portfolioMetrics, riskLimits);
      results.push(marginCheck);

      // Log any breaches
      const breaches = results.filter(result => !result.allowed);
      if (breaches.length > 0) {
        await this.logRiskBreaches(userId, breaches);
        await this.sendRiskAlerts(userId, breaches);
      }

      return results;

    } catch (error) {
      logger.error('Error monitoring portfolio risks:', error);
      return [{
        allowed: false,
        message: 'Portfolio risk monitoring failed due to system error',
        warnings: []
      }];
    }
  }

  /**
   * Check daily loss limit
   */
  private checkDailyLossLimit(metrics: PortfolioMetrics, limits: RiskLimits): RiskCheckResult {
    const dailyLoss = Math.abs(Math.min(0, metrics.daily_pnl));
    const warnings: string[] = [];

    if (dailyLoss > limits.max_daily_loss) {
      return {
        allowed: false,
        breach_type: 'DAILY_LOSS',
        message: `Daily loss ₹${dailyLoss.toFixed(2)} exceeds limit of ₹${limits.max_daily_loss.toFixed(2)}`,
        current_value: dailyLoss,
        limit_value: limits.max_daily_loss,
        warnings: []
      };
    }

    // Warning if approaching daily loss limit
    const lossPercentage = dailyLoss / limits.max_daily_loss;
    if (lossPercentage >= limits.loss_alert_threshold) {
      warnings.push(`Daily loss is ${(lossPercentage * 100).toFixed(1)}% of maximum limit`);
    }

    return {
      allowed: true,
      message: 'Daily loss check passed',
      current_value: dailyLoss,
      limit_value: limits.max_daily_loss,
      warnings
    };
  }

  /**
   * Check portfolio exposure limit
   */
  private checkPortfolioExposureLimit(metrics: PortfolioMetrics, limits: RiskLimits): RiskCheckResult {
    const warnings: string[] = [];

    if (metrics.total_exposure > limits.max_portfolio_exposure) {
      return {
        allowed: false,
        breach_type: 'EXPOSURE',
        message: `Portfolio exposure ₹${metrics.total_exposure.toFixed(2)} exceeds limit of ₹${limits.max_portfolio_exposure.toFixed(2)}`,
        current_value: metrics.total_exposure,
        limit_value: limits.max_portfolio_exposure,
        warnings: []
      };
    }

    // Warning if approaching exposure limit
    const exposurePercentage = metrics.total_exposure / limits.max_portfolio_exposure;
    if (exposurePercentage >= limits.exposure_alert_threshold) {
      warnings.push(`Portfolio exposure is ${(exposurePercentage * 100).toFixed(1)}% of maximum limit`);
    }

    return {
      allowed: true,
      message: 'Portfolio exposure check passed',
      current_value: metrics.total_exposure,
      limit_value: limits.max_portfolio_exposure,
      warnings
    };
  }

  /**
   * Check sector exposure limits
   */
  private checkSectorExposureLimits(metrics: PortfolioMetrics, limits: RiskLimits): RiskCheckResult[] {
    const results: RiskCheckResult[] = [];

    for (const [sector, exposure] of Object.entries(metrics.sector_exposures)) {
      const warnings: string[] = [];

      if (exposure > limits.max_sector_exposure) {
        results.push({
          allowed: false,
          breach_type: 'SECTOR_EXPOSURE',
          message: `${sector} sector exposure ₹${exposure.toFixed(2)} exceeds limit of ₹${limits.max_sector_exposure.toFixed(2)}`,
          current_value: exposure,
          limit_value: limits.max_sector_exposure,
          warnings: []
        });
      } else {
        // Warning if approaching sector exposure limit
        const sectorPercentage = exposure / limits.max_sector_exposure;
        if (sectorPercentage >= 0.8) { // 80% threshold for sector warnings
          warnings.push(`${sector} sector exposure is ${(sectorPercentage * 100).toFixed(1)}% of maximum limit`);
        }

        results.push({
          allowed: true,
          message: `${sector} sector exposure check passed`,
          current_value: exposure,
          limit_value: limits.max_sector_exposure,
          warnings
        });
      }
    }

    return results;
  }

  /**
   * Check margin limits
   */
  private checkMarginLimits(metrics: PortfolioMetrics, limits: RiskLimits): RiskCheckResult {
    const warnings: string[] = [];

    if (metrics.available_margin < limits.min_margin_balance) {
      return {
        allowed: false,
        breach_type: 'MARGIN',
        message: `Available margin ₹${metrics.available_margin.toFixed(2)} below minimum required ₹${limits.min_margin_balance.toFixed(2)}`,
        current_value: metrics.available_margin,
        limit_value: limits.min_margin_balance,
        warnings: []
      };
    }

    // Warning if margin is getting low
    const marginRatio = metrics.available_margin / limits.min_margin_balance;
    if (marginRatio <= 1.5) { // Warning when margin is 1.5x minimum
      warnings.push(`Available margin is ${marginRatio.toFixed(1)}x minimum required`);
    }

    return {
      allowed: true,
      message: 'Margin check passed',
      current_value: metrics.available_margin,
      limit_value: limits.min_margin_balance,
      warnings
    };
  }

  /**
   * Get portfolio metrics for risk monitoring
   */
  private async getPortfolioMetrics(userId: string): Promise<PortfolioMetrics> {
    try {
      // Get positions and calculate exposure
      const positionsQuery = `
        SELECT 
          tradingsymbol,
          exchange,
          quantity,
          average_price,
          last_price,
          pnl,
          unrealised,
          realised
        FROM zerodha_positions 
        WHERE user_id = $1 AND position_date = CURRENT_DATE
      `;
      
      const positionsResult = await this.db.query(positionsQuery, [userId]);
      
      let totalExposure = 0;
      let unrealizedPnl = 0;
      let realizedPnl = 0;
      const sectorExposures: { [sector: string]: number } = {};

      for (const position of positionsResult.rows) {
        const exposure = Math.abs(position.quantity) * position.last_price;
        totalExposure += exposure;
        unrealizedPnl += position.unrealised || 0;
        realizedPnl += position.realised || 0;

        // Get sector for this instrument (simplified - would need instrument master data)
        const sector = await this.getInstrumentSector(position.exchange, position.tradingsymbol);
        sectorExposures[sector] = (sectorExposures[sector] || 0) + exposure;
      }

      // Get daily P&L
      const dailyPnl = unrealizedPnl + realizedPnl;

      // Get margin data (mock implementation)
      const marginUsed = totalExposure * 0.2; // Assuming 20% margin requirement
      const availableMargin = 100000 - marginUsed; // Mock calculation

      return {
        total_exposure: totalExposure,
        daily_pnl: dailyPnl,
        unrealized_pnl: unrealizedPnl,
        realized_pnl: realizedPnl,
        margin_used: marginUsed,
        available_margin: availableMargin,
        sector_exposures: sectorExposures
      };

    } catch (error) {
      logger.error('Error getting portfolio metrics:', error);
      throw error;
    }
  }

  /**
   * Log risk breaches to database
   */
  private async logRiskBreaches(userId: string, breaches: RiskCheckResult[]): Promise<void> {
    try {
      for (const breach of breaches) {
        if (!breach.allowed && breach.breach_type) {
          const breachPercentage = breach.current_value && breach.limit_value 
            ? (breach.current_value / breach.limit_value) * 100 
            : 0;

          const query = `
            INSERT INTO risk_breaches (
              user_id, breach_type, limit_type, current_value, 
              limit_value, breach_percentage, timestamp, is_resolved, action_taken
            ) VALUES ($1, $2, $3, $4, $5, $6, NOW(), false, $7)
          `;

          await this.db.query(query, [
            userId,
            breach.breach_type,
            'USER', // Assuming user-level limits for now
            breach.current_value || 0,
            breach.limit_value || 0,
            breachPercentage,
            'Alert sent' // Default action
          ]);

          logger.warn(`Risk breach logged for user ${userId}: ${breach.breach_type}`);
        }
      }
    } catch (error) {
      logger.error('Error logging risk breaches:', error);
    }
  }

  /**
   * Send risk alerts to user
   */
  private async sendRiskAlerts(userId: string, breaches: RiskCheckResult[]): Promise<void> {
    try {
      const alertConfig = await this.getAlertConfig(userId);
      
      if (!alertConfig) {
        logger.warn(`No alert configuration found for user ${userId}`);
        return;
      }

      for (const breach of breaches) {
        if (!breach.allowed) {
          const alertMessage = this.formatAlertMessage(breach);
          
          // Send email alert
          if (alertConfig.email && alertConfig.alert_types.includes('email')) {
            await this.sendEmailAlert(alertConfig.email, alertMessage);
          }

          // Send SMS alert
          if (alertConfig.phone && alertConfig.alert_types.includes('sms')) {
            await this.sendSmsAlert(alertConfig.phone, alertMessage);
          }

          // Send webhook alert
          if (alertConfig.webhook_url && alertConfig.alert_types.includes('webhook')) {
            await this.sendWebhookAlert(alertConfig.webhook_url, breach);
          }
        }
      }
    } catch (error) {
      logger.error('Error sending risk alerts:', error);
    }
  }

  /**
   * Update daily risk metrics
   */
  async updateDailyRiskMetrics(userId: string): Promise<void> {
    try {
      const metrics = await this.getPortfolioMetrics(userId);
      const today = new Date().toISOString().split('T')[0];

      // Count orders for today
      const ordersQuery = `
        SELECT COUNT(*) as total_orders, 
               COALESCE(SUM(CASE WHEN order_type = 'MARKET' THEN quantity * average_price ELSE quantity * price END), 0) as total_order_value
        FROM zerodha_orders 
        WHERE user_id = $1 AND DATE(order_timestamp) = $2
      `;
      
      const ordersResult = await this.db.query(ordersQuery, [userId, today]);
      const orderStats = ordersResult.rows[0];

      // Count risk events for today
      const riskEventsQuery = `
        SELECT COUNT(*) as risk_breaches
        FROM risk_breaches 
        WHERE user_id = $1 AND DATE(timestamp) = $2
      `;
      
      const riskEventsResult = await this.db.query(riskEventsQuery, [userId, today]);
      const riskEvents = riskEventsResult.rows[0];

      // Update or insert daily metrics
      const upsertQuery = `
        INSERT INTO daily_risk_metrics (
          user_id, trade_date, total_orders, total_order_value,
          realized_pnl, unrealized_pnl, max_exposure, margin_used,
          risk_breaches, orders_blocked, auto_square_offs,
          created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, 0, 0, NOW(), NOW()
        )
        ON CONFLICT (user_id, trade_date)
        DO UPDATE SET
          total_orders = EXCLUDED.total_orders,
          total_order_value = EXCLUDED.total_order_value,
          realized_pnl = EXCLUDED.realized_pnl,
          unrealized_pnl = EXCLUDED.unrealized_pnl,
          max_exposure = GREATEST(daily_risk_metrics.max_exposure, EXCLUDED.max_exposure),
          margin_used = EXCLUDED.margin_used,
          risk_breaches = EXCLUDED.risk_breaches,
          updated_at = NOW()
      `;

      await this.db.query(upsertQuery, [
        userId,
        today,
        parseInt(orderStats.total_orders),
        parseFloat(orderStats.total_order_value),
        metrics.realized_pnl,
        metrics.unrealized_pnl,
        metrics.total_exposure,
        metrics.margin_used,
        parseInt(riskEvents.risk_breaches)
      ]);

      logger.info(`Updated daily risk metrics for user ${userId}`);

    } catch (error) {
      logger.error('Error updating daily risk metrics:', error);
      throw error;
    }
  }

  /**
   * Get instrument sector (simplified implementation)
   */
  private async getInstrumentSector(exchange: string, tradingsymbol: string): Promise<string> {
    // This would typically query an instrument master database
    // For now, returning a default sector
    return 'Technology'; // Mock sector
  }

  /**
   * Get alert configuration for user
   */
  private async getAlertConfig(userId: string): Promise<AlertConfig | null> {
    // This would typically query user preferences
    // For now, returning a mock configuration
    return {
      user_id: userId,
      email: 'user@example.com',
      alert_types: ['email', 'webhook']
    };
  }

  /**
   * Format alert message
   */
  private formatAlertMessage(breach: RiskCheckResult): string {
    return `Risk Alert: ${breach.message}`;
  }

  /**
   * Send email alert (mock implementation)
   */
  private async sendEmailAlert(email: string, message: string): Promise<void> {
    logger.info(`Email alert sent to ${email}: ${message}`);
    // Implement actual email sending logic
  }

  /**
   * Send SMS alert (mock implementation)
   */
  private async sendSmsAlert(phone: string, message: string): Promise<void> {
    logger.info(`SMS alert sent to ${phone}: ${message}`);
    // Implement actual SMS sending logic
  }

  /**
   * Send webhook alert (mock implementation)
   */
  private async sendWebhookAlert(webhookUrl: string, breach: RiskCheckResult): Promise<void> {
    logger.info(`Webhook alert sent to ${webhookUrl}:`, breach);
    // Implement actual webhook sending logic
  }
}