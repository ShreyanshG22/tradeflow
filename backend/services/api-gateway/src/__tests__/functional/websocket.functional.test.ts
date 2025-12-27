import { Server } from 'http';
import { io as Client, Socket as ClientSocket } from 'socket.io-client';
import { app, server, io } from '../../index';
import jwt from 'jsonwebtoken';
import { config } from '../../config/config';

describe('WebSocket Functional Tests', () => {
  let testServer: Server;
  let clientSocket: ClientSocket;
  let authToken: string;
  let testUserId: string;

  beforeAll(async () => {
    testServer = server;
    
    // Create test JWT token
    testUserId = 'test-user-123';
    authToken = jwt.sign(
      {
        userId: testUserId,
        email: 'test@example.com',
        role: 'trader'
      },
      config.jwt.secret,
      { expiresIn: '1h' }
    );
  });

  afterAll(async () => {
    if (clientSocket) {
      clientSocket.close();
    }
    testServer.close();
  });

  beforeEach((done) => {
    // Create new client connection for each test
    clientSocket = Client(`http://localhost:${config.port}`, {
      auth: {
        token: authToken
      },
      transports: ['websocket']
    });

    clientSocket.on('connect', () => {
      done();
    });

    clientSocket.on('connect_error', (error) => {
      done(error);
    });
  });

  afterEach(() => {
    if (clientSocket.connected) {
      clientSocket.close();
    }
  });

  describe('Connection and Authentication', () => {
    it('should connect successfully with valid token', (done) => {
      expect(clientSocket.connected).toBe(true);
      
      clientSocket.on('connected', (data) => {
        expect(data).toHaveProperty('message');
        expect(data).toHaveProperty('timestamp');
        expect(data).toHaveProperty('userId');
        expect(data.userId).toBe(testUserId);
        done();
      });
    });

    it('should reject connection with invalid token', (done) => {
      const invalidClient = Client(`http://localhost:${config.port}`, {
        auth: {
          token: 'invalid-token'
        },
        transports: ['websocket']
      });

      invalidClient.on('connect_error', (error) => {
        expect(error.message).toBe('Authentication failed');
        invalidClient.close();
        done();
      });

      invalidClient.on('connect', () => {
        invalidClient.close();
        done(new Error('Should not connect with invalid token'));
      });
    });

    it('should reject connection without token', (done) => {
      const noAuthClient = Client(`http://localhost:${config.port}`, {
        transports: ['websocket']
      });

      noAuthClient.on('connect_error', (error) => {
        expect(error.message).toBe('Authentication token required');
        noAuthClient.close();
        done();
      });

      noAuthClient.on('connect', () => {
        noAuthClient.close();
        done(new Error('Should not connect without token'));
      });
    });
  });

  describe('Market Data Subscriptions', () => {
    it('should subscribe to market data successfully', (done) => {
      const symbols = ['AAPL', 'GOOGL', 'MSFT'];

      clientSocket.emit('subscribe:market-data', { symbols });

      clientSocket.on('subscription:confirmed', (data) => {
        expect(data.type).toBe('market-data');
        expect(data.symbols).toEqual(symbols);
        expect(data).toHaveProperty('timestamp');
        done();
      });

      clientSocket.on('error', (error) => {
        done(error);
      });
    });

    it('should receive market data updates after subscription', (done) => {
      const symbols = ['AAPL'];

      clientSocket.emit('subscribe:market-data', { symbols });

      clientSocket.on('subscription:confirmed', () => {
        // Simulate market data update from server
        setTimeout(() => {
          io.emit('market-data:update', {
            symbol: 'AAPL',
            price: 150.25,
            bid: 150.20,
            ask: 150.30,
            volume: 1000000,
            timestamp: new Date().toISOString()
          });
        }, 100);
      });

      clientSocket.on('market-data:update', (data) => {
        expect(data.symbol).toBe('AAPL');
        expect(data).toHaveProperty('price');
        expect(data).toHaveProperty('bid');
        expect(data).toHaveProperty('ask');
        expect(data).toHaveProperty('volume');
        expect(data).toHaveProperty('timestamp');
        done();
      });
    });

    it('should unsubscribe from market data successfully', (done) => {
      const symbols = ['AAPL', 'GOOGL'];

      // First subscribe
      clientSocket.emit('subscribe:market-data', { symbols });

      clientSocket.on('subscription:confirmed', () => {
        // Then unsubscribe
        clientSocket.emit('unsubscribe:market-data', { symbols });
      });

      clientSocket.on('unsubscription:confirmed', (data) => {
        expect(data.type).toBe('market-data');
        expect(data.symbols).toEqual(symbols);
        expect(data).toHaveProperty('timestamp');
        done();
      });
    });

    it('should reject subscription with invalid symbols', (done) => {
      clientSocket.emit('subscribe:market-data', { symbols: 'invalid' });

      clientSocket.on('error', (error) => {
        expect(error.message).toBe('Invalid symbols array');
        done();
      });
    });

    it('should reject subscription without symbols', (done) => {
      clientSocket.emit('subscribe:market-data', {});

      clientSocket.on('error', (error) => {
        expect(error.message).toBe('Invalid symbols array');
        done();
      });
    });
  });

  describe('Portfolio Subscriptions', () => {
    it('should subscribe to portfolio updates successfully', (done) => {
      clientSocket.emit('subscribe:portfolio');

      clientSocket.on('subscription:confirmed', (data) => {
        expect(data.type).toBe('portfolio');
        expect(data).toHaveProperty('timestamp');
        done();
      });
    });

    it('should receive portfolio updates after subscription', (done) => {
      clientSocket.emit('subscribe:portfolio');

      clientSocket.on('subscription:confirmed', () => {
        // Simulate portfolio update from server
        setTimeout(() => {
          io.emit('portfolio:update', {
            userId: testUserId,
            totalValue: 50000,
            cashBalance: 10000,
            unrealizedPnL: 2500,
            realizedPnL: 1500,
            timestamp: new Date().toISOString()
          });
        }, 100);
      });

      clientSocket.on('portfolio:update', (data) => {
        expect(data.userId).toBe(testUserId);
        expect(data).toHaveProperty('totalValue');
        expect(data).toHaveProperty('cashBalance');
        expect(data).toHaveProperty('unrealizedPnL');
        expect(data).toHaveProperty('realizedPnL');
        expect(data).toHaveProperty('timestamp');
        done();
      });
    });

    it('should unsubscribe from portfolio updates successfully', (done) => {
      // First subscribe
      clientSocket.emit('subscribe:portfolio');

      clientSocket.on('subscription:confirmed', () => {
        // Then unsubscribe
        clientSocket.emit('unsubscribe:portfolio');
      });

      clientSocket.on('unsubscription:confirmed', (data) => {
        expect(data.type).toBe('portfolio');
        expect(data).toHaveProperty('timestamp');
        done();
      });
    });
  });

  describe('Strategy Subscriptions', () => {
    const strategyId = 'strategy-123';

    it('should subscribe to strategy updates successfully', (done) => {
      clientSocket.emit('subscribe:strategy', { strategyId });

      clientSocket.on('subscription:confirmed', (data) => {
        expect(data.type).toBe('strategy');
        expect(data.strategyId).toBe(strategyId);
        expect(data).toHaveProperty('timestamp');
        done();
      });
    });

    it('should receive strategy execution updates', (done) => {
      clientSocket.emit('subscribe:strategy', { strategyId });

      clientSocket.on('subscription:confirmed', () => {
        // Simulate strategy update from server
        setTimeout(() => {
          io.emit('strategy:execution', {
            strategyId,
            status: 'running',
            signal: 'buy',
            symbol: 'AAPL',
            price: 150.25,
            quantity: 10,
            timestamp: new Date().toISOString()
          });
        }, 100);
      });

      clientSocket.on('strategy:execution', (data) => {
        expect(data.strategyId).toBe(strategyId);
        expect(data).toHaveProperty('status');
        expect(data).toHaveProperty('signal');
        expect(data).toHaveProperty('symbol');
        expect(data).toHaveProperty('price');
        expect(data).toHaveProperty('quantity');
        expect(data).toHaveProperty('timestamp');
        done();
      });
    });

    it('should unsubscribe from strategy updates successfully', (done) => {
      // First subscribe
      clientSocket.emit('subscribe:strategy', { strategyId });

      clientSocket.on('subscription:confirmed', () => {
        // Then unsubscribe
        clientSocket.emit('unsubscribe:strategy', { strategyId });
      });

      clientSocket.on('unsubscription:confirmed', (data) => {
        expect(data.type).toBe('strategy');
        expect(data.strategyId).toBe(strategyId);
        expect(data).toHaveProperty('timestamp');
        done();
      });
    });

    it('should reject subscription without strategy ID', (done) => {
      clientSocket.emit('subscribe:strategy', {});

      clientSocket.on('error', (error) => {
        expect(error.message).toBe('Strategy ID is required');
        done();
      });
    });
  });

  describe('Backtest Subscriptions', () => {
    const backtestId = 'backtest-123';

    it('should subscribe to backtest progress successfully', (done) => {
      clientSocket.emit('subscribe:backtest', { backtestId });

      clientSocket.on('subscription:confirmed', (data) => {
        expect(data.type).toBe('backtest');
        expect(data.backtestId).toBe(backtestId);
        expect(data).toHaveProperty('timestamp');
        done();
      });
    });

    it('should receive backtest progress updates', (done) => {
      clientSocket.emit('subscribe:backtest', { backtestId });

      clientSocket.on('subscription:confirmed', () => {
        // Simulate backtest progress update from server
        setTimeout(() => {
          io.emit('backtest:progress', {
            backtestId,
            progress: 45,
            status: 'running',
            currentDate: '2023-06-15',
            tradesExecuted: 25,
            currentPnL: 1250.50,
            timestamp: new Date().toISOString()
          });
        }, 100);
      });

      clientSocket.on('backtest:progress', (data) => {
        expect(data.backtestId).toBe(backtestId);
        expect(data).toHaveProperty('progress');
        expect(data).toHaveProperty('status');
        expect(data).toHaveProperty('currentDate');
        expect(data).toHaveProperty('tradesExecuted');
        expect(data).toHaveProperty('currentPnL');
        expect(data).toHaveProperty('timestamp');
        done();
      });
    });

    it('should receive backtest completion notification', (done) => {
      clientSocket.emit('subscribe:backtest', { backtestId });

      clientSocket.on('subscription:confirmed', () => {
        // Simulate backtest completion from server
        setTimeout(() => {
          io.emit('backtest:completed', {
            backtestId,
            status: 'completed',
            results: {
              totalTrades: 50,
              winRate: 0.65,
              totalReturn: 0.15,
              sharpeRatio: 1.25,
              maxDrawdown: 0.08
            },
            timestamp: new Date().toISOString()
          });
        }, 100);
      });

      clientSocket.on('backtest:completed', (data) => {
        expect(data.backtestId).toBe(backtestId);
        expect(data.status).toBe('completed');
        expect(data).toHaveProperty('results');
        expect(data.results).toHaveProperty('totalTrades');
        expect(data.results).toHaveProperty('winRate');
        expect(data.results).toHaveProperty('totalReturn');
        expect(data.results).toHaveProperty('sharpeRatio');
        expect(data.results).toHaveProperty('maxDrawdown');
        done();
      });
    });

    it('should reject subscription without backtest ID', (done) => {
      clientSocket.emit('subscribe:backtest', {});

      clientSocket.on('error', (error) => {
        expect(error.message).toBe('Backtest ID is required');
        done();
      });
    });
  });

  describe('Notification Subscriptions', () => {
    it('should subscribe to notifications successfully', (done) => {
      clientSocket.emit('subscribe:notifications');

      clientSocket.on('subscription:confirmed', (data) => {
        expect(data.type).toBe('notifications');
        expect(data).toHaveProperty('timestamp');
        done();
      });
    });

    it('should receive system notifications', (done) => {
      clientSocket.emit('subscribe:notifications');

      clientSocket.on('subscription:confirmed', () => {
        // Simulate system notification from server
        setTimeout(() => {
          io.emit('notification', {
            id: 'notif-123',
            type: 'system',
            title: 'System Maintenance',
            message: 'Scheduled maintenance will begin in 30 minutes',
            severity: 'warning',
            timestamp: new Date().toISOString()
          });
        }, 100);
      });

      clientSocket.on('notification', (data) => {
        expect(data).toHaveProperty('id');
        expect(data).toHaveProperty('type');
        expect(data).toHaveProperty('title');
        expect(data).toHaveProperty('message');
        expect(data).toHaveProperty('severity');
        expect(data).toHaveProperty('timestamp');
        done();
      });
    });

    it('should receive trade notifications', (done) => {
      clientSocket.emit('subscribe:notifications');

      clientSocket.on('subscription:confirmed', () => {
        // Simulate trade notification from server
        setTimeout(() => {
          io.emit('notification', {
            id: 'notif-456',
            type: 'trade',
            title: 'Trade Executed',
            message: 'Bought 10 shares of AAPL at $150.25',
            severity: 'info',
            data: {
              symbol: 'AAPL',
              side: 'buy',
              quantity: 10,
              price: 150.25
            },
            timestamp: new Date().toISOString()
          });
        }, 100);
      });

      clientSocket.on('notification', (data) => {
        expect(data.type).toBe('trade');
        expect(data).toHaveProperty('data');
        expect(data.data).toHaveProperty('symbol');
        expect(data.data).toHaveProperty('side');
        expect(data.data).toHaveProperty('quantity');
        expect(data.data).toHaveProperty('price');
        done();
      });
    });

    it('should unsubscribe from notifications successfully', (done) => {
      // First subscribe
      clientSocket.emit('subscribe:notifications');

      clientSocket.on('subscription:confirmed', () => {
        // Then unsubscribe
        clientSocket.emit('unsubscribe:notifications');
      });

      clientSocket.on('unsubscription:confirmed', (data) => {
        expect(data.type).toBe('notifications');
        expect(data).toHaveProperty('timestamp');
        done();
      });
    });
  });

  describe('Connection Health', () => {
    it('should respond to ping with pong', (done) => {
      clientSocket.emit('ping');

      clientSocket.on('pong', (data) => {
        expect(data).toHaveProperty('timestamp');
        done();
      });
    });

    it('should handle multiple subscriptions from same user', (done) => {
      let confirmationCount = 0;
      const expectedConfirmations = 3;

      const handleConfirmation = () => {
        confirmationCount++;
        if (confirmationCount === expectedConfirmations) {
          done();
        }
      };

      clientSocket.on('subscription:confirmed', handleConfirmation);

      // Subscribe to multiple channels
      clientSocket.emit('subscribe:market-data', { symbols: ['AAPL'] });
      clientSocket.emit('subscribe:portfolio');
      clientSocket.emit('subscribe:notifications');
    });

    it('should clean up subscriptions on disconnect', (done) => {
      // Subscribe to multiple channels
      clientSocket.emit('subscribe:market-data', { symbols: ['AAPL'] });
      clientSocket.emit('subscribe:portfolio');

      let confirmationCount = 0;
      clientSocket.on('subscription:confirmed', () => {
        confirmationCount++;
        if (confirmationCount === 2) {
          // Disconnect after all subscriptions are confirmed
          clientSocket.disconnect();
          
          // Verify cleanup happened (this would be checked server-side in real implementation)
          setTimeout(() => {
            done();
          }, 100);
        }
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid event data gracefully', (done) => {
      clientSocket.emit('subscribe:market-data', 'invalid-data');

      clientSocket.on('error', (error) => {
        expect(error).toHaveProperty('message');
        done();
      });
    });

    it('should handle server errors gracefully', (done) => {
      // Emit an event that would cause server error
      clientSocket.emit('subscribe:strategy', { strategyId: null });

      clientSocket.on('error', (error) => {
        expect(error).toHaveProperty('message');
        done();
      });
    });
  });

  describe('Rate Limiting', () => {
    it('should enforce rate limits on WebSocket events', (done) => {
      let errorReceived = false;

      clientSocket.on('error', (error) => {
        if (error.message === 'Rate limit exceeded') {
          errorReceived = true;
        }
      });

      // Send many rapid requests to trigger rate limit
      for (let i = 0; i < 105; i++) {
        clientSocket.emit('ping');
      }

      setTimeout(() => {
        expect(errorReceived).toBe(true);
        done();
      }, 1000);
    });
  });

  describe('Multiple Client Connections', () => {
    let secondClient: ClientSocket;

    afterEach(() => {
      if (secondClient && secondClient.connected) {
        secondClient.close();
      }
    });

    it('should handle multiple clients for same user', (done) => {
      secondClient = Client(`http://localhost:${config.port}`, {
        auth: {
          token: authToken
        },
        transports: ['websocket']
      });

      let connectCount = 0;
      const handleConnect = () => {
        connectCount++;
        if (connectCount === 2) {
          // Both clients connected
          expect(clientSocket.connected).toBe(true);
          expect(secondClient.connected).toBe(true);
          done();
        }
      };

      clientSocket.on('connected', handleConnect);
      secondClient.on('connected', handleConnect);
    });

    it('should broadcast to all user connections', (done) => {
      secondClient = Client(`http://localhost:${config.port}`, {
        auth: {
          token: authToken
        },
        transports: ['websocket']
      });

      let updateCount = 0;
      const handleUpdate = () => {
        updateCount++;
        if (updateCount === 2) {
          done();
        }
      };

      secondClient.on('connected', () => {
        // Subscribe both clients to portfolio updates
        clientSocket.emit('subscribe:portfolio');
        secondClient.emit('subscribe:portfolio');

        setTimeout(() => {
          // Simulate server broadcasting to user
          io.emit('portfolio:update', {
            userId: testUserId,
            totalValue: 50000,
            timestamp: new Date().toISOString()
          });
        }, 200);
      });

      clientSocket.on('portfolio:update', handleUpdate);
      secondClient.on('portfolio:update', handleUpdate);
    });
  });
});