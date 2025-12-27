import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import {
  CircuitBreaker,
  CircuitBreakerState,
  CircuitBreakerManager,
  circuitBreakerManager,
  createZerodhaCircuitBreaker
} from '../circuit-breaker';
import { ZerodhaError, ErrorCategory, ErrorSeverity } from '../error-handler';

describe('Circuit Breaker', () => {
  let circuitBreaker: CircuitBreaker;

  beforeEach(() => {
    circuitBreaker = new CircuitBreaker('test-service', {
      failureThreshold: 3,
      recoveryTimeout: 1000,
      monitoringPeriod: 5000,
      successThreshold: 2,
      timeout: 100
    });
  });

  describe('CircuitBreaker', () => {
    it('should start in CLOSED state', () => {
      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.CLOSED);
    });

    it('should execute function successfully when CLOSED', async () => {
      const mockFn = jest.fn().mockResolvedValue('success');
      
      const result = await circuitBreaker.execute(mockFn);
      
      expect(result).toBe('success');
      expect(mockFn).toHaveBeenCalledTimes(1);
      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.CLOSED);
    });

    it('should open circuit after failure threshold', async () => {
      const mockFn = jest.fn().mockRejectedValue(new Error('Test error'));
      
      // Execute failures up to threshold
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(mockFn);
        } catch (error) {
          // Expected to fail
        }
      }
      
      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.OPEN);
    });

    it('should fail fast when circuit is OPEN', async () => {
      const mockFn = jest.fn().mockRejectedValue(new Error('Test error'));
      
      // Trigger circuit to open
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(mockFn);
        } catch (error) {
          // Expected to fail
        }
      }
      
      // Now circuit should be open and fail fast
      const startTime = Date.now();
      try {
        await circuitBreaker.execute(mockFn);
      } catch (error) {
        const duration = Date.now() - startTime;
        expect(duration).toBeLessThan(50); // Should fail fast
        expect(error).toBeInstanceOf(ZerodhaError);
        expect((error as ZerodhaError).message).toContain('Circuit breaker is OPEN');
      }
    });

    it('should transition to HALF_OPEN after recovery timeout', async () => {
      const mockFn = jest.fn().mockRejectedValue(new Error('Test error'));
      
      // Open the circuit
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(mockFn);
        } catch (error) {
          // Expected to fail
        }
      }
      
      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.OPEN);
      
      // Wait for recovery timeout (mocked)
      jest.advanceTimersByTime(1001);
      
      // Next call should transition to HALF_OPEN
      mockFn.mockResolvedValueOnce('success');
      const result = await circuitBreaker.execute(mockFn);
      
      expect(result).toBe('success');
      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.HALF_OPEN);
    });

    it('should close circuit after successful calls in HALF_OPEN', async () => {
      const mockFn = jest.fn();
      
      // Open the circuit
      mockFn.mockRejectedValue(new Error('Test error'));
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(mockFn);
        } catch (error) {
          // Expected to fail
        }
      }
      
      // Wait for recovery timeout
      jest.advanceTimersByTime(1001);
      
      // Successful calls in HALF_OPEN
      mockFn.mockResolvedValue('success');
      await circuitBreaker.execute(mockFn);
      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.HALF_OPEN);
      
      await circuitBreaker.execute(mockFn);
      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.CLOSED);
    });

    it('should reopen circuit on failure in HALF_OPEN', async () => {
      const mockFn = jest.fn();
      
      // Open the circuit
      mockFn.mockRejectedValue(new Error('Test error'));
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(mockFn);
        } catch (error) {
          // Expected to fail
        }
      }
      
      // Wait for recovery timeout
      jest.advanceTimersByTime(1001);
      
      // Fail in HALF_OPEN
      try {
        await circuitBreaker.execute(mockFn);
      } catch (error) {
        // Expected to fail
      }
      
      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.OPEN);
    });

    it('should handle timeout', async () => {
      const mockFn = jest.fn().mockImplementation(() => {
        return new Promise(resolve => setTimeout(resolve, 200));
      });
      
      try {
        await circuitBreaker.execute(mockFn);
      } catch (error) {
        expect(error).toBeInstanceOf(ZerodhaError);
        expect((error as ZerodhaError).message).toContain('timeout');
      }
    });

    it('should provide health status', () => {
      const health = circuitBreaker.getHealthStatus();
      
      expect(health).toEqual({
        name: 'test-service',
        state: CircuitBreakerState.CLOSED,
        healthy: true,
        failureRate: 0,
        metrics: expect.objectContaining({
          totalRequests: 0,
          successfulRequests: 0,
          failedRequests: 0,
          timeouts: 0,
          circuitOpenCount: 0
        })
      });
    });

    it('should reset circuit breaker', () => {
      // Open the circuit first
      const mockFn = jest.fn().mockRejectedValue(new Error('Test error'));
      
      Promise.all([
        circuitBreaker.execute(mockFn).catch(() => {}),
        circuitBreaker.execute(mockFn).catch(() => {}),
        circuitBreaker.execute(mockFn).catch(() => {})
      ]).then(() => {
        expect(circuitBreaker.getState()).toBe(CircuitBreakerState.OPEN);
        
        circuitBreaker.reset();
        expect(circuitBreaker.getState()).toBe(CircuitBreakerState.CLOSED);
      });
    });

    it('should track metrics correctly', async () => {
      const mockFn = jest.fn();
      
      // Successful call
      mockFn.mockResolvedValueOnce('success');
      await circuitBreaker.execute(mockFn);
      
      // Failed call
      mockFn.mockRejectedValueOnce(new Error('Test error'));
      try {
        await circuitBreaker.execute(mockFn);
      } catch (error) {
        // Expected to fail
      }
      
      const metrics = circuitBreaker.getMetrics();
      expect(metrics.totalRequests).toBe(2);
      expect(metrics.successfulRequests).toBe(1);
      expect(metrics.failedRequests).toBe(1);
    });
  });

  describe('CircuitBreakerManager', () => {
    let manager: CircuitBreakerManager;

    beforeEach(() => {
      manager = new CircuitBreakerManager();
    });

    it('should create and return circuit breaker', () => {
      const cb1 = manager.getCircuitBreaker('service1');
      const cb2 = manager.getCircuitBreaker('service1');
      
      expect(cb1).toBe(cb2); // Should return same instance
      expect(cb1.getHealthStatus().name).toBe('service1');
    });

    it('should create different circuit breakers for different names', () => {
      const cb1 = manager.getCircuitBreaker('service1');
      const cb2 = manager.getCircuitBreaker('service2');
      
      expect(cb1).not.toBe(cb2);
    });

    it('should return all circuit breakers', () => {
      manager.getCircuitBreaker('service1');
      manager.getCircuitBreaker('service2');
      
      const allBreakers = manager.getAllCircuitBreakers();
      expect(allBreakers).toHaveLength(2);
    });

    it('should get health status of all circuit breakers', () => {
      manager.getCircuitBreaker('service1');
      manager.getCircuitBreaker('service2');
      
      const healthStatuses = manager.getHealthStatus();
      expect(healthStatuses).toHaveLength(2);
      expect(healthStatuses[0]).toHaveProperty('name');
      expect(healthStatuses[0]).toHaveProperty('healthy');
    });

    it('should reset all circuit breakers', () => {
      const cb1 = manager.getCircuitBreaker('service1');
      const cb2 = manager.getCircuitBreaker('service2');
      
      // Mock that circuits are open
      jest.spyOn(cb1, 'reset');
      jest.spyOn(cb2, 'reset');
      
      manager.resetAll();
      
      expect(cb1.reset).toHaveBeenCalled();
      expect(cb2.reset).toHaveBeenCalled();
    });
  });

  describe('Global Circuit Breaker Manager', () => {
    it('should provide global instance', () => {
      const cb1 = circuitBreakerManager.getCircuitBreaker('global-test');
      const cb2 = circuitBreakerManager.getCircuitBreaker('global-test');
      
      expect(cb1).toBe(cb2);
    });
  });

  describe('createZerodhaCircuitBreaker', () => {
    it('should create circuit breaker with Zerodha-specific config', () => {
      const cb = createZerodhaCircuitBreaker('auth-service');
      
      expect(cb.getHealthStatus().name).toBe('zerodha-auth-service');
      
      // Test that it uses the correct configuration by checking behavior
      const config = (cb as any).config;
      expect(config.failureThreshold).toBe(3);
      expect(config.recoveryTimeout).toBe(30000);
      expect(config.timeout).toBe(10000);
    });
  });
});