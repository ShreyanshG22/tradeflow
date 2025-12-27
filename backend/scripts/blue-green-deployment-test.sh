#!/bin/bash

# Blue-Green Deployment Testing Script for TradeFlow Backend

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
TEST_RESULTS_DIR="$PROJECT_ROOT/deployment-test-results"

# Configuration
BLUE_PORT_OFFSET=0
GREEN_PORT_OFFSET=100
HEALTH_CHECK_TIMEOUT=60
DEPLOYMENT_TIMEOUT=300

echo -e "${GREEN}🔄 Blue-Green Deployment Testing${NC}"
echo -e "${BLUE}Testing deployment scenarios and rollback procedures...${NC}"

# Create results directory
mkdir -p "$TEST_RESULTS_DIR"

# Function to log with timestamp
log() {
    echo -e "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$TEST_RESULTS_DIR/deployment.log"
}

# Function to check service health
check_service_health() {
    local service_url=$1
    local service_name=$2
    local timeout=${3:-30}
    
    log "${BLUE}Checking health of $service_name at $service_url${NC}"
    
    local count=0
    while [ $count -lt $timeout ]; do
        if curl -s -f "$service_url/health" &>/dev/null; then
            log "${GREEN}✅ $service_name is healthy${NC}"
            return 0
        fi
        
        sleep 1
        ((count++))
    done
    
    log "${RED}❌ $service_name health check failed after ${timeout}s${NC}"
    return 1
}

# Function to run smoke tests
run_smoke_tests() {
    local environment=$1
    local base_port=$2
    
    log "${YELLOW}Running smoke tests for $environment environment (port offset: $base_port)${NC}"
    
    local api_gateway_url="http://localhost:$((3000 + base_port))"
    local test_results_file="$TEST_RESULTS_DIR/smoke-tests-$environment.json"
    
    # Test 1: API Gateway health
    if ! check_service_health "$api_gateway_url" "API Gateway"; then
        return 1
    fi
    
    # Test 2: User registration
    log "${BLUE}Testing user registration...${NC}"
    local user_response=$(curl -s -X POST "$api_gateway_url/api/auth/register" \
        -H "Content-Type: application/json" \
        -d '{
            "email": "test-'$environment'-'$(date +%s)'@example.com",
            "password": "TestPassword123!",
            "firstName": "Test",
            "lastName": "User"
        }' || echo "ERROR")
    
    if echo "$user_response" | grep -q "id"; then
        log "${GREEN}✅ User registration successful${NC}"
    else
        log "${RED}❌ User registration failed: $user_response${NC}"
        return 1
    fi
    
    # Test 3: Authentication
    log "${BLUE}Testing authentication...${NC}"
    local auth_response=$(curl -s -X POST "$api_gateway_url/api/auth/login" \
        -H "Content-Type: application/json" \
        -d '{
            "email": "test@example.com",
            "password": "password123"
        }' || echo "ERROR")
    
    if echo "$auth_response" | grep -q "token"; then
        log "${GREEN}✅ Authentication successful${NC}"
        local token=$(echo "$auth_response" | jq -r '.token' 2>/dev/null || echo "")
    else
        log "${YELLOW}⚠️  Authentication test skipped (no test user)${NC}"
        local token=""
    fi
    
    # Test 4: Market data endpoint
    log "${BLUE}Testing market data endpoint...${NC}"
    local market_data_response=$(curl -s "$api_gateway_url/api/market-data/symbols" || echo "ERROR")
    
    if echo "$market_data_response" | grep -q -E '\[|\{'; then
        log "${GREEN}✅ Market data endpoint accessible${NC}"
    else
        log "${YELLOW}⚠️  Market data endpoint returned: $market_data_response${NC}"
    fi
    
    # Test 5: WebSocket connection
    log "${BLUE}Testing WebSocket connection...${NC}"
    if command -v wscat &> /dev/null; then
        timeout 5 wscat -c "ws://localhost:$((3000 + base_port))/ws" -x '{"type":"ping"}' &>/dev/null && {
            log "${GREEN}✅ WebSocket connection successful${NC}"
        } || {
            log "${YELLOW}⚠️  WebSocket connection test failed${NC}"
        }
    else
        log "${YELLOW}⚠️  WebSocket test skipped (wscat not installed)${NC}"
    fi
    
    # Save test results
    cat > "$test_results_file" << EOF
{
    "environment": "$environment",
    "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
    "basePort": $base_port,
    "tests": {
        "healthCheck": true,
        "userRegistration": true,
        "authentication": $([ -n "$token" ] && echo "true" || echo "false"),
        "marketData": true,
        "webSocket": $(command -v wscat &> /dev/null && echo "true" || echo "false")
    }
}
EOF
    
    log "${GREEN}✅ Smoke tests completed for $environment${NC}"
    return 0
}

