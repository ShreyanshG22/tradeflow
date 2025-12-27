import { Router, Request, Response, NextFunction } from 'express';
import { StrategyService, CreateStrategyRequest, UpdateStrategyRequest } from '../services/strategyService';
import { StrategyValidationEngine, SimulationRequest } from '../services/strategyValidationEngine';
import { StrategyExecutionCoordinator, StartExecutionRequest } from '../services/strategyExecutionCoordinator';
import { authMiddleware } from '../middleware/auth';
import { validateRequest } from '../middleware/validation';
import { createError } from '../middleware/errorHandler';
import { ApiResponse } from '../types';

const router = Router();
const strategyService = new StrategyService();
const validationEngine = new StrategyValidationEngine();
const executionCoordinator = new StrategyExecutionCoordinator();

// Apply authentication middleware to all routes
router.use(authMiddleware);

/**
 * Create a new strategy
 */
router.post('/', validateRequest('createStrategy'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      throw createError('User not authenticated', 401, 'UNAUTHORIZED');
    }

    const data: CreateStrategyRequest = req.body;
    const strategy = await strategyService.createStrategy(userId, data);

    const response: ApiResponse = {
      success: true,
      data: strategy,
      timestamp: new Date(),
      requestId: req.headers['x-request-id'] as string || 'unknown',
    };

    res.status(201).json(response);
  } catch (error) {
    next(error);
  }
});

/**
 * Get strategies for the authenticated user
 */
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      throw createError('User not authenticated', 401, 'UNAUTHORIZED');
    }

    const filters = {
      isActive: req.query.isActive ? req.query.isActive === 'true' : undefined,
      isTemplate: req.query.isTemplate ? req.query.isTemplate === 'true' : undefined,
      tags: req.query.tags ? (req.query.tags as string).split(',') : undefined,
      search: req.query.search as string,
    };

    const pagination = {
      page: req.query.page ? parseInt(req.query.page as string) : undefined,
      limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
      sortBy: req.query.sortBy as string,
      sortOrder: (req.query.sortOrder as 'ASC' | 'DESC') || 'DESC',
    };

    const result = await strategyService.getStrategies(userId, filters, pagination);
    result.requestId = req.headers['x-request-id'] as string || 'unknown';

    res.json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * Get public strategy templates
 */
router.get('/templates', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const pagination = {
      page: req.query.page ? parseInt(req.query.page as string) : undefined,
      limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
    };

    const result = await strategyService.getPublicTemplates(pagination);
    result.requestId = req.headers['x-request-id'] as string || 'unknown';

    res.json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * Get strategy by ID
 */
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      throw createError('User not authenticated', 401, 'UNAUTHORIZED');
    }

    const strategyId = req.params.id;
    const strategy = await strategyService.getStrategyById(strategyId, userId);

    const response: ApiResponse = {
      success: true,
      data: strategy,
      timestamp: new Date(),
      requestId: req.headers['x-request-id'] as string || 'unknown',
    };

    res.json(response);
  } catch (error) {
    next(error);
  }
});

/**
 * Update strategy
 */
router.put('/:id', validateRequest('updateStrategy'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      throw createError('User not authenticated', 401, 'UNAUTHORIZED');
    }

    const strategyId = req.params.id;
    const data: UpdateStrategyRequest = req.body;
    const strategy = await strategyService.updateStrategy(strategyId, userId, data);

    const response: ApiResponse = {
      success: true,
      data: strategy,
      timestamp: new Date(),
      requestId: req.headers['x-request-id'] as string || 'unknown',
    };

    res.json(response);
  } catch (error) {
    next(error);
  }
});

/**
 * Delete strategy
 */
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      throw createError('User not authenticated', 401, 'UNAUTHORIZED');
    }

    const strategyId = req.params.id;
    await strategyService.deleteStrategy(strategyId, userId);

    const response: ApiResponse = {
      success: true,
      data: { message: 'Strategy deleted successfully' },
      timestamp: new Date(),
      requestId: req.headers['x-request-id'] as string || 'unknown',
    };

    res.json(response);
  } catch (error) {
    next(error);
  }
});

