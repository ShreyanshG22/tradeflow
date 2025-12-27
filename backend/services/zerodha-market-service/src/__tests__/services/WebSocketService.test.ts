import { WebSocketService } from '../../services/WebSocketService';
import { ZerodhaMarketTick } from '@tradeflow/types';
import WebSocket from 'ws';

// Mock WebSocket
jest.mock('ws');
const MockedWebSocket = WebSocket as jest.MockedClass<typeof WebSocket>;

describe('WebSocketService', () => {
  let wsService: WebSocketService;
  let mockWs: jest.Mocked<WebSocket>;

  const mockConfig = {
    apiKey: 'test_api_key',
    accessToken: 'test_access_token',
    reconnectInterval: 1000,
    maxReconnectAttempts: 3,
    debug: false,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockWs = {
      on: jest.fn(),
      send: jest.fn(),
      close: jest.fn(),
      terminate: jest.fn(),
      ping: jest.fn(),
      readyState: WebSocket.OPEN,
    } as any;

    MockedWebSocket.mockImplementation(() => mockWs);
    
    wsService = new WebSocketService(mockConfig);
  });

  describe('connect', () => {
    it('should connect successfully', async () => {
      const connectPromise = wsService.connect();
      
      // Simulate WebSocket open event
      const openHandler = mockWs.on.mock.calls.find(call => call[0] === 'open')?.[1];
      if (openHandler) {
        openHandler();
      }

      await connectPromise;

      expect(MockedWebSocket).toHaveBeenCalledWith(
        expect.stringContaining('wss://ws.kite.trade')
      );
      expect(wsService.isWebSocketConnected()).toBe(true);
    });

    it('should handle connection error', async () => {
      const connectPromise = wsService.connect();
      
      // Simulate WebSocket error event
      const errorHandler = mockWs.on.mock.calls.find(call => call[0] === 'error')?.[1];
      if (errorHandler) {
        errorHandler(new Error('Connection failed'));
      }

      await expect(connectPromise).rejects.toThrow('Connection failed');
    });

    it('should not connect if already connected', async () => {
      // First connection
      const connectPromise1 = wsService.connect();
      const openHandler = mockWs.on.mock.calls.find(call => call[0] === 'open')?.[1];
      if (openHandler) {
        openHandler();
      }
      await connectPromise1;

      // Second connection attempt
      await wsService.connect();

      expect(MockedWebSocket).toHaveBeenCalledTimes(1);
    });
  });

  describe('disconnect', () => {
    beforeEach(async () => {
      const connectPromise = wsService.connect();
      const openHandler = mockWs.on.mock.calls.find(call => call[0] === 'open')?.[1];
      if (openHandler) {
        openHandler();
      }
      await connectPromise;
    });

    it('should disconnect successfully', () => {
      wsService.disconnect();

      expect(mockWs.close).toHaveBeenCalled();
      expect(wsService.isWebSocketConnected()).toBe(false);
    });
  });

  describe('subscribe', () => {
    beforeEach(async () => {
      const connectPromise = wsService.connect();
      const openHandler = mockWs.on.mock.calls.find(call => call[0] === 'open')?.[1];
      if (openHandler) {
        openHandler();
      }
      await connectPromise;
    });

    it('should subscribe to instruments', () => {
      const instrumentTokens = [256265, 260105];
      
      wsService.subscribe('ltp', instrumentTokens);

      expect(mockWs.send).toHaveBeenCalledWith(
        JSON.stringify({
          a: 'ltp',
          v: instrumentTokens,
        })
      );

      const subscriptions = wsService.getSubscriptions();
      expect(subscriptions.get(256265)).toBe('ltp');
      expect(subscriptions.get(260105)).toBe('ltp');
    });

    it('should queue subscription when not connected', () => {
      wsService.disconnect();
      
      const instrumentTokens = [256265];
      wsService.subscribe('ltp', instrumentTokens);

      // Should not send message when disconnected
      expect(mockWs.send).not.toHaveBeenCalled();
      
      // But should store subscription
      const subscriptions = wsService.getSubscriptions();
      expect(subscriptions.get(256265)).toBe('ltp');
    });
  });

  describe('unsubscribe', () => {
    beforeEach(async () => {
      const connectPromise = wsService.connect();
      const openHandler = mockWs.on.mock.calls.find(call => call[0] === 'open')?.[1];
      if (openHandler) {
        openHandler();
      }
      await connectPromise;
      
      // Subscribe first
      wsService.subscribe('ltp', [256265, 260105]);
    });

    it('should unsubscribe from instruments', () => {
      const instrumentTokens = [256265];
      
      wsService.unsubscribe(instrumentTokens);

      expect(mockWs.send).toHaveBeenCalledWith(
        JSON.stringify({
          a: 'unsubscribe',
          v: instrumentTokens,
        })
      );

      const subscriptions = wsService.getSubscriptions();
      expect(subscriptions.has(256265)).toBe(false);
      expect(subscriptions.has(260105)).toBe(true);
    });
  });

  describe('setMode', () => {
    beforeEach(async () => {
      const connectPromise = wsService.connect();
      const openHandler = mockWs.on.mock.calls.find(call => call[0] === 'open')?.[1];
      if (openHandler) {
        openHandler();
      }
      await connectPromise;
    });

    it('should set mode for instruments', () => {
      const instrumentTokens = [256265, 260105];
      
      wsService.setMode('quote', instrumentTokens);

      expect(mockWs.send).toHaveBeenCalledWith(
        JSON.stringify({
          a: 'mode',
          v: ['quote', instrumentTokens],
        })
      );

      const subscriptions = wsService.getSubscriptions();
      expect(subscriptions.get(256265)).toBe('quote');
      expect(subscriptions.get(260105)).toBe('quote');
    });
  });

  describe('message parsing', () => {
    beforeEach(async () => {
      const connectPromise = wsService.connect();
      const openHandler = mockWs.on.mock.calls.find(call => call[0] === 'open')?.[1];
      if (openHandler) {
        openHandler();
      }
      await connectPromise;
    });

    it('should parse binary tick data', (done) => {
      // Create mock binary data for a tick
      const mockBinaryData = Buffer.alloc(20);
      mockBinaryData.writeUInt16BE(16, 0); // packet length
      mockBinaryData.writeUInt32BE(256265, 2); // instrument token
      mockBinaryData.writeUInt32BE(1850000, 6); // last price * 100

      wsService.on('tick', (tick: ZerodhaMarketTick) => {
        expect(tick.instrument_token).toBe(256265);
        expect(tick.last_price).toBe(18500);
        expect(tick.mode).toBe('ltp');
        done();
      });

      // Simulate message event
      const messageHandler = mockWs.on.mock.calls.find(call => call[0] === 'message')?.[1];
      if (messageHandler) {
        messageHandler(mockBinaryData);
      }
    });

    it('should emit ticks event for multiple ticks', (done) => {
      const mockBinaryData = Buffer.alloc(40);
      
      // First tick
      mockBinaryData.writeUInt16BE(16, 0);
      mockBinaryData.writeUInt32BE(256265, 2);
      mockBinaryData.writeUInt32BE(1850000, 6);
      
      // Second tick
      mockBinaryData.writeUInt16BE(16, 20);
      mockBinaryData.writeUInt32BE(260105, 22);
      mockBinaryData.writeUInt32BE(4200000, 26);

      wsService.on('ticks', (ticks: ZerodhaMarketTick[]) => {
        expect(ticks).toHaveLength(2);
        expect(ticks[0].instrument_token).toBe(256265);
        expect(ticks[1].instrument_token).toBe(260105);
        done();
      });

      const messageHandler = mockWs.on.mock.calls.find(call => call[0] === 'message')?.[1];
      if (messageHandler) {
        messageHandler(mockBinaryData);
      }
    });
  });

  describe('reconnection', () => {
    beforeEach(async () => {
      const connectPromise = wsService.connect();
      const openHandler = mockWs.on.mock.calls.find(call => call[0] === 'open')?.[1];
      if (openHandler) {
        openHandler();
      }
      await connectPromise;
    });

    it('should attempt reconnection on unexpected close', (done) => {
      jest.useFakeTimers();
      
      wsService.on('connect', () => {
        // Second connection after reconnect
        done();
      });

      // Simulate unexpected close
      const closeHandler = mockWs.on.mock.calls.find(call => call[0] === 'close')?.[1];
      if (closeHandler) {
        closeHandler(1006, Buffer.from('Connection lost')); // Abnormal closure
      }

      // Fast-forward timers to trigger reconnection
      jest.advanceTimersByTime(1000);
      
      // Simulate successful reconnection
      const openHandler = mockWs.on.mock.calls.find(call => call[0] === 'open')?.[1];
      if (openHandler) {
        openHandler();
      }

      jest.useRealTimers();
    });

    it('should not reconnect on normal close', () => {
      const reconnectSpy = jest.spyOn(wsService as any, 'attemptReconnect');

      // Simulate normal close
      const closeHandler = mockWs.on.mock.calls.find(call => call[0] === 'close')?.[1];
      if (closeHandler) {
        closeHandler(1000, Buffer.from('Normal closure')); // Normal closure
      }

      expect(reconnectSpy).not.toHaveBeenCalled();
    });
  });
});