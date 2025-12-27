import { databaseService } from './database';
import { positionService } from './positionService';
import { redisService } from './redis';
import { logger } from '../utils/logger';
import { 
  Trade, 
  TradeFilter,
  Position
} from '../types';

export interface CreateTradeRequest {
  portfolioId: string;
  strategyId?: string;
  symbol: string;
  side: 'buy' | 'sell';
  quantity: number;
  price: number;
  tradeType?: 'market' | 'limit' | 'stop' | 'stop_limit';
  fees?: number;
  commission?: number;
  orderId?: string;
  brokerTradeId?: string;
}

export interface TradeReconciliationResult {
  tradeId: string;
  status: 'matched' | 'unmatched' | 'discrepancy';
  discrepancies?: string[];
  brokerTrade?: any;
  systemTrade?: Trade;
}

export class TradeService {

  async recordTrade(request: CreateTradeRequest): Promise<Trade> {
    try {
      return await databaseService.transaction(async (client) => {
        // Calculate total amount
        const totalAmount = request.quantity * request.price;
        const fees = request.fees || 0;
        const commission = request.commission || 0;

        // Insert trade record
        const tradeResult = await client.query(`
          INSERT INTO trading.trades (
            portfolio_id, strategy_id, symbol, side, quantity, price, 
            total_amount, fees, commission, trade_type, status, 
            order_id, broker_trade_id, executed_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW())
          RETURNING *
        `, [
          request.portfolioId,
          request.strategyId,
          request.symbol,
          request.side,
          request.quantity,
          request.price,
          totalAmount,
          fees,
          commission,
          request.tradeType || 'market',
          'filled',
          request.orderId,
          request.brokerTradeId
        ]);

        const trade = this.mapDbRowToTrade(tradeResult.rows[0]);

        // Update position
        const position = await positionService.updatePositionFromTrade(
          request.portfolioId,
          request.symbol,
          request.side,
          request.quantity,
          request.price
        );

        // Update position reference in trade
        await client.query(`
          UPDATE trading.trades 
          SET position_id = $1 
          WHERE id = $2
        `, [position.id, trade.id]);

        // Publish trade event for real-time updates
        await this.publishTradeEvent('trade.executed', {
          trade,
          position,
          portfolioId: request.portfolioId
        });

        logger.info('Trade recorded successfully', {
          tradeId: trade.id,
          portfolioId: request.portfolioId,
          symbol: request.symbol,
          side: request.side,
          quantity: request.quantity,
          price: request.price
        });

        return trade;
      });
    } catch (error) {
      logger.error('Failed to record trade', { request, error });
      throw error;
    }
  }

  async getTrade(tradeId: string): Promise<Trade | null> {
    try {
      const result = await databaseService.query(`
        SELECT * FROM trading.trades WHERE id = $1
      `, [tradeId]);

      if (result.rows.length === 0) {
        return null;
      }

      return this.mapDbRowToTrade(result.rows[0]);
    } catch (error) {
      logger.error('Failed to get trade', { tradeId, error });
      throw error;
    }
  }

  async getTrades(filter: TradeFilter): Promise<Trade[]> {
    try {
      let query = `
        SELECT * FROM trading.trades 
        WHERE portfolio_id = $1
      `;
      const params: any[] = [filter.portfolioId];
      let paramIndex = 2;

      if (filter.strategyId) {
        query += ` AND strategy_id = $${paramIndex}`;
        params.push(filter.strategyId);
        paramIndex++;
      }

      if (filter.symbol) {
        query += ` AND symbol = $${paramIndex}`;
        params.push(filter.symbol);
        paramIndex++;
      }

      if (filter.side) {
        query += ` AND side = $${paramIndex}`;
        params.push(filter.side);
        paramIndex++;
      }

      if (filter.status) {
        query += ` AND status = $${paramIndex}`;
        params.push(filter.status);
        paramIndex++;
      }

      if (filter.startDate) {
        query += ` AND executed_at >= $${paramIndex}`;
        params.push(filter.startDate);
        paramIndex++;
      }

      if (filter.endDate) {
        query += ` AND executed_at <= $${paramIndex}`;
        params.push(filter.endDate);
        paramIndex++;
      }

      query += ` ORDER BY executed_at DESC`;

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
      
      return result.rows.map(row => this.mapDbRowToTrade(row));
    } catch (error) {
      logger.error('Failed to get trades', { filter, error });
      throw error;
    }
  }

