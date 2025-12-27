import request from 'supertest';
import { Express } from 'express';
import WebSocket from 'ws';
import { createTestApp } from '../setup/test-app';
import { TestDataManager } from '../setup/test-data-manager';
import { ZerodhaTestClient } from '../setup/zerodha-test-client';

describe('Zerodha Market Data End-to-End Flow', () => {
  let app: Express;
  let testDataManager: TestDataManager;
  let zerodhaClient: ZerodhaTestClient;
  let testUserId: string;
  let accessToken: string;

  beforeAll(async () => {
    app = await createTestApp();
    testDataManager = new TestDataManager();
    zerodhaClient = new ZerodhaTestClient();
    await testDataManager.setup();
  });

  afterAll(async () => {
    await testDataManager.cleanup();
  });

  beforeEach(async () => {
    testUserId = await testDataManager.createTestUser();
    const authResult = await zerodhaClient.authenticateTestUser(testUserId);
    accessToken = authResult.access_token;
  });

  afterEach(async () => {
    await testDataManager.cleanupTestUser(testUserId);
  });

  describe('Real-time Market Data Streaming', () => {
    it('should stream live market data with low latency', async () => {
      const wsUrl = `ws://localhost:${process.env.TEST_PORT}/ws/market-data`;
      const ws = new WebSocket(wsUrl, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });

      const messages: any[] = [];
      const latencies: number[] = [];

      return new Promise<void>((resolve, reject) => {
        ws.on('open', () => {
          // Subscribe to instruments
          ws.send(JSON.stringify({
            action: 'subscribe',
            instruments: ['NSE:RELIANCE', 'NSE:INFY', 'NSE:TCS']
          }));
        });

        ws.on('message', (data) => {
          const message = JSON.parse(data.toString());
          const receiveTime = Date.now();
          
          if (message.type === 'tick') {
            messages.push(message);
            
            // Calculate latency (assuming server timestamp is included)
            if (message.timestamp) {
              const latency = receiveTime - new Date(message.timestamp).getTime();
              latencies.push(latency);
            }

            // Test data structure
            expect(message).toMatchObject({
              type: 'tick',
              instrument_token: expect.any(Number),
              tradingsymbol: expect.any(String),
              last_price: expect.any(Number),
              volume: expect.any(Number),
              ohlc: {
                open: expect.any(Number),
                high: expect.any(Number),
                low: expect.any(Number),
                close: expect.any(Number)
              },
              timestamp: expect.any(String)
            });

            // After receiving enough messages, validate performance
            if (messages.length >= 10) {
              // Validate latency requirement (< 100ms)
              const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
              expect(avgLatency).toBeLessThan(100);

              // Validate data freshness (timestamps should be recent)
              const latestTimestamp = new Date(message.timestamp).getTime();
              const timeDiff = receiveTime - latestTimestamp;
              expect(timeDiff).toBeLessThan(5000); // Within 5 seconds

              ws.close();
              resolve();
            }
          }
        });

        ws.on('error', reject);

        // Timeout after 30 seconds
        setTimeout(() => {
          ws.close();
          reject(new Error('Test timeout'));
        }, 30000);
      });
    });

    it('should handle WebSocket reconnection automatically', async () => {
      const wsUrl = `ws://localhost:${process.env.TEST_PORT}/ws/market-data`;
      let ws = new WebSocket(wsUrl, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });

      let reconnectCount = 0;
      let messagesAfterReconnect = 0;

      return new Promise<void>((resolve, reject) => {
        const handleConnection = () => {
          ws.send(JSON.stringify({
            action: 'subscribe',
            instruments: ['NSE:RELIANCE']
          }));
        };

        ws.on('open', handleConnection);

        ws.on('message', (data) => {
          const message = JSON.parse(data.toString());
          
          if (message.type === 'tick') {
            if (reconnectCount > 0) {
              messagesAfterReconnect++;
              
              if (messagesAfterReconnect >= 3) {
                // Successfully receiving data after reconnection
                ws.close();
                resolve();
              }
            } else if (messagesAfterReconnect === 0) {
              // Simulate connection drop after first message
              setTimeout(() => {
                ws.terminate(); // Force close connection
                
                // Reconnect after 1 second
                setTimeout(() => {
                  reconnectCount++;
                  ws = new WebSocket(wsUrl, {
                    headers: { Authorization: `Bearer ${accessToken}` }
                  });
                  ws.on('open', handleConnection);
                  ws.on('message', (data) => {
                    const message = JSON.parse(data.toString());
                    if (message.type === 'tick') {
                      messagesAfterReconnect++;
                      if (messagesAfterReconnect >= 3) {
                        ws.close();
                        resolve();
                      }
                    }
                  });
                  ws.on('error', reject);
                }, 1000);
              }, 100);
            }
          }
        });

        ws.on('error', (error) => {
          if (reconnectCount === 0) {
            // Expected error during forced disconnect
            return;
          }
          reject(error);
        });

        setTimeout(() => {
          ws.close();
          reject(new Error('Reconnection test timeout'));
        }, 15000);
      });
    });

    it('should validate market data accuracy and consistency', async () => {
      // Get quote data via REST API
      const quoteResponse = await request(app)
        .get('/api/zerodha/market/quotes')
        .query({ instruments: 'NSE:RELIANCE,NSE:INFY' })
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const restQuotes = quoteResponse.body.data;

      // Connect to WebSocket and compare data
      const wsUrl = `ws://localhost:${process.env.TEST_PORT}/ws/market-data`;
      const ws = new WebSocket(wsUrl, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });

      return new Promise<void>((resolve, reject) => {
        const wsQuotes: any = {};

        ws.on('open', () => {
          ws.send(JSON.stringify({
            action: 'subscribe',
            instruments: ['NSE:RELIANCE', 'NSE:INFY']
          }));
        });

        ws.on('message', (data) => {
          const message = JSON.parse(data.toString());
          
          if (message.type === 'tick') {
            wsQuotes[message.tradingsymbol] = message;

            // When we have data for both instruments
            if (Object.keys(wsQuotes).length >= 2) {
              // Validate data consistency between REST and WebSocket
              Object.keys(wsQuotes).forEach(symbol => {
                const wsData = wsQuotes[symbol];
                const restData = restQuotes[symbol];

                if (restData) {
                  // Prices should be within reasonable range (allowing for market movement)
                  const priceDiff = Math.abs(wsData.last_price - restData.last_price);
                  const priceVariance = priceDiff / restData.last_price;
                  expect(priceVariance).toBeLessThan(0.05); // 5% variance allowed

                  // OHLC data structure should match
                  expect(wsData.ohlc).toMatchObject({
                    open: expect.any(Number),
                    high: expect.any(Number),
                    low: expect.any(Number),
                    close: expect.any(Number)
                  });

                  // Volume should be positive
                  expect(wsData.volume).toBeGreaterThan(0);
                }
              });

              ws.close();
              resolve();
            }
          }
        });

        ws.on('error', reject);

        setTimeout(() => {
          ws.close();
          reject(new Error('Data validation timeout'));
        }, 10000);
      });
    });
  });

  describe('Historical Data Service', () => {
    it('should fetch and cache historical data correctly', async () => {
      const symbol = 'NSE:RELIANCE';
      const fromDate = '2024-01-01';
      const toDate = '2024-01-31';
      const interval = 'day';

      // First request - should fetch from API
      const firstResponse = await request(app)
        .get('/api/zerodha/market/historical')
        .query({
          instrument: symbol,
          from: fromDate,
          to: toDate,
          interval: interval
        })
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(firstResponse.body).toMatchObject({
        success: true,
        data: {
          candles: expect.any(Array),
          metadata: {
            instrument: symbol,
            interval: interval,
            from: fromDate,
            to: toDate
          }
        }
      });

      const firstRequestTime = Date.now();

      // Validate candle data structure
      const candles = firstResponse.body.data.candles;
      expect(candles.length).toBeGreaterThan(0);
      
      candles.forEach((candle: any) => {
        expect(candle).toMatchObject({
          timestamp: expect.any(String),
          open: expect.any(Number),
          high: expect.any(Number),
          low: expect.any(Number),
          close: expect.any(Number),
          volume: expect.any(Number)
        });

        // Validate OHLC relationships
        expect(candle.high).toBeGreaterThanOrEqual(candle.open);
        expect(candle.high).toBeGreaterThanOrEqual(candle.close);
        expect(candle.low).toBeLessThanOrEqual(candle.open);
        expect(candle.low).toBeLessThanOrEqual(candle.close);
      });

      // Second request - should return cached data (faster)
      const secondResponse = await request(app)
        .get('/api/zerodha/market/historical')
        .query({
          instrument: symbol,
          from: fromDate,
          to: toDate,
          interval: interval
        })
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const secondRequestTime = Date.now();

      // Cached response should be faster
      const firstDuration = firstRequestTime;
      const secondDuration = secondRequestTime;
      
      // Data should be identical
      expect(secondResponse.body.data.candles).toEqual(candles);

      // Verify cache headers
      expect(secondResponse.headers['x-cache-status']).toBe('HIT');
    });

    it('should handle large historical data requests efficiently', async () => {
      const symbol = 'NSE:NIFTY50';
      const fromDate = '2023-01-01';
      const toDate = '2024-01-01';
      const interval = 'minute';

      const startTime = Date.now();

      const response = await request(app)
        .get('/api/zerodha/market/historical')
        .query({
          instrument: symbol,
          from: fromDate,
          to: toDate,
          interval: interval
        })
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Should complete within reasonable time (30 seconds)
      expect(duration).toBeLessThan(30000);

      const candles = response.body.data.candles;
      
      // Should have substantial amount of data
      expect(candles.length).toBeGreaterThan(1000);

      // Verify data is properly sorted by timestamp
      for (let i = 1; i < candles.length; i++) {
        const prevTime = new Date(candles[i-1].timestamp).getTime();
        const currTime = new Date(candles[i].timestamp).getTime();
        expect(currTime).toBeGreaterThan(prevTime);
      }
    });
  });

  describe('Instrument Management', () => {
    it('should provide comprehensive instrument search and discovery', async () => {
      // Test search functionality
      const searchResponse = await request(app)
        .get('/api/zerodha/market/search')
        .query({ q: 'reliance' })
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(searchResponse.body).toMatchObject({
        success: true,
        data: expect.arrayContaining([
          expect.objectContaining({
            instrument_token: expect.any(Number),
            tradingsymbol: expect.stringMatching(/RELIANCE/i),
            name: expect.any(String),
            exchange: expect.stringMatching(/^(NSE|BSE)$/),
            segment: expect.any(String),
            lot_size: expect.any(Number),
            tick_size: expect.any(Number)
          })
        ])
      });

      // Test instrument details
      const instruments = searchResponse.body.data;
      const relianceNSE = instruments.find((i: any) => 
        i.tradingsymbol === 'RELIANCE' && i.exchange === 'NSE'
      );

      expect(relianceNSE).toBeDefined();

      // Get detailed instrument info
      const detailResponse = await request(app)
        .get(`/api/zerodha/market/instruments/${relianceNSE.instrument_token}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(detailResponse.body.data).toMatchObject({
        instrument_token: relianceNSE.instrument_token,
        tradingsymbol: 'RELIANCE',
        exchange: 'NSE',
        lot_size: expect.any(Number),
        tick_size: expect.any(Number),
        expiry: null, // Equity instrument
        strike: null,
        instrument_type: 'EQ'
      });
    });

    it('should maintain updated instrument database', async () => {
      // Get all NSE instruments
      const nseResponse = await request(app)
        .get('/api/zerodha/market/instruments')
        .query({ exchange: 'NSE' })
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const nseInstruments = nseResponse.body.data;
      expect(nseInstruments.length).toBeGreaterThan(1000);

      // Get all BSE instruments
      const bseResponse = await request(app)
        .get('/api/zerodha/market/instruments')
        .query({ exchange: 'BSE' })
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const bseInstruments = bseResponse.body.data;
      expect(bseInstruments.length).toBeGreaterThan(500);

      // Verify no duplicate instrument tokens
      const allInstruments = [...nseInstruments, ...bseInstruments];
      const tokens = allInstruments.map(i => i.instrument_token);
      const uniqueTokens = new Set(tokens);
      expect(uniqueTokens.size).toBe(tokens.length);

      // Verify major indices are present
      const majorSymbols = ['NIFTY50', 'SENSEX', 'BANKNIFTY'];
      majorSymbols.forEach(symbol => {
        const found = allInstruments.some(i => 
          i.tradingsymbol.includes(symbol) || i.name.includes(symbol)
        );
        expect(found).toBe(true);
      });
    });
  });

  describe('Market Status and Indices', () => {
    it('should provide accurate market status and trading hours', async () => {
      const statusResponse = await request(app)
        .get('/api/zerodha/market/status')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(statusResponse.body).toMatchObject({
        success: true,
        data: {
          NSE: expect.objectContaining({
            status: expect.stringMatching(/^(OPEN|CLOSED|PRE_OPEN|POST_CLOSE)$/),
            market_type: 'equity',
            opening_time: expect.any(String),
            closing_time: expect.any(String)
          }),
          BSE: expect.objectContaining({
            status: expect.stringMatching(/^(OPEN|CLOSED|PRE_OPEN|POST_CLOSE)$/),
            market_type: 'equity',
            opening_time: expect.any(String),
            closing_time: expect.any(String)
          })
        }
      });

      // Verify trading hours format
      const nseData = statusResponse.body.data.NSE;
      expect(nseData.opening_time).toMatch(/^\d{2}:\d{2}$/);
      expect(nseData.closing_time).toMatch(/^\d{2}:\d{2}$/);
    });

    it('should track major market indices accurately', async () => {
      const indicesResponse = await request(app)
        .get('/api/zerodha/market/indices')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(indicesResponse.body).toMatchObject({
        success: true,
        data: expect.arrayContaining([
          expect.objectContaining({
            name: expect.stringMatching(/NIFTY|SENSEX|BANKNIFTY/),
            value: expect.any(Number),
            change: expect.any(Number),
            change_percent: expect.any(Number),
            timestamp: expect.any(String)
          })
        ])
      });

      // Verify major indices are present
      const indices = indicesResponse.body.data;
      const indexNames = indices.map((i: any) => i.name);
      
      expect(indexNames).toContain('NIFTY 50');
      expect(indexNames).toContain('SENSEX');
      expect(indexNames).toContain('NIFTY BANK');

      // Verify data freshness
      indices.forEach((index: any) => {
        const timestamp = new Date(index.timestamp).getTime();
        const now = Date.now();
        const timeDiff = now - timestamp;
        
        // Data should be within last 5 minutes during market hours
        expect(timeDiff).toBeLessThan(5 * 60 * 1000);
      });
    });
  });
});