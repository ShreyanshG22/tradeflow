import { logger } from '../utils/logger';

export type SubscriptionType = 'market-data' | 'portfolio' | 'strategy' | 'backtest' | 'notifications';

export interface Subscription {
  userId: string;
  type: SubscriptionType;
  resource: string; // symbol, strategyId, backtestId, etc.
  socketId: string;
  createdAt: Date;
}

export class SubscriptionManager {
  private subscriptions: Map<string, Subscription[]> = new Map(); // resource -> subscriptions
  private userSubscriptions: Map<string, Set<string>> = new Map(); // userId -> resource keys
  private socketSubscriptions: Map<string, Set<string>> = new Map(); // socketId -> resource keys

  public subscribe(userId: string, type: SubscriptionType, resource: string, socketId: string): void {
    const key = this.getResourceKey(type, resource);
    
    // Check if already subscribed
    const existing = this.subscriptions.get(key)?.find(
      sub => sub.userId === userId && sub.socketId === socketId
    );
    
    if (existing) {
      logger.debug('Subscription already exists', { userId, type, resource, socketId });
      return;
    }

    const subscription: Subscription = {
      userId,
      type,
      resource,
      socketId,
      createdAt: new Date()
    };

    // Add to subscriptions map
    if (!this.subscriptions.has(key)) {
      this.subscriptions.set(key, []);
    }
    this.subscriptions.get(key)!.push(subscription);

    // Track user subscriptions
    if (!this.userSubscriptions.has(userId)) {
      this.userSubscriptions.set(userId, new Set());
    }
    this.userSubscriptions.get(userId)!.add(key);

    // Track socket subscriptions
    if (!this.socketSubscriptions.has(socketId)) {
      this.socketSubscriptions.set(socketId, new Set());
    }
    this.socketSubscriptions.get(socketId)!.add(key);

    logger.debug('Subscription added', {
      userId,
      type,
      resource,
      socketId,
      totalSubscriptions: this.getTotalSubscriptionCount()
    });
  }

  public unsubscribe(userId: string, type: SubscriptionType, resource: string, socketId: string): void {
    const key = this.getResourceKey(type, resource);
    
    const subscriptions = this.subscriptions.get(key);
    if (!subscriptions) {
      return;
    }

    // Remove the specific subscription
    const index = subscriptions.findIndex(
      sub => sub.userId === userId && sub.socketId === socketId
    );
    
    if (index !== -1) {
      subscriptions.splice(index, 1);
      
      // Clean up empty subscription arrays
      if (subscriptions.length === 0) {
        this.subscriptions.delete(key);
      }

      // Remove from user subscriptions
      const userSubs = this.userSubscriptions.get(userId);
      if (userSubs) {
        userSubs.delete(key);
        if (userSubs.size === 0) {
          this.userSubscriptions.delete(userId);
        }
      }

      // Remove from socket subscriptions
      const socketSubs = this.socketSubscriptions.get(socketId);
      if (socketSubs) {
        socketSubs.delete(key);
        if (socketSubs.size === 0) {
          this.socketSubscriptions.delete(socketId);
        }
      }

      logger.debug('Subscription removed', {
        userId,
        type,
        resource,
        socketId,
        totalSubscriptions: this.getTotalSubscriptionCount()
      });
    }
  }

  public getSubscribers(type: SubscriptionType, resource: string): Subscription[] {
    const key = this.getResourceKey(type, resource);
    return this.subscriptions.get(key) || [];
  }

  public getUserSubscriptions(userId: string): Subscription[] {
    const userKeys = this.userSubscriptions.get(userId);
    if (!userKeys) {
      return [];
    }

    const subscriptions: Subscription[] = [];
    userKeys.forEach(key => {
      const subs = this.subscriptions.get(key) || [];
      subscriptions.push(...subs.filter(sub => sub.userId === userId));
    });

    return subscriptions;
  }

  public getSocketSubscriptions(socketId: string): Subscription[] {
    const socketKeys = this.socketSubscriptions.get(socketId);
    if (!socketKeys) {
      return [];
    }

    const subscriptions: Subscription[] = [];
    socketKeys.forEach(key => {
      const subs = this.subscriptions.get(key) || [];
      subscriptions.push(...subs.filter(sub => sub.socketId === socketId));
    });

    return subscriptions;
  }

