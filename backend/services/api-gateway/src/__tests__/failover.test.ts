import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import { spawn, ChildProcess } from 'child_process';
import { performance } from 'perf_hooks';
import fs from 'fs/promises';
import axios from 'axios';
import { Pool } from 'pg';

interface FailoverTestResults {
    serviceRecoveryTimeS: number;
    databaseRecoveryTimeS: number;
    dataLossPercent: number;
    networkPartitionRecoveryS: number;
    cascadeFailureDetected: boolean;
    totalDowntimeS: number;
    requestsLostDuringFailover: number;
    requestsProcessedAfterRecovery: number;
    systemStabilityScore: number;
}

class FailoverTest {
    private results: FailoverTestResults;
    private processes: Map<string, ChildProcess> = new Map();
    private dbPool: Pool;

    constructor() {
        this.results = {
            serviceRecoveryTimeS: 0,
            databaseRecoveryTimeS: 0,
            dataLossPercent: 0,
            networkPartitionRecoveryS: 0,
            cascadeFailureDetected: false,
            totalDowntimeS: 0,
            requestsLostDuringFailover: 0,
            requestsProcessedAfterRecovery: 0,
            systemStabilityScore: 0
        };

        this.dbPool = new Pool({
            host: process.env.DB_HOST || 'localhost',
            port: parseInt(process.env.DB_PORT || '5432'),
            database: process.env.DB_NAME || 'tradeflow_test',
            user: process.env.DB_USER || 'postgres',
            password: process.env.DB_PASSWORD || 'password',
            max: 20,
            connectionTimeoutMillis: 5000
        });
    }

    async setupFailoverTest(): Promise<void> {
        console.log('Setting up failover test environment...');
        
        // Setup test data for data loss detection
        const client = await this.dbPool.connect();
        try {
            await client.query(`
                CREATE TABLE IF NOT EXISTS failover_test_data (
                    id SERIAL PRIMARY KEY,
                    data_value VARCHAR(100) NOT NULL,
                    created_at TIMESTAMP DEFAULT NOW()
                )
            `);

            // Insert baseline data
            for (let i = 1; i <= 1000; i++) {
                await client.query(
                    'INSERT INTO failover_test_data (data_value) VALUES ($1)',
                    [`baseline_data_${i}`]
                );
            }
        } finally {
            client.release();
        }
    }

    async cleanupFailoverTest(): Promise<void> {
        console.log('Cleaning up failover test environment...');
        
        const client = await this.dbPool.connect();
        try {
            await client.query('DROP TABLE IF EXISTS failover_test_data');
        } finally {
            client.release();
        }
    }

    async startService(serviceName: string, command: string, args: string[]): Promise<boolean> {
        return new Promise((resolve) => {
            console.log(`Starting service: ${serviceName}`);
            
            const process = spawn(command, args, {
                stdio: 'pipe',
                env: { ...process.env }
            });

            let started = false;
            const timeout = setTimeout(() => {
                if (!started) {
                    resolve(false);
                }
            }, 30000); // 30 second timeout

            process.stdout?.on('data', (data) => {
                const output = data.toString();
                if (output.includes('Server listening') || output.includes('started')) {
                    if (!started) {
                        started = true;
                        clearTimeout(timeout);
                        resolve(true);
                    }
                }
            });

            process.on('error', (error) => {
                console.error(`Service ${serviceName} error:`, error);
                if (!started) {
                    started = true;
                    clearTimeout(timeout);
                    resolve(false);
                }
            });

            this.processes.set(serviceName, process);
        });
    }

    async stopService(serviceName: string): Promise<boolean> {
        const process = this.processes.get(serviceName);
        if (!process) {
            return false;
        }

        return new Promise((resolve) => {
            const timeout = setTimeout(() => {
                process.kill('SIGKILL');
                resolve(true);
            }, 10000);

            process.on('exit', () => {
                clearTimeout(timeout);
                resolve(true);
            });

            process.kill('SIGTERM');
        });
    }

