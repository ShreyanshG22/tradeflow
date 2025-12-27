import { createLogger } from './logger';
import { HealthStatus } from './health-monitor';
import { AlertSystem, AlertType, AlertSeverity } from './alert-system';

const logger = createLogger('metrics-collector');

// Metric types
export enum MetricType {
  COUNTER = 'COUNTER',
  GAUGE = 'GAUGE',
  HISTOGRAM = 'HISTOGRAM',
  SUMMARY = 'SUMMARY'
}

// Metric data point
export interface MetricDataPoint {
  name: string;
  type: MetricType;
  value: number;
  timestamp: Date;
  labels?: Record<string, string>;
}

// Histogram bucket
export interface HistogramBucket {
  le: number; // Less than or equal to
  count: number;
}

// Histogram metric
export interface HistogramMetric {
  name: string;
  buckets: HistogramBucket[];
  sum: number;
  count: number;
  timestamp: Date;
  labels?: Record<string, string>;
}

// Summary quantile
export interface SummaryQuantile {
  quantile: number;
  value: number;
}

// Summary metric
export interface SummaryMetric {
  name: string;
  quantiles: SummaryQuantile[];
  sum: number;
  count: number;
  timestamp: Date;
  labels?: Record<string, string>;
}

// Performance metrics
export interface PerformanceMetrics {
  // Request metrics
  requestsTotal: number;
  requestsPerSecond: number;
  requestDuration: HistogramMetric;
  
  // Error metrics
  errorsTotal: number;
  errorRate: number;
  errorsByCategory: Map<string, number>;
  
  // API metrics
  apiCallsTotal: number;
  apiCallDuration: HistogramMetric;
  apiErrorsTotal: number;
  
  // System metrics
  memoryUsage: number;
  cpuUsage: number;
  
  // Business metrics
  ordersPlaced: number;
  ordersExecuted: number;
  orderExecutionTime: HistogramMetric;
  
  // WebSocket metrics
  wsConnectionsActive: number;
  wsMessagesReceived: number;
  wsMessagesSent: number;
  
  timestamp: Date;
}

// Metrics collector class
export class MetricsCollector {
  private metrics: Map<string, MetricDataPoint> = new Map();
  private histograms: Map<string, HistogramMetric> = new Map();
  private summaries: Map<string, SummaryMetric> = new Map();
  private counters: Map<string, number> = new Map();
  private gauges: Map<string, number> = new Map();
  private startTime: Date = new Date();
  private alertSystem?: AlertSystem;

  constructor(private serviceName: string, alertSystem?: AlertSystem) {
    this.alertSystem = alertSystem;
    this.initializeDefaultMetrics();
  }

  // Initialize default metrics
  private initializeDefaultMetrics(): void {
    // Request duration histogram with default buckets
    this.createHistogram('http_request_duration_seconds', [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]);
    
    // API call duration histogram
    this.createHistogram('api_call_duration_seconds', [0.1, 0.25, 0.5, 1, 2, 5, 10, 30]);
    
    // Order execution time histogram
    this.createHistogram('order_execution_duration_seconds', [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2]);
    
    // Initialize counters
    this.setCounter('requests_total', 0);
    this.setCounter('errors_total', 0);
    this.setCounter('api_calls_total', 0);
    this.setCounter('api_errors_total', 0);
    this.setCounter('orders_placed_total', 0);
    this.setCounter('orders_executed_total', 0);
    this.setCounter('ws_messages_received_total', 0);
    this.setCounter('ws_messages_sent_total', 0);
    
    // Initialize gauges
    this.setGauge('ws_connections_active', 0);
    this.setGauge('memory_usage_bytes', 0);
    this.setGauge('cpu_usage_percent', 0);
  }

  // Increment counter
  incrementCounter(name: string, value: number = 1, labels?: Record<string, string>): void {
    const current = this.counters.get(name) || 0;
    this.counters.set(name, current + value);
    
    this.recordMetric({
      name,
      type: MetricType.COUNTER,
      value: current + value,
      timestamp: new Date(),
      labels
    });
  }

  // Set counter value
  setCounter(name: string, value: number, labels?: Record<string, string>): void {
    this.counters.set(name, value);
    
    this.recordMetric({
      name,
      type: MetricType.COUNTER,
      value,
      timestamp: new Date(),
      labels
    });
  }

