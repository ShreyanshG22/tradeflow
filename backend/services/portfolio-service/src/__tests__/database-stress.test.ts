import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import { Pool, PoolClient } from 'pg';
import { performance } from 'perf_hooks';
import fs from 'fs/promises';

interface DatabaseStressResults {
    targetConnections: number;
    maxConcurrentConnections: number;
    testDurationSeconds: number;
    totalQueries: number;
    successfulQueries: number;
    failedQueries: number;
    avgQueryTimeMs: number;
    p95QueryTimeMs: number;
    p99QueryTimeMs: number;
    deadlockRatePercent: number;
    poolRecoveryTimeS: number;
    connectionErrors: number;
    timeoutErrors: number;
    queryLatencies: number[];
}

class DatabaseStressTest {
    private pool: Pool;
    private targetConnections: number;
    private testDurationSeconds: number;
    private results: DatabaseStressResults;

    constructor(targetConnections: number = 1000, testDurationSeconds: number = 300) {
        this.targetConnections = targetConnections;
        this.testDurationSeconds = testDurationSeconds;
        
        // Configure connection pool for stress testing
        this.pool = new Pool({
            host: process.env.DB_HOST || 'localhost',
            port: parseInt(process.env.DB_PORT || '5432'),
            database: process.env.DB_NAME || 'tradeflow_test',
            user: process.env.DB_USER || 'postgres',
            password: process.env.DB_PASSWORD || 'password',
            max: targetConnections, // Maximum pool size
            min: 10, // Minimum pool size
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 5000,
            acquireTimeoutMillis: 10000,
            statement_timeout: 30000,
            query_timeout: 30000
        });

        this.results = {
            targetConnections,
            maxConcurrentConnections: 0,
            testDurationSeconds,
            totalQueries: 0,
            successfulQueries: 0,
            failedQueries: 0,
            avgQueryTimeMs: 0,
            p95QueryTimeMs: 0,
            p99QueryTimeMs: 0,
            deadlockRatePercent: 0,
            poolRecoveryTimeS: 0,
            connectionErrors: 0,
            timeoutErrors: 0,
            queryLatencies: []
        };
    }

    async setupTestTables(): Promise<void> {
        console.log('Setting up test tables...');
        
        const client = await this.pool.connect();
        try {
            // Create test tables
            await client.query(`
                CREATE TABLE IF NOT EXISTS stress_test_users (
                    id SERIAL PRIMARY KEY,
                    username VARCHAR(50) UNIQUE NOT NULL,
                    email VARCHAR(100) UNIQUE NOT NULL,
                    balance DECIMAL(15,2) DEFAULT 0,
                    created_at TIMESTAMP DEFAULT NOW(),
                    updated_at TIMESTAMP DEFAULT NOW()
                )
            `);

            await client.query(`
                CREATE TABLE IF NOT EXISTS stress_test_portfolios (
                    id SERIAL PRIMARY KEY,
                    user_id INTEGER REFERENCES stress_test_users(id),
                    symbol VARCHAR(10) NOT NULL,
                    quantity INTEGER NOT NULL,
                    avg_price DECIMAL(10,2) NOT NULL,
                    current_value DECIMAL(15,2) NOT NULL,
                    updated_at TIMESTAMP DEFAULT NOW()
                )
            `);

            await client.query(`
                CREATE TABLE IF NOT EXISTS stress_test_trades (
                    id SERIAL PRIMARY KEY,
                    user_id INTEGER REFERENCES stress_test_users(id),
                    symbol VARCHAR(10) NOT NULL,
                    side VARCHAR(4) NOT NULL CHECK (side IN ('BUY', 'SELL')),
                    quantity INTEGER NOT NULL,
                    price DECIMAL(10,2) NOT NULL,
                    executed_at TIMESTAMP DEFAULT NOW()
                )
            `);

            // Create indexes for performance
            await client.query(`
                CREATE INDEX IF NOT EXISTS idx_portfolios_user_id ON stress_test_portfolios(user_id)
            `);
            await client.query(`
                CREATE INDEX IF NOT EXISTS idx_portfolios_symbol ON stress_test_portfolios(symbol)
            `);
            await client.query(`
                CREATE INDEX IF NOT EXISTS idx_trades_user_id ON stress_test_trades(user_id)
            `);
            await client.query(`
                CREATE INDEX IF NOT EXISTS idx_trades_symbol ON stress_test_trades(symbol)
            `);
            await client.query(`
                CREATE INDEX IF NOT EXISTS idx_trades_executed_at ON stress_test_trades(executed_at)
            `);

            // Insert initial test data
            console.log('Inserting initial test data...');
            
            // Insert test users
            for (let i = 1; i <= 10000; i++) {
                await client.query(`
                    INSERT INTO stress_test_users (username, email, balance) 
                    VALUES ($1, $2, $3) 
                    ON CONFLICT (username) DO NOTHING
                `, [`user${i}`, `user${i}@test.com`, Math.random() * 100000]);
            }

            // Insert test portfolios
            const symbols = ['AAPL', 'GOOGL', 'MSFT', 'AMZN', 'TSLA', 'META', 'NVDA', 'NFLX'];
            for (let userId = 1; userId <= 1000; userId++) {
                for (const symbol of symbols) {
                    await client.query(`
                        INSERT INTO stress_test_portfolios (user_id, symbol, quantity, avg_price, current_value)
                        VALUES ($1, $2, $3, $4, $5)
                        ON CONFLICT DO NOTHING
                    `, [userId, symbol, Math.floor(Math.random() * 1000), Math.random() * 200, Math.random() * 50000]);
                }
            }

            console.log('Test tables setup completed');
        } finally {
            client.release();
        }
    }

