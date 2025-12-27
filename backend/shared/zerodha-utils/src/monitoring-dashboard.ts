import { HealthMonitor, HealthStatus } from './health-monitor';
import { MetricsCollector, PerformanceMetrics } from './metrics-collector';
import { AlertSystem, Alert, AlertSeverity } from './alert-system';
import { circuitBreakerManager } from './circuit-breaker';
import { createLogger } from './logger';

const logger = createLogger('monitoring-dashboard');

// Dashboard widget types
export enum WidgetType {
  METRIC = 'METRIC',
  CHART = 'CHART',
  TABLE = 'TABLE',
  STATUS = 'STATUS',
  ALERT = 'ALERT'
}

// Dashboard widget
export interface DashboardWidget {
  id: string;
  title: string;
  type: WidgetType;
  config: Record<string, any>;
  data?: any;
  refreshInterval?: number;
}

// Dashboard configuration
export interface DashboardConfig {
  id: string;
  title: string;
  description?: string;
  widgets: DashboardWidget[];
  refreshInterval: number;
  autoRefresh: boolean;
}

// System overview data
export interface SystemOverview {
  status: HealthStatus;
  uptime: number;
  version: string;
  environment: string;
  services: ServiceStatus[];
  alerts: Alert[];
  metrics: PerformanceMetrics;
  timestamp: Date;
}

// Service status
export interface ServiceStatus {
  name: string;
  status: HealthStatus;
  version?: string;
  uptime?: number;
  lastCheck: Date;
  endpoints?: EndpointStatus[];
}

// Endpoint status
export interface EndpointStatus {
  path: string;
  method: string;
  status: HealthStatus;
  responseTime: number;
  errorRate: number;
  lastCheck: Date;
}

// Monitoring dashboard class
export class MonitoringDashboard {
  private healthMonitor: HealthMonitor;
  private metricsCollector: MetricsCollector;
  private alertSystem: AlertSystem;
  private dashboards: Map<string, DashboardConfig> = new Map();
  private serviceName: string;

  constructor(
    serviceName: string,
    healthMonitor: HealthMonitor,
    metricsCollector: MetricsCollector,
    alertSystem: AlertSystem
  ) {
    this.serviceName = serviceName;
    this.healthMonitor = healthMonitor;
    this.metricsCollector = metricsCollector;
    this.alertSystem = alertSystem;
    
    this.initializeDefaultDashboards();
  }

  // Initialize default dashboards
  private initializeDefaultDashboards(): void {
    // System overview dashboard
    this.addDashboard({
      id: 'system-overview',
      title: 'System Overview',
      description: 'High-level system health and performance metrics',
      refreshInterval: 30000, // 30 seconds
      autoRefresh: true,
      widgets: [
        {
          id: 'system-status',
          title: 'System Status',
          type: WidgetType.STATUS,
          config: { source: 'health' }
        },
        {
          id: 'active-alerts',
          title: 'Active Alerts',
          type: WidgetType.ALERT,
          config: { maxItems: 10 }
        },
        {
          id: 'request-metrics',
          title: 'Request Metrics',
          type: WidgetType.CHART,
          config: { 
            chartType: 'line',
            metrics: ['requestsPerSecond', 'errorRate'],
            timeRange: '1h'
          }
        },
        {
          id: 'response-times',
          title: 'Response Times',
          type: WidgetType.CHART,
          config: {
            chartType: 'histogram',
            metric: 'requestDuration',
            timeRange: '1h'
          }
        }
      ]
    });

    // API monitoring dashboard
    this.addDashboard({
      id: 'api-monitoring',
      title: 'API Monitoring',
      description: 'API performance and connectivity monitoring',
      refreshInterval: 15000, // 15 seconds
      autoRefresh: true,
      widgets: [
        {
          id: 'api-status',
          title: 'API Status',
          type: WidgetType.TABLE,
          config: { source: 'api-connectivity' }
        },
        {
          id: 'circuit-breakers',
          title: 'Circuit Breakers',
          type: WidgetType.STATUS,
          config: { source: 'circuit-breakers' }
        },
        {
          id: 'api-response-times',
          title: 'API Response Times',
          type: WidgetType.CHART,
          config: {
            chartType: 'line',
            metric: 'apiCallDuration',
            timeRange: '2h'
          }
        },
        {
          id: 'api-error-rate',
          title: 'API Error Rate',
          type: WidgetType.METRIC,
          config: {
            metric: 'apiErrorRate',
            threshold: { warning: 0.05, critical: 0.1 }
          }
        }
      ]
    });

    // Business metrics dashboard
    this.addDashboard({
      id: 'business-metrics',
      title: 'Business Metrics',
      description: 'Trading and business performance metrics',
      refreshInterval: 60000, // 1 minute
      autoRefresh: true,
      widgets: [
        {
          id: 'orders-summary',
          title: 'Orders Summary',
          type: WidgetType.METRIC,
          config: {
            metrics: ['ordersPlaced', 'ordersExecuted'],
            timeRange: '24h'
          }
        },
        {
          id: 'order-execution-times',
          title: 'Order Execution Times',
          type: WidgetType.CHART,
          config: {
            chartType: 'histogram',
            metric: 'orderExecutionTime',
            timeRange: '4h'
          }
        },
        {
          id: 'websocket-activity',
          title: 'WebSocket Activity',
          type: WidgetType.CHART,
          config: {
            chartType: 'line',
            metrics: ['wsMessagesReceived', 'wsMessagesSent'],
            timeRange: '2h'
          }
        },
        {
          id: 'active-connections',
          title: 'Active Connections',
          type: WidgetType.METRIC,
          config: { metric: 'wsConnectionsActive' }
        }
      ]
    });
  }