  // Set gauge value
  setGauge(name: string, value: number, labels?: Record<string, string>): void {
    this.gauges.set(name, value);
    
    this.recordMetric({
      name,
      type: MetricType.GAUGE,
      value,
      timestamp: new Date(),
      labels
    });
  }

  // Create histogram
  createHistogram(name: string, buckets: number[], labels?: Record<string, string>): void {
    const histogram: HistogramMetric = {
      name,
      buckets: buckets.map(le => ({ le, count: 0 })),
      sum: 0,
      count: 0,
      timestamp: new Date(),
      labels
    };
    
    this.histograms.set(name, histogram);
  }

  // Observe histogram value
  observeHistogram(name: string, value: number, labels?: Record<string, string>): void {
    const histogram = this.histograms.get(name);
    if (!histogram) {
      logger.warn('Histogram not found', { name, service: this.serviceName });
      return;
    }

    // Update buckets
    histogram.buckets.forEach(bucket => {
      if (value <= bucket.le) {
        bucket.count++;
      }
    });

    // Update sum and count
    histogram.sum += value;
    histogram.count++;
    histogram.timestamp = new Date();
    
    if (labels) {
      histogram.labels = { ...histogram.labels, ...labels };
    }
  }

  // Record HTTP request
  recordHTTPRequest(method: string, path: string, statusCode: number, duration: number): void {
    const labels = { method, path, status: statusCode.toString() };
    
    this.incrementCounter('requests_total', 1, labels);
    this.observeHistogram('http_request_duration_seconds', duration / 1000, labels);
    
    if (statusCode >= 400) {
      this.incrementCounter('errors_total', 1, labels);
      
      // Check error rate and alert if high
      this.checkErrorRate();
    }
  }

  // Record API call
  recordAPICall(endpoint: string, method: string, duration: number, success: boolean): void {
    const labels = { endpoint, method, success: success.toString() };
    
    this.incrementCounter('api_calls_total', 1, labels);
    this.observeHistogram('api_call_duration_seconds', duration / 1000, labels);
    
    if (!success) {
      this.incrementCounter('api_errors_total', 1, labels);
    }
  }

  // Record order operation
  recordOrderOperation(operation: string, duration: number, success: boolean): void {
    const labels = { operation, success: success.toString() };
    
    if (operation === 'place') {
      this.incrementCounter('orders_placed_total', 1, labels);
    } else if (operation === 'execute') {
      this.incrementCounter('orders_executed_total', 1, labels);
    }
    
    this.observeHistogram('order_execution_duration_seconds', duration / 1000, labels);
  }

  // Record WebSocket metrics
  recordWebSocketMessage(direction: 'sent' | 'received', messageType?: string): void {
    const labels = messageType ? { type: messageType } : undefined;
    
    if (direction === 'sent') {
      this.incrementCounter('ws_messages_sent_total', 1, labels);
    } else {
      this.incrementCounter('ws_messages_received_total', 1, labels);
    }
  }

  // Update WebSocket connections
  updateWebSocketConnections(count: number): void {
    this.setGauge('ws_connections_active', count);
  }

  // Update system metrics
  updateSystemMetrics(): void {
    const memUsage = process.memoryUsage();
    this.setGauge('memory_usage_bytes', memUsage.heapUsed);
    
    // CPU usage would require additional monitoring (placeholder)
    // this.setGauge('cpu_usage_percent', cpuUsage);
  }

  // Get performance summary
  getPerformanceMetrics(): PerformanceMetrics {
    const requestsTotal = this.counters.get('requests_total') || 0;
    const errorsTotal = this.counters.get('errors_total') || 0;
    const apiCallsTotal = this.counters.get('api_calls_total') || 0;
    const apiErrorsTotal = this.counters.get('api_errors_total') || 0;
    
    const uptime = Date.now() - this.startTime.getTime();
    const requestsPerSecond = requestsTotal / (uptime / 1000);
    const errorRate = requestsTotal > 0 ? errorsTotal / requestsTotal : 0;

    return {
      requestsTotal,
      requestsPerSecond,
      requestDuration: this.histograms.get('http_request_duration_seconds')!,
      errorsTotal,
      errorRate,
      errorsByCategory: new Map(), // Would be populated from categorized errors
      apiCallsTotal,
      apiCallDuration: this.histograms.get('api_call_duration_seconds')!,
      apiErrorsTotal,
      memoryUsage: this.gauges.get('memory_usage_bytes') || 0,
      cpuUsage: this.gauges.get('cpu_usage_percent') || 0,
      ordersPlaced: this.counters.get('orders_placed_total') || 0,
      ordersExecuted: this.counters.get('orders_executed_total') || 0,
      orderExecutionTime: this.histograms.get('order_execution_duration_seconds')!,
      wsConnectionsActive: this.gauges.get('ws_connections_active') || 0,
      wsMessagesReceived: this.counters.get('ws_messages_received_total') || 0,
      wsMessagesSent: this.counters.get('ws_messages_sent_total') || 0,
      timestamp: new Date()
    };
  }

