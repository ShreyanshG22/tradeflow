import dotenv from 'dotenv';

dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '3006'),
  env: process.env.NODE_ENV || 'development',
  
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    enableFile: process.env.LOG_ENABLE_FILE === 'true',
    enableElasticsearch: process.env.LOG_ENABLE_ELASTICSEARCH === 'true',
    enableFluentd: process.env.LOG_ENABLE_FLUENTD === 'true'
  },

  elasticsearch: {
    node: process.env.ELASTICSEARCH_NODE || 'http://localhost:9200',
    index: process.env.ELASTICSEARCH_INDEX || 'tradeflow-logs',
    username: process.env.ELASTICSEARCH_USERNAME,
    password: process.env.ELASTICSEARCH_PASSWORD
  },

  fluentd: {
    host: process.env.FLUENTD_HOST || 'localhost',
    port: parseInt(process.env.FLUENTD_PORT || '24224'),
    tag: process.env.FLUENTD_TAG || 'tradeflow'
  },

  notifications: {
    email: {
      smtp: {
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port: parseInt(process.env.SMTP_PORT || '587'),
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
          user: process.env.SMTP_USER || '',
          pass: process.env.SMTP_PASS || ''
        }
      },
      from: process.env.EMAIL_FROM || 'noreply@tradeflow.com',
      to: (process.env.EMAIL_TO || '').split(',').filter(email => email.trim())
    },
    webhook: {
      url: process.env.WEBHOOK_URL || ''
    },
    slack: {
      webhookUrl: process.env.SLACK_WEBHOOK_URL || '',
      channel: process.env.SLACK_CHANNEL || '#alerts'
    }
  },

  systemMetrics: {
    enabled: process.env.SYSTEM_METRICS_ENABLED === 'true',
    interval: parseInt(process.env.SYSTEM_METRICS_INTERVAL || '30000'),
    retention: parseInt(process.env.SYSTEM_METRICS_RETENTION || '1000')
  },

  services: {
    userService: process.env.USER_SERVICE_URL || 'http://localhost:3001',
    apiGateway: process.env.API_GATEWAY_URL || 'http://localhost:3000',
    strategyService: process.env.STRATEGY_SERVICE_URL || 'http://localhost:3003',
    portfolioService: process.env.PORTFOLIO_SERVICE_URL || 'http://localhost:3004',
    marketDataService: process.env.MARKET_DATA_SERVICE_URL || 'http://localhost:3002'
  },

  databases: {
    postgres: process.env.POSTGRES_URL || 'postgres://user:password@localhost:5432/tradeflow',
    redis: process.env.REDIS_URL || 'redis://localhost:6379'
  }
};