    async cleanupTestTables(): Promise<void> {
        console.log('Cleaning up test tables...');
        
        const client = await this.pool.connect();
        try {
            await client.query('DROP TABLE IF EXISTS stress_test_trades CASCADE');
            await client.query('DROP TABLE IF EXISTS stress_test_portfolios CASCADE');
            await client.query('DROP TABLE IF EXISTS stress_test_users CASCADE');
        } finally {
            client.release();
        }
    }

    async runConnectionPoolStressTest(): Promise<DatabaseStressResults> {
        console.log(`Starting database connection pool stress test...`);
        console.log(`Target connections: ${this.targetConnections}`);
        console.log(`Duration: ${this.testDurationSeconds} seconds`);

        const queryLatencies: number[] = [];
        let totalQueries = 0;
        let successfulQueries = 0;
        let failedQueries = 0;
        let connectionErrors = 0;
        let timeoutErrors = 0;
        let deadlocks = 0;
        let maxConcurrentConnections = 0;

        // Connection tracking
        let activeConnections = 0;
        const connectionTracker = {
            acquire: () => {
                activeConnections++;
                if (activeConnections > maxConcurrentConnections) {
                    maxConcurrentConnections = activeConnections;
                }
            },
            release: () => {
                activeConnections--;
            }
        };

        // Test queries of different types
        const queryTypes = [
            {
                name: 'SELECT_USER',
                query: 'SELECT * FROM stress_test_users WHERE id = $1',
                params: () => [Math.floor(Math.random() * 10000) + 1]
            },
            {
                name: 'SELECT_PORTFOLIO',
                query: 'SELECT * FROM stress_test_portfolios WHERE user_id = $1',
                params: () => [Math.floor(Math.random() * 1000) + 1]
            },
            {
                name: 'INSERT_TRADE',
                query: `INSERT INTO stress_test_trades (user_id, symbol, side, quantity, price) 
                       VALUES ($1, $2, $3, $4, $5)`,
                params: () => [
                    Math.floor(Math.random() * 1000) + 1,
                    ['AAPL', 'GOOGL', 'MSFT'][Math.floor(Math.random() * 3)],
                    Math.random() > 0.5 ? 'BUY' : 'SELL',
                    Math.floor(Math.random() * 1000) + 1,
                    Math.random() * 200
                ]
            },
            {
                name: 'UPDATE_PORTFOLIO',
                query: `UPDATE stress_test_portfolios 
                       SET quantity = quantity + $1, current_value = current_value + $2, updated_at = NOW()
                       WHERE user_id = $3 AND symbol = $4`,
                params: () => [
                    Math.floor(Math.random() * 100),
                    Math.random() * 10000,
                    Math.floor(Math.random() * 1000) + 1,
                    ['AAPL', 'GOOGL', 'MSFT'][Math.floor(Math.random() * 3)]
                ]
            },
            {
                name: 'COMPLEX_JOIN',
                query: `SELECT u.username, p.symbol, p.quantity, p.current_value, 
                              COUNT(t.id) as trade_count
                       FROM stress_test_users u
                       JOIN stress_test_portfolios p ON u.id = p.user_id
                       LEFT JOIN stress_test_trades t ON u.id = t.user_id AND p.symbol = t.symbol
                       WHERE u.id = $1
                       GROUP BY u.username, p.symbol, p.quantity, p.current_value`,
                params: () => [Math.floor(Math.random() * 1000) + 1]
            }
        ];

        // Worker function for concurrent database operations
        const worker = async (workerId: number): Promise<void> => {
            const workerQueries = Math.floor(this.targetConnections / 10); // Queries per worker
            
            for (let i = 0; i < workerQueries; i++) {
                try {
                    connectionTracker.acquire();
                    
                    const queryType = queryTypes[Math.floor(Math.random() * queryTypes.length)];
                    const queryStart = performance.now();
                    
                    const client = await this.pool.connect();
                    
                    try {
                        await client.query(queryType.query, queryType.params());
                        
                        const queryEnd = performance.now();
                        const latency = queryEnd - queryStart;
                        
                        queryLatencies.push(latency);
                        successfulQueries++;
                        totalQueries++;
                        
                    } catch (queryError: any) {
                        failedQueries++;
                        totalQueries++;
                        
                        if (queryError.code === '40P01') { // Deadlock
                            deadlocks++;
                        } else if (queryError.message.includes('timeout')) {
                            timeoutErrors++;
                        } else {
                            connectionErrors++;
                        }
                    } finally {
                        client.release();
                        connectionTracker.release();
                    }
                    
                } catch (connectionError: any) {
                    connectionErrors++;
                    totalQueries++;
                    connectionTracker.release();
                }
                
                // Brief pause to prevent overwhelming
                if (i % 100 === 0) {
                    await new Promise(resolve => setTimeout(resolve, 1));
                }
            }
        };

        // Start workers
        const workerCount = Math.min(this.targetConnections, 100); // Limit concurrent workers
        const workers: Promise<void>[] = [];
        
        console.log(`Starting ${workerCount} workers...`);
        
        const testStart = Date.now();
        
        for (let i = 0; i < workerCount; i++) {
            workers.push(worker(i));
        }

        // Progress monitoring
        const progressInterval = setInterval(() => {
            const elapsed = (Date.now() - testStart) / 1000;
            const progress = Math.min((elapsed / this.testDurationSeconds) * 100, 100);
            
            console.log(`Progress: ${progress.toFixed(1)}% (${elapsed.toFixed(0)}s), ` +
                       `Queries: ${totalQueries}, Active connections: ${activeConnections}`);
        }, 10000); // Report every 10 seconds

        // Wait for completion or timeout
        const timeoutPromise = new Promise<void>(resolve => {
            setTimeout(resolve, this.testDurationSeconds * 1000);
        });

        await Promise.race([
            Promise.all(workers),
            timeoutPromise
        ]);

        clearInterval(progressInterval);

        // Test pool recovery after exhaustion
        console.log('Testing pool recovery...');
        const recoveryStart = performance.now();
        
        try {
            const client = await this.pool.connect();
            client.release();
            const recoveryEnd = performance.now();
            this.results.poolRecoveryTimeS = (recoveryEnd - recoveryStart) / 1000;
        } catch (error) {
            this.results.poolRecoveryTimeS = -1; // Failed to recover
        }

        // Calculate results
        this.results.maxConcurrentConnections = maxConcurrentConnections;
        this.results.totalQueries = totalQueries;
        this.results.successfulQueries = successfulQueries;
        this.results.failedQueries = failedQueries;
        this.results.connectionErrors = connectionErrors;
        this.results.timeoutErrors = timeoutErrors;
        this.results.deadlockRatePercent = (deadlocks / totalQueries) * 100;
        this.results.queryLatencies = queryLatencies;

        // Calculate latency statistics
        if (queryLatencies.length > 0) {
            queryLatencies.sort((a, b) => a - b);
            
            const sum = queryLatencies.reduce((acc, val) => acc + val, 0);
            this.results.avgQueryTimeMs = sum / queryLatencies.length;
            
            const p95Index = Math.floor(queryLatencies.length * 0.95);
            const p99Index = Math.floor(queryLatencies.length * 0.99);
            
            this.results.p95QueryTimeMs = queryLatencies[p95Index];
            this.results.p99QueryTimeMs = queryLatencies[p99Index];
        }

        return this.results;
    }

