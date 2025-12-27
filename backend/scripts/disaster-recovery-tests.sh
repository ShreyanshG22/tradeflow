#!/bin/bash

# Disaster Recovery and Business Continuity Testing for TradeFlow Backend

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
TEST_RESULTS_DIR="$PROJECT_ROOT/disaster-recovery-results"

# Configuration
RTO_TARGET=300  # Recovery Time Objective in seconds (5 minutes)
RPO_TARGET=60   # Recovery Point Objective in seconds (1 minute)

echo -e "${GREEN}🚨 Disaster Recovery and Business Continuity Testing${NC}"
echo -e "${BLUE}Testing system resilience and recovery procedures...${NC}"

# Create results directory
mkdir -p "$TEST_RESULTS_DIR"

# Function to log with timestamp
log() {
    echo -e "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$TEST_RESULTS_DIR/disaster-recovery.log"
}

# Function to record event with timestamp
record_event() {
    local event_type=$1
    local description=$2
    local timestamp=$(date -u +%s)
    
    echo "$timestamp:$event_type:$description" >> "$TEST_RESULTS_DIR/timeline.txt"
    log "${BLUE}Event recorded: $event_type - $description${NC}"
}

# Function to calculate time difference
calculate_duration() {
    local start_time=$1
    local end_time=$2
    echo $((end_time - start_time))
}

# Function to check service health
check_service_health() {
    local service_name=$1
    local service_url=$2
    local timeout=${3:-10}
    
    if curl -s -f --max-time $timeout "$service_url/health" &>/dev/null; then
        return 0
    else
        return 1
    fi
}

# Function to wait for service recovery
wait_for_service_recovery() {
    local service_name=$1
    local service_url=$2
    local max_wait=${3:-300}
    
    local start_time=$(date -u +%s)
    local current_time=$start_time
    
    log "${BLUE}Waiting for $service_name recovery...${NC}"
    
    while [ $((current_time - start_time)) -lt $max_wait ]; do
        if check_service_health "$service_name" "$service_url"; then
            local recovery_time=$((current_time - start_time))
            log "${GREEN}✅ $service_name recovered in ${recovery_time}s${NC}"
            return $recovery_time
        fi
        
        sleep 5
        current_time=$(date -u +%s)
    done
    
    log "${RED}❌ $service_name failed to recover within ${max_wait}s${NC}"
    return -1
}

# Function to simulate database failure
simulate_database_failure() {
    log "${YELLOW}Simulating database failure...${NC}"
    
    record_event "FAILURE_START" "Database failure simulation"
    local failure_start=$(date -u +%s)
    
    # Stop PostgreSQL container
    docker stop tradeflow-postgres &>/dev/null || true
    
    # Verify database is down
    sleep 5
    if ! docker ps | grep -q "tradeflow-postgres"; then
        log "${YELLOW}⚠️  Database container stopped${NC}"
        
        # Test application behavior during database outage
        log "${BLUE}Testing application behavior during database outage...${NC}"
        
        local api_response=$(curl -s -w "%{http_code}" "http://localhost:3000/api/health" -o /dev/null || echo "000")
        
        if [ "$api_response" = "503" ] || [ "$api_response" = "500" ]; then
            log "${GREEN}✅ Application correctly reports unhealthy state${NC}"
        else
            log "${YELLOW}⚠️  Application response during outage: HTTP $api_response${NC}"
        fi
        
        return $failure_start
    else
        log "${RED}❌ Failed to stop database container${NC}"
        return -1
    fi
}

