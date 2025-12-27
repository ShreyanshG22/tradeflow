#!/bin/bash

# Production Environment Smoke Tests for TradeFlow Backend

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
TEST_RESULTS_DIR="$PROJECT_ROOT/production-smoke-results"

# Configuration
TIMEOUT=30
RETRY_COUNT=3
RETRY_DELAY=5

# Default endpoints (can be overridden via environment variables)
API_GATEWAY_URL=${API_GATEWAY_URL:-"http://localhost:3000"}
USER_SERVICE_URL=${USER_SERVICE_URL:-"http://localhost:3001"}
STRATEGY_SERVICE_URL=${STRATEGY_SERVICE_URL:-"http://localhost:3002"}
PORTFOLIO_SERVICE_URL=${PORTFOLIO_SERVICE_URL:-"http://localhost:3003"}
MARKET_DATA_SERVICE_URL=${MARKET_DATA_SERVICE_URL:-"http://localhost:3004"}

echo -e "${GREEN}🔍 Production Environment Smoke Tests${NC}"
echo -e "${BLUE}Testing production environment health and functionality...${NC}"

# Create results directory
mkdir -p "$TEST_RESULTS_DIR"

# Function to log with timestamp
log() {
    echo -e "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$TEST_RESULTS_DIR/smoke-tests.log"
}

# Function to make HTTP request with retries
make_request() {
    local url=$1
    local method=${2:-GET}
    local data=${3:-""}
    local headers=${4:-""}
    local expected_status=${5:-200}
    
    local attempt=1
    while [ $attempt -le $RETRY_COUNT ]; do
        local response
        local status_code
        
        if [ -n "$data" ]; then
            response=$(curl -s -w "\n%{http_code}" -X "$method" "$url" \
                -H "Content-Type: application/json" \
                $headers \
                -d "$data" \
                --max-time $TIMEOUT 2>/dev/null || echo -e "\nERROR")
        else
            response=$(curl -s -w "\n%{http_code}" -X "$method" "$url" \
                $headers \
                --max-time $TIMEOUT 2>/dev/null || echo -e "\nERROR")
        fi
        
        status_code=$(echo "$response" | tail -n1)
        response_body=$(echo "$response" | head -n -1)
        
        if [ "$status_code" = "$expected_status" ]; then
            echo "$response_body"
            return 0
        fi
        
        log "${YELLOW}⚠️  Attempt $attempt failed: HTTP $status_code${NC}"
        
        if [ $attempt -lt $RETRY_COUNT ]; then
            sleep $RETRY_DELAY
        fi
        
        ((attempt++))
    done
    
    log "${RED}❌ Request failed after $RETRY_COUNT attempts${NC}"
    return 1
}

# Function to test service health
test_service_health() {
    local service_name=$1
    local service_url=$2
    
    log "${BLUE}Testing $service_name health...${NC}"
    
    local health_response=$(make_request "$service_url/health" "GET" "" "" "200")
    
    if [ $? -eq 0 ]; then
        log "${GREEN}✅ $service_name is healthy${NC}"
        
        # Parse health response if it's JSON
        if echo "$health_response" | jq . &>/dev/null; then
            local status=$(echo "$health_response" | jq -r '.status // "unknown"')
            local uptime=$(echo "$health_response" | jq -r '.uptime // "unknown"')
            local version=$(echo "$health_response" | jq -r '.version // "unknown"')
            
            log "${BLUE}  Status: $status, Uptime: $uptime, Version: $version${NC}"
        fi
        
        return 0
    else
        log "${RED}❌ $service_name health check failed${NC}"
        return 1
    fi
}

# Function to test database connectivity
test_database_connectivity() {
    log "${BLUE}Testing database connectivity...${NC}"
    
    # Test through API Gateway
    local db_health=$(make_request "$API_GATEWAY_URL/api/health/database" "GET" "" "" "200")
    
    if [ $? -eq 0 ]; then
        log "${GREEN}✅ Database connectivity is healthy${NC}"
        
        if echo "$db_health" | jq . &>/dev/null; then
            local connection_count=$(echo "$db_health" | jq -r '.connections // "unknown"')
            local pool_size=$(echo "$db_health" | jq -r '.poolSize // "unknown"')
            
            log "${BLUE}  Active connections: $connection_count, Pool size: $pool_size${NC}"
        fi
        
        return 0
    else
        log "${RED}❌ Database connectivity test failed${NC}"
        return 1
    fi
}

