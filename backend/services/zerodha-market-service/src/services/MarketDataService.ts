import { EventEmitter } from 'events';
import { ZerodhaAPIClient } from '@tradeflow/zerodha-utils';
import { ZerodhaMarketTick, ZerodhaQuote, ZerodhaAPIResponse } from '@tradeflow/types';
import { createLogger } from '@tradeflow/zerodha-utils';
import { WebSocketService } from './WebSocketService';
import { RedisService } from './RedisService';
import { InstrumentService } from './InstrumentService';

const logger = createLogger('MarketDataService');

export interface MarketDataSubscription {
  userId: string;
  instrumentTokens: number[];
  mode: 'ltp' | 'quote' | 'full';
  callback?: (tick: ZerodhaMarketTick) => void;
}

export interface QuoteRequest {
  exchange: string;
  tradingsymbol: string;
}

export class MarketDataService extends EventEmitter {
  private apiClient: ZerodhaAPIClient;
  private wsService: WebSocketService | null = null;
  private redisService: RedisService;
  private instrumentService: InstrumentService;
  private subscriptions: Map<string, MarketDataSubscription> = new Map();
  private activeTokens: Set<number> = new Set();
  private latestTicks: Map<number, ZerodhaMarketTick> = new Map();
  private isInitialized: boolean = false;

  constructor(
    apiClient: ZerodhaAPIClient,
    redisService: RedisService,
    instrumentService: InstrumentService
  ) {
    super();
    this.apiClient = apiClient;
    this.redisService = redisService;
    this.instrumentService = instrumentService;
  }

  public async initialize(accessToken: string): Promise<void> {
    try {
      if (this.isInitialized) {
        logger.warn('MarketDataService already initialized');
        return;
      }

      logger.info('Initializing MarketDataService...');

      // Set access token for API client
      this.apiClient.setAccessToken(accessToken);

      // Initialize WebSocket service
      this.wsService = new WebSocketService({
        apiKey: this.apiClient.getApiKey(),
        accessToken: accessToken,
        reconnectInterval: parseInt(process.env.WS_RECONNECT_INTERVAL || '5000'),
        maxReconnectAttempts: parseInt(process.env.WS_MAX_RECONNECT_ATTEMPTS || '10'),
        debug: process.env.NODE_ENV === 'development',
      });

      this.setupWebSocketHandlers();

      // Connect WebSocket
      await this.wsService.connect();

      this.isInitialized = true;
      logger.info('MarketDataService initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize MarketDataService:', error);
      throw error;
    }
  }

  public async shutdown(): Promise<void> {
    try {
      logger.info('Shutting down MarketDataService...');

      if (this.wsService) {
        this.wsService.disconnect();
        this.wsService = null;
      }

      this.subscriptions.clear();
      this.activeTokens.clear();
      this.latestTicks.clear();
      this.isInitialized = false;

      logger.info('MarketDataService shut down successfully');
    } catch (error) {
      logger.error('Error shutting down MarketDataService:', error);
    }
  }

  public async subscribe(
    userId: string,
    instrumentTokens: number[],
    mode: 'ltp' | 'quote' | 'full' = 'ltp'
  ): Promise<void> {
    try {
      if (!this.isInitialized || !this.wsService) {
        throw new Error('MarketDataService not initialized');
      }

      logger.info(`Subscribing user ${userId} to ${instrumentTokens.length} instruments in ${mode} mode`);

      // Validate instrument tokens
      const validTokens = instrumentTokens.filter(token => {
        const instrument = this.instrumentService.getInstrumentByToken(token);
        if (!instrument) {
          logger.warn(`Invalid instrument token: ${token}`);
          return false;
        }
        return true;
      });

      if (validTokens.length === 0) {
        throw new Error('No valid instrument tokens provided');
      }

      // Store subscription
      const subscriptionId = `${userId}:${Date.now()}`;
      this.subscriptions.set(subscriptionId, {
        userId,
        instrumentTokens: validTokens,
        mode,
      });

      // Find new tokens that need to be subscribed
      const newTokens = validTokens.filter(token => !this.activeTokens.has(token));
      
      if (newTokens.length > 0) {
        // Subscribe to new tokens via WebSocket
        this.wsService.subscribe(mode, newTokens);
        
        // Add to active tokens
        newTokens.forEach(token => this.activeTokens.add(token));
      }

      // Update mode for existing tokens if needed
      const existingTokens = validTokens.filter(token => this.activeTokens.has(token));
      if (existingTokens.length > 0) {
        this.wsService.setMode(mode, existingTokens);
      }

      this.emit('subscribed', { userId, instrumentTokens: validTokens, mode });
      
      logger.info(`Successfully subscribed user ${userId} to ${validTokens.length} instruments`);
    } catch (error) {
      logger.error('Failed to subscribe to market data:', error);
      throw error;
    }
  }

