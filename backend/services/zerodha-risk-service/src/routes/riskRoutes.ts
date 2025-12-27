import { Router } from 'express';
import { Pool } from 'pg';
import { RiskLimitConfigService } from '../services/RiskLimitConfigService';
import { OrderRiskCheckService } from '../services/OrderRiskCheckService';
import { PortfolioRiskMonitorService } from '../services/PortfolioRiskMonitorService';
import { logger } from '../utils/logger';

export function createRiskRoutes(db: Pool): Router {
  const router = Router();
  const riskLimitService = new RiskLimitConfigService(db);
  const orderRiskService = new OrderRiskCheckService(db, riskLimitService);
  const portfolioRiskService = new PortfolioRiskMonitorService(db, riskLimitService);

  // Get user risk limits
  router.get('/limits/:userId', async (req, res) => {
    try {
      const { userId } = req.params;
      const limits = await riskLimitService.getEffectiveRiskLimits(userId);
      
      res.json({
        success: true,
        data: limits
      });
    } catch (error) {
      logger.error('Error fetching risk limits:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch risk limits'
      });
    }
  });

  // Set user risk limits
  router.put('/limits/:userId', async (req, res) => {
    try {
      const { userId } = req.params;
      const limits = req.body;
      
      const result = await riskLimitService.setUserRiskLimits(userId, limits);
      
      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      logger.error('Error setting risk limits:', error);
      res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to set risk limits'
      });
    }
  });

  // Apply risk limit preset
  router.post('/limits/:userId/preset', async (req, res) => {
    try {
      const { userId } = req.params;
      const { preset } = req.body;
      
      const result = await riskLimitService.applyRiskLimitPreset(userId, preset);
      
      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      logger.error('Error applying risk preset:', error);
      res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to apply risk preset'
      });
    }
  });

  // Validate order against risk limits
  router.post('/validate-order', async (req, res) => {
    try {
      const orderRequest = req.body;
      const result = await orderRiskService.validateOrder(orderRequest);
      
      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      logger.error('Error validating order:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to validate order'
      });
    }
  });

  // Monitor portfolio risks
  router.get('/monitor/:userId', async (req, res) => {
    try {
      const { userId } = req.params;
      const results = await portfolioRiskService.monitorPortfolioRisks(userId);
      
      res.json({
        success: true,
        data: results
      });
    } catch (error) {
      logger.error('Error monitoring portfolio risks:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to monitor portfolio risks'
      });
    }
  });

  // Update daily risk metrics
  router.post('/metrics/:userId/update', async (req, res) => {
    try {
      const { userId } = req.params;
      await portfolioRiskService.updateDailyRiskMetrics(userId);
      
      res.json({
        success: true,
        message: 'Daily risk metrics updated successfully'
      });
    } catch (error) {
      logger.error('Error updating daily risk metrics:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to update daily risk metrics'
      });
    }
  });

  // Get risk breaches for user
  router.get('/breaches/:userId', async (req, res) => {
    try {
      const { userId } = req.params;
      const { limit = 50, offset = 0 } = req.query;
      
      const query = `
        SELECT * FROM risk_breaches 
        WHERE user_id = $1 
        ORDER BY timestamp DESC 
        LIMIT $2 OFFSET $3
      `;
      
      const result = await db.query(query, [userId, limit, offset]);
      
      res.json({
        success: true,
        data: result.rows
      });
    } catch (error) {
      logger.error('Error fetching risk breaches:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch risk breaches'
      });
    }
  });

  // Disable user risk limits
  router.delete('/limits/:userId', async (req, res) => {
    try {
      const { userId } = req.params;
      await riskLimitService.disableUserRiskLimits(userId);
      
      res.json({
        success: true,
        message: 'Risk limits disabled successfully'
      });
    } catch (error) {
      logger.error('Error disabling risk limits:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to disable risk limits'
      });
    }
  });

  return router;
}