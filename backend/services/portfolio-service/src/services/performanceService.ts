import { databaseService } from './database';
import { redisService } from './redis';
import { logger } from '../utils/logger';
import { PerformanceMetrics } from '../types';

export interface PerformanceCalculationRequest {
  portfolioId: string;
  startDate: Date;
  endDate: Date;
  benchmarkSymbol?: string;
}

export interface PerformanceReport {
  portfolio: {
    id: string;
    name: string;
    totalValue: number;
    initialValue: number;
  };
  period: {
    startDate: Date;
    endDate: Date;
    days: number;
  };
  returns: {
    totalReturn: number;
    totalReturnPercent: number;
    annualizedReturn: number;
    cagr: number;
  };
  risk: {
    volatility: number;
    sharpeRatio: number;
    sortinoRatio: number;
    maxDrawdown: number;
    maxDrawdownPercent: number;
    var95: number; // Value at Risk 95%
    var99: number; // Value at Risk 99%
  };
  trading: {
    totalTrades: number;
    winningTrades: number;
    losingTrades: number;
    winRate: number;
    profitFactor: number;
    avgWin: number;
    avgLoss: number;
    largestWin: number;
    largestLoss: number;
    avgHoldingPeriod: number;
  };
  benchmark?: {
    symbol: string;
    totalReturn: number;
    annualizedReturn: number;
    alpha: number;
    beta: number;
    correlation: number;
    trackingError: number;
  };
  monthlyReturns: Array<{
    month: string;
    return: number;
    benchmark?: number;
  }>;
  equityCurve: Array<{
    date: Date;
    value: number;
    drawdown: number;
  }>;
}

export class PerformanceService {

  async calculatePerformanceMetrics(request: PerformanceCalculationRequest): Promise<PerformanceMetrics> {
    try {
      const [
        portfolioData,
        trades,
        equityHistory
      ] = await Promise.all([
        this.getPortfolioData(request.portfolioId),
        this.getTradesInPeriod(request.portfolioId, request.startDate, request.endDate),
        this.getEquityHistory(request.portfolioId, request.startDate, request.endDate)
      ]);

      // Calculate basic metrics
      const totalReturn = this.calculateTotalReturn(equityHistory);
      const annualizedReturn = this.calculateAnnualizedReturn(totalReturn, request.startDate, request.endDate);
      const volatility = this.calculateVolatility(equityHistory);
      const sharpeRatio = this.calculateSharpeRatio(annualizedReturn, volatility);
      const sortinoRatio = this.calculateSortinoRatio(equityHistory);
      const maxDrawdown = this.calculateMaxDrawdown(equityHistory);

      // Calculate trading metrics
      const tradingMetrics = this.calculateTradingMetrics(trades);

      const metrics: PerformanceMetrics = {
        id: '', // Will be set when saved
        portfolioId: request.portfolioId,
        periodStart: request.startDate,
        periodEnd: request.endDate,
        totalReturn,
        annualizedReturn,
        volatility,
        sharpeRatio,
        sortinoRatio,
        maxDrawdown,
        ...tradingMetrics,
        calculatedAt: new Date()
      };

      // Save metrics to database
      const savedMetrics = await this.savePerformanceMetrics(metrics);

      logger.info('Performance metrics calculated', {
        portfolioId: request.portfolioId,
        period: `${request.startDate.toISOString()} to ${request.endDate.toISOString()}`,
        totalReturn,
        sharpeRatio,
        maxDrawdown
      });

      return savedMetrics;
    } catch (error) {
      logger.error('Failed to calculate performance metrics', { request, error });
      throw error;
    }
  }

