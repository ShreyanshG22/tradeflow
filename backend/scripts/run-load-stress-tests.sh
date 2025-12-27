#!/bin/bash

# TradeFlow Load and Stress Testing Framework
# Comprehensive testing for high-frequency trading systems

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Configuration
BACKEND_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENGINES_DIR="$BACKEND_DIR/engines"
SERVICES_DIR="$BACKEND_DIR/services"
BUILD_DIR="$ENGINES_DIR/build"
RESULTS_DIR="$BACKEND_DIR/load-stress-results"
REPORTS_DIR="$BACKEND_DIR/load-stress-reports"

# Performance targets
HFT_TARGET_OPS=100000          # 100K orders/second
MARKET_DATA_TARGET=1000000     # 1M ticks/second
CONCURRENT_STRATEGIES=10000    # 10K concurrent strategies
DB_CONNECTIONS=1000            # 1K database connections
STABILITY_DURATION="24h"       # Default stability test duration

echo -e "${CYAN}TradeFlow Load and Stress Testing Suite${NC}"
echo "============================================="

# Function to print colored output
print_status() {
    echo -e "${BLUE}[LOAD-STRESS]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_perf() {
    echo -e "${PURPLE}[PERFORMANCE]${NC} $1"
}

print_stress() {
    echo -e "${CYAN}[STRESS]${NC} $1"
}

# Create results directories
setup_directories() {
    mkdir -p "$RESULTS_DIR"/{hft-load,market-data-stress,strategy-concurrency,database-stress,memory-leak,failover}
    mkdir -p "$REPORTS_DIR"
    mkdir -p "$BACKEND_DIR/load-stress-history"
}

# Function to check system resources
check_system_resources() {
    print_status "Checking system resources for load testing..."
    
    # Check CPU cores
    local cpu_cores=$(nproc)
    if [ "$cpu_cores" -lt 8 ]; then
        print_warning "Insufficient CPU cores for optimal load testing: $cpu_cores (recommended: 16+)"
    else
        print_success "CPU cores: $cpu_cores"
    fi
    
    # Check memory
    local memory_gb=$(free -g | awk '/^Mem:/{print $2}')
    if [ "$memory_gb" -lt 32 ]; then
        print_warning "Insufficient memory for optimal load testing: ${memory_gb}GB (recommended: 64GB+)"
    else
        print_success "Memory: ${memory_gb}GB"
    fi
    
    # Check disk space
    local disk_space=$(df -BG "$BACKEND_DIR" | awk 'NR==2{print $4}' | sed 's/G//')
    if [ "$disk_space" -lt 50 ]; then
        print_warning "Low disk space: ${disk_space}GB (recommended: 100GB+)"
    else
        print_success "Disk space: ${disk_space}GB"
    fi
}

# Function to start system monitoring
start_monitoring() {
    print_status "Starting system monitoring..."
    
    local timestamp=$(date '+%Y%m%d_%H%M%S')
    local monitor_dir="$RESULTS_DIR/monitoring_$timestamp"
    mkdir -p "$monitor_dir"
    
    # Start system resource monitoring
    {
        while true; do
            echo "$(date '+%Y-%m-%d %H:%M:%S'),$(cat /proc/loadavg | cut -d' ' -f1-3),$(free | grep Mem | awk '{print $3/$2 * 100.0}'),$(iostat -x 1 1 | tail -n +4 | awk '{sum+=$10} END {print sum}')"
            sleep 5
        done
    } > "$monitor_dir/system_metrics.csv" &
    
    local monitor_pid=$!
    echo "$monitor_pid" > "$monitor_dir/monitor.pid"
    
    print_success "System monitoring started (PID: $monitor_pid)"
    echo "$monitor_dir"
}

# Function to stop system monitoring
stop_monitoring() {
    local monitor_dir="$1"
    
    if [ -f "$monitor_dir/monitor.pid" ]; then
        local monitor_pid=$(cat "$monitor_dir/monitor.pid")
        if kill -0 "$monitor_pid" 2>/dev/null; then
            kill "$monitor_pid"
            print_success "System monitoring stopped"
        fi
        rm -f "$monitor_dir/monitor.pid"
    fi
}

