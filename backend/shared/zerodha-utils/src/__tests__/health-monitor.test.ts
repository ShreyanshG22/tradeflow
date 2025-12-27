import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import {
  HealthMonitor,
  HealthStatus,
  HealthCheckResult,
  createDatabaseHealthCheck,
  createRedisHealthCheck,
  createCircuitBreakerHealthCheck,
  createMemoryHealthCheck,
  globalHealthMonitor
} from '../health-monitor';

describe('Health Monitor', () => {
  let healthMonitor: HealthMonitor;

  beforeEach(() => {
    healthMonitor = new HealthMonitor('test-service');
  });

  afterEach(() => {
    healthMonitor.stopPeriodicChecks();
    healthMonitor.destroy();
  });

  describe('HealthMonitor', () => {
    it('should register and run health check', async () => {
      const mockCheck = jest.fn().mockResolvedValue({
        name: 'test-check',
        status: HealthStatus.HEALTHY,
        message: 'All good',
        timestamp: new Date(),
        duration: 10
      });

      healthMonitor.registerCheck('test-check', mockCheck);
      const result = await healthMonitor.runCheck('test-check');

      expect(mockCheck).toHaveBeenCalled();
      expect(result.name).toBe('test-check');
      expect(result.status).toBe(HealthStatus.HEALTHY);
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });

    it('should handle failed health check', async () => {
      const mockCheck = jest.fn().mockRejectedValue(new Error('Check failed'));

      healthMonitor.registerCheck('failing-check', mockCheck);
      const result = await healthMonitor.runCheck('failing-check');

      expect(result.status).toBe(HealthStatus.CRITICAL);
      expect(result.message).toContain('Check failed');
      expect(result.metadata?.error).toBe('Check failed');
    });

    it('should throw error for non-existent check', async () => {
      await expect(healthMonitor.runCheck('non-existent')).rejects.toThrow(
        "Health check 'non-existent' not found"
      );
    });

    it('should run all registered checks', async () => {
      const check1 = jest.fn().mockResolvedValue({
        name: 'check1',
        status: HealthStatus.HEALTHY,
        message: 'OK',
        timestamp: new Date(),
        duration: 5
      });

      const check2 = jest.fn().mockResolvedValue({
        name: 'check2',
        status: HealthStatus.DEGRADED,
        message: 'Slow',
        timestamp: new Date(),
        duration: 15
      });

      healthMonitor.registerCheck('check1', check1);
      healthMonitor.registerCheck('check2', check2);

      const results = await healthMonitor.runAllChecks();

      expect(results).toHaveLength(2);
      expect(check1).toHaveBeenCalled();
      expect(check2).toHaveBeenCalled();
    });

    it('should calculate overall system health', async () => {
      const healthyCheck = jest.fn().mockResolvedValue({
        name: 'healthy',
        status: HealthStatus.HEALTHY,
        message: 'OK',
        timestamp: new Date(),
        duration: 5
      });

      const degradedCheck = jest.fn().mockResolvedValue({
        name: 'degraded',
        status: HealthStatus.DEGRADED,
        message: 'Slow',
        timestamp: new Date(),
        duration: 15
      });

      healthMonitor.registerCheck('healthy', healthyCheck);
      healthMonitor.registerCheck('degraded', degradedCheck);

      const systemHealth = await healthMonitor.getSystemHealth();

      expect(systemHealth.status).toBe(HealthStatus.DEGRADED);
      expect(systemHealth.checks).toHaveLength(2);
      expect(systemHealth.uptime).toBeGreaterThan(0);
    });

    it('should calculate system status as CRITICAL when any check is critical', async () => {
      const criticalCheck = jest.fn().mockResolvedValue({
        name: 'critical',
        status: HealthStatus.CRITICAL,
        message: 'Failed',
        timestamp: new Date(),
        duration: 5
      });

      const healthyCheck = jest.fn().mockResolvedValue({
        name: 'healthy',
        status: HealthStatus.HEALTHY,
        message: 'OK',
        timestamp: new Date(),
        duration: 5
      });

      healthMonitor.registerCheck('critical', criticalCheck);
      healthMonitor.registerCheck('healthy', healthyCheck);

      const systemHealth = await healthMonitor.getSystemHealth();
      expect(systemHealth.status).toBe(HealthStatus.CRITICAL);
    });

    it('should calculate system status as UNHEALTHY when >50% checks are unhealthy', async () => {
      const unhealthyCheck1 = jest.fn().mockResolvedValue({
        name: 'unhealthy1',
        status: HealthStatus.UNHEALTHY,
        message: 'Failed',
        timestamp: new Date(),
        duration: 5
      });

      const unhealthyCheck2 = jest.fn().mockResolvedValue({
        name: 'unhealthy2',
        status: HealthStatus.UNHEALTHY,
        message: 'Failed',
        timestamp: new Date(),
        duration: 5
      });

      const healthyCheck = jest.fn().mockResolvedValue({
        name: 'healthy',
        status: HealthStatus.HEALTHY,
        message: 'OK',
        timestamp: new Date(),
        duration: 5
      });

      healthMonitor.registerCheck('unhealthy1', unhealthyCheck1);
      healthMonitor.registerCheck('unhealthy2', unhealthyCheck2);
      healthMonitor.registerCheck('healthy', healthyCheck);

      const systemHealth = await healthMonitor.getSystemHealth();
      expect(systemHealth.status).toBe(HealthStatus.UNHEALTHY);
    });

    it('should unregister health check', () => {
      const mockCheck = jest.fn();
      healthMonitor.registerCheck('test-check', mockCheck);
      healthMonitor.unregisterCheck('test-check');

      expect(healthMonitor.runCheck('test-check')).rejects.toThrow();
    });

    it('should start and stop periodic checks', () => {
      const mockSetInterval = jest.spyOn(global, 'setInterval');
      const mockClearInterval = jest.spyOn(global, 'clearInterval');

      healthMonitor.startPeriodicChecks(5000);
      expect(mockSetInterval).toHaveBeenCalledWith(expect.any(Function), 5000);

      healthMonitor.stopPeriodicChecks();
      expect(mockClearInterval).toHaveBeenCalled();
    });

    it('should record performance metrics', () => {
      healthMonitor.recordMetrics('test-operation', 100, false);
      healthMonitor.recordMetrics('test-operation', 200, true);

      const metrics = healthMonitor.getMetrics('test-operation');
      expect(metrics?.requestCount).toBe(2);
      expect(metrics?.errorCount).toBe(1);
      expect(metrics?.errorRate).toBe(0.5);
      expect(metrics?.averageResponseTime).toBe(150);
    });

    it('should check API connectivity', async () => {
      // Mock the HTTP check to succeed
      jest.spyOn(healthMonitor as any, 'performHTTPCheck').mockResolvedValue({ status: 200 });

      const status = await healthMonitor.checkAPIConnectivity('test-api', 'http://test.com');

      expect(status.name).toBe('test-api');
      expect(status.url).toBe('http://test.com');
      expect(status.status).toBe(HealthStatus.HEALTHY);
      expect(status.consecutiveFailures).toBe(0);
    });

    it('should handle API connectivity failure', async () => {
      // Mock the HTTP check to fail
      jest.spyOn(healthMonitor as any, 'performHTTPCheck').mockRejectedValue(new Error('Connection failed'));

      const status = await healthMonitor.checkAPIConnectivity('test-api', 'http://test.com');

      expect(status.status).toBe(HealthStatus.UNHEALTHY);
      expect(status.consecutiveFailures).toBe(1);
      expect(status.lastFailure).toBeInstanceOf(Date);
    });
  });

  describe('Pre-built Health Checks', () => {
    describe('createDatabaseHealthCheck', () => {
      it('should create healthy database check', async () => {
        const mockDbCheck = jest.fn().mockResolvedValue(true);
        const healthCheck = createDatabaseHealthCheck('database', mockDbCheck);

        const result = await healthCheck();

        expect(result.name).toBe('database');
        expect(result.status).toBe(HealthStatus.HEALTHY);
        expect(result.message).toContain('healthy');
      });

      it('should create unhealthy database check', async () => {
        const mockDbCheck = jest.fn().mockResolvedValue(false);
        const healthCheck = createDatabaseHealthCheck('database', mockDbCheck);

        const result = await healthCheck();

        expect(result.status).toBe(HealthStatus.UNHEALTHY);
        expect(result.message).toContain('failed');
      });

      it('should handle database check error', async () => {
        const mockDbCheck = jest.fn().mockRejectedValue(new Error('DB Error'));
        const healthCheck = createDatabaseHealthCheck('database', mockDbCheck);

        const result = await healthCheck();

        expect(result.status).toBe(HealthStatus.CRITICAL);
        expect(result.message).toContain('DB Error');
        expect(result.metadata?.error).toBe('DB Error');
      });
    });

    describe('createRedisHealthCheck', () => {
      it('should create healthy Redis check', async () => {
        const mockRedisCheck = jest.fn().mockResolvedValue(true);
        const healthCheck = createRedisHealthCheck('redis', mockRedisCheck);

        const result = await healthCheck();

        expect(result.name).toBe('redis');
        expect(result.status).toBe(HealthStatus.HEALTHY);
        expect(result.message).toContain('healthy');
      });

      it('should create unhealthy Redis check', async () => {
        const mockRedisCheck = jest.fn().mockResolvedValue(false);
        const healthCheck = createRedisHealthCheck('redis', mockRedisCheck);

        const result = await healthCheck();

        expect(result.status).toBe(HealthStatus.UNHEALTHY);
        expect(result.message).toContain('failed');
      });
    });

    describe('createCircuitBreakerHealthCheck', () => {
      it('should create healthy circuit breaker check', async () => {
        // Mock circuit breaker manager to return healthy breakers
        jest.spyOn(require('../circuit-breaker').circuitBreakerManager, 'getHealthStatus')
          .mockReturnValue([
            { name: 'service1', healthy: true, state: 'CLOSED', failureRate: 0, metrics: {} },
            { name: 'service2', healthy: true, state: 'CLOSED', failureRate: 0, metrics: {} }
          ]);

        const healthCheck = createCircuitBreakerHealthCheck();
        const result = await healthCheck();

        expect(result.name).toBe('circuit-breakers');
        expect(result.status).toBe(HealthStatus.HEALTHY);
        expect(result.message).toContain('healthy');
      });

      it('should create degraded circuit breaker check when some are open', async () => {
        jest.spyOn(require('../circuit-breaker').circuitBreakerManager, 'getHealthStatus')
          .mockReturnValue([
            { name: 'service1', healthy: false, state: 'OPEN', failureRate: 0.5, metrics: {} },
            { name: 'service2', healthy: true, state: 'CLOSED', failureRate: 0, metrics: {} }
          ]);

        const healthCheck = createCircuitBreakerHealthCheck();
        const result = await healthCheck();

        expect(result.status).toBe(HealthStatus.DEGRADED);
        expect(result.message).toContain('1 circuit breaker(s) open');
        expect(result.message).toContain('service1');
      });
    });

    describe('createMemoryHealthCheck', () => {
      it('should create healthy memory check', async () => {
        // Mock process.memoryUsage to return low usage
        jest.spyOn(process, 'memoryUsage').mockReturnValue({
          rss: 1000000,
          heapTotal: 10000000,
          heapUsed: 5000000, // 50% usage
          external: 1000000,
          arrayBuffers: 1000000
        });

        const healthCheck = createMemoryHealthCheck(80); // 80% threshold
        const result = await healthCheck();

        expect(result.name).toBe('memory-usage');
        expect(result.status).toBe(HealthStatus.HEALTHY);
        expect(result.metadata?.usagePercent).toBe('50.0');
      });

      it('should create degraded memory check for high usage', async () => {
        jest.spyOn(process, 'memoryUsage').mockReturnValue({
          rss: 1000000,
          heapTotal: 10000000,
          heapUsed: 8500000, // 85% usage
          external: 1000000,
          arrayBuffers: 1000000
        });

        const healthCheck = createMemoryHealthCheck(80);
        const result = await healthCheck();

        expect(result.status).toBe(HealthStatus.DEGRADED);
        expect(result.message).toContain('High memory usage');
      });

      it('should create critical memory check for very high usage', async () => {
        jest.spyOn(process, 'memoryUsage').mockReturnValue({
          rss: 1000000,
          heapTotal: 10000000,
          heapUsed: 9500000, // 95% usage
          external: 1000000,
          arrayBuffers: 1000000
        });

        const healthCheck = createMemoryHealthCheck(80);
        const result = await healthCheck();

        expect(result.status).toBe(HealthStatus.CRITICAL);
        expect(result.message).toContain('High memory usage');
      });
    });
  });

  describe('Global Health Monitor', () => {
    it('should provide global instance', () => {
      expect(globalHealthMonitor).toBeInstanceOf(HealthMonitor);
    });
  });
});