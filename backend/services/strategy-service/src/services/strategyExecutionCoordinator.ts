import { DatabaseService } from './database';
import { RedisService } from './redis';
import { logger } from '../utils/logger';
import { createError } from '../middleware/errorHandler';
import { StrategyService } from './strategyService';
import { StrategyValidationEngine } from './strategyValidationEngine';
import { 
  Strategy
} from '../types';

export interface StrategyExecution {
  id: string;
  strategyId: string;
  portfolioId: string;
  status: 'pending' | 'running' | 'paused' | 'stopped' | 'completed' | 'failed';
  executionMode: 'paper' | 'live' | 'backtest';
  startedAt?: Date;
  completedAt?: Date;
  errorMessage?: string;
  executionParams?: Record<string, any>;
  performance?: ExecutionPerformance;
}

export interface ExecutionPerformance {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  totalPnL: number;
  unrealizedPnL: number;
  realizedPnL: number;
  maxDrawdown: number;
  currentDrawdown: number;
  sharpeRatio: number;
  lastUpdated: Date;
}

export interface StartExecutionRequest {
  strategyId: string;
  portfolioId: string;
  executionMode: 'paper' | 'live' | 'backtest';
  executionParams?: Record<string, any>;
}

export interface ExecutionCommand {
  type: 'start' | 'stop' | 'pause' | 'resume';
  executionId: string;
  userId: string;
  timestamp: Date;
  params?: Record<string, any>;
}

export interface ExecutionStatus {
  execution: StrategyExecution;
  strategy: Strategy;
  isActive: boolean;
  uptime: number;
  lastHeartbeat?: Date;
  cpuUsage?: number;
  memoryUsage?: number;
}

export interface PerformanceAlert {
  executionId: string;
  alertType: 'drawdown' | 'loss_limit' | 'position_limit' | 'error' | 'performance';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  value?: number;
  threshold?: number;
  timestamp: Date;
}

export class StrategyExecutionCoordinator {
  private strategyService: StrategyService;
  private validationEngine: StrategyValidationEngine;
  private activeExecutions: Map<string, StrategyExecution> = new Map();
  private executionHeartbeats: Map<string, Date> = new Map();
  private performanceMonitorInterval?: NodeJS.Timeout;

  constructor() {
    this.strategyService = new StrategyService();
    this.validationEngine = new StrategyValidationEngine();
    this.startPerformanceMonitoring();
  }

  /**
   * Start strategy execution
   */
  async startExecution(userId: string, request: StartExecutionRequest): Promise<StrategyExecution> {
    try {
      // Validate strategy exists and belongs to user
      const strategy = await this.strategyService.getStrategyById(request.strategyId, userId);
      
      // Validate strategy configuration
      const validation = this.validationEngine.validateStrategy(strategy.config);
      if (!validation.isValid) {
        throw createError(
          'Cannot execute invalid strategy', 
          400, 
          'INVALID_STRATEGY_FOR_EXECUTION',
          { errors: validation.errors }
        );
      }

      // Check if strategy is already running
      const existingExecution = await this.getActiveExecutionForStrategy(request.strategyId);
      if (existingExecution) {
        throw createError(
          'Strategy is already running', 
          409, 
          'STRATEGY_ALREADY_RUNNING',
          { executionId: existingExecution.id }
        );
      }

      // Create execution record
      const execution = await this.createExecutionRecord(userId, request);
      
      // Send execution command to C++ engine
      await this.sendExecutionCommand({
        type: 'start',
        executionId: execution.id,
        userId,
        timestamp: new Date(),
        params: {
          strategy: strategy.config,
          portfolioId: request.portfolioId,
          executionMode: request.executionMode,
          ...request.executionParams
        }
      });

      // Update execution status
      execution.status = 'running';
      execution.startedAt = new Date();
      await this.updateExecutionRecord(execution);

      // Add to active executions
      this.activeExecutions.set(execution.id, execution);
      this.executionHeartbeats.set(execution.id, new Date());

      logger.info('Strategy execution started', {
        executionId: execution.id,
        strategyId: request.strategyId,
        userId,
        executionMode: request.executionMode
      });

      return execution;
    } catch (error) {
      logger.error('Failed to start strategy execution:', error);
      if (error.statusCode) {
        throw error;
      }
      throw createError('Failed to start strategy execution', 500, 'EXECUTION_START_FAILED');
    }
  }

