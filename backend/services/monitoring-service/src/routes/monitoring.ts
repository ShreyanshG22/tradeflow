import { Router } from 'express';
import { MonitoringService } from '@tradeflow/monitoring';

export function createMonitoringRoutes(monitoringService: MonitoringService): Router {
  const router = Router();

  // Get overall system status
  router.get('/status', async (req, res) => {
    try {
      const status = monitoringService.getStatus();
      res.json({
        success: true,
        data: status
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: {
          code: 'MONITORING_ERROR',
          message: 'Failed to get monitoring status',
          details: error instanceof Error ? error.message : 'Unknown error'
        }
      });
    }
  });

  // Get health check results
  router.get('/health', async (req, res) => {
    try {
      const healthResults = await monitoringService.getHealthStatus();
      res.json({
        success: true,
        data: healthResults
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: {
          code: 'HEALTH_CHECK_ERROR',
          message: 'Failed to get health status',
          details: error instanceof Error ? error.message : 'Unknown error'
        }
      });
    }
  });

  // Check specific service health
  router.get('/health/:serviceName', async (req, res) => {
    try {
      const { serviceName } = req.params;
      const result = await monitoringService.checkService(serviceName);
      
      if (!result) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'SERVICE_NOT_FOUND',
            message: `Service ${serviceName} not found in monitoring configuration`
          }
        });
      }

      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: {
          code: 'HEALTH_CHECK_ERROR',
          message: 'Failed to check service health',
          details: error instanceof Error ? error.message : 'Unknown error'
        }
      });
    }
  });

  // Get system metrics
  router.get('/metrics', async (req, res) => {
    try {
      const metrics = await monitoringService.getSystemMetrics();
      res.json({
        success: true,
        data: metrics
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: {
          code: 'METRICS_ERROR',
          message: 'Failed to get system metrics',
          details: error instanceof Error ? error.message : 'Unknown error'
        }
      });
    }
  });

  // Get metrics history
  router.get('/metrics/history', (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
      const history = monitoringService.getMetricsHistory(limit);
      
      res.json({
        success: true,
        data: history
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: {
          code: 'METRICS_HISTORY_ERROR',
          message: 'Failed to get metrics history',
          details: error instanceof Error ? error.message : 'Unknown error'
        }
      });
    }
  });

  // Get average metrics
  router.get('/metrics/average', (req, res) => {
    try {
      const minutes = req.query.minutes ? parseInt(req.query.minutes as string) : 5;
      const averageMetrics = monitoringService.getAverageMetrics(minutes);
      
      res.json({
        success: true,
        data: averageMetrics
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: {
          code: 'AVERAGE_METRICS_ERROR',
          message: 'Failed to get average metrics',
          details: error instanceof Error ? error.message : 'Unknown error'
        }
      });
    }
  });

  // Get detailed system information
  router.get('/system-info', async (req, res) => {
    try {
      const systemInfo = await monitoringService.getSystemInfo();
      res.json({
        success: true,
        data: systemInfo
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: {
          code: 'SYSTEM_INFO_ERROR',
          message: 'Failed to get system information',
          details: error instanceof Error ? error.message : 'Unknown error'
        }
      });
    }
  });

  // Get active alerts
  router.get('/alerts', (req, res) => {
    try {
      const alerts = monitoringService.getActiveAlerts();
      res.json({
        success: true,
        data: alerts
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: {
          code: 'ALERTS_ERROR',
          message: 'Failed to get active alerts',
          details: error instanceof Error ? error.message : 'Unknown error'
        }
      });
    }
  });

  // Get alert history
  router.get('/alerts/history', (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
      const history = monitoringService.getAlertHistory(limit);
      
      res.json({
        success: true,
        data: history
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: {
          code: 'ALERT_HISTORY_ERROR',
          message: 'Failed to get alert history',
          details: error instanceof Error ? error.message : 'Unknown error'
        }
      });
    }
  });

  // Resolve alert
  router.post('/alerts/:alertId/resolve', async (req, res) => {
    try {
      const { alertId } = req.params;
      const resolved = await monitoringService.resolveAlert(alertId);
      
      res.json({
        success: true,
        data: { resolved }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: {
          code: 'RESOLVE_ALERT_ERROR',
          message: 'Failed to resolve alert',
          details: error instanceof Error ? error.message : 'Unknown error'
        }
      });
    }
  });

  return router;
}