/**
 * Create a new version of a strategy
 */
router.post('/:id/versions', validateRequest('updateStrategy'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      throw createError('User not authenticated', 401, 'UNAUTHORIZED');
    }

    const strategyId = req.params.id;
    const data: UpdateStrategyRequest = req.body;
    const newStrategy = await strategyService.createStrategyVersion(strategyId, userId, data);

    const response: ApiResponse = {
      success: true,
      data: newStrategy,
      timestamp: new Date(),
      requestId: req.headers['x-request-id'] as string || 'unknown',
    };

    res.status(201).json(response);
  } catch (error) {
    next(error);
  }
});

/**
 * Get all versions of a strategy
 */
router.get('/:id/versions', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      throw createError('User not authenticated', 401, 'UNAUTHORIZED');
    }

    const strategyId = req.params.id;
    const versions = await strategyService.getStrategyVersions(strategyId, userId);

    const response: ApiResponse = {
      success: true,
      data: versions,
      timestamp: new Date(),
      requestId: req.headers['x-request-id'] as string || 'unknown',
    };

    res.json(response);
  } catch (error) {
    next(error);
  }
});

/**
 * Share strategy as public template
 */
router.post('/:id/share', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      throw createError('User not authenticated', 401, 'UNAUTHORIZED');
    }

    const strategyId = req.params.id;
    const template = await strategyService.shareAsTemplate(strategyId, userId);

    const response: ApiResponse = {
      success: true,
      data: template,
      timestamp: new Date(),
      requestId: req.headers['x-request-id'] as string || 'unknown',
    };

    res.status(201).json(response);
  } catch (error) {
    next(error);
  }
});

/**
 * Validate strategy configuration
 */
router.post('/validate', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { config } = req.body;
    
    if (!config) {
      throw createError('Strategy configuration is required', 400, 'MISSING_STRATEGY_CONFIG');
    }

    const validationResult = validationEngine.validateStrategy(config);

    const response: ApiResponse = {
      success: true,
      data: validationResult,
      timestamp: new Date(),
      requestId: req.headers['x-request-id'] as string || 'unknown',
    };

    res.json(response);
  } catch (error) {
    next(error);
  }
});

/**
 * Parse React Flow configuration
 */
router.post('/parse-react-flow', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { reactFlowData } = req.body;
    
    if (!reactFlowData) {
      throw createError('React Flow data is required', 400, 'MISSING_REACT_FLOW_DATA');
    }

    const strategyConfig = validationEngine.parseReactFlowConfig(reactFlowData);

    const response: ApiResponse = {
      success: true,
      data: strategyConfig,
      timestamp: new Date(),
      requestId: req.headers['x-request-id'] as string || 'unknown',
    };

    res.json(response);
  } catch (error) {
    next(error);
  }
});

/**
 * Run dry-run simulation
 */
router.post('/simulate', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      throw createError('User not authenticated', 401, 'UNAUTHORIZED');
    }

    const simulationRequest: SimulationRequest = req.body;
    
    if (!simulationRequest.strategyConfig || !simulationRequest.marketData) {
      throw createError('Strategy config and market data are required', 400, 'MISSING_SIMULATION_DATA');
    }

    const simulationResult = await validationEngine.runDryRunSimulation(simulationRequest);

    const response: ApiResponse = {
      success: true,
      data: simulationResult,
      timestamp: new Date(),
      requestId: req.headers['x-request-id'] as string || 'unknown',
    };

    res.json(response);
  } catch (error) {
    next(error);
  }
});

/**
 * Validate specific strategy by ID
 */
