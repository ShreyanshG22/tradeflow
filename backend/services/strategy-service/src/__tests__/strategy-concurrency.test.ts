import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import { Worker } from 'worker_threads';
import { performance } from 'perf_hooks';
import fs from 'fs/promises';
import path from 'path';
import { EventEmitter } from 'events';

// Mock strategy execution engine
class MockStrategyEngine extends EventEmitter {
    private strategies: Map<string, any> = new Map();
    private isRunning: boolean = false;
    private executionInterval: NodeJS.Timeout | null = null;

    async startStrategy(strategyId: string, config: any): Promise<boolean> {
        try {
            this.strategies.set(strategyId, {
                id: strategyId,
                config,
                status: 'running',
                startTime: Date.now(),
                signalCount: 0,
                lastSignalTime: 0
            });

            this.emit('strategyStarted', strategyId);
            return true;
        } catch (error) {
            this.emit('strategyError', strategyId, error);
            return false;
        }
    }

    async stopStrategy(strategyId: string): Promise<boolean> {
        try {
            const strategy = this.strategies.get(strategyId);
            if (strategy) {
                strategy.status = 'stopped';
                strategy.stopTime = Date.now();
                this.emit('strategyStopped', strategyId);
            }
            return true;
        } catch (error) {
            this.emit('strategyError', strategyId, error);
            return false;
        }
    }

    startExecution(): void {
        if (this.isRunning) return;
        
        this.isRunning = true;
        this.executionInterval = setInterval(() => {
            this.executeStrategies();
        }, 10); // Execute every 10ms for high frequency
    }

    stopExecution(): void {
        if (!this.isRunning) return;
        
        this.isRunning = false;
        if (this.executionInterval) {
            clearInterval(this.executionInterval);
            this.executionInterval = null;
        }
    }

    private executeStrategies(): void {
        const now = Date.now();
        
        for (const [strategyId, strategy] of this.strategies) {
            if (strategy.status === 'running') {
                // Simulate strategy signal processing
                const processingStart = performance.now();
                
                // Simulate some computation
                this.simulateStrategyLogic();
                
                const processingEnd = performance.now();
                const latency = processingEnd - processingStart;
                
                strategy.signalCount++;
                strategy.lastSignalTime = now;
                strategy.lastLatency = latency;
                
                this.emit('strategySignal', strategyId, {
                    timestamp: now,
                    latency,
                    signalCount: strategy.signalCount
                });
            }
        }
    }

    private simulateStrategyLogic(): void {
        // Simulate CPU-intensive strategy calculations
        let sum = 0;
        for (let i = 0; i < 1000; i++) {
            sum += Math.random() * Math.sin(i) * Math.cos(i);
        }
    }

    getRunningStrategies(): number {
        let count = 0;
        for (const strategy of this.strategies.values()) {
            if (strategy.status === 'running') {
                count++;
            }
        }
        return count;
    }

    getStrategyStats(strategyId: string): any {
        return this.strategies.get(strategyId);
    }

    getAllStrategies(): Map<string, any> {
        return new Map(this.strategies);
    }
}

interface ConcurrencyTestResults {
    targetStrategies: number;
    actualStrategies: number;
    maxConcurrentStrategies: number;
    testDurationSeconds: number;
    totalSignals: number;
    avgSignalLatencyMs: number;
    p95SignalLatencyMs: number;
    p99SignalLatencyMs: number;
    failureRatePercent: number;
    memoryUsageMB: number;
    cpuUsagePercent: number;
    strategiesStarted: number;
    strategiesFailed: number;
    signalLatencies: number[];
}

class StrategyConcurrencyTest {
    private engine: MockStrategyEngine;
    private targetStrategies: number;
    private testDurationSeconds: number;
    private results: ConcurrencyTestResults;