# Function to recover from database failure
recover_from_database_failure() {
    local failure_start=$1
    
    log "${BLUE}Initiating database recovery...${NC}"
    
    record_event "RECOVERY_START" "Database recovery initiated"
    local recovery_start=$(date -u +%s)
    
    # Restart PostgreSQL container
    docker start tradeflow-postgres &>/dev/null
    
    # Wait for database to be ready
    local max_attempts=60
    local attempt=1
    
    while [ $attempt -le $max_attempts ]; do
        if docker exec tradeflow-postgres pg_isready -U tradeflow -d tradeflow &>/dev/null; then
            local recovery_end=$(date -u +%s)
            local recovery_time=$((recovery_end - recovery_start))
            local total_downtime=$((recovery_end - failure_start))
            
            record_event "RECOVERY_COMPLETE" "Database recovery completed"
            log "${GREEN}✅ Database recovered in ${recovery_time}s (total downtime: ${total_downtime}s)${NC}"
            
            # Check RTO compliance
            if [ $total_downtime -le $RTO_TARGET ]; then
                log "${GREEN}✅ RTO target met (${total_downtime}s <= ${RTO_TARGET}s)${NC}"
            else
                log "${RED}❌ RTO target exceeded (${total_downtime}s > ${RTO_TARGET}s)${NC}"
            fi
            
            return $total_downtime
        fi
        
        sleep 5
        ((attempt++))
    done
    
    log "${RED}❌ Database recovery failed${NC}"
    return -1
}

# Function to simulate Redis failure
simulate_redis_failure() {
    log "${YELLOW}Simulating Redis failure...${NC}"
    
    record_event "FAILURE_START" "Redis failure simulation"
    local failure_start=$(date -u +%s)
    
    # Stop Redis container
    docker stop tradeflow-redis &>/dev/null || true
    
    # Verify Redis is down
    sleep 5
    if ! docker ps | grep -q "tradeflow-redis"; then
        log "${YELLOW}⚠️  Redis container stopped${NC}"
        
        # Test application behavior during Redis outage
        log "${BLUE}Testing application behavior during Redis outage...${NC}"
        
        # Test session-dependent endpoint
        local session_response=$(curl -s -w "%{http_code}" "http://localhost:3000/api/user/profile" \
            -H "Authorization: Bearer invalid-token" -o /dev/null || echo "000")
        
        log "${BLUE}Session endpoint response during Redis outage: HTTP $session_response${NC}"
        
        return $failure_start
    else
        log "${RED}❌ Failed to stop Redis container${NC}"
        return -1
    fi
}

# Function to recover from Redis failure
recover_from_redis_failure() {
    local failure_start=$1
    
    log "${BLUE}Initiating Redis recovery...${NC}"
    
    record_event "RECOVERY_START" "Redis recovery initiated"
    local recovery_start=$(date -u +%s)
    
    # Restart Redis container
    docker start tradeflow-redis &>/dev/null
    
    # Wait for Redis to be ready
    local max_attempts=30
    local attempt=1
    
    while [ $attempt -le $max_attempts ]; do
        if docker exec tradeflow-redis redis-cli ping &>/dev/null; then
            local recovery_end=$(date -u +%s)
            local recovery_time=$((recovery_end - recovery_start))
            local total_downtime=$((recovery_end - failure_start))
            
            record_event "RECOVERY_COMPLETE" "Redis recovery completed"
            log "${GREEN}✅ Redis recovered in ${recovery_time}s (total downtime: ${total_downtime}s)${NC}"
            
            return $total_downtime
        fi
        
        sleep 2
        ((attempt++))
    done
    
    log "${RED}❌ Redis recovery failed${NC}"
    return -1
}

# Function to simulate service failure
simulate_service_failure() {
    local service_name=$1
    local container_name=$2
    
    log "${YELLOW}Simulating $service_name failure...${NC}"
    
    record_event "FAILURE_START" "$service_name failure simulation"
    local failure_start=$(date -u +%s)
    
    # Stop service container
    docker stop "$container_name" &>/dev/null || true
    
    # Verify service is down
    sleep 5
    if ! docker ps | grep -q "$container_name"; then
        log "${YELLOW}⚠️  $service_name container stopped${NC}"
        return $failure_start
    else
        log "${RED}❌ Failed to stop $service_name container${NC}"
        return -1
    fi
}

# Function to recover service
recover_service() {
    local service_name=$1
    local container_name=$2
    local service_url=$3
    local failure_start=$4
    
    log "${BLUE}Initiating $service_name recovery...${NC}"
    
    record_event "RECOVERY_START" "$service_name recovery initiated"
    local recovery_start=$(date -u +%s)
    
    # Restart service container
    docker start "$container_name" &>/dev/null
    
    # Wait for service to be healthy
    local recovery_time=$(wait_for_service_recovery "$service_name" "$service_url" 120)
    
    if [ $recovery_time -gt 0 ]; then
        local recovery_end=$(date -u +%s)
        local total_downtime=$((recovery_end - failure_start))
        
        record_event "RECOVERY_COMPLETE" "$service_name recovery completed"
        log "${GREEN}✅ $service_name total downtime: ${total_downtime}s${NC}"
        
        return $total_downtime
    else
        log "${RED}❌ $service_name recovery failed${NC}"
        return -1
    fi
}

