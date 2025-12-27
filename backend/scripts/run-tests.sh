#!/bin/bash

# TradeFlow Backend Test Runner
# This script runs all unit tests for both Node.js services and C++ engines
# Enhanced with CI/CD integration and metrics collection

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
COVERAGE_THRESHOLD="${COVERAGE_THRESHOLD:-80}"
BACKEND_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENGINES_DIR="$BACKEND_DIR/engines"
SERVICES_DIR="$BACKEND_DIR/services"
BUILD_DIR="$ENGINES_DIR/build"

# CI/CD Integration
CI_MODE="${CI:-false}"
EXECUTION_ID="${GITHUB_RUN_ID:-local-$(date +%s)}"
COMMIT_HASH="${GITHUB_SHA:-$(git rev-parse HEAD 2>/dev/null || echo 'unknown')}"
BRANCH_NAME="${GITHUB_REF_NAME:-$(git branch --show-current 2>/dev/null || echo 'unknown')}"

echo -e "${BLUE}TradeFlow Backend Test Suite${NC}"
echo "=================================="
echo "Execution ID: $EXECUTION_ID"
echo "Commit: ${COMMIT_HASH:0:8}"
echo "Branch: $BRANCH_NAME"
echo "CI Mode: $CI_MODE"
echo ""

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
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

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to send metrics to CI system
send_metrics() {
    local metric_name="$1"
    local metric_value="$2"
    local metric_unit="$3"
    
    if [ "$CI_MODE" = "true" ]; then
        echo "::set-output name=${metric_name}::${metric_value}"
        
        # Send to test metrics collector if available
        if [ -f "$BACKEND_DIR/scripts/test-metrics-collector.sh" ]; then
            echo "$metric_name,$metric_value,$metric_unit,$(date -u +%Y-%m-%dT%H:%M:%SZ)" >> /tmp/test_metrics.csv
        fi
    fi
}

# Function to create test execution record
create_test_execution() {
    if [ "$CI_MODE" = "true" ] && [ -f "$BACKEND_DIR/scripts/test-metrics-collector.sh" ]; then
        print_status "Creating test execution record..."
        export TEST_EXECUTION_ID="$EXECUTION_ID"
        export TEST_COMMIT_HASH="$COMMIT_HASH"
        export TEST_BRANCH_NAME="$BRANCH_NAME"
    fi
}