  /**
   * Stop strategy execution
   */
  async stopExecution(executionId: string, userId: string): Promise<void> {
    try {
      const execution = await this.getExecutionById(executionId, userId);
      
      if (!['running', 'paused'].includes(execution.status)) {
        throw createError(
          'Cannot stop execution in current state', 
          400, 
          'INVALID_EXECUTION_STATE',
          { currentStatus: execution.status }
        );
      }

      // Send stop command to C++ engine
      await this.sendExecutionCommand({
        type: 'stop',
        executionId,
        userId,
        timestamp: new Date()
      });

      // Update execution status
      execution.status = 'stopped';
      execution.completedAt = new Date();
      await this.updateExecutionRecord(execution);

      // Remove from active executions
      this.activeExecutions.delete(executionId);
      this.executionHeartbeats.delete(executionId);

      logger.info('Strategy execution stopped', {
        executionId,
        userId,
        duration: execution.completedAt.getTime() - (execution.startedAt?.getTime() || 0)
      });
    } catch (error) {
      logger.error('Failed to stop strategy execution:', error);
      if (error.statusCode) {
        throw error;
      }
      throw createError('Failed to stop strategy execution', 500, 'EXECUTION_STOP_FAILED');
    }
  }

  /**
   * Pause strategy execution
   */
  async pauseExecution(executionId: string, userId: string): Promise<void> {
    try {
      const execution = await this.getExecutionById(executionId, userId);
      
      if (execution.status !== 'running') {
        throw createError(
          'Can only pause running executions', 
          400, 
          'INVALID_EXECUTION_STATE',
          { currentStatus: execution.status }
        );
      }

      // Send pause command to C++ engine
      await this.sendExecutionCommand({
        type: 'pause',
        executionId,
        userId,
        timestamp: new Date()
      });

      // Update execution status
      execution.status = 'paused';
      await this.updateExecutionRecord(execution);

      logger.info('Strategy execution paused', { executionId, userId });
    } catch (error) {
      logger.error('Failed to pause strategy execution:', error);
      if (error.statusCode) {
        throw error;
      }
      throw createError('Failed to pause strategy execution', 500, 'EXECUTION_PAUSE_FAILED');
    }
  }

  /**
   * Resume strategy execution
   */
  async resumeExecution(executionId: string, userId: string): Promise<void> {
    try {
      const execution = await this.getExecutionById(executionId, userId);
      
      if (execution.status !== 'paused') {
        throw createError(
          'Can only resume paused executions', 
          400, 
          'INVALID_EXECUTION_STATE',
          { currentStatus: execution.status }
        );
      }

      // Send resume command to C++ engine
      await this.sendExecutionCommand({
        type: 'resume',
        executionId,
        userId,
        timestamp: new Date()
      });

      // Update execution status
      execution.status = 'running';
      await this.updateExecutionRecord(execution);

      // Update heartbeat
      this.executionHeartbeats.set(executionId, new Date());

      logger.info('Strategy execution resumed', { executionId, userId });
    } catch (error) {
      logger.error('Failed to resume strategy execution:', error);
      if (error.statusCode) {
        throw error;
      }
      throw createError('Failed to resume strategy execution', 500, 'EXECUTION_RESUME_FAILED');
    }
  }