  async updateTradeStatus(tradeId: string, status: string, brokerTradeId?: string): Promise<Trade> {
    try {
      const result = await databaseService.query(`
        UPDATE trading.trades 
        SET 
          status = $1,
          broker_trade_id = COALESCE($2, broker_trade_id),
          updated_at = NOW()
        WHERE id = $3
        RETURNING *
      `, [status, brokerTradeId, tradeId]);

      if (result.rows.length === 0) {
        throw new Error('Trade not found');
      }

      const trade = this.mapDbRowToTrade(result.rows[0]);

      // Publish status update event
      await this.publishTradeEvent('trade.status_updated', {
        trade,
        previousStatus: status
      });

      logger.info('Trade status updated', { tradeId, status, brokerTradeId });

      return trade;
    } catch (error) {
      logger.error('Failed to update trade status', { tradeId, status, error });
      throw error;
    }
  }

  async reconcileTrades(portfolioId: string, brokerTrades: any[]): Promise<TradeReconciliationResult[]> {
    try {
      const results: TradeReconciliationResult[] = [];

      // Get system trades for the portfolio
      const systemTrades = await this.getTrades({
        portfolioId,
        limit: 1000 // Adjust as needed
      });

      // Create maps for efficient lookup
      const systemTradesByBrokerId = new Map<string, Trade>();
      const systemTradesByOrderId = new Map<string, Trade>();

      systemTrades.forEach(trade => {
        if (trade.brokerTradeId) {
          systemTradesByBrokerId.set(trade.brokerTradeId, trade);
        }
        if (trade.orderId) {
          systemTradesByOrderId.set(trade.orderId, trade);
        }
      });

      // Reconcile each broker trade
      for (const brokerTrade of brokerTrades) {
        const result = await this.reconcileSingleTrade(
          brokerTrade,
          systemTradesByBrokerId,
          systemTradesByOrderId
        );
        results.push(result);
      }

      // Find unmatched system trades
      const matchedSystemTradeIds = new Set(
        results
          .filter(r => r.status === 'matched')
          .map(r => r.systemTrade?.id)
          .filter(Boolean)
      );

      const unmatchedSystemTrades = systemTrades.filter(
        trade => !matchedSystemTradeIds.has(trade.id)
      );

      // Add unmatched system trades to results
      unmatchedSystemTrades.forEach(trade => {
        results.push({
          tradeId: trade.id,
          status: 'unmatched',
          systemTrade: trade,
          discrepancies: ['Trade exists in system but not found in broker records']
        });
      });

      logger.info('Trade reconciliation completed', {
        portfolioId,
        totalBrokerTrades: brokerTrades.length,
        totalSystemTrades: systemTrades.length,
        matched: results.filter(r => r.status === 'matched').length,
        unmatched: results.filter(r => r.status === 'unmatched').length,
        discrepancies: results.filter(r => r.status === 'discrepancy').length
      });

      return results;
    } catch (error) {
      logger.error('Failed to reconcile trades', { portfolioId, error });
      throw error;
    }
  }

