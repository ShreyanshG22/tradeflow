import { Server as SocketIOServer } from 'socket.io';
import { SubscriptionManager } from './subscriptionManager';
import { logger } from '../utils/logger';
import { ServiceProxy } from '../services/serviceProxy';

export interface PortfolioUpdate {
  userId: string;
  totalValue: number;
  cashBalance: number;
  unrealizedPnL: number;
  realizedPnL: number;
  dayChange: number;
  dayChangePercent: number;
  positions: PositionUpdate[];
  timestamp: Date;
}

export interface PositionUpdate {
  symbol: string;
  quantity: number;
  averagePrice: number;
  currentPrice: number;
  unrealizedPnL: number;
  unrealizedPnLPercent: number;
  marketValue: number;
}

export interface TradeUpdate {
  id: string;
  userId: string;
  symbol: string;
  side: 'buy' | 'sell';
  quantity: number;
  price: number;
  timestamp: Date;
  status: 'pending' | 'filled' | 'cancelled';
  strategyId?: string;
}

export class PortfolioUpdateManager {
  private io: SocketIOServer;
  private subscriptionManager: SubscriptionManager;
  private portfolioService: ServiceProxy;
  private activeUsers: Set<string> = new Set();
  private updateInterval: NodeJS.Timeout | null = null;
  private readonly UPDATE_INTERVAL_MS = 5000; // 5 seconds

  constructor(io: SocketIOServer, subscriptionManager: SubscriptionManager) {
    this.io = io;
    this.subscriptionManager = subscriptionManager;
    this.portfolioService = new ServiceProxy('portfolioService');
    
    this.startPortfolioUpdates();
  }

  public addSubscription(userId: string): void {
    if (!this.activeUsers.has(userId)) {
      this.activeUsers.add(userId);
      
      logger.debug('Portfolio subscription added', {
        userId,
        totalActiveUsers: this.activeUsers.size
      });

      // Send initial portfolio data
      this.sendInitialPortfolioData(userId);
    }
  }

  public removeSubscription(userId: string): void {
    // Only remove if no subscribers remain
    if (!this.subscriptionManager.hasSubscribers('portfolio', userId)) {
      this.activeUsers.delete(userId);
      
      logger.debug('Portfolio subscription removed', {
        userId,
        totalActiveUsers: this.activeUsers.size
      });
    }
  }

  private startPortfolioUpdates(): void {
    this.updateInterval = setInterval(() => {
      this.fetchAndBroadcastUpdates();
    }, this.UPDATE_INTERVAL_MS);

    logger.info('Portfolio update service started', {
      updateInterval: `${this.UPDATE_INTERVAL_MS}ms`
    });
  }

