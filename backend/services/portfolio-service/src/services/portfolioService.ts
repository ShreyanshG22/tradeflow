import { databaseService } from './database';
import { redisService } from './redis';
import { logger } from '../utils/logger';
import { 
  Portfolio, 
  CreatePortfolioRequest, 
  UpdatePortfolioRequest, 
  PortfolioFilter,
  PortfolioValuation,
  PortfolioSummary
} from '../types';

export class PortfolioService {
  
  async createPortfolio(userId: string, request: CreatePortfolioRequest): Promise<Portfolio> {
    try {
      const result = await databaseService.query(`
        INSERT INTO trading.portfolios (
          user_id, name, description, portfolio_type, base_currency, 
          initial_cash, cash_balance, total_value
        ) VALUES ($1, $2, $3, $4, $5, $6, $6, $6)
        RETURNING *
      `, [
        userId,
        request.name,
        request.description,
        request.portfolioType,
        request.baseCurrency || 'USD',
        request.initialCash
      ]);

      const portfolio = this.mapDbRowToPortfolio(result.rows[0]);
      
      // Cache the portfolio
      await this.cachePortfolio(portfolio);
      
      logger.info('Portfolio created', { 
        portfolioId: portfolio.id, 
        userId, 
        name: request.name 
      });
      
      return portfolio;
    } catch (error) {
      logger.error('Failed to create portfolio', { userId, request, error });
      throw error;
    }
  }

  async getPortfolio(portfolioId: string): Promise<Portfolio | null> {
    try {
      // Try cache first
      const cached = await this.getCachedPortfolio(portfolioId);
      if (cached) {
        return cached;
      }

      const result = await databaseService.query(`
        SELECT * FROM trading.portfolios WHERE id = $1
      `, [portfolioId]);

      if (result.rows.length === 0) {
        return null;
      }

      const portfolio = this.mapDbRowToPortfolio(result.rows[0]);
      
      // Cache for future requests
      await this.cachePortfolio(portfolio);
      
      return portfolio;
    } catch (error) {
      logger.error('Failed to get portfolio', { portfolioId, error });
      throw error;
    }
  }

  async getUserPortfolios(filter: PortfolioFilter): Promise<Portfolio[]> {
    try {
      let query = `
        SELECT * FROM trading.portfolios 
        WHERE user_id = $1
      `;
      const params: any[] = [filter.userId];
      let paramIndex = 2;

      if (filter.portfolioType) {
        query += ` AND portfolio_type = $${paramIndex}`;
        params.push(filter.portfolioType);
        paramIndex++;
      }

      if (filter.isActive !== undefined) {
        query += ` AND is_active = $${paramIndex}`;
        params.push(filter.isActive);
        paramIndex++;
      }

      query += ` ORDER BY created_at DESC`;

      if (filter.limit) {
        query += ` LIMIT $${paramIndex}`;
        params.push(filter.limit);
        paramIndex++;
      }

      if (filter.offset) {
        query += ` OFFSET $${paramIndex}`;
        params.push(filter.offset);
      }

      const result = await databaseService.query(query, params);
      
      return result.rows.map(row => this.mapDbRowToPortfolio(row));
    } catch (error) {
      logger.error('Failed to get user portfolios', { filter, error });
      throw error;
    }
  }

  async updatePortfolio(portfolioId: string, request: UpdatePortfolioRequest): Promise<Portfolio> {
    try {
      const updates: string[] = [];
      const params: any[] = [];
      let paramIndex = 1;

      if (request.name !== undefined) {
        updates.push(`name = $${paramIndex}`);
        params.push(request.name);
        paramIndex++;
      }

      if (request.description !== undefined) {
        updates.push(`description = $${paramIndex}`);
        params.push(request.description);
        paramIndex++;
      }

      if (request.isActive !== undefined) {
        updates.push(`is_active = $${paramIndex}`);
        params.push(request.isActive);
        paramIndex++;
      }

      if (updates.length === 0) {
        throw new Error('No fields to update');
      }

      updates.push(`updated_at = NOW()`);
      params.push(portfolioId);

      const query = `
        UPDATE trading.portfolios 
        SET ${updates.join(', ')}
        WHERE id = $${paramIndex}
        RETURNING *
      `;

      const result = await databaseService.query(query, params);
      
      if (result.rows.length === 0) {
        throw new Error('Portfolio not found');
      }

      const portfolio = this.mapDbRowToPortfolio(result.rows[0]);
      
      // Update cache
      await this.cachePortfolio(portfolio);
      
      logger.info('Portfolio updated', { portfolioId, updates: Object.keys(request) });
      
      return portfolio;
    } catch (error) {
      logger.error('Failed to update portfolio', { portfolioId, request, error });
      throw error;
    }
  }