# Function to run high-frequency trading load tests
run_hft_load_tests() {
    print_stress "Running High-Frequency Trading Load Tests..."
    
    local timestamp=$(date '+%Y%m%d_%H%M%S')
    local results_file="$RESULTS_DIR/hft-load/hft_load_results_$timestamp.json"
    local monitor_dir=$(start_monitoring)
    
    # Start full trading system
    cd "$BACKEND_DIR"
    docker-compose up -d
    
    # Wait for system to be ready
    print_status "Waiting for trading system to initialize..."
    sleep 60
    
    # Build and run HFT load test
    cd "$BUILD_DIR"
    if make hft_load_test 2>/dev/null; then
        print_status "Running HFT load test (target: ${HFT_TARGET_OPS} orders/sec)..."
        
        if ./hft_load_test --target-ops="$HFT_TARGET_OPS" --duration=300 --output="$results_file"; then
            # Parse results
            local actual_ops=$(jq -r '.hft_load.actual_ops_per_second' "$results_file" 2>/dev/null || echo "0")
            local success_rate=$(jq -r '.hft_load.success_rate_percent' "$results_file" 2>/dev/null || echo "0")
            local p99_latency=$(jq -r '.hft_load.p99_latency_us' "$results_file" 2>/dev/null || echo "0")
            
            print_perf "HFT Load Test Results:"
            print_perf "  Orders/sec: $actual_ops (target: $HFT_TARGET_OPS)"
            print_perf "  Success rate: $success_rate%"
            print_perf "  P99 latency: ${p99_latency}μs"
            
            if (( $(echo "$actual_ops >= $HFT_TARGET_OPS" | bc -l) )); then
                print_success "HFT throughput target achieved"
            else
                print_warning "HFT throughput below target"
            fi
            
            if (( $(echo "$success_rate >= 99.9" | bc -l) )); then
                print_success "HFT success rate target achieved"
            else
                print_warning "HFT success rate below target (99.9%)"
            fi
        else
            print_error "HFT load test execution failed"
        fi
    else
        print_error "Failed to build HFT load test"
    fi
    
    stop_monitoring "$monitor_dir"
    
    # Cleanup
    cd "$BACKEND_DIR"
    docker-compose down
    
    print_success "HFT load tests completed"
}

# Function to run market data ingestion stress tests
run_market_data_stress_tests() {
    print_stress "Running Market Data Ingestion Stress Tests..."
    
    local timestamp=$(date '+%Y%m%d_%H%M%S')
    local results_file="$RESULTS_DIR/market-data-stress/market_data_stress_$timestamp.json"
    local monitor_dir=$(start_monitoring)
    
    # Start market data services
    cd "$BACKEND_DIR"
    docker-compose up -d postgres redis
    
    # Wait for services
    sleep 30
    
    # Build and run market data stress test
    cd "$BUILD_DIR"
    if make market_data_stress_test 2>/dev/null; then
        print_status "Running market data stress test (target: ${MARKET_DATA_TARGET} ticks/sec)..."
        
        if ./market_data_stress_test --target-ticks="$MARKET_DATA_TARGET" --duration=600 --feeds=10 --output="$results_file"; then
            # Parse results
            local actual_ticks=$(jq -r '.market_data_stress.actual_ticks_per_second' "$results_file" 2>/dev/null || echo "0")
            local memory_growth=$(jq -r '.market_data_stress.memory_growth_mb_per_hour' "$results_file" 2>/dev/null || echo "0")
            local cpu_usage=$(jq -r '.market_data_stress.avg_cpu_percent' "$results_file" 2>/dev/null || echo "0")
            
            print_perf "Market Data Stress Test Results:"
            print_perf "  Ticks/sec: $actual_ticks (target: $MARKET_DATA_TARGET)"
            print_perf "  Memory growth: ${memory_growth}MB/hour"
            print_perf "  CPU usage: $cpu_usage%"
            
            if (( $(echo "$actual_ticks >= $MARKET_DATA_TARGET" | bc -l) )); then
                print_success "Market data throughput target achieved"
            else
                print_warning "Market data throughput below target"
            fi
            
            if (( $(echo "$memory_growth < 100" | bc -l) )); then
                print_success "Memory growth within acceptable limits"
            else
                print_warning "Excessive memory growth detected"
            fi
        else
            print_error "Market data stress test execution failed"
        fi
    else
        print_error "Failed to build market data stress test"
    fi
    
    stop_monitoring "$monitor_dir"
    
    # Cleanup
    cd "$BACKEND_DIR"
    docker-compose down
    
    print_success "Market data stress tests completed"
}

