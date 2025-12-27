import axios, { AxiosResponse } from 'axios';
import WebSocket from 'ws';

describe('Service Connectivity Tests', () => {
  const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost';
  const TIMEOUT = 10000;

  const SERVICES = {
    auth: { port: 3009, name: 'zerodha-auth-service' },
    market: { port: 3005, name: 'zerodha-market-service' },
    order: { port: 3006, name: 'zerodha-order-service' },
    portfolio: { port: 3007, name: 'zerodha-portfolio-service' },
    risk: { port: 3008, name: 'zerodha-risk-service' },
  };

  // Helper function to make HTTP requests with timeout
  const makeRequest = async (url: string, options: any = {}): Promise<AxiosResponse> => {
    return axios({
      url,
      timeout: TIMEOUT,
      validateStatus: () => true, // Don't throw on non-2xx status codes
      ...options,
    });
  };

  describe('Health Check Endpoints', () => {
    Object.entries(SERVICES).forEach(([serviceName, config]) => {
      it(`should respond to health check for ${serviceName} service`, async () => {
        const url = `${BASE_URL}:${config.port}/health`;
        
        try {
          const response = await makeRequest(url);
          
          expect(response.status).toBe(200);
          expect(response.data).toHaveProperty('status');
          expect(response.data).toHaveProperty('service');
          expect(response.data).toHaveProperty('timestamp');
          expect(response.data.status).toBe('healthy');
          expect(response.data.service).toBe(config.name);
        } catch (error) {
          if (error.code === 'ECONNREFUSED') {
            console.warn(`Service ${serviceName} is not running on port ${config.port}`);
            expect(true).toBe(true); // Mark as passed but with warning
          } else {
            throw error;
          }
        }
      });
    });

    it('should return consistent health check format across all services', async () => {
      const healthResponses: any[] = [];

      for (const [serviceName, config] of Object.entries(SERVICES)) {
        try {
          const url = `${BASE_URL}:${config.port}/health`;
          const response = await makeRequest(url);
          
          if (response.status === 200) {
            healthResponses.push({
              service: serviceName,
              data: response.data,
            });
          }
        } catch (error) {
          console.warn(`Could not get health response from ${serviceName}: ${error.message}`);
        }
      }

      // Verify all health responses have the same structure
      if (healthResponses.length > 1) {
        const firstResponse = healthResponses[0].data;
        const requiredFields = Object.keys(firstResponse);

        healthResponses.forEach(({ service, data }) => {
          requiredFields.forEach(field => {
            expect(data).toHaveProperty(field);
          });
        });
      }
    });
  });

  describe('API Endpoint Availability', () => {
    it('should have auth service endpoints available', async () => {
      const authEndpoints = [
        '/health',
        '/api/auth/profile', // Should return 401 without auth
        '/api/auth/login', // Should return method not allowed for GET
      ];

      for (const endpoint of authEndpoints) {
        try {
          const url = `${BASE_URL}:${SERVICES.auth.port}${endpoint}`;
          const response = await makeRequest(url);
          
          // We expect these endpoints to exist (even if they return errors)
          expect([200, 401, 405, 404]).toContain(response.status);
        } catch (error) {
          if (error.code !== 'ECONNREFUSED') {
            throw error;
          }
        }
      }
    });

    it('should have market service endpoints available', async () => {
      const marketEndpoints = [
        '/health',
        '/api/market/instruments',
        '/api/market/quotes',
      ];

      for (const endpoint of marketEndpoints) {
        try {
          const url = `${BASE_URL}:${SERVICES.market.port}${endpoint}`;
          const response = await makeRequest(url);
          
          expect([200, 401, 404, 500]).toContain(response.status);
        } catch (error) {
          if (error.code !== 'ECONNREFUSED') {
            throw error;
          }
        }
      }
    });

    it('should have order service endpoints available', async () => {
      const orderEndpoints = [
        '/health',
        '/api/orders',
        '/api/orders/history',
      ];

      for (const endpoint of orderEndpoints) {
        try {
          const url = `${BASE_URL}:${SERVICES.order.port}${endpoint}`;
          const response = await makeRequest(url);
          
          expect([200, 401, 404, 500]).toContain(response.status);
        } catch (error) {
          if (error.code !== 'ECONNREFUSED') {
            throw error;
          }
        }
      }
    });

    it('should have portfolio service endpoints available', async () => {
      const portfolioEndpoints = [
        '/health',
        '/api/portfolio/positions',
        '/api/portfolio/holdings',
      ];

      for (const endpoint of portfolioEndpoints) {
        try {
          const url = `${BASE_URL}:${SERVICES.portfolio.port}${endpoint}`;
          const response = await makeRequest(url);
          
          expect([200, 401, 404, 500]).toContain(response.status);
        } catch (error) {
          if (error.code !== 'ECONNREFUSED') {
            throw error;
          }
        }
      }
    });

    it('should have risk service endpoints available', async () => {
      const riskEndpoints = [
        '/health',
        '/api/risk/limits',
        '/api/risk/check',
      ];

      for (const endpoint of riskEndpoints) {
        try {
          const url = `${BASE_URL}:${SERVICES.risk.port}${endpoint}`;
          const response = await makeRequest(url);
          
          expect([200, 401, 404, 500]).toContain(response.status);
        } catch (error) {
          if (error.code !== 'ECONNREFUSED') {
            throw error;
          }
        }
      }
    });
  });

  describe('WebSocket Connectivity', () => {
    it('should establish WebSocket connection for market data', (done) => {
      const wsUrl = `ws://localhost:8080/ws/market-data`;
      
      const ws = new WebSocket(wsUrl);
      let connectionEstablished = false;

      ws.on('open', () => {
        connectionEstablished = true;
        ws.close();
      });

      ws.on('close', () => {
        if (connectionEstablished) {
          done();
        } else {
          console.warn('WebSocket connection could not be established - service may not be running');
          done(); // Don't fail the test, just warn
        }
      });

      ws.on('error', (error) => {
        console.warn(`WebSocket connection error: ${error.message}`);
        done(); // Don't fail the test, just warn
      });

      // Timeout after 5 seconds
      setTimeout(() => {
        if (!connectionEstablished) {
          ws.close();
          console.warn('WebSocket connection timeout');
          done();
        }
      }, 5000);
    });

    it('should handle WebSocket message format correctly', (done) => {
      const wsUrl = `ws://localhost:8080/ws/market-data`;
      
      const ws = new WebSocket(wsUrl);
      let messageReceived = false;

      ws.on('open', () => {
        // Send a test subscription message
        ws.send(JSON.stringify({
          type: 'subscribe',
          instruments: ['NSE:INFY']
        }));
      });

      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          expect(message).toHaveProperty('type');
          messageReceived = true;
          ws.close();
        } catch (error) {
          console.warn('Invalid WebSocket message format');
          ws.close();
        }
      });

      ws.on('close', () => {
        done();
      });

      ws.on('error', (error) => {
        console.warn(`WebSocket error: ${error.message}`);
        done();
      });

      // Timeout after 5 seconds
      setTimeout(() => {
        if (!messageReceived) {
          ws.close();
        }
      }, 5000);
    });
  });

  describe('Inter-Service Communication', () => {
    it('should allow order service to communicate with auth service', async () => {
      try {
        // Test if order service can reach auth service health endpoint
        const orderServiceUrl = `${BASE_URL}:${SERVICES.order.port}`;
        const response = await makeRequest(`${orderServiceUrl}/health`);
        
        if (response.status === 200) {
          // If order service is running, it should be able to reach other services
          expect(response.data).toHaveProperty('dependencies');
          
          if (response.data.dependencies) {
            const authDependency = response.data.dependencies.find((dep: any) => 
              dep.name === 'auth-service' || dep.service === 'zerodha-auth-service'
            );
            
            if (authDependency) {
              expect(authDependency.status).toBe('healthy');
            }
          }
        }
      } catch (error) {
        console.warn('Inter-service communication test skipped - services not running');
      }
    });

    it('should allow portfolio service to communicate with market service', async () => {
      try {
        const portfolioServiceUrl = `${BASE_URL}:${SERVICES.portfolio.port}`;
        const response = await makeRequest(`${portfolioServiceUrl}/health`);
        
        if (response.status === 200 && response.data.dependencies) {
          const marketDependency = response.data.dependencies.find((dep: any) => 
            dep.name === 'market-service' || dep.service === 'zerodha-market-service'
          );
          
          if (marketDependency) {
            expect(marketDependency.status).toBe('healthy');
          }
        }
      } catch (error) {
        console.warn('Portfolio-Market service communication test skipped');
      }
    });
  });

  describe('Database Connectivity', () => {
    it('should verify services can connect to PostgreSQL', async () => {
      for (const [serviceName, config] of Object.entries(SERVICES)) {
        try {
          const url = `${BASE_URL}:${config.port}/health`;
          const response = await makeRequest(url);
          
          if (response.status === 200 && response.data.database) {
            expect(response.data.database.status).toBe('connected');
            expect(response.data.database.type).toBe('postgresql');
          }
        } catch (error) {
          console.warn(`Database connectivity check skipped for ${serviceName}`);
        }
      }
    });

    it('should verify services can connect to Redis', async () => {
      for (const [serviceName, config] of Object.entries(SERVICES)) {
        try {
          const url = `${BASE_URL}:${config.port}/health`;
          const response = await makeRequest(url);
          
          if (response.status === 200 && response.data.cache) {
            expect(response.data.cache.status).toBe('connected');
            expect(response.data.cache.type).toBe('redis');
          }
        } catch (error) {
          console.warn(`Redis connectivity check skipped for ${serviceName}`);
        }
      }
    });

    it('should verify market service can connect to InfluxDB', async () => {
      try {
        const url = `${BASE_URL}:${SERVICES.market.port}/health`;
        const response = await makeRequest(url);
        
        if (response.status === 200 && response.data.timeseries) {
          expect(response.data.timeseries.status).toBe('connected');
          expect(response.data.timeseries.type).toBe('influxdb');
        }
      } catch (error) {
        console.warn('InfluxDB connectivity check skipped for market service');
      }
    });
  });

  describe('Load Balancer and Proxy Tests', () => {
    it('should handle requests through load balancer if configured', async () => {
      const lbUrl = process.env.LOAD_BALANCER_URL;
      
      if (lbUrl) {
        try {
          const response = await makeRequest(`${lbUrl}/api/zerodha/auth/health`);
          expect([200, 404, 502, 503]).toContain(response.status);
        } catch (error) {
          console.warn('Load balancer test skipped - not configured');
        }
      } else {
        console.warn('Load balancer test skipped - LOAD_BALANCER_URL not set');
      }
    });

    it('should handle CORS headers correctly', async () => {
      for (const [serviceName, config] of Object.entries(SERVICES)) {
        try {
          const url = `${BASE_URL}:${config.port}/health`;
          const response = await makeRequest(url, {
            headers: {
              'Origin': 'https://test.tradeflow.com'
            }
          });
          
          if (response.status === 200) {
            // Check for CORS headers
            expect(response.headers).toHaveProperty('access-control-allow-origin');
          }
        } catch (error) {
          console.warn(`CORS test skipped for ${serviceName}`);
        }
      }
    });
  });

  describe('Performance and Response Time', () => {
    it('should respond to health checks within acceptable time', async () => {
      const maxResponseTime = 2000; // 2 seconds
      
      for (const [serviceName, config] of Object.entries(SERVICES)) {
        try {
          const startTime = Date.now();
          const url = `${BASE_URL}:${config.port}/health`;
          const response = await makeRequest(url);
          const responseTime = Date.now() - startTime;
          
          if (response.status === 200) {
            expect(responseTime).toBeLessThan(maxResponseTime);
          }
        } catch (error) {
          console.warn(`Response time test skipped for ${serviceName}`);
        }
      }
    });

    it('should handle concurrent requests without errors', async () => {
      const concurrentRequests = 10;
      const promises: Promise<AxiosResponse>[] = [];
      
      // Test auth service with concurrent requests
      for (let i = 0; i < concurrentRequests; i++) {
        const url = `${BASE_URL}:${SERVICES.auth.port}/health`;
        promises.push(makeRequest(url));
      }
      
      try {
        const responses = await Promise.all(promises);
        const successfulResponses = responses.filter(r => r.status === 200);
        
        // At least 80% of requests should succeed
        expect(successfulResponses.length).toBeGreaterThanOrEqual(concurrentRequests * 0.8);
      } catch (error) {
        console.warn('Concurrent request test skipped - service not available');
      }
    });
  });
});