router.post('/:id/validate', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      throw createError('User not authenticated', 401, 'UNAUTHORIZED');
    }

    const strategyId = req.params.id;
    const strategy = await strategyService.getStrategyById(strategyId, userId);
    const validationResult = validationEngine.validateStrategy(strategy.config);

    const response: ApiResponse = {
      success: true,
      data: validationResult,
      timestamp: new Date(),
      requestId: req.headers['x-request-id'] as string || 'unknown',
    };

    res.json(response);
  } catch (error) {
    next(error);
  }
});

/**
 * Start strategy execution
 */
router.post('/:id/execute', validateRequest('strategyExecution'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      throw createError('User not authenticated', 401, 'UNAUTHORIZED');
    }

    const strategyId = req.params.id;
    const executionRequest: StartExecutionRequest = {
      strategyId,
      ...req.body
    };

    const execution = await executionCoordinator.startExecution(userId, executionRequest);

    const response: ApiResponse = {
      success: true,
      data: execution,
      timestamp: new Date(),
      requestId: req.headers['x-request-id'] as string || 'unknown',
    };

    res.status(201).json(response);
  } catch (error) {
    next(error);
  }
});

/**
 * Get strategy executions
 */
router.get('/:id/executions', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      throw createError('User not authenticated', 401, 'UNAUTHORIZED');
    }

    const filters = {
      status: req.query.status as string,
      executionMode: req.query.executionMode as string,
    };

    const pagination = {
      page: req.query.page ? parseInt(req.query.page as string) : undefined,
      limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
    };

    const result = await executionCoordinator.getUserExecutions(userId, filters, pagination);

    const response: ApiResponse = {
      success: true,
      data: result,
      timestamp: new Date(),
      requestId: req.headers['x-request-id'] as string || 'unknown',
    };

    res.json(response);
  } catch (error) {
    next(error);
  }
});

/**
 * Get execution status
 */
router.get('/executions/:executionId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      throw createError('User not authenticated', 401, 'UNAUTHORIZED');
    }

    const executionId = req.params.executionId;
    const status = await executionCoordinator.getExecutionStatus(executionId, userId);

    const response: ApiResponse = {
      success: true,
      data: status,
      timestamp: new Date(),
      requestId: req.headers['x-request-id'] as string || 'unknown',
    };

    res.json(response);
  } catch (error) {
    next(error);
  }
});

/**
 * Stop strategy execution
 */
router.post('/executions/:executionId/stop', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      throw createError('User not authenticated', 401, 'UNAUTHORIZED');
    }

    const executionId = req.params.executionId;
    await executionCoordinator.stopExecution(executionId, userId);

    const response: ApiResponse = {
      success: true,
      data: { message: 'Execution stopped successfully' },
      timestamp: new Date(),
      requestId: req.headers['x-request-id'] as string || 'unknown',
    };

    res.json(response);
  } catch (error) {
    next(error);
  }
});

/**
 * Pause strategy execution
 */
router.post('/executions/:executionId/pause', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      throw createError('User not authenticated', 401, 'UNAUTHORIZED');
    }

    const executionId = req.params.executionId;
    await executionCoordinator.pauseExecution(executionId, userId);

    const response: ApiResponse = {
      success: true,
      data: { message: 'Execution paused successfully' },
      timestamp: new Date(),
      requestId: req.headers['x-request-id'] as string || 'unknown',
    };

    res.json(response);
  } catch (error) {
    next(error);
  }
});

/**
 * Resume strategy execution
 */
router.post('/executions/:executionId/resume', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      throw createError('User not authenticated', 401, 'UNAUTHORIZED');
    }

    const executionId = req.params.executionId;
    await executionCoordinator.resumeExecution(executionId, userId);

    const response: ApiResponse = {
      success: true,
      data: { message: 'Execution resumed successfully' },
      timestamp: new Date(),
      requestId: req.headers['x-request-id'] as string || 'unknown',
    };

    res.json(response);
  } catch (error) {
    next(error);
  }
});

export { router as strategyRoutes };