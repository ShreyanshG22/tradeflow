import { Server as SocketIOServer } from 'socket.io';
import { SubscriptionManager } from './subscriptionManager';
import { logger } from '../utils/logger';
import { ServiceProxy } from '../services/serviceProxy';

export interface MarketDataUpdate {
  symbol: string;
  price: number;
  bid: number;
  ask: number;
  volume: number;
  change: number;
  changePercent: number;
  timestamp: Date;
}

export class MarketDataManager {
  private io: SocketIOServer;
  private subscriptionManager: SubscriptionManager;
  private marketDataService: ServiceProxy;
  private activeSymbols: Set<string> = new Set();
  private updateInterval: NodeJS.Timeout | null = null;
  private readonly UPDATE_INTERVAL_MS = 1000; // 1 second

  constructor(io: SocketIOServer, subscriptionManager: SubscriptionManager) {
    this.io = io;
    this.subscriptionManager = subscriptionManager;
    this.marketDataService = new ServiceProxy('marketDataService');
    
    this.startMarketDataUpdates();
  }

  public addSubscriptions(symbols: string[]): void {
    let newSymbols = false;
    
    symbols.forEach(symbol => {
      if (!this.activeSymbols.has(symbol)) {
        this.activeSymbols.add(symbol);
        newSymbols = true;
      }
    });

    if (newSymbols) {
      logger.debug('Market data subscriptions added', {
        symbols,
        totalActiveSymbols: this.activeSymbols.size
      });
    }
  }

  public removeSubscriptions(symbols: string[]): void {
    symbols.forEach(symbol => {
      // Only remove if no subscribers remain
      if (!this.subscriptionManager.hasSubscribers('market-data', symbol)) {
        this.activeSymbols.delete(symbol);
      }
    });

    logger.debug('Market data subscriptions removed', {
      symbols,
      totalActiveSymbols: this.activeSymbols.size
    });
  }

  private startMarketDataUpdates(): void {
    this.updateInterval = setInterval(() => {
      this.fetchAndBroadcastUpdates();
    }, this.UPDATE_INTERVAL_MS);

    logger.info('Market data update service started', {
      updateInterval: `${this.UPDATE_INTERVAL_MS}ms`
    });
  }

  private async fetchAndBroadcastUpdates(): Promise<void> {
    if (this.activeSymbols.size === 0) {
      return;
    }

    try {
      // Fetch updates for all active symbols
      const updatePromises = Array.from(this.activeSymbols).map(symbol => 
        this.fetchMarketData(symbol)
      );

      const updates = await Promise.allSettled(updatePromises);
      
      updates.forEach((result, index) => {
        const symbol = Array.from(this.activeSymbols)[index];
        
        if (result.status === 'fulfilled' && result.value) {
          this.broadcastMarketDataUpdate(symbol, result.value);
        } else if (result.status === 'rejected') {
          logger.warn('Market data fetch failed', {
            symbol,
            error: result.reason instanceof Error ? result.reason.message : 'Unknown error'
          });
        }
      });

    } catch (error) {
      logger.error('Market data update cycle failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        activeSymbols: Array.from(this.activeSymbols)
      });
    }
  }

  private async fetchMarketData(symbol: string): Promise<MarketDataUpdate | null> {
    try {
      const response = await this.marketDataService.get(`/quote/${symbol}`);
      const data = response.data;

      if (!data || !data.quote) {
        return null;
      }

      const quote = data.quote;
      return {
        symbol,
        price: quote.price || quote.close,
        bid: quote.bid || quote.price,
        ask: quote.ask || quote.price,
        volume: quote.volume || 0,
        change: quote.change || 0,
        changePercent: quote.changePercent || 0,
        timestamp: new Date()
      };

    } catch (error) {
      // Don't log every error to avoid spam
      if (Math.random() < 0.1) { // Log 10% of errors
        logger.debug('Market data fetch error', {
          symbol,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
      return null;
    }
  }

  private broadcastMarketDataUpdate(symbol: string, update: MarketDataUpdate): void {
    const subscribers = this.subscriptionManager.getSubscribers('market-data', symbol);
    
    if (subscribers.length === 0) {
      // No subscribers, remove from active symbols
      this.activeSymbols.delete(symbol);
      return;
    }

    // Group subscribers by socket ID to avoid duplicate sends
    const socketIds = new Set(subscribers.map(sub => sub.socketId));
    
    socketIds.forEach(socketId => {
      this.io.to(socketId).emit('market-data:update', {
        type: 'quote',
        data: update
      });
    });

    logger.debug('Market data update broadcasted', {
      symbol,
      subscriberCount: subscribers.length,
      price: update.price
    });
  }

  public broadcastMarketDataEvent(symbol: string, event: string, data: any): void {
    const subscribers = this.subscriptionManager.getSubscribers('market-data', symbol);
    
    if (subscribers.length === 0) {
      return;
    }

    const socketIds = new Set(subscribers.map(sub => sub.socketId));
    
    socketIds.forEach(socketId => {
      this.io.to(socketId).emit('market-data:event', {
        symbol,
        event,
        data,
        timestamp: new Date().toISOString()
      });
    });

    logger.debug('Market data event broadcasted', {
      symbol,
      event,
      subscriberCount: subscribers.length
    });
  }

  public broadcastMarketStatus(status: 'open' | 'closed' | 'pre-market' | 'after-hours'): void {
    this.io.emit('market-data:status', {
      status,
      timestamp: new Date().toISOString()
    });

    logger.info('Market status broadcasted', { status });
  }

  public getActiveSymbols(): string[] {
    return Array.from(this.activeSymbols);
  }

  public getSubscriberCount(symbol: string): number {
    return this.subscriptionManager.getSubscribers('market-data', symbol).length;
  }

  public stop(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
    
    this.activeSymbols.clear();
    logger.info('Market data manager stopped');
  }
}