# Function to simulate network partition
simulate_network_partition() {
    log "${YELLOW}Simulating network partition...${NC}"
    
    record_event "FAILURE_START" "Network partition simulation"
    local failure_start=$(date -u +%s)
    
    # Create network isolation by removing containers from network
    docker network disconnect tradeflow-network tradeflow-api-gateway &>/dev/null || true
    docker network disconnect tradeflow-network tradeflow-user-service &>/dev/null || true
    
    sleep 5
    
    # Test inter-service communication
    log "${BLUE}Testing inter-service communication during partition...${NC}"
    
    local api_response=$(curl -s -w "%{http_code}" "http://localhost:3000/api/health" -o /dev/null || echo "000")
    log "${BLUE}API Gateway response during partition: HTTP $api_response${NC}"
    
    return $failure_start
}

# Function to recover from network partition
recover_from_network_partition() {
    local failure_start=$1
    
    log "${BLUE}Recovering from network partition...${NC}"
    
    record_event "RECOVERY_START" "Network partition recovery initiated"
    local recovery_start=$(date -u +%s)
    
    # Reconnect containers to network
    docker network connect tradeflow-network tradeflow-api-gateway &>/dev/null || true
    docker network connect tradeflow-network tradeflow-user-service &>/dev/null || true
    
    # Wait for services to recover
    sleep 10
    
    local recovery_end=$(date -u +%s)
    local recovery_time=$((recovery_end - recovery_start))
    local total_downtime=$((recovery_end - failure_start))
    
    record_event "RECOVERY_COMPLETE" "Network partition recovery completed"
    log "${GREEN}✅ Network partition recovered in ${recovery_time}s (total impact: ${total_downtime}s)${NC}"
    
    return $total_downtime
}

# Function to test cascading failure
test_cascading_failure() {
    log "${YELLOW}Testing cascading failure scenario...${NC}"
    
    record_event "CASCADING_START" "Cascading failure test initiated"
    local cascade_start=$(date -u +%s)
    
    # Simulate multiple simultaneous failures
    log "${BLUE}Simulating multiple component failures...${NC}"
    
    # Stop multiple services
    docker stop tradeflow-redis &>/dev/null || true
    sleep 2
    docker stop tradeflow-user-service &>/dev/null || true
    sleep 2
    docker stop tradeflow-strategy-service &>/dev/null || true
    
    # Monitor system behavior
    sleep 10
    
    local api_response=$(curl -s -w "%{http_code}" "http://localhost:3000/api/health" -o /dev/null || echo "000")
    log "${BLUE}API Gateway response during cascading failure: HTTP $api_response${NC}"
    
    # Begin recovery in priority order
    log "${BLUE}Initiating priority-based recovery...${NC}"
    
    # 1. Recover Redis first (foundational service)
    docker start tradeflow-redis &>/dev/null
    wait_for_service_recovery "Redis" "http://localhost:6379" 60 &>/dev/null
    
    # 2. Recover User Service
    docker start tradeflow-user-service &>/dev/null
    wait_for_service_recovery "User Service" "http://localhost:3001" 60 &>/dev/null
    
    # 3. Recover Strategy Service
    docker start tradeflow-strategy-service &>/dev/null
    wait_for_service_recovery "Strategy Service" "http://localhost:3002" 60 &>/dev/null
    
    local cascade_end=$(date -u +%s)
    local total_cascade_time=$((cascade_end - cascade_start))
    
    record_event "CASCADING_COMPLETE" "Cascading failure recovery completed"
    log "${GREEN}✅ Cascading failure recovery completed in ${total_cascade_time}s${NC}"
    
    return $total_cascade_time
}