  public async unsubscribe(userId: string, instrumentTokens?: number[]): Promise<void> {
    try {
      if (!this.isInitialized || !this.wsService) {
        throw new Error('MarketDataService not initialized');
      }

      logger.info(`Unsubscribing user ${userId} from market data`);

      // Find user subscriptions
      const userSubscriptions = Array.from(this.subscriptions.entries())
        .filter(([_, sub]) => sub.userId === userId);

      if (userSubscriptions.length === 0) {
        logger.warn(`No subscriptions found for user ${userId}`);
        return;
      }

      let tokensToUnsubscribe: number[] = [];

      if (instrumentTokens) {
        // Unsubscribe from specific tokens
        tokensToUnsubscribe = instrumentTokens;
        
        // Remove specific tokens from user subscriptions
        userSubscriptions.forEach(([subId, sub]) => {
          sub.instrumentTokens = sub.instrumentTokens.filter(
            token => !instrumentTokens.includes(token)
          );
          
          if (sub.instrumentTokens.length === 0) {
            this.subscriptions.delete(subId);
          }
        });
      } else {
        // Unsubscribe from all user tokens
        userSubscriptions.forEach(([subId, sub]) => {
          tokensToUnsubscribe.push(...sub.instrumentTokens);
          this.subscriptions.delete(subId);
        });
      }

      // Check if any other users are still subscribed to these tokens
      const stillActiveTokens = new Set<number>();
      for (const [_, sub] of this.subscriptions.entries()) {
        sub.instrumentTokens.forEach(token => stillActiveTokens.add(token));
      }

      // Unsubscribe from tokens that no other user is subscribed to
      const tokensToRemove = tokensToUnsubscribe.filter(
        token => !stillActiveTokens.has(token)
      );

      if (tokensToRemove.length > 0) {
        this.wsService.unsubscribe(tokensToRemove);
        tokensToRemove.forEach(token => this.activeTokens.delete(token));
      }

      this.emit('unsubscribed', { userId, instrumentTokens: tokensToUnsubscribe });
      
      logger.info(`Successfully unsubscribed user ${userId} from ${tokensToUnsubscribe.length} instruments`);
    } catch (error) {
      logger.error('Failed to unsubscribe from market data:', error);
      throw error;
    }
  }

  public async getQuotes(requests: QuoteRequest[]): Promise<{ [key: string]: ZerodhaQuote }> {
    try {
      if (!this.apiClient.hasValidToken()) {
        throw new Error('No valid access token');
      }

      const quotes: { [key: string]: ZerodhaQuote } = {};
      
      for (const request of requests) {
        const cacheKey = `${request.exchange}:${request.tradingsymbol}`;
        
        // Check cache first
        const cachedQuote = await this.redisService.getCachedQuote(
          request.exchange,
          request.tradingsymbol
        );
        
        if (cachedQuote) {
          quotes[cacheKey] = cachedQuote;
          continue;
        }

        // Get instrument token
        const instrument = this.instrumentService.getInstrumentBySymbol(
          request.exchange,
          request.tradingsymbol
        );

        if (!instrument) {
          logger.warn(`Instrument not found: ${request.exchange}:${request.tradingsymbol}`);
          continue;
        }

        // Fetch quote from API
        const response = await this.apiClient.get<{ [key: string]: ZerodhaQuote }>(
          `/quote?i=${request.exchange}:${request.tradingsymbol}`
        );

        if (response.status === 'success' && response.data) {
          const quoteKey = `${request.exchange}:${request.tradingsymbol}`;
          const quote = response.data[quoteKey];
          
          if (quote) {
            quotes[cacheKey] = quote;
            
            // Cache the quote
            await this.redisService.cacheQuote(
              request.exchange,
              request.tradingsymbol,
              quote
            );
          }
        }
      }

      return quotes;
    } catch (error) {
      logger.error('Failed to fetch quotes:', error);
      throw error;
    }
  }

  public getLatestTick(instrumentToken: number): ZerodhaMarketTick | null {
    return this.latestTicks.get(instrumentToken) || null;
  }

  public getActiveSubscriptions(): Map<string, MarketDataSubscription> {
    return new Map(this.subscriptions);
  }

  public getActiveTokens(): Set<number> {
    return new Set(this.activeTokens);
  }

  public isConnected(): boolean {
    return this.wsService?.isWebSocketConnected() || false;
  }

  public getStats(): {
    isInitialized: boolean;
    isConnected: boolean;
    activeSubscriptions: number;
    activeTokens: number;
    latestTicksCount: number;
  } {
    return {
      isInitialized: this.isInitialized,
      isConnected: this.isConnected(),
      activeSubscriptions: this.subscriptions.size,
      activeTokens: this.activeTokens.size,
      latestTicksCount: this.latestTicks.size,
    };
  }

  private setupWebSocketHandlers(): void {
    if (!this.wsService) return;

    this.wsService.on('connect', () => {
      logger.info('WebSocket connected');
      this.emit('connected');
    });

    this.wsService.on('disconnect', () => {
      logger.warn('WebSocket disconnected');
      this.emit('disconnected');
    });

    this.wsService.on('error', (error: Error) => {
      logger.error('WebSocket error:', error);
      this.emit('error', error);
    });

    this.wsService.on('tick', (tick: ZerodhaMarketTick) => {
      // Store latest tick
      this.latestTicks.set(tick.instrument_token, tick);
      
      // Emit tick event
      this.emit('tick', tick);
      
      // Broadcast to subscribers
      this.broadcastTick(tick);
    });

    this.wsService.on('ticks', (ticks: ZerodhaMarketTick[]) => {
      this.emit('ticks', ticks);
    });
  }

  private broadcastTick(tick: ZerodhaMarketTick): void {
    // Find all subscriptions that include this instrument token
    const relevantSubscriptions = Array.from(this.subscriptions.values())
      .filter(sub => sub.instrumentTokens.includes(tick.instrument_token));

    // Broadcast to each subscriber
    relevantSubscriptions.forEach(sub => {
      if (sub.callback) {
        try {
          sub.callback(tick);
        } catch (error) {
          logger.error(`Error in subscription callback for user ${sub.userId}:`, error);
        }
      }
    });

    // Emit user-specific events
    const userIds = new Set(relevantSubscriptions.map(sub => sub.userId));
    userIds.forEach(userId => {
      this.emit(`tick:${userId}`, tick);
    });
  }
}