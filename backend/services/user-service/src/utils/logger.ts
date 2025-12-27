import { CentralizedLogger, createLogConfig } from '@tradeflow/logging';
import { config } from '../config/config';

const logConfig = createLogConfig('user-service', {
  enableFile: config.env === 'production',
  enableElasticsearch: config.env === 'production',
  enableFluentd: config.env === 'production',
  fileConfig: {
    directory: './logs',
    maxSize: '20m',
    maxFiles: 14,
    datePattern: 'YYYY-MM-DD'
  }
});

export const logger = new CentralizedLogger(logConfig);