  // Add dashboard
  addDashboard(config: DashboardConfig): void {
    this.dashboards.set(config.id, config);
    logger.info('Dashboard added', {
      service: this.serviceName,
      dashboardId: config.id,
      title: config.title
    });
  }

  // Get dashboard
  getDashboard(id: string): DashboardConfig | undefined {
    return this.dashboards.get(id);
  }

  // Get all dashboards
  getAllDashboards(): DashboardConfig[] {
    return Array.from(this.dashboards.values());
  }

  // Get dashboard data
  async getDashboardData(id: string): Promise<any> {
    const dashboard = this.dashboards.get(id);
    if (!dashboard) {
      throw new Error(`Dashboard ${id} not found`);
    }

    const data: any = {
      dashboard: {
        id: dashboard.id,
        title: dashboard.title,
        description: dashboard.description,
        lastUpdated: new Date()
      },
      widgets: {}
    };

    // Populate widget data
    for (const widget of dashboard.widgets) {
      try {
        data.widgets[widget.id] = await this.getWidgetData(widget);
      } catch (error) {
        logger.error('Failed to get widget data', error, {
          service: this.serviceName,
          dashboardId: id,
          widgetId: widget.id
        });
        data.widgets[widget.id] = { error: error.message };
      }
    }

    return data;
  }

  // Get widget data
  private async getWidgetData(widget: DashboardWidget): Promise<any> {
    switch (widget.type) {
      case WidgetType.STATUS:
        return this.getStatusWidgetData(widget);
      
      case WidgetType.METRIC:
        return this.getMetricWidgetData(widget);
      
      case WidgetType.CHART:
        return this.getChartWidgetData(widget);
      
      case WidgetType.TABLE:
        return this.getTableWidgetData(widget);
      
      case WidgetType.ALERT:
        return this.getAlertWidgetData(widget);
      
      default:
        throw new Error(`Unsupported widget type: ${widget.type}`);
    }
  }

  // Get status widget data
  private async getStatusWidgetData(widget: DashboardWidget): Promise<any> {
    const { source } = widget.config;

    switch (source) {
      case 'health':
        const systemHealth = await this.healthMonitor.getSystemHealth();
        return {
          status: systemHealth.status,
          uptime: systemHealth.uptime,
          checks: systemHealth.checks.length,
          failedChecks: systemHealth.checks.filter(c => c.status !== HealthStatus.HEALTHY).length
        };

      case 'circuit-breakers':
        const circuitBreakers = circuitBreakerManager.getHealthStatus();
        return {
          total: circuitBreakers.length,
          healthy: circuitBreakers.filter(cb => cb.healthy).length,
          open: circuitBreakers.filter(cb => !cb.healthy).length,
          breakers: circuitBreakers
        };

      default:
        throw new Error(`Unknown status source: ${source}`);
    }
  }

  // Get metric widget data
  private getMetricWidgetData(widget: DashboardWidget): any {
    const { metric, metrics, threshold } = widget.config;
    const performanceMetrics = this.metricsCollector.getPerformanceMetrics();

    if (metric) {
      const value = (performanceMetrics as any)[metric];
      let status = 'normal';
      
      if (threshold) {
        if (value >= threshold.critical) {
          status = 'critical';
        } else if (value >= threshold.warning) {
          status = 'warning';
        }
      }

      return { value, status, threshold };
    }

    if (metrics) {
      const values: any = {};
      metrics.forEach((m: string) => {
        values[m] = (performanceMetrics as any)[m];
      });
      return { values };
    }

    return performanceMetrics;
  }

