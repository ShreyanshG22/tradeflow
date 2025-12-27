export interface LogConfig {
  level: string;
  service: string;
  environment: string;
  enableConsole: boolean;
  enableFile: boolean;
  enableElasticsearch: boolean;
  enableFluentd: boolean;
  fileConfig?: {
    directory: string;
    maxSize: string;
    maxFiles: number;
    datePattern: string;
  };
  elasticsearchConfig?: {
    node: string;
    index: string;
    username?: string;
    password?: string;
  };
  fluentdConfig?: {
    host: string;
    port: number;
    tag: string;
    timeout: number;
  };
}

export interface LogMetadata {
  service: string;
  environment: string;
  version?: string;
  requestId?: string;
  userId?: string;
  sessionId?: string;
  traceId?: string;
  spanId?: string;
  [key: string]: any;
}

export interface PerformanceMetrics {
  operation: string;
  duration: number;
  timestamp: Date;
  success: boolean;
  metadata?: Record<string, any>;
}

export interface SecurityEvent {
  type: 'authentication' | 'authorization' | 'suspicious_activity' | 'data_access';
  severity: 'low' | 'medium' | 'high' | 'critical';
  userId?: string;
  ipAddress?: string;
  userAgent?: string;
  details: Record<string, any>;
}

export interface BusinessEvent {
  type: string;
  entity: string;
  entityId: string;
  action: string;
  userId?: string;
  metadata?: Record<string, any>;
}