  // Record metric data point
  private recordMetric(metric: MetricDataPoint): void {
    const key = `${metric.name}_${JSON.stringify(metric.labels || {})}`;
    this.metrics.set(key, metric);
  }

  // Check error rate and create alerts
  private checkErrorRate(): void {
    if (!this.alertSystem) return;

    const requestsTotal = this.counters.get('requests_total') || 0;
    const errorsTotal = this.counters.get('errors_total') || 0;
    
    if (requestsTotal < 10) return; // Need minimum requests for meaningful rate
    
    const errorRate = errorsTotal / requestsTotal;
    
    // Alert if error rate > 10%
    if (errorRate > 0.1) {
      this.alertSystem.createAlert(
        AlertType.HIGH_ERROR_RATE,
        'High Error Rate Detected',
        `Error rate is ${(errorRate * 100).toFixed(1)}% (${errorsTotal}/${requestsTotal})`,
        AlertSeverity.WARNING,
        { errorRate, errorsTotal, requestsTotal }
      );
    }
  }

  // Get all metrics in Prometheus format
  getPrometheusMetrics(): string {
    let output = '';
    
    // Counters
    for (const [name, value] of this.counters) {
      output += `# TYPE ${name} counter\n`;
      output += `${name} ${value}\n`;
    }
    
    // Gauges
    for (const [name, value] of this.gauges) {
      output += `# TYPE ${name} gauge\n`;
      output += `${name} ${value}\n`;
    }
    
    // Histograms
    for (const [name, histogram] of this.histograms) {
      output += `# TYPE ${name} histogram\n`;
      
      for (const bucket of histogram.buckets) {
        output += `${name}_bucket{le="${bucket.le}"} ${bucket.count}\n`;
      }
      
      output += `${name}_bucket{le="+Inf"} ${histogram.count}\n`;
      output += `${name}_sum ${histogram.sum}\n`;
      output += `${name}_count ${histogram.count}\n`;
    }
    
    return output;
  }

  // Reset all metrics
  reset(): void {
    this.metrics.clear();
    this.counters.clear();
    this.gauges.clear();
    this.histograms.clear();
    this.summaries.clear();
    this.startTime = new Date();
    this.initializeDefaultMetrics();
    
    logger.info('Metrics collector reset', {
      service: this.serviceName
    });
  }

  // Get metric by name
  getMetric(name: string): MetricDataPoint | HistogramMetric | SummaryMetric | undefined {
    return this.metrics.get(name) || this.histograms.get(name) || this.summaries.get(name);
  }

  // Get all metrics
  getAllMetrics(): {
    counters: Map<string, number>;
    gauges: Map<string, number>;
    histograms: Map<string, HistogramMetric>;
    summaries: Map<string, SummaryMetric>;
  } {
    return {
      counters: new Map(this.counters),
      gauges: new Map(this.gauges),
      histograms: new Map(this.histograms),
      summaries: new Map(this.summaries)
    };
  }
}

// Middleware for automatic HTTP request metrics
export const metricsMiddleware = (metricsCollector: MetricsCollector) => {
  return (req: any, res: any, next: any) => {
    const startTime = Date.now();
    
    res.on('finish', () => {
      const duration = Date.now() - startTime;
      metricsCollector.recordHTTPRequest(
        req.method,
        req.route?.path || req.path,
        res.statusCode,
        duration
      );
    });
    
    next();
  };
};

// Decorator for automatic function metrics
export function withMetrics(metricsCollector: MetricsCollector, metricName: string) {
  return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
    const method = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const startTime = Date.now();
      let success = true;
      
      try {
        const result = await method.apply(this, args);
        return result;
      } catch (error) {
        success = false;
        throw error;
      } finally {
        const duration = Date.now() - startTime;
        metricsCollector.recordAPICall(metricName, propertyName, duration, success);
      }
    };

    return descriptor;
  };
}

// Export singleton instance
export const globalMetricsCollector = new MetricsCollector('global');