import { register, collectDefaultMetrics, Counter, Histogram, Gauge, Summary } from 'prom-client';

export class MetricsCollector {
  private serviceName: string;
  
  // HTTP metrics
  public httpRequestsTotal: Counter<string>;
  public httpRequestDuration: Histogram<string>;
  public httpRequestsInFlight: Gauge<string>;
  
  // Database metrics
  public databaseConnectionsActive: Gauge<string>;
  public databaseQueryDuration: Histogram<string>;
  public databaseQueryErrors: Counter<string>;
  
  // Business metrics
  public businessOperationsTotal: Counter<string>;
  public businessOperationDuration: Histogram<string>;
  public businessOperationErrors: Counter<string>;
  
  // System metrics
  public memoryUsage: Gauge<string>;
  public cpuUsage: Gauge<string>;
  public eventLoopLag: Histogram<string>;
  
  // Custom metrics
  private customMetrics: Map<string, any> = new Map();

  constructor(serviceName: string) {
    this.serviceName = serviceName;
    
    // Enable default metrics collection
    collectDefaultMetrics({
      prefix: `${serviceName}_`,
      register
    });
    
    this.initializeMetrics();
  }

  private initializeMetrics(): void {
    // HTTP metrics
    this.httpRequestsTotal = new Counter({
      name: `${this.serviceName}_http_requests_total`,
      help: 'Total number of HTTP requests',
      labelNames: ['method', 'route', 'status_code'],
      registers: [register]
    });

    this.httpRequestDuration = new Histogram({
      name: `${this.serviceName}_http_request_duration_seconds`,
      help: 'Duration of HTTP requests in seconds',
      labelNames: ['method', 'route', 'status_code'],
      buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 5, 10],
      registers: [register]
    });

    this.httpRequestsInFlight = new Gauge({
      name: `${this.serviceName}_http_requests_in_flight`,
      help: 'Number of HTTP requests currently being processed',
      registers: [register]
    });

    // Database metrics
    this.databaseConnectionsActive = new Gauge({
      name: `${this.serviceName}_database_connections_active`,
      help: 'Number of active database connections',
      labelNames: ['database'],
      registers: [register]
    });

