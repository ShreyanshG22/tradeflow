import nodemailer from 'nodemailer';
import axios from 'axios';
import { CentralizedLogger } from '@tradeflow/logging';
import { Alert, AlertRule, AlertChannel, HealthCheckResult, SystemMetrics, MonitoringConfig } from './types';

export class AlertManager {
  private logger: CentralizedLogger;
  private config: MonitoringConfig;
  private activeAlerts: Map<string, Alert> = new Map();
  private alertHistory: Alert[] = [];
  private emailTransporter?: nodemailer.Transporter;

  constructor(logger: CentralizedLogger, config: MonitoringConfig) {
    this.logger = logger;
    this.config = config;
    this.setupEmailTransporter();
  }

  private setupEmailTransporter(): void {
    if (this.config.notifications.email) {
      this.emailTransporter = nodemailer.createTransporter(
        this.config.notifications.email.smtp
      );
    }
  }

  async evaluateHealthChecks(results: HealthCheckResult[]): Promise<void> {
    for (const result of results) {
      await this.evaluateServiceHealth(result);
    }
  }

  async evaluateSystemMetrics(metrics: SystemMetrics): Promise<void> {
    const rules = this.config.alertRules.filter(rule => rule.enabled);
    
    for (const rule of rules) {
      const shouldAlert = this.evaluateRule(rule, metrics);
      
      if (shouldAlert) {
        await this.triggerAlert(rule, 'system', {
          metrics,
          condition: rule.condition,
          threshold: rule.threshold
        });
      } else {
        // Check if we should resolve an existing alert
        const alertKey = `${rule.id}-system`;
        const existingAlert = this.activeAlerts.get(alertKey);
        
        if (existingAlert && !existingAlert.resolved) {
          await this.resolveAlert(existingAlert.id);
        }
      }
    }
  }

  private async evaluateServiceHealth(result: HealthCheckResult): Promise<void> {
    const rules = this.config.alertRules.filter(rule => 
      rule.enabled && rule.condition.includes('service_health')
    );

    for (const rule of rules) {
      const shouldAlert = result.status === 'unhealthy' || 
        (result.status === 'degraded' && rule.condition.includes('degraded'));
      
      if (shouldAlert) {
        await this.triggerAlert(rule, result.service, {
          healthCheck: result,
          condition: rule.condition
        });
      } else {
        // Resolve alert if service is healthy
        const alertKey = `${rule.id}-${result.service}`;
        const existingAlert = this.activeAlerts.get(alertKey);
        
        if (existingAlert && !existingAlert.resolved) {
          await this.resolveAlert(existingAlert.id);
        }
      }
    }
  }

  private evaluateRule(rule: AlertRule, metrics: SystemMetrics): boolean {
    try {
      // Simple rule evaluation - in production, you might want a more sophisticated rule engine
      const condition = rule.condition.toLowerCase();
      
      if (condition.includes('cpu_usage')) {
        return metrics.cpu.usage > rule.threshold;
      }
      
      if (condition.includes('memory_usage')) {
        return metrics.memory.usage > rule.threshold;
      }
      
      if (condition.includes('disk_usage')) {
        return metrics.disk.usage > rule.threshold;
      }
      
      if (condition.includes('load_average')) {
        return metrics.cpu.loadAverage[0] > rule.threshold;
      }
      
      return false;
    } catch (error) {
      this.logger.error(`Failed to evaluate rule ${rule.id}`, error as Error);
      return false;
    }
  }

