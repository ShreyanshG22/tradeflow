import { createLogger } from './logger';
import { HealthStatus, HealthCheckResult, SystemHealth } from './health-monitor';
import { ErrorCategory, ErrorSeverity } from './error-handler';

const logger = createLogger('alert-system');

// Alert severity levels
export enum AlertSeverity {
  INFO = 'INFO',
  WARNING = 'WARNING',
  ERROR = 'ERROR',
  CRITICAL = 'CRITICAL'
}

// Alert types
export enum AlertType {
  HEALTH_CHECK_FAILED = 'HEALTH_CHECK_FAILED',
  SYSTEM_DEGRADED = 'SYSTEM_DEGRADED',
  SYSTEM_UNHEALTHY = 'SYSTEM_UNHEALTHY',
  SYSTEM_CRITICAL = 'SYSTEM_CRITICAL',
  API_CONNECTIVITY_LOST = 'API_CONNECTIVITY_LOST',
  HIGH_ERROR_RATE = 'HIGH_ERROR_RATE',
  HIGH_RESPONSE_TIME = 'HIGH_RESPONSE_TIME',
  CIRCUIT_BREAKER_OPEN = 'CIRCUIT_BREAKER_OPEN',
  MEMORY_HIGH = 'MEMORY_HIGH',
  CUSTOM = 'CUSTOM'
}

// Alert interface
export interface Alert {
  id: string;
  type: AlertType;
  severity: AlertSeverity;
  title: string;
  message: string;
  timestamp: Date;
  source: string;
  metadata?: Record<string, any>;
  resolved?: boolean;
  resolvedAt?: Date;
  acknowledgedBy?: string;
  acknowledgedAt?: Date;
}

// Alert rule configuration
export interface AlertRule {
  id: string;
  name: string;
  type: AlertType;
  enabled: boolean;
  conditions: AlertCondition[];
  severity: AlertSeverity;
  cooldownPeriod: number; // Minimum time between alerts of same type (ms)
  channels: AlertChannel[];
}

// Alert condition
export interface AlertCondition {
  field: string;
  operator: 'gt' | 'lt' | 'eq' | 'ne' | 'gte' | 'lte' | 'contains';
  value: any;
  duration?: number; // How long condition must be true (ms)
}

// Alert channel types
export enum AlertChannelType {
  LOG = 'LOG',
  EMAIL = 'EMAIL',
  SLACK = 'SLACK',
  WEBHOOK = 'WEBHOOK',
  SMS = 'SMS'
}

// Alert channel configuration
export interface AlertChannel {
  type: AlertChannelType;
  enabled: boolean;
  config: Record<string, any>;
}

// Alert handler interface
export interface AlertHandler {
  send(alert: Alert, channel: AlertChannel): Promise<void>;
}

// Alert system class
export class AlertSystem {
  private alerts: Map<string, Alert> = new Map();
  private rules: Map<string, AlertRule> = new Map();
  private handlers: Map<AlertChannelType, AlertHandler> = new Map();
  private lastAlertTime: Map<string, Date> = new Map();
  private serviceName: string;

  constructor(serviceName: string) {
    this.serviceName = serviceName;
    this.setupDefaultHandlers();
  }

  // Setup default alert handlers
  private setupDefaultHandlers(): void {
    // Log handler (always available)
    this.handlers.set(AlertChannelType.LOG, new LogAlertHandler());
  }

  // Register alert handler
  registerHandler(type: AlertChannelType, handler: AlertHandler): void {
    this.handlers.set(type, handler);
    logger.info('Alert handler registered', {
      service: this.serviceName,
      type
    });
  }

  // Add alert rule
  addRule(rule: AlertRule): void {
    this.rules.set(rule.id, rule);
    logger.info('Alert rule added', {
      service: this.serviceName,
      ruleId: rule.id,
      ruleName: rule.name
    });
  }

  // Remove alert rule
  removeRule(ruleId: string): void {
    this.rules.delete(ruleId);
    logger.info('Alert rule removed', {
      service: this.serviceName,
      ruleId
    });
  }