  // Get chart widget data
  private getChartWidgetData(widget: DashboardWidget): any {
    const { chartType, metric, metrics, timeRange } = widget.config;
    const performanceMetrics = this.metricsCollector.getPerformanceMetrics();

    // This is a simplified implementation
    // In a real system, you would query time-series data
    const data = {
      chartType,
      timeRange,
      timestamp: new Date(),
      series: []
    };

    if (metric) {
      const value = (performanceMetrics as any)[metric];
      if (value && typeof value === 'object' && value.buckets) {
        // Histogram data
        data.series = [{
          name: metric,
          data: value.buckets.map((bucket: any) => ({
            x: bucket.le,
            y: bucket.count
          }))
        }];
      } else {
        // Single metric
        data.series = [{
          name: metric,
          data: [{ x: Date.now(), y: value }]
        }];
      }
    }

    if (metrics) {
      data.series = metrics.map((m: string) => ({
        name: m,
        data: [{ x: Date.now(), y: (performanceMetrics as any)[m] }]
      }));
    }

    return data;
  }

  // Get table widget data
  private async getTableWidgetData(widget: DashboardWidget): Promise<any> {
    const { source } = widget.config;

    switch (source) {
      case 'api-connectivity':
        const apiStatus = this.healthMonitor.getAPIConnectivityStatus();
        return {
          headers: ['API', 'Status', 'Response Time', 'Last Check', 'Failures'],
          rows: Array.from(apiStatus.values()).map(status => [
            status.name,
            status.status,
            `${status.responseTime}ms`,
            status.lastCheck.toISOString(),
            status.consecutiveFailures
          ])
        };

      default:
        throw new Error(`Unknown table source: ${source}`);
    }
  }

  // Get alert widget data
  private getAlertWidgetData(widget: DashboardWidget): any {
    const { maxItems = 10 } = widget.config;
    const alerts = this.alertSystem.getAlerts({ 
      resolved: false, 
      limit: maxItems 
    });

    return {
      total: alerts.length,
      critical: alerts.filter(a => a.severity === AlertSeverity.CRITICAL).length,
      error: alerts.filter(a => a.severity === AlertSeverity.ERROR).length,
      warning: alerts.filter(a => a.severity === AlertSeverity.WARNING).length,
      alerts: alerts.map(alert => ({
        id: alert.id,
        title: alert.title,
        message: alert.message,
        severity: alert.severity,
        timestamp: alert.timestamp,
        source: alert.source
      }))
    };
  }

  // Get system overview
  async getSystemOverview(): Promise<SystemOverview> {
    const systemHealth = await this.healthMonitor.getSystemHealth();
    const performanceMetrics = this.metricsCollector.getPerformanceMetrics();
    const activeAlerts = this.alertSystem.getAlerts({ resolved: false, limit: 20 });

    return {
      status: systemHealth.status,
      uptime: systemHealth.uptime,
      version: systemHealth.version || 'unknown',
      environment: systemHealth.environment || 'unknown',
      services: [{
        name: this.serviceName,
        status: systemHealth.status,
        uptime: systemHealth.uptime,
        lastCheck: new Date()
      }],
      alerts: activeAlerts,
      metrics: performanceMetrics,
      timestamp: new Date()
    };
  }

  // Export dashboard configuration
  exportDashboard(id: string): string {
    const dashboard = this.dashboards.get(id);
    if (!dashboard) {
      throw new Error(`Dashboard ${id} not found`);
    }
    return JSON.stringify(dashboard, null, 2);
  }

  // Import dashboard configuration
  importDashboard(configJson: string): void {
    const config = JSON.parse(configJson) as DashboardConfig;
    this.addDashboard(config);
  }
}

// Create default monitoring dashboard for Zerodha services
export const createZerodhaMonitoringDashboard = (
  serviceName: string,
  healthMonitor: HealthMonitor,
  metricsCollector: MetricsCollector,
  alertSystem: AlertSystem
): MonitoringDashboard => {
  return new MonitoringDashboard(serviceName, healthMonitor, metricsCollector, alertSystem);
};

// Export dashboard widget templates
export const WIDGET_TEMPLATES = {
  systemStatus: {
    id: 'system-status',
    title: 'System Status',
    type: WidgetType.STATUS,
    config: { source: 'health' }
  },
  
  errorRate: {
    id: 'error-rate',
    title: 'Error Rate',
    type: WidgetType.METRIC,
    config: {
      metric: 'errorRate',
      threshold: { warning: 0.05, critical: 0.1 }
    }
  },
  
  responseTime: {
    id: 'response-time',
    title: 'Response Time',
    type: WidgetType.CHART,
    config: {
      chartType: 'line',
      metric: 'averageResponseTime',
      timeRange: '1h'
    }
  },
  
  activeAlerts: {
    id: 'active-alerts',
    title: 'Active Alerts',
    type: WidgetType.ALERT,
    config: { maxItems: 5 }
  }
};