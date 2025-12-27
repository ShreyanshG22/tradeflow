import { DatabaseService } from './DatabaseService';
import { RedisService } from './RedisService';
import { PositionService } from './PositionService';
import { HoldingsService } from './HoldingsService';
import { PnLService } from './PnLService';
import { ZerodhaApiClient } from './ZerodhaApiClient';
import { logger } from '../utils/logger';
import { ZerodhaMargin } from '@tradeflow/types';

export interface PortfolioSummary {
  user_id: string;
  total_portfolio_value: number;
  total_investment: number;
  total_current_value: number;
  total_pnl: number;
  total_return_percentage: number;
  day_change: number;
  day_change_percentage: number;
  positions_count: number;
  holdings_count: number;
  cash_balance: number;
  margin_available: number;
  margin_used: number;
  buying_power: number;
  last_updated: Date;
}

export interface PortfolioAnalytics {
  performance_metrics: {
    total_return: number;
    total_return_percentage: number;
    annualized_return: number;
    volatility: number;
    sharpe_ratio: number;
    max_drawdown: number;
    win_rate: number;
  };
  allocation: {
    by_sector: { sector: string; value: number; percentage: number }[];
    by_exchange: { exchange: string; value: number; percentage: number }[];
    by_asset_type: { type: string; value: number; percentage: number }[];
  };
  risk_metrics: {
    portfolio_beta: number;
    value_at_risk: number;
    concentration_risk: number;
    largest_position_percentage: number;
  };
  recent_activity: {
    trades_count_7d: number;
    trades_count_30d: number;
    avg_trade_size: number;
    most_traded_symbols: string[];
  };
}

export class PortfolioSummaryService {
  private userId: string;
  private accessToken: string;
  private positionService: PositionService;
  private holdingsService: HoldingsService;
  private pnlService: PnLService;
  private zerodhaClient: ZerodhaApiClient;

  constructor(accessToken: string, userId: string) {
    this.accessToken = accessToken;
    this.userId = userId;
    this.positionService = new PositionService(accessToken, userId);
    this.holdingsService = new HoldingsService(accessToken, userId);
    this.pnlService = new PnLService(userId);
    this.zerodhaClient = new ZerodhaApiClient(accessToken);
  }

  async getPortfolioSummary(): Promise<PortfolioSummary> {
    try {
      logger.info(`Generating portfolio summary for user ${this.userId}`);

      // Get all required data in parallel
      const [
        positionsSummary,
        holdingsSummary,
        pnlBreakdown,
        portfolioMetrics,
        margins
      ] = await Promise.all([
        this.positionService.getPositionSummary(),
        this.holdingsService.getHoldingsSummary(),
        this.pnlService.getPnLBreakdown(),
        this.pnlService.calculatePortfolioMetrics(),
        this.getMarginInfo()
      ]);

      const summary: PortfolioSummary = {
        user_id: this.userId,
        total_portfolio_value: portfolioMetrics.current_value + (margins?.equity?.available?.cash || 0),
        total_investment: portfolioMetrics.total_investment,
        total_current_value: portfolioMetrics.current_value,
        total_pnl: pnlBreakdown.total_pnl,
        total_return_percentage: portfolioMetrics.total_return_percentage,
        day_change: portfolioMetrics.day_change,
        day_change_percentage: portfolioMetrics.day_change_percentage,
        positions_count: positionsSummary.total_positions,
        holdings_count: holdingsSummary.total_holdings,
        cash_balance: margins?.equity?.available?.cash || 0,
        margin_available: margins?.equity?.net || 0,
        margin_used: (margins?.equity?.utilised?.exposure || 0) + (margins?.equity?.utilised?.span || 0),
        buying_power: margins?.equity?.available?.live_balance || 0,
        last_updated: new Date()
      };

      // Cache the summary
      await this.cachePortfolioSummary(summary);

      // Store in database for historical tracking
      await this.storePortfolioSummary(summary);

      return summary;
    } catch (error) {
      logger.error(`Failed to generate portfolio summary for user ${this.userId}:`, error);
      throw error;
    }
  }

  async getPortfolioAnalytics(): Promise<PortfolioAnalytics> {
    try {
      logger.info(`Generating portfolio analytics for user ${this.userId}`);

      const [
        performanceMetrics,
        allocation,
        riskMetrics,
        recentActivity
      ] = await Promise.all([
        this.calculatePerformanceMetrics(),
        this.calculateAllocation(),
        this.calculateRiskMetrics(),
        this.getRecentActivity()
      ]);

      return {
        performance_metrics: performanceMetrics,
        allocation,
        risk_metrics: riskMetrics,
        recent_activity: recentActivity
      };
    } catch (error) {
      logger.error(`Failed to generate portfolio analytics for user ${this.userId}:`, error);
      throw error;
    }
  }