    this.databaseQueryDuration = new Histogram({
      name: `${this.serviceName}_database_query_duration_seconds`,
      help: 'Duration of database queries in seconds',
      labelNames: ['operation', 'table'],
      buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 5],
      registers: [register]
    });

    this.databaseQueryErrors = new Counter({
      name: `${this.serviceName}_database_query_errors_total`,
      help: 'Total number of database query errors',
      labelNames: ['operation', 'table', 'error_type'],
      registers: [register]
    });

    // Business metrics
    this.businessOperationsTotal = new Counter({
      name: `${this.serviceName}_business_operations_total`,
      help: 'Total number of business operations',
      labelNames: ['operation', 'status'],
      registers: [register]
    });

    this.businessOperationDuration = new Histogram({
      name: `${this.serviceName}_business_operation_duration_seconds`,
      help: 'Duration of business operations in seconds',
      labelNames: ['operation'],
      buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 5, 10],
      registers: [register]
    });

    this.businessOperationErrors = new Counter({
      name: `${this.serviceName}_business_operation_errors_total`,
      help: 'Total number of business operation errors',
      labelNames: ['operation', 'error_type'],
      registers: [register]
    });

    // System metrics
    this.memoryUsage = new Gauge({
      name: `${this.serviceName}_memory_usage_bytes`,
      help: 'Memory usage in bytes',
      labelNames: ['type'],
      registers: [register]
    });

    this.cpuUsage = new Gauge({
      name: `${this.serviceName}_cpu_usage_percent`,
      help: 'CPU usage percentage',
      registers: [register]
    });

    this.eventLoopLag = new Histogram({
      name: `${this.serviceName}_event_loop_lag_seconds`,
      help: 'Event loop lag in seconds',
      buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1],
      registers: [register]
    });
  }

  // HTTP request tracking
  recordHttpRequest(method: string, route: string, statusCode: number, duration: number): void {
    const labels = { method, route, status_code: statusCode.toString() };
    this.httpRequestsTotal.inc(labels);
    this.httpRequestDuration.observe(labels, duration);
  }

  incrementHttpRequestsInFlight(): void {
    this.httpRequestsInFlight.inc();
  }

  decrementHttpRequestsInFlight(): void {
    this.httpRequestsInFlight.dec();
  }

  // Database operation tracking
  recordDatabaseQuery(operation: string, table: string, duration: number, success: boolean = true): void {
    const labels = { operation, table };
    this.databaseQueryDuration.observe(labels, duration);
    
    if (!success) {
      this.databaseQueryErrors.inc({ ...labels, error_type: 'query_failed' });
    }
  }

  setDatabaseConnections(database: string, count: number): void {
    this.databaseConnectionsActive.set({ database }, count);
  }

  // Business operation tracking
  recordBusinessOperation(operation: string, duration: number, success: boolean = true): void {
    const status = success ? 'success' : 'error';
    this.businessOperationsTotal.inc({ operation, status });
    this.businessOperationDuration.observe({ operation }, duration);
    
    if (!success) {
      this.businessOperationErrors.inc({ operation, error_type: 'operation_failed' });
    }
  }

  // System metrics
  updateMemoryUsage(): void {
    const memUsage = process.memoryUsage();
    this.memoryUsage.set({ type: 'rss' }, memUsage.rss);
    this.memoryUsage.set({ type: 'heap_used' }, memUsage.heapUsed);
    this.memoryUsage.set({ type: 'heap_total' }, memUsage.heapTotal);
    this.memoryUsage.set({ type: 'external' }, memUsage.external);
  }

  updateCpuUsage(): void {
    const cpuUsage = process.cpuUsage();
    const totalUsage = (cpuUsage.user + cpuUsage.system) / 1000000; // Convert to seconds
    this.cpuUsage.set(totalUsage);
  }

  recordEventLoopLag(lag: number): void {
    this.eventLoopLag.observe(lag / 1000); // Convert to seconds
  }

  // Custom metrics
  createCounter(name: string, help: string, labelNames: string[] = []): Counter<string> {
    const counter = new Counter({
      name: `${this.serviceName}_${name}`,
      help,
      labelNames,
      registers: [register]
    });
    this.customMetrics.set(name, counter);
    return counter;
  }

  createGauge(name: string, help: string, labelNames: string[] = []): Gauge<string> {
    const gauge = new Gauge({
      name: `${this.serviceName}_${name}`,
      help,
      labelNames,
      registers: [register]
    });
    this.customMetrics.set(name, gauge);
    return gauge;
  }

  createHistogram(name: string, help: string, labelNames: string[] = [], buckets?: number[]): Histogram<string> {
    const histogram = new Histogram({
      name: `${this.serviceName}_${name}`,
      help,
      labelNames,
      buckets: buckets || [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 5, 10],
      registers: [register]
    });
    this.customMetrics.set(name, histogram);
    return histogram;
  }

  createSummary(name: string, help: string, labelNames: string[] = []): Summary<string> {
    const summary = new Summary({
      name: `${this.serviceName}_${name}`,
      help,
      labelNames,
      registers: [register]
    });
    this.customMetrics.set(name, summary);
    return summary;
  }

  getCustomMetric(name: string): any {
    return this.customMetrics.get(name);
  }

  // Get metrics for Prometheus scraping
  getMetrics(): Promise<string> {
    return register.metrics();
  }

  // Clear all metrics
  clearMetrics(): void {
    register.clear();
    this.customMetrics.clear();
  }

  // Start periodic system metrics collection
  startSystemMetricsCollection(intervalMs: number = 5000): NodeJS.Timeout {
    return setInterval(() => {
      this.updateMemoryUsage();
      this.updateCpuUsage();
    }, intervalMs);
  }
}