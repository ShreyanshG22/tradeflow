import { LogConfig } from './types';

export function createLogConfig(serviceName: string, overrides: Partial<LogConfig> = {}): LogConfig {
  const defaultConfig: LogConfig = {
    level: process.env.LOG_LEVEL || 'info',
    service: serviceName,
    environment: process.env.NODE_ENV || 'development',
    enableConsole: process.env.LOG_ENABLE_CONSOLE !== 'false',
    enableFile: process.env.LOG_ENABLE_FILE === 'true',
    enableElasticsearch: process.env.LOG_ENABLE_ELASTICSEARCH === 'true',
    enableFluentd: process.env.LOG_ENABLE_FLUENTD === 'true',
    fileConfig: {
      directory: process.env.LOG_FILE_DIRECTORY || './logs',
      maxSize: process.env.LOG_FILE_MAX_SIZE || '20m',
      maxFiles: parseInt(process.env.LOG_FILE_MAX_FILES || '14'),
      datePattern: process.env.LOG_FILE_DATE_PATTERN || 'YYYY-MM-DD'
    },
    elasticsearchConfig: process.env.ELASTICSEARCH_NODE ? {
      node: process.env.ELASTICSEARCH_NODE,
      index: process.env.ELASTICSEARCH_INDEX || 'tradeflow-logs',
      username: process.env.ELASTICSEARCH_USERNAME,
      password: process.env.ELASTICSEARCH_PASSWORD
    } : undefined,
    fluentdConfig: process.env.FLUENTD_HOST ? {
      host: process.env.FLUENTD_HOST,
      port: parseInt(process.env.FLUENTD_PORT || '24224'),
      tag: process.env.FLUENTD_TAG || 'tradeflow',
      timeout: parseInt(process.env.FLUENTD_TIMEOUT || '3000')
    } : undefined
  };

  return { ...defaultConfig, ...overrides };
}

export const LOG_LEVELS = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  verbose: 4,
  debug: 5,
  silly: 6
} as const;