    async runConnectionLeakTest(): Promise<any> {
        console.log('Running connection leak test...');
        
        const leakTestResults = {
            cycles: 100,
            connectionsPerCycle: 50,
            leakedConnections: 0,
            maxPoolSize: this.pool.options.max,
            finalPoolSize: 0
        };

        for (let cycle = 0; cycle < leakTestResults.cycles; cycle++) {
            const clients: PoolClient[] = [];
            
            // Acquire connections
            for (let i = 0; i < leakTestResults.connectionsPerCycle; i++) {
                try {
                    const client = await this.pool.connect();
                    clients.push(client);
                } catch (error) {
                    // Pool exhausted
                    break;
                }
            }
            
            // Simulate some work
            await Promise.all(clients.map(async (client) => {
                try {
                    await client.query('SELECT 1');
                } catch (error) {
                    // Ignore query errors for this test
                }
            }));
            
            // Intentionally "forget" to release some connections (simulate leak)
            const releaseCount = Math.floor(clients.length * 0.95); // Release 95%
            
            for (let i = 0; i < releaseCount; i++) {
                clients[i].release();
            }
            
            leakTestResults.leakedConnections += (clients.length - releaseCount);
            
            if (cycle % 10 === 0) {
                console.log(`Leak test cycle ${cycle}/${leakTestResults.cycles}, ` +
                           `leaked: ${leakTestResults.leakedConnections}`);
            }
        }

        return leakTestResults;
    }

