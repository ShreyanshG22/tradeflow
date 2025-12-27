import { Server as SocketIOServer } from 'socket.io';
import { AuthenticatedSocket } from './socketHandler';
import { logger } from '../utils/logger';
import { ServiceProxy } from '../services/serviceProxy';
import WebSocket from 'ws';
import { EventEmitter } from 'events';

export interface ZerodhaMarketTick {
  instrument_token: number;
  exchange: string;
  tradingsymbol: string;
  last_price: number;
  volume: number;
  ohlc: {
    open: number;
    high: number;
    low: number;
    close: number;
  };
  change: number;
  change_percent: number;
  timestamp: Date;
}

export interface ZerodhaSubscription {
  userId: string;
  socketId: string;
  instruments: number[];
  mode: 'ltp' | 'quote' | 'full';
}

export class ZerodhaWebSocketHandler extends EventEmitter {
  private io: SocketIOServer;
  private zerodhaMarketServiceProxy: ServiceProxy;
  private subscriptions: Map<string, ZerodhaSubscription> = new Map(); // socketId -> subscription
  private instrumentSubscribers: Map<number, Set<string>> = new Map(); // instrument_token -> Set of socketIds
  private marketDataWS: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000; // Start with 1 second
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private isConnected = false;

  constructor(io: SocketIOServer) {
    super();
    this.io = io;
    this.zerodhaMarketServiceProxy = new ServiceProxy('zerodhaMarketService');
    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.io.on('connection', (socket: AuthenticatedSocket) => {
      this.handleZerodhaConnection(socket);
    });
  }

  private handleZerodhaConnection(socket: AuthenticatedSocket): void {
    // Zerodha market data subscription
    socket.on('zerodha:subscribe:market-data', (data) => {
      this.handleZerodhaMarketDataSubscription(socket, data);
    });

    socket.on('zerodha:unsubscribe:market-data', (data) => {
      this.handleZerodhaMarketDataUnsubscription(socket, data);
    });

    // Zerodha order updates subscription
    socket.on('zerodha:subscribe:orders', () => {
      this.handleZerodhaOrderSubscription(socket);
    });

    socket.on('zerodha:unsubscribe:orders', () => {
      this.handleZerodhaOrderUnsubscription(socket);
    });

    // Zerodha portfolio updates subscription
    socket.on('zerodha:subscribe:portfolio', () => {
      this.handleZerodhaPortfolioSubscription(socket);
    });

    socket.on('zerodha:unsubscribe:portfolio', () => {
      this.handleZerodhaPortfolioUnsubscription(socket);
    });

    // Handle disconnection cleanup
    socket.on('disconnect', () => {
      this.handleZerodhaDisconnection(socket);
    });
  }