    constructor(targetStrategies: number = 10000, testDurationSeconds: number = 300) {
        this.engine = new MockStrategyEngine();
        this.targetStrategies = targetStrategies;
        this.testDurationSeconds = testDurationSeconds;
        
        this.results = {
            targetStrategies,
            actualStrategies: 0,
            maxConcurrentStrategies: 0,
            testDurationSeconds,
            totalSignals: 0,
            avgSignalLatencyMs: 0,
            p95SignalLatencyMs: 0,
            p99SignalLatencyMs: 0,
            failureRatePercent: 0,
            memoryUsageMB: 0,
            cpuUsagePercent: 0,
            strategiesStarted: 0,
            strategiesFailed: 0,
            signalLatencies: []
        };
    }

    async runConcurrencyTest(): Promise<ConcurrencyTestResults> {
        console.log(`Starting strategy concurrency test...`);
        console.log(`Target: ${this.targetStrategies} concurrent strategies`);
        console.log(`Duration: ${this.testDurationSeconds} seconds`);

        // Setup monitoring
        const signalLatencies: number[] = [];
        let totalSignals = 0;
        let strategiesStarted = 0;
        let strategiesFailed = 0;

        // Event listeners
        this.engine.on('strategyStarted', () => {
            strategiesStarted++;
        });

        this.engine.on('strategyError', () => {
            strategiesFailed++;
        });

        this.engine.on('strategySignal', (strategyId: string, signal: any) => {
            totalSignals++;
            signalLatencies.push(signal.latency);
        });

        // Memory monitoring
        const initialMemory = process.memoryUsage();
        const memorySnapshots: number[] = [];
        
        const memoryMonitor = setInterval(() => {
            const usage = process.memoryUsage();
            memorySnapshots.push(usage.heapUsed / 1024 / 1024); // MB
        }, 1000);

        // Start strategies in batches to avoid overwhelming the system
        const batchSize = 100;
        const batches = Math.ceil(this.targetStrategies / batchSize);
        
        console.log(`Starting ${this.targetStrategies} strategies in ${batches} batches...`);
        
        for (let batch = 0; batch < batches; batch++) {
            const batchStart = batch * batchSize;
            const batchEnd = Math.min(batchStart + batchSize, this.targetStrategies);
            
            // Start strategies in parallel within batch
            const batchPromises: Promise<boolean>[] = [];
            
            for (let i = batchStart; i < batchEnd; i++) {
                const strategyId = `strategy-${i}`;
                const config = {
                    symbol: 'AAPL',
                    timeframe: '1m',
                    parameters: {
                        fastMA: 10,
                        slowMA: 20,
                        rsiPeriod: 14
                    }
                };
                
                batchPromises.push(this.engine.startStrategy(strategyId, config));
            }
            
            // Wait for batch to complete
            await Promise.allSettled(batchPromises);
            
            // Brief pause between batches
            await new Promise(resolve => setTimeout(resolve, 100));
            
            const currentRunning = this.engine.getRunningStrategies();
            console.log(`Batch ${batch + 1}/${batches} completed. Running strategies: ${currentRunning}`);
            
            // Update max concurrent strategies
            if (currentRunning > this.results.maxConcurrentStrategies) {
                this.results.maxConcurrentStrategies = currentRunning;
            }
        }

        // Start strategy execution
        this.engine.startExecution();
        
        const actualStrategies = this.engine.getRunningStrategies();
        console.log(`All strategies started. Actually running: ${actualStrategies}`);

        // Run test for specified duration
        const testStart = Date.now();
        const testEnd = testStart + (this.testDurationSeconds * 1000);
        
        // Progress reporting
        const progressInterval = setInterval(() => {
            const elapsed = (Date.now() - testStart) / 1000;
            const progress = (elapsed / this.testDurationSeconds) * 100;
            const currentRunning = this.engine.getRunningStrategies();
            
            console.log(`Progress: ${progress.toFixed(1)}% (${elapsed.toFixed(0)}s), ` +
                       `Running: ${currentRunning}, Signals: ${totalSignals}`);
        }, 30000); // Report every 30 seconds

        // Wait for test completion
        await new Promise(resolve => {
            const checkCompletion = () => {
                if (Date.now() >= testEnd) {
                    resolve(void 0);
                } else {
                    setTimeout(checkCompletion, 1000);
                }
            };
            checkCompletion();
        });

        // Stop execution and monitoring
        this.engine.stopExecution();
        clearInterval(memoryMonitor);
        clearInterval(progressInterval);

        // Calculate results
        const finalMemory = process.memoryUsage();
        const peakMemory = Math.max(...memorySnapshots);
        
        this.results.actualStrategies = actualStrategies;
        this.results.strategiesStarted = strategiesStarted;
        this.results.strategiesFailed = strategiesFailed;
        this.results.totalSignals = totalSignals;
        this.results.signalLatencies = signalLatencies;
        this.results.memoryUsageMB = peakMemory;
        this.results.failureRatePercent = (strategiesFailed / this.targetStrategies) * 100;

        // Calculate latency statistics
        if (signalLatencies.length > 0) {
            signalLatencies.sort((a, b) => a - b);
            
            const sum = signalLatencies.reduce((acc, val) => acc + val, 0);
            this.results.avgSignalLatencyMs = sum / signalLatencies.length;
            
            const p95Index = Math.floor(signalLatencies.length * 0.95);
            const p99Index = Math.floor(signalLatencies.length * 0.99);
            
            this.results.p95SignalLatencyMs = signalLatencies[p95Index];
            this.results.p99SignalLatencyMs = signalLatencies[p99Index];
        }

        // Estimate CPU usage (simplified)
        this.results.cpuUsagePercent = this.estimateCpuUsage();

        return this.results;
    }

