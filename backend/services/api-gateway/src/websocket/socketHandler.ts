import { Server as SocketIOServer, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { config } from '../config/config';
import { logger } from '../utils/logger';
import { SubscriptionManager } from './subscriptionManager';
import { MarketDataManager } from './marketDataManager';
import { PortfolioUpdateManager } from './portfolioUpdateManager';
import { ZerodhaWebSocketHandler } from './zerodhaWebSocketHandler';

export interface AuthenticatedSocket extends Socket {
  userId?: string;
  email?: string;
  role?: string;
}

export interface JwtPayload {
  userId: string;
  email: string;
  role?: string;
  iat?: number;
  exp?: number;
}

export class WebSocketHandler {
  private io: SocketIOServer;
  private subscriptionManager: SubscriptionManager;
  private marketDataManager: MarketDataManager;
  private portfolioUpdateManager: PortfolioUpdateManager;
  private zerodhaWebSocketHandler: ZerodhaWebSocketHandler;
  private connectedUsers: Map<string, Set<string>> = new Map(); // userId -> Set of socketIds

  constructor(io: SocketIOServer) {
    this.io = io;
    this.subscriptionManager = new SubscriptionManager();
    this.marketDataManager = new MarketDataManager(io, this.subscriptionManager);
    this.portfolioUpdateManager = new PortfolioUpdateManager(io, this.subscriptionManager);
    this.zerodhaWebSocketHandler = new ZerodhaWebSocketHandler(io);
    
    this.setupMiddleware();
    this.setupEventHandlers();
  }

  private setupMiddleware(): void {
    // Authentication middleware
    this.io.use(async (socket: AuthenticatedSocket, next) => {
      try {
        const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '');
        
        if (!token) {
          logger.warn('WebSocket connection attempt without token', {
            socketId: socket.id,
            ip: socket.handshake.address
          });
          return next(new Error('Authentication token required'));
        }

        const decoded = jwt.verify(token, config.jwt.secret) as JwtPayload;
        
        socket.userId = decoded.userId;
        socket.email = decoded.email;
        socket.role = decoded.role;

        logger.info('WebSocket user authenticated', {
          socketId: socket.id,
          userId: decoded.userId,
          email: decoded.email
        });

        next();
      } catch (error) {
        logger.warn('WebSocket authentication failed', {
          socketId: socket.id,
          error: error instanceof Error ? error.message : 'Unknown error',
          ip: socket.handshake.address
        });
        next(new Error('Authentication failed'));
      }
    });

    // Rate limiting middleware
    this.io.use((socket, next) => {
      const rateLimiter = new Map<string, { count: number; resetTime: number }>();
      const maxRequests = 100; // per minute
      const windowMs = 60000; // 1 minute

      const now = Date.now();
      const userLimit = rateLimiter.get(socket.id) || { count: 0, resetTime: now + windowMs };

      if (now > userLimit.resetTime) {
        userLimit.count = 0;
        userLimit.resetTime = now + windowMs;
      }

      if (userLimit.count >= maxRequests) {
        logger.warn('WebSocket rate limit exceeded', {
          socketId: socket.id,
          userId: (socket as AuthenticatedSocket).userId
        });
        return next(new Error('Rate limit exceeded'));
      }

      userLimit.count++;
      rateLimiter.set(socket.id, userLimit);
      next();
    });
  }

  private setupEventHandlers(): void {
    this.io.on('connection', (socket: AuthenticatedSocket) => {
      this.handleConnection(socket);
    });
  }

  private handleConnection(socket: AuthenticatedSocket): void {
    const userId = socket.userId!;
    
    // Track connected users
    if (!this.connectedUsers.has(userId)) {
      this.connectedUsers.set(userId, new Set());
    }
    this.connectedUsers.get(userId)!.add(socket.id);

    logger.info('WebSocket client connected', {
      socketId: socket.id,
      userId,
      email: socket.email,
      totalConnections: this.io.engine.clientsCount
    });

    // Send welcome message
    socket.emit('connected', {
      message: 'Connected to TradeFlow WebSocket server',
      timestamp: new Date().toISOString(),
      userId
    });

    // Market data subscription handlers
    socket.on('subscribe:market-data', (data) => {
      this.handleMarketDataSubscription(socket, data);
    });

    socket.on('unsubscribe:market-data', (data) => {
      this.handleMarketDataUnsubscription(socket, data);
    });

    // Portfolio update subscription handlers
    socket.on('subscribe:portfolio', () => {
      this.handlePortfolioSubscription(socket);
    });

    socket.on('unsubscribe:portfolio', () => {
      this.handlePortfolioUnsubscription(socket);
    });

    // Strategy execution subscription handlers
    socket.on('subscribe:strategy', (data) => {
      this.handleStrategySubscription(socket, data);
    });

    socket.on('unsubscribe:strategy', (data) => {
      this.handleStrategyUnsubscription(socket, data);
    });

    // Backtest progress subscription handlers
    socket.on('subscribe:backtest', (data) => {
      this.handleBacktestSubscription(socket, data);
    });

    socket.on('unsubscribe:backtest', (data) => {
      this.handleBacktestUnsubscription(socket, data);
    });

    // System notifications subscription
    socket.on('subscribe:notifications', () => {
      this.handleNotificationSubscription(socket);
    });

    socket.on('unsubscribe:notifications', () => {
      this.handleNotificationUnsubscription(socket);
    });

    // Ping/Pong for connection health
    socket.on('ping', () => {
      socket.emit('pong', { timestamp: new Date().toISOString() });
    });

    // Handle disconnection
    socket.on('disconnect', (reason) => {
      this.handleDisconnection(socket, reason);
    });

    // Error handling
    socket.on('error', (error) => {
      logger.error('WebSocket error', {
        socketId: socket.id,
        userId,
        error: error.message
      });
    });
  }

  private handleMarketDataSubscription(socket: AuthenticatedSocket, data: { symbols: string[] }): void {
    try {
      if (!data.symbols || !Array.isArray(data.symbols)) {
        socket.emit('error', { message: 'Invalid symbols array' });
        return;
      }

      data.symbols.forEach(symbol => {
        this.subscriptionManager.subscribe(socket.userId!, 'market-data', symbol, socket.id);
      });

      this.marketDataManager.addSubscriptions(data.symbols);

      socket.emit('subscription:confirmed', {
        type: 'market-data',
        symbols: data.symbols,
        timestamp: new Date().toISOString()
      });

      logger.debug('Market data subscription added', {
        socketId: socket.id,
        userId: socket.userId,
        symbols: data.symbols
      });
    } catch (error) {
      logger.error('Market data subscription error', {
        socketId: socket.id,
        userId: socket.userId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      socket.emit('error', { message: 'Subscription failed' });
    }
  }

  private handleMarketDataUnsubscription(socket: AuthenticatedSocket, data: { symbols: string[] }): void {
    try {
      data.symbols.forEach(symbol => {
        this.subscriptionManager.unsubscribe(socket.userId!, 'market-data', symbol, socket.id);
      });

      socket.emit('unsubscription:confirmed', {
        type: 'market-data',
        symbols: data.symbols,
        timestamp: new Date().toISOString()
      });

      logger.debug('Market data unsubscription processed', {
        socketId: socket.id,
        userId: socket.userId,
        symbols: data.symbols
      });
    } catch (error) {
      logger.error('Market data unsubscription error', {
        socketId: socket.id,
        userId: socket.userId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  private handlePortfolioSubscription(socket: AuthenticatedSocket): void {
    this.subscriptionManager.subscribe(socket.userId!, 'portfolio', socket.userId!, socket.id);
    this.portfolioUpdateManager.addSubscription(socket.userId!);

    socket.emit('subscription:confirmed', {
      type: 'portfolio',
      timestamp: new Date().toISOString()
    });

    logger.debug('Portfolio subscription added', {
      socketId: socket.id,
      userId: socket.userId
    });
  }

  private handlePortfolioUnsubscription(socket: AuthenticatedSocket): void {
    this.subscriptionManager.unsubscribe(socket.userId!, 'portfolio', socket.userId!, socket.id);

    socket.emit('unsubscription:confirmed', {
      type: 'portfolio',
      timestamp: new Date().toISOString()
    });

    logger.debug('Portfolio unsubscription processed', {
      socketId: socket.id,
      userId: socket.userId
    });
  }

  private handleStrategySubscription(socket: AuthenticatedSocket, data: { strategyId: string }): void {
    if (!data.strategyId) {
      socket.emit('error', { message: 'Strategy ID is required' });
      return;
    }

    this.subscriptionManager.subscribe(socket.userId!, 'strategy', data.strategyId, socket.id);

    socket.emit('subscription:confirmed', {
      type: 'strategy',
      strategyId: data.strategyId,
      timestamp: new Date().toISOString()
    });

    logger.debug('Strategy subscription added', {
      socketId: socket.id,
      userId: socket.userId,
      strategyId: data.strategyId
    });
  }

  private handleStrategyUnsubscription(socket: AuthenticatedSocket, data: { strategyId: string }): void {
    this.subscriptionManager.unsubscribe(socket.userId!, 'strategy', data.strategyId, socket.id);

    socket.emit('unsubscription:confirmed', {
      type: 'strategy',
      strategyId: data.strategyId,
      timestamp: new Date().toISOString()
    });
  }

  private handleBacktestSubscription(socket: AuthenticatedSocket, data: { backtestId: string }): void {
    if (!data.backtestId) {
      socket.emit('error', { message: 'Backtest ID is required' });
      return;
    }

    this.subscriptionManager.subscribe(socket.userId!, 'backtest', data.backtestId, socket.id);

    socket.emit('subscription:confirmed', {
      type: 'backtest',
      backtestId: data.backtestId,
      timestamp: new Date().toISOString()
    });

    logger.debug('Backtest subscription added', {
      socketId: socket.id,
      userId: socket.userId,
      backtestId: data.backtestId
    });
  }

  private handleBacktestUnsubscription(socket: AuthenticatedSocket, data: { backtestId: string }): void {
    this.subscriptionManager.unsubscribe(socket.userId!, 'backtest', data.backtestId, socket.id);

    socket.emit('unsubscription:confirmed', {
      type: 'backtest',
      backtestId: data.backtestId,
      timestamp: new Date().toISOString()
    });
  }

  private handleNotificationSubscription(socket: AuthenticatedSocket): void {
    this.subscriptionManager.subscribe(socket.userId!, 'notifications', socket.userId!, socket.id);

    socket.emit('subscription:confirmed', {
      type: 'notifications',
      timestamp: new Date().toISOString()
    });

    logger.debug('Notifications subscription added', {
      socketId: socket.id,
      userId: socket.userId
    });
  }

  private handleNotificationUnsubscription(socket: AuthenticatedSocket): void {
    this.subscriptionManager.unsubscribe(socket.userId!, 'notifications', socket.userId!, socket.id);

    socket.emit('unsubscription:confirmed', {
      type: 'notifications',
      timestamp: new Date().toISOString()
    });
  }

  private handleDisconnection(socket: AuthenticatedSocket, reason: string): void {
    const userId = socket.userId!;
    
    // Remove from connected users
    const userSockets = this.connectedUsers.get(userId);
    if (userSockets) {
      userSockets.delete(socket.id);
      if (userSockets.size === 0) {
        this.connectedUsers.delete(userId);
      }
    }

    // Clean up all subscriptions for this socket
    this.subscriptionManager.cleanupSocket(socket.id);

    logger.info('WebSocket client disconnected', {
      socketId: socket.id,
      userId,
      reason,
      totalConnections: this.io.engine.clientsCount
    });
  }

  public getConnectedUsers(): string[] {
    return Array.from(this.connectedUsers.keys());
  }

  public getUserSocketCount(userId: string): number {
    return this.connectedUsers.get(userId)?.size || 0;
  }

  public broadcastToUser(userId: string, event: string, data: any): void {
    const userSockets = this.connectedUsers.get(userId);
    if (userSockets) {
      userSockets.forEach(socketId => {
        this.io.to(socketId).emit(event, data);
      });
    }
  }

  public broadcastToAll(event: string, data: any): void {
    this.io.emit(event, data);
  }

  public getZerodhaWebSocketHandler(): ZerodhaWebSocketHandler {
    return this.zerodhaWebSocketHandler;
  }
}

export function setupWebSocket(io: SocketIOServer): WebSocketHandler {
  return new WebSocketHandler(io);
}