  private async handleZerodhaMarketDataSubscription(
    socket: AuthenticatedSocket, 
    data: { instruments: number[]; mode?: 'ltp' | 'quote' | 'full' }
  ): Promise<void> {
    try {
      if (!data.instruments || !Array.isArray(data.instruments) || data.instruments.length === 0) {
        socket.emit('zerodha:error', { 
          message: 'Invalid instruments array',
          code: 'INVALID_INSTRUMENTS'
        });
        return;
      }

      if (data.instruments.length > 100) {
        socket.emit('zerodha:error', { 
          message: 'Maximum 100 instruments allowed per subscription',
          code: 'TOO_MANY_INSTRUMENTS'
        });
        return;
      }

      const mode = data.mode || 'quote';
      const userId = socket.userId!;

      // Store subscription
      const subscription: ZerodhaSubscription = {
        userId,
        socketId: socket.id,
        instruments: data.instruments,
        mode
      };

      this.subscriptions.set(socket.id, subscription);

      // Track instrument subscribers
      data.instruments.forEach(instrument => {
        if (!this.instrumentSubscribers.has(instrument)) {
          this.instrumentSubscribers.set(instrument, new Set());
        }
        this.instrumentSubscribers.get(instrument)!.add(socket.id);
      });

      // Subscribe to market data service
      try {
        const authHeader = `Bearer ${socket.handshake.auth.token}`;
        await this.zerodhaMarketServiceProxy.post('/subscribe', {
          instruments: data.instruments,
          mode
        }, {
          headers: { Authorization: authHeader }
        });

        // Ensure WebSocket connection to market data service
        await this.ensureMarketDataConnection();

        socket.emit('zerodha:subscription:confirmed', {
          type: 'market-data',
          instruments: data.instruments,
          mode,
          timestamp: new Date().toISOString()
        });

        logger.info('Zerodha market data subscription added', {
          socketId: socket.id,
          userId,
          instruments: data.instruments,
          mode
        });

      } catch (error) {
        // Clean up on error
        this.subscriptions.delete(socket.id);
        data.instruments.forEach(instrument => {
          const subscribers = this.instrumentSubscribers.get(instrument);
          if (subscribers) {
            subscribers.delete(socket.id);
            if (subscribers.size === 0) {
              this.instrumentSubscribers.delete(instrument);
            }
          }
        });

        socket.emit('zerodha:error', {
          message: 'Failed to subscribe to market data',
          code: 'SUBSCRIPTION_FAILED',
          details: error instanceof Error ? error.message : 'Unknown error'
        });

        logger.error('Zerodha market data subscription failed', {
          socketId: socket.id,
          userId,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }

    } catch (error) {
      socket.emit('zerodha:error', {
        message: 'Subscription processing failed',
        code: 'PROCESSING_ERROR'
      });

      logger.error('Zerodha subscription processing error', {
        socketId: socket.id,
        userId: socket.userId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  private async handleZerodhaMarketDataUnsubscription(
    socket: AuthenticatedSocket,
    data: { instruments: number[] }
  ): Promise<void> {
    try {
      const subscription = this.subscriptions.get(socket.id);
      if (!subscription) {
        socket.emit('zerodha:error', {
          message: 'No active subscription found',
          code: 'NO_SUBSCRIPTION'
        });
        return;
      }

      const instrumentsToUnsubscribe = data.instruments || subscription.instruments;

      // Remove from instrument subscribers
      instrumentsToUnsubscribe.forEach(instrument => {
        const subscribers = this.instrumentSubscribers.get(instrument);
        if (subscribers) {
          subscribers.delete(socket.id);
          if (subscribers.size === 0) {
            this.instrumentSubscribers.delete(instrument);
          }
        }
      });

      // Update or remove subscription
      if (data.instruments && data.instruments.length < subscription.instruments.length) {
        // Partial unsubscription
        subscription.instruments = subscription.instruments.filter(
          inst => !data.instruments.includes(inst)
        );
      } else {
        // Full unsubscription
        this.subscriptions.delete(socket.id);
      }

      // Unsubscribe from market data service
      try {
        const authHeader = `Bearer ${socket.handshake.auth.token}`;
        await this.zerodhaMarketServiceProxy.delete('/unsubscribe', {
          data: { instruments: instrumentsToUnsubscribe },
          headers: { Authorization: authHeader }
        });

        socket.emit('zerodha:unsubscription:confirmed', {
          type: 'market-data',
          instruments: instrumentsToUnsubscribe,
          timestamp: new Date().toISOString()
        });

        logger.info('Zerodha market data unsubscription processed', {
          socketId: socket.id,
          userId: socket.userId,
          instruments: instrumentsToUnsubscribe
        });

      } catch (error) {
        logger.error('Zerodha market data unsubscription failed', {
          socketId: socket.id,
          userId: socket.userId,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }

    } catch (error) {
      logger.error('Zerodha unsubscription processing error', {
        socketId: socket.id,
        userId: socket.userId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  private handleZerodhaOrderSubscription(socket: AuthenticatedSocket): void {
    socket.join(`zerodha:orders:${socket.userId}`);
    
    socket.emit('zerodha:subscription:confirmed', {
      type: 'orders',
      timestamp: new Date().toISOString()
    });

    logger.debug('Zerodha order subscription added', {
      socketId: socket.id,
      userId: socket.userId
    });
  }

  private handleZerodhaOrderUnsubscription(socket: AuthenticatedSocket): void {
    socket.leave(`zerodha:orders:${socket.userId}`);
    
    socket.emit('zerodha:unsubscription:confirmed', {
      type: 'orders',
      timestamp: new Date().toISOString()
    });

    logger.debug('Zerodha order unsubscription processed', {
      socketId: socket.id,
      userId: socket.userId
    });
  }

  private handleZerodhaPortfolioSubscription(socket: AuthenticatedSocket): void {
    socket.join(`zerodha:portfolio:${socket.userId}`);
    
    socket.emit('zerodha:subscription:confirmed', {
      type: 'portfolio',
      timestamp: new Date().toISOString()
    });

    logger.debug('Zerodha portfolio subscription added', {
      socketId: socket.id,
      userId: socket.userId
    });
  }

  private handleZerodhaPortfolioUnsubscription(socket: AuthenticatedSocket): void {
    socket.leave(`zerodha:portfolio:${socket.userId}`);
    
    socket.emit('zerodha:unsubscription:confirmed', {
      type: 'portfolio',
      timestamp: new Date().toISOString()
    });

    logger.debug('Zerodha portfolio unsubscription processed', {
      socketId: socket.id,
      userId: socket.userId
    });
  }

  private handleZerodhaDisconnection(socket: AuthenticatedSocket): void {
    const subscription = this.subscriptions.get(socket.id);
    if (subscription) {
      // Clean up instrument subscribers
      subscription.instruments.forEach(instrument => {
        const subscribers = this.instrumentSubscribers.get(instrument);
        if (subscribers) {
          subscribers.delete(socket.id);
          if (subscribers.size === 0) {
            this.instrumentSubscribers.delete(instrument);
          }
        }
      });

      // Remove subscription
      this.subscriptions.delete(socket.id);

      logger.debug('Zerodha subscription cleaned up on disconnect', {
        socketId: socket.id,
        userId: socket.userId,
        instruments: subscription.instruments
      });
    }
  }

  private async ensureMarketDataConnection(): Promise<void> {
    if (this.isConnected && this.marketDataWS?.readyState === WebSocket.OPEN) {
      return;
    }

    return new Promise((resolve, reject) => {
      try {
        // Get WebSocket URL from market data service
        this.connectToMarketDataService()
          .then(() => resolve())
          .catch(reject);
      } catch (error) {
        reject(error);
      }
    });
  }

  private async connectToMarketDataService(): Promise<void> {
    try {
      // Get WebSocket endpoint from market data service
      const response = await this.zerodhaMarketServiceProxy.get('/websocket-url');
      const wsUrl = response.data.url;

      this.marketDataWS = new WebSocket(wsUrl);

      this.marketDataWS.on('open', () => {
        this.isConnected = true;
        this.reconnectAttempts = 0;
        this.reconnectDelay = 1000;
        
        logger.info('Connected to Zerodha market data WebSocket');
        
        // Start heartbeat
        this.startHeartbeat();
        
        this.emit('connected');
      });

      this.marketDataWS.on('message', (data: WebSocket.Data) => {
        try {
          const tick: ZerodhaMarketTick = JSON.parse(data.toString());
          this.broadcastMarketTick(tick);
        } catch (error) {
          logger.error('Failed to parse market data tick', {
            error: error instanceof Error ? error.message : 'Unknown error',
            data: data.toString()
          });
        }
      });

      this.marketDataWS.on('close', (code: number, reason: string) => {
        this.isConnected = false;
        this.stopHeartbeat();
        
        logger.warn('Zerodha market data WebSocket closed', { code, reason });
        
        // Attempt reconnection
        this.scheduleReconnection();
      });

      this.marketDataWS.on('error', (error: Error) => {
        logger.error('Zerodha market data WebSocket error', {
          error: error.message
        });
        
        this.isConnected = false;
        this.stopHeartbeat();
      });

    } catch (error) {
      logger.error('Failed to connect to Zerodha market data service', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  private broadcastMarketTick(tick: ZerodhaMarketTick): void {
    const subscribers = this.instrumentSubscribers.get(tick.instrument_token);
    if (!subscribers || subscribers.size === 0) {
      return;
    }

    subscribers.forEach(socketId => {
      const subscription = this.subscriptions.get(socketId);
      if (subscription) {
        // Filter data based on subscription mode
        let filteredTick: any = tick;
        
        if (subscription.mode === 'ltp') {
          filteredTick = {
            instrument_token: tick.instrument_token,
            last_price: tick.last_price,
            timestamp: tick.timestamp
          };
        } else if (subscription.mode === 'quote') {
          filteredTick = {
            instrument_token: tick.instrument_token,
            last_price: tick.last_price,
            volume: tick.volume,
            ohlc: tick.ohlc,
            change: tick.change,
            change_percent: tick.change_percent,
            timestamp: tick.timestamp
          };
        }
        // 'full' mode sends complete tick data

        this.io.to(socketId).emit('zerodha:market-tick', filteredTick);
      }
    });
  }

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      if (this.marketDataWS?.readyState === WebSocket.OPEN) {
        this.marketDataWS.ping();
      }
    }, 30000); // 30 seconds
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  private scheduleReconnection(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      logger.error('Max reconnection attempts reached for Zerodha market data');
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1), 30000);

    logger.info(`Scheduling Zerodha market data reconnection in ${delay}ms (attempt ${this.reconnectAttempts})`);

    setTimeout(() => {
      this.connectToMarketDataService().catch(error => {
        logger.error('Zerodha market data reconnection failed', {
          error: error instanceof Error ? error.message : 'Unknown error',
          attempt: this.reconnectAttempts
        });
      });
    }, delay);
  }

  // Public methods for broadcasting updates from other services
  public broadcastOrderUpdate(userId: string, orderUpdate: any): void {
    this.io.to(`zerodha:orders:${userId}`).emit('zerodha:order-update', orderUpdate);
  }

  public broadcastPortfolioUpdate(userId: string, portfolioUpdate: any): void {
    this.io.to(`zerodha:portfolio:${userId}`).emit('zerodha:portfolio-update', portfolioUpdate);
  }

  public broadcastRiskAlert(userId: string, riskAlert: any): void {
    this.io.to(`zerodha:orders:${userId}`).emit('zerodha:risk-alert', riskAlert);
  }

  public getActiveSubscriptions(): Map<string, ZerodhaSubscription> {
    return new Map(this.subscriptions);
  }

  public getInstrumentSubscriberCount(instrumentToken: number): number {
    return this.instrumentSubscribers.get(instrumentToken)?.size || 0;
  }

  public disconnect(): void {
    this.stopHeartbeat();
    if (this.marketDataWS) {
      this.marketDataWS.close();
      this.marketDataWS = null;
    }
    this.isConnected = false;
  }
}