    private estimateCpuUsage(): number {
        // Simplified CPU usage estimation based on strategy count and signal rate
        const baseUsage = 10; // Base system usage
        const strategyUsage = (this.results.actualStrategies / 1000) * 20; // 20% per 1000 strategies
        const signalUsage = (this.results.totalSignals / this.testDurationSeconds / 10000) * 30; // 30% per 10K signals/sec
        
        return Math.min(baseUsage + strategyUsage + signalUsage, 100);
    }

    async generateReport(outputFile?: string): Promise<void> {
        const report = {
            metadata: {
                timestamp: new Date().toISOString(),
                testType: 'strategy_concurrency',
                nodeVersion: process.version,
                platform: process.platform,
                arch: process.arch
            },
            strategy_concurrency: this.results,
            performance_analysis: {
                strategies_per_second_startup: this.results.strategiesStarted / 10, // Assuming 10s startup time
                signals_per_second: this.results.totalSignals / this.testDurationSeconds,
                signals_per_strategy: this.results.totalSignals / this.results.actualStrategies,
                memory_per_strategy_kb: (this.results.memoryUsageMB * 1024) / this.results.actualStrategies,
                success_rate_percent: 100 - this.results.failureRatePercent
            }
        };

        const outputPath = outputFile || 'strategy_concurrency_results.json';
        await fs.writeFile(outputPath, JSON.stringify(report, null, 2));
        console.log(`Strategy concurrency test results written to: ${outputPath}`);
    }
}