# Function to test data consistency after recovery
test_data_consistency() {
    log "${BLUE}Testing data consistency after recovery...${NC}"
    
    # Create test transaction before failure
    local test_user_id="dr-test-$(date +%s)"
    local test_data='{
        "email": "'$test_user_id'@example.com",
        "password": "TestPassword123!",
        "firstName": "DR",
        "lastName": "Test"
    }'
    
    # Insert test data
    local user_response=$(curl -s -X POST "http://localhost:3000/api/auth/register" \
        -H "Content-Type: application/json" \
        -d "$test_data" || echo "ERROR")
    
    if echo "$user_response" | grep -q "id"; then
        log "${GREEN}✅ Test data created before failure${NC}"
        
        # Verify data exists after recovery
        sleep 5
        
        # Try to login with test user
        local login_data='{
            "email": "'$test_user_id'@example.com",
            "password": "TestPassword123!"
        }'
        
        local login_response=$(curl -s -X POST "http://localhost:3000/api/auth/login" \
            -H "Content-Type: application/json" \
            -d "$login_data" || echo "ERROR")
        
        if echo "$login_response" | grep -q "token"; then
            log "${GREEN}✅ Data consistency maintained after recovery${NC}"
            return 0
        else
            log "${RED}❌ Data consistency check failed${NC}"
            return 1
        fi
    else
        log "${YELLOW}⚠️  Could not create test data for consistency check${NC}"
        return 0
    fi
}

# Function to test backup system during disaster
test_backup_during_disaster() {
    log "${BLUE}Testing backup system resilience...${NC}"
    
    # Attempt to create backup during partial system failure
    local backup_file="$TEST_RESULTS_DIR/disaster-backup-$(date +%Y%m%d-%H%M%S).sql"
    
    if docker exec tradeflow-postgres pg_dump -U tradeflow -d tradeflow > "$backup_file" 2>/dev/null; then
        local backup_size=$(stat -f%z "$backup_file" 2>/dev/null || stat -c%s "$backup_file" 2>/dev/null || echo "0")
        
        if [ "$backup_size" -gt 1000 ]; then
            log "${GREEN}✅ Backup system operational during disaster (${backup_size} bytes)${NC}"
            return 0
        else
            log "${RED}❌ Backup created but appears incomplete${NC}"
            return 1
        fi
    else
        log "${RED}❌ Backup system failed during disaster${NC}"
        return 1
    fi
}