# Function to test Redis connectivity
test_redis_connectivity() {
    log "${BLUE}Testing Redis connectivity...${NC}"
    
    # Test through API Gateway
    local redis_health=$(make_request "$API_GATEWAY_URL/api/health/redis" "GET" "" "" "200")
    
    if [ $? -eq 0 ]; then
        log "${GREEN}✅ Redis connectivity is healthy${NC}"
        
        if echo "$redis_health" | jq . &>/dev/null; then
            local memory_usage=$(echo "$redis_health" | jq -r '.memoryUsage // "unknown"')
            local connected_clients=$(echo "$redis_health" | jq -r '.connectedClients // "unknown"')
            
            log "${BLUE}  Memory usage: $memory_usage, Connected clients: $connected_clients${NC}"
        fi
        
        return 0
    else
        log "${RED}❌ Redis connectivity test failed${NC}"
        return 1
    fi
}

# Function to test authentication flow
test_authentication() {
    log "${BLUE}Testing authentication flow...${NC}"
    
    # Test user registration (with unique email)
    local test_email="smoke-test-$(date +%s)@example.com"
    local register_data='{
        "email": "'$test_email'",
        "password": "SmokeTest123!",
        "firstName": "Smoke",
        "lastName": "Test"
    }'
    
    local register_response=$(make_request "$API_GATEWAY_URL/api/auth/register" "POST" "$register_data" "" "201")
    
    if [ $? -eq 0 ]; then
        log "${GREEN}✅ User registration successful${NC}"
        
        # Test login
        local login_data='{
            "email": "'$test_email'",
            "password": "SmokeTest123!"
        }'
        
        local login_response=$(make_request "$API_GATEWAY_URL/api/auth/login" "POST" "$login_data" "" "200")
        
        if [ $? -eq 0 ]; then
            log "${GREEN}✅ User login successful${NC}"
            
            # Extract token for further tests
            local token=$(echo "$login_response" | jq -r '.token // ""')
            
            if [ -n "$token" ] && [ "$token" != "null" ]; then
                log "${GREEN}✅ JWT token received${NC}"
                echo "$token" > "$TEST_RESULTS_DIR/test-token.txt"
                return 0
            else
                log "${RED}❌ No JWT token in login response${NC}"
                return 1
            fi
        else
            log "${RED}❌ User login failed${NC}"
            return 1
        fi
    else
        log "${RED}❌ User registration failed${NC}"
        return 1
    fi
}

# Function to test market data endpoints
test_market_data() {
    log "${BLUE}Testing market data endpoints...${NC}"
    
    # Test symbols endpoint
    local symbols_response=$(make_request "$API_GATEWAY_URL/api/market-data/symbols" "GET" "" "" "200")
    
    if [ $? -eq 0 ]; then
        log "${GREEN}✅ Market data symbols endpoint accessible${NC}"
        
        # Test specific symbol data
        local symbol_data=$(make_request "$API_GATEWAY_URL/api/market-data/quote/AAPL" "GET" "" "" "200")
        
        if [ $? -eq 0 ]; then
            log "${GREEN}✅ Market data quote endpoint accessible${NC}"
            return 0
        else
            log "${YELLOW}⚠️  Market data quote endpoint failed${NC}"
            return 1
        fi
    else
        log "${RED}❌ Market data symbols endpoint failed${NC}"
        return 1
    fi
}

# Function to test WebSocket connectivity
test_websocket() {
    log "${BLUE}Testing WebSocket connectivity...${NC}"
    
    if command -v wscat &> /dev/null; then
        # Test WebSocket connection
        local ws_url=$(echo "$API_GATEWAY_URL" | sed 's/http/ws/')/ws
        
        timeout 10 wscat -c "$ws_url" -x '{"type":"ping"}' &>/dev/null
        
        if [ $? -eq 0 ]; then
            log "${GREEN}✅ WebSocket connection successful${NC}"
            return 0
        else
            log "${RED}❌ WebSocket connection failed${NC}"
            return 1
        fi
    else
        log "${YELLOW}⚠️  WebSocket test skipped (wscat not installed)${NC}"
        return 0
    fi
}