describe('Strategy Concurrency Stress Tests', () => {
    let concurrencyTest: StrategyConcurrencyTest;

    beforeEach(() => {
        // Increase event listener limit for high concurrency
        EventEmitter.defaultMaxListeners = 20000;
    });

    afterEach(() => {
        EventEmitter.defaultMaxListeners = 10;
    });

    test('High Concurrency Strategy Execution', async () => {
        const targetStrategies = parseInt(process.env.STRATEGIES || '1000'); // Reduced for CI
        const duration = parseInt(process.env.DURATION || '60'); // Reduced for CI
        
        concurrencyTest = new StrategyConcurrencyTest(targetStrategies, duration);
        
        const results = await concurrencyTest.runConcurrencyTest();
        
        // Generate report
        const outputFile = process.env.OUTPUT_FILE;
        await concurrencyTest.generateReport(outputFile);
        
        // Print results
        console.log('\n=== Strategy Concurrency Test Results ===');
        console.log(`Target Strategies: ${results.targetStrategies}`);
        console.log(`Actual Strategies: ${results.actualStrategies}`);
        console.log(`Max Concurrent: ${results.maxConcurrentStrategies}`);
        console.log(`Strategies Started: ${results.strategiesStarted}`);
        console.log(`Strategies Failed: ${results.strategiesFailed}`);
        console.log(`Failure Rate: ${results.failureRatePercent.toFixed(2)}%`);
        console.log(`Total Signals: ${results.totalSignals}`);
        console.log(`Avg Signal Latency: ${results.avgSignalLatencyMs.toFixed(2)}ms`);
        console.log(`P95 Signal Latency: ${results.p95SignalLatencyMs.toFixed(2)}ms`);
        console.log(`P99 Signal Latency: ${results.p99SignalLatencyMs.toFixed(2)}ms`);
        console.log(`Memory Usage: ${results.memoryUsageMB.toFixed(2)}MB`);
        console.log(`CPU Usage: ${results.cpuUsagePercent.toFixed(2)}%`);
        
        // Verify performance targets
        expect(results.actualStrategies).toBeGreaterThanOrEqual(targetStrategies * 0.95);
        expect(results.failureRatePercent).toBeLessThan(0.1);
        expect(results.avgSignalLatencyMs).toBeLessThan(1.0);
        expect(results.p99SignalLatencyMs).toBeLessThan(5.0);
        
    }, 600000); // 10 minute timeout

    test('Strategy Lifecycle Stress Test', async () => {
        const engine = new MockStrategyEngine();
        const cycleCount = 1000;
        const strategiesPerCycle = 100;
        
        console.log(`Running strategy lifecycle stress test...`);
        console.log(`Cycles: ${cycleCount}, Strategies per cycle: ${strategiesPerCycle}`);
        
        let totalStarted = 0;
        let totalStopped = 0;
        let totalFailed = 0;
        const latencies: number[] = [];
        
        for (let cycle = 0; cycle < cycleCount; cycle++) {
            const cycleStart = performance.now();
            
            // Start strategies
            const startPromises: Promise<boolean>[] = [];
            for (let i = 0; i < strategiesPerCycle; i++) {
                const strategyId = `lifecycle-${cycle}-${i}`;
                const config = { symbol: 'AAPL', timeframe: '1m' };
                startPromises.push(engine.startStrategy(strategyId, config));
            }
            
            const startResults = await Promise.allSettled(startPromises);
            const started = startResults.filter(r => r.status === 'fulfilled' && r.value).length;
            totalStarted += started;
            
            // Brief execution period
            engine.startExecution();
            await new Promise(resolve => setTimeout(resolve, 100));
            engine.stopExecution();
            
            // Stop strategies
            const stopPromises: Promise<boolean>[] = [];
            for (let i = 0; i < strategiesPerCycle; i++) {
                const strategyId = `lifecycle-${cycle}-${i}`;
                stopPromises.push(engine.stopStrategy(strategyId));
            }
            
            const stopResults = await Promise.allSettled(stopPromises);
            const stopped = stopResults.filter(r => r.status === 'fulfilled' && r.value).length;
            totalStopped += stopped;
            
            const cycleEnd = performance.now();
            latencies.push(cycleEnd - cycleStart);
            
            if (cycle % 100 === 0) {
                console.log(`Cycle ${cycle}/${cycleCount} completed. Started: ${totalStarted}, Stopped: ${totalStopped}`);
            }
        }
        
        // Calculate statistics
        latencies.sort((a, b) => a - b);
        const avgLatency = latencies.reduce((sum, val) => sum + val, 0) / latencies.length;
        const p95Latency = latencies[Math.floor(latencies.length * 0.95)];
        
        const results = {
            cycles: cycleCount,
            strategies_per_cycle: strategiesPerCycle,
            total_started: totalStarted,
            total_stopped: totalStopped,
            total_failed: totalFailed,
            avg_cycle_latency_ms: avgLatency,
            p95_cycle_latency_ms: p95Latency,
            success_rate_percent: (totalStarted / (cycleCount * strategiesPerCycle)) * 100
        };
        
        console.log('\n=== Strategy Lifecycle Stress Test Results ===');
        console.log(`Total Started: ${results.total_started}`);
        console.log(`Total Stopped: ${results.total_stopped}`);
        console.log(`Success Rate: ${results.success_rate_percent.toFixed(2)}%`);
        console.log(`Avg Cycle Latency: ${results.avg_cycle_latency_ms.toFixed(2)}ms`);
        console.log(`P95 Cycle Latency: ${results.p95_cycle_latency_ms.toFixed(2)}ms`);
        
        // Verify targets
        expect(results.success_rate_percent).toBeGreaterThan(99.0);
        expect(results.avg_cycle_latency_ms).toBeLessThan(1000);
        
    }, 300000); // 5 minute timeout

    test('Memory Pressure Under High Concurrency', async () => {
        const engine = new MockStrategyEngine();
        const strategyCount = 5000;
        
        console.log(`Running memory pressure test with ${strategyCount} strategies...`);
        
        const initialMemory = process.memoryUsage();
        const memorySnapshots: number[] = [];
        
        // Memory monitoring
        const memoryMonitor = setInterval(() => {
            const usage = process.memoryUsage();
            memorySnapshots.push(usage.heapUsed / 1024 / 1024); // MB
        }, 1000);
        
        // Start strategies
        const startPromises: Promise<boolean>[] = [];
        for (let i = 0; i < strategyCount; i++) {
            const strategyId = `memory-test-${i}`;
            const config = {
                symbol: `SYM${i % 100}`, // 100 different symbols
                timeframe: '1m',
                parameters: {
                    data: new Array(1000).fill(Math.random()) // Some memory usage per strategy
                }
            };
            startPromises.push(engine.startStrategy(strategyId, config));
        }
        
        await Promise.allSettled(startPromises);
        
        // Run for a period
        engine.startExecution();
        await new Promise(resolve => setTimeout(resolve, 60000)); // 1 minute
        engine.stopExecution();
        
        clearInterval(memoryMonitor);
        
        const finalMemory = process.memoryUsage();
        const peakMemory = Math.max(...memorySnapshots);
        const memoryGrowth = (finalMemory.heapUsed - initialMemory.heapUsed) / 1024 / 1024; // MB
        
        const results = {
            strategy_count: strategyCount,
            initial_memory_mb: initialMemory.heapUsed / 1024 / 1024,
            final_memory_mb: finalMemory.heapUsed / 1024 / 1024,
            peak_memory_mb: peakMemory,
            memory_growth_mb: memoryGrowth,
            memory_per_strategy_kb: (memoryGrowth * 1024) / strategyCount
        };
        
        console.log('\n=== Memory Pressure Test Results ===');
        console.log(`Initial Memory: ${results.initial_memory_mb.toFixed(2)}MB`);
        console.log(`Final Memory: ${results.final_memory_mb.toFixed(2)}MB`);
        console.log(`Peak Memory: ${results.peak_memory_mb.toFixed(2)}MB`);
        console.log(`Memory Growth: ${results.memory_growth_mb.toFixed(2)}MB`);
        console.log(`Memory per Strategy: ${results.memory_per_strategy_kb.toFixed(2)}KB`);
        
        // Verify memory usage is reasonable
        expect(results.memory_per_strategy_kb).toBeLessThan(100); // Less than 100KB per strategy
        expect(results.peak_memory_mb).toBeLessThan(2000); // Less than 2GB peak
        
    }, 120000); // 2 minute timeout
});

// Export for use in load testing script
export { StrategyConcurrencyTest };