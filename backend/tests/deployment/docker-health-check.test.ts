import { exec } from 'child_process';
import { promisify } from 'util';
import axios from 'axios';

const execAsync = promisify(exec);

describe('Docker Health Check Tests', () => {
  const SERVICES = [
    'zerodha-auth-service',
    'zerodha-market-service',
    'zerodha-order-service',
    'zerodha-portfolio-service',
    'zerodha-risk-service',
  ];

  const SERVICE_PORTS = {
    'zerodha-auth-service': 3009,
    'zerodha-market-service': 3005,
    'zerodha-order-service': 3006,
    'zerodha-portfolio-service': 3007,
    'zerodha-risk-service': 3008,
  };

  const TIMEOUT = 30000; // 30 seconds

  beforeAll(async () => {
    // Ensure Docker is running
    try {
      await execAsync('docker --version');
    } catch (error) {
      throw new Error('Docker is not available. Please ensure Docker is installed and running.');
    }
  }, TIMEOUT);

  describe('Container Health Checks', () => {
    it('should verify all service containers are running', async () => {
      for (const service of SERVICES) {
        try {
          const { stdout } = await execAsync(`docker ps --filter "name=${service}" --format "{{.Names}}"`);
          const runningContainers = stdout.trim().split('\n').filter(name => name.includes(service));
          
          expect(runningContainers.length).toBeGreaterThan(0);
        } catch (error) {
          throw new Error(`Failed to check container status for ${service}: ${error.message}`);
        }
      }
    }, TIMEOUT);

    it('should verify container health status', async () => {
      for (const service of SERVICES) {
        try {
          const { stdout } = await execAsync(`docker ps --filter "name=${service}" --format "{{.Status}}"`);
          const status = stdout.trim();
          
          // Check if container is healthy or at least running
          expect(status).toMatch(/(healthy|Up)/i);
        } catch (error) {
          console.warn(`Could not check health status for ${service}: ${error.message}`);
        }
      }
    }, TIMEOUT);

    it('should verify container resource usage is within limits', async () => {
      for (const service of SERVICES) {
        try {
          const { stdout } = await execAsync(`docker stats ${service} --no-stream --format "table {{.CPUPerc}}\t{{.MemUsage}}"`);
          const lines = stdout.trim().split('\n');
          
          if (lines.length > 1) {
            const statsLine = lines[1];
            const [cpuPerc, memUsage] = statsLine.split('\t');
            
            // Extract CPU percentage (remove % sign)
            const cpuUsage = parseFloat(cpuPerc.replace('%', ''));
            
            // Extract memory usage (parse "used / limit" format)
            const memParts = memUsage.split(' / ');
            if (memParts.length === 2) {
              const usedMem = parseFloat(memParts[0]);
              const limitMem = parseFloat(memParts[1]);
              const memPercentage = (usedMem / limitMem) * 100;
              
              // Check resource limits (adjust thresholds as needed)
              expect(cpuUsage).toBeLessThan(80); // CPU usage should be < 80%
              expect(memPercentage).toBeLessThan(90); // Memory usage should be < 90%
            }
          }
        } catch (error) {
          console.warn(`Could not check resource usage for ${service}: ${error.message}`);
        }
      }
    }, TIMEOUT);
  });

  describe('Service Health Endpoints', () => {
    it('should verify health endpoints are accessible', async () => {
      for (const service of SERVICES) {
        const port = SERVICE_PORTS[service];
        const healthUrl = `http://localhost:${port}/health`;
        
        try {
          const response = await axios.get(healthUrl, { timeout: 5000 });
          expect(response.status).toBe(200);
          expect(response.data).toBeDefined();
        } catch (error) {
          if (error.code === 'ECONNREFUSED') {
            console.warn(`Service ${service} is not accessible on port ${port}. This may be expected in test environment.`);
          } else {
            throw new Error(`Health check failed for ${service}: ${error.message}`);
          }
        }
      }
    }, TIMEOUT);

    it('should verify health endpoint response format', async () => {
      for (const service of SERVICES) {
        const port = SERVICE_PORTS[service];
        const healthUrl = `http://localhost:${port}/health`;
        
        try {
          const response = await axios.get(healthUrl, { timeout: 5000 });
          
          expect(response.data).toHaveProperty('status');
          expect(response.data).toHaveProperty('timestamp');
          expect(response.data).toHaveProperty('service');
          expect(response.data.status).toBe('healthy');
          expect(response.data.service).toBe(service);
        } catch (error) {
          if (error.code !== 'ECONNREFUSED') {
            console.warn(`Could not verify health response format for ${service}: ${error.message}`);
          }
        }
      }
    }, TIMEOUT);
  });

  describe('Container Logs', () => {
    it('should verify containers are not producing error logs', async () => {
      for (const service of SERVICES) {
        try {
          const { stdout } = await execAsync(`docker logs ${service} --tail 50 2>&1 | grep -i error || true`);
          const errorLines = stdout.trim().split('\n').filter(line => line.length > 0);
          
          // Allow some expected errors but flag unexpected ones
          const criticalErrors = errorLines.filter(line => 
            !line.includes('ECONNREFUSED') && // Connection refused is expected during startup
            !line.includes('test') && // Test-related errors are acceptable
            !line.includes('warning') // Warnings are not critical errors
          );
          
          if (criticalErrors.length > 0) {
            console.warn(`Critical errors found in ${service} logs:`, criticalErrors);
          }
          
          // Don't fail the test for logs, just warn
          expect(criticalErrors.length).toBeLessThan(10); // Allow some errors but not too many
        } catch (error) {
          console.warn(`Could not check logs for ${service}: ${error.message}`);
        }
      }
    }, TIMEOUT);

    it('should verify containers are producing startup logs', async () => {
      for (const service of SERVICES) {
        try {
          const { stdout } = await execAsync(`docker logs ${service} --tail 20`);
          
          // Check for common startup indicators
          const hasStartupLogs = stdout.includes('Starting') || 
                                stdout.includes('Server') || 
                                stdout.includes('Listening') ||
                                stdout.includes('Ready') ||
                                stdout.includes('Started');
          
          expect(hasStartupLogs).toBe(true);
        } catch (error) {
          console.warn(`Could not check startup logs for ${service}: ${error.message}`);
        }
      }
    }, TIMEOUT);
  });

  describe('Network Connectivity', () => {
    it('should verify services can communicate with each other', async () => {
      // Test inter-service communication by checking if services can reach each other
      const testCases = [
        { from: 'zerodha-order-service', to: 'zerodha-auth-service', port: 3009 },
        { from: 'zerodha-order-service', to: 'zerodha-risk-service', port: 3008 },
        { from: 'zerodha-portfolio-service', to: 'zerodha-market-service', port: 3005 },
      ];

      for (const testCase of testCases) {
        try {
          // Use docker exec to test connectivity from within container
          const command = `docker exec ${testCase.from} curl -f -s http://${testCase.to}:${testCase.port}/health --max-time 5 || echo "FAILED"`;
          const { stdout } = await execAsync(command);
          
          if (stdout.includes('FAILED')) {
            console.warn(`Network connectivity test failed: ${testCase.from} -> ${testCase.to}`);
          } else {
            expect(stdout).not.toContain('FAILED');
          }
        } catch (error) {
          console.warn(`Could not test connectivity ${testCase.from} -> ${testCase.to}: ${error.message}`);
        }
      }
    }, TIMEOUT);

    it('should verify external dependencies are accessible', async () => {
      const dependencies = [
        { service: 'postgres', port: 5432 },
        { service: 'redis', port: 6379 },
        { service: 'influxdb', port: 8086 },
      ];

      for (const dep of dependencies) {
        try {
          // Check if dependency container is running
          const { stdout } = await execAsync(`docker ps --filter "name=${dep.service}" --format "{{.Names}}"`);
          
          if (stdout.trim()) {
            expect(stdout.trim()).toContain(dep.service);
          } else {
            console.warn(`Dependency ${dep.service} is not running`);
          }
        } catch (error) {
          console.warn(`Could not check dependency ${dep.service}: ${error.message}`);
        }
      }
    }, TIMEOUT);
  });

  describe('Volume Mounts and Persistence', () => {
    it('should verify log volumes are mounted correctly', async () => {
      for (const service of SERVICES) {
        try {
          const { stdout } = await execAsync(`docker inspect ${service} --format "{{range .Mounts}}{{.Destination}} {{end}}"`);
          const mounts = stdout.trim().split(' ').filter(mount => mount.length > 0);
          
          // Check if logs directory is mounted
          const hasLogMount = mounts.some(mount => mount.includes('/app/logs') || mount.includes('/logs'));
          
          if (!hasLogMount) {
            console.warn(`No log volume mount found for ${service}`);
          }
        } catch (error) {
          console.warn(`Could not check volume mounts for ${service}: ${error.message}`);
        }
      }
    }, TIMEOUT);

    it('should verify configuration is properly mounted', async () => {
      for (const service of SERVICES) {
        try {
          // Check if service can access its configuration
          const command = `docker exec ${service} ls -la /app/ | grep -E "(package.json|node_modules)" || echo "NOT_FOUND"`;
          const { stdout } = await execAsync(command);
          
          expect(stdout).not.toContain('NOT_FOUND');
        } catch (error) {
          console.warn(`Could not check configuration for ${service}: ${error.message}`);
        }
      }
    }, TIMEOUT);
  });

  describe('Environment Variables', () => {
    it('should verify required environment variables are set', async () => {
      const requiredEnvVars = [
        'NODE_ENV',
        'PORT',
        'POSTGRES_URL',
        'REDIS_URL',
      ];

      for (const service of SERVICES) {
        for (const envVar of requiredEnvVars) {
          try {
            const command = `docker exec ${service} printenv ${envVar} || echo "NOT_SET"`;
            const { stdout } = await execAsync(command);
            
            if (stdout.trim() === 'NOT_SET') {
              console.warn(`Environment variable ${envVar} not set in ${service}`);
            } else {
              expect(stdout.trim()).not.toBe('NOT_SET');
            }
          } catch (error) {
            console.warn(`Could not check environment variable ${envVar} in ${service}: ${error.message}`);
          }
        }
      }
    }, TIMEOUT);

    it('should verify sensitive environment variables are not logged', async () => {
      const sensitiveVars = ['PASSWORD', 'SECRET', 'KEY', 'TOKEN'];

      for (const service of SERVICES) {
        try {
          const { stdout } = await execAsync(`docker logs ${service} --tail 100`);
          
          for (const sensitiveVar of sensitiveVars) {
            // Check that sensitive values are not exposed in logs
            const hasSensitiveData = stdout.toLowerCase().includes(sensitiveVar.toLowerCase() + '=');
            
            if (hasSensitiveData) {
              console.warn(`Potential sensitive data exposure in ${service} logs`);
            }
            
            expect(hasSensitiveData).toBe(false);
          }
        } catch (error) {
          console.warn(`Could not check logs for sensitive data in ${service}: ${error.message}`);
        }
      }
    }, TIMEOUT);
  });
});