# Function to run concurrent strategy execution stress tests
run_strategy_concurrency_tests() {
    print_stress "Running Concurrent Strategy Execution Stress Tests..."
    
    local timestamp=$(date '+%Y%m%d_%H%M%S')
    local results_file="$RESULTS_DIR/strategy-concurrency/strategy_concurrency_$timestamp.json"
    local monitor_dir=$(start_monitoring)
    
    # Start strategy services
    cd "$BACKEND_DIR"
    docker-compose up -d postgres redis
    
    # Wait for services
    sleep 30
    
    # Run Node.js strategy concurrency test
    cd "$SERVICES_DIR/strategy-service"
    if npm run test:concurrency -- --strategies="$CONCURRENT_STRATEGIES" --duration=300 --output="$results_file"; then
        # Parse results
        local concurrent_strategies=$(jq -r '.strategy_concurrency.max_concurrent_strategies' "$results_file" 2>/dev/null || echo "0")
        local avg_latency=$(jq -r '.strategy_concurrency.avg_signal_latency_ms' "$results_file" 2>/dev/null || echo "0")
        local failure_rate=$(jq -r '.strategy_concurrency.failure_rate_percent' "$results_file" 2>/dev/null || echo "0")
        
        print_perf "Strategy Concurrency Test Results:"
        print_perf "  Concurrent strategies: $concurrent_strategies (target: $CONCURRENT_STRATEGIES)"
        print_perf "  Avg signal latency: ${avg_latency}ms"
        print_perf "  Failure rate: $failure_rate%"
        
        if [ "$concurrent_strategies" -ge "$CONCURRENT_STRATEGIES" ]; then
            print_success "Concurrent strategy target achieved"
        else
            print_warning "Concurrent strategy count below target"
        fi
        
        if (( $(echo "$failure_rate < 0.1" | bc -l) )); then
            print_success "Strategy failure rate within acceptable limits"
        else
            print_warning "High strategy failure rate detected"
        fi
    else
        print_error "Strategy concurrency test execution failed"
    fi
    
    stop_monitoring "$monitor_dir"
    
    # Cleanup
    cd "$BACKEND_DIR"
    docker-compose down
    
    print_success "Strategy concurrency tests completed"
}

# Function to run database connection pool stress tests
run_database_stress_tests() {
    print_stress "Running Database Connection Pool Stress Tests..."
    
    local timestamp=$(date '+%Y%m%d_%H%M%S')
    local results_file="$RESULTS_DIR/database-stress/database_stress_$timestamp.json"
    local monitor_dir=$(start_monitoring)
    
    # Start database
    cd "$BACKEND_DIR"
    docker-compose up -d postgres
    
    # Wait for database
    sleep 30
    
    # Run database stress test
    cd "$SERVICES_DIR/portfolio-service"
    if npm run test:database-stress -- --connections="$DB_CONNECTIONS" --duration=300 --output="$results_file"; then
        # Parse results
        local max_connections=$(jq -r '.database_stress.max_concurrent_connections' "$results_file" 2>/dev/null || echo "0")
        local avg_query_time=$(jq -r '.database_stress.avg_query_time_ms' "$results_file" 2>/dev/null || echo "0")
        local deadlock_rate=$(jq -r '.database_stress.deadlock_rate_percent' "$results_file" 2>/dev/null || echo "0")
        local recovery_time=$(jq -r '.database_stress.pool_recovery_time_s' "$results_file" 2>/dev/null || echo "0")
        
        print_perf "Database Stress Test Results:"
        print_perf "  Max connections: $max_connections (target: $DB_CONNECTIONS)"
        print_perf "  Avg query time: ${avg_query_time}ms"
        print_perf "  Deadlock rate: $deadlock_rate%"
        print_perf "  Recovery time: ${recovery_time}s"
        
        if [ "$max_connections" -ge "$DB_CONNECTIONS" ]; then
            print_success "Database connection target achieved"
        else
            print_warning "Database connection count below target"
        fi
        
        if (( $(echo "$deadlock_rate < 0.01" | bc -l) )); then
            print_success "Deadlock rate within acceptable limits"
        else
            print_warning "High deadlock rate detected"
        fi
        
        if (( $(echo "$recovery_time < 30" | bc -l) )); then
            print_success "Pool recovery time within target"
        else
            print_warning "Slow pool recovery detected"
        fi
    else
        print_error "Database stress test execution failed"
    fi
    
    stop_monitoring "$monitor_dir"
    
    # Cleanup
    cd "$BACKEND_DIR"
    docker-compose down
    
    print_success "Database stress tests completed"
}

