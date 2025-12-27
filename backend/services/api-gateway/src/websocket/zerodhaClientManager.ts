import { Server as SocketIOServer } from 'socket.io';
import { AuthenticatedSocket } from './socketHandler';
import { logger } from '../utils/logger';

export interface ClientSubscription {
  userId: string;
  socketId: string;
  subscriptionType: 'market-data' | 'orders' | 'portfolio' | 'risk-alerts';
  filters?: {
    instruments?: number[];
    exchanges?: string[];
    symbols?: string[];
  };
  createdAt: Date;
  lastActivity: Date;
}

export class ZerodhaClientManager {
  private io: SocketIOServer;
  private clientSubscriptions: Map<string, ClientSubscription[]> = new Map(); // socketId -> subscriptions
  private subscriptionsByType: Map<string, Set<string>> = new Map(); // subscriptionType -> Set of socketIds
  private userSockets: Map<string, Set<string>> = new Map(); // userId -> Set of socketIds
  private cleanupInterval: NodeJS.Timeout;

  constructor(io: SocketIOServer) {
    this.io = io;
    this.setupCleanupInterval();
  }

  public addSubscription(
    socket: AuthenticatedSocket,
    subscriptionType: ClientSubscription['subscriptionType'],
    filters?: ClientSubscription['filters']
  ): void {
    const subscription: ClientSubscription = {
      userId: socket.userId!,
      socketId: socket.id,
      subscriptionType,
      filters,
      createdAt: new Date(),
      lastActivity: new Date()
    };

    // Add to client subscriptions
    if (!this.clientSubscriptions.has(socket.id)) {
      this.clientSubscriptions.set(socket.id, []);
    }
    this.clientSubscriptions.get(socket.id)!.push(subscription);

    // Add to subscriptions by type
    if (!this.subscriptionsByType.has(subscriptionType)) {
      this.subscriptionsByType.set(subscriptionType, new Set());
    }
    this.subscriptionsByType.get(subscriptionType)!.add(socket.id);

    // Track user sockets
    if (!this.userSockets.has(socket.userId!)) {
      this.userSockets.set(socket.userId!, new Set());
    }
    this.userSockets.get(socket.userId!)!.add(socket.id);

    logger.debug('Zerodha client subscription added', {
      socketId: socket.id,
      userId: socket.userId,
      subscriptionType,
      filters
    });
  }

  public removeSubscription(
    socketId: string,
    subscriptionType: ClientSubscription['subscriptionType']
  ): void {
    const subscriptions = this.clientSubscriptions.get(socketId);
    if (!subscriptions) return;

    // Remove specific subscription
    const index = subscriptions.findIndex(sub => sub.subscriptionType === subscriptionType);
    if (index !== -1) {
      const removedSubscription = subscriptions.splice(index, 1)[0];
      
      // Remove from subscriptions by type
      const typeSubscriptions = this.subscriptionsByType.get(subscriptionType);
      if (typeSubscriptions) {
        typeSubscriptions.delete(socketId);
        if (typeSubscriptions.size === 0) {
          this.subscriptionsByType.delete(subscriptionType);
        }
      }

      logger.debug('Zerodha client subscription removed', {
        socketId,
        userId: removedSubscription.userId,
        subscriptionType
      });
    }

    // Clean up if no subscriptions left
    if (subscriptions.length === 0) {
      this.cleanupSocket(socketId);
    }
  }

  public cleanupSocket(socketId: string): void {
    const subscriptions = this.clientSubscriptions.get(socketId);
    if (!subscriptions) return;

    const userId = subscriptions[0]?.userId;

    // Remove from all subscription types
    subscriptions.forEach(subscription => {
      const typeSubscriptions = this.subscriptionsByType.get(subscription.subscriptionType);
      if (typeSubscriptions) {
        typeSubscriptions.delete(socketId);
        if (typeSubscriptions.size === 0) {
          this.subscriptionsByType.delete(subscription.subscriptionType);
        }
      }
    });

    // Remove from client subscriptions
    this.clientSubscriptions.delete(socketId);

    // Remove from user sockets
    if (userId) {
      const userSocketSet = this.userSockets.get(userId);
      if (userSocketSet) {
        userSocketSet.delete(socketId);
        if (userSocketSet.size === 0) {
          this.userSockets.delete(userId);
        }
      }
    }

    logger.debug('Zerodha client socket cleaned up', {
      socketId,
      userId
    });
  }

  public updateSubscriptionActivity(socketId: string): void {
    const subscriptions = this.clientSubscriptions.get(socketId);
    if (subscriptions) {
      subscriptions.forEach(subscription => {
        subscription.lastActivity = new Date();
      });
    }
  }