  private async calculatePerformanceMetrics(): Promise<PortfolioAnalytics['performance_metrics']> {
    try {
      // Get historical portfolio values for calculations
      const pnlHistory = await this.pnlService.getPnLHistory(365); // Last year
      const portfolioMetrics = await this.pnlService.calculatePortfolioMetrics();

      // Calculate basic metrics
      const totalReturn = portfolioMetrics.total_return;
      const totalReturnPercentage = portfolioMetrics.total_return_percentage;

      // Calculate annualized return (assuming 252 trading days)
      const daysInvested = Math.max(pnlHistory.length, 1);
      const annualizedReturn = totalReturnPercentage * (252 / daysInvested);

      // Calculate volatility (standard deviation of daily returns)
      let volatility = 0;
      if (pnlHistory.length > 1) {
        const dailyReturns = pnlHistory.slice(1).map((current, index) => {
          const previous = pnlHistory[index];
          return previous.portfolio_value > 0 
            ? ((current.portfolio_value - previous.portfolio_value) / previous.portfolio_value) * 100
            : 0;
        });

        const avgReturn = dailyReturns.reduce((sum, ret) => sum + ret, 0) / dailyReturns.length;
        const variance = dailyReturns.reduce((sum, ret) => sum + Math.pow(ret - avgReturn, 2), 0) / dailyReturns.length;
        volatility = Math.sqrt(variance) * Math.sqrt(252); // Annualized volatility
      }

      // Calculate Sharpe ratio (assuming 5% risk-free rate)
      const riskFreeRate = 5;
      const sharpeRatio = volatility > 0 ? (annualizedReturn - riskFreeRate) / volatility : 0;

      // Calculate max drawdown
      let maxDrawdown = 0;
      let peak = 0;
      for (const point of pnlHistory) {
        if (point.portfolio_value > peak) {
          peak = point.portfolio_value;
        }
        const drawdown = peak > 0 ? ((peak - point.portfolio_value) / peak) * 100 : 0;
        maxDrawdown = Math.max(maxDrawdown, drawdown);
      }

      // Calculate win rate from trades
      const winRate = await this.calculateWinRate();

      return {
        total_return: totalReturn,
        total_return_percentage: totalReturnPercentage,
        annualized_return: annualizedReturn,
        volatility,
        sharpe_ratio: sharpeRatio,
        max_drawdown: maxDrawdown,
        win_rate: winRate
      };
    } catch (error) {
      logger.error(`Failed to calculate performance metrics for user ${this.userId}:`, error);
      throw error;
    }
  }

  private async calculateAllocation(): Promise<PortfolioAnalytics['allocation']> {
    try {
      // Get allocation by exchange
      const exchangeResult = await DatabaseService.query(
        `SELECT 
          exchange,
          SUM(quantity * last_price) as value
         FROM (
           SELECT exchange, quantity, last_price FROM zerodha_positions 
           WHERE user_id = $1 AND position_date = CURRENT_DATE
           UNION ALL
           SELECT exchange, quantity::decimal, last_price FROM zerodha_holdings 
           WHERE user_id = $1
         ) combined
         GROUP BY exchange
         ORDER BY value DESC`,
        [this.userId]
      );

      const totalValue = exchangeResult.rows.reduce((sum: number, row: any) => sum + parseFloat(row.value), 0);

      const byExchange = exchangeResult.rows.map((row: any) => ({
        exchange: row.exchange,
        value: parseFloat(row.value),
        percentage: totalValue > 0 ? (parseFloat(row.value) / totalValue) * 100 : 0
      }));

      // For now, we'll create placeholder data for sector and asset type
      // In a real implementation, you'd need instrument master data with sector information
      const bySector = [
        { sector: 'Technology', value: totalValue * 0.3, percentage: 30 },
        { sector: 'Financial Services', value: totalValue * 0.25, percentage: 25 },
        { sector: 'Healthcare', value: totalValue * 0.2, percentage: 20 },
        { sector: 'Consumer Goods', value: totalValue * 0.15, percentage: 15 },
        { sector: 'Others', value: totalValue * 0.1, percentage: 10 }
      ];

      const byAssetType = [
        { type: 'Equity', value: totalValue * 0.8, percentage: 80 },
        { type: 'Derivatives', value: totalValue * 0.15, percentage: 15 },
        { type: 'Others', value: totalValue * 0.05, percentage: 5 }
      ];

      return {
        by_sector: bySector,
        by_exchange: byExchange,
        by_asset_type: byAssetType
      };
    } catch (error) {
      logger.error(`Failed to calculate allocation for user ${this.userId}:`, error);
      throw error;
    }
  }