  // Create and send alert
  async createAlert(
    type: AlertType,
    title: string,
    message: string,
    severity: AlertSeverity = AlertSeverity.WARNING,
    metadata?: Record<string, any>
  ): Promise<Alert> {
    const alertId = this.generateAlertId();
    
    const alert: Alert = {
      id: alertId,
      type,
      severity,
      title,
      message,
      timestamp: new Date(),
      source: this.serviceName,
      metadata,
      resolved: false
    };

    // Check cooldown period
    const lastAlertKey = `${type}_${this.serviceName}`;
    const lastAlert = this.lastAlertTime.get(lastAlertKey);
    const cooldownPeriod = this.getCooldownPeriod(type);
    
    if (lastAlert && Date.now() - lastAlert.getTime() < cooldownPeriod) {
      logger.debug('Alert suppressed due to cooldown period', {
        service: this.serviceName,
        type,
        cooldownPeriod
      });
      return alert;
    }

    // Store alert
    this.alerts.set(alertId, alert);
    this.lastAlertTime.set(lastAlertKey, alert.timestamp);

    // Send alert through configured channels
    await this.sendAlert(alert);

    logger.info('Alert created and sent', {
      service: this.serviceName,
      alertId,
      type,
      severity,
      title
    });

    return alert;
  }

  // Send alert through configured channels
  private async sendAlert(alert: Alert): Promise<void> {
    const rule = Array.from(this.rules.values()).find(r => r.type === alert.type && r.enabled);
    
    if (!rule) {
      // Use default log channel if no rule configured
      const logHandler = this.handlers.get(AlertChannelType.LOG);
      if (logHandler) {
        await logHandler.send(alert, { type: AlertChannelType.LOG, enabled: true, config: {} });
      }
      return;
    }

    // Send through all configured channels
    for (const channel of rule.channels) {
      if (!channel.enabled) continue;

      const handler = this.handlers.get(channel.type);
      if (!handler) {
        logger.warn('No handler found for alert channel', {
          service: this.serviceName,
          channelType: channel.type,
          alertId: alert.id
        });
        continue;
      }

      try {
        await handler.send(alert, channel);
      } catch (error) {
        logger.error('Failed to send alert through channel', {
          service: this.serviceName,
          channelType: channel.type,
          alertId: alert.id,
          error: error.message
        });
      }
    }
  }

  // Process health check results and create alerts
  async processHealthResults(systemHealth: SystemHealth): Promise<void> {
    // System-level alerts
    if (systemHealth.status === HealthStatus.CRITICAL) {
      await this.createAlert(
        AlertType.SYSTEM_CRITICAL,
        'System Critical',
        'System health is critical - immediate attention required',
        AlertSeverity.CRITICAL,
        { systemHealth }
      );
    } else if (systemHealth.status === HealthStatus.UNHEALTHY) {
      await this.createAlert(
        AlertType.SYSTEM_UNHEALTHY,
        'System Unhealthy',
        'System health is unhealthy - investigation required',
        AlertSeverity.ERROR,
        { systemHealth }
      );
    } else if (systemHealth.status === HealthStatus.DEGRADED) {
      await this.createAlert(
        AlertType.SYSTEM_DEGRADED,
        'System Degraded',
        'System performance is degraded',
        AlertSeverity.WARNING,
        { systemHealth }
      );
    }

    // Individual health check alerts
    for (const check of systemHealth.checks) {
      if (check.status === HealthStatus.CRITICAL || check.status === HealthStatus.UNHEALTHY) {
        await this.createAlert(
          AlertType.HEALTH_CHECK_FAILED,
          `Health Check Failed: ${check.name}`,
          check.message,
          check.status === HealthStatus.CRITICAL ? AlertSeverity.CRITICAL : AlertSeverity.ERROR,
          { healthCheck: check }
        );
      }
    }
  }

  // Resolve alert
  async resolveAlert(alertId: string, resolvedBy?: string): Promise<void> {
    const alert = this.alerts.get(alertId);
    if (!alert) {
      throw new Error(`Alert ${alertId} not found`);
    }

    alert.resolved = true;
    alert.resolvedAt = new Date();
    if (resolvedBy) {
      alert.acknowledgedBy = resolvedBy;
      alert.acknowledgedAt = new Date();
    }

    logger.info('Alert resolved', {
      service: this.serviceName,
      alertId,
      resolvedBy
    });
  }

  // Acknowledge alert
  async acknowledgeAlert(alertId: string, acknowledgedBy: string): Promise<void> {
    const alert = this.alerts.get(alertId);
    if (!alert) {
      throw new Error(`Alert ${alertId} not found`);
    }

    alert.acknowledgedBy = acknowledgedBy;
    alert.acknowledgedAt = new Date();

    logger.info('Alert acknowledged', {
      service: this.serviceName,
      alertId,
      acknowledgedBy
    });
  }