  async getTradeStatistics(portfolioId: string, startDate?: Date, endDate?: Date): Promise<any> {
    try {
      let query = `
        SELECT 
          COUNT(*) as total_trades,
          COUNT(CASE WHEN side = 'buy' THEN 1 END) as buy_trades,
          COUNT(CASE WHEN side = 'sell' THEN 1 END) as sell_trades,
          SUM(total_amount) as total_volume,
          SUM(fees + commission) as total_fees,
          AVG(total_amount) as avg_trade_size,
          COUNT(DISTINCT symbol) as unique_symbols,
          COUNT(CASE WHEN status = 'filled' THEN 1 END) as filled_trades,
          COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled_trades
        FROM trading.trades 
        WHERE portfolio_id = $1
      `;
      const params: any[] = [portfolioId];
      let paramIndex = 2;

      if (startDate) {
        query += ` AND executed_at >= $${paramIndex}`;
        params.push(startDate);
        paramIndex++;
      }

      if (endDate) {
        query += ` AND executed_at <= $${paramIndex}`;
        params.push(endDate);
      }

      const result = await databaseService.query(query, params);
      
      return {
        totalTrades: parseInt(result.rows[0].total_trades),
        buyTrades: parseInt(result.rows[0].buy_trades),
        sellTrades: parseInt(result.rows[0].sell_trades),
        totalVolume: parseFloat(result.rows[0].total_volume) || 0,
        totalFees: parseFloat(result.rows[0].total_fees) || 0,
        avgTradeSize: parseFloat(result.rows[0].avg_trade_size) || 0,
        uniqueSymbols: parseInt(result.rows[0].unique_symbols),
        filledTrades: parseInt(result.rows[0].filled_trades),
        cancelledTrades: parseInt(result.rows[0].cancelled_trades)
      };
    } catch (error) {
      logger.error('Failed to get trade statistics', { portfolioId, error });
      throw error;
    }
  }

  private async reconcileSingleTrade(
    brokerTrade: any,
    systemTradesByBrokerId: Map<string, Trade>,
    systemTradesByOrderId: Map<string, Trade>
  ): Promise<TradeReconciliationResult> {
    // Try to match by broker trade ID first
    let systemTrade = systemTradesByBrokerId.get(brokerTrade.id);
    
    // If not found, try to match by order ID
    if (!systemTrade && brokerTrade.orderId) {
      systemTrade = systemTradesByOrderId.get(brokerTrade.orderId);
    }

    if (!systemTrade) {
      return {
        tradeId: brokerTrade.id,
        status: 'unmatched',
        brokerTrade,
        discrepancies: ['Trade exists in broker records but not found in system']
      };
    }

    // Check for discrepancies
    const discrepancies: string[] = [];

    if (Math.abs(systemTrade.quantity - brokerTrade.quantity) > 0.00001) {
      discrepancies.push(`Quantity mismatch: system=${systemTrade.quantity}, broker=${brokerTrade.quantity}`);
    }

    if (Math.abs(systemTrade.price - brokerTrade.price) > 0.01) {
      discrepancies.push(`Price mismatch: system=${systemTrade.price}, broker=${brokerTrade.price}`);
    }

    if (systemTrade.symbol !== brokerTrade.symbol) {
      discrepancies.push(`Symbol mismatch: system=${systemTrade.symbol}, broker=${brokerTrade.symbol}`);
    }

    if (systemTrade.side !== brokerTrade.side) {
      discrepancies.push(`Side mismatch: system=${systemTrade.side}, broker=${brokerTrade.side}`);
    }

    const status = discrepancies.length > 0 ? 'discrepancy' : 'matched';

    return {
      tradeId: systemTrade.id,
      status,
      discrepancies: discrepancies.length > 0 ? discrepancies : undefined,
      brokerTrade,
      systemTrade
    };
  }

  private mapDbRowToTrade(row: any): Trade {
    return {
      id: row.id,
      portfolioId: row.portfolio_id,
      strategyId: row.strategy_id,
      positionId: row.position_id,
      symbol: row.symbol,
      side: row.side,
      quantity: parseFloat(row.quantity),
      price: parseFloat(row.price),
      totalAmount: parseFloat(row.total_amount),
      fees: parseFloat(row.fees) || 0,
      commission: parseFloat(row.commission) || 0,
      tradeType: row.trade_type,
      status: row.status,
      orderId: row.order_id,
      brokerTradeId: row.broker_trade_id,
      executedAt: row.executed_at ? new Date(row.executed_at) : undefined,
      createdAt: new Date(row.created_at)
    };
  }

  private async publishTradeEvent(eventType: string, data: any): Promise<void> {
    try {
      const message = JSON.stringify({
        type: eventType,
        data,
        timestamp: new Date().toISOString()
      });

      await redisService.publish('portfolio.events', message);
    } catch (error) {
      logger.error('Failed to publish trade event', { eventType, error });
      // Don't throw error as this is not critical for trade recording
    }
  }
}

export const tradeService = new TradeService();