  async generatePerformanceReport(request: PerformanceCalculationRequest): Promise<PerformanceReport> {
    try {
      const [
        portfolioData,
        trades,
        equityHistory,
        benchmarkData
      ] = await Promise.all([
        this.getPortfolioData(request.portfolioId),
        this.getTradesInPeriod(request.portfolioId, request.startDate, request.endDate),
        this.getEquityHistory(request.portfolioId, request.startDate, request.endDate),
        request.benchmarkSymbol ? this.getBenchmarkData(request.benchmarkSymbol, request.startDate, request.endDate) : null
      ]);

      const days = Math.ceil((request.endDate.getTime() - request.startDate.getTime()) / (1000 * 60 * 60 * 24));
      const initialValue = equityHistory.length > 0 ? equityHistory[0].value : portfolioData.initialCash;
      const finalValue = equityHistory.length > 0 ? equityHistory[equityHistory.length - 1].value : portfolioData.totalValue;

      // Calculate returns
      const totalReturn = finalValue - initialValue;
      const totalReturnPercent = initialValue > 0 ? (totalReturn / initialValue) * 100 : 0;
      const annualizedReturn = this.calculateAnnualizedReturn(totalReturnPercent / 100, request.startDate, request.endDate);
      const cagr = this.calculateCAGR(initialValue, finalValue, days / 365);

      // Calculate risk metrics
      const volatility = this.calculateVolatility(equityHistory);
      const sharpeRatio = this.calculateSharpeRatio(annualizedReturn, volatility);
      const sortinoRatio = this.calculateSortinoRatio(equityHistory);
      const maxDrawdownData = this.calculateMaxDrawdownDetailed(equityHistory);
      const var95 = this.calculateVaR(equityHistory, 0.95);
      const var99 = this.calculateVaR(equityHistory, 0.99);

      // Calculate trading metrics
      const tradingMetrics = this.calculateDetailedTradingMetrics(trades);

      // Calculate benchmark comparison if provided
      let benchmarkComparison;
      if (benchmarkData && request.benchmarkSymbol) {
        benchmarkComparison = this.calculateBenchmarkComparison(equityHistory, benchmarkData, request.benchmarkSymbol);
      }

      // Generate monthly returns
      const monthlyReturns = this.calculateMonthlyReturns(equityHistory, benchmarkData);

      // Generate equity curve with drawdowns
      const equityCurve = this.generateEquityCurve(equityHistory);

      const report: PerformanceReport = {
        portfolio: {
          id: portfolioData.id,
          name: portfolioData.name,
          totalValue: finalValue,
          initialValue
        },
        period: {
          startDate: request.startDate,
          endDate: request.endDate,
          days
        },
        returns: {
          totalReturn,
          totalReturnPercent,
          annualizedReturn: annualizedReturn * 100,
          cagr: cagr * 100
        },
        risk: {
          volatility: volatility * 100,
          sharpeRatio,
          sortinoRatio,
          maxDrawdown: maxDrawdownData.maxDrawdown,
          maxDrawdownPercent: maxDrawdownData.maxDrawdownPercent,
          var95,
          var99
        },
        trading: tradingMetrics,
        benchmark: benchmarkComparison,
        monthlyReturns,
        equityCurve
      };

      // Cache the report for 1 hour
      await this.cachePerformanceReport(request, report);

      logger.info('Performance report generated', {
        portfolioId: request.portfolioId,
        totalReturn: totalReturnPercent,
        sharpeRatio,
        totalTrades: tradingMetrics.totalTrades
      });

      return report;
    } catch (error) {
      logger.error('Failed to generate performance report', { request, error });
      throw error;
    }
  }

  async getLatestPerformanceMetrics(portfolioId: string): Promise<PerformanceMetrics | null> {
    try {
      const result = await databaseService.query(`
        SELECT * FROM analytics.performance_metrics 
        WHERE portfolio_id = $1 
        ORDER BY calculated_at DESC 
        LIMIT 1
      `, [portfolioId]);

      if (result.rows.length === 0) {
        return null;
      }

      return this.mapDbRowToPerformanceMetrics(result.rows[0]);
    } catch (error) {
      logger.error('Failed to get latest performance metrics', { portfolioId, error });
      throw error;
    }
  }

  async getPerformanceHistory(portfolioId: string, limit: number = 30): Promise<PerformanceMetrics[]> {
    try {
      const result = await databaseService.query(`
        SELECT * FROM analytics.performance_metrics 
        WHERE portfolio_id = $1 
        ORDER BY calculated_at DESC 
        LIMIT $2
      `, [portfolioId, limit]);

      return result.rows.map(row => this.mapDbRowToPerformanceMetrics(row));
    } catch (error) {
      logger.error('Failed to get performance history', { portfolioId, error });
      throw error;
    }
  }

  private async getPortfolioData(portfolioId: string): Promise<any> {
    const result = await databaseService.query(`
      SELECT * FROM trading.portfolios WHERE id = $1
    `, [portfolioId]);

    if (result.rows.length === 0) {
      throw new Error('Portfolio not found');
    }

    return result.rows[0];
  }

  private async getTradesInPeriod(portfolioId: string, startDate: Date, endDate: Date): Promise<any[]> {
    const result = await databaseService.query(`
      SELECT * FROM trading.trades 
      WHERE portfolio_id = $1 
        AND executed_at >= $2 
        AND executed_at <= $3 
        AND status = 'filled'
      ORDER BY executed_at ASC
    `, [portfolioId, startDate, endDate]);

    return result.rows;
  }