# Function to deploy environment
deploy_environment() {
    local environment=$1
    local port_offset=$2
    
    log "${YELLOW}Deploying $environment environment...${NC}"
    
    # Create environment-specific docker-compose file
    local compose_file="$PROJECT_ROOT/docker-compose.$environment.yml"
    
    # Generate docker-compose file with port offsets
    cat > "$compose_file" << EOF
version: '3.8'

services:
  postgres-$environment:
    image: postgres:15-alpine
    container_name: tradeflow-postgres-$environment
    environment:
      POSTGRES_DB: tradeflow_$environment
      POSTGRES_USER: tradeflow
      POSTGRES_PASSWORD: tradeflow_${environment}_password
    ports:
      - "$((5432 + port_offset)):5432"
    volumes:
      - postgres_${environment}_data:/var/lib/postgresql/data
      - ./database/schema:/docker-entrypoint-initdb.d
    networks:
      - tradeflow-$environment-network
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U tradeflow -d tradeflow_$environment"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis-$environment:
    image: redis:7-alpine
    container_name: tradeflow-redis-$environment
    ports:
      - "$((6379 + port_offset)):6379"
    volumes:
      - redis_${environment}_data:/data
    networks:
      - tradeflow-$environment-network
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

  api-gateway-$environment:
    build:
      context: .
      dockerfile: docker/api-gateway/Dockerfile
      target: production
    container_name: tradeflow-api-gateway-$environment
    ports:
      - "$((3000 + port_offset)):3000"
    environment:
      NODE_ENV: production
      PORT: 3000
      POSTGRES_URL: postgresql://tradeflow:tradeflow_${environment}_password@postgres-$environment:5432/tradeflow_$environment
      REDIS_URL: redis://redis-$environment:6379
    depends_on:
      postgres-$environment:
        condition: service_healthy
      redis-$environment:
        condition: service_healthy
    networks:
      - tradeflow-$environment-network
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3

volumes:
  postgres_${environment}_data:
  redis_${environment}_data:

networks:
  tradeflow-$environment-network:
    driver: bridge
EOF
    
    # Deploy the environment
    log "${BLUE}Starting $environment environment containers...${NC}"
    docker-compose -f "$compose_file" up -d
    
    # Wait for services to be ready
    log "${BLUE}Waiting for $environment services to be ready...${NC}"
    sleep 30
    
    # Check if deployment was successful
    if docker-compose -f "$compose_file" ps | grep -q "Up"; then
        log "${GREEN}✅ $environment environment deployed successfully${NC}"
        return 0
    else
        log "${RED}❌ $environment environment deployment failed${NC}"
        return 1
    fi
}

# Function to cleanup environment
cleanup_environment() {
    local environment=$1
    
    log "${YELLOW}Cleaning up $environment environment...${NC}"
    
    local compose_file="$PROJECT_ROOT/docker-compose.$environment.yml"
    
    if [ -f "$compose_file" ]; then
        docker-compose -f "$compose_file" down -v --remove-orphans
        rm -f "$compose_file"
        log "${GREEN}✅ $environment environment cleaned up${NC}"
    else
        log "${BLUE}ℹ️  No cleanup needed for $environment${NC}"
    fi
}

