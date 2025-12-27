import { Server as SocketIOServer } from 'socket.io';
import { createServer } from 'http';
import { jest } from '@jest/globals';
import { ZerodhaWebSocketHandler } from '../websocket/zerodhaWebSocketHandler';
import { ServiceProxy } from '../services/serviceProxy';
import Client from 'socket.io-client';

// Mock ServiceProxy
jest.mock('../services/serviceProxy');
const MockedServiceProxy = ServiceProxy as jest.MockedClass<typeof ServiceProxy>;

describe('Zerodha WebSocket Handler', () => {
  let server: any;
  let io: SocketIOServer;
  let zerodhaHandler: ZerodhaWebSocketHandler;
  let clientSocket: any;
  let mockServiceProxy: jest.Mocked<ServiceProxy>;

  const validToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJ0ZXN0LXVzZXIiLCJlbWFpbCI6InRlc3RAdGVzdC5jb20iLCJpYXQiOjE2MzQ1NjcwMDB9.test';

  beforeEach((done) => {
    // Setup mock service proxy
    mockServiceProxy = {
      get: jest.fn(),
      post: jest.fn(),
      put: jest.fn(),
      delete: jest.fn(),
      patch: jest.fn(),
      forwardRequest: jest.fn()
    } as any;

    MockedServiceProxy.mockImplementation(() => mockServiceProxy);

    // Create HTTP server and Socket.IO server
    server = createServer();
    io = new SocketIOServer(server, {
      cors: {
        origin: '*',
        methods: ['GET', 'POST']
      }
    });

    // Create Zerodha WebSocket handler
    zerodhaHandler = new ZerodhaWebSocketHandler(io);

    // Start server
    server.listen(() => {
      const port = (server.address() as any).port;
      
      // Create client socket
      clientSocket = Client(`http://localhost:${port}`, {
        auth: {
          token: validToken
        }
      });

      clientSocket.on('connect', done);
    });
  });

  afterEach((done) => {
    if (clientSocket.connected) {
      clientSocket.disconnect();
    }
    
    server.close(() => {
      zerodhaHandler.disconnect();
      done();
    });
    
    jest.clearAllMocks();
  });

  describe('Market Data Subscription', () => {
    it('should handle market data subscription', (done) => {
      const mockResponse = {
        data: { success: true, message: 'Subscribed successfully' }
      };
      mockServiceProxy.post.mockResolvedValue(mockResponse);

      // Mock WebSocket URL endpoint
      mockServiceProxy.get.mockResolvedValue({
        data: { url: 'ws://localhost:8080/market-data' }
      });

      clientSocket.emit('zerodha:subscribe:market-data', {
        instruments: [256265, 408065],
        mode: 'quote'
      });

      clientSocket.on('zerodha:subscription:confirmed', (data: any) => {
        expect(data.type).toBe('market-data');
        expect(data.instruments).toEqual([256265, 408065]);
        expect(data.mode).toBe('quote');
        expect(mockServiceProxy.post).toHaveBeenCalledWith('/subscribe', {
          instruments: [256265, 408065],
          mode: 'quote'
        }, expect.any(Object));
        done();
      });
    });

    it('should reject invalid instruments array', (done) => {
      clientSocket.emit('zerodha:subscribe:market-data', {
        instruments: [], // Empty array
        mode: 'quote'
      });

      clientSocket.on('zerodha:error', (error: any) => {
        expect(error.code).toBe('INVALID_INSTRUMENTS');
        expect(error.message).toBe('Invalid instruments array');
        done();
      });
    });

    it('should reject too many instruments', (done) => {
      const tooManyInstruments = Array(101).fill(0).map((_, i) => i + 1);

      clientSocket.emit('zerodha:subscribe:market-data', {
        instruments: tooManyInstruments,
        mode: 'quote'
      });

      clientSocket.on('zerodha:error', (error: any) => {
        expect(error.code).toBe('TOO_MANY_INSTRUMENTS');
        expect(error.message).toBe('Maximum 100 instruments allowed per subscription');
        done();
      });
    });

    it('should handle market data unsubscription', (done) => {
      // First subscribe
      const mockResponse = {
        data: { success: true, message: 'Subscribed successfully' }
      };
      mockServiceProxy.post.mockResolvedValue(mockResponse);
      mockServiceProxy.delete.mockResolvedValue(mockResponse);
      mockServiceProxy.get.mockResolvedValue({
        data: { url: 'ws://localhost:8080/market-data' }
      });

      clientSocket.emit('zerodha:subscribe:market-data', {
        instruments: [256265],
        mode: 'quote'
      });

      clientSocket.on('zerodha:subscription:confirmed', () => {
        // Now unsubscribe
        clientSocket.emit('zerodha:unsubscribe:market-data', {
          instruments: [256265]
        });
      });

      clientSocket.on('zerodha:unsubscription:confirmed', (data: any) => {
        expect(data.type).toBe('market-data');
        expect(data.instruments).toEqual([256265]);
        expect(mockServiceProxy.delete).toHaveBeenCalledWith('/unsubscribe', {
          data: { instruments: [256265] },
          headers: expect.any(Object)
        });
        done();
      });
    });
  });

  describe('Order Subscription', () => {
    it('should handle order subscription', (done) => {
      clientSocket.emit('zerodha:subscribe:orders');

      clientSocket.on('zerodha:subscription:confirmed', (data: any) => {
        expect(data.type).toBe('orders');
        done();
      });
    });

    it('should handle order unsubscription', (done) => {
      clientSocket.emit('zerodha:subscribe:orders');

      clientSocket.on('zerodha:subscription:confirmed', () => {
        clientSocket.emit('zerodha:unsubscribe:orders');
      });

      clientSocket.on('zerodha:unsubscription:confirmed', (data: any) => {
        expect(data.type).toBe('orders');
        done();
      });
    });
  });

  describe('Portfolio Subscription', () => {
    it('should handle portfolio subscription', (done) => {
      clientSocket.emit('zerodha:subscribe:portfolio');

      clientSocket.on('zerodha:subscription:confirmed', (data: any) => {
        expect(data.type).toBe('portfolio');
        done();
      });
    });

    it('should handle portfolio unsubscription', (done) => {
      clientSocket.emit('zerodha:subscribe:portfolio');

      clientSocket.on('zerodha:subscription:confirmed', () => {
        clientSocket.emit('zerodha:unsubscribe:portfolio');
      });

      clientSocket.on('zerodha:unsubscription:confirmed', (data: any) => {
        expect(data.type).toBe('portfolio');
        done();
      });
    });
  });

  describe('Broadcasting', () => {
    it('should broadcast order updates to subscribed users', (done) => {
      clientSocket.emit('zerodha:subscribe:orders');

      clientSocket.on('zerodha:subscription:confirmed', () => {
        // Simulate order update broadcast
        const orderUpdate = {
          order_id: 'ORD123456',
          status: 'COMPLETE',
          filled_quantity: 10
        };

        zerodhaHandler.broadcastOrderUpdate('test-user', orderUpdate);
      });

      clientSocket.on('zerodha:order-update', (data: any) => {
        expect(data.order_id).toBe('ORD123456');
        expect(data.status).toBe('COMPLETE');
        done();
      });
    });

    it('should broadcast portfolio updates to subscribed users', (done) => {
      clientSocket.emit('zerodha:subscribe:portfolio');

      clientSocket.on('zerodha:subscription:confirmed', () => {
        // Simulate portfolio update broadcast
        const portfolioUpdate = {
          total_pnl: 1500.50,
          day_change: 250.00,
          positions_count: 5
        };

        zerodhaHandler.broadcastPortfolioUpdate('test-user', portfolioUpdate);
      });

      clientSocket.on('zerodha:portfolio-update', (data: any) => {
        expect(data.total_pnl).toBe(1500.50);
        expect(data.day_change).toBe(250.00);
        done();
      });
    });

    it('should broadcast risk alerts to subscribed users', (done) => {
      clientSocket.emit('zerodha:subscribe:orders');

      clientSocket.on('zerodha:subscription:confirmed', () => {
        // Simulate risk alert broadcast
        const riskAlert = {
          type: 'DAILY_LOSS_LIMIT',
          message: 'Daily loss limit exceeded',
          severity: 'HIGH'
        };

        zerodhaHandler.broadcastRiskAlert('test-user', riskAlert);
      });

      clientSocket.on('zerodha:risk-alert', (data: any) => {
        expect(data.type).toBe('DAILY_LOSS_LIMIT');
        expect(data.severity).toBe('HIGH');
        done();
      });
    });
  });

  describe('Connection Management', () => {
    it('should track active subscriptions', (done) => {
      const mockResponse = {
        data: { success: true, message: 'Subscribed successfully' }
      };
      mockServiceProxy.post.mockResolvedValue(mockResponse);
      mockServiceProxy.get.mockResolvedValue({
        data: { url: 'ws://localhost:8080/market-data' }
      });

      clientSocket.emit('zerodha:subscribe:market-data', {
        instruments: [256265],
        mode: 'quote'
      });

      clientSocket.on('zerodha:subscription:confirmed', () => {
        const subscriptions = zerodhaHandler.getActiveSubscriptions();
        expect(subscriptions.size).toBe(1);
        
        const subscription = Array.from(subscriptions.values())[0];
        expect(subscription.userId).toBe('test-user');
        expect(subscription.instruments).toEqual([256265]);
        expect(subscription.mode).toBe('quote');
        done();
      });
    });

    it('should clean up subscriptions on disconnect', (done) => {
      const mockResponse = {
        data: { success: true, message: 'Subscribed successfully' }
      };
      mockServiceProxy.post.mockResolvedValue(mockResponse);
      mockServiceProxy.get.mockResolvedValue({
        data: { url: 'ws://localhost:8080/market-data' }
      });

      clientSocket.emit('zerodha:subscribe:market-data', {
        instruments: [256265],
        mode: 'quote'
      });

      clientSocket.on('zerodha:subscription:confirmed', () => {
        // Verify subscription exists
        expect(zerodhaHandler.getActiveSubscriptions().size).toBe(1);
        
        // Disconnect client
        clientSocket.disconnect();
        
        // Wait a bit for cleanup
        setTimeout(() => {
          expect(zerodhaHandler.getActiveSubscriptions().size).toBe(0);
          done();
        }, 100);
      });
    });

    it('should get instrument subscriber count', (done) => {
      const mockResponse = {
        data: { success: true, message: 'Subscribed successfully' }
      };
      mockServiceProxy.post.mockResolvedValue(mockResponse);
      mockServiceProxy.get.mockResolvedValue({
        data: { url: 'ws://localhost:8080/market-data' }
      });

      clientSocket.emit('zerodha:subscribe:market-data', {
        instruments: [256265],
        mode: 'quote'
      });

      clientSocket.on('zerodha:subscription:confirmed', () => {
        const subscriberCount = zerodhaHandler.getInstrumentSubscriberCount(256265);
        expect(subscriberCount).toBe(1);
        done();
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle service proxy errors gracefully', (done) => {
      mockServiceProxy.post.mockRejectedValue(new Error('Service unavailable'));

      clientSocket.emit('zerodha:subscribe:market-data', {
        instruments: [256265],
        mode: 'quote'
      });

      clientSocket.on('zerodha:error', (error: any) => {
        expect(error.code).toBe('SUBSCRIPTION_FAILED');
        expect(error.message).toBe('Failed to subscribe to market data');
        done();
      });
    });

    it('should handle malformed subscription data', (done) => {
      clientSocket.emit('zerodha:subscribe:market-data', {
        instruments: 'invalid', // Should be array
        mode: 'quote'
      });

      clientSocket.on('zerodha:error', (error: any) => {
        expect(error.code).toBe('INVALID_INSTRUMENTS');
        done();
      });
    });
  });

  describe('Data Filtering', () => {
    it('should filter market data based on subscription mode', (done) => {
      const mockResponse = {
        data: { success: true, message: 'Subscribed successfully' }
      };
      mockServiceProxy.post.mockResolvedValue(mockResponse);
      mockServiceProxy.get.mockResolvedValue({
        data: { url: 'ws://localhost:8080/market-data' }
      });

      // Subscribe with 'ltp' mode
      clientSocket.emit('zerodha:subscribe:market-data', {
        instruments: [256265],
        mode: 'ltp'
      });

      clientSocket.on('zerodha:subscription:confirmed', () => {
        // Simulate receiving market tick
        const fullTick = {
          instrument_token: 256265,
          last_price: 2500.50,
          volume: 1000,
          ohlc: { open: 2480, high: 2520, low: 2475, close: 2500 },
          change: 20.50,
          change_percent: 0.82,
          timestamp: new Date()
        };

        // This would normally come from the market data WebSocket
        // For testing, we'll simulate the filtered broadcast
        clientSocket.emit('test:market-tick', fullTick);
      });

      clientSocket.on('zerodha:market-tick', (data: any) => {
        // Should only contain LTP data
        expect(data.instrument_token).toBe(256265);
        expect(data.last_price).toBe(2500.50);
        expect(data.timestamp).toBeDefined();
        
        // Should not contain full data
        expect(data.volume).toBeUndefined();
        expect(data.ohlc).toBeUndefined();
        done();
      });

      // Trigger the test
      clientSocket.emit('test:market-tick', {
        instrument_token: 256265,
        last_price: 2500.50,
        timestamp: new Date()
      });
    });
  });
});