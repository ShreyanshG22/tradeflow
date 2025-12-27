import { Router, Request, Response } from 'express';
import { DatabaseService } from '../services/database';
import { RedisService } from '../services/redis';
import { ApiResponse } from '../types';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  try {
    const response: ApiResponse = {
      success: true,
      data: {
        service: 'strategy-service',
        status: 'healthy',
        timestamp: new Date(),
        version: '1.0.0',
      },
      timestamp: new Date(),
      requestId: req.headers['x-request-id'] as string || 'unknown',
    };

    res.json(response);
  } catch (error) {
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'HEALTH_CHECK_FAILED',
        message: 'Health check failed',
      },
      timestamp: new Date(),
      requestId: req.headers['x-request-id'] as string || 'unknown',
    };

    res.status(500).json(response);
  }
});

router.get('/detailed', async (req: Request, res: Response) => {
  const checks = {
    database: false,
    redis: false,
  };

  try {
    // Check database connection
    await DatabaseService.query('SELECT 1');
    checks.database = true;
  } catch (error) {
    // Database check failed
  }

  try {
    // Check Redis connection
    await RedisService.set('health_check', 'ok', 10);
    const result = await RedisService.get('health_check');
    checks.redis = result === 'ok';
  } catch (error) {
    // Redis check failed
  }

  const allHealthy = Object.values(checks).every(check => check);

  const response: ApiResponse = {
    success: allHealthy,
    data: {
      service: 'strategy-service',
      status: allHealthy ? 'healthy' : 'unhealthy',
      checks,
      timestamp: new Date(),
      version: '1.0.0',
    },
    timestamp: new Date(),
    requestId: req.headers['x-request-id'] as string || 'unknown',
  };

  res.status(allHealthy ? 200 : 503).json(response);
});

export { router as healthRoutes };