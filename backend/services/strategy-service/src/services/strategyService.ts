import { DatabaseService } from './database';
import { RedisService } from './redis';
import { logger } from '../utils/logger';
import { createError } from '../middleware/errorHandler';
import { 
  Strategy, 
  StrategyConfig, 
  ApiResponse, 
  PaginatedResponse 
} from '../types';

export interface CreateStrategyRequest {
  name: string;
  description?: string;
  config: StrategyConfig;
  tags?: string[];
  isTemplate?: boolean;
}

export interface UpdateStrategyRequest {
  name?: string;
  description?: string;
  config?: StrategyConfig;
  tags?: string[];
  isActive?: boolean;
}

export interface StrategyFilters {
  isActive?: boolean;
  isTemplate?: boolean;
  tags?: string[];
  search?: string;
}

export interface PaginationOptions {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'ASC' | 'DESC';
}

export class StrategyService {
  
  /**
   * Create a new strategy for a user
   */
  async createStrategy(userId: string, data: CreateStrategyRequest): Promise<Strategy> {
    try {
      // Validate strategy configuration
      this.validateStrategyConfig(data.config);

      const result = await DatabaseService.query(`
        INSERT INTO trading.strategies (
          user_id, name, description, config_json, tags, is_template, version
        ) VALUES ($1, $2, $3, $4, $5, $6, 1)
        RETURNING *
      `, [
        userId,
        data.name,
        data.description || null,
        JSON.stringify(data.config),
        data.tags || [],
        data.isTemplate || false
      ]);

      const strategy = this.mapDbRowToStrategy(result.rows[0]);
      
      // Cache the strategy
      await this.cacheStrategy(strategy);
      
      logger.info('Strategy created successfully', {
        strategyId: strategy.id,
        userId,
        name: data.name
      });

      return strategy;
    } catch (error) {
      logger.error('Failed to create strategy:', error);
      throw createError('Failed to create strategy', 500, 'STRATEGY_CREATE_FAILED');
    }
  }

  /**
   * Get strategy by ID
   */
  async getStrategyById(strategyId: string, userId: string): Promise<Strategy> {
    try {
      // Try cache first
      const cached = await this.getCachedStrategy(strategyId);
      if (cached && cached.userId === userId) {
        return cached;
      }

      const result = await DatabaseService.query(`
        SELECT * FROM trading.strategies 
        WHERE id = $1 AND user_id = $2
      `, [strategyId, userId]);

      if (result.rows.length === 0) {
        throw createError('Strategy not found', 404, 'STRATEGY_NOT_FOUND');
      }

      const strategy = this.mapDbRowToStrategy(result.rows[0]);
      
      // Cache the strategy
      await this.cacheStrategy(strategy);
      
      return strategy;
    } catch (error) {
      if (error.statusCode === 404) {
        throw error;
      }
      logger.error('Failed to get strategy:', error);
      throw createError('Failed to retrieve strategy', 500, 'STRATEGY_GET_FAILED');
    }
  }

  /**
   * Get strategies for a user with filtering and pagination
   */
  async getStrategies(
    userId: string, 
    filters: StrategyFilters = {}, 
    pagination: PaginationOptions = {}
  ): Promise<PaginatedResponse<Strategy>> {
    try {
      const page = pagination.page || 1;
      const limit = Math.min(pagination.limit || 20, 100); // Max 100 per page
      const offset = (page - 1) * limit;
      const sortBy = pagination.sortBy || 'created_at';
      const sortOrder = pagination.sortOrder || 'DESC';

      // Build WHERE clause
      const conditions = ['user_id = $1'];
      const params: any[] = [userId];
      let paramIndex = 2;

      if (filters.isActive !== undefined) {
        conditions.push(`is_active = $${paramIndex}`);
        params.push(filters.isActive);
        paramIndex++;
      }

      if (filters.isTemplate !== undefined) {
        conditions.push(`is_template = $${paramIndex}`);
        params.push(filters.isTemplate);
        paramIndex++;
      }

      if (filters.tags && filters.tags.length > 0) {
        conditions.push(`tags && $${paramIndex}`);
        params.push(filters.tags);
        paramIndex++;
      }

      if (filters.search) {
        conditions.push(`(name ILIKE $${paramIndex} OR description ILIKE $${paramIndex})`);
        params.push(`%${filters.search}%`);
        paramIndex++;
      }

      const whereClause = conditions.join(' AND ');

      // Get total count
      const countResult = await DatabaseService.query(`
        SELECT COUNT(*) as total FROM trading.strategies WHERE ${whereClause}
      `, params);
      const total = parseInt(countResult.rows[0].total);

      // Get strategies
      const result = await DatabaseService.query(`
        SELECT * FROM trading.strategies 
        WHERE ${whereClause}
        ORDER BY ${sortBy} ${sortOrder}
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `, [...params, limit, offset]);

      const strategies = result.rows.map(row => this.mapDbRowToStrategy(row));
      const totalPages = Math.ceil(total / limit);

      return {
        success: true,
        data: strategies,
        pagination: {
          page,
          limit,
          total,
          totalPages
        },
        timestamp: new Date(),
        requestId: 'unknown' // Will be set by controller
      };
    } catch (error) {
      logger.error('Failed to get strategies:', error);
      throw createError('Failed to retrieve strategies', 500, 'STRATEGIES_GET_FAILED');
    }
  }