  public cleanupSocket(socketId: string): void {
    const socketKeys = this.socketSubscriptions.get(socketId);
    if (!socketKeys) {
      return;
    }

    let removedCount = 0;
    
    socketKeys.forEach(key => {
      const subscriptions = this.subscriptions.get(key);
      if (subscriptions) {
        const originalLength = subscriptions.length;
        
        // Remove all subscriptions for this socket
        const filtered = subscriptions.filter(sub => sub.socketId !== socketId);
        
        if (filtered.length === 0) {
          this.subscriptions.delete(key);
        } else {
          this.subscriptions.set(key, filtered);
        }
        
        removedCount += originalLength - filtered.length;
      }
    });

    // Clean up user subscriptions
    this.socketSubscriptions.delete(socketId);
    
    // Clean up user subscription tracking
    for (const [userId, userKeys] of this.userSubscriptions.entries()) {
      socketKeys.forEach(key => userKeys.delete(key));
      if (userKeys.size === 0) {
        this.userSubscriptions.delete(userId);
      }
    }

    logger.debug('Socket subscriptions cleaned up', {
      socketId,
      removedSubscriptions: removedCount,
      totalSubscriptions: this.getTotalSubscriptionCount()
    });
  }

  public cleanupUser(userId: string): void {
    const userKeys = this.userSubscriptions.get(userId);
    if (!userKeys) {
      return;
    }

    let removedCount = 0;
    
    userKeys.forEach(key => {
      const subscriptions = this.subscriptions.get(key);
      if (subscriptions) {
        const originalLength = subscriptions.length;
        
        // Remove all subscriptions for this user
        const filtered = subscriptions.filter(sub => sub.userId !== userId);
        
        if (filtered.length === 0) {
          this.subscriptions.delete(key);
        } else {
          this.subscriptions.set(key, filtered);
        }
        
        removedCount += originalLength - filtered.length;
      }
    });

    // Clean up user tracking
    this.userSubscriptions.delete(userId);
    
    // Clean up socket subscription tracking
    for (const [socketId, socketKeys] of this.socketSubscriptions.entries()) {
      userKeys.forEach(key => socketKeys.delete(key));
      if (socketKeys.size === 0) {
        this.socketSubscriptions.delete(socketId);
      }
    }

    logger.debug('User subscriptions cleaned up', {
      userId,
      removedSubscriptions: removedCount,
      totalSubscriptions: this.getTotalSubscriptionCount()
    });
  }

  public hasSubscribers(type: SubscriptionType, resource: string): boolean {
    const key = this.getResourceKey(type, resource);
    const subscriptions = this.subscriptions.get(key);
    return subscriptions ? subscriptions.length > 0 : false;
  }

  public getSubscriptionStats(): {
    totalSubscriptions: number;
    subscriptionsByType: Record<SubscriptionType, number>;
    activeUsers: number;
    activeSockets: number;
    resourcesWithSubscriptions: number;
  } {
    let totalSubscriptions = 0;
    const subscriptionsByType: Record<SubscriptionType, number> = {
      'market-data': 0,
      'portfolio': 0,
      'strategy': 0,
      'backtest': 0,
      'notifications': 0
    };

    for (const subscriptions of this.subscriptions.values()) {
      totalSubscriptions += subscriptions.length;
      
      subscriptions.forEach(sub => {
        subscriptionsByType[sub.type]++;
      });
    }

    return {
      totalSubscriptions,
      subscriptionsByType,
      activeUsers: this.userSubscriptions.size,
      activeSockets: this.socketSubscriptions.size,
      resourcesWithSubscriptions: this.subscriptions.size
    };
  }

  private getResourceKey(type: SubscriptionType, resource: string): string {
    return `${type}:${resource}`;
  }

  private getTotalSubscriptionCount(): number {
    let count = 0;
    for (const subscriptions of this.subscriptions.values()) {
      count += subscriptions.length;
    }
    return count;
  }
}