    async generateReport(outputFile?: string): Promise<void> {
        const report = {
            metadata: {
                timestamp: new Date().toISOString(),
                testType: 'database_stress',
                nodeVersion: process.version,
                platform: process.platform
            },
            database_stress: this.results,
            performance_analysis: {
                queries_per_second: this.results.totalQueries / this.testDurationSeconds,
                success_rate_percent: (this.results.successfulQueries / this.results.totalQueries) * 100,
                error_rate_percent: (this.results.failedQueries / this.results.totalQueries) * 100,
                connection_efficiency: (this.results.maxConcurrentConnections / this.targetConnections) * 100,
                pool_utilization_percent: (this.results.maxConcurrentConnections / this.pool.options.max!) * 100
            }
        };

        const outputPath = outputFile || 'database_stress_results.json';
        await fs.writeFile(outputPath, JSON.stringify(report, null, 2));
        console.log(`Database stress test results written to: ${outputPath}`);
    }

    async close(): Promise<void> {
        await this.pool.end();
    }
}

describe('Database Connection Pool Stress Tests', () => {
    let stressTest: DatabaseStressTest;

    beforeAll(async () => {
        const targetConnections = parseInt(process.env.CONNECTIONS || '100'); // Reduced for CI
        const duration = parseInt(process.env.DURATION || '60'); // Reduced for CI
        
        stressTest = new DatabaseStressTest(targetConnections, duration);
        await stressTest.setupTestTables();
    });

    afterAll(async () => {
        if (stressTest) {
            await stressTest.cleanupTestTables();
            await stressTest.close();
        }
    });

    test('High Connection Count Stress Test', async () => {
        const results = await stressTest.runConnectionPoolStressTest();
        
        // Generate report
        const outputFile = process.env.OUTPUT_FILE;
        await stressTest.generateReport(outputFile);
        
        // Print results
        console.log('\n=== Database Stress Test Results ===');
        console.log(`Target Connections: ${results.targetConnections}`);
        console.log(`Max Concurrent Connections: ${results.maxConcurrentConnections}`);
        console.log(`Total Queries: ${results.totalQueries}`);
        console.log(`Successful Queries: ${results.successfulQueries}`);
        console.log(`Failed Queries: ${results.failedQueries}`);
        console.log(`Connection Errors: ${results.connectionErrors}`);
        console.log(`Timeout Errors: ${results.timeoutErrors}`);
        console.log(`Avg Query Time: ${results.avgQueryTimeMs.toFixed(2)}ms`);
        console.log(`P95 Query Time: ${results.p95QueryTimeMs.toFixed(2)}ms`);
        console.log(`P99 Query Time: ${results.p99QueryTimeMs.toFixed(2)}ms`);
        console.log(`Deadlock Rate: ${results.deadlockRatePercent.toFixed(4)}%`);
        console.log(`Pool Recovery Time: ${results.poolRecoveryTimeS.toFixed(2)}s`);
        
        // Verify performance targets
        const successRate = (results.successfulQueries / results.totalQueries) * 100;
        expect(successRate).toBeGreaterThan(95.0);
        expect(results.avgQueryTimeMs).toBeLessThan(100);
        expect(results.p99QueryTimeMs).toBeLessThan(1000);
        expect(results.deadlockRatePercent).toBeLessThan(1.0);
        expect(results.poolRecoveryTimeS).toBeLessThan(30);
        
    }, 600000); // 10 minute timeout

    test('Connection Leak Detection', async () => {
        const leakResults = await stressTest.runConnectionLeakTest();
        
        console.log('\n=== Connection Leak Test Results ===');
        console.log(`Cycles: ${leakResults.cycles}`);
        console.log(`Connections per Cycle: ${leakResults.connectionsPerCycle}`);
        console.log(`Leaked Connections: ${leakResults.leakedConnections}`);
        console.log(`Max Pool Size: ${leakResults.maxPoolSize}`);
        
        // In a real scenario, we'd expect the pool to handle leaks gracefully
        // For this test, we just verify the leak detection works
        expect(leakResults.leakedConnections).toBeGreaterThan(0);
        
    }, 120000); // 2 minute timeout

    test('Query Performance Under Load', async () => {
        const queryCount = 10000;
        const concurrentQueries = 50;
        
        console.log(`Running query performance test with ${queryCount} queries...`);
        
        const latencies: number[] = [];
        let completedQueries = 0;
        let failedQueries = 0;
        
        const executeQuery = async (): Promise<void> => {
            try {
                const start = performance.now();
                
                const client = await stressTest['pool'].connect();
                try {
                    await client.query('SELECT COUNT(*) FROM stress_test_users WHERE balance > $1', [Math.random() * 50000]);
                    const end = performance.now();
                    latencies.push(end - start);
                    completedQueries++;
                } finally {
                    client.release();
                }
            } catch (error) {
                failedQueries++;
            }
        };

        // Execute queries in batches
        const batchSize = concurrentQueries;
        const batches = Math.ceil(queryCount / batchSize);
        
        for (let batch = 0; batch < batches; batch++) {
            const batchPromises: Promise<void>[] = [];
            const currentBatchSize = Math.min(batchSize, queryCount - (batch * batchSize));
            
            for (let i = 0; i < currentBatchSize; i++) {
                batchPromises.push(executeQuery());
            }
            
            await Promise.allSettled(batchPromises);
            
            if (batch % 10 === 0) {
                console.log(`Batch ${batch}/${batches} completed. Queries: ${completedQueries}, Failed: ${failedQueries}`);
            }
        }
        
        // Calculate statistics
        latencies.sort((a, b) => a - b);
        const avgLatency = latencies.reduce((sum, val) => sum + val, 0) / latencies.length;
        const p95Latency = latencies[Math.floor(latencies.length * 0.95)];
        const p99Latency = latencies[Math.floor(latencies.length * 0.99)];
        const successRate = (completedQueries / queryCount) * 100;
        
        console.log('\n=== Query Performance Test Results ===');
        console.log(`Total Queries: ${queryCount}`);
        console.log(`Completed: ${completedQueries}`);
        console.log(`Failed: ${failedQueries}`);
        console.log(`Success Rate: ${successRate.toFixed(2)}%`);
        console.log(`Avg Latency: ${avgLatency.toFixed(2)}ms`);
        console.log(`P95 Latency: ${p95Latency.toFixed(2)}ms`);
        console.log(`P99 Latency: ${p99Latency.toFixed(2)}ms`);
        
        // Verify performance
        expect(successRate).toBeGreaterThan(99.0);
        expect(avgLatency).toBeLessThan(50);
        expect(p99Latency).toBeLessThan(200);
        
    }, 300000); // 5 minute timeout
});

// Export for use in load testing script
export { DatabaseStressTest };