  public broadcastToSubscriptionType(
    subscriptionType: ClientSubscription['subscriptionType'],
    event: string,
    data: any,
    filter?: (subscription: ClientSubscription) => boolean
  ): void {
    const socketIds = this.subscriptionsByType.get(subscriptionType);
    if (!socketIds) return;

    socketIds.forEach(socketId => {
      const subscriptions = this.clientSubscriptions.get(socketId);
      if (!subscriptions) return;

      const relevantSubscription = subscriptions.find(sub => 
        sub.subscriptionType === subscriptionType && 
        (!filter || filter(sub))
      );

      if (relevantSubscription) {
        this.io.to(socketId).emit(event, data);
        this.updateSubscriptionActivity(socketId);
      }
    });
  }

  public broadcastToUser(
    userId: string,
    event: string,
    data: any,
    subscriptionType?: ClientSubscription['subscriptionType']
  ): void {
    const userSocketSet = this.userSockets.get(userId);
    if (!userSocketSet) return;

    userSocketSet.forEach(socketId => {
      if (subscriptionType) {
        const subscriptions = this.clientSubscriptions.get(socketId);
        const hasSubscription = subscriptions?.some(sub => sub.subscriptionType === subscriptionType);
        if (!hasSubscription) return;
      }

      this.io.to(socketId).emit(event, data);
      this.updateSubscriptionActivity(socketId);
    });
  }

  public broadcastMarketData(
    instrumentToken: number,
    data: any
  ): void {
    this.broadcastToSubscriptionType(
      'market-data',
      'zerodha:market-tick',
      data,
      (subscription) => {
        return !subscription.filters?.instruments || 
               subscription.filters.instruments.includes(instrumentToken);
      }
    );
  }

  public broadcastOrderUpdate(
    userId: string,
    orderData: any
  ): void {
    this.broadcastToUser(userId, 'zerodha:order-update', orderData, 'orders');
  }

  public broadcastPortfolioUpdate(
    userId: string,
    portfolioData: any
  ): void {
    this.broadcastToUser(userId, 'zerodha:portfolio-update', portfolioData, 'portfolio');
  }

  public broadcastRiskAlert(
    userId: string,
    riskAlert: any
  ): void {
    this.broadcastToUser(userId, 'zerodha:risk-alert', riskAlert, 'risk-alerts');
  }

  public getSubscriptionStats(): {
    totalClients: number;
    subscriptionsByType: Record<string, number>;
    activeUsers: number;
  } {
    const subscriptionsByType: Record<string, number> = {};
    
    this.subscriptionsByType.forEach((socketIds, type) => {
      subscriptionsByType[type] = socketIds.size;
    });

    return {
      totalClients: this.clientSubscriptions.size,
      subscriptionsByType,
      activeUsers: this.userSockets.size
    };
  }

  public getUserSubscriptions(userId: string): ClientSubscription[] {
    const userSocketSet = this.userSockets.get(userId);
    if (!userSocketSet) return [];

    const userSubscriptions: ClientSubscription[] = [];
    
    userSocketSet.forEach(socketId => {
      const subscriptions = this.clientSubscriptions.get(socketId);
      if (subscriptions) {
        userSubscriptions.push(...subscriptions);
      }
    });

    return userSubscriptions;
  }

  public getInstrumentSubscribers(instrumentToken: number): string[] {
    const subscribers: string[] = [];
    
    this.clientSubscriptions.forEach((subscriptions, socketId) => {
      const hasInstrument = subscriptions.some(sub => 
        sub.subscriptionType === 'market-data' &&
        (!sub.filters?.instruments || sub.filters.instruments.includes(instrumentToken))
      );
      
      if (hasInstrument) {
        subscribers.push(socketId);
      }
    });

    return subscribers;
  }

  private setupCleanupInterval(): void {
    // Clean up inactive subscriptions every 5 minutes
    this.cleanupInterval = setInterval(() => {
      this.cleanupInactiveSubscriptions();
    }, 5 * 60 * 1000);
  }

  private cleanupInactiveSubscriptions(): void {
    const now = new Date();
    const inactiveThreshold = 30 * 60 * 1000; // 30 minutes

    const socketsToCleanup: string[] = [];

    this.clientSubscriptions.forEach((subscriptions, socketId) => {
      const hasActiveSubscription = subscriptions.some(sub => 
        now.getTime() - sub.lastActivity.getTime() < inactiveThreshold
      );

      if (!hasActiveSubscription) {
        socketsToCleanup.push(socketId);
      }
    });

    socketsToCleanup.forEach(socketId => {
      logger.info('Cleaning up inactive Zerodha subscription', { socketId });
      this.cleanupSocket(socketId);
    });

    if (socketsToCleanup.length > 0) {
      logger.info('Cleaned up inactive Zerodha subscriptions', {
        count: socketsToCleanup.length
      });
    }
  }

  public destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    
    this.clientSubscriptions.clear();
    this.subscriptionsByType.clear();
    this.userSockets.clear();
  }
}