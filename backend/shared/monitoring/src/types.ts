export interface HealthCheckResult {
  service: string;
  status: 'healthy' | 'unhealthy' | 'degraded';
  timestamp: Date;
  responseTime: number;
  details?: Record<string, any>;
  error?: string;
}

export interface SystemMetrics {
  cpu: {
    usage: number;
    loadAverage: number[];
    cores: number;
  };
  memory: {
    total: number;
    used: number;
    free: number;
    usage: number;
  };
  disk: {
    total: number;
    used: number;
    free: number;
    usage: number;
  };
  network: {
    bytesReceived: number;
    bytesSent: number;
    packetsReceived: number;
    packetsSent: number;
  };
  processes: {
    total: number;
    running: number;
    sleeping: number;
  };
}

export interface ServiceHealth {
  name: string;
  url: string;
  method: 'GET' | 'POST' | 'HEAD';
  timeout: number;
  interval: number;
  retries: number;
  expectedStatus?: number;
  expectedResponse?: string;
  headers?: Record<string, string>;
}

export interface AlertRule {
  id: string;
  name: string;
  condition: string;
  threshold: number;
  duration: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
  enabled: boolean;
  channels: AlertChannel[];
}

export interface AlertChannel {
  type: 'email' | 'webhook' | 'slack' | 'sms';
  config: Record<string, any>;
}

export interface Alert {
  id: string;
  ruleId: string;
  service: string;
  message: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  timestamp: Date;
  resolved: boolean;
  resolvedAt?: Date;
  metadata?: Record<string, any>;
}

export interface MonitoringConfig {
  healthChecks: ServiceHealth[];
  alertRules: AlertRule[];
  systemMetrics: {
    enabled: boolean;
    interval: number;
    retention: number;
  };
  notifications: {
    email?: {
      smtp: {
        host: string;
        port: number;
        secure: boolean;
        auth: {
          user: string;
          pass: string;
        };
      };
      from: string;
      to: string[];
    };
    webhook?: {
      url: string;
      headers?: Record<string, string>;
    };
    slack?: {
      webhookUrl: string;
      channel: string;
    };
  };
}