# Function to run memory leak detection tests
run_memory_leak_tests() {
    print_stress "Running Memory Leak Detection Tests..."
    
    local duration="$1"
    if [ -z "$duration" ]; then
        duration="1h"  # Default to 1 hour for CI/CD
    fi
    
    local timestamp=$(date '+%Y%m%d_%H%M%S')
    local results_file="$RESULTS_DIR/memory-leak/memory_leak_$timestamp.json"
    local monitor_dir=$(start_monitoring)
    
    print_status "Running memory leak test for duration: $duration"
    
    # Start full system
    cd "$BACKEND_DIR"
    docker-compose up -d
    
    # Wait for system
    sleep 60
    
    # Run memory leak detection
    cd "$BUILD_DIR"
    if make memory_leak_test 2>/dev/null; then
        if ./memory_leak_test --duration="$duration" --output="$results_file"; then
            # Parse results
            local initial_memory=$(jq -r '.memory_leak.initial_memory_mb' "$results_file" 2>/dev/null || echo "0")
            local final_memory=$(jq -r '.memory_leak.final_memory_mb' "$results_file" 2>/dev/null || echo "0")
            local memory_growth=$(jq -r '.memory_leak.memory_growth_mb' "$results_file" 2>/dev/null || echo "0")
            local leak_rate=$(jq -r '.memory_leak.leak_rate_mb_per_hour' "$results_file" 2>/dev/null || echo "0")
            
            print_perf "Memory Leak Test Results ($duration):"
            print_perf "  Initial memory: ${initial_memory}MB"
            print_perf "  Final memory: ${final_memory}MB"
            print_perf "  Memory growth: ${memory_growth}MB"
            print_perf "  Leak rate: ${leak_rate}MB/hour"
            
            if (( $(echo "$leak_rate < 10" | bc -l) )); then
                print_success "Memory leak rate within acceptable limits"
            else
                print_warning "Potential memory leak detected"
            fi
        else
            print_error "Memory leak test execution failed"
        fi
    else
        print_error "Failed to build memory leak test"
    fi
    
    stop_monitoring "$monitor_dir"
    
    # Cleanup
    cd "$BACKEND_DIR"
    docker-compose down
    
    print_success "Memory leak tests completed"
}

# Function to run failover and disaster recovery tests
run_failover_tests() {
    print_stress "Running Failover and Disaster Recovery Tests..."
    
    local timestamp=$(date '+%Y%m%d_%H%M%S')
    local results_file="$RESULTS_DIR/failover/failover_$timestamp.json"
    local monitor_dir=$(start_monitoring)
    
    # Start full system
    cd "$BACKEND_DIR"
    docker-compose up -d
    
    # Wait for system
    sleep 60
    
    # Run failover tests
    if npm run test:failover -- --output="$results_file"; then
        # Parse results
        local service_recovery_time=$(jq -r '.failover.service_recovery_time_s' "$results_file" 2>/dev/null || echo "0")
        local database_recovery_time=$(jq -r '.failover.database_recovery_time_s' "$results_file" 2>/dev/null || echo "0")
        local data_loss_percent=$(jq -r '.failover.data_loss_percent' "$results_file" 2>/dev/null || echo "0")
        
        print_perf "Failover Test Results:"
        print_perf "  Service recovery: ${service_recovery_time}s"
        print_perf "  Database recovery: ${database_recovery_time}s"
        print_perf "  Data loss: $data_loss_percent%"
        
        if (( $(echo "$service_recovery_time < 60" | bc -l) )); then
            print_success "Service recovery time within target"
        else
            print_warning "Slow service recovery detected"
        fi
        
        if (( $(echo "$database_recovery_time < 120" | bc -l) )); then
            print_success "Database recovery time within target"
        else
            print_warning "Slow database recovery detected"
        fi
        
        if (( $(echo "$data_loss_percent == 0" | bc -l) )); then
            print_success "No data loss detected"
        else
            print_warning "Data loss detected during failover"
        fi
    else
        print_error "Failover test execution failed"
    fi
    
    stop_monitoring "$monitor_dir"
    
    # Cleanup
    cd "$BACKEND_DIR"
    docker-compose down
    
    print_success "Failover tests completed"
}