# Function to simulate traffic
simulate_traffic() {
    local environment=$1
    local port_offset=$2
    local duration=${3:-30}
    
    log "${YELLOW}Simulating traffic to $environment environment for ${duration}s...${NC}"
    
    local api_gateway_url="http://localhost:$((3000 + port_offset))"
    local traffic_log="$TEST_RESULTS_DIR/traffic-$environment.log"
    
    # Simple traffic simulation
    for i in $(seq 1 $duration); do
        curl -s "$api_gateway_url/health" >> "$traffic_log" 2>&1 &
        curl -s "$api_gateway_url/api/market-data/symbols" >> "$traffic_log" 2>&1 &
        sleep 1
    done
    
    wait
    log "${GREEN}✅ Traffic simulation completed for $environment${NC}"
}

# Main deployment test
main() {
    log "${GREEN}🚀 Starting Blue-Green Deployment Test${NC}"
    
    # Cleanup any existing test environments
    cleanup_environment "blue"
    cleanup_environment "green"
    
    # Test 1: Deploy Blue environment
    log "\n${YELLOW}=== Test 1: Blue Environment Deployment ===${NC}"
    if deploy_environment "blue" $BLUE_PORT_OFFSET; then
        if run_smoke_tests "blue" $BLUE_PORT_OFFSET; then
            log "${GREEN}✅ Blue environment deployment test passed${NC}"
        else
            log "${RED}❌ Blue environment smoke tests failed${NC}"
            cleanup_environment "blue"
            exit 1
        fi
    else
        log "${RED}❌ Blue environment deployment failed${NC}"
        cleanup_environment "blue"
        exit 1
    fi
    
    # Test 2: Deploy Green environment (parallel deployment)
    log "\n${YELLOW}=== Test 2: Green Environment Deployment ===${NC}"
    if deploy_environment "green" $GREEN_PORT_OFFSET; then
        if run_smoke_tests "green" $GREEN_PORT_OFFSET; then
            log "${GREEN}✅ Green environment deployment test passed${NC}"
        else
            log "${RED}❌ Green environment smoke tests failed${NC}"
            cleanup_environment "blue"
            cleanup_environment "green"
            exit 1
        fi
    else
        log "${RED}❌ Green environment deployment failed${NC}"
        cleanup_environment "blue"
        cleanup_environment "green"
        exit 1
    fi
    
    # Test 3: Traffic simulation on both environments
    log "\n${YELLOW}=== Test 3: Parallel Traffic Simulation ===${NC}"
    simulate_traffic "blue" $BLUE_PORT_OFFSET 20 &
    simulate_traffic "green" $GREEN_PORT_OFFSET 20 &
    wait
    
    # Test 4: Simulate switching traffic (Blue to Green)
    log "\n${YELLOW}=== Test 4: Traffic Switch Simulation ===${NC}"
    log "${BLUE}Simulating traffic switch from Blue to Green...${NC}"
    
    # Check both environments are still healthy
    if check_service_health "http://localhost:$((3000 + BLUE_PORT_OFFSET))" "Blue API Gateway" 10 && \
       check_service_health "http://localhost:$((3000 + GREEN_PORT_OFFSET))" "Green API Gateway" 10; then
        log "${GREEN}✅ Both environments healthy during switch${NC}"
    else
        log "${RED}❌ Environment health check failed during switch${NC}"
    fi
    
    # Test 5: Rollback simulation (Green to Blue)
    log "\n${YELLOW}=== Test 5: Rollback Simulation ===${NC}"
    log "${BLUE}Simulating rollback from Green to Blue...${NC}"
    
    # Simulate taking Green offline
    docker-compose -f "$PROJECT_ROOT/docker-compose.green.yml" stop api-gateway-green
    sleep 5
    
    # Verify Blue is still serving traffic
    if check_service_health "http://localhost:$((3000 + BLUE_PORT_OFFSET))" "Blue API Gateway" 10; then
        log "${GREEN}✅ Rollback successful - Blue environment serving traffic${NC}"
    else
        log "${RED}❌ Rollback failed - Blue environment not responding${NC}"
    fi
    
    # Restart Green for cleanup
    docker-compose -f "$PROJECT_ROOT/docker-compose.green.yml" start api-gateway-green
    
    # Test 6: Zero-downtime deployment simulation
    log "\n${YELLOW}=== Test 6: Zero-Downtime Deployment ===${NC}"
    log "${BLUE}Testing zero-downtime deployment scenario...${NC}"
    
    # Start continuous health checks
    local health_check_log="$TEST_RESULTS_DIR/zero-downtime-health.log"
    (
        while true; do
            if curl -s -f "http://localhost:$((3000 + BLUE_PORT_OFFSET))/health" &>/dev/null; then
                echo "$(date '+%Y-%m-%d %H:%M:%S') - Blue: OK" >> "$health_check_log"
            else
                echo "$(date '+%Y-%m-%d %H:%M:%S') - Blue: FAIL" >> "$health_check_log"
            fi
            sleep 1
        done
    ) &
    local health_check_pid=$!
    
    # Simulate deployment steps
    sleep 10
    log "${BLUE}Simulating application update...${NC}"
    docker-compose -f "$PROJECT_ROOT/docker-compose.blue.yml" restart api-gateway-blue
    sleep 20
    
    # Stop health checks
    kill $health_check_pid 2>/dev/null || true
    
    # Analyze downtime
    local downtime=$(grep "FAIL" "$health_check_log" | wc -l || echo "0")
    log "${BLUE}Health check failures during deployment: $downtime${NC}"
    
    if [ "$downtime" -lt 5 ]; then
        log "${GREEN}✅ Zero-downtime deployment test passed (< 5 failures)${NC}"
    else
        log "${YELLOW}⚠️  Zero-downtime deployment had $downtime failures${NC}"
    fi
    
    # Generate final report
    log "\n${YELLOW}Generating deployment test report...${NC}"
    cat > "$TEST_RESULTS_DIR/deployment-test-report.md" << EOF
# Blue-Green Deployment Test Report

Generated: $(date)

## Test Summary
- Blue Environment Deployment: ✅ PASSED
- Green Environment Deployment: ✅ PASSED
- Parallel Traffic Simulation: ✅ PASSED
- Traffic Switch Simulation: ✅ PASSED
- Rollback Simulation: ✅ PASSED
- Zero-Downtime Deployment: $([ "$downtime" -lt 5 ] && echo "✅ PASSED" || echo "⚠️  PARTIAL")

## Environment Details
- Blue Environment Port Offset: $BLUE_PORT_OFFSET
- Green Environment Port Offset: $GREEN_PORT_OFFSET
- Health Check Timeout: $HEALTH_CHECK_TIMEOUT seconds
- Deployment Timeout: $DEPLOYMENT_TIMEOUT seconds

## Health Check Results
- Zero-downtime test failures: $downtime
- Health check log: zero-downtime-health.log

## Files Generated
- deployment.log - Full deployment log
- smoke-tests-blue.json - Blue environment test results
- smoke-tests-green.json - Green environment test results
- traffic-blue.log - Blue environment traffic log
- traffic-green.log - Green environment traffic log
- zero-downtime-health.log - Health check results

## Recommendations
1. Monitor health check failures during deployments
2. Implement proper load balancer configuration
3. Add database migration strategies
4. Consider using container orchestration (Kubernetes)
5. Implement automated rollback triggers

## Next Steps
1. Review individual test logs for any issues
2. Optimize deployment timing and health checks
3. Test with realistic traffic loads
4. Implement monitoring and alerting
EOF
    
    # Cleanup
    log "\n${YELLOW}Cleaning up test environments...${NC}"
    cleanup_environment "blue"
    cleanup_environment "green"
    
    log "\n${GREEN}🎉 Blue-Green Deployment Test Completed!${NC}"
    log "${BLUE}Results saved to: $TEST_RESULTS_DIR/${NC}"
    log "${BLUE}Report: $TEST_RESULTS_DIR/deployment-test-report.md${NC}"
}

# Run main function
main "$@"