# Function to test authenticated endpoints
test_authenticated_endpoints() {
    log "${BLUE}Testing authenticated endpoints...${NC}"
    
    # Check if we have a test token
    if [ ! -f "$TEST_RESULTS_DIR/test-token.txt" ]; then
        log "${YELLOW}⚠️  No test token available, skipping authenticated tests${NC}"
        return 0
    fi
    
    local token=$(cat "$TEST_RESULTS_DIR/test-token.txt")
    local auth_header="-H \"Authorization: Bearer $token\""
    
    # Test user profile endpoint
    local profile_response=$(make_request "$API_GATEWAY_URL/api/user/profile" "GET" "" "$auth_header" "200")
    
    if [ $? -eq 0 ]; then
        log "${GREEN}✅ User profile endpoint accessible${NC}"
        
        # Test strategies endpoint
        local strategies_response=$(make_request "$API_GATEWAY_URL/api/strategies" "GET" "" "$auth_header" "200")
        
        if [ $? -eq 0 ]; then
            log "${GREEN}✅ Strategies endpoint accessible${NC}"
            
            # Test portfolio endpoint
            local portfolio_response=$(make_request "$API_GATEWAY_URL/api/portfolio" "GET" "" "$auth_header" "200")
            
            if [ $? -eq 0 ]; then
                log "${GREEN}✅ Portfolio endpoint accessible${NC}"
                return 0
            else
                log "${YELLOW}⚠️  Portfolio endpoint failed${NC}"
                return 1
            fi
        else
            log "${YELLOW}⚠️  Strategies endpoint failed${NC}"
            return 1
        fi
    else
        log "${RED}❌ User profile endpoint failed${NC}"
        return 1
    fi
}

# Function to test system performance
test_system_performance() {
    log "${BLUE}Testing system performance...${NC}"
    
    # Test response times
    local start_time=$(date +%s%N)
    make_request "$API_GATEWAY_URL/health" "GET" "" "" "200" &>/dev/null
    local end_time=$(date +%s%N)
    
    local response_time=$(( (end_time - start_time) / 1000000 )) # Convert to milliseconds
    
    log "${BLUE}  API Gateway response time: ${response_time}ms${NC}"
    
    if [ $response_time -lt 1000 ]; then
        log "${GREEN}✅ Response time within acceptable limits (<1s)${NC}"
    else
        log "${YELLOW}⚠️  Slow response time (${response_time}ms)${NC}"
    fi
    
    # Test concurrent requests
    log "${BLUE}Testing concurrent request handling...${NC}"
    
    local concurrent_start=$(date +%s%N)
    for i in {1..10}; do
        make_request "$API_GATEWAY_URL/health" "GET" "" "" "200" &>/dev/null &
    done
    wait
    local concurrent_end=$(date +%s%N)
    
    local concurrent_time=$(( (concurrent_end - concurrent_start) / 1000000 ))
    log "${BLUE}  10 concurrent requests completed in: ${concurrent_time}ms${NC}"
    
    return 0
}

# Function to generate test report
generate_report() {
    local total_tests=$1
    local passed_tests=$2
    local failed_tests=$3
    
    log "${YELLOW}Generating smoke test report...${NC}"
    
    cat > "$TEST_RESULTS_DIR/smoke-test-report.md" << EOF
# Production Smoke Test Report

Generated: $(date)

## Test Summary
- Total Tests: $total_tests
- Passed: $passed_tests
- Failed: $failed_tests
- Success Rate: $(( passed_tests * 100 / total_tests ))%

## Environment Configuration
- API Gateway: $API_GATEWAY_URL
- User Service: $USER_SERVICE_URL
- Strategy Service: $STRATEGY_SERVICE_URL
- Portfolio Service: $PORTFOLIO_SERVICE_URL
- Market Data Service: $MARKET_DATA_SERVICE_URL

## Test Results
$(cat "$TEST_RESULTS_DIR/smoke-tests.log" | grep -E "✅|❌|⚠️" | sed 's/\[.*\] /- /')

## Performance Metrics
$(grep "response time\|concurrent requests" "$TEST_RESULTS_DIR/smoke-tests.log" | sed 's/\[.*\] /- /')

## Recommendations
$(if [ $failed_tests -gt 0 ]; then
    echo "1. Investigate failed tests immediately"
    echo "2. Check service logs for error details"
    echo "3. Verify network connectivity and firewall rules"
fi)
$(if grep -q "Slow response time" "$TEST_RESULTS_DIR/smoke-tests.log"; then
    echo "4. Investigate performance issues"
    echo "5. Check system resources (CPU, memory, disk)"
fi)
6. Monitor system health continuously
7. Set up automated alerting for failures

## Files Generated
- smoke-tests.log - Detailed test execution log
- test-token.txt - JWT token for authenticated tests (if successful)

## Next Steps
1. Review failed tests and fix issues
2. Set up continuous monitoring
3. Implement automated smoke tests in CI/CD
4. Configure alerting for production issues
EOF
}