  /**
   * Update strategy
   */
  async updateStrategy(
    strategyId: string, 
    userId: string, 
    data: UpdateStrategyRequest
  ): Promise<Strategy> {
    try {
      // Check if strategy exists and belongs to user
      await this.getStrategyById(strategyId, userId);

      // Validate config if provided
      if (data.config) {
        this.validateStrategyConfig(data.config);
      }

      // Build update query
      const updateFields: string[] = [];
      const params: any[] = [];
      let paramIndex = 1;

      if (data.name !== undefined) {
        updateFields.push(`name = $${paramIndex}`);
        params.push(data.name);
        paramIndex++;
      }

      if (data.description !== undefined) {
        updateFields.push(`description = $${paramIndex}`);
        params.push(data.description);
        paramIndex++;
      }

      if (data.config !== undefined) {
        updateFields.push(`config_json = $${paramIndex}`);
        params.push(JSON.stringify(data.config));
        paramIndex++;
      }

      if (data.tags !== undefined) {
        updateFields.push(`tags = $${paramIndex}`);
        params.push(data.tags);
        paramIndex++;
      }

      if (data.isActive !== undefined) {
        updateFields.push(`is_active = $${paramIndex}`);
        params.push(data.isActive);
        paramIndex++;
      }

      if (updateFields.length === 0) {
        throw createError('No fields to update', 400, 'NO_UPDATE_FIELDS');
      }

      updateFields.push(`updated_at = NOW()`);
      params.push(strategyId, userId);

      const result = await DatabaseService.query(`
        UPDATE trading.strategies 
        SET ${updateFields.join(', ')}
        WHERE id = $${paramIndex} AND user_id = $${paramIndex + 1}
        RETURNING *
      `, params);

      const strategy = this.mapDbRowToStrategy(result.rows[0]);
      
      // Update cache
      await this.cacheStrategy(strategy);
      
      logger.info('Strategy updated successfully', {
        strategyId,
        userId,
        updatedFields: Object.keys(data)
      });

      return strategy;
    } catch (error) {
      if (error.statusCode) {
        throw error;
      }
      logger.error('Failed to update strategy:', error);
      throw createError('Failed to update strategy', 500, 'STRATEGY_UPDATE_FAILED');
    }
  }

  /**
   * Delete strategy
   */
  async deleteStrategy(strategyId: string, userId: string): Promise<void> {
    try {
      // Check if strategy exists and belongs to user
      await this.getStrategyById(strategyId, userId);

      // Check if strategy is currently being executed
      const executionResult = await DatabaseService.query(`
        SELECT COUNT(*) as count FROM trading.strategy_executions 
        WHERE strategy_id = $1 AND status IN ('pending', 'running')
      `, [strategyId]);

      if (parseInt(executionResult.rows[0].count) > 0) {
        throw createError(
          'Cannot delete strategy with active executions', 
          400, 
          'STRATEGY_HAS_ACTIVE_EXECUTIONS'
        );
      }

      await DatabaseService.query(`
        DELETE FROM trading.strategies 
        WHERE id = $1 AND user_id = $2
      `, [strategyId, userId]);

      // Remove from cache
      await this.removeCachedStrategy(strategyId);
      
      logger.info('Strategy deleted successfully', {
        strategyId,
        userId
      });
    } catch (error) {
      if (error.statusCode) {
        throw error;
      }
      logger.error('Failed to delete strategy:', error);
      throw createError('Failed to delete strategy', 500, 'STRATEGY_DELETE_FAILED');
    }
  }