  async deletePortfolio(portfolioId: string): Promise<void> {
    try {
      await databaseService.transaction(async (client) => {
        // Check if portfolio has active positions
        const positionsResult = await client.query(`
          SELECT COUNT(*) as count FROM trading.positions 
          WHERE portfolio_id = $1 AND quantity != 0
        `, [portfolioId]);

        if (parseInt(positionsResult.rows[0].count) > 0) {
          throw new Error('Cannot delete portfolio with active positions');
        }

        // Soft delete the portfolio
        await client.query(`
          UPDATE trading.portfolios 
          SET is_active = false, updated_at = NOW()
          WHERE id = $1
        `, [portfolioId]);
      });

      // Remove from cache
      await this.removeCachedPortfolio(portfolioId);
      
      logger.info('Portfolio deleted', { portfolioId });
    } catch (error) {
      logger.error('Failed to delete portfolio', { portfolioId, error });
      throw error;
    }
  }

  async getPortfolioValuation(portfolioId: string): Promise<PortfolioValuation> {
    try {
      // Try cache first
      const cached = await this.getCachedValuation(portfolioId);
      if (cached) {
        return cached;
      }

      const valuation = await this.calculatePortfolioValuation(portfolioId);
      
      // Cache the valuation for 30 seconds
      await this.cacheValuation(valuation, 30);
      
      return valuation;
    } catch (error) {
      logger.error('Failed to get portfolio valuation', { portfolioId, error });
      throw error;
    }
  }

  async getPortfolioSummary(portfolioId: string): Promise<PortfolioSummary> {
    try {
      const [portfolio, valuation, metrics, recentTrades] = await Promise.all([
        this.getPortfolio(portfolioId),
        this.getPortfolioValuation(portfolioId),
        this.getLatestPerformanceMetrics(portfolioId),
        this.getRecentTrades(portfolioId, 10)
      ]);

      if (!portfolio) {
        throw new Error('Portfolio not found');
      }

      return {
        portfolio,
        valuation,
        metrics,
        recentTrades
      };
    } catch (error) {
      logger.error('Failed to get portfolio summary', { portfolioId, error });
      throw error;
    }
  }

  private async calculatePortfolioValuation(portfolioId: string): Promise<PortfolioValuation> {
    const result = await databaseService.query(`
      SELECT 
        p.id,
        p.cash_balance,
        p.unrealized_pnl,
        p.realized_pnl,
        COALESCE(SUM(pos.market_value), 0) as positions_value,
        COALESCE(SUM(pos.unrealized_pnl), 0) as total_unrealized_pnl
      FROM trading.portfolios p
      LEFT JOIN trading.positions pos ON pos.portfolio_id = p.id AND pos.quantity != 0
      WHERE p.id = $1
      GROUP BY p.id, p.cash_balance, p.unrealized_pnl, p.realized_pnl
    `, [portfolioId]);

    if (result.rows.length === 0) {
      throw new Error('Portfolio not found');
    }

    const row = result.rows[0];
    const totalValue = parseFloat(row.cash_balance) + parseFloat(row.positions_value);

    // Get position valuations
    const positionsResult = await databaseService.query(`
      SELECT 
        pos.id as position_id,
        pos.symbol,
        pos.quantity,
        pos.avg_price,
        pos.current_price,
        pos.market_value,
        pos.unrealized_pnl,
        CASE 
          WHEN pos.avg_price > 0 THEN (pos.unrealized_pnl / (pos.avg_price * ABS(pos.quantity))) * 100
          ELSE 0
        END as unrealized_pnl_percent
      FROM trading.positions pos
      WHERE pos.portfolio_id = $1 AND pos.quantity != 0
    `, [portfolioId]);

    const positions = positionsResult.rows.map(pos => ({
      positionId: pos.position_id,
      symbol: pos.symbol,
      quantity: parseFloat(pos.quantity),
      avgPrice: parseFloat(pos.avg_price),
      currentPrice: parseFloat(pos.current_price) || parseFloat(pos.avg_price),
      marketValue: parseFloat(pos.market_value) || 0,
      unrealizedPnl: parseFloat(pos.unrealized_pnl) || 0,
      unrealizedPnlPercent: parseFloat(pos.unrealized_pnl_percent) || 0,
      dayChange: await this.calculatePositionDayChange(pos.symbol, parseFloat(pos.current_price)),
      dayChangePercent: await this.calculatePositionDayChangePercent(pos.symbol, parseFloat(pos.current_price))
    }));

    return {
      portfolioId,
      totalValue,
      cashBalance: parseFloat(row.cash_balance),
      positionsValue: parseFloat(row.positions_value),
      unrealizedPnl: parseFloat(row.total_unrealized_pnl),
      realizedPnl: parseFloat(row.realized_pnl),
      dayChange: await this.calculatePortfolioDayChange(portfolioId),
      dayChangePercent: await this.calculatePortfolioDayChangePercent(portfolioId, parseFloat(row.total_value))
      positions,
      timestamp: new Date()
    };
  }