  /**
   * Get execution status
   */
  async getExecutionStatus(executionId: string, userId: string): Promise<ExecutionStatus> {
    try {
      const execution = await this.getExecutionById(executionId, userId);
      const strategy = await this.strategyService.getStrategyById(execution.strategyId, userId);
      
      const isActive = ['running', 'paused'].includes(execution.status);
      const uptime = execution.startedAt 
        ? Date.now() - execution.startedAt.getTime() 
        : 0;
      
      const lastHeartbeat = this.executionHeartbeats.get(executionId);

      return {
        execution,
        strategy,
        isActive,
        uptime,
        lastHeartbeat,
        cpuUsage: await this.getCpuUsage(executionId),
        memoryUsage: await this.getMemoryUsage(executionId)
      };
    } catch (error) {
      logger.error('Failed to get execution status:', error);
      if (error.statusCode) {
        throw error;
      }
      throw createError('Failed to get execution status', 500, 'EXECUTION_STATUS_FAILED');
    }
  }

  /**
   * Get all executions for a user
   */
  async getUserExecutions(
    userId: string, 
    filters: { status?: string; executionMode?: string } = {},
    pagination: { page?: number; limit?: number } = {}
  ): Promise<{ executions: StrategyExecution[]; total: number }> {
    try {
      const page = pagination.page || 1;
      const limit = Math.min(pagination.limit || 20, 100);
      const offset = (page - 1) * limit;

      // Build WHERE clause
      const conditions = ['s.user_id = $1'];
      const params: any[] = [userId];
      let paramIndex = 2;

      if (filters.status) {
        conditions.push(`se.status = $${paramIndex}`);
        params.push(filters.status);
        paramIndex++;
      }

      if (filters.executionMode) {
        conditions.push(`se.execution_mode = $${paramIndex}`);
        params.push(filters.executionMode);
        paramIndex++;
      }

      const whereClause = conditions.join(' AND ');

      // Get total count
      const countResult = await DatabaseService.query(`
        SELECT COUNT(*) as total 
        FROM trading.strategy_executions se
        JOIN trading.strategies s ON se.strategy_id = s.id
        WHERE ${whereClause}
      `, params);
      const total = parseInt(countResult.rows[0].total);

      // Get executions
      const result = await DatabaseService.query(`
        SELECT se.*, s.name as strategy_name
        FROM trading.strategy_executions se
        JOIN trading.strategies s ON se.strategy_id = s.id
        WHERE ${whereClause}
        ORDER BY se.started_at DESC
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `, [...params, limit, offset]);

      const executions = result.rows.map(row => this.mapDbRowToExecution(row));

      return { executions, total };
    } catch (error) {
      logger.error('Failed to get user executions:', error);
      throw createError('Failed to retrieve executions', 500, 'EXECUTIONS_GET_FAILED');
    }
  }

  /**
   * Update execution performance metrics
   */
  async updateExecutionPerformance(executionId: string, performance: ExecutionPerformance): Promise<void> {
    try {
      const execution = this.activeExecutions.get(executionId);
      if (!execution) {
        logger.warn('Received performance update for inactive execution', { executionId });
        return;
      }

      execution.performance = performance;
      
      // Update heartbeat
      this.executionHeartbeats.set(executionId, new Date());

      // Check for performance alerts
      await this.checkPerformanceAlerts(executionId, performance);

      // Cache performance data
      await this.cachePerformanceData(executionId, performance);

      logger.debug('Execution performance updated', {
        executionId,
        totalTrades: performance.totalTrades,
        totalPnL: performance.totalPnL,
        currentDrawdown: performance.currentDrawdown
      });
    } catch (error) {
      logger.error('Failed to update execution performance:', error);
    }
  }

  /**
   * Handle execution error
   */
  async handleExecutionError(executionId: string, error: string): Promise<void> {
    try {
      const execution = this.activeExecutions.get(executionId);
      if (!execution) {
        logger.warn('Received error for unknown execution', { executionId });
        return;
      }

      execution.status = 'failed';
      execution.errorMessage = error;
      execution.completedAt = new Date();

      await this.updateExecutionRecord(execution);

      // Remove from active executions
      this.activeExecutions.delete(executionId);
      this.executionHeartbeats.delete(executionId);

      // Send alert
      await this.sendPerformanceAlert({
        executionId,
        alertType: 'error',
        severity: 'critical',
        message: `Strategy execution failed: ${error}`,
        timestamp: new Date()
      });

      logger.error('Strategy execution failed', { executionId, error });
    } catch (updateError) {
      logger.error('Failed to handle execution error:', updateError);
    }
  }