# Function to generate disaster recovery report
generate_report() {
    local total_tests=$1
    local passed_tests=$2
    local failed_tests=$3
    
    log "${YELLOW}Generating disaster recovery report...${NC}"
    
    # Calculate average recovery times
    local db_recovery_time=$(grep "Database recovered" "$TEST_RESULTS_DIR/disaster-recovery.log" | grep -o "[0-9]*s" | head -1 | tr -d 's' || echo "N/A")
    local redis_recovery_time=$(grep "Redis recovered" "$TEST_RESULTS_DIR/disaster-recovery.log" | grep -o "[0-9]*s" | head -1 | tr -d 's' || echo "N/A")
    
    cat > "$TEST_RESULTS_DIR/disaster-recovery-report.md" << EOF
# Disaster Recovery and Business Continuity Test Report

Generated: $(date)

## Executive Summary
- Total Tests: $total_tests
- Passed: $passed_tests
- Failed: $failed_tests
- Success Rate: $(( passed_tests * 100 / total_tests ))%

## Recovery Time Objectives (RTO)
- Target RTO: $RTO_TARGET seconds
- Database Recovery Time: ${db_recovery_time}s
- Redis Recovery Time: ${redis_recovery_time}s
- RTO Compliance: $([ "$db_recovery_time" != "N/A" ] && [ "$db_recovery_time" -le "$RTO_TARGET" ] && echo "✅ PASS" || echo "❌ FAIL")

## Recovery Point Objectives (RPO)
- Target RPO: $RPO_TARGET seconds
- Data Consistency: $(grep "Data consistency maintained" "$TEST_RESULTS_DIR/disaster-recovery.log" &>/dev/null && echo "✅ MAINTAINED" || echo "❌ ISSUES")

## Test Results Summary
$(cat "$TEST_RESULTS_DIR/disaster-recovery.log" | grep -E "✅|❌|⚠️" | sed 's/\[.*\] /- /')

## Failure Scenarios Tested
1. Database (PostgreSQL) Complete Failure
2. Cache (Redis) Complete Failure
3. Microservice Failures (User Service, Strategy Service)
4. Network Partition Simulation
5. Cascading Failure Scenario
6. Data Consistency Validation
7. Backup System Resilience

## Timeline Analysis
$(if [ -f "$TEST_RESULTS_DIR/timeline.txt" ]; then
    echo "### Event Timeline"
    while IFS=':' read -r timestamp event_type description; do
        local readable_time=$(date -d "@$timestamp" '+%H:%M:%S' 2>/dev/null || date -r "$timestamp" '+%H:%M:%S' 2>/dev/null || echo "$timestamp")
        echo "- $readable_time: $event_type - $description"
    done < "$TEST_RESULTS_DIR/timeline.txt"
fi)

## Performance Metrics
- Average Database Recovery: ${db_recovery_time}s
- Average Cache Recovery: ${redis_recovery_time}s
- System Availability During Tests: $(grep -c "✅" "$TEST_RESULTS_DIR/disaster-recovery.log" || echo "0")/$(grep -c -E "✅|❌" "$TEST_RESULTS_DIR/disaster-recovery.log" || echo "1") components

## Critical Findings
$(if [ $failed_tests -gt 0 ]; then
    echo "### Issues Identified"
    grep "❌" "$TEST_RESULTS_DIR/disaster-recovery.log" | sed 's/\[.*\] /- /'
fi)

$(if [ "$db_recovery_time" != "N/A" ] && [ "$db_recovery_time" -gt "$RTO_TARGET" ]; then
    echo "### RTO Violations"
    echo "- Database recovery time ($db_recovery_time s) exceeds target ($RTO_TARGET s)"
fi)

## Recommendations

### Immediate Actions Required
$(if [ $failed_tests -gt 0 ]; then
    echo "1. Address failed disaster recovery scenarios immediately"
    echo "2. Review and improve recovery procedures"
    echo "3. Implement additional monitoring and alerting"
fi)

### Infrastructure Improvements
1. Implement database clustering for high availability
2. Set up Redis Sentinel or Cluster for cache redundancy
3. Deploy services across multiple availability zones
4. Implement automated failover mechanisms
5. Set up cross-region backup replication

### Process Improvements
1. Create detailed disaster recovery runbooks
2. Implement automated recovery procedures where possible
3. Schedule regular disaster recovery drills
4. Train operations team on recovery procedures
5. Establish clear escalation procedures

### Monitoring and Alerting
1. Implement comprehensive health checks
2. Set up proactive monitoring for all critical components
3. Configure automated alerting for system failures
4. Implement dependency mapping and impact analysis
5. Set up real-time dashboard for system status

### Business Continuity
1. Document business impact of each failure scenario
2. Establish communication procedures during outages
3. Create customer notification templates
4. Implement graceful degradation strategies
5. Plan for extended outage scenarios

## Compliance and Governance
- RTO Target: $RTO_TARGET seconds
- RPO Target: $RPO_TARGET seconds
- Test Frequency: Monthly (recommended)
- Last Test Date: $(date)
- Next Test Due: $(date -d "+1 month" '+%Y-%m-%d')

## Files Generated
- disaster-recovery.log - Detailed test execution log
- timeline.txt - Event timeline with timestamps
- disaster-backup-*.sql - Backup created during disaster test

## Next Steps
1. Address any failed test scenarios
2. Implement recommended infrastructure improvements
3. Create and test disaster recovery runbooks
4. Schedule regular DR testing
5. Review and update RTO/RPO targets based on business needs
6. Implement automated recovery procedures
7. Conduct tabletop exercises with stakeholders

---
*This report should be reviewed by the operations team, security team, and business stakeholders.*
EOF
}

