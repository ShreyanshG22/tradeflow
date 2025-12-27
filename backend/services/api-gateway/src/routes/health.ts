import { Router } from 'express';
import { loadBalancer } from '../services/loadBalancer';
import { serviceDiscovery } from '../services/serviceDiscovery';
import { logger } from '../utils/logger';

const router = Router();

// GET /api/health/status
router.get('/status', (req, res) => {
  const healthStatus = loadBalancer.getHealthStatus();
  const stats = loadBalancer.getStats();
  
  const response = {
    status: healthStatus.healthy ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: process.env.npm_package_version || '1.0.0',
    services: healthStatus.services,
    stats: {
      totalRequests: stats.totalRequests,
      successRate: stats.totalRequests > 0 
        ? ((stats.successfulRequests / stats.totalRequests) * 100).toFixed(2) + '%'
        : '0%',
      averageResponseTime: `${stats.averageResponseTime.toFixed(2)}ms`,
      requestsPerService: Object.fromEntries(stats.requestsPerService)
    }
  };

  const statusCode = healthStatus.healthy ? 200 : 503;
  res.status(statusCode).json(response);
});

// GET /api/health/services
router.get('/services', (req, res) => {
  const services = serviceDiscovery.getAllServices();
  const serviceDetails = Array.from(services.entries()).map(([name, instances]) => ({
    name,
    instances: instances.map(instance => ({
      id: instance.id,
      url: instance.url,
      healthy: instance.healthy,
      lastHealthCheck: instance.lastHealthCheck,
      responseTime: `${instance.responseTime}ms`
    }))
  }));

  res.json({
    services: serviceDetails,
    timestamp: new Date().toISOString()
  });
});

// GET /api/health/metrics
router.get('/metrics', (req, res) => {
  const stats = loadBalancer.getStats();
  
  res.json({
    metrics: {
      totalRequests: stats.totalRequests,
      successfulRequests: stats.successfulRequests,
      failedRequests: stats.failedRequests,
      successRate: stats.totalRequests > 0 
        ? (stats.successfulRequests / stats.totalRequests) * 100
        : 0,
      failureRate: stats.totalRequests > 0 
        ? (stats.failedRequests / stats.totalRequests) * 100
        : 0,
      averageResponseTime: stats.averageResponseTime,
      requestsPerService: Object.fromEntries(stats.requestsPerService)
    },
    timestamp: new Date().toISOString()
  });
});

// POST /api/health/services/:serviceName/test
router.post('/services/:serviceName/test', async (req, res) => {
  const { serviceName } = req.params;
  
  try {
    const instance = serviceDiscovery.getHealthyInstance(serviceName);
    
    if (!instance) {
      return res.status(404).json({
        error: {
          code: 'SERVICE_NOT_FOUND',
          message: `No healthy instances found for service: ${serviceName}`
        }
      });
    }

    const startTime = Date.now();
    
    // Perform a test request to the service
    const axios = require('axios');
    const response = await axios.get(`${instance.url}/health`, {
      timeout: 5000
    });
    
    const responseTime = Date.now() - startTime;
    
    res.json({
      service: serviceName,
      instance: {
        id: instance.id,
        url: instance.url
      },
      test: {
        success: true,
        responseTime: `${responseTime}ms`,
        status: response.status,
        timestamp: new Date().toISOString()
      }
    });
    
  } catch (error) {
    logger.error('Service test failed', {
      serviceName,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    
    res.status(503).json({
      service: serviceName,
      test: {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      }
    });
  }
});

export { router as healthRoutes };