  /**
   * Get active execution for strategy
   */
  private async getActiveExecutionForStrategy(strategyId: string): Promise<StrategyExecution | null> {
    try {
      const result = await DatabaseService.query(`
        SELECT * FROM trading.strategy_executions 
        WHERE strategy_id = $1 AND status IN ('running', 'paused')
        ORDER BY started_at DESC
        LIMIT 1
      `, [strategyId]);

      return result.rows.length > 0 ? this.mapDbRowToExecution(result.rows[0]) : null;
    } catch (error) {
      logger.error('Failed to get active execution for strategy:', error);
      return null;
    }
  }

  /**
   * Create execution record in database
   */
  private async createExecutionRecord(userId: string, request: StartExecutionRequest): Promise<StrategyExecution> {
    const result = await DatabaseService.query(`
      INSERT INTO trading.strategy_executions (
        strategy_id, portfolio_id, status, execution_mode, execution_params
      ) VALUES ($1, $2, 'pending', $3, $4)
      RETURNING *
    `, [
      request.strategyId,
      request.portfolioId,
      request.executionMode,
      JSON.stringify(request.executionParams || {})
    ]);

    return this.mapDbRowToExecution(result.rows[0]);
  }

  /**
   * Update execution record in database
   */
  private async updateExecutionRecord(execution: StrategyExecution): Promise<void> {
    await DatabaseService.query(`
      UPDATE trading.strategy_executions 
      SET status = $1, started_at = $2, completed_at = $3, error_message = $4
      WHERE id = $5
    `, [
      execution.status,
      execution.startedAt,
      execution.completedAt,
      execution.errorMessage,
      execution.id
    ]);
  }

  /**
   * Get execution by ID
   */
  private async getExecutionById(executionId: string, userId: string): Promise<StrategyExecution> {
    const result = await DatabaseService.query(`
      SELECT se.* FROM trading.strategy_executions se
      JOIN trading.strategies s ON se.strategy_id = s.id
      WHERE se.id = $1 AND s.user_id = $2
    `, [executionId, userId]);

    if (result.rows.length === 0) {
      throw createError('Execution not found', 404, 'EXECUTION_NOT_FOUND');
    }

    return this.mapDbRowToExecution(result.rows[0]);
  }

  /**
   * Send execution command to C++ engine via Redis
   */
  private async sendExecutionCommand(command: ExecutionCommand): Promise<void> {
    try {
      const channel = 'strategy_execution_commands';
      const message = JSON.stringify(command);
      
      await RedisService.publish(channel, message);
      
      logger.debug('Execution command sent', {
        type: command.type,
        executionId: command.executionId,
        channel
      });
    } catch (error) {
      logger.error('Failed to send execution command:', error);
      throw createError('Failed to communicate with execution engine', 500, 'COMMAND_SEND_FAILED');
    }
  }

  /**
   * Start performance monitoring
   */
  private startPerformanceMonitoring(): void {
    this.performanceMonitorInterval = setInterval(async () => {
      try {
        await this.monitorActiveExecutions();
      } catch (error) {
        logger.error('Performance monitoring error:', error);
      }
    }, 30000); // Monitor every 30 seconds

    logger.info('Performance monitoring started');
  }