  private async getEquityHistory(portfolioId: string, startDate: Date, endDate: Date): Promise<Array<{date: Date, value: number}>> {
    // This would typically come from a daily portfolio valuation table
    // For now, we'll simulate it based on trades and positions
    const result = await databaseService.query(`
      SELECT 
        DATE(executed_at) as date,
        SUM(CASE WHEN side = 'sell' THEN total_amount ELSE -total_amount END) as net_cash_flow
      FROM trading.trades 
      WHERE portfolio_id = $1 
        AND executed_at >= $2 
        AND executed_at <= $3 
        AND status = 'filled'
      GROUP BY DATE(executed_at)
      ORDER BY date ASC
    `, [portfolioId, startDate, endDate]);

    // Get initial portfolio value
    const portfolioResult = await databaseService.query(`
      SELECT initial_cash FROM trading.portfolios WHERE id = $1
    `, [portfolioId]);

    const initialValue = parseFloat(portfolioResult.rows[0]?.initial_cash || '0');
    let runningValue = initialValue;
    
    const equityHistory = [{
      date: startDate,
      value: runningValue
    }];

    // Build equity curve from cash flows (simplified)
    result.rows.forEach(row => {
      runningValue += parseFloat(row.net_cash_flow);
      equityHistory.push({
        date: new Date(row.date),
        value: runningValue
      });
    });

    return equityHistory;
  }

  private async getBenchmarkData(symbol: string, startDate: Date, endDate: Date): Promise<Array<{date: Date, value: number}> | null> {
    // This would fetch benchmark data from market data service
    // For now, return null to indicate no benchmark data available
    return null;
  }

  private calculateTotalReturn(equityHistory: Array<{date: Date, value: number}>): number {
    if (equityHistory.length < 2) return 0;
    
    const initial = equityHistory[0].value;
    const final = equityHistory[equityHistory.length - 1].value;
    
    return initial > 0 ? (final - initial) / initial : 0;
  }

  private calculateAnnualizedReturn(totalReturn: number, startDate: Date, endDate: Date): number {
    const days = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24);
    const years = days / 365.25;
    
    if (years <= 0) return 0;
    
