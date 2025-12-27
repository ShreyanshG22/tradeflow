import { Pool } from 'pg';
import { performance } from 'perf_hooks';
import { TestDataManager } from '../setup/test-data-manager';
import { v4 as uuidv4 } from 'uuid';

describe('Database Performance Tests', () => {
  let testDataManager: TestDataManager;
  let db: Pool;
  let testUserIds: string[] = [];

  beforeAll(async () => {
    testDataManager = new TestDataManager();
    await testDataManager.setup();
    
    db = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 20, // Increase pool size for performance testing
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });
  });

  afterAll(async () => {
    // Cleanup test users
    for (const userId of testUserIds) {
      await testDataManager.cleanupTestUser(userId);
    }
    
    await testDataManager.cleanup();
    await db.end();
  });

  describe('Concurrent User Operations', () => {
    it('should handle multiple concurrent users efficiently', async () => {
      const userCount = 50;
      const positionsPerUser = 20;

      // Create test users
      const userCreationStart = performance.now();
      const userPromises = Array.from({ length: userCount }, async () => {
        const userId = await testDataManager.createTestUser();
        testUserIds.push(userId);
        return userId;
      });

      const userIds = await Promise.all(userPromises);
      const userCreationTime = performance.now() - userCreationStart;

      console.log(`User Creation Performance:
        Users: ${userCount}
        Time: ${userCreationTime.toFixed(2)}ms
        Rate: ${(userCount / userCreationTime * 1000).toFixed(2)} users/second`);

      // Create positions for all users concurrently
      const positionCreationStart = performance.now();
      const positionPromises = userIds.flatMap(userId =>
        Array.from({ length: positionsPerUser }, (_, i) =>
          testDataManager.createTestPosition(userId, {
            tradingsymbol: `STOCK${i}`,
            quantity: Math.floor(Math.random() * 100) + 1,
            average_price: Math.floor(Math.random() * 1000) + 100
          })
        )
      );

      await Promise.all(positionPromises);
      const positionCreationTime = performance.now() - positionCreationStart;

      console.log(`Position Creation Performance:
        Total Positions: ${userCount * positionsPerUser}
        Time: ${positionCreationTime.toFixed(2)}ms
        Rate: ${(userCount * positionsPerUser / positionCreationTime * 1000).toFixed(2)} positions/second`);

      // Test concurrent reads
      const readStart = performance.now();
      const readPromises = userIds.map(userId =>
        db.query('SELECT * FROM zerodha_positions WHERE user_id = $1', [userId])
      );

      const readResults = await Promise.all(readPromises);
      const readTime = performance.now() - readStart;

      console.log(`Concurrent Read Performance:
        Queries: ${userCount}
        Time: ${readTime.toFixed(2)}ms
        Rate: ${(userCount / readTime * 1000).toFixed(2)} queries/second`);

      // Verify results
      readResults.forEach((result, index) => {
        expect(result.rows).toHaveLength(positionsPerUser);
      });

      // Performance expectations
      expect(userCreationTime).toBeLessThan(10000); // 10 seconds
      expect(positionCreationTime).toBeLessThan(15000); // 15 seconds
      expect(readTime).toBeLessThan(5000); // 5 seconds
    });

    it('should handle high-volume order insertions', async () => {
      const userId = await testDataManager.createTestUser();
      testUserIds.push(userId);

      const orderCount = 1000;
      const batchSize = 100;
      const batches = Math.ceil(orderCount / batchSize);

      const insertStart = performance.now();

      for (let batch = 0; batch < batches; batch++) {
        const batchStart = batch * batchSize;
        const batchEnd = Math.min(batchStart + batchSize, orderCount);
        
        const batchPromises = [];
        for (let i = batchStart; i < batchEnd; i++) {
          const orderPromise = db.query(`
            INSERT INTO zerodha_orders (
              user_id, order_id, exchange, tradingsymbol, transaction_type,
              quantity, product, order_type, status, order_timestamp
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
          `, [
            userId,
            `ORDER_${i}`,
            'NSE',
            `STOCK${i % 100}`,
            Math.random() > 0.5 ? 'BUY' : 'SELL',
            Math.floor(Math.random() * 100) + 1,
            'CNC',
            'MARKET',
            'COMPLETE'
          ]);
          
          batchPromises.push(orderPromise);
        }

        await Promise.all(batchPromises);
      }

      const insertTime = performance.now() - insertStart;

      console.log(`High-Volume Order Insertion:
        Orders: ${orderCount}
        Batch Size: ${batchSize}
        Total Time: ${insertTime.toFixed(2)}ms
        Rate: ${(orderCount / insertTime * 1000).toFixed(2)} orders/second`);

      // Verify all orders were inserted
      const countResult = await db.query(
        'SELECT COUNT(*) FROM zerodha_orders WHERE user_id = $1',
        [userId]
      );
      expect(parseInt(countResult.rows[0].count)).toBe(orderCount);

      // Performance expectation
      expect(insertTime).toBeLessThan(30000); // 30 seconds
      expect(orderCount / insertTime * 1000).toBeGreaterThan(50); // At least 50 orders/second
    });
  });

  describe('Complex Query Performance', () => {
    it('should handle portfolio aggregation queries efficiently', async () => {
      const userId = await testDataManager.createTestUser();
      testUserIds.push(userId);

      // Create diverse portfolio data
      const positions = Array.from({ length: 200 }, (_, i) => ({
        tradingsymbol: `STOCK${i}`,
        quantity: Math.floor(Math.random() * 1000) + 1,
        average_price: Math.floor(Math.random() * 5000) + 100,
        sector: ['Technology', 'Banking', 'Pharma', 'Auto', 'FMCG'][i % 5]
      }));

      // Insert positions
      for (const pos of positions) {
        await testDataManager.createTestPosition(userId, pos);
      }

      // Test complex aggregation query
      const queryStart = performance.now();

      const portfolioQuery = `
        SELECT 
          COUNT(*) as total_positions,
          SUM(quantity * average_price) as total_investment,
          SUM(quantity * last_price) as current_value,
          SUM(unrealised_pnl) as total_pnl,
          AVG(unrealised_pnl) as avg_pnl,
          sector,
          COUNT(*) as sector_count,
          SUM(quantity * last_price) as sector_value
        FROM zerodha_positions 
        WHERE user_id = $1 
        GROUP BY sector
        ORDER BY sector_value DESC
      `;

      const result = await db.query(portfolioQuery, [userId]);
      const queryTime = performance.now() - queryStart;

      console.log(`Portfolio Aggregation Performance:
        Positions: ${positions.length}
        Query Time: ${queryTime.toFixed(2)}ms
        Sectors: ${result.rows.length}`);

      expect(result.rows.length).toBe(5); // 5 sectors
      expect(queryTime).toBeLessThan(500); // Under 500ms

      // Test with indexes
      const indexedQueryStart = performance.now();
      
      const indexedQuery = `
        SELECT p.*, u.username 
        FROM zerodha_positions p
        JOIN users u ON p.user_id = u.id
        WHERE p.user_id = $1 
        AND p.unrealised_pnl > 0
        ORDER BY p.unrealised_pnl DESC
        LIMIT 10
      `;

      const indexedResult = await db.query(indexedQuery, [userId]);
      const indexedQueryTime = performance.now() - indexedQueryStart;

      console.log(`Indexed Query Performance:
        Query Time: ${indexedQueryTime.toFixed(2)}ms
        Results: ${indexedResult.rows.length}`);

      expect(indexedQueryTime).toBeLessThan(100); // Should be very fast with indexes
    });

    it('should handle historical data queries efficiently', async () => {
      const userId = await testDataManager.createTestUser();
      testUserIds.push(userId);

      // Create historical trade data
      const tradeCount = 5000;
      const trades = Array.from({ length: tradeCount }, (_, i) => {
        const date = new Date();
        date.setDate(date.getDate() - Math.floor(i / 50)); // Spread over 100 days
        
        return {
          symbol: `STOCK${i % 100}`,
          pnl: (Math.random() - 0.5) * 1000,
          date: date.toISOString().split('T')[0]
        };
      });

      // Insert trades in batches
      const batchSize = 500;
      for (let i = 0; i < trades.length; i += batchSize) {
        const batch = trades.slice(i, i + batchSize);
        const promises = batch.map(trade =>
          testDataManager.createHistoricalTrade(userId, trade)
        );
        await Promise.all(promises);
      }

      // Test time-series queries
      const timeSeriesStart = performance.now();

      const timeSeriesQuery = `
        SELECT 
          DATE_TRUNC('week', trade_date) as week,
          COUNT(*) as trade_count,
          SUM(pnl) as weekly_pnl,
          AVG(pnl) as avg_pnl,
          STDDEV(pnl) as pnl_volatility
        FROM zerodha_trades 
        WHERE user_id = $1 
        AND trade_date >= CURRENT_DATE - INTERVAL '90 days'
        GROUP BY DATE_TRUNC('week', trade_date)
        ORDER BY week DESC
      `;

      const timeSeriesResult = await db.query(timeSeriesQuery, [userId]);
      const timeSeriesTime = performance.now() - timeSeriesStart;

      console.log(`Time Series Query Performance:
        Total Trades: ${tradeCount}
        Query Time: ${timeSeriesTime.toFixed(2)}ms
        Weeks: ${timeSeriesResult.rows.length}`);

      expect(timeSeriesTime).toBeLessThan(1000); // Under 1 second

      // Test performance analytics query
      const analyticsStart = performance.now();

      const analyticsQuery = `
        WITH trade_stats AS (
          SELECT 
            tradingsymbol,
            COUNT(*) as trade_count,
            SUM(CASE WHEN pnl > 0 THEN 1 ELSE 0 END) as winning_trades,
            SUM(pnl) as total_pnl,
            AVG(pnl) as avg_pnl,
            MAX(pnl) as best_trade,
            MIN(pnl) as worst_trade
          FROM zerodha_trades 
          WHERE user_id = $1
          GROUP BY tradingsymbol
        )
        SELECT 
          *,
          (winning_trades::float / trade_count * 100) as win_rate,
          (total_pnl / ABS(worst_trade)) as profit_factor
        FROM trade_stats
        WHERE trade_count >= 5
        ORDER BY total_pnl DESC
        LIMIT 20
      `;

      const analyticsResult = await db.query(analyticsQuery, [userId]);
      const analyticsTime = performance.now() - analyticsStart;

      console.log(`Analytics Query Performance:
        Query Time: ${analyticsTime.toFixed(2)}ms
        Top Performers: ${analyticsResult.rows.length}`);

      expect(analyticsTime).toBeLessThan(2000); // Under 2 seconds
    });
  });

  describe('Connection Pool Performance', () => {
    it('should handle connection pool exhaustion gracefully', async () => {
      const maxConnections = 20; // Pool size
      const excessConnections = 30; // More than pool size

      const connectionPromises = Array.from({ length: excessConnections }, async (_, i) => {
        const startTime = performance.now();
        
        try {
          const client = await db.connect();
          
          // Hold connection for a short time
          await new Promise(resolve => setTimeout(resolve, 100));
          
          // Execute a simple query
          const result = await client.query('SELECT $1 as connection_id', [i]);
          
          client.release();
          
          const endTime = performance.now();
          return {
            connectionId: i,
            success: true,
            time: endTime - startTime,
            result: result.rows[0].connection_id
          };
        } catch (error) {
          const endTime = performance.now();
          return {
            connectionId: i,
            success: false,
            time: endTime - startTime,
            error: error.message
          };
        }
      });

      const results = await Promise.all(connectionPromises);
      
      const successfulConnections = results.filter(r => r.success);
      const failedConnections = results.filter(r => !r.success);
      const avgConnectionTime = successfulConnections.reduce((sum, r) => sum + r.time, 0) / successfulConnections.length;

      console.log(`Connection Pool Performance:
        Requested Connections: ${excessConnections}
        Successful: ${successfulConnections.length}
        Failed: ${failedConnections.length}
        Average Connection Time: ${avgConnectionTime.toFixed(2)}ms`);

      // Most connections should succeed (pool should handle queuing)
      expect(successfulConnections.length).toBeGreaterThan(excessConnections * 0.8);
      expect(avgConnectionTime).toBeLessThan(1000); // Should not take too long
    });

    it('should maintain performance under sustained load', async () => {
      const duration = 10000; // 10 seconds
      const concurrency = 10;
      const startTime = performance.now();
      
      let totalQueries = 0;
      let successfulQueries = 0;
      let errors = 0;

      const workers = Array.from({ length: concurrency }, async (_, workerId) => {
        while (performance.now() - startTime < duration) {
          try {
            totalQueries++;
            
            const result = await db.query(`
              SELECT 
                COUNT(*) as count,
                AVG(average_price) as avg_price
              FROM zerodha_positions 
              WHERE created_at >= CURRENT_DATE - INTERVAL '1 day'
            `);
            
            successfulQueries++;
            
            // Small delay to prevent overwhelming
            await new Promise(resolve => setTimeout(resolve, 10));
          } catch (error) {
            errors++;
          }
        }
      });

      await Promise.all(workers);
      
      const actualDuration = performance.now() - startTime;
      const queryRate = successfulQueries / (actualDuration / 1000);
      const errorRate = (errors / totalQueries) * 100;

      console.log(`Sustained Load Performance:
        Duration: ${actualDuration.toFixed(2)}ms
        Total Queries: ${totalQueries}
        Successful: ${successfulQueries}
        Errors: ${errors}
        Query Rate: ${queryRate.toFixed(2)} queries/second
        Error Rate: ${errorRate.toFixed(2)}%`);

      expect(queryRate).toBeGreaterThan(50); // At least 50 queries/second
      expect(errorRate).toBeLessThan(5); // Less than 5% error rate
    });
  });

  describe('Transaction Performance', () => {
    it('should handle complex transactions efficiently', async () => {
      const userId = await testDataManager.createTestUser();
      testUserIds.push(userId);

      const transactionCount = 100;
      const transactionTimes: number[] = [];

      for (let i = 0; i < transactionCount; i++) {
        const startTime = performance.now();
        
        const client = await db.connect();
        
        try {
          await client.query('BEGIN');
          
          // Insert order
          const orderResult = await client.query(`
            INSERT INTO zerodha_orders (
              user_id, order_id, exchange, tradingsymbol, transaction_type,
              quantity, product, order_type, status, order_timestamp
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
            RETURNING id
          `, [
            userId, `TXN_ORDER_${i}`, 'NSE', `STOCK${i}`, 'BUY',
            10, 'CNC', 'MARKET', 'COMPLETE'
          ]);

          // Update or insert position
          await client.query(`
            INSERT INTO zerodha_positions (
              user_id, tradingsymbol, exchange, quantity, average_price, 
              last_price, unrealised_pnl, position_date
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_DATE)
            ON CONFLICT (user_id, tradingsymbol, exchange, position_date)
            DO UPDATE SET 
              quantity = zerodha_positions.quantity + EXCLUDED.quantity,
              average_price = (zerodha_positions.average_price * zerodha_positions.quantity + EXCLUDED.average_price * EXCLUDED.quantity) / (zerodha_positions.quantity + EXCLUDED.quantity),
              updated_at = NOW()
          `, [userId, `STOCK${i}`, 'NSE', 10, 1000 + i, 1000 + i, 0]);

          // Insert trade record
          await client.query(`
            INSERT INTO zerodha_trades (
              user_id, tradingsymbol, pnl, trade_date
            ) VALUES ($1, $2, $3, CURRENT_DATE)
          `, [userId, `STOCK${i}`, Math.random() * 100]);

          await client.query('COMMIT');
          
          const endTime = performance.now();
          transactionTimes.push(endTime - startTime);
          
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        } finally {
          client.release();
        }
      }

      const avgTransactionTime = transactionTimes.reduce((a, b) => a + b, 0) / transactionTimes.length;
      const maxTransactionTime = Math.max(...transactionTimes);
      const transactionRate = transactionCount / (transactionTimes.reduce((a, b) => a + b, 0) / 1000);

      console.log(`Transaction Performance:
        Transactions: ${transactionCount}
        Average Time: ${avgTransactionTime.toFixed(2)}ms
        Maximum Time: ${maxTransactionTime.toFixed(2)}ms
        Transaction Rate: ${transactionRate.toFixed(2)} transactions/second`);

      expect(avgTransactionTime).toBeLessThan(100); // Under 100ms average
      expect(maxTransactionTime).toBeLessThan(500); // Under 500ms maximum
      expect(transactionRate).toBeGreaterThan(20); // At least 20 transactions/second
    });
  });
});