    async waitForServiceHealth(serviceUrl: string, timeoutMs: number = 60000): Promise<number> {
        const start = performance.now();
        const endTime = start + timeoutMs;

        while (performance.now() < endTime) {
            try {
                const response = await axios.get(`${serviceUrl}/health`, {
                    timeout: 5000
                });
                
                if (response.status === 200) {
                    return (performance.now() - start) / 1000; // Return recovery time in seconds
                }
            } catch (error) {
                // Service not ready yet
            }

            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        return -1; // Failed to recover within timeout
    }

    async waitForDatabaseHealth(timeoutMs: number = 60000): Promise<number> {
        const start = performance.now();
        const endTime = start + timeoutMs;

        while (performance.now() < endTime) {
            try {
                const client = await this.dbPool.connect();
                await client.query('SELECT 1');
                client.release();
                
                return (performance.now() - start) / 1000; // Return recovery time in seconds
            } catch (error) {
                // Database not ready yet
            }

            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        return -1; // Failed to recover within timeout
    }

    async measureDataLoss(): Promise<number> {
        try {
            const client = await this.dbPool.connect();
            try {
                const result = await client.query('SELECT COUNT(*) FROM failover_test_data');
                const currentCount = parseInt(result.rows[0].count);
                const expectedCount = 1000; // Baseline data count
                
                if (currentCount < expectedCount) {
                    return ((expectedCount - currentCount) / expectedCount) * 100;
                }
                
                return 0; // No data loss
            } finally {
                client.release();
            }
        } catch (error) {
            return 100; // Complete data loss (can't access database)
        }
    }

    async simulateNetworkPartition(durationMs: number): Promise<void> {
        console.log(`Simulating network partition for ${durationMs}ms...`);
        
        // In a real test, this would use network manipulation tools like tc or iptables
        // For this simulation, we'll just introduce artificial delays and failures
        
        // Simulate network issues by temporarily blocking connections
        const originalConnect = this.dbPool.connect;
        
        this.dbPool.connect = async () => {
            throw new Error('Network partition - connection refused');
        };

        await new Promise(resolve => setTimeout(resolve, durationMs));

        // Restore connectivity
        this.dbPool.connect = originalConnect;
    }

    async runServiceFailoverTest(): Promise<void> {
        console.log('Running service failover test...');

        // Start services
        const services = [
            { name: 'api-gateway', command: 'npm', args: ['run', 'start'] },
            { name: 'user-service', command: 'npm', args: ['run', 'start'] },
            { name: 'portfolio-service', command: 'npm', args: ['run', 'start'] }
        ];

        // Start all services
        for (const service of services) {
            const started = await this.startService(service.name, service.command, service.args);
            if (!started) {
                throw new Error(`Failed to start ${service.name}`);
            }
        }

        // Wait for all services to be healthy
        await new Promise(resolve => setTimeout(resolve, 10000));

        // Generate baseline load
        const loadGenerator = this.startLoadGeneration();

        // Simulate service failure
        console.log('Simulating API Gateway failure...');
        const failureStart = performance.now();
        
        await this.stopService('api-gateway');

        // Measure recovery time
        const recoveryStart = performance.now();
        
        // Restart service
        const restarted = await this.startService('api-gateway', 'npm', ['run', 'start']);
        if (!restarted) {
            throw new Error('Failed to restart API Gateway');
        }

        // Wait for service to be healthy
        const recoveryTime = await this.waitForServiceHealth('http://localhost:3000');
        
        if (recoveryTime > 0) {
            this.results.serviceRecoveryTimeS = recoveryTime;
            console.log(`Service recovered in ${recoveryTime.toFixed(2)} seconds`);
        } else {
            console.log('Service failed to recover within timeout');
            this.results.serviceRecoveryTimeS = -1;
        }

        // Stop load generation
        loadGenerator.stop();

        // Calculate total downtime
        const failureEnd = performance.now();
        this.results.totalDowntimeS = (failureEnd - failureStart) / 1000;

        // Stop all services
        for (const service of services) {
            await this.stopService(service.name);
        }
    }

    async runDatabaseFailoverTest(): Promise<void> {
        console.log('Running database failover test...');

        // Simulate database failure by stopping connections
        const failureStart = performance.now();
        
        // Close all connections
        await this.dbPool.end();

        // Simulate database restart delay
        await new Promise(resolve => setTimeout(resolve, 5000));

        // Recreate connection pool
        this.dbPool = new Pool({
            host: process.env.DB_HOST || 'localhost',
            port: parseInt(process.env.DB_PORT || '5432'),
            database: process.env.DB_NAME || 'tradeflow_test',
            user: process.env.DB_USER || 'postgres',
            password: process.env.DB_PASSWORD || 'password',
            max: 20,
            connectionTimeoutMillis: 5000
        });

        // Measure recovery time
        const recoveryTime = await this.waitForDatabaseHealth();
        
        if (recoveryTime > 0) {
            this.results.databaseRecoveryTimeS = recoveryTime;
            console.log(`Database recovered in ${recoveryTime.toFixed(2)} seconds`);
        } else {
            console.log('Database failed to recover within timeout');
            this.results.databaseRecoveryTimeS = -1;
        }

        // Measure data loss
        this.results.dataLossPercent = await this.measureDataLoss();
    }

    async runNetworkPartitionTest(): Promise<void> {
        console.log('Running network partition test...');

        const partitionStart = performance.now();
        
        // Simulate network partition for 10 seconds
        await this.simulateNetworkPartition(10000);

        // Measure recovery time after partition heals
        const recoveryTime = await this.waitForDatabaseHealth();
        
        if (recoveryTime > 0) {
            this.results.networkPartitionRecoveryS = recoveryTime;
            console.log(`Network partition recovered in ${recoveryTime.toFixed(2)} seconds`);
        } else {
            console.log('Network partition failed to recover within timeout');
            this.results.networkPartitionRecoveryS = -1;
        }
    }

    async runCascadeFailureTest(): Promise<void> {
        console.log('Running cascade failure test...');

        // Start services with dependencies
        const services = ['user-service', 'portfolio-service', 'api-gateway'];
        
        for (const service of services) {
            await this.startService(service, 'npm', ['run', 'start']);
        }

        // Wait for services to be ready
        await new Promise(resolve => setTimeout(resolve, 10000));

        // Fail the foundational service (user-service)
        console.log('Failing user-service to test cascade...');
        await this.stopService('user-service');

        // Monitor other services for cascade failures
        let cascadeDetected = false;
        const monitoringDuration = 30000; // 30 seconds
        const monitorStart = performance.now();

        while (performance.now() - monitorStart < monitoringDuration) {
            try {
                // Check if other services are still responding
                const response = await axios.get('http://localhost:3000/health', {
                    timeout: 2000
                });
                
                if (response.status !== 200) {
                    cascadeDetected = true;
                    break;
                }
            } catch (error) {
                cascadeDetected = true;
                break;
            }

            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        this.results.cascadeFailureDetected = cascadeDetected;
        console.log(`Cascade failure ${cascadeDetected ? 'detected' : 'not detected'}`);

        // Cleanup
        for (const service of services) {
            await this.stopService(service);
        }
    }

    startLoadGeneration(): { stop: () => void } {
        let running = true;
        let requestsLost = 0;
        let requestsProcessed = 0;

        const generateLoad = async () => {
            while (running) {
                try {
                    const response = await axios.get('http://localhost:3000/api/health', {
                        timeout: 5000
                    });
                    
                    if (response.status === 200) {
                        requestsProcessed++;
                    } else {
                        requestsLost++;
                    }
                } catch (error) {
                    requestsLost++;
                }

                await new Promise(resolve => setTimeout(resolve, 100)); // 10 RPS
            }
        };

        // Start load generation
        generateLoad();

        return {
            stop: () => {
                running = false;
                this.results.requestsLostDuringFailover = requestsLost;
                this.results.requestsProcessedAfterRecovery = requestsProcessed;
            }
        };
    }

    calculateSystemStabilityScore(): number {
        let score = 100;

        // Deduct points for slow recovery
        if (this.results.serviceRecoveryTimeS > 60) score -= 20;
        else if (this.results.serviceRecoveryTimeS > 30) score -= 10;

        if (this.results.databaseRecoveryTimeS > 120) score -= 20;
        else if (this.results.databaseRecoveryTimeS > 60) score -= 10;

        // Deduct points for data loss
        score -= this.results.dataLossPercent;

        // Deduct points for cascade failures
        if (this.results.cascadeFailureDetected) score -= 15;

        // Deduct points for network partition issues
        if (this.results.networkPartitionRecoveryS > 60) score -= 10;

        return Math.max(0, score);
    }

    async runFullFailoverTest(): Promise<FailoverTestResults> {
        console.log('Starting comprehensive failover and disaster recovery test...');

        try {
            await this.setupFailoverTest();

            // Run individual failover tests
            await this.runServiceFailoverTest();
            await this.runDatabaseFailoverTest();
            await this.runNetworkPartitionTest();
            await this.runCascadeFailureTest();

            // Calculate overall system stability score
            this.results.systemStabilityScore = this.calculateSystemStabilityScore();

        } finally {
            await this.cleanupFailoverTest();
            await this.dbPool.end();
        }

        return this.results;
    }

    async generateReport(outputFile?: string): Promise<void> {
        const report = {
            metadata: {
                timestamp: new Date().toISOString(),
                testType: 'failover_disaster_recovery',
                nodeVersion: process.version,
                platform: process.platform
            },
            failover: this.results,
            analysis: {
                overall_resilience: this.results.systemStabilityScore >= 80 ? 'Good' : 
                                   this.results.systemStabilityScore >= 60 ? 'Fair' : 'Poor',
                recovery_performance: this.results.serviceRecoveryTimeS < 30 ? 'Excellent' :
                                     this.results.serviceRecoveryTimeS < 60 ? 'Good' : 'Needs Improvement',
                data_integrity: this.results.dataLossPercent === 0 ? 'Perfect' :
                               this.results.dataLossPercent < 1 ? 'Good' : 'Critical Issue',
                cascade_resistance: !this.results.cascadeFailureDetected ? 'Good' : 'Needs Improvement'
            },
            recommendations: this.generateRecommendations()
        };

        const outputPath = outputFile || 'failover_results.json';
        await fs.writeFile(outputPath, JSON.stringify(report, null, 2));
        console.log(`Failover test results written to: ${outputPath}`);
    }

    private generateRecommendations(): string[] {
        const recommendations: string[] = [];

        if (this.results.serviceRecoveryTimeS > 60) {
            recommendations.push('Implement faster service restart mechanisms and health checks');
        }

        if (this.results.databaseRecoveryTimeS > 120) {
            recommendations.push('Consider database clustering or faster failover mechanisms');
        }

        if (this.results.dataLossPercent > 0) {
            recommendations.push('Implement better data replication and backup strategies');
        }

        if (this.results.cascadeFailureDetected) {
            recommendations.push('Implement circuit breakers and better service isolation');
        }

        if (this.results.networkPartitionRecoveryS > 60) {
            recommendations.push('Improve network partition handling and connection pooling');
        }

        if (recommendations.length === 0) {
            recommendations.push('System shows good resilience characteristics');
        }

        return recommendations;
    }
}

describe('Failover and Disaster Recovery Tests', () => {
    let failoverTest: FailoverTest;

    beforeAll(async () => {
        failoverTest = new FailoverTest();
    });

    afterAll(async () => {
        // Ensure all processes are cleaned up
        if (failoverTest) {
            // Cleanup is handled in the test methods
        }
    });

    test('Comprehensive Failover and Recovery Test', async () => {
        const results = await failoverTest.runFullFailoverTest();
        
        // Generate report
        const outputFile = process.env.OUTPUT_FILE;
        await failoverTest.generateReport(outputFile);
        
        // Print results
        console.log('\n=== Failover and Disaster Recovery Test Results ===');
        console.log(`Service Recovery Time: ${results.serviceRecoveryTimeS.toFixed(2)}s`);
        console.log(`Database Recovery Time: ${results.databaseRecoveryTimeS.toFixed(2)}s`);
        console.log(`Data Loss: ${results.dataLossPercent.toFixed(2)}%`);
        console.log(`Network Partition Recovery: ${results.networkPartitionRecoveryS.toFixed(2)}s`);
        console.log(`Cascade Failure Detected: ${results.cascadeFailureDetected ? 'Yes' : 'No'}`);
        console.log(`Total Downtime: ${results.totalDowntimeS.toFixed(2)}s`);
        console.log(`Requests Lost: ${results.requestsLostDuringFailover}`);
        console.log(`Requests Processed After Recovery: ${results.requestsProcessedAfterRecovery}`);
        console.log(`System Stability Score: ${results.systemStabilityScore.toFixed(1)}/100`);
        
        // Verify recovery targets
        expect(results.serviceRecoveryTimeS).toBeLessThan(60);
        expect(results.databaseRecoveryTimeS).toBeLessThan(120);
        expect(results.dataLossPercent).toBeLessThan(1.0);
        expect(results.systemStabilityScore).toBeGreaterThan(70);
        
    }, 600000); // 10 minute timeout

    test('Service Restart Performance', async () => {
        console.log('Testing service restart performance...');
        
        const restartTimes: number[] = [];
        const restartCount = 5;
        
        for (let i = 0; i < restartCount; i++) {
            console.log(`Restart test ${i + 1}/${restartCount}...`);
            
            const start = performance.now();
            
            // Start a simple service
            const started = await failoverTest['startService']('test-service', 'node', ['-e', 'console.log("started"); setTimeout(() => {}, 10000)']);
            
            if (started) {
                const end = performance.now();
                restartTimes.push((end - start) / 1000);
                
                // Stop the service
                await failoverTest['stopService']('test-service');
            }
            
            // Brief pause between restarts
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        // Calculate statistics
        const avgRestartTime = restartTimes.reduce((sum, time) => sum + time, 0) / restartTimes.length;
        const maxRestartTime = Math.max(...restartTimes);
        
        console.log(`Average restart time: ${avgRestartTime.toFixed(2)}s`);
        console.log(`Max restart time: ${maxRestartTime.toFixed(2)}s`);
        
        // Verify restart performance
        expect(avgRestartTime).toBeLessThan(10);
        expect(maxRestartTime).toBeLessThan(15);
        
    }, 120000); // 2 minute timeout
});

// Export for use in load testing script
export { FailoverTest };