  private async getLatestPerformanceMetrics(portfolioId: string): Promise<any> {
    const result = await databaseService.query(`
      SELECT * FROM analytics.performance_metrics 
      WHERE portfolio_id = $1 
      ORDER BY calculated_at DESC 
      LIMIT 1
    `, [portfolioId]);

    return result.rows[0] || null;
  }

  private async getRecentTrades(portfolioId: string, limit: number): Promise<any[]> {
    const result = await databaseService.query(`
      SELECT * FROM trading.trades 
      WHERE portfolio_id = $1 
      ORDER BY created_at DESC 
      LIMIT $2
    `, [portfolioId, limit]);

    return result.rows;
  }

  private mapDbRowToPortfolio(row: any): Portfolio {
    return {
      id: row.id,
      userId: row.user_id,
      name: row.name,
      description: row.description,
      portfolioType: row.portfolio_type,
      baseCurrency: row.base_currency,
      initialCash: parseFloat(row.initial_cash),
      cashBalance: parseFloat(row.cash_balance),
      totalValue: parseFloat(row.total_value),
      unrealizedPnl: parseFloat(row.unrealized_pnl),
      realizedPnl: parseFloat(row.realized_pnl),
      isActive: row.is_active,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at)
    };
  }

  private async cachePortfolio(portfolio: Portfolio): Promise<void> {
    const key = `portfolio:${portfolio.id}`;
    await redisService.set(key, JSON.stringify(portfolio), 300); // 5 minutes TTL
  }

  private async getCachedPortfolio(portfolioId: string): Promise<Portfolio | null> {
    const key = `portfolio:${portfolioId}`;
    const cached = await redisService.get(key);
    return cached ? JSON.parse(cached) : null;
  }

  private async removeCachedPortfolio(portfolioId: string): Promise<void> {
    const key = `portfolio:${portfolioId}`;
    await redisService.del(key);
  }

  private async cacheValuation(valuation: PortfolioValuation, ttl: number): Promise<void> {
    const key = `valuation:${valuation.portfolioId}`;
    await redisService.set(key, JSON.stringify(valuation), ttl);
  }

  private async getCachedValuation(portfolioId: string): Promise<PortfolioValuation | null> {
    const key = `valuation:${portfolioId}`;
    const cached = await redisService.get(key);
    return cached ? JSON.parse(cached) : null;
  }

  private async calculatePositionDayChange(symbol: string, currentPrice: number): Promise<number> {
    try {
      // Get yesterday's closing price from Redis cache or market data service
      const cacheKey = `price_history:${symbol}:daily`;
      const cachedData = await redisService.get(cacheKey);
      
      if (cachedData) {
        const priceHistory = JSON.parse(cachedData);
        const yesterdayClose = priceHistory.previousClose || currentPrice;
        return currentPrice - yesterdayClose;
      }
      
      return 0;
    } catch (error) {
      logger.error('Failed to calculate position day change', { symbol, error });
      return 0;
    }
  }

  private async calculatePositionDayChangePercent(symbol: string, currentPrice: number): Promise<number> {
    try {
      const dayChange = await this.calculatePositionDayChange(symbol, currentPrice);
      const previousClose = currentPrice - dayChange;
      
      if (previousClose === 0) return 0;
      
      return (dayChange / previousClose) * 100;
    } catch (error) {
      logger.error('Failed to calculate position day change percent', { symbol, error });
      return 0;
    }
  }

  private async calculatePortfolioDayChange(portfolioId: string): Promise<number> {
    try {
      // Get portfolio value from yesterday
      const cacheKey = `portfolio_history:${portfolioId}:daily`;
      const cachedData = await redisService.get(cacheKey);
      
      if (cachedData) {
        const history = JSON.parse(cachedData);
        const yesterdayValue = history.previousValue || 0;
        const currentValuation = await this.getPortfolioValuation(portfolioId);
        return currentValuation.totalValue - yesterdayValue;
      }
      
      return 0;
    } catch (error) {
      logger.error('Failed to calculate portfolio day change', { portfolioId, error });
      return 0;
    }
  }

  private async calculatePortfolioDayChangePercent(portfolioId: string, currentValue: number): Promise<number> {
    try {
      const dayChange = await this.calculatePortfolioDayChange(portfolioId);
      const previousValue = currentValue - dayChange;
      
      if (previousValue === 0) return 0;
      
      return (dayChange / previousValue) * 100;
    } catch (error) {
      logger.error('Failed to calculate portfolio day change percent', { portfolioId, error });
      return 0;
    }
  }
}

export const portfolioService = new PortfolioService();