  private async calculateRiskMetrics(): Promise<PortfolioAnalytics['risk_metrics']> {
    try {
      // Calculate concentration risk (largest position as % of portfolio)
      const result = await DatabaseService.query(
        `WITH position_values AS (
          SELECT 
            tradingsymbol,
            SUM(ABS(quantity) * last_price) as position_value
          FROM (
            SELECT tradingsymbol, quantity, last_price FROM zerodha_positions 
            WHERE user_id = $1 AND position_date = CURRENT_DATE
            UNION ALL
            SELECT tradingsymbol, quantity::decimal, last_price FROM zerodha_holdings 
            WHERE user_id = $1
          ) combined
          GROUP BY tradingsymbol
        ),
        portfolio_total AS (
          SELECT SUM(position_value) as total_value FROM position_values
        )
        SELECT 
          MAX(position_value) as largest_position,
          (SELECT total_value FROM portfolio_total) as total_portfolio_value,
          COUNT(*) as total_positions
        FROM position_values`,
        [this.userId]
      );

      const row = result.rows[0];
      const largestPosition = parseFloat(row.largest_position) || 0;
      const totalPortfolioValue = parseFloat(row.total_portfolio_value) || 0;
      const totalPositions = parseInt(row.total_positions) || 0;

      const largestPositionPercentage = totalPortfolioValue > 0 
        ? (largestPosition / totalPortfolioValue) * 100 
        : 0;

      // Calculate concentration risk (Herfindahl index)
      const concentrationResult = await DatabaseService.query(
        `WITH position_weights AS (
          SELECT 
            (position_value / total_value) as weight
          FROM (
            SELECT 
              tradingsymbol,
              SUM(ABS(quantity) * last_price) as position_value,
              SUM(SUM(ABS(quantity) * last_price)) OVER () as total_value
            FROM (
              SELECT tradingsymbol, quantity, last_price FROM zerodha_positions 
              WHERE user_id = $1 AND position_date = CURRENT_DATE
              UNION ALL
              SELECT tradingsymbol, quantity::decimal, last_price FROM zerodha_holdings 
              WHERE user_id = $1
            ) combined
            GROUP BY tradingsymbol
          ) weighted_positions
        )
        SELECT SUM(weight * weight) as herfindahl_index
        FROM position_weights`,
        [this.userId]
      );

      const concentrationRisk = parseFloat(concentrationResult.rows[0]?.herfindahl_index) || 0;

      // Placeholder values for beta and VaR (would need market data for proper calculation)
      const portfolioBeta = 1.0; // Assuming market beta
      const valueAtRisk = totalPortfolioValue * 0.05; // 5% VaR assumption

      return {
        portfolio_beta: portfolioBeta,
        value_at_risk: valueAtRisk,
        concentration_risk: concentrationRisk,
        largest_position_percentage: largestPositionPercentage
      };
    } catch (error) {
      logger.error(`Failed to calculate risk metrics for user ${this.userId}:`, error);
      throw error;
    }
  }

  private async getRecentActivity(): Promise<PortfolioAnalytics['recent_activity']> {
    try {
      const result = await DatabaseService.query(
        `SELECT 
          COUNT(CASE WHEN executed_at >= CURRENT_DATE - INTERVAL '7 days' THEN 1 END) as trades_7d,
          COUNT(CASE WHEN executed_at >= CURRENT_DATE - INTERVAL '30 days' THEN 1 END) as trades_30d,
          AVG(total_amount) as avg_trade_size
         FROM trading.trades t
         JOIN trading.portfolios p ON p.id = t.portfolio_id
         WHERE p.user_id = $1 AND t.status = 'filled'`,
        [this.userId]
      );

      const mostTradedResult = await DatabaseService.query(
        `SELECT symbol, COUNT(*) as trade_count
         FROM trading.trades t
         JOIN trading.portfolios p ON p.id = t.portfolio_id
         WHERE p.user_id = $1 
           AND t.status = 'filled'
           AND t.executed_at >= CURRENT_DATE - INTERVAL '30 days'
         GROUP BY symbol
         ORDER BY trade_count DESC
         LIMIT 5`,
        [this.userId]
      );

      const row = result.rows[0];
      
      return {
        trades_count_7d: parseInt(row.trades_7d) || 0,
        trades_count_30d: parseInt(row.trades_30d) || 0,
        avg_trade_size: parseFloat(row.avg_trade_size) || 0,
        most_traded_symbols: mostTradedResult.rows.map((r: any) => r.symbol)
      };
    } catch (error) {
      logger.error(`Failed to get recent activity for user ${this.userId}:`, error);
      throw error;
    }
  }

