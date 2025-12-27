import cron from 'node-cron';
import { CentralizedLogger } from '@tradeflow/logging';
import { HealthChecker } from './health-checker';
import { SystemMonitor } from './system-monitor';
import { AlertManager } from './alert-manager';
import { MonitoringConfig, HealthCheckResult, SystemMetrics } from './types';

export class MonitoringService {
  private logger: CentralizedLogger;
  private config: MonitoringConfig;
  private healthChecker: HealthChecker;
  private systemMonitor: SystemMonitor;
  private alertManager: AlertManager;
  private healthCheckJobs: Map<string, cron.ScheduledTask> = new Map();
  private systemMetricsJob?: cron.ScheduledTask;
  private isRunning: boolean = false;

  constructor(logger: CentralizedLogger, config: MonitoringConfig) {
    this.logger = logger;
    this.config = config;
    this.healthChecker = new HealthChecker(logger);
    this.systemMonitor = new SystemMonitor(logger);
    this.alertManager = new AlertManager(logger, config);
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      this.logger.warn('Monitoring service is already running');
      return;
    }

    this.logger.info('Starting monitoring service...');

    try {
      // Start health checks
      await this.startHealthChecks();

      // Start system metrics collection
      if (this.config.systemMetrics.enabled) {
        await this.startSystemMetricsCollection();
      }

      this.isRunning = true;
      this.logger.info('Monitoring service started successfully');
    } catch (error) {
      this.logger.error('Failed to start monitoring service', error as Error);
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (!this.isRunning) {
      this.logger.warn('Monitoring service is not running');
      return;
    }

    this.logger.info('Stopping monitoring service...');

    // Stop all health check jobs
    for (const [name, job] of this.healthCheckJobs) {
      job.stop();
      this.logger.debug(`Stopped health check job: ${name}`);
    }
    this.healthCheckJobs.clear();

    // Stop system metrics job
    if (this.systemMetricsJob) {
      this.systemMetricsJob.stop();
      this.systemMetricsJob = undefined;
    }

    this.isRunning = false;
    this.logger.info('Monitoring service stopped');
  }

  private async startHealthChecks(): Promise<void> {
    for (const healthCheck of this.config.healthChecks) {
      const cronExpression = this.intervalToCron(healthCheck.interval);
      
      const job = cron.schedule(cronExpression, async () => {
        try {
          const result = await this.healthChecker.checkServiceWithRetries(healthCheck);
          
          this.logger.logPerformance({
            operation: `health_check_${healthCheck.name}`,
            duration: result.responseTime,
            timestamp: result.timestamp,
            success: result.status === 'healthy',
            metadata: {
              service: healthCheck.name,
              status: result.status,
              error: result.error
            }
          });

          // Evaluate alerts
          await this.alertManager.evaluateHealthChecks([result]);
        } catch (error) {
          this.logger.error(`Health check failed for ${healthCheck.name}`, error as Error);
        }
      }, {
        scheduled: false
      });

      this.healthCheckJobs.set(healthCheck.name, job);
      job.start();
      
      this.logger.info(`Started health check for ${healthCheck.name}`, {
        interval: healthCheck.interval,
        cronExpression
      });
    }
  }

  private async startSystemMetricsCollection(): Promise<void> {
    const cronExpression = this.intervalToCron(this.config.systemMetrics.interval);
    
    this.systemMetricsJob = cron.schedule(cronExpression, async () => {
      try {
        const metrics = await this.systemMonitor.collectSystemMetrics();
        
        this.logger.logPerformance({
          operation: 'system_metrics_collection',
          duration: 0, // Metrics collection is usually fast
          timestamp: new Date(),
          success: true,
          metadata: {
            cpuUsage: metrics.cpu.usage,
            memoryUsage: metrics.memory.usage,
            diskUsage: metrics.disk.usage
          }
        });

        // Evaluate alerts
        await this.alertManager.evaluateSystemMetrics(metrics);
      } catch (error) {
        this.logger.error('System metrics collection failed', error as Error);
      }
    }, {
      scheduled: false
    });

    this.systemMetricsJob.start();
    this.logger.info('Started system metrics collection', {
      interval: this.config.systemMetrics.interval,
      cronExpression
    });
  }

  private intervalToCron(intervalMs: number): string {
    const seconds = Math.floor(intervalMs / 1000);
    
    if (seconds < 60) {
      return `*/${seconds} * * * * *`;
    }
    
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) {
      return `*/${minutes} * * * *`;
    }
    
    const hours = Math.floor(minutes / 60);
    return `0 */${hours} * * *`;
  }

  // Public API methods
  async getHealthStatus(): Promise<HealthCheckResult[]> {
    const results = await this.healthChecker.checkMultipleServices(this.config.healthChecks);
    return results;
  }

  async getSystemMetrics(): Promise<SystemMetrics> {
    return this.systemMonitor.collectSystemMetrics();
  }

  async getSystemInfo(): Promise<any> {
    return this.systemMonitor.getDetailedSystemInfo();
  }

  getActiveAlerts() {
    return this.alertManager.getActiveAlerts();
  }

  getAlertHistory(limit?: number) {
    return this.alertManager.getAlertHistory(limit);
  }

  async resolveAlert(alertId: string): Promise<boolean> {
    return this.alertManager.resolveAlertById(alertId);
  }

  getMetricsHistory(limit?: number) {
    return this.systemMonitor.getMetricsHistory(limit);
  }

  getAverageMetrics(minutes: number = 5) {
    return this.systemMonitor.getAverageMetrics(minutes);
  }

  // Manual health check
  async checkService(serviceName: string): Promise<HealthCheckResult | null> {
    const service = this.config.healthChecks.find(hc => hc.name === serviceName);
    if (!service) {
      return null;
    }
    
    return this.healthChecker.checkServiceWithRetries(service);
  }

  // Update configuration
  updateConfig(newConfig: Partial<MonitoringConfig>): void {
    this.config = { ...this.config, ...newConfig };
    this.logger.info('Monitoring configuration updated');
    
    // Restart if running
    if (this.isRunning) {
      this.stop().then(() => this.start());
    }
  }

  getStatus() {
    return {
      running: this.isRunning,
      healthChecks: this.config.healthChecks.length,
      activeAlerts: this.alertManager.getActiveAlerts().length,
      systemMetricsEnabled: this.config.systemMetrics.enabled,
      uptime: process.uptime()
    };
  }
}