  /**
   * Create a new version of an existing strategy
   */
  async createStrategyVersion(
    strategyId: string, 
    userId: string, 
    data: UpdateStrategyRequest
  ): Promise<Strategy> {
    try {
      const originalStrategy = await this.getStrategyById(strategyId, userId);

      // Validate config if provided
      if (data.config) {
        this.validateStrategyConfig(data.config);
      }

      const result = await DatabaseService.query(`
        INSERT INTO trading.strategies (
          user_id, name, description, config_json, tags, is_template, 
          version, parent_strategy_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
      `, [
        userId,
        data.name || originalStrategy.name,
        data.description !== undefined ? data.description : originalStrategy.description,
        JSON.stringify(data.config || originalStrategy.config),
        data.tags !== undefined ? data.tags : [], // Reset tags for new version
        false, // New versions are not templates
        originalStrategy.version + 1,
        strategyId
      ]);

      const newStrategy = this.mapDbRowToStrategy(result.rows[0]);
      
      // Cache the new strategy
      await this.cacheStrategy(newStrategy);
      
      logger.info('Strategy version created successfully', {
        originalStrategyId: strategyId,
        newStrategyId: newStrategy.id,
        version: newStrategy.version,
        userId
      });

      return newStrategy;
    } catch (error) {
      if (error.statusCode) {
        throw error;
      }
      logger.error('Failed to create strategy version:', error);
      throw createError('Failed to create strategy version', 500, 'STRATEGY_VERSION_CREATE_FAILED');
    }
  }

  /**
   * Get strategy versions
   */
  async getStrategyVersions(strategyId: string, userId: string): Promise<Strategy[]> {
    try {
      // Verify user owns the original strategy
      await this.getStrategyById(strategyId, userId);

      const result = await DatabaseService.query(`
        SELECT * FROM trading.strategies 
        WHERE (id = $1 OR parent_strategy_id = $1) AND user_id = $2
        ORDER BY version ASC
      `, [strategyId, userId]);

      return result.rows.map(row => this.mapDbRowToStrategy(row));
    } catch (error) {
      if (error.statusCode) {
        throw error;
      }
      logger.error('Failed to get strategy versions:', error);
      throw createError('Failed to retrieve strategy versions', 500, 'STRATEGY_VERSIONS_GET_FAILED');
    }
  }

  /**
   * Share strategy as template
   */
  async shareAsTemplate(strategyId: string, userId: string): Promise<Strategy> {
    try {
      const strategy = await this.getStrategyById(strategyId, userId);

      const result = await DatabaseService.query(`
        INSERT INTO trading.strategies (
          user_id, name, description, config_json, tags, is_template, version
        ) VALUES ($1, $2, $3, $4, $5, true, 1)
        RETURNING *
      `, [
        userId,
        `${strategy.name} (Template)`,
        strategy.description,
        JSON.stringify(strategy.config),
        [...(strategy.tags || []), 'template']
      ]);

      const template = this.mapDbRowToStrategy(result.rows[0]);
      
      // Cache the template
      await this.cacheStrategy(template);
      
      logger.info('Strategy shared as template', {
        originalStrategyId: strategyId,
        templateId: template.id,
        userId
      });

      return template;
    } catch (error) {
      if (error.statusCode) {
        throw error;
      }
      logger.error('Failed to share strategy as template:', error);
      throw createError('Failed to share strategy as template', 500, 'STRATEGY_SHARE_FAILED');
    }
  }

