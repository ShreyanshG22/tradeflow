import WebSocket from 'ws';
import { EventEmitter } from 'events';
import { ZerodhaMarketTick, ZerodhaWebSocketMessage, ZERODHA_CONSTANTS } from '@tradeflow/types';
import { createLogger } from '@tradeflow/zerodha-utils';

const logger = createLogger('WebSocketService');

export interface WebSocketConfig {
  apiKey: string;
  accessToken: string;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
  debug?: boolean;
}

export interface SubscriptionRequest {
  mode: 'ltp' | 'quote' | 'full';
  instrument_tokens: number[];
}

export class WebSocketService extends EventEmitter {
  private ws: WebSocket | null = null;
  private config: WebSocketConfig;
  private isConnected: boolean = false;
  private reconnectAttempts: number = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private subscriptions: Map<number, string> = new Map(); // token -> mode
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private lastHeartbeat: number = 0;

  constructor(config: WebSocketConfig) {
    super();
    this.config = {
      reconnectInterval: 5000,
      maxReconnectAttempts: 10,
      debug: false,
      ...config,
    };
  }

  public async connect(): Promise<void> {
    try {
      if (this.isConnected) {
        logger.warn('WebSocket already connected');
        return;
      }

      logger.info('Connecting to Zerodha WebSocket...');
      
      const wsUrl = `${ZERODHA_CONSTANTS.WEBSOCKET_URL}?api_key=${this.config.apiKey}&access_token=${this.config.accessToken}`;
      this.ws = new WebSocket(wsUrl);

      this.setupEventHandlers();
      
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('WebSocket connection timeout'));
        }, 10000);

        this.once('connect', () => {
          clearTimeout(timeout);
          resolve();
        });

        this.once('error', (error) => {
          clearTimeout(timeout);
          reject(error);
        });
      });
    } catch (error) {
      logger.error('Failed to connect WebSocket:', error);
      throw error;
    }
  }

  public disconnect(): void {
    logger.info('Disconnecting WebSocket...');
    
    this.clearReconnectTimer();
    this.clearHeartbeatInterval();
    
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    
    this.isConnected = false;
    this.reconnectAttempts = 0;
    this.emit('disconnect');
  }

  public subscribe(mode: 'ltp' | 'quote' | 'full', instrumentTokens: number[]): void {
    if (!this.isConnected) {
      logger.warn('WebSocket not connected, queuing subscription');
      // Queue subscription for when connected
      instrumentTokens.forEach(token => {
        this.subscriptions.set(token, mode);
      });
      return;
    }

    try {
      const message = {
        a: mode,
        v: instrumentTokens,
      };

      this.sendMessage(message);
      
      // Update subscriptions map
      instrumentTokens.forEach(token => {
        this.subscriptions.set(token, mode);
      });

      logger.info(`Subscribed to ${instrumentTokens.length} instruments in ${mode} mode`);
    } catch (error) {
      logger.error('Failed to subscribe:', error);
      throw error;
    }
  }

  public unsubscribe(instrumentTokens: number[]): void {
    if (!this.isConnected) {
      logger.warn('WebSocket not connected');
      return;
    }

    try {
      const message = {
        a: 'unsubscribe',
        v: instrumentTokens,
      };

      this.sendMessage(message);
      
      // Remove from subscriptions map
      instrumentTokens.forEach(token => {
        this.subscriptions.delete(token);
      });

      logger.info(`Unsubscribed from ${instrumentTokens.length} instruments`);
    } catch (error) {
      logger.error('Failed to unsubscribe:', error);
      throw error;
    }
  }

  public setMode(mode: 'ltp' | 'quote' | 'full', instrumentTokens: number[]): void {
    if (!this.isConnected) {
      logger.warn('WebSocket not connected');
      return;
    }

    try {
      const message = {
        a: 'mode',
        v: [mode, instrumentTokens],
      };

      this.sendMessage(message);
      
      // Update subscriptions map
      instrumentTokens.forEach(token => {
        this.subscriptions.set(token, mode);
      });

      logger.info(`Set mode ${mode} for ${instrumentTokens.length} instruments`);
    } catch (error) {
      logger.error('Failed to set mode:', error);
      throw error;
    }
  }

  public getSubscriptions(): Map<number, string> {
    return new Map(this.subscriptions);
  }

  public isWebSocketConnected(): boolean {
    return this.isConnected;
  }

  private setupEventHandlers(): void {
    if (!this.ws) return;

    this.ws.on('open', () => {
      logger.info('WebSocket connected successfully');
      this.isConnected = true;
      this.reconnectAttempts = 0;
      this.clearReconnectTimer();
      this.startHeartbeat();
      
      // Resubscribe to existing subscriptions
      this.resubscribe();
      
      this.emit('connect');
    });

    this.ws.on('message', (data: Buffer) => {
      try {
        this.lastHeartbeat = Date.now();
        
        if (this.config.debug) {
          logger.debug('Received WebSocket message:', data.length, 'bytes');
        }

        // Parse binary data from Kite Connect
        const ticks = this.parseBinaryMessage(data);
        
        if (ticks.length > 0) {
          this.emit('ticks', ticks);
          
          // Emit individual tick events
          ticks.forEach(tick => {
            this.emit('tick', tick);
          });
        }
      } catch (error) {
        logger.error('Error processing WebSocket message:', error);
        this.emit('error', error);
      }
    });

    this.ws.on('close', (code: number, reason: Buffer) => {
      logger.warn(`WebSocket closed: ${code} - ${reason.toString()}`);
      this.isConnected = false;
      this.clearHeartbeatInterval();
      
      this.emit('close', code, reason.toString());
      
      // Attempt reconnection if not manually closed
      if (code !== 1000) {
        this.attemptReconnect();
      }
    });

    this.ws.on('error', (error: Error) => {
      logger.error('WebSocket error:', error);
      this.emit('error', error);
    });
  }

  private sendMessage(message: any): void {
    if (!this.ws || !this.isConnected) {
      throw new Error('WebSocket not connected');
    }

    const jsonMessage = JSON.stringify(message);
    this.ws.send(jsonMessage);
    
    if (this.config.debug) {
      logger.debug('Sent WebSocket message:', jsonMessage);
    }
  }

  private parseBinaryMessage(data: Buffer): ZerodhaMarketTick[] {
    const ticks: ZerodhaMarketTick[] = [];
    let offset = 0;

    try {
      while (offset < data.length) {
        // Read packet length (2 bytes)
        if (offset + 2 > data.length) break;
        const packetLength = data.readUInt16BE(offset);
        offset += 2;

        if (offset + packetLength > data.length) break;

        // Read instrument token (4 bytes)
        const instrumentToken = data.readUInt32BE(offset);
        offset += 4;

        // Determine mode based on packet length
        let mode = 'ltp';
        if (packetLength >= 44) mode = 'full';
        else if (packetLength >= 32) mode = 'quote';

        const tick: ZerodhaMarketTick = {
          instrument_token: instrumentToken,
          mode: mode,
          tradable: true,
          last_price: 0,
          last_quantity: 0,
          last_trade_time: '',
          average_price: 0,
          volume: 0,
          buy_quantity: 0,
          sell_quantity: 0,
          ohlc: { open: 0, high: 0, low: 0, close: 0 },
          change: 0,
          timestamp: new Date().toISOString(),
        };

        // Parse based on mode
        if (mode === 'ltp') {
          tick.last_price = data.readUInt32BE(offset) / 100;
          offset += 4;
        } else if (mode === 'quote') {
          tick.last_price = data.readUInt32BE(offset) / 100;
          offset += 4;
          tick.last_quantity = data.readUInt32BE(offset);
          offset += 4;
          tick.average_price = data.readUInt32BE(offset) / 100;
          offset += 4;
          tick.volume = data.readUInt32BE(offset);
          offset += 4;
          tick.buy_quantity = data.readUInt32BE(offset);
          offset += 4;
          tick.sell_quantity = data.readUInt32BE(offset);
          offset += 4;
          tick.ohlc.open = data.readUInt32BE(offset) / 100;
          offset += 4;
          tick.ohlc.high = data.readUInt32BE(offset) / 100;
          offset += 4;
          tick.ohlc.low = data.readUInt32BE(offset) / 100;
          offset += 4;
          tick.ohlc.close = data.readUInt32BE(offset) / 100;
          offset += 4;
        } else if (mode === 'full') {
          // Full mode includes all quote data plus market depth
          tick.last_price = data.readUInt32BE(offset) / 100;
          offset += 4;
          tick.last_quantity = data.readUInt32BE(offset);
          offset += 4;
          tick.average_price = data.readUInt32BE(offset) / 100;
          offset += 4;
          tick.volume = data.readUInt32BE(offset);
          offset += 4;
          tick.buy_quantity = data.readUInt32BE(offset);
          offset += 4;
          tick.sell_quantity = data.readUInt32BE(offset);
          offset += 4;
          tick.ohlc.open = data.readUInt32BE(offset) / 100;
          offset += 4;
          tick.ohlc.high = data.readUInt32BE(offset) / 100;
          offset += 4;
          tick.ohlc.low = data.readUInt32BE(offset) / 100;
          offset += 4;
          tick.ohlc.close = data.readUInt32BE(offset) / 100;
          offset += 4;

          // Parse market depth (buy and sell orders)
          const depth = { buy: [], sell: [] };
          
          // Skip depth parsing for now - would require more complex binary parsing
          offset = offset + (packetLength - 44);
          
          tick.depth = depth;
        }

        // Calculate change percentage
        if (tick.ohlc.close > 0) {
          tick.change = ((tick.last_price - tick.ohlc.close) / tick.ohlc.close) * 100;
        }

        ticks.push(tick);
      }
    } catch (error) {
      logger.error('Error parsing binary message:', error);
    }

    return ticks;
  }

  private resubscribe(): void {
    if (this.subscriptions.size === 0) return;

    logger.info(`Resubscribing to ${this.subscriptions.size} instruments`);
    
    // Group subscriptions by mode
    const modeGroups: { [mode: string]: number[] } = {};
    
    for (const [token, mode] of this.subscriptions.entries()) {
      if (!modeGroups[mode]) {
        modeGroups[mode] = [];
      }
      modeGroups[mode].push(token);
    }

    // Resubscribe for each mode
    for (const [mode, tokens] of Object.entries(modeGroups)) {
      this.subscribe(mode as any, tokens);
    }
  }

  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.config.maxReconnectAttempts!) {
      logger.error('Max reconnection attempts reached');
      this.emit('maxReconnectAttemptsReached');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.config.reconnectInterval! * this.reconnectAttempts;
    
    logger.info(`Attempting reconnection ${this.reconnectAttempts}/${this.config.maxReconnectAttempts} in ${delay}ms`);
    
    this.reconnectTimer = setTimeout(() => {
      this.connect().catch(error => {
        logger.error('Reconnection failed:', error);
        this.attemptReconnect();
      });
    }, delay);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private startHeartbeat(): void {
    this.lastHeartbeat = Date.now();
    
    this.heartbeatInterval = setInterval(() => {
      const now = Date.now();
      const timeSinceLastHeartbeat = now - this.lastHeartbeat;
      
      // If no data received for 30 seconds, consider connection stale
      if (timeSinceLastHeartbeat > 30000) {
        logger.warn('WebSocket heartbeat timeout, reconnecting...');
        this.disconnect();
        this.attemptReconnect();
      }
    }, 10000); // Check every 10 seconds
  }

  private clearHeartbeatInterval(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }
}