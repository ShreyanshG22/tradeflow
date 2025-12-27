#!/bin/bash

# Comprehensive Integration Test Runner for CI/CD
# Runs all test suites and collects metrics

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
TEST_TIMEOUT="${TEST_TIMEOUT:-300000}"
COVERAGE_THRESHOLD="${COVERAGE_THRESHOLD:-80}"
API_GATEWAY_URL="${API_GATEWAY_URL:-http://api-gateway-test:3000}"
DATABASE_URL="${DATABASE_URL:-postgresql://test_user:test_password@postgres-test:5432/test_db}"
REDIS_URL="${REDIS_URL:-redis://redis-test:6379}"

# Test execution tracking
EXECUTION_ID="test-$(date +%Y%m%d-%H%M%S)-$(echo $RANDOM | md5sum | head -c 8)"
START_TIME=$(date +%s)

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

# Function to log test execution
log_test_execution() {
    local status="$1"
    local duration_ms="$2"
    
    if command -v psql >/dev/null 2>&1; then
        local db_host=$(echo "$DATABASE_URL" | sed -n 's/.*@\([^:]*\):.*/\1/p')
        local db_port=$(echo "$DATABASE_URL" | sed -n 's/.*:\([0-9]*\)\/.*/\1/p')
        local db_name=$(echo "$DATABASE_URL" | sed -n 's/.*\/\([^?]*\).*/\1/p')
        local db_user=$(echo "$DATABASE_URL" | sed -n 's/.*\/\/\([^:]*\):.*/\1/p')
        local db_pass=$(echo "$DATABASE_URL" | sed -n 's/.*\/\/[^:]*:\([^@]*\)@.*/\1/p')
        
        export PGPASSWORD="$db_pass"
        
        psql -h "$db_host" -p "$db_port" -U "$db_user" -d "$db_name" << EOF
INSERT INTO test_executions (execution_id, commit_hash, branch, trigger_event, completed_at, status, total_duration_ms)
VALUES ('$EXECUTION_ID', '${GITHUB_SHA:-unknown}', '${GITHUB_REF_NAME:-unknown}', '${GITHUB_EVENT_NAME:-manual}', NOW(), '$status', $duration_ms)
ON CONFLICT (execution_id) DO UPDATE SET
    completed_at = NOW(),
    status = '$status',
    total_duration_ms = $duration_ms;
EOF
    fi
}

# Function to wait for services
wait_for_services() {
    print_status "Waiting for services to be ready..."
    
    local services=(
        "$API_GATEWAY_URL/health"
        "http://user-service-test:3000/health"
        "http://strategy-service-test:3000/health"
        "http://market-data-service-test:3000/health"
        "http://portfolio-service-test:3000/health"
    )
    
    local max_attempts=60
    local attempt=1
    
    for service_url in "${services[@]}"; do
        attempt=1
        while [ $attempt -le $max_attempts ]; do
            if curl -f -s "$service_url" >/dev/null 2>&1; then
                print_success "Service ready: $service_url"
                break
            fi
            
            if [ $attempt -eq $max_attempts ]; then
                print_error "Service failed to become ready: $service_url"
                return 1
            fi
            
            print_status "Waiting for service: $service_url (attempt $attempt/$max_attempts)"
            sleep 5
            attempt=$((attempt + 1))
        done
    done
    
    print_success "All services are ready"
}

