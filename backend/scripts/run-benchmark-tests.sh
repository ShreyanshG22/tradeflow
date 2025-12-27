#!/bin/bash

# TradeFlow Backend Benchmark Test Runner
# This script runs comprehensive performance and benchmark tests

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m' # No Color

# Configuration
BACKEND_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENGINES_DIR="$BACKEND_DIR/engines"
SERVICES_DIR="$BACKEND_DIR/services"
BUILD_DIR="$ENGINES_DIR/build"
RESULTS_DIR="$BACKEND_DIR/benchmark-results"
REPORTS_DIR="$BACKEND_DIR/benchmark-reports"

# Performance targets
LATENCY_TARGET_US=10
THROUGHPUT_TARGET_OPS=100000
API_LATENCY_TARGET_MS=100
CONCURRENT_USERS_TARGET=10000

echo -e "${BLUE}TradeFlow Backend Benchmark Suite${NC}"
echo "===================================="

# Function to print colored output
print_status() {
    echo -e "${BLUE}[BENCHMARK]${NC} $1"
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

# Create results directories
setup_directories() {
    mkdir -p "$RESULTS_DIR"/{latency,throughput,memory,api,load}
    mkdir -p "$REPORTS_DIR"
    mkdir -p "$BACKEND_DIR/benchmark-history"
}

# Function to run C++ latency benchmarks
run_latency_benchmarks() {
    print_status "Running ultra-low latency benchmarks..."
    
    cd "$BUILD_DIR"
    
    # Build benchmark executables
    if ! make benchmark_latency 2>/dev/null; then
        print_error "Failed to build latency benchmarks"
        return 1
    fi
    
    local timestamp=$(date '+%Y%m%d_%H%M%S')
    local results_file="$RESULTS_DIR/latency/latency_results_$timestamp.json"
    
    print_status "Running trading engine latency benchmark..."
    if ./benchmark_latency --output="$results_file"; then
        # Parse results and check against targets
        local avg_latency=$(jq -r '.trading_engine.average_latency_ns' "$results_file" 2>/dev/null || echo "0")
        local p99_latency=$(jq -r '.trading_engine.p99_latency_ns' "$results_file" 2>/dev/null || echo "0")
        
        if [ "$avg_latency" != "0" ] && [ "$p99_latency" != "0" ]; then
            local avg_us=$(echo "scale=2; $avg_latency / 1000" | bc -l)
            local p99_us=$(echo "scale=2; $p99_latency / 1000" | bc -l)
            
            print_perf "Trading Engine - Average: ${avg_us}μs, P99: ${p99_us}μs"
            
            if (( $(echo "$p99_us < $LATENCY_TARGET_US" | bc -l) )); then
                print_success "Latency target met (${p99_us}μs < ${LATENCY_TARGET_US}μs)"
            else
                print_warning "Latency target missed (${p99_us}μs >= ${LATENCY_TARGET_US}μs)"
            fi
        fi
        
        print_success "Latency benchmarks completed"
        return 0
    else
        print_error "Latency benchmarks failed"
        return 1
    fi
}

# Function to run C++ throughput benchmarks
run_throughput_benchmarks() {
    print_status "Running throughput benchmarks..."
    
    cd "$BUILD_DIR"
    
    # Build benchmark executables
    if ! make benchmark_throughput 2>/dev/null; then
        print_error "Failed to build throughput benchmarks"
        return 1
    fi
    
    local timestamp=$(date '+%Y%m%d_%H%M%S')
    local results_file="$RESULTS_DIR/throughput/throughput_results_$timestamp.json"
    
    print_status "Running market data throughput benchmark..."
    if ./benchmark_throughput --output="$results_file"; then
        # Parse results and check against targets
        local ops_per_sec=$(jq -r '.market_data.operations_per_second' "$results_file" 2>/dev/null || echo "0")
        
        if [ "$ops_per_sec" != "0" ]; then
            print_perf "Market Data Processing: ${ops_per_sec} ops/sec"
            
            if (( $(echo "$ops_per_sec > $THROUGHPUT_TARGET_OPS" | bc -l) )); then
                print_success "Throughput target met (${ops_per_sec} > ${THROUGHPUT_TARGET_OPS})"
            else
                print_warning "Throughput target missed (${ops_per_sec} <= ${THROUGHPUT_TARGET_OPS})"
            fi
        fi
        
        print_success "Throughput benchmarks completed"
        return 0
    else
        print_error "Throughput benchmarks failed"
        return 1
    fi
}

# Function to run memory benchmarks
run_memory_benchmarks() {
    print_status "Running memory performance benchmarks..."
    
    cd "$BUILD_DIR"
    
    # Build benchmark executables
    if ! make benchmark_memory 2>/dev/null; then
        print_error "Failed to build memory benchmarks"
        return 1
    fi
    
    local timestamp=$(date '+%Y%m%d_%H%M%S')
    local results_file="$RESULTS_DIR/memory/memory_results_$timestamp.json"
    
    print_status "Running memory allocation benchmark..."
    if ./benchmark_memory --output="$results_file"; then
        # Parse results
        local allocations=$(jq -r '.memory.total_allocations' "$results_file" 2>/dev/null || echo "0")
        local peak_memory=$(jq -r '.memory.peak_memory_mb' "$results_file" 2>/dev/null || echo "0")
        
        if [ "$allocations" != "0" ] && [ "$peak_memory" != "0" ]; then
            print_perf "Memory - Allocations: ${allocations}, Peak: ${peak_memory}MB"
            
            if [ "$allocations" -eq "0" ]; then
                print_success "Zero-allocation target met"
            else
                print_warning "Memory allocations detected in hot path: $allocations"
            fi
        fi
        
        print_success "Memory benchmarks completed"
        return 0
    else
        print_error "Memory benchmarks failed"
        return 1
    fi
}

# Function to run API performance benchmarks
run_api_benchmarks() {
    print_status "Running API performance benchmarks..."
    
    # Start services for testing
    cd "$BACKEND_DIR"
    docker-compose -f docker-compose.test.yml up -d postgres redis
    
    # Wait for services to be ready
    sleep 10
    
    local timestamp=$(date '+%Y%m%d_%H%M%S')
    local results_file="$RESULTS_DIR/api/api_results_$timestamp.json"
    
    # Run API gateway benchmarks
    cd "$SERVICES_DIR/api-gateway"
    
    if npm run benchmark -- --output="$results_file"; then
        # Parse results
        local avg_response=$(jq -r '.api.average_response_time_ms' "$results_file" 2>/dev/null || echo "0")
        local p95_response=$(jq -r '.api.p95_response_time_ms' "$results_file" 2>/dev/null || echo "0")
        
        if [ "$avg_response" != "0" ] && [ "$p95_response" != "0" ]; then
            print_perf "API - Average: ${avg_response}ms, P95: ${p95_response}ms"
            
            if (( $(echo "$p95_response < $API_LATENCY_TARGET_MS" | bc -l) )); then
                print_success "API latency target met (${p95_response}ms < ${API_LATENCY_TARGET_MS}ms)"
            else
                print_warning "API latency target missed (${p95_response}ms >= ${API_LATENCY_TARGET_MS}ms)"
            fi
        fi
        
        print_success "API benchmarks completed"
        
        # Cleanup
        cd "$BACKEND_DIR"
        docker-compose -f docker-compose.test.yml down
        
        return 0
    else
        print_error "API benchmarks failed"
        
        # Cleanup
        cd "$BACKEND_DIR"
        docker-compose -f docker-compose.test.yml down
        
        return 1
    fi
}

# Function to run load testing
run_load_tests() {
    print_status "Running concurrent user load tests..."
    
    # Start full system for load testing
    cd "$BACKEND_DIR"
    docker-compose up -d
    
    # Wait for system to be ready
    sleep 30
    
    local timestamp=$(date '+%Y%m%d_%H%M%S')
    local results_file="$RESULTS_DIR/load/load_results_$timestamp.json"
    
    # Run load tests with Artillery
    if npx artillery run load-tests/concurrent-users.yml --output="$results_file"; then
        # Parse results
        local concurrent_users=$(jq -r '.aggregate.counters["vusers.created"]' "$results_file" 2>/dev/null || echo "0")
        local success_rate=$(jq -r '.aggregate.rates["http.response_time.ok"]' "$results_file" 2>/dev/null || echo "0")
        
        if [ "$concurrent_users" != "0" ]; then
            print_perf "Load Test - Concurrent Users: ${concurrent_users}, Success Rate: ${success_rate}%"
            
            if [ "$concurrent_users" -ge "$CONCURRENT_USERS_TARGET" ]; then
                print_success "Concurrent users target met (${concurrent_users} >= ${CONCURRENT_USERS_TARGET})"
            else
                print_warning "Concurrent users target missed (${concurrent_users} < ${CONCURRENT_USERS_TARGET})"
            fi
        fi
        
        print_success "Load tests completed"
        
        # Cleanup
        docker-compose down
        
        return 0
    else
        print_error "Load tests failed"
        
        # Cleanup
        docker-compose down
        
        return 1
    fi
}

# Function to run database performance benchmarks
run_database_benchmarks() {
    print_status "Running database performance benchmarks..."
    
    # Start database for testing
    cd "$BACKEND_DIR"
    docker-compose -f docker-compose.test.yml up -d postgres
    
    # Wait for database to be ready
    sleep 10
    
    local timestamp=$(date '+%Y%m%d_%H%M%S')
    local results_file="$RESULTS_DIR/api/db_results_$timestamp.json"
    
    # Run database benchmarks
    cd "$SERVICES_DIR/portfolio-service"
    
    if npm run benchmark:db -- --output="$results_file"; then
        # Parse results
        local avg_query_time=$(jq -r '.database.average_query_time_ms' "$results_file" 2>/dev/null || echo "0")
        local p95_query_time=$(jq -r '.database.p95_query_time_ms' "$results_file" 2>/dev/null || echo "0")
        
        if [ "$avg_query_time" != "0" ] && [ "$p95_query_time" != "0" ]; then
            print_perf "Database - Average: ${avg_query_time}ms, P95: ${p95_query_time}ms"
            
            if (( $(echo "$p95_query_time < 5" | bc -l) )); then
                print_success "Database query target met (${p95_query_time}ms < 5ms)"
            else
                print_warning "Database query target missed (${p95_query_time}ms >= 5ms)"
            fi
        fi
        
        print_success "Database benchmarks completed"
        
        # Cleanup
        cd "$BACKEND_DIR"
        docker-compose -f docker-compose.test.yml down
        
        return 0
    else
        print_error "Database benchmarks failed"
        
        # Cleanup
        cd "$BACKEND_DIR"
        docker-compose -f docker-compose.test.yml down
        
        return 1
    fi
}

# Function to generate benchmark report
generate_report() {
    print_status "Generating benchmark report..."
    
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    local report_file="$REPORTS_DIR/benchmark_report_$(date '+%Y%m%d_%H%M%S').md"
    
    cat > "$report_file" << EOF
# TradeFlow Backend Benchmark Report

**Generated:** $timestamp

## Performance Summary

### Latency Benchmarks (Target: < ${LATENCY_TARGET_US}μs)
EOF
    
    # Add latest latency results
    local latest_latency=$(ls -t "$RESULTS_DIR/latency/"*.json 2>/dev/null | head -1)
    if [ -n "$latest_latency" ]; then
        local p99_ns=$(jq -r '.trading_engine.p99_latency_ns' "$latest_latency" 2>/dev/null || echo "0")
        if [ "$p99_ns" != "0" ]; then
            local p99_us=$(echo "scale=2; $p99_ns / 1000" | bc -l)
            echo "- **Trading Engine P99**: ${p99_us}μs" >> "$report_file"
        fi
    fi
    
    cat >> "$report_file" << EOF

### Throughput Benchmarks (Target: > ${THROUGHPUT_TARGET_OPS} ops/sec)
EOF
    
    # Add latest throughput results
    local latest_throughput=$(ls -t "$RESULTS_DIR/throughput/"*.json 2>/dev/null | head -1)
    if [ -n "$latest_throughput" ]; then
        local ops_sec=$(jq -r '.market_data.operations_per_second' "$latest_throughput" 2>/dev/null || echo "0")
        if [ "$ops_sec" != "0" ]; then
            echo "- **Market Data Processing**: ${ops_sec} ops/sec" >> "$report_file"
        fi
    fi
    
    cat >> "$report_file" << EOF

### API Performance (Target: < ${API_LATENCY_TARGET_MS}ms P95)
EOF
    
    # Add latest API results
    local latest_api=$(ls -t "$RESULTS_DIR/api/"api_results_*.json 2>/dev/null | head -1)
    if [ -n "$latest_api" ]; then
        local p95_ms=$(jq -r '.api.p95_response_time_ms' "$latest_api" 2>/dev/null || echo "0")
        if [ "$p95_ms" != "0" ]; then
            echo "- **API Gateway P95**: ${p95_ms}ms" >> "$report_file"
        fi
    fi
    
    cat >> "$report_file" << EOF

### Load Testing (Target: > ${CONCURRENT_USERS_TARGET} users)
EOF
    
    # Add latest load test results
    local latest_load=$(ls -t "$RESULTS_DIR/load/"*.json 2>/dev/null | head -1)
    if [ -n "$latest_load" ]; then
        local users=$(jq -r '.aggregate.counters["vusers.created"]' "$latest_load" 2>/dev/null || echo "0")
        if [ "$users" != "0" ]; then
            echo "- **Concurrent Users**: ${users}" >> "$report_file"
        fi
    fi
    
    cat >> "$report_file" << EOF

## Detailed Results

### Raw Data Files
- Latency: \`benchmark-results/latency/\`
- Throughput: \`benchmark-results/throughput/\`
- Memory: \`benchmark-results/memory/\`
- API: \`benchmark-results/api/\`
- Load: \`benchmark-results/load/\`

### Running Benchmarks

\`\`\`bash
# All benchmarks
./scripts/run-benchmark-tests.sh

# Specific categories
./scripts/run-benchmark-tests.sh --latency
./scripts/run-benchmark-tests.sh --throughput
./scripts/run-benchmark-tests.sh --api
./scripts/run-benchmark-tests.sh --load
\`\`\`

### Performance Targets

| Metric | Target | Current | Status |
|--------|--------|---------|--------|
EOF
    
    # Add performance comparison table
    if [ -n "$latest_latency" ]; then
        local p99_ns=$(jq -r '.trading_engine.p99_latency_ns' "$latest_latency" 2>/dev/null || echo "0")
        if [ "$p99_ns" != "0" ]; then
            local p99_us=$(echo "scale=2; $p99_ns / 1000" | bc -l)
            local status="❌"
            if (( $(echo "$p99_us < $LATENCY_TARGET_US" | bc -l) )); then
                status="✅"
            fi
            echo "| Trading Latency | < ${LATENCY_TARGET_US}μs | ${p99_us}μs | $status |" >> "$report_file"
        fi
    fi
    
    print_success "Benchmark report generated: $report_file"
}

# Main execution function
main() {
    local run_latency=false
    local run_throughput=false
    local run_memory=false
    local run_api=false
    local run_load=false
    local run_database=false
    local run_all=true
    
    # Parse command line arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --latency)
                run_latency=true
                run_all=false
                shift
                ;;
            --throughput)
                run_throughput=true
                run_all=false
                shift
                ;;
            --memory)
                run_memory=true
                run_all=false
                shift
                ;;
            --api)
                run_api=true
                run_all=false
                shift
                ;;
            --load)
                run_load=true
                run_all=false
                shift
                ;;
            --database)
                run_database=true
                run_all=false
                shift
                ;;
            --cpp-only)
                run_latency=true
                run_throughput=true
                run_memory=true
                run_all=false
                shift
                ;;
            --nodejs-only)
                run_api=true
                run_load=true
                run_database=true
                run_all=false
                shift
                ;;
            --help)
                echo "Usage: $0 [OPTIONS]"
                echo ""
                echo "Options:"
                echo "  --latency      Run latency benchmarks only"
                echo "  --throughput   Run throughput benchmarks only"
                echo "  --memory       Run memory benchmarks only"
                echo "  --api          Run API benchmarks only"
                echo "  --load         Run load tests only"
                echo "  --database     Run database benchmarks only"
                echo "  --cpp-only     Run C++ benchmarks only"
                echo "  --nodejs-only  Run Node.js benchmarks only"
                echo "  --help         Show this help message"
                exit 0
                ;;
            *)
                print_error "Unknown option: $1"
                exit 1
                ;;
        esac
    done
    
    setup_directories
    
    local results=()
    
    # Run selected benchmarks
    if [ "$run_all" = true ] || [ "$run_latency" = true ]; then
        if run_latency_benchmarks; then
            results+=("latency:PASS")
        else
            results+=("latency:FAIL")
        fi
    fi
    
    if [ "$run_all" = true ] || [ "$run_throughput" = true ]; then
        if run_throughput_benchmarks; then
            results+=("throughput:PASS")
        else
            results+=("throughput:FAIL")
        fi
    fi
    
    if [ "$run_all" = true ] || [ "$run_memory" = true ]; then
        if run_memory_benchmarks; then
            results+=("memory:PASS")
        else
            results+=("memory:FAIL")
        fi
    fi
    
    if [ "$run_all" = true ] || [ "$run_api" = true ]; then
        if run_api_benchmarks; then
            results+=("api:PASS")
        else
            results+=("api:FAIL")
        fi
    fi
    
    if [ "$run_all" = true ] || [ "$run_load" = true ]; then
        if run_load_tests; then
            results+=("load:PASS")
        else
            results+=("load:FAIL")
        fi
    fi
    
    if [ "$run_all" = true ] || [ "$run_database" = true ]; then
        if run_database_benchmarks; then
            results+=("database:PASS")
        else
            results+=("database:FAIL")
        fi
    fi
    
    # Generate report
    generate_report
    
    # Print summary
    echo ""
    echo "===================================="
    print_status "Benchmark Suite Summary"
    echo "===================================="
    
    local failed_count=0
    for result in "${results[@]}"; do
        local test_name=$(echo "$result" | cut -d: -f1)
        local test_result=$(echo "$result" | cut -d: -f2)
        
        if [ "$test_result" = "PASS" ]; then
            print_success "$test_name benchmarks: PASSED"
        else
            print_error "$test_name benchmarks: FAILED"
            failed_count=$((failed_count + 1))
        fi
    done
    
    if [ $failed_count -eq 0 ]; then
        print_success "🎉 All benchmarks passed!"
        exit 0
    else
        print_error "❌ $failed_count benchmark(s) failed"
        exit 1
    fi
}

# Check if bc is available for calculations
if ! command -v bc >/dev/null 2>&1; then
    print_error "bc (basic calculator) is required but not installed"
    exit 1
fi

# Check if jq is available for JSON parsing
if ! command -v jq >/dev/null 2>&1; then
    print_error "jq is required but not installed"
    exit 1
fi

# Run main function
main "$@"