# Function to generate comprehensive report
generate_load_stress_report() {
    print_status "Generating load and stress test report..."
    
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    local report_file="$REPORTS_DIR/load_stress_report_$(date '+%Y%m%d_%H%M%S').md"
    
    cat > "$report_file" << EOF
# TradeFlow Load and Stress Test Report

**Generated:** $timestamp

## Executive Summary

This report summarizes the results of comprehensive load and stress testing performed on the TradeFlow backend infrastructure.

## Test Results Summary

### High-Frequency Trading Load Tests
EOF
    
    # Add latest HFT results
    local latest_hft=$(ls -t "$RESULTS_DIR/hft-load/"*.json 2>/dev/null | head -1)
    if [ -n "$latest_hft" ]; then
        local ops_per_sec=$(jq -r '.hft_load.actual_ops_per_second' "$latest_hft" 2>/dev/null || echo "N/A")
        local success_rate=$(jq -r '.hft_load.success_rate_percent' "$latest_hft" 2>/dev/null || echo "N/A")
        echo "- **Orders/Second**: $ops_per_sec (Target: $HFT_TARGET_OPS)" >> "$report_file"
        echo "- **Success Rate**: $success_rate%" >> "$report_file"
    fi
    
    cat >> "$report_file" << EOF

### Market Data Ingestion Stress Tests
EOF
    
    # Add latest market data results
    local latest_md=$(ls -t "$RESULTS_DIR/market-data-stress/"*.json 2>/dev/null | head -1)
    if [ -n "$latest_md" ]; then
        local ticks_per_sec=$(jq -r '.market_data_stress.actual_ticks_per_second' "$latest_md" 2>/dev/null || echo "N/A")
        local memory_growth=$(jq -r '.market_data_stress.memory_growth_mb_per_hour' "$latest_md" 2>/dev/null || echo "N/A")
        echo "- **Ticks/Second**: $ticks_per_sec (Target: $MARKET_DATA_TARGET)" >> "$report_file"
        echo "- **Memory Growth**: ${memory_growth}MB/hour" >> "$report_file"
    fi
    
    cat >> "$report_file" << EOF

### Concurrent Strategy Execution Tests
EOF
    
    # Add latest strategy results
    local latest_strategy=$(ls -t "$RESULTS_DIR/strategy-concurrency/"*.json 2>/dev/null | head -1)
    if [ -n "$latest_strategy" ]; then
        local concurrent_strategies=$(jq -r '.strategy_concurrency.max_concurrent_strategies' "$latest_strategy" 2>/dev/null || echo "N/A")
        local failure_rate=$(jq -r '.strategy_concurrency.failure_rate_percent' "$latest_strategy" 2>/dev/null || echo "N/A")
        echo "- **Concurrent Strategies**: $concurrent_strategies (Target: $CONCURRENT_STRATEGIES)" >> "$report_file"
        echo "- **Failure Rate**: $failure_rate%" >> "$report_file"
    fi
    
    cat >> "$report_file" << EOF

### Database Connection Pool Tests
EOF
    
    # Add latest database results
    local latest_db=$(ls -t "$RESULTS_DIR/database-stress/"*.json 2>/dev/null | head -1)
    if [ -n "$latest_db" ]; then
        local max_connections=$(jq -r '.database_stress.max_concurrent_connections' "$latest_db" 2>/dev/null || echo "N/A")
        local deadlock_rate=$(jq -r '.database_stress.deadlock_rate_percent' "$latest_db" 2>/dev/null || echo "N/A")
        echo "- **Max Connections**: $max_connections (Target: $DB_CONNECTIONS)" >> "$report_file"
        echo "- **Deadlock Rate**: $deadlock_rate%" >> "$report_file"
    fi
    
    cat >> "$report_file" << EOF

### Memory Leak Detection Tests
EOF
    
    # Add latest memory leak results
    local latest_memory=$(ls -t "$RESULTS_DIR/memory-leak/"*.json 2>/dev/null | head -1)
    if [ -n "$latest_memory" ]; then
        local leak_rate=$(jq -r '.memory_leak.leak_rate_mb_per_hour' "$latest_memory" 2>/dev/null || echo "N/A")
        local memory_growth=$(jq -r '.memory_leak.memory_growth_mb' "$latest_memory" 2>/dev/null || echo "N/A")
        echo "- **Leak Rate**: ${leak_rate}MB/hour" >> "$report_file"
        echo "- **Total Growth**: ${memory_growth}MB" >> "$report_file"
    fi
    
    cat >> "$report_file" << EOF

### Failover and Recovery Tests
EOF
    
    # Add latest failover results
    local latest_failover=$(ls -t "$RESULTS_DIR/failover/"*.json 2>/dev/null | head -1)
    if [ -n "$latest_failover" ]; then
        local service_recovery=$(jq -r '.failover.service_recovery_time_s' "$latest_failover" 2>/dev/null || echo "N/A")
        local data_loss=$(jq -r '.failover.data_loss_percent' "$latest_failover" 2>/dev/null || echo "N/A")
        echo "- **Service Recovery**: ${service_recovery}s" >> "$report_file"
        echo "- **Data Loss**: $data_loss%" >> "$report_file"
    fi
    
    cat >> "$report_file" << EOF

## Performance Targets vs Actual

| Test Category | Metric | Target | Actual | Status |
|---------------|--------|--------|--------|--------|
EOF
    
    # Add performance comparison table
    if [ -n "$latest_hft" ]; then
        local ops_per_sec=$(jq -r '.hft_load.actual_ops_per_second' "$latest_hft" 2>/dev/null || echo "0")
        local status="❌"
        if (( $(echo "$ops_per_sec >= $HFT_TARGET_OPS" | bc -l) )); then
            status="✅"
        fi
        echo "| HFT Load | Orders/sec | $HFT_TARGET_OPS | $ops_per_sec | $status |" >> "$report_file"
    fi
    
    cat >> "$report_file" << EOF

## Recommendations

### Performance Optimizations
- Review bottlenecks identified in system monitoring data
- Consider hardware upgrades for components not meeting targets
- Optimize database queries and connection pooling
- Implement additional caching strategies

### Reliability Improvements
- Enhance failover mechanisms for faster recovery
- Implement better memory management to prevent leaks
- Add more comprehensive error handling and retry logic
- Improve monitoring and alerting for early issue detection

### Scalability Enhancements
- Implement horizontal scaling for high-load components
- Optimize resource allocation and CPU affinity
- Consider implementing circuit breakers for external dependencies
- Enhance load balancing strategies

## Raw Data Files

- HFT Load Tests: \`load-stress-results/hft-load/\`
- Market Data Stress: \`load-stress-results/market-data-stress/\`
- Strategy Concurrency: \`load-stress-results/strategy-concurrency/\`
- Database Stress: \`load-stress-results/database-stress/\`
- Memory Leak Tests: \`load-stress-results/memory-leak/\`
- Failover Tests: \`load-stress-results/failover/\`

## Running Tests

\`\`\`bash
# All load and stress tests
./scripts/run-load-stress-tests.sh

# Specific test categories
./scripts/run-load-stress-tests.sh --hft-load
./scripts/run-load-stress-tests.sh --market-data-stress
./scripts/run-load-stress-tests.sh --strategy-concurrency
./scripts/run-load-stress-tests.sh --database-stress
./scripts/run-load-stress-tests.sh --memory-leak --duration=24h
./scripts/run-load-stress-tests.sh --failover
\`\`\`
EOF
    
    print_success "Load and stress test report generated: $report_file"
}

# Main execution function
main() {
    local run_hft=false
    local run_market_data=false
    local run_strategy=false
    local run_database=false
    local run_memory_leak=false
    local run_failover=false
    local run_all=true
    local stability_duration="$STABILITY_DURATION"
    
    # Parse command line arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --hft-load)
                run_hft=true
                run_all=false
                shift
                ;;
            --market-data-stress)
                run_market_data=true
                run_all=false
                shift
                ;;
            --strategy-concurrency)
                run_strategy=true
                run_all=false
                shift
                ;;
            --database-stress)
                run_database=true
                run_all=false
                shift
                ;;
            --memory-leak)
                run_memory_leak=true
                run_all=false
                shift
                ;;
            --failover)
                run_failover=true
                run_all=false
                shift
                ;;
            --stability)
                run_memory_leak=true
                run_all=false
                shift
                ;;
            --duration=*)
                stability_duration="${1#*=}"
                shift
                ;;
            --help)
                echo "Usage: $0 [OPTIONS]"
                echo ""
                echo "Options:"
                echo "  --hft-load              Run high-frequency trading load tests"
                echo "  --market-data-stress    Run market data ingestion stress tests"
                echo "  --strategy-concurrency  Run concurrent strategy execution tests"
                echo "  --database-stress       Run database connection pool stress tests"
                echo "  --memory-leak           Run memory leak detection tests"
                echo "  --failover              Run failover and disaster recovery tests"
                echo "  --stability             Run long-running stability tests"
                echo "  --duration=DURATION     Set duration for stability tests (e.g., 24h, 2h)"
                echo "  --help                  Show this help message"
                exit 0
                ;;
            *)
                print_error "Unknown option: $1"
                exit 1
                ;;
        esac
    done
    
    setup_directories
    check_system_resources
    
    local results=()
    
    # Run selected tests
    if [ "$run_all" = true ] || [ "$run_hft" = true ]; then
        if run_hft_load_tests; then
            results+=("hft-load:PASS")
        else
            results+=("hft-load:FAIL")
        fi
    fi
    
    if [ "$run_all" = true ] || [ "$run_market_data" = true ]; then
        if run_market_data_stress_tests; then
            results+=("market-data-stress:PASS")
        else
            results+=("market-data-stress:FAIL")
        fi
    fi
    
    if [ "$run_all" = true ] || [ "$run_strategy" = true ]; then
        if run_strategy_concurrency_tests; then
            results+=("strategy-concurrency:PASS")
        else
            results+=("strategy-concurrency:FAIL")
        fi
    fi
    
    if [ "$run_all" = true ] || [ "$run_database" = true ]; then
        if run_database_stress_tests; then
            results+=("database-stress:PASS")
        else
            results+=("database-stress:FAIL")
        fi
    fi
    
    if [ "$run_all" = true ] || [ "$run_memory_leak" = true ]; then
        if run_memory_leak_tests "$stability_duration"; then
            results+=("memory-leak:PASS")
        else
            results+=("memory-leak:FAIL")
        fi
    fi
    
    if [ "$run_all" = true ] || [ "$run_failover" = true ]; then
        if run_failover_tests; then
            results+=("failover:PASS")
        else
            results+=("failover:FAIL")
        fi
    fi
    
    # Generate report
    generate_load_stress_report
    
    # Print summary
    echo ""
    echo "============================================="
    print_status "Load and Stress Test Suite Summary"
    echo "============================================="
    
    local failed_count=0
    for result in "${results[@]}"; do
        local test_name=$(echo "$result" | cut -d: -f1)
        local test_result=$(echo "$result" | cut -d: -f2)
        
        if [ "$test_result" = "PASS" ]; then
            print_success "$test_name tests: PASSED"
        else
            print_error "$test_name tests: FAILED"
            failed_count=$((failed_count + 1))
        fi
    done
    
    if [ $failed_count -eq 0 ]; then
        print_success "🎉 All load and stress tests passed!"
        exit 0
    else
        print_error "❌ $failed_count test category(ies) failed"
        exit 1
    fi
}

# Check dependencies
if ! command -v bc >/dev/null 2>&1; then
    print_error "bc (basic calculator) is required but not installed"
    exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
    print_error "jq is required but not installed"
    exit 1
fi

if ! command -v docker-compose >/dev/null 2>&1; then
    print_error "docker-compose is required but not installed"
    exit 1
fi

# Run main function
main "$@"