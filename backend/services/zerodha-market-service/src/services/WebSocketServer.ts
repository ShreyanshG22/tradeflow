import { Server as HTTPServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { ZerodhaMarketTick } from '@tradeflow/types';
import { createLogger } from '@tradeflow/zerodha-utils';
import { MarketDataService } from './MarketDataService';

const logger = createLogger('WebSocketServer');

export interface ClientConnection {
  id: string;
  userId?: string;
  ws: WebSocket;
  subscriptions: Set<number>;
  lastPing: number;
}

export interface WebSocketMessage {
  type: 'subscribe' | 'unsubscribe' | 'ping' | 'pong' | 'error' | 'tick' | 'ticks';
  data?: any;
  error?: string;
  timestamp?: string;
}

export class MarketDataWebSocketServer {
  private wss: WebSocketServer;
  private clients: Map<string, ClientConnection> = new Map();
  private marketDataService: MarketDataService;
  private pingInterval: NodeJS.Timeout | null = null;

  constructor(server: HTTPServer, marketDataService: MarketDataService) {
    this.marketDataService = marketDataService;
    
    this.wss = new WebSocketServer({
      server,
      path: '/ws/market-data',
      clientTracking: true,
    });

    this.setupWebSocketServer();
    this.setupMarketDataHandlers();
    this.startPingInterval();
  }

  private setupWebSocketServer(): void {
    this.wss.on('connection', (ws: WebSocket, request) => {
      const clientId = this.generateClientId();
      const client: ClientConnection = {
        id: clientId,
        ws,
        subscriptions: new Set(),
        lastPing: Date.now(),
      };

      this.clients.set(clientId, client);
      logger.info(`Client connected: ${clientId} (Total: ${this.clients.size})`);

      // Send welcome message
      this.sendMessage(client, {
        type: 'ping',
        data: { clientId, message: 'Connected to market data stream' },
        timestamp: new Date().toISOString(),
      });

      // Setup client event handlers
      ws.on('message', (data: Buffer) => {
        this.handleClientMessage(client, data);
      });

      ws.on('close', (code: number, reason: Buffer) => {
        this.handleClientDisconnect(client, code, reason.toString());
      });

      ws.on('error', (error: Error) => {
        logger.error(`Client ${clientId} error:`, error);
        this.handleClientError(client, error);
      });

      ws.on('pong', () => {
        client.lastPing = Date.now();
      });
    });

    this.wss.on('error', (error: Error) => {
      logger.error('WebSocket server error:', error);
    });
  }

  private setupMarketDataHandlers(): void {
    // Listen for ticks from market data service
    this.marketDataService.on('tick', (tick: ZerodhaMarketTick) => {
      this.broadcastTick(tick);
    });

    this.marketDataService.on('ticks', (ticks: ZerodhaMarketTick[]) => {
      this.broadcastTicks(ticks);
    });

    this.marketDataService.on('connected', () => {
      this.broadcastMessage({
        type: 'ping',
        data: { status: 'market_data_connected' },
        timestamp: new Date().toISOString(),
      });
    });

    this.marketDataService.on('disconnected', () => {
      this.broadcastMessage({
        type: 'error',
        error: 'Market data connection lost',
        timestamp: new Date().toISOString(),
      });
    });
  }

  private handleClientMessage(client: ClientConnection, data: Buffer): void {
    try {
      const message: WebSocketMessage = JSON.parse(data.toString());
      
      switch (message.type) {
        case 'subscribe':
          this.handleSubscribe(client, message);
          break;
        case 'unsubscribe':
          this.handleUnsubscribe(client, message);
          break;
        case 'ping':
          this.handlePing(client, message);
          break;
        default:
          this.sendError(client, `Unknown message type: ${message.type}`);
      }
    } catch (error) {
      logger.error(`Error parsing client message from ${client.id}:`, error);
      this.sendError(client, 'Invalid message format');
    }
  }

  private async handleSubscribe(client: ClientConnection, message: WebSocketMessage): Promise<void> {
    try {
      const { user_id, instrument_tokens, mode = 'ltp' } = message.data || {};

      if (!user_id) {
        this.sendError(client, 'user_id is required for subscription');
        return;
      }

      if (!instrument_tokens || !Array.isArray(instrument_tokens)) {
        this.sendError(client, 'instrument_tokens array is required');
        return;
      }

      // Update client info
      client.userId = user_id;

      // Convert to numbers
      const tokens = instrument_tokens.map(token => parseInt(token)).filter(token => !isNaN(token));
      
      if (tokens.length === 0) {
        this.sendError(client, 'No valid instrument tokens provided');
        return;
      }

      // Subscribe via market data service
      await this.marketDataService.subscribe(user_id, tokens, mode);

      // Update client subscriptions
      tokens.forEach(token => client.subscriptions.add(token));

      // Send confirmation
      this.sendMessage(client, {
        type: 'subscribe',
        data: {
          message: `Subscribed to ${tokens.length} instruments`,
          instrument_tokens: tokens,
          mode,
        },
        timestamp: new Date().toISOString(),
      });

      logger.info(`Client ${client.id} subscribed to ${tokens.length} instruments`);
    } catch (error) {
      logger.error(`Error handling subscribe for client ${client.id}:`, error);
      this.sendError(client, error instanceof Error ? error.message : 'Subscription failed');
    }
  }

  private async handleUnsubscribe(client: ClientConnection, message: WebSocketMessage): Promise<void> {
    try {
      const { user_id, instrument_tokens } = message.data || {};

      if (!user_id) {
        this.sendError(client, 'user_id is required for unsubscription');
        return;
      }

      let tokens: number[] | undefined;
      if (instrument_tokens) {
        tokens = instrument_tokens.map(token => parseInt(token)).filter(token => !isNaN(token));
      }

      // Unsubscribe via market data service
      await this.marketDataService.unsubscribe(user_id, tokens);

      // Update client subscriptions
      if (tokens) {
        tokens.forEach(token => client.subscriptions.delete(token));
      } else {
        client.subscriptions.clear();
      }

      // Send confirmation
      this.sendMessage(client, {
        type: 'unsubscribe',
        data: {
          message: tokens 
            ? `Unsubscribed from ${tokens.length} instruments`
            : 'Unsubscribed from all instruments',
          instrument_tokens: tokens,
        },
        timestamp: new Date().toISOString(),
      });

      logger.info(`Client ${client.id} unsubscribed from ${tokens?.length || 'all'} instruments`);
    } catch (error) {
      logger.error(`Error handling unsubscribe for client ${client.id}:`, error);
      this.sendError(client, error instanceof Error ? error.message : 'Unsubscription failed');
    }
  }

  private handlePing(client: ClientConnection, message: WebSocketMessage): void {
    client.lastPing = Date.now();
    this.sendMessage(client, {
      type: 'pong',
      data: message.data,
      timestamp: new Date().toISOString(),
    });
  }

  private handleClientDisconnect(client: ClientConnection, code: number, reason: string): void {
    logger.info(`Client ${client.id} disconnected: ${code} - ${reason}`);
    
    // Unsubscribe from all market data if user was subscribed
    if (client.userId && client.subscriptions.size > 0) {
      this.marketDataService.unsubscribe(client.userId).catch(error => {
        logger.error(`Error unsubscribing client ${client.id} on disconnect:`, error);
      });
    }

    this.clients.delete(client.id);
    logger.info(`Client removed. Total clients: ${this.clients.size}`);
  }

  private handleClientError(client: ClientConnection, error: Error): void {
    logger.error(`Client ${client.id} error:`, error);
    this.sendError(client, 'Connection error occurred');
  }

  private broadcastTick(tick: ZerodhaMarketTick): void {
    const message: WebSocketMessage = {
      type: 'tick',
      data: tick,
      timestamp: new Date().toISOString(),
    };

    // Send to clients subscribed to this instrument
    for (const client of this.clients.values()) {
      if (client.subscriptions.has(tick.instrument_token)) {
        this.sendMessage(client, message);
      }
    }
  }

  private broadcastTicks(ticks: ZerodhaMarketTick[]): void {
    const message: WebSocketMessage = {
      type: 'ticks',
      data: ticks,
      timestamp: new Date().toISOString(),
    };

    // Group ticks by subscribed clients
    const clientTicks: Map<string, ZerodhaMarketTick[]> = new Map();

    for (const tick of ticks) {
      for (const client of this.clients.values()) {
        if (client.subscriptions.has(tick.instrument_token)) {
          if (!clientTicks.has(client.id)) {
            clientTicks.set(client.id, []);
          }
          clientTicks.get(client.id)!.push(tick);
        }
      }
    }

    // Send relevant ticks to each client
    for (const [clientId, relevantTicks] of clientTicks.entries()) {
      const client = this.clients.get(clientId);
      if (client && relevantTicks.length > 0) {
        this.sendMessage(client, {
          type: 'ticks',
          data: relevantTicks,
          timestamp: new Date().toISOString(),
        });
      }
    }
  }

  private broadcastMessage(message: WebSocketMessage): void {
    for (const client of this.clients.values()) {
      this.sendMessage(client, message);
    }
  }

  private sendMessage(client: ClientConnection, message: WebSocketMessage): void {
    if (client.ws.readyState === WebSocket.OPEN) {
      try {
        client.ws.send(JSON.stringify(message));
      } catch (error) {
        logger.error(`Error sending message to client ${client.id}:`, error);
      }
    }
  }

  private sendError(client: ClientConnection, error: string): void {
    this.sendMessage(client, {
      type: 'error',
      error,
      timestamp: new Date().toISOString(),
    });
  }

  private startPingInterval(): void {
    this.pingInterval = setInterval(() => {
      const now = Date.now();
      const timeout = 30000; // 30 seconds

      for (const [clientId, client] of this.clients.entries()) {
        if (now - client.lastPing > timeout) {
          logger.warn(`Client ${clientId} ping timeout, closing connection`);
          client.ws.terminate();
          this.clients.delete(clientId);
        } else if (client.ws.readyState === WebSocket.OPEN) {
          // Send ping
          client.ws.ping();
        }
      }
    }, 15000); // Check every 15 seconds
  }

  private generateClientId(): string {
    return `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  public getStats(): {
    totalClients: number;
    connectedClients: number;
    totalSubscriptions: number;
  } {
    let connectedClients = 0;
    let totalSubscriptions = 0;

    for (const client of this.clients.values()) {
      if (client.ws.readyState === WebSocket.OPEN) {
        connectedClients++;
      }
      totalSubscriptions += client.subscriptions.size;
    }

    return {
      totalClients: this.clients.size,
      connectedClients,
      totalSubscriptions,
    };
  }

  public shutdown(): void {
    logger.info('Shutting down WebSocket server...');
    
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }

    // Close all client connections
    for (const client of this.clients.values()) {
      client.ws.close(1001, 'Server shutting down');
    }

    this.clients.clear();
    this.wss.close();
    
    logger.info('WebSocket server shut down');
  }
}