  private async calculateWinRate(): Promise<number> {
    try {
      const result = await DatabaseService.query(
        `WITH trade_pnl AS (
          SELECT 
            CASE 
              WHEN side = 'sell' THEN (price - avg_cost) * quantity
              ELSE 0
            END as pnl
          FROM (
            SELECT 
              t.side, t.price, t.quantity,
              COALESCE(p.average_price, t.price) as avg_cost
            FROM trading.trades t
            LEFT JOIN zerodha_positions p ON p.tradingsymbol = t.symbol AND p.user_id = $1
            JOIN trading.portfolios pf ON pf.id = t.portfolio_id
            WHERE pf.user_id = $1 AND t.status = 'filled' AND t.side = 'sell'
          ) trades_with_cost
        )
        SELECT 
          COUNT(CASE WHEN pnl > 0 THEN 1 END)::float / NULLIF(COUNT(*), 0) * 100 as win_rate
        FROM trade_pnl
        WHERE pnl != 0`,
        [this.userId]
      );

      return parseFloat(result.rows[0]?.win_rate) || 0;
    } catch (error) {
      logger.error(`Failed to calculate win rate for user ${this.userId}:`, error);
      return 0;
    }
  }

  private async getMarginInfo(): Promise<ZerodhaMargin | null> {
    try {
      return await this.zerodhaClient.getMargins();
    } catch (error) {
      logger.warn(`Failed to fetch margin info for user ${this.userId}:`, error);
      return null;
    }
  }

  private async cachePortfolioSummary(summary: PortfolioSummary): Promise<void> {
    try {
      const cacheKey = `portfolio_summary:${this.userId}`;
      await RedisService.set(cacheKey, JSON.stringify(summary), 300); // Cache for 5 minutes
      logger.debug(`Cached portfolio summary for user ${this.userId}`);
    } catch (error) {
      logger.error(`Failed to cache portfolio summary for user ${this.userId}:`, error);
    }
  }

  private async storePortfolioSummary(summary: PortfolioSummary): Promise<void> {
    try {
      await DatabaseService.query(
        `INSERT INTO zerodha_portfolio_summary (
          user_id, total_portfolio_value, total_investment, total_current_value,
          total_pnl, total_day_change, total_day_change_percentage,
          positions_count, holdings_count, summary_date
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_DATE)
        ON CONFLICT (user_id, summary_date)
        DO UPDATE SET
          total_portfolio_value = EXCLUDED.total_portfolio_value,
          total_investment = EXCLUDED.total_investment,
          total_current_value = EXCLUDED.total_current_value,
          total_pnl = EXCLUDED.total_pnl,
          total_day_change = EXCLUDED.total_day_change,
          total_day_change_percentage = EXCLUDED.total_day_change_percentage,
          positions_count = EXCLUDED.positions_count,
          holdings_count = EXCLUDED.holdings_count,
          updated_at = NOW()`,
        [
          summary.user_id,
          summary.total_portfolio_value,
          summary.total_investment,
          summary.total_current_value,
          summary.total_pnl,
          summary.day_change,
          summary.day_change_percentage,
          summary.positions_count,
          summary.holdings_count
        ]
      );

      logger.debug(`Stored portfolio summary for user ${this.userId}`);
    } catch (error) {
      logger.error(`Failed to store portfolio summary for user ${this.userId}:`, error);
    }
  }

  async getCachedPortfolioSummary(): Promise<PortfolioSummary | null> {
    try {
      const cacheKey = `portfolio_summary:${this.userId}`;
      const cachedData = await RedisService.get(cacheKey);
      
      if (cachedData) {
        return JSON.parse(cachedData);
      }
      
      return null;
    } catch (error) {
      logger.error(`Failed to get cached portfolio summary for user ${this.userId}:`, error);
      return null;
    }
  }
}