# Main test execution
main() {
    log "${GREEN}🚀 Starting Production Smoke Tests${NC}"
    
    local total_tests=0
    local passed_tests=0
    local failed_tests=0
    
    # Test 1: Service Health Checks
    log "\n${YELLOW}=== Service Health Checks ===${NC}"
    
    services=(
        "API Gateway:$API_GATEWAY_URL"
        "User Service:$USER_SERVICE_URL"
        "Strategy Service:$STRATEGY_SERVICE_URL"
        "Portfolio Service:$PORTFOLIO_SERVICE_URL"
        "Market Data Service:$MARKET_DATA_SERVICE_URL"
    )
    
    for service_info in "${services[@]}"; do
        IFS=':' read -r service_name service_url <<< "$service_info"
        ((total_tests++))
        
        if test_service_health "$service_name" "$service_url"; then
            ((passed_tests++))
        else
            ((failed_tests++))
        fi
    done
    
    # Test 2: Database Connectivity
    log "\n${YELLOW}=== Database Connectivity ===${NC}"
    ((total_tests++))
    if test_database_connectivity; then
        ((passed_tests++))
    else
        ((failed_tests++))
    fi
    
    # Test 3: Redis Connectivity
    log "\n${YELLOW}=== Redis Connectivity ===${NC}"
    ((total_tests++))
    if test_redis_connectivity; then
        ((passed_tests++))
    else
        ((failed_tests++))
    fi
    
    # Test 4: Authentication Flow
    log "\n${YELLOW}=== Authentication Flow ===${NC}"
    ((total_tests++))
    if test_authentication; then
        ((passed_tests++))
    else
        ((failed_tests++))
    fi
    
    # Test 5: Market Data Endpoints
    log "\n${YELLOW}=== Market Data Endpoints ===${NC}"
    ((total_tests++))
    if test_market_data; then
        ((passed_tests++))
    else
        ((failed_tests++))
    fi
    
    # Test 6: WebSocket Connectivity
    log "\n${YELLOW}=== WebSocket Connectivity ===${NC}"
    ((total_tests++))
    if test_websocket; then
        ((passed_tests++))
    else
        ((failed_tests++))
    fi
    
    # Test 7: Authenticated Endpoints
    log "\n${YELLOW}=== Authenticated Endpoints ===${NC}"
    ((total_tests++))
    if test_authenticated_endpoints; then
        ((passed_tests++))
    else
        ((failed_tests++))
    fi
    
    # Test 8: System Performance
    log "\n${YELLOW}=== System Performance ===${NC}"
    ((total_tests++))
    if test_system_performance; then
        ((passed_tests++))
    else
        ((failed_tests++))
    fi
    
    # Generate report
    generate_report $total_tests $passed_tests $failed_tests
    
    # Final summary
    log "\n${GREEN}🎉 Production Smoke Tests Completed!${NC}"
    log "${BLUE}Results: $passed_tests/$total_tests tests passed${NC}"
    log "${BLUE}Report saved to: $TEST_RESULTS_DIR/smoke-test-report.md${NC}"
    
    if [ $failed_tests -eq 0 ]; then
        log "${GREEN}✅ All smoke tests passed - Production environment is healthy${NC}"
        exit 0
    else
        log "${RED}❌ $failed_tests tests failed - Production environment needs attention${NC}"
        exit 1
    fi
}

# Run main function
main "$@"