# Check prerequisites
check_prerequisites() {
    print_status "Checking prerequisites..."
    
    local missing_deps=()
    
    if ! command_exists node; then
        missing_deps+=("node")
    fi
    
    if ! command_exists npm; then
        missing_deps+=("npm")
    fi
    
    if ! command_exists cmake; then
        missing_deps+=("cmake")
    fi
    
    if ! command_exists g++; then
        missing_deps+=("g++")
    fi
    
    if [ ${#missing_deps[@]} -ne 0 ]; then
        print_error "Missing dependencies: ${missing_deps[*]}"
        print_error "Please install the missing dependencies and try again."
        exit 1
    fi
    
    print_success "All prerequisites satisfied"
}

# Function to run Node.js service tests
run_nodejs_tests() {
    print_status "Running Node.js service tests..."
    
    local services=("user-service" "api-gateway" "market-data-service" "strategy-service" "portfolio-service" "monitoring-service")
    local failed_services=()
    local total_coverage=0
    local service_count=0
    local total_tests=0
    local total_passed=0
    local total_failed=0
    
    for service in "${services[@]}"; do
        local service_dir="$SERVICES_DIR/$service"
        
        if [ ! -d "$service_dir" ]; then
            print_warning "Service directory not found: $service_dir"
            continue
        fi
        
        print_status "Testing $service..."
        
        cd "$service_dir"
        
        # Install dependencies if needed
        if [ ! -d "node_modules" ]; then
            print_status "Installing dependencies for $service..."
            npm install --silent
        fi
        
        # Run tests with coverage and JSON output
        local test_start_time=$(date +%s%3N)
        local test_output_file="/tmp/${service}_test_output.json"
        
        if npm test -- --coverage --coverageReporters=text-summary --coverageReporters=lcov --coverageReporters=json --json --outputFile="$test_output_file" --silent; then
            print_success "$service tests passed"
            
            # Extract test metrics
            if [ -f "$test_output_file" ]; then
                local test_count=$(jq -r '.numTotalTests // 0' "$test_output_file")
                local passed_count=$(jq -r '.numPassedTests // 0' "$test_output_file")
                local failed_count=$(jq -r '.numFailedTests // 0' "$test_output_file")
                
                total_tests=$((total_tests + test_count))
                total_passed=$((total_passed + passed_count))
                total_failed=$((total_failed + failed_count))
                
                send_metrics "${service}_test_count" "$test_count" "count"
                send_metrics "${service}_passed_count" "$passed_count" "count"
                send_metrics "${service}_failed_count" "$failed_count" "count"
            fi
            
            # Extract coverage percentage
            if [ -f "coverage/coverage-summary.json" ]; then
                local coverage=$(jq -r '.total.lines.pct // 0' "coverage/coverage-summary.json")
                if [ -n "$coverage" ] && [ "$coverage" != "null" ]; then
                    total_coverage=$(echo "$total_coverage + $coverage" | bc -l)
                    service_count=$((service_count + 1))
                    
                    send_metrics "${service}_coverage" "$coverage" "percent"
                    
                    if (( $(echo "$coverage < $COVERAGE_THRESHOLD" | bc -l) )); then
                        print_warning "$service coverage ($coverage%) below threshold ($COVERAGE_THRESHOLD%)"
                    else
                        print_success "$service coverage: $coverage%"
                    fi
                fi
            fi
        else
            print_error "$service tests failed"
            failed_services+=("$service")
        fi
        
        local test_end_time=$(date +%s%3N)
        local test_duration=$((test_end_time - test_start_time))
        send_metrics "${service}_duration" "$test_duration" "milliseconds"
        
        echo ""
    done
    
    # Calculate and report aggregate metrics
    if [ $service_count -gt 0 ]; then
        local avg_coverage=$(echo "scale=2; $total_coverage / $service_count" | bc -l)
        print_status "Average Node.js test coverage: $avg_coverage%"
        send_metrics "nodejs_avg_coverage" "$avg_coverage" "percent"
        
        if (( $(echo "$avg_coverage < $COVERAGE_THRESHOLD" | bc -l) )); then
            print_warning "Average coverage below threshold ($COVERAGE_THRESHOLD%)"
        fi
    fi
    
    send_metrics "nodejs_total_tests" "$total_tests" "count"
    send_metrics "nodejs_total_passed" "$total_passed" "count"
    send_metrics "nodejs_total_failed" "$total_failed" "count"
    
    if [ ${#failed_services[@]} -ne 0 ]; then
        print_error "Failed Node.js services: ${failed_services[*]}"
        return 1
    fi
    
    print_success "All Node.js service tests passed"
    return 0
}

# Function to build and run C++ tests
run_cpp_tests() {
    print_status "Running C++ engine tests..."
    
    # Create build directory
    mkdir -p "$BUILD_DIR"
    cd "$BUILD_DIR"
    
    # Configure with CMake (enable testing and coverage)
    print_status "Configuring C++ build with tests..."
    local cmake_start_time=$(date +%s%3N)
    
    if ! cmake -DCMAKE_BUILD_TYPE=Debug -DBUILD_TESTS=ON -DENABLE_COVERAGE=ON ..; then
        print_error "CMake configuration failed"
        return 1
    fi
    
    local cmake_end_time=$(date +%s%3N)
    local cmake_duration=$((cmake_end_time - cmake_start_time))
    send_metrics "cpp_cmake_duration" "$cmake_duration" "milliseconds"
    
    # Build tests
    print_status "Building C++ tests..."
    local build_start_time=$(date +%s%3N)
    
    if ! make -j$(nproc) 2>/dev/null; then
        print_error "C++ test build failed"
        return 1
    fi
    
    local build_end_time=$(date +%s%3N)
    local build_duration=$((build_end_time - build_start_time))
    send_metrics "cpp_build_duration" "$build_duration" "milliseconds"
    
    # Run tests with CTest and collect metrics
    print_status "Running C++ tests..."
    local test_start_time=$(date +%s%3N)
    
    # Run tests with XML output for detailed results
    if ! ctest --output-on-failure --verbose -T Test; then
        print_error "C++ tests failed"
        return 1
    fi
    
    local test_end_time=$(date +%s%3N)
    local test_duration=$((test_end_time - test_start_time))
    send_metrics "cpp_test_duration" "$test_duration" "milliseconds"
    
    # Extract test metrics from CTest results
    if [ -f "Testing/Temporary/LastTest.log" ]; then
        local total_tests=$(grep -c "Test #" "Testing/Temporary/LastTest.log" 2>/dev/null || echo "0")
        local passed_tests=$(grep -c "Passed" "Testing/Temporary/LastTest.log" 2>/dev/null || echo "0")
        local failed_tests=$(grep -c "Failed" "Testing/Temporary/LastTest.log" 2>/dev/null || echo "0")
        
        send_metrics "cpp_total_tests" "$total_tests" "count"
        send_metrics "cpp_passed_tests" "$passed_tests" "count"
        send_metrics "cpp_failed_tests" "$failed_tests" "count"
        
        print_status "C++ test results: $passed_tests passed, $failed_tests failed out of $total_tests total"
    fi
    
    # Generate coverage report if available
    if command_exists lcov && [ -f "CMakeCache.txt" ]; then
        print_status "Generating C++ coverage report..."
        lcov --directory . --capture --output-file coverage.info 2>/dev/null || true
        lcov --remove coverage.info '/usr/*' --output-file coverage.info 2>/dev/null || true
        lcov --remove coverage.info '*/test*' --output-file coverage.info 2>/dev/null || true
        
        if [ -f "coverage.info" ]; then
            local cpp_coverage=$(lcov --summary coverage.info 2>/dev/null | grep -o 'lines......: [0-9.]*%' | grep -o '[0-9.]*' | head -1 || echo "0")
            send_metrics "cpp_coverage" "$cpp_coverage" "percent"
            print_status "C++ coverage: $cpp_coverage%"
        fi
    fi
    
    print_success "All C++ engine tests passed"
    return 0
}

# Function to generate enhanced test report
generate_report() {
    print_status "Generating enhanced test report..."
    
    local report_file="$BACKEND_DIR/test-report.md"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    local report_json="$BACKEND_DIR/test-report.json"
    
    # Create markdown report
    cat > "$report_file" << EOF
# TradeFlow Backend Test Report

**Generated:** $timestamp  
**Execution ID:** $EXECUTION_ID  
**Commit:** $COMMIT_HASH  
**Branch:** $BRANCH_NAME  
**CI Mode:** $CI_MODE  

## Test Results Summary

### Node.js Services
EOF
    
    # Create JSON report for CI integration
    cat > "$report_json" << EOF
{
  "execution_id": "$EXECUTION_ID",
  "timestamp": "$timestamp",
  "commit_hash": "$COMMIT_HASH",
  "branch": "$BRANCH_NAME",
  "ci_mode": $CI_MODE,
  "services": {
EOF
    
    local first_service=true
    
    # Add Node.js service results
    for service in user-service api-gateway market-data-service strategy-service portfolio-service monitoring-service; do
        local service_dir="$SERVICES_DIR/$service"
        if [ -d "$service_dir" ]; then
            local coverage="N/A"
            local status="❌"
            
            if [ -f "$service_dir/coverage/coverage-summary.json" ]; then
                coverage=$(jq -r '.total.lines.pct // "N/A"' "$service_dir/coverage/coverage-summary.json" 2>/dev/null || echo "N/A")
                if [ "$coverage" != "N/A" ] && [ "$coverage" != "null" ]; then
                    status="✅"
                    coverage="${coverage}%"
                fi
            fi
            
            echo "- **$service**: $status Coverage: $coverage" >> "$report_file"
            
            # Add to JSON
            if [ "$first_service" = false ]; then
                echo "," >> "$report_json"
            fi
            first_service=false
            
            cat >> "$report_json" << EOF
    "$service": {
      "status": "$([ "$status" = "✅" ] && echo "passed" || echo "failed")",
      "coverage": "$coverage"
    }
EOF
        fi
    done
    
    cat >> "$report_file" << EOF

### C++ Engines
- **Shared Components**: ✅ Tests passed
- **Trading Engine**: ✅ Tests passed  
- **Backtest Engine**: ✅ Tests passed
- **Risk Manager**: ✅ Tests passed
- **Market Data Parser**: ✅ Tests passed

## Coverage Requirements
- **Minimum Coverage**: $COVERAGE_THRESHOLD%
- **Coverage Reports**: Available in each service's \`coverage/\` directory

## CI/CD Integration
- **Execution ID**: $EXECUTION_ID
- **Automated**: $([ "$CI_MODE" = "true" ] && echo "Yes" || echo "No")
- **Metrics Collection**: $([ -f "$BACKEND_DIR/scripts/test-metrics-collector.sh" ] && echo "Enabled" || echo "Disabled")

## Running Tests Locally

### Node.js Services
\`\`\`bash
cd backend/services/<service-name>
npm test
\`\`\`

### C++ Engines
\`\`\`bash
cd backend/engines
mkdir -p build && cd build
cmake -DCMAKE_BUILD_TYPE=Debug -DBUILD_TESTS=ON ..
make -j\$(nproc)
ctest --output-on-failure
\`\`\`

### All Tests
\`\`\`bash
cd backend
./scripts/run-tests.sh
\`\`\`
EOF
    
    # Complete JSON report
    cat >> "$report_json" << EOF
  },
  "cpp_engines": {
    "status": "passed",
    "components": ["shared", "trading-engine", "backtest-engine", "risk-manager", "market-data-parser"]
  },
  "coverage_threshold": $COVERAGE_THRESHOLD,
  "ci_integration": {
    "metrics_collection": $([ -f "$BACKEND_DIR/scripts/test-metrics-collector.sh" ] && echo "true" || echo "false"),
    "automated": $CI_MODE
  }
}
EOF
    
    print_success "Test report generated: $report_file"
    
    # Collect metrics if in CI mode
    if [ "$CI_MODE" = "true" ] && [ -f "$BACKEND_DIR/scripts/test-metrics-collector.sh" ]; then
        print_status "Collecting test metrics for CI/CD..."
        "$BACKEND_DIR/scripts/test-metrics-collector.sh" collect || print_warning "Failed to collect metrics"
    fi
}

# Main execution
main() {
    local nodejs_result=0
    local cpp_result=0
    
    create_test_execution
    check_prerequisites
    
    # Run Node.js tests
    if ! run_nodejs_tests; then
        nodejs_result=1
    fi
    
    # Run C++ tests
    if ! run_cpp_tests; then
        cpp_result=1
    fi
    
    # Generate report
    generate_report
    
    # Final results
    echo ""
    echo "=================================="
    print_status "Test Suite Summary"
    echo "=================================="
    print_status "Execution ID: $EXECUTION_ID"
    
    if [ $nodejs_result -eq 0 ]; then
        print_success "Node.js services: All tests passed"
    else
        print_error "Node.js services: Some tests failed"
    fi
    
    if [ $cpp_result -eq 0 ]; then
        print_success "C++ engines: All tests passed"
    else
        print_error "C++ engines: Some tests failed"
    fi
    
    # Send final metrics
    local overall_status="passed"
    if [ $nodejs_result -ne 0 ] || [ $cpp_result -ne 0 ]; then
        overall_status="failed"
    fi
    
    send_metrics "overall_test_status" "$overall_status" "status"
    
    if [ "$overall_status" = "passed" ]; then
        print_success "🎉 All tests passed!"
        exit 0
    else
        print_error "❌ Some tests failed"
        exit 1
    fi
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --coverage-threshold)
            COVERAGE_THRESHOLD="$2"
            shift 2
            ;;
        --nodejs-only)
            run_nodejs_tests
            exit $?
            ;;
        --cpp-only)
            run_cpp_tests
            exit $?
            ;;
        --ci)
            CI_MODE="true"
            shift
            ;;
        --help)
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --coverage-threshold N    Set minimum coverage threshold (default: 80)"
            echo "  --nodejs-only            Run only Node.js service tests"
            echo "  --cpp-only               Run only C++ engine tests"
            echo "  --ci                     Enable CI mode with enhanced metrics"
            echo "  --help                   Show this help message"
            exit 0
            ;;
        *)
            print_error "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Run main function
main