    return Math.pow(1 + totalReturn, 1 / years) - 1;
  }

  private calculateCAGR(initialValue: number, finalValue: number, years: number): number {
    if (initialValue <= 0 || years <= 0) return 0;
    return Math.pow(finalValue / initialValue, 1 / years) - 1;
  }

  private calculateVolatility(equityHistory: Array<{date: Date, value: number}>): number {
    if (equityHistory.length < 2) return 0;

    // Calculate daily returns
    const returns: number[] = [];
    for (let i = 1; i < equityHistory.length; i++) {
      const prevValue = equityHistory[i - 1].value;
      const currentValue = equityHistory[i].value;
      if (prevValue > 0) {
        returns.push((currentValue - prevValue) / prevValue);
      }
    }

    if (returns.length === 0) return 0;

    // Calculate standard deviation
    const mean = returns.reduce((sum, ret) => sum + ret, 0) / returns.length;
    const variance = returns.reduce((sum, ret) => sum + Math.pow(ret - mean, 2), 0) / returns.length;
    
    // Annualize volatility
    return Math.sqrt(variance * 252); // 252 trading days per year
  }

  private calculateSharpeRatio(annualizedReturn: number, volatility: number, riskFreeRate: number = 0.02): number {
    if (volatility === 0) return 0;
    return (annualizedReturn - riskFreeRate) / volatility;
  }

  private calculateSortinoRatio(equityHistory: Array<{date: Date, value: number}>): number {
    if (equityHistory.length < 2) return 0;

    // Calculate daily returns
    const returns: number[] = [];
    for (let i = 1; i < equityHistory.length; i++) {
      const prevValue = equityHistory[i - 1].value;
      const currentValue = equityHistory[i].value;
      if (prevValue > 0) {
        returns.push((currentValue - prevValue) / prevValue);
      }
    }

    if (returns.length === 0) return 0;

    const meanReturn = returns.reduce((sum, ret) => sum + ret, 0) / returns.length;
    
    // Calculate downside deviation (only negative returns)
    const negativeReturns = returns.filter(ret => ret < 0);
    if (negativeReturns.length === 0) return Infinity;

    const downsideVariance = negativeReturns.reduce((sum, ret) => sum + Math.pow(ret, 2), 0) / negativeReturns.length;
    const downsideDeviation = Math.sqrt(downsideVariance * 252);

    return downsideDeviation > 0 ? (meanReturn * 252) / downsideDeviation : 0;
  }

  private calculateMaxDrawdown(equityHistory: Array<{date: Date, value: number}>): number {
    if (equityHistory.length === 0) return 0;

    let maxDrawdown = 0;
    let peak = equityHistory[0].value;

    for (const point of equityHistory) {
      if (point.value > peak) {
        peak = point.value;
      }
      
      const drawdown = peak > 0 ? (peak - point.value) / peak : 0;
      maxDrawdown = Math.max(maxDrawdown, drawdown);
    }

    return maxDrawdown;
  }

  private calculateMaxDrawdownDetailed(equityHistory: Array<{date: Date, value: number}>): {maxDrawdown: number, maxDrawdownPercent: number} {
    if (equityHistory.length === 0) return { maxDrawdown: 0, maxDrawdownPercent: 0 };

    let maxDrawdown = 0;
    let maxDrawdownPercent = 0;
    let peak = equityHistory[0].value;

    for (const point of equityHistory) {
      if (point.value > peak) {
        peak = point.value;
      }
      
      const drawdownAmount = peak - point.value;
      const drawdownPercent = peak > 0 ? drawdownAmount / peak : 0;
      
      maxDrawdown = Math.max(maxDrawdown, drawdownAmount);
      maxDrawdownPercent = Math.max(maxDrawdownPercent, drawdownPercent);
    }

    return { maxDrawdown, maxDrawdownPercent: maxDrawdownPercent * 100 };
  }

  private calculateVaR(equityHistory: Array<{date: Date, value: number}>, confidence: number): number {
    if (equityHistory.length < 2) return 0;

    // Calculate daily returns
    const returns: number[] = [];
    for (let i = 1; i < equityHistory.length; i++) {
      const prevValue = equityHistory[i - 1].value;
      const currentValue = equityHistory[i].value;
      if (prevValue > 0) {
        returns.push((currentValue - prevValue) / prevValue);
      }
    }

    if (returns.length === 0) return 0;

    // Sort returns and find percentile
    returns.sort((a, b) => a - b);
    const index = Math.floor((1 - confidence) * returns.length);
    
    return Math.abs(returns[index] || 0) * 100; // Return as percentage
  }

  private calculateTradingMetrics(trades: any[]): Partial<PerformanceMetrics> {
    if (trades.length === 0) {
      return {
        totalTrades: 0,
        winningTrades: 0,
        losingTrades: 0,
        winRate: 0,
        profitFactor: 0,
        avgWin: 0,
        avgLoss: 0,
        largestWin: 0,
        largestLoss: 0
      };
    }

    // Group trades by position to calculate P&L
    const positionPnL = new Map<string, number>();
    
    trades.forEach(trade => {
      const key = `${trade.symbol}_${trade.side === 'buy' ? 'long' : 'short'}`;
      const pnl = trade.side === 'sell' ? 
        (trade.price - (positionPnL.get(key) || trade.price)) * trade.quantity :
        -(trade.price * trade.quantity);
      
      positionPnL.set(key, (positionPnL.get(key) || 0) + pnl);
    });

    const pnlValues = Array.from(positionPnL.values());
    const winningTrades = pnlValues.filter(pnl => pnl > 0);
    const losingTrades = pnlValues.filter(pnl => pnl < 0);

    const totalWins = winningTrades.reduce((sum, pnl) => sum + pnl, 0);
    const totalLosses = Math.abs(losingTrades.reduce((sum, pnl) => sum + pnl, 0));

    return {
      totalTrades: pnlValues.length,
      winningTrades: winningTrades.length,
      losingTrades: losingTrades.length,
      winRate: pnlValues.length > 0 ? winningTrades.length / pnlValues.length : 0,
      profitFactor: totalLosses > 0 ? totalWins / totalLosses : 0,
      avgWin: winningTrades.length > 0 ? totalWins / winningTrades.length : 0,
      avgLoss: losingTrades.length > 0 ? totalLosses / losingTrades.length : 0,
      largestWin: winningTrades.length > 0 ? Math.max(...winningTrades) : 0,
      largestLoss: losingTrades.length > 0 ? Math.min(...losingTrades) : 0
    };
  }

  private calculateDetailedTradingMetrics(trades: any[]): any {
    const basicMetrics = this.calculateTradingMetrics(trades);
    
    // Calculate average holding period (simplified)
    let totalHoldingDays = 0;
    let completedPositions = 0;

    // This is a simplified calculation - in reality, you'd track position open/close times
    if (trades.length > 1) {
      for (let i = 1; i < trades.length; i++) {
        const timeDiff = new Date(trades[i].executed_at).getTime() - new Date(trades[i-1].executed_at).getTime();
        totalHoldingDays += timeDiff / (1000 * 60 * 60 * 24);
        completedPositions++;
      }
    }

    return {
      ...basicMetrics,
      avgHoldingPeriod: completedPositions > 0 ? totalHoldingDays / completedPositions : 0
    };
  }

  private calculateBenchmarkComparison(equityHistory: any[], benchmarkData: any[], benchmarkSymbol: string): any {
    // Placeholder for benchmark comparison
    // In a real implementation, this would calculate alpha, beta, correlation, etc.
    return {
      symbol: benchmarkSymbol,
      totalReturn: 0,
      annualizedReturn: 0,
      alpha: 0,
      beta: 1,
      correlation: 0,
      trackingError: 0
    };
  }

  private calculateMonthlyReturns(equityHistory: any[], benchmarkData?: any[]): any[] {
    // Placeholder for monthly returns calculation
    return [];
  }

  private generateEquityCurve(equityHistory: Array<{date: Date, value: number}>): Array<{date: Date, value: number, drawdown: number}> {
    if (equityHistory.length === 0) return [];

    let peak = equityHistory[0].value;
    
    return equityHistory.map(point => {
      if (point.value > peak) {
        peak = point.value;
      }
      
      const drawdown = peak > 0 ? ((peak - point.value) / peak) * 100 : 0;
      
      return {
        date: point.date,
        value: point.value,
        drawdown
      };
    });
  }

  private async savePerformanceMetrics(metrics: PerformanceMetrics): Promise<PerformanceMetrics> {
    const result = await databaseService.query(`
      INSERT INTO analytics.performance_metrics (
        portfolio_id, period_start, period_end, total_return, annualized_return,
        volatility, sharpe_ratio, sortino_ratio, max_drawdown, win_rate,
        profit_factor, total_trades, winning_trades, losing_trades,
        avg_win, avg_loss, largest_win, largest_loss
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
      RETURNING *
    `, [
      metrics.portfolioId,
      metrics.periodStart,
      metrics.periodEnd,
      metrics.totalReturn,
      metrics.annualizedReturn,
      metrics.volatility,
      metrics.sharpeRatio,
      metrics.sortinoRatio,
      metrics.maxDrawdown,
      metrics.winRate,
      metrics.profitFactor,
      metrics.totalTrades,
      metrics.winningTrades,
      metrics.losingTrades,
      metrics.avgWin,
      metrics.avgLoss,
      metrics.largestWin,
      metrics.largestLoss
    ]);

    return this.mapDbRowToPerformanceMetrics(result.rows[0]);
  }

  private async cachePerformanceReport(request: PerformanceCalculationRequest, report: PerformanceReport): Promise<void> {
    const key = `performance_report:${request.portfolioId}:${request.startDate.toISOString()}:${request.endDate.toISOString()}`;
    await redisService.set(key, JSON.stringify(report), 3600); // 1 hour TTL
  }

  private mapDbRowToPerformanceMetrics(row: any): PerformanceMetrics {
    return {
      id: row.id,
      portfolioId: row.portfolio_id,
      periodStart: new Date(row.period_start),
      periodEnd: new Date(row.period_end),
      totalReturn: parseFloat(row.total_return) || 0,
      annualizedReturn: parseFloat(row.annualized_return) || 0,
      volatility: parseFloat(row.volatility) || 0,
      sharpeRatio: parseFloat(row.sharpe_ratio) || 0,
      sortinoRatio: parseFloat(row.sortino_ratio) || 0,
      maxDrawdown: parseFloat(row.max_drawdown) || 0,
      winRate: parseFloat(row.win_rate) || 0,
      profitFactor: parseFloat(row.profit_factor) || 0,
      totalTrades: parseInt(row.total_trades) || 0,
      winningTrades: parseInt(row.winning_trades) || 0,
      losingTrades: parseInt(row.losing_trades) || 0,
      avgWin: parseFloat(row.avg_win) || 0,
      avgLoss: parseFloat(row.avg_loss) || 0,
      largestWin: parseFloat(row.largest_win) || 0,
      largestLoss: parseFloat(row.largest_loss) || 0,
      calculatedAt: new Date(row.calculated_at)
    };
  }
}

export const performanceService = new PerformanceService();