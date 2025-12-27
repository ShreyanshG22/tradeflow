import { MonitoringConfig } from '@tradeflow/monitoring';
import { config } from './config';

export const monitoringConfig: MonitoringConfig = {
  healthChecks: [
    {
      name: 'user-service',
      url: `${config.services.userService}/health`,
      method: 'GET',
      timeout: 5000,
      interval: 30000,
      retries: 3,
      expectedStatus: 200,
      expectedResponse: 'healthy'
    },
    {
      name: 'api-gateway',
      url: `${config.services.apiGateway}/health`,
      method: 'GET',
      timeout: 5000,
      interval: 30000,
      retries: 3,
      expectedStatus: 200
    },
    {
      name: 'strategy-service',
      url: `${config.services.strategyService}/health`,
      method: 'GET',
      timeout: 5000,
      interval: 30000,
      retries: 3,
      expectedStatus: 200
    },
    {
      name: 'portfolio-service',
      url: `${config.services.portfolioService}/health`,
      method: 'GET',
      timeout: 5000,
      interval: 30000,
      retries: 3,
      expectedStatus: 200
    },
    {
      name: 'market-data-service',
      url: `${config.services.marketDataService}/health`,
      method: 'GET',
      timeout: 5000,
      interval: 30000,
      retries: 3,
      expectedStatus: 200
    },
    {
      name: 'postgres-database',
      url: config.databases.postgres,
      method: 'GET',
      timeout: 10000,
      interval: 60000,
      retries: 2
    },
    {
      name: 'redis-cache',
      url: config.databases.redis,
      method: 'GET',
      timeout: 5000,
      interval: 30000,
      retries: 2
    }
  ],

  alertRules: [
    {
      id: 'high-cpu-usage',
      name: 'High CPU Usage',
      condition: 'cpu_usage > threshold',
      threshold: 80,
      duration: 300000, // 5 minutes
      severity: 'high',
      enabled: true,
      channels: [
        {
          type: 'email',
          config: {}
        }
      ]
    },
    {
      id: 'high-memory-usage',
      name: 'High Memory Usage',
      condition: 'memory_usage > threshold',
      threshold: 85,
      duration: 300000,
      severity: 'high',
      enabled: true,
      channels: [
        {
          type: 'email',
          config: {}
        }
      ]
    },
    {
      id: 'high-disk-usage',
      name: 'High Disk Usage',
      condition: 'disk_usage > threshold',
      threshold: 90,
      duration: 600000, // 10 minutes
      severity: 'critical',
      enabled: true,
      channels: [
        {
          type: 'email',
          config: {}
        },
        {
          type: 'slack',
          config: {}
        }
      ]
    },
    {
      id: 'service-down',
      name: 'Service Down',
      condition: 'service_health == unhealthy',
      threshold: 1,
      duration: 60000, // 1 minute
      severity: 'critical',
      enabled: true,
      channels: [
        {
          type: 'email',
          config: {}
        },
        {
          type: 'slack',
          config: {}
        }
      ]
    },
    {
      id: 'service-degraded',
      name: 'Service Degraded',
      condition: 'service_health == degraded',
      threshold: 1,
      duration: 180000, // 3 minutes
      severity: 'medium',
      enabled: true,
      channels: [
        {
          type: 'email',
          config: {}
        }
      ]
    },
    {
      id: 'high-load-average',
      name: 'High Load Average',
      condition: 'load_average > threshold',
      threshold: 5.0,
      duration: 300000,
      severity: 'medium',
      enabled: true,
      channels: [
        {
          type: 'email',
          config: {}
        }
      ]
    }
  ],

  systemMetrics: {
    enabled: config.systemMetrics.enabled,
    interval: config.systemMetrics.interval,
    retention: config.systemMetrics.retention
  },

  notifications: {
    email: config.notifications.email.smtp.user ? {
      smtp: config.notifications.email.smtp,
      from: config.notifications.email.from,
      to: config.notifications.email.to
    } : undefined,
    
    webhook: config.notifications.webhook.url ? {
      url: config.notifications.webhook.url
    } : undefined,
    
    slack: config.notifications.slack.webhookUrl ? {
      webhookUrl: config.notifications.slack.webhookUrl,
      channel: config.notifications.slack.channel
    } : undefined
  }
};