  // Get alerts
  getAlerts(filters?: {
    type?: AlertType;
    severity?: AlertSeverity;
    resolved?: boolean;
    limit?: number;
  }): Alert[] {
    let alerts = Array.from(this.alerts.values());

    if (filters) {
      if (filters.type) {
        alerts = alerts.filter(a => a.type === filters.type);
      }
      if (filters.severity) {
        alerts = alerts.filter(a => a.severity === filters.severity);
      }
      if (filters.resolved !== undefined) {
        alerts = alerts.filter(a => a.resolved === filters.resolved);
      }
      if (filters.limit) {
        alerts = alerts.slice(0, filters.limit);
      }
    }

    return alerts.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  // Get cooldown period for alert type
  private getCooldownPeriod(type: AlertType): number {
    const rule = Array.from(this.rules.values()).find(r => r.type === type);
    return rule?.cooldownPeriod || 300000; // Default 5 minutes
  }

  // Generate unique alert ID
  private generateAlertId(): string {
    return `ALERT_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Cleanup old alerts
  cleanupOldAlerts(maxAge: number = 7 * 24 * 60 * 60 * 1000): void {
    const cutoff = new Date(Date.now() - maxAge);
    let cleaned = 0;

    for (const [id, alert] of this.alerts) {
      if (alert.timestamp < cutoff && alert.resolved) {
        this.alerts.delete(id);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.info('Cleaned up old alerts', {
        service: this.serviceName,
        cleaned,
        cutoff
      });
    }
  }
}

// Default log alert handler
class LogAlertHandler implements AlertHandler {
  async send(alert: Alert, channel: AlertChannel): Promise<void> {
    const logLevel = this.getLogLevel(alert.severity);
    const logMessage = `ALERT [${alert.severity}] ${alert.title}: ${alert.message}`;
    
    logger.log(logLevel, logMessage, {
      alertId: alert.id,
      type: alert.type,
      severity: alert.severity,
      source: alert.source,
      timestamp: alert.timestamp,
      metadata: alert.metadata
    });
  }

  private getLogLevel(severity: AlertSeverity): string {
    switch (severity) {
      case AlertSeverity.CRITICAL:
        return 'error';
      case AlertSeverity.ERROR:
        return 'error';
      case AlertSeverity.WARNING:
        return 'warn';
      case AlertSeverity.INFO:
        return 'info';
      default:
        return 'info';
    }
  }
}

// Webhook alert handler
export class WebhookAlertHandler implements AlertHandler {
  constructor(private webhookUrl: string) {}

  async send(alert: Alert, channel: AlertChannel): Promise<void> {
    const payload = {
      alert,
      timestamp: new Date().toISOString(),
      service: alert.source
    };

    // In real implementation, use HTTP client to send webhook
    logger.info('Webhook alert sent', {
      webhookUrl: this.webhookUrl,
      alertId: alert.id,
      payload
    });
  }
}

// Email alert handler (placeholder)
export class EmailAlertHandler implements AlertHandler {
  constructor(private emailConfig: any) {}

  async send(alert: Alert, channel: AlertChannel): Promise<void> {
    // In real implementation, use email service
    logger.info('Email alert sent', {
      alertId: alert.id,
      to: channel.config.recipients,
      subject: alert.title
    });
  }
}

// Create default alert rules for Zerodha services
export const createDefaultAlertRules = (): AlertRule[] => {
  return [
    {
      id: 'system-critical',
      name: 'System Critical Alert',
      type: AlertType.SYSTEM_CRITICAL,
      enabled: true,
      conditions: [],
      severity: AlertSeverity.CRITICAL,
      cooldownPeriod: 300000, // 5 minutes
      channels: [{ type: AlertChannelType.LOG, enabled: true, config: {} }]
    },
    {
      id: 'api-connectivity-lost',
      name: 'API Connectivity Lost',
      type: AlertType.API_CONNECTIVITY_LOST,
      enabled: true,
      conditions: [],
      severity: AlertSeverity.ERROR,
      cooldownPeriod: 600000, // 10 minutes
      channels: [{ type: AlertChannelType.LOG, enabled: true, config: {} }]
    },
    {
      id: 'high-error-rate',
      name: 'High Error Rate',
      type: AlertType.HIGH_ERROR_RATE,
      enabled: true,
      conditions: [],
      severity: AlertSeverity.WARNING,
      cooldownPeriod: 900000, // 15 minutes
      channels: [{ type: AlertChannelType.LOG, enabled: true, config: {} }]
    }
  ];
};

// Export singleton instance
export const globalAlertSystem = new AlertSystem('global');