  private async triggerAlert(rule: AlertRule, service: string, metadata: any): Promise<void> {
    const alertKey = `${rule.id}-${service}`;
    const existingAlert = this.activeAlerts.get(alertKey);
    
    // Don't trigger duplicate alerts
    if (existingAlert && !existingAlert.resolved) {
      return;
    }

    const alert: Alert = {
      id: `alert-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      ruleId: rule.id,
      service,
      message: `${rule.name}: ${service}`,
      severity: rule.severity,
      timestamp: new Date(),
      resolved: false,
      metadata
    };

    this.activeAlerts.set(alertKey, alert);
    this.alertHistory.push(alert);

    this.logger.logSecurity({
      type: 'suspicious_activity',
      severity: rule.severity === 'critical' ? 'critical' : 'high',
      details: {
        alertId: alert.id,
        rule: rule.name,
        service,
        condition: rule.condition,
        threshold: rule.threshold,
        metadata
      }
    });

    // Send notifications
    await this.sendNotifications(alert, rule.channels);
  }

  private async resolveAlert(alertId: string): Promise<void> {
    // Find the alert in active alerts
    for (const [key, alert] of this.activeAlerts.entries()) {
      if (alert.id === alertId) {
        alert.resolved = true;
        alert.resolvedAt = new Date();
        
        this.logger.info(`Alert resolved: ${alert.message}`, {
          alertId: alert.id,
          service: alert.service,
          duration: alert.resolvedAt.getTime() - alert.timestamp.getTime()
        });

        // Remove from active alerts
        this.activeAlerts.delete(key);
        break;
      }
    }
  }

  private async sendNotifications(alert: Alert, channels: AlertChannel[]): Promise<void> {
    const notifications = channels.map(channel => 
      this.sendNotification(alert, channel).catch(error => {
        this.logger.error(`Failed to send ${channel.type} notification`, error as Error, {
          alertId: alert.id,
          channel: channel.type
        });
      })
    );

    await Promise.allSettled(notifications);
  }

  private async sendNotification(alert: Alert, channel: AlertChannel): Promise<void> {
    switch (channel.type) {
      case 'email':
        await this.sendEmailNotification(alert, channel.config);
        break;
      case 'webhook':
        await this.sendWebhookNotification(alert, channel.config);
        break;
      case 'slack':
        await this.sendSlackNotification(alert, channel.config);
        break;
      default:
        this.logger.warn(`Unsupported notification channel: ${channel.type}`);
    }
  }

  private async sendEmailNotification(alert: Alert, config: any): Promise<void> {
    if (!this.emailTransporter || !this.config.notifications.email) {
      throw new Error('Email transporter not configured');
    }

    const subject = `[${alert.severity.toUpperCase()}] TradeFlow Alert: ${alert.message}`;
    const html = this.generateEmailTemplate(alert);

    await this.emailTransporter.sendMail({
      from: this.config.notifications.email.from,
      to: this.config.notifications.email.to,
      subject,
      html
    });

    this.logger.info('Email notification sent', {
      alertId: alert.id,
      recipients: this.config.notifications.email.to
    });
  }

  private async sendWebhookNotification(alert: Alert, config: any): Promise<void> {
    const payload = {
      alert: {
        id: alert.id,
        service: alert.service,
        message: alert.message,
        severity: alert.severity,
        timestamp: alert.timestamp.toISOString(),
        metadata: alert.metadata
      }
    };

    await axios.post(config.url, payload, {
      headers: {
        'Content-Type': 'application/json',
        ...config.headers
      },
      timeout: 10000
    });

    this.logger.info('Webhook notification sent', {
      alertId: alert.id,
      url: config.url
    });
  }

  private async sendSlackNotification(alert: Alert, config: any): Promise<void> {
    const color = this.getSeverityColor(alert.severity);
    const payload = {
      channel: config.channel,
      attachments: [{
        color,
        title: `TradeFlow Alert: ${alert.message}`,
        fields: [
          {
            title: 'Service',
            value: alert.service,
            short: true
          },
          {
            title: 'Severity',
            value: alert.severity.toUpperCase(),
            short: true
          },
          {
            title: 'Time',
            value: alert.timestamp.toISOString(),
            short: true
          }
        ],
        footer: 'TradeFlow Monitoring',
        ts: Math.floor(alert.timestamp.getTime() / 1000)
      }]
    };

    await axios.post(config.webhookUrl, payload, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 10000
    });

    this.logger.info('Slack notification sent', {
      alertId: alert.id,
      channel: config.channel
    });
  }

  private generateEmailTemplate(alert: Alert): string {
    return `
      <html>
        <body style="font-family: Arial, sans-serif; margin: 0; padding: 20px;">
          <div style="max-width: 600px; margin: 0 auto;">
            <h2 style="color: ${this.getSeverityColor(alert.severity)};">
              TradeFlow Alert: ${alert.message}
            </h2>
            
            <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
              <tr>
                <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">Service:</td>
                <td style="padding: 10px; border: 1px solid #ddd;">${alert.service}</td>
              </tr>
              <tr>
                <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">Severity:</td>
                <td style="padding: 10px; border: 1px solid #ddd;">${alert.severity.toUpperCase()}</td>
              </tr>
              <tr>
                <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">Time:</td>
                <td style="padding: 10px; border: 1px solid #ddd;">${alert.timestamp.toISOString()}</td>
              </tr>
              <tr>
                <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">Alert ID:</td>
                <td style="padding: 10px; border: 1px solid #ddd;">${alert.id}</td>
              </tr>
            </table>
            
            ${alert.metadata ? `
              <h3>Additional Details:</h3>
              <pre style="background: #f5f5f5; padding: 15px; border-radius: 5px; overflow-x: auto;">
${JSON.stringify(alert.metadata, null, 2)}
              </pre>
            ` : ''}
            
            <p style="margin-top: 30px; color: #666;">
              This alert was generated by TradeFlow monitoring system.
            </p>
          </div>
        </body>
      </html>
    `;
  }

  private getSeverityColor(severity: string): string {
    switch (severity) {
      case 'critical': return '#dc3545';
      case 'high': return '#fd7e14';
      case 'medium': return '#ffc107';
      case 'low': return '#28a745';
      default: return '#6c757d';
    }
  }

  getActiveAlerts(): Alert[] {
    return Array.from(this.activeAlerts.values());
  }

  getAlertHistory(limit?: number): Alert[] {
    if (limit) {
      return this.alertHistory.slice(-limit);
    }
    return [...this.alertHistory];
  }

  async resolveAlertById(alertId: string): Promise<boolean> {
    await this.resolveAlert(alertId);
    return true;
  }

  clearAlertHistory(): void {
    this.alertHistory = [];
  }
}