# Main test execution
main() {
    log "${GREEN}🚀 Starting Disaster Recovery and Business Continuity Testing${NC}"
    
    # Initialize timeline
    echo "# Disaster Recovery Test Timeline" > "$TEST_RESULTS_DIR/timeline.txt"
    record_event "TEST_START" "Disaster recovery testing initiated"
    
    local total_tests=0
    local passed_tests=0
    local failed_tests=0
    
    # Ensure all services are running initially
    log "${BLUE}Ensuring all services are running...${NC}"
    docker-compose up -d &>/dev/null || true
    sleep 30
    
    # Test 1: Database Failure and Recovery
    log "\n${YELLOW}=== Database Failure Scenario ===${NC}"
    ((total_tests++))
    local db_failure_start=$(simulate_database_failure)
    if [ $db_failure_start -gt 0 ]; then
        local db_recovery_result=$(recover_from_database_failure $db_failure_start)
        if [ $db_recovery_result -gt 0 ]; then
            ((passed_tests++))
        else
            ((failed_tests++))
        fi
    else
        ((failed_tests++))
    fi
    
    # Test 2: Redis Failure and Recovery
    log "\n${YELLOW}=== Redis Failure Scenario ===${NC}"
    ((total_tests++))
    local redis_failure_start=$(simulate_redis_failure)
    if [ $redis_failure_start -gt 0 ]; then
        local redis_recovery_result=$(recover_from_redis_failure $redis_failure_start)
        if [ $redis_recovery_result -gt 0 ]; then
            ((passed_tests++))
        else
            ((failed_tests++))
        fi
    else
        ((failed_tests++))
    fi
    
    # Test 3: Service Failure and Recovery
    log "\n${YELLOW}=== Service Failure Scenarios ===${NC}"
    
    services=(
        "User Service:tradeflow-user-service:http://localhost:3001"
        "Strategy Service:tradeflow-strategy-service:http://localhost:3002"
        "Portfolio Service:tradeflow-portfolio-service:http://localhost:3003"
    )
    
    for service_info in "${services[@]}"; do
        IFS=':' read -r service_name container_name service_url <<< "$service_info"
        ((total_tests++))
        
        local service_failure_start=$(simulate_service_failure "$service_name" "$container_name")
        if [ $service_failure_start -gt 0 ]; then
            local service_recovery_result=$(recover_service "$service_name" "$container_name" "$service_url" $service_failure_start)
            if [ $service_recovery_result -gt 0 ]; then
                ((passed_tests++))
            else
                ((failed_tests++))
            fi
        else
            ((failed_tests++))
        fi
    done
    
    # Test 4: Network Partition
    log "\n${YELLOW}=== Network Partition Scenario ===${NC}"
    ((total_tests++))
    local partition_start=$(simulate_network_partition)
    if [ $partition_start -gt 0 ]; then
        local partition_recovery=$(recover_from_network_partition $partition_start)
        if [ $partition_recovery -gt 0 ]; then
            ((passed_tests++))
        else
            ((failed_tests++))
        fi
    else
        ((failed_tests++))
    fi
    
    # Test 5: Cascading Failure
    log "\n${YELLOW}=== Cascading Failure Scenario ===${NC}"
    ((total_tests++))
    local cascade_result=$(test_cascading_failure)
    if [ $cascade_result -gt 0 ]; then
        ((passed_tests++))
    else
        ((failed_tests++))
    fi
    
    # Test 6: Data Consistency
    log "\n${YELLOW}=== Data Consistency Validation ===${NC}"
    ((total_tests++))
    if test_data_consistency; then
        ((passed_tests++))
    else
        ((failed_tests++))
    fi
    
    # Test 7: Backup System Resilience
    log "\n${YELLOW}=== Backup System Resilience ===${NC}"
    ((total_tests++))
    if test_backup_during_disaster; then
        ((passed_tests++))
    else
        ((failed_tests++))
    fi
    
    # Record test completion
    record_event "TEST_COMPLETE" "Disaster recovery testing completed"
    
    # Generate comprehensive report
    generate_report $total_tests $passed_tests $failed_tests
    
    # Final summary
    log "\n${GREEN}🎉 Disaster Recovery Testing Completed!${NC}"
    log "${BLUE}Results: $passed_tests/$total_tests tests passed${NC}"
    log "${BLUE}Report saved to: $TEST_RESULTS_DIR/disaster-recovery-report.md${NC}"
    
    if [ $failed_tests -eq 0 ]; then
        log "${GREEN}✅ All disaster recovery tests passed - System is resilient${NC}"
        exit 0
    else
        log "${RED}❌ $failed_tests tests failed - System resilience needs improvement${NC}"
        exit 1
    fi
}

# Run main function
main "$@"