  /**
   * Get public templates
   */
  async getPublicTemplates(pagination: PaginationOptions = {}): Promise<PaginatedResponse<Strategy>> {
    try {
      const page = pagination.page || 1;
      const limit = Math.min(pagination.limit || 20, 100);
      const offset = (page - 1) * limit;

      // Get total count
      const countResult = await DatabaseService.query(`
        SELECT COUNT(*) as total FROM trading.strategies WHERE is_template = true
      `);
      const total = parseInt(countResult.rows[0].total);

      // Get templates
      const result = await DatabaseService.query(`
        SELECT s.*, u.email as user_email 
        FROM trading.strategies s
        JOIN auth.users u ON s.user_id = u.id
        WHERE s.is_template = true
        ORDER BY s.created_at DESC
        LIMIT $1 OFFSET $2
      `, [limit, offset]);

      const strategies = result.rows.map(row => {
        const strategy = this.mapDbRowToStrategy(row);
        // Remove sensitive user info, keep only email for attribution
        return {
          ...strategy,
          userId: 'template', // Hide actual user ID
          userEmail: row.user_email
        };
      });

      const totalPages = Math.ceil(total / limit);

      return {
        success: true,
        data: strategies,
        pagination: {
          page,
          limit,
          total,
          totalPages
        },
        timestamp: new Date(),
        requestId: 'unknown'
      };
    } catch (error) {
      logger.error('Failed to get public templates:', error);
      throw createError('Failed to retrieve public templates', 500, 'TEMPLATES_GET_FAILED');
    }
  }

  /**
   * Validate strategy configuration
   */
  private validateStrategyConfig(config: StrategyConfig): void {
    if (!config.nodes || !Array.isArray(config.nodes)) {
      throw createError('Strategy must have nodes array', 400, 'INVALID_STRATEGY_CONFIG');
    }

    if (!config.connections || !Array.isArray(config.connections)) {
      throw createError('Strategy must have connections array', 400, 'INVALID_STRATEGY_CONFIG');
    }

    if (!config.parameters) {
      throw createError('Strategy must have parameters', 400, 'INVALID_STRATEGY_CONFIG');
    }

    // Validate nodes
    for (const node of config.nodes) {
      if (!node.id || !node.type) {
        throw createError('Each node must have id and type', 400, 'INVALID_NODE_CONFIG');
      }

      if (!['entry', 'exit', 'indicator', 'operator', 'position-size'].includes(node.type)) {
        throw createError(`Invalid node type: ${node.type}`, 400, 'INVALID_NODE_TYPE');
      }
    }

    // Validate connections
    for (const connection of config.connections) {
      if (!connection.id || !connection.source || !connection.target) {
        throw createError('Each connection must have id, source, and target', 400, 'INVALID_CONNECTION_CONFIG');
      }
    }

    // Validate parameters
    const { parameters } = config;
    if (!parameters.timeframe) {
      throw createError('Strategy must have timeframe parameter', 400, 'MISSING_TIMEFRAME');
    }

    if (!parameters.positionSizing || !parameters.riskManagement) {
      throw createError('Strategy must have position sizing and risk management parameters', 400, 'MISSING_RISK_PARAMS');
    }
  }

  /**
   * Map database row to Strategy object
   */
  private mapDbRowToStrategy(row: any): Strategy {
    return {
      id: row.id,
      userId: row.user_id,
      name: row.name,
      description: row.description,
      config: JSON.parse(row.config_json),
      version: row.version,
      isActive: row.is_active,
      isTemplate: row.is_template,
      tags: row.tags || [],
      parentStrategyId: row.parent_strategy_id,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at)
    };
  }

  /**
   * Cache strategy in Redis
   */
  private async cacheStrategy(strategy: Strategy): Promise<void> {
    try {
      const key = `strategy:${strategy.id}`;
      await RedisService.set(key, JSON.stringify(strategy), 3600); // 1 hour TTL
    } catch (error) {
      logger.warn('Failed to cache strategy:', error);
      // Don't throw error, caching is optional
    }
  }

  /**
   * Get cached strategy from Redis
   */
  private async getCachedStrategy(strategyId: string): Promise<Strategy | null> {
    try {
      const key = `strategy:${strategyId}`;
      const cached = await RedisService.get(key);
      return cached ? JSON.parse(cached) : null;
    } catch (error) {
      logger.warn('Failed to get cached strategy:', error);
      return null;
    }
  }

  /**
   * Remove strategy from cache
   */
  private async removeCachedStrategy(strategyId: string): Promise<void> {
    try {
      const key = `strategy:${strategyId}`;
      await RedisService.del(key);
    } catch (error) {
      logger.warn('Failed to remove cached strategy:', error);
      // Don't throw error, cache removal is optional
    }
  }
}