  /**
   * Monitor active executions for health and performance
   */
  private async monitorActiveExecutions(): Promise<void> {
    const now = new Date();
    const staleThreshold = 5 * 60 * 1000; // 5 minutes

    for (const [executionId, execution] of this.activeExecutions) {
      const lastHeartbeat = this.executionHeartbeats.get(executionId);
      
      if (!lastHeartbeat || (now.getTime() - lastHeartbeat.getTime()) > staleThreshold) {
        logger.warn('Execution appears stale', {
          executionId,
          lastHeartbeat,
          timeSinceHeartbeat: lastHeartbeat ? now.getTime() - lastHeartbeat.getTime() : 'never'
        });

        // Send alert for stale execution
        await this.sendPerformanceAlert({
          executionId,
          alertType: 'error',
          severity: 'high',
          message: 'Strategy execution appears to be unresponsive',
          timestamp: now
        });
      }
    }
  }

  /**
   * Check for performance alerts
   */
  private async checkPerformanceAlerts(executionId: string, performance: ExecutionPerformance): Promise<void> {
    // Check drawdown alert
    if (performance.currentDrawdown > 0.15) { // 15% drawdown
      await this.sendPerformanceAlert({
        executionId,
        alertType: 'drawdown',
        severity: performance.currentDrawdown > 0.25 ? 'critical' : 'high',
        message: `High drawdown detected: ${(performance.currentDrawdown * 100).toFixed(2)}%`,
        value: performance.currentDrawdown,
        threshold: 0.15,
        timestamp: new Date()
      });
    }

    // Check loss limit alert
    if (performance.totalPnL < -1000) { // $1000 loss
      await this.sendPerformanceAlert({
        executionId,
        alertType: 'loss_limit',
        severity: 'high',
        message: `Significant losses detected: $${performance.totalPnL.toFixed(2)}`,
        value: performance.totalPnL,
        threshold: -1000,
        timestamp: new Date()
      });
    }
  }

  /**
   * Send performance alert
   */
  private async sendPerformanceAlert(alert: PerformanceAlert): Promise<void> {
    try {
      const channel = 'strategy_performance_alerts';
      const message = JSON.stringify(alert);
      
      await RedisService.publish(channel, message);
      
      logger.info('Performance alert sent', {
        executionId: alert.executionId,
        alertType: alert.alertType,
        severity: alert.severity
      });
    } catch (error) {
      logger.error('Failed to send performance alert:', error);
    }
  }

  /**
   * Cache performance data
   */
  private async cachePerformanceData(executionId: string, performance: ExecutionPerformance): Promise<void> {
    try {
      const key = `execution_performance:${executionId}`;
      await RedisService.set(key, JSON.stringify(performance), 300); // 5 minute TTL
    } catch (error) {
      logger.warn('Failed to cache performance data:', error);
    }
  }

  /**
   * Get CPU usage for execution
   */
  private async getCpuUsage(executionId: string): Promise<number | undefined> {
    try {
      const key = `execution_cpu:${executionId}`;
      const cached = await RedisService.get(key);
      return cached ? parseFloat(cached) : undefined;
    } catch (error) {
      return undefined;
    }
  }

  /**
   * Get memory usage for execution
   */
  private async getMemoryUsage(executionId: string): Promise<number | undefined> {
    try {
      const key = `execution_memory:${executionId}`;
      const cached = await RedisService.get(key);
      return cached ? parseFloat(cached) : undefined;
    } catch (error) {
      return undefined;
    }
  }

  /**
   * Map database row to StrategyExecution object
   */
  private mapDbRowToExecution(row: any): StrategyExecution {
    return {
      id: row.id,
      strategyId: row.strategy_id,
      portfolioId: row.portfolio_id,
      status: row.status,
      executionMode: row.execution_mode,
      startedAt: row.started_at ? new Date(row.started_at) : undefined,
      completedAt: row.completed_at ? new Date(row.completed_at) : undefined,
      errorMessage: row.error_message,
      executionParams: row.execution_params ? JSON.parse(row.execution_params) : undefined
    };
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    if (this.performanceMonitorInterval) {
      clearInterval(this.performanceMonitorInterval);
    }
    logger.info('Strategy execution coordinator destroyed');
  }
}