import WebSocket from 'ws';
import { performance } from 'perf_hooks';
import { createTestApp } from '../setup/test-app';
import { TestDataManager } from '../setup/test-data-manager';
import { ZerodhaTestClient } from '../setup/zerodha-test-client';

describe('Zerodha WebSocket Performance Tests', () => {
  let app: any;
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

  describe('WebSocket Connection Scalability', () => {
    it('should handle multiple concurrent WebSocket connections', async () => {
      const connectionCount = 50;
      const connections: WebSocket[] = [];
      const connectionTimes: number[] = [];
      const wsUrl = `ws://localhost:${process.env.TEST_PORT}/ws/market-data`;

      try {
        // Create multiple connections
        const connectionPromises = Array.from({ length: connectionCount }, async (_, i) => {
          const startTime = performance.now();
          
          const ws = new WebSocket(wsUrl, {
            headers: { Authorization: `Bearer ${accessToken}` }
          });

          return new Promise<WebSocket>((resolve, reject) => {
            ws.on('open', () => {
              const endTime = performance.now();
              connectionTimes.push(endTime - startTime);
              connections.push(ws);
              resolve(ws);
            });

            ws.on('error', reject);

            setTimeout(() => {
              reject(new Error(`Connection ${i} timeout`));
            }, 5000);
          });
        });

        const connectedSockets = await Promise.all(connectionPromises);

        // Verify all connections are established
        expect(connectedSockets).toHaveLength(connectionCount);

        const avgConnectionTime = connectionTimes.reduce((a, b) => a + b, 0) / connectionTimes.length;
        const maxConnectionTime = Math.max(...connectionTimes);

        console.log(`WebSocket Connection Performance:
          Connections: ${connectionCount}
          Average Connection Time: ${avgConnectionTime.toFixed(2)}ms
          Maximum Connection Time: ${maxConnectionTime.toFixed(2)}ms`);

        // Connection times should be reasonable
        expect(avgConnectionTime).toBeLessThan(100);
        expect(maxConnectionTime).toBeLessThan(500);

        // Test message broadcasting to all connections
        const messagePromises = connectedSockets.map((ws, i) => {
          return new Promise<void>((resolve) => {
            ws.on('message', (data) => {
              const message = JSON.parse(data.toString());
              if (message.type === 'tick') {
                resolve();
              }
            });

            // Subscribe to market data
            ws.send(JSON.stringify({
              action: 'subscribe',
              instruments: ['NSE:RELIANCE']
            }));
          });
        });

        // Simulate market data broadcast
        setTimeout(() => {
          zerodhaClient.updateMarketPrice('NSE:RELIANCE', 2550);
        }, 100);

        // Wait for all connections to receive the message
        await Promise.all(messagePromises);

        console.log(`Successfully broadcasted to ${connectionCount} connections`);

      } finally {
        // Clean up connections
        connections.forEach(ws => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.close();
          }
        });
      }
    });

    it('should handle high-frequency message broadcasting', async () => {
      const wsUrl = `ws://localhost:${process.env.TEST_PORT}/ws/market-data`;
      const ws = new WebSocket(wsUrl, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });

      const messageCount = 1000;
      const receivedMessages: any[] = [];
      const latencies: number[] = [];

      return new Promise<void>((resolve, reject) => {
        ws.on('open', () => {
          // Subscribe to multiple instruments
          ws.send(JSON.stringify({
            action: 'subscribe',
            instruments: ['NSE:RELIANCE', 'NSE:INFY', 'NSE:TCS', 'NSE:HDFCBANK']
          }));

          // Start sending high-frequency updates
          let sentCount = 0;
          const interval = setInterval(() => {
            if (sentCount >= messageCount) {
              clearInterval(interval);
              return;
            }

            const sendTime = performance.now();
            const price = 2500 + (Math.random() - 0.5) * 100;
            
            // Simulate price update with timestamp
            zerodhaClient.updateMarketPrice('NSE:RELIANCE', price);
            
            sentCount++;
          }, 10); // Send every 10ms
        });

        ws.on('message', (data) => {
          const receiveTime = performance.now();
          const message = JSON.parse(data.toString());
          
          if (message.type === 'tick') {
            receivedMessages.push(message);
            
            // Calculate latency if timestamp is available
            if (message.timestamp) {
              const sendTime = new Date(message.timestamp).getTime();
              const latency = receiveTime - sendTime;
              latencies.push(latency);
            }

            // Check if we've received enough messages
            if (receivedMessages.length >= messageCount * 0.8) { // Allow for some message loss
              const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
              const maxLatency = Math.max(...latencies);
              const messageRate = receivedMessages.length / ((receiveTime - performance.now()) / 1000);

              console.log(`High-Frequency Broadcasting Performance:
                Messages Sent: ${messageCount}
                Messages Received: ${receivedMessages.length}
                Message Loss: ${((messageCount - receivedMessages.length) / messageCount * 100).toFixed(2)}%
                Average Latency: ${avgLatency.toFixed(2)}ms
                Maximum Latency: ${maxLatency.toFixed(2)}ms`);

              // Performance requirements
              expect(avgLatency).toBeLessThan(100); // Average latency under 100ms
              expect(maxLatency).toBeLessThan(500); // Max latency under 500ms
              expect(receivedMessages.length / messageCount).toBeGreaterThan(0.7); // Less than 30% message loss

              ws.close();
              resolve();
            }
          }
        });

        ws.on('error', reject);

        // Timeout after 30 seconds
        setTimeout(() => {
          ws.close();
          reject(new Error('High-frequency test timeout'));
        }, 30000);
      });
    });

    it('should maintain performance under subscription load', async () => {
      const wsUrl = `ws://localhost:${process.env.TEST_PORT}/ws/market-data`;
      const ws = new WebSocket(wsUrl, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });

      const instrumentCount = 500;
      const instruments = Array.from({ length: instrumentCount }, (_, i) => `NSE:STOCK${i}`);

      return new Promise<void>((resolve, reject) => {
        let subscriptionTime: number;

        ws.on('open', () => {
          subscriptionTime = performance.now();
          
          // Subscribe to many instruments
          ws.send(JSON.stringify({
            action: 'subscribe',
            instruments: instruments
          }));
        });

        ws.on('message', (data) => {
          const message = JSON.parse(data.toString());
          
          if (message.type === 'subscription_success') {
            const endTime = performance.now();
            const totalSubscriptionTime = endTime - subscriptionTime;

            console.log(`Subscription Performance:
              Instruments: ${instrumentCount}
              Subscription Time: ${totalSubscriptionTime.toFixed(2)}ms
              Rate: ${(instrumentCount / totalSubscriptionTime * 1000).toFixed(2)} subscriptions/second`);

            // Subscription should complete within reasonable time
            expect(totalSubscriptionTime).toBeLessThan(5000); // 5 seconds max
            expect(message.subscribed_count).toBe(instrumentCount);

            ws.close();
            resolve();
          }
        });

        ws.on('error', reject);

        setTimeout(() => {
          ws.close();
          reject(new Error('Subscription test timeout'));
        }, 10000);
      });
    });
  });

  describe('WebSocket Memory and Resource Management', () => {
    it('should handle connection churn efficiently', async () => {
      const iterations = 20;
      const connectionsPerIteration = 10;
      const wsUrl = `ws://localhost:${process.env.TEST_PORT}/ws/market-data`;

      const initialMemory = process.memoryUsage();

      for (let i = 0; i < iterations; i++) {
        const connections: WebSocket[] = [];

        // Create connections
        const connectionPromises = Array.from({ length: connectionsPerIteration }, () => {
          const ws = new WebSocket(wsUrl, {
            headers: { Authorization: `Bearer ${accessToken}` }
          });

          connections.push(ws);

          return new Promise<void>((resolve, reject) => {
            ws.on('open', () => {
              ws.send(JSON.stringify({
                action: 'subscribe',
                instruments: ['NSE:RELIANCE']
              }));
              resolve();
            });

            ws.on('error', reject);

            setTimeout(() => reject(new Error('Connection timeout')), 2000);
          });
        });

        await Promise.all(connectionPromises);

        // Wait a bit for activity
        await new Promise(resolve => setTimeout(resolve, 100));

        // Close all connections
        connections.forEach(ws => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.close();
          }
        });

        // Wait for cleanup
        await new Promise(resolve => setTimeout(resolve, 100));

        // Force garbage collection if available
        if (global.gc && i % 5 === 0) {
          global.gc();
        }
      }

      // Final garbage collection
      if (global.gc) {
        global.gc();
      }

      const finalMemory = process.memoryUsage();
      const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;
      const memoryIncreasePercent = (memoryIncrease / initialMemory.heapUsed) * 100;

      console.log(`Connection Churn Memory Usage:
        Iterations: ${iterations}
        Connections per iteration: ${connectionsPerIteration}
        Total connections created: ${iterations * connectionsPerIteration}
        Memory increase: ${(memoryIncrease / 1024 / 1024).toFixed(2)} MB (${memoryIncreasePercent.toFixed(2)}%)`);

      // Memory increase should be minimal
      expect(memoryIncreasePercent).toBeLessThan(25);
    });

    it('should handle message queue backpressure', async () => {
      const wsUrl = `ws://localhost:${process.env.TEST_PORT}/ws/market-data`;
      const ws = new WebSocket(wsUrl, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });

      let messagesReceived = 0;
      let backpressureDetected = false;

      return new Promise<void>((resolve, reject) => {
        ws.on('open', () => {
          ws.send(JSON.stringify({
            action: 'subscribe',
            instruments: ['NSE:RELIANCE']
          }));

          // Generate rapid price updates to create backpressure
          let updateCount = 0;
          const rapidUpdates = setInterval(() => {
            if (updateCount >= 1000) {
              clearInterval(rapidUpdates);
              return;
            }

            zerodhaClient.updateMarketPrice('NSE:RELIANCE', 2500 + Math.random() * 100);
            updateCount++;
          }, 1); // Very rapid updates
        });

        // Simulate slow message processing
        ws.on('message', (data) => {
          messagesReceived++;
          
          // Simulate processing delay
          const processingDelay = Math.random() * 50; // 0-50ms delay
          setTimeout(() => {
            // Check for backpressure indicators
            if (ws.bufferedAmount > 1024 * 1024) { // 1MB buffer
              backpressureDetected = true;
            }

            if (messagesReceived >= 100) { // Stop after receiving enough messages
              console.log(`Backpressure Test Results:
                Messages Received: ${messagesReceived}
                Backpressure Detected: ${backpressureDetected}
                Final Buffer Size: ${ws.bufferedAmount} bytes`);

              // System should handle backpressure gracefully
              expect(ws.bufferedAmount).toBeLessThan(10 * 1024 * 1024); // Less than 10MB
              
              ws.close();
              resolve();
            }
          }, processingDelay);
        });

        ws.on('error', reject);

        setTimeout(() => {
          ws.close();
          reject(new Error('Backpressure test timeout'));
        }, 15000);
      });
    });
  });

  describe('WebSocket Error Recovery Performance', () => {
    it('should reconnect quickly after connection loss', async () => {
      const wsUrl = `ws://localhost:${process.env.TEST_PORT}/ws/market-data`;
      let ws = new WebSocket(wsUrl, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });

      let reconnectionTime: number;
      let reconnected = false;

      return new Promise<void>((resolve, reject) => {
        ws.on('open', () => {
          if (!reconnected) {
            // First connection - simulate disconnect after a short time
            setTimeout(() => {
              reconnectionTime = performance.now();
              ws.terminate(); // Force disconnect
              
              // Attempt reconnection
              setTimeout(() => {
                ws = new WebSocket(wsUrl, {
                  headers: { Authorization: `Bearer ${accessToken}` }
                });

                ws.on('open', () => {
                  const endTime = performance.now();
                  const totalReconnectionTime = endTime - reconnectionTime;

                  console.log(`Reconnection Performance:
                    Reconnection Time: ${totalReconnectionTime.toFixed(2)}ms`);

                  // Reconnection should be fast
                  expect(totalReconnectionTime).toBeLessThan(2000); // Under 2 seconds

                  reconnected = true;
                  ws.close();
                  resolve();
                });

                ws.on('error', reject);
              }, 100); // Small delay before reconnection
            }, 100);
          }
        });

        ws.on('error', (error) => {
          if (!reconnected) {
            // Expected error during forced disconnect
            return;
          }
          reject(error);
        });

        setTimeout(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.close();
          }
          reject(new Error('Reconnection test timeout'));
        }, 10000);
      });
    });
  });
});