  private async sendInitialPortfolioData(userId: string): Promise<void> {
    try {
      const portfolioData = await this.fetchPortfolioData(userId);
      if (portfolioData) {
        this.broadcastPortfolioUpdate(userId, portfolioData);
      }
    } catch (error) {
      logger.error('Failed to send initial portfolio data', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  private async fetchAndBroadcastUpdates(): Promise<void> {
    if (this.activeUsers.size === 0) {
      return;
    }

    try {
      // Fetch updates for all active users
      const updatePromises = Array.from(this.activeUsers).map(userId => 
        this.fetchPortfolioData(userId)
      );

      const updates = await Promise.allSettled(updatePromises);
      
      updates.forEach((result, index) => {
        const userId = Array.from(this.activeUsers)[index];
        
        if (result.status === 'fulfilled' && result.value) {
          this.broadcastPortfolioUpdate(userId, result.value);
        } else if (result.status === 'rejected') {
          logger.warn('Portfolio data fetch failed', {
            userId,
            error: result.reason instanceof Error ? result.reason.message : 'Unknown error'
          });
        }
      });

    } catch (error) {
      logger.error('Portfolio update cycle failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        activeUsers: Array.from(this.activeUsers)
      });
    }
  }

  private async fetchPortfolioData(userId: string): Promise<PortfolioUpdate | null> {
    try {
      // Create a mock JWT token for the service call
      // In production, you'd have a service-to-service authentication mechanism
      const mockToken = `Bearer service-token-for-${userId}`;
      
      const [portfolioResponse, positionsResponse] = await Promise.all([
        this.portfolioService.get('/portfolio', {
          headers: { Authorization: mockToken }
        }),
        this.portfolioService.get('/portfolio/positions', {
          headers: { Authorization: mockToken }
        })
      ]);

      const portfolio = portfolioResponse.data;
      const positions = positionsResponse.data;

      if (!portfolio) {
        return null;
      }

      return {
        userId,
        totalValue: portfolio.totalValue || 0,
        cashBalance: portfolio.cashBalance || 0,
        unrealizedPnL: portfolio.unrealizedPnL || 0,
        realizedPnL: portfolio.realizedPnL || 0,
        dayChange: portfolio.dayChange || 0,
        dayChangePercent: portfolio.dayChangePercent || 0,
        positions: positions?.positions?.map((pos: any) => ({
          symbol: pos.symbol,
          quantity: pos.quantity,
          averagePrice: pos.averagePrice,
          currentPrice: pos.currentPrice,
          unrealizedPnL: pos.unrealizedPnL,
          unrealizedPnLPercent: pos.unrealizedPnLPercent,
          marketValue: pos.marketValue
        })) || [],
        timestamp: new Date()
      };

    } catch (error) {
      // Don't log every error to avoid spam
      if (Math.random() < 0.1) { // Log 10% of errors
        logger.debug('Portfolio data fetch error', {
          userId,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
      return null;
    }
  }

  private broadcastPortfolioUpdate(userId: string, update: PortfolioUpdate): void {
    const subscribers = this.subscriptionManager.getSubscribers('portfolio', userId);
    
    if (subscribers.length === 0) {
      // No subscribers, remove from active users
      this.activeUsers.delete(userId);
      return;
    }

    // Group subscribers by socket ID to avoid duplicate sends
    const socketIds = new Set(subscribers.map(sub => sub.socketId));
    
    socketIds.forEach(socketId => {
      this.io.to(socketId).emit('portfolio:update', {
        type: 'portfolio',
        data: update
      });
    });

    logger.debug('Portfolio update broadcasted', {
      userId,
      subscriberCount: subscribers.length,
      totalValue: update.totalValue
    });
  }

  public broadcastTradeUpdate(userId: string, trade: TradeUpdate): void {
    const subscribers = this.subscriptionManager.getSubscribers('portfolio', userId);
    
    if (subscribers.length === 0) {
      return;
    }

    const socketIds = new Set(subscribers.map(sub => sub.socketId));
    
    socketIds.forEach(socketId => {
      this.io.to(socketId).emit('portfolio:trade', {
        type: 'trade',
        data: trade
      });
    });

    logger.debug('Trade update broadcasted', {
      userId,
      tradeId: trade.id,
      symbol: trade.symbol,
      subscriberCount: subscribers.length
    });
  }

  public broadcastPositionUpdate(userId: string, position: PositionUpdate): void {
    const subscribers = this.subscriptionManager.getSubscribers('portfolio', userId);
    
    if (subscribers.length === 0) {
      return;
    }

    const socketIds = new Set(subscribers.map(sub => sub.socketId));
    
    socketIds.forEach(socketId => {
      this.io.to(socketId).emit('portfolio:position', {
        type: 'position',
        data: position
      });
    });

    logger.debug('Position update broadcasted', {
      userId,
      symbol: position.symbol,
      subscriberCount: subscribers.length
    });
  }

  public broadcastRiskAlert(userId: string, alert: {
    type: 'drawdown' | 'position-limit' | 'daily-loss';
    message: string;
    severity: 'warning' | 'critical';
    data?: any;
  }): void {
    const subscribers = this.subscriptionManager.getSubscribers('portfolio', userId);
    
    if (subscribers.length === 0) {
      return;
    }

    const socketIds = new Set(subscribers.map(sub => sub.socketId));
    
    socketIds.forEach(socketId => {
      this.io.to(socketId).emit('portfolio:risk-alert', {
        type: 'risk-alert',
        data: {
          ...alert,
          timestamp: new Date().toISOString()
        }
      });
    });

    logger.warn('Risk alert broadcasted', {
      userId,
      alertType: alert.type,
      severity: alert.severity,
      subscriberCount: subscribers.length
    });
  }

  public getActiveUsers(): string[] {
    return Array.from(this.activeUsers);
  }

  public getSubscriberCount(userId: string): number {
    return this.subscriptionManager.getSubscribers('portfolio', userId).length;
  }

  public stop(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
    
    this.activeUsers.clear();
    logger.info('Portfolio update manager stopped');
  }
}