# Function to run API health checks
run_health_checks() {
    print_status "Running comprehensive health checks..."
    
    local health_results="/app/test-results/health-check-results.json"
    
    cat > "$health_results" << EOF
{
  "execution_id": "$EXECUTION_ID",
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "health_checks": [
EOF
    
    local services=(
        "api-gateway:$API_GATEWAY_URL"
        "user-service:http://user-service-test:3000"
        "strategy-service:http://strategy-service-test:3000"
        "market-data-service:http://market-data-service-test:3000"
        "portfolio-service:http://portfolio-service-test:3000"
    )
    
    local first=true
    for service_info in "${services[@]}"; do
        local service_name=$(echo "$service_info" | cut -d: -f1)
        local service_url=$(echo "$service_info" | cut -d: -f2-)
        
        if [ "$first" = false ]; then
            echo "," >> "$health_results"
        fi
        first=false
        
        local start_time=$(date +%s%3N)
        local status_code=$(curl -s -o /dev/null -w "%{http_code}" "$service_url/health" || echo "000")
        local end_time=$(date +%s%3N)
        local response_time=$((end_time - start_time))
        
        local status="healthy"
        if [ "$status_code" != "200" ]; then
            status="unhealthy"
            print_warning "$service_name health check failed (HTTP $status_code)"
        else
            print_success "$service_name health check passed (${response_time}ms)"
        fi
        
        cat >> "$health_results" << EOF
    {
      "service": "$service_name",
      "url": "$service_url/health",
      "status": "$status",
      "status_code": $status_code,
      "response_time_ms": $response_time
    }
EOF
    done
    
    echo "  ]" >> "$health_results"
    echo "}" >> "$health_results"
    
    print_success "Health checks completed"
}

# Function to run authentication tests
run_auth_tests() {
    print_status "Running authentication integration tests..."
    
    local test_results="/app/test-results/auth-test-results.json"
    local start_time=$(date +%s%3N)
    
    # Test user registration
    local register_response=$(curl -s -X POST "$API_GATEWAY_URL/api/auth/register" \
        -H "Content-Type: application/json" \
        -d '{
            "email": "integration-test@example.com",
            "password": "TestPassword123!",
            "firstName": "Integration",
            "lastName": "Test"
        }' || echo '{"error": "request_failed"}')
    
    # Test user login
    local login_response=$(curl -s -X POST "$API_GATEWAY_URL/api/auth/login" \
        -H "Content-Type: application/json" \
        -d '{
            "email": "integration-test@example.com",
            "password": "TestPassword123!"
        }' || echo '{"error": "request_failed"}')
    
    local token=$(echo "$login_response" | jq -r '.token // empty')
    
    # Test protected endpoint
    local profile_response=""
    if [ -n "$token" ]; then
        profile_response=$(curl -s -X GET "$API_GATEWAY_URL/api/user/profile" \
            -H "Authorization: Bearer $token" || echo '{"error": "request_failed"}')
    fi
    
    local end_time=$(date +%s%3N)
    local duration=$((end_time - start_time))
    
    # Analyze results
    local register_success=$(echo "$register_response" | jq -r 'has("id")' 2>/dev/null || echo "false")
    local login_success=$(echo "$login_response" | jq -r 'has("token")' 2>/dev/null || echo "false")
    local profile_success=$(echo "$profile_response" | jq -r 'has("id")' 2>/dev/null || echo "false")
    
    local overall_status="passed"
    if [ "$register_success" != "true" ] || [ "$login_success" != "true" ] || [ "$profile_success" != "true" ]; then
        overall_status="failed"
    fi
    
    # Save results
    cat > "$test_results" << EOF
{
  "execution_id": "$EXECUTION_ID",
  "test_suite": "authentication",
  "status": "$overall_status",
  "duration_ms": $duration,
  "tests": {
    "user_registration": {
      "status": "$([ "$register_success" = "true" ] && echo "passed" || echo "failed")",
      "response": $register_response
    },
    "user_login": {
      "status": "$([ "$login_success" = "true" ] && echo "passed" || echo "failed")",
      "response": $login_response
    },
    "protected_endpoint": {
      "status": "$([ "$profile_success" = "true" ] && echo "passed" || echo "failed")",
      "response": $profile_response
    }
  }
}
EOF
    
    if [ "$overall_status" = "passed" ]; then
        print_success "Authentication tests passed"
    else
        print_error "Authentication tests failed"
    fi
    
    return $([ "$overall_status" = "passed" ] && echo 0 || echo 1)
}

# Function to run strategy tests
run_strategy_tests() {
    print_status "Running strategy integration tests..."
    
    local test_results="/app/test-results/strategy-test-results.json"
    local start_time=$(date +%s%3N)
    
    # First, get authentication token
    local login_response=$(curl -s -X POST "$API_GATEWAY_URL/api/auth/login" \
        -H "Content-Type: application/json" \
        -d '{
            "email": "trader1@example.com",
            "password": "TestPassword123!"
        }')
    
    local token=$(echo "$login_response" | jq -r '.token // empty')
    
    if [ -z "$token" ]; then
        print_error "Failed to get authentication token for strategy tests"
        return 1
    fi
    
    # Test strategy creation
    local strategy_data='{
        "name": "Integration Test Strategy",
        "description": "Test strategy for integration testing",
        "nodes": [
            {
                "id": "entry",
                "type": "entry",
                "config": {"side": "long", "orderType": "market"},
                "position": {"x": 100, "y": 100}
            }
        ],
        "connections": [],
        "parameters": {
            "timeframe": "1d",
            "symbols": ["AAPL"],
            "positionSizing": {"method": "fixed", "amount": 1000}
        }
    }'
    
    local create_response=$(curl -s -X POST "$API_GATEWAY_URL/api/strategies" \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer $token" \
        -d "$strategy_data" || echo '{"error": "request_failed"}')
    
    local strategy_id=$(echo "$create_response" | jq -r '.id // empty')
    
    # Test strategy retrieval
    local get_response=""
    if [ -n "$strategy_id" ]; then
        get_response=$(curl -s -X GET "$API_GATEWAY_URL/api/strategies/$strategy_id" \
            -H "Authorization: Bearer $token" || echo '{"error": "request_failed"}')
    fi
    
    # Test strategy validation
    local validate_response=""
    if [ -n "$strategy_id" ]; then
        validate_response=$(curl -s -X POST "$API_GATEWAY_URL/api/strategies/$strategy_id/validate" \
            -H "Authorization: Bearer $token" || echo '{"error": "request_failed"}')
    fi
    
    local end_time=$(date +%s%3N)
    local duration=$((end_time - start_time))
    
    # Analyze results
    local create_success=$(echo "$create_response" | jq -r 'has("id")' 2>/dev/null || echo "false")
    local get_success=$(echo "$get_response" | jq -r 'has("id")' 2>/dev/null || echo "false")
    local validate_success=$(echo "$validate_response" | jq -r '.valid // false' 2>/dev/null || echo "false")
    
    local overall_status="passed"
    if [ "$create_success" != "true" ] || [ "$get_success" != "true" ]; then
        overall_status="failed"
    fi
    
    # Save results
    cat > "$test_results" << EOF
{
  "execution_id": "$EXECUTION_ID",
  "test_suite": "strategy",
  "status": "$overall_status",
  "duration_ms": $duration,
  "tests": {
    "strategy_creation": {
      "status": "$([ "$create_success" = "true" ] && echo "passed" || echo "failed")",
      "strategy_id": "$strategy_id"
    },
    "strategy_retrieval": {
      "status": "$([ "$get_success" = "true" ] && echo "passed" || echo "failed")"
    },
    "strategy_validation": {
      "status": "$([ "$validate_success" = "true" ] && echo "passed" || echo "failed")"
    }
  }
}
EOF
    
    if [ "$overall_status" = "passed" ]; then
        print_success "Strategy tests passed"
    else
        print_error "Strategy tests failed"
    fi
    
    return $([ "$overall_status" = "passed" ] && echo 0 || echo 1)
}

# Function to run market data tests
run_market_data_tests() {
    print_status "Running market data integration tests..."
    
    local test_results="/app/test-results/market-data-test-results.json"
    local start_time=$(date +%s%3N)
    
    # Test market data endpoints
    local symbols_response=$(curl -s -X GET "$API_GATEWAY_URL/api/market-data/symbols" || echo '{"error": "request_failed"}')
    local price_response=$(curl -s -X GET "$API_GATEWAY_URL/api/market-data/price/AAPL" || echo '{"error": "request_failed"}')
    local historical_response=$(curl -s -X GET "$API_GATEWAY_URL/api/market-data/historical/AAPL?timeframe=1d&limit=10" || echo '{"error": "request_failed"}')
    
    local end_time=$(date +%s%3N)
    local duration=$((end_time - start_time))
    
    # Analyze results
    local symbols_success=$(echo "$symbols_response" | jq -r 'type == "array"' 2>/dev/null || echo "false")
    local price_success=$(echo "$price_response" | jq -r 'has("price")' 2>/dev/null || echo "false")
    local historical_success=$(echo "$historical_response" | jq -r 'type == "array"' 2>/dev/null || echo "false")
    
    local overall_status="passed"
    if [ "$symbols_success" != "true" ] || [ "$price_success" != "true" ] || [ "$historical_success" != "true" ]; then
        overall_status="failed"
    fi
    
    # Save results
    cat > "$test_results" << EOF
{
  "execution_id": "$EXECUTION_ID",
  "test_suite": "market_data",
  "status": "$overall_status",
  "duration_ms": $duration,
  "tests": {
    "symbols_list": {
      "status": "$([ "$symbols_success" = "true" ] && echo "passed" || echo "failed")"
    },
    "current_price": {
      "status": "$([ "$price_success" = "true" ] && echo "passed" || echo "failed")"
    },
    "historical_data": {
      "status": "$([ "$historical_success" = "true" ] && echo "passed" || echo "failed")"
    }
  }
}
EOF
    
    if [ "$overall_status" = "passed" ]; then
        print_success "Market data tests passed"
    else
        print_error "Market data tests failed"
    fi
    
    return $([ "$overall_status" = "passed" ] && echo 0 || echo 1)
}

# Function to run load tests
run_load_tests() {
    print_status "Running load tests..."
    
    local load_config="/tmp/load-test-config.yml"
    
    cat > "$load_config" << EOF
config:
  target: '$API_GATEWAY_URL'
  phases:
    - duration: 60
      arrivalRate: 10
      name: "Warm up"
    - duration: 120
      arrivalRate: 50
      name: "Load test"
  defaults:
    headers:
      Content-Type: 'application/json'

scenarios:
  - name: "API Load Test"
    weight: 100
    flow:
      - post:
          url: "/api/auth/login"
          json:
            email: "trader1@example.com"
            password: "TestPassword123!"
          capture:
            - json: "$.token"
              as: "authToken"
      - get:
          url: "/api/user/profile"
          headers:
            Authorization: "Bearer {{ authToken }}"
      - get:
          url: "/api/strategies"
          headers:
            Authorization: "Bearer {{ authToken }}"
      - get:
          url: "/api/market-data/price/AAPL"
EOF
    
    local load_results="/app/test-results/load-test-results.json"
    
    if command -v artillery >/dev/null 2>&1; then
        artillery run "$load_config" --output "$load_results" || true
        print_success "Load tests completed"
    else
        print_warning "Artillery not available, skipping load tests"
        echo '{"status": "skipped", "reason": "artillery_not_available"}' > "$load_results"
    fi
}

# Function to generate comprehensive test report
generate_test_report() {
    print_status "Generating comprehensive test report..."
    
    local report_file="/app/test-results/integration-test-report.html"
    local end_time=$(date +%s)
    local total_duration=$((end_time - START_TIME))
    
    cat > "$report_file" << EOF
<!DOCTYPE html>
<html>
<head>
    <title>TradeFlow Integration Test Report</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; background-color: #f5f5f5; }
        .container { max-width: 1200px; margin: 0 auto; background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .header { text-align: center; margin-bottom: 30px; }
        .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-bottom: 30px; }
        .summary-card { background: #f9f9f9; border-radius: 8px; padding: 15px; text-align: center; }
        .summary-value { font-size: 2em; font-weight: bold; }
        .passed { color: #4CAF50; }
        .failed { color: #f44336; }
        .warning { color: #FF9800; }
        .test-results { margin-bottom: 30px; }
        .test-suite { border: 1px solid #ddd; border-radius: 8px; margin-bottom: 15px; }
        .test-suite-header { background: #f2f2f2; padding: 15px; font-weight: bold; border-radius: 8px 8px 0 0; }
        .test-suite-body { padding: 15px; }
        .test-case { display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid #eee; }
        .test-case:last-child { border-bottom: none; }
        .status-badge { padding: 4px 8px; border-radius: 4px; color: white; font-size: 0.8em; }
        .status-passed { background-color: #4CAF50; }
        .status-failed { background-color: #f44336; }
        .status-skipped { background-color: #FF9800; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>TradeFlow Integration Test Report</h1>
            <p><strong>Execution ID:</strong> $EXECUTION_ID</p>
            <p><strong>Generated:</strong> $(date)</p>
            <p><strong>Total Duration:</strong> ${total_duration}s</p>
            <p><strong>Commit:</strong> ${GITHUB_SHA:-unknown}</p>
            <p><strong>Branch:</strong> ${GITHUB_REF_NAME:-unknown}</p>
        </div>
        
        <div class="summary">
EOF
    
    # Calculate summary statistics
    local total_tests=0
    local passed_tests=0
    local failed_tests=0
    
    for result_file in /app/test-results/*-test-results.json; do
        if [ -f "$result_file" ]; then
            local suite_status=$(jq -r '.status // "unknown"' "$result_file" 2>/dev/null || echo "unknown")
            total_tests=$((total_tests + 1))
            
            if [ "$suite_status" = "passed" ]; then
                passed_tests=$((passed_tests + 1))
            else
                failed_tests=$((failed_tests + 1))
            fi
        fi
    done
    
    local success_rate=0
    if [ $total_tests -gt 0 ]; then
        success_rate=$(echo "scale=1; $passed_tests * 100 / $total_tests" | bc -l)
    fi
    
    cat >> "$report_file" << EOF
            <div class="summary-card">
                <div class="summary-value">$total_tests</div>
                <div>Total Suites</div>
            </div>
            <div class="summary-card">
                <div class="summary-value passed">$passed_tests</div>
                <div>Passed</div>
            </div>
            <div class="summary-card">
                <div class="summary-value failed">$failed_tests</div>
                <div>Failed</div>
            </div>
            <div class="summary-card">
                <div class="summary-value">$success_rate%</div>
                <div>Success Rate</div>
            </div>
        </div>
        
        <div class="test-results">
            <h2>Test Suite Results</h2>
EOF
    
    # Add individual test suite results
    for result_file in /app/test-results/*-test-results.json; do
        if [ -f "$result_file" ]; then
            local suite_name=$(jq -r '.test_suite // "unknown"' "$result_file" 2>/dev/null || echo "unknown")
            local suite_status=$(jq -r '.status // "unknown"' "$result_file" 2>/dev/null || echo "unknown")
            local suite_duration=$(jq -r '.duration_ms // 0' "$result_file" 2>/dev/null || echo "0")
            
            local status_class="status-passed"
            if [ "$suite_status" = "failed" ]; then
                status_class="status-failed"
            elif [ "$suite_status" = "skipped" ]; then
                status_class="status-skipped"
            fi
            
            cat >> "$report_file" << EOF
            <div class="test-suite">
                <div class="test-suite-header">
                    $suite_name
                    <span class="status-badge $status_class">$suite_status</span>
                    <span style="float: right;">Duration: ${suite_duration}ms</span>
                </div>
                <div class="test-suite-body">
EOF
            
            # Add individual test cases if available
            if jq -e '.tests' "$result_file" >/dev/null 2>&1; then
                jq -r '.tests | to_entries[] | "\(.key)|\(.value.status)"' "$result_file" 2>/dev/null | while IFS='|' read -r test_name test_status; do
                    local test_status_class="status-passed"
                    if [ "$test_status" = "failed" ]; then
                        test_status_class="status-failed"
                    fi
                    
                    cat >> "$report_file" << EOF
                    <div class="test-case">
                        <span>$test_name</span>
                        <span class="status-badge $test_status_class">$test_status</span>
                    </div>
EOF
                done
            fi
            
            echo "                </div>" >> "$report_file"
            echo "            </div>" >> "$report_file"
        fi
    done
    
    cat >> "$report_file" << EOF
        </div>
    </div>
</body>
</html>
EOF
    
    print_success "Test report generated: $report_file"
}

# Main execution
main() {
    print_status "Starting comprehensive integration test suite..."
    print_status "Execution ID: $EXECUTION_ID"
    
    # Initialize test execution record
    log_test_execution "running" 0
    
    local overall_status="passed"
    local test_failures=0
    
    # Wait for services
    if ! wait_for_services; then
        print_error "Services failed to become ready"
        log_test_execution "failed" $(($(date +%s) - START_TIME))
        exit 1
    fi
    
    # Run health checks
    run_health_checks
    
    # Run integration tests
    print_status "Running integration test suites..."
    
    if ! run_auth_tests; then
        test_failures=$((test_failures + 1))
        overall_status="failed"
    fi
    
    if ! run_strategy_tests; then
        test_failures=$((test_failures + 1))
        overall_status="failed"
    fi
    
    if ! run_market_data_tests; then
        test_failures=$((test_failures + 1))
        overall_status="failed"
    fi
    
    # Run load tests
    run_load_tests
    
    # Collect metrics
    if [ -f "/app/scripts/test-metrics-collector.sh" ]; then
        print_status "Collecting test metrics..."
        /app/scripts/test-metrics-collector.sh collect || print_warning "Failed to collect metrics"
    fi
    
    # Generate report
    generate_test_report
    
    # Log final execution status
    local end_time=$(date +%s)
    local total_duration_ms=$(((end_time - START_TIME) * 1000))
    log_test_execution "$overall_status" "$total_duration_ms"
    
    # Final results
    echo ""
    print_status "Integration Test Suite Summary"
    echo "======================================"
    print_status "Execution ID: $EXECUTION_ID"
    print_status "Total Duration: $((end_time - START_TIME))s"
    print_status "Test Failures: $test_failures"
    
    if [ "$overall_status" = "passed" ]; then
        print_success "🎉 All integration tests passed!"
        exit 0
    else
        print_error "❌ Integration tests failed ($test_failures failures)"
        exit 1
    fi
}

# Run main function
main "$@"