#!/bin/bash

# Backup and Restore Procedure Testing for TradeFlow Backend

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
TEST_RESULTS_DIR="$PROJECT_ROOT/backup-restore-results"
BACKUP_DIR="$PROJECT_ROOT/test-backups"

# Configuration
POSTGRES_CONTAINER=${POSTGRES_CONTAINER:-"tradeflow-postgres"}
REDIS_CONTAINER=${REDIS_CONTAINER:-"tradeflow-redis"}
POSTGRES_DB=${POSTGRES_DB:-"tradeflow"}
POSTGRES_USER=${POSTGRES_USER:-"tradeflow"}
POSTGRES_PASSWORD=${POSTGRES_PASSWORD:-"tradeflow_dev_password"}

echo -e "${GREEN}💾 Backup and Restore Procedure Testing${NC}"
echo -e "${BLUE}Testing database backup and restore procedures...${NC}"

# Create directories
mkdir -p "$TEST_RESULTS_DIR"
mkdir -p "$BACKUP_DIR"

# Function to log with timestamp
log() {
    echo -e "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$TEST_RESULTS_DIR/backup-restore.log"
}

# Function to check if container is running
check_container() {
    local container_name=$1
    
    if docker ps --format "table {{.Names}}" | grep -q "^$container_name$"; then
        return 0
    else
        return 1
    fi
}

# Function to wait for database to be ready
wait_for_database() {
    local container_name=$1
    local max_attempts=30
    local attempt=1
    
    log "${BLUE}Waiting for database to be ready...${NC}"
    
    while [ $attempt -le $max_attempts ]; do
        if docker exec "$container_name" pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB" &>/dev/null; then
            log "${GREEN}✅ Database is ready${NC}"
            return 0
        fi
        
        sleep 2
        ((attempt++))
    done
    
    log "${RED}❌ Database failed to become ready after $max_attempts attempts${NC}"
    return 1
}

# Function to create test data
create_test_data() {
    log "${BLUE}Creating test data...${NC}"
    
    # Create test data SQL
    local test_data_sql="$BACKUP_DIR/test-data.sql"
    
    cat > "$test_data_sql" << 'EOF'
-- Test data for backup/restore validation

-- Insert test users
INSERT INTO users (id, email, password_hash, first_name, last_name, created_at, updated_at) VALUES
('test-user-1', 'backup-test-1@example.com', '$2b$10$hash1', 'Backup', 'Test1', NOW(), NOW()),
('test-user-2', 'backup-test-2@example.com', '$2b$10$hash2', 'Backup', 'Test2', NOW(), NOW()),
('test-user-3', 'backup-test-3@example.com', '$2b$10$hash3', 'Backup', 'Test3', NOW(), NOW());

-- Insert test strategies
INSERT INTO strategies (id, user_id, name, description, config, created_at, updated_at) VALUES
('strategy-1', 'test-user-1', 'Test Strategy 1', 'Backup test strategy', '{"type": "test"}', NOW(), NOW()),
('strategy-2', 'test-user-2', 'Test Strategy 2', 'Backup test strategy', '{"type": "test"}', NOW(), NOW());

-- Insert test portfolios
INSERT INTO portfolios (id, user_id, name, cash_balance, total_value, created_at, updated_at) VALUES
('portfolio-1', 'test-user-1', 'Test Portfolio 1', 10000.00, 10000.00, NOW(), NOW()),
('portfolio-2', 'test-user-2', 'Test Portfolio 2', 20000.00, 20000.00, NOW(), NOW());

-- Insert test positions
INSERT INTO positions (id, portfolio_id, symbol, quantity, average_price, current_price, created_at, updated_at) VALUES
('position-1', 'portfolio-1', 'AAPL', 100, 150.00, 155.00, NOW(), NOW()),
('position-2', 'portfolio-1', 'GOOGL', 50, 2500.00, 2550.00, NOW(), NOW()),
('position-3', 'portfolio-2', 'MSFT', 200, 300.00, 310.00, NOW(), NOW());

-- Insert test trades
INSERT INTO trades (id, portfolio_id, strategy_id, symbol, side, quantity, price, executed_at, created_at) VALUES
('trade-1', 'portfolio-1', 'strategy-1', 'AAPL', 'buy', 100, 150.00, NOW(), NOW()),
('trade-2', 'portfolio-1', 'strategy-1', 'GOOGL', 'buy', 50, 2500.00, NOW(), NOW()),
('trade-3', 'portfolio-2', 'strategy-2', 'MSFT', 'buy', 200, 300.00, NOW(), NOW());
EOF
    
    # Execute test data insertion
    if docker exec -i "$POSTGRES_CONTAINER" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" < "$test_data_sql"; then
        log "${GREEN}✅ Test data created successfully${NC}"
        
        # Verify test data
        local user_count=$(docker exec "$POSTGRES_CONTAINER" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -t -c "SELECT COUNT(*) FROM users WHERE email LIKE 'backup-test-%';" | tr -d ' ')
        local strategy_count=$(docker exec "$POSTGRES_CONTAINER" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -t -c "SELECT COUNT(*) FROM strategies WHERE name LIKE 'Test Strategy%';" | tr -d ' ')
        local trade_count=$(docker exec "$POSTGRES_CONTAINER" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -t -c "SELECT COUNT(*) FROM trades WHERE id LIKE 'trade-%';" | tr -d ' ')
        
        log "${BLUE}Created: $user_count users, $strategy_count strategies, $trade_count trades${NC}"
        
        # Save counts for verification
        echo "users:$user_count" > "$TEST_RESULTS_DIR/original-counts.txt"
        echo "strategies:$strategy_count" >> "$TEST_RESULTS_DIR/original-counts.txt"
        echo "trades:$trade_count" >> "$TEST_RESULTS_DIR/original-counts.txt"
        
        return 0
    else
        log "${RED}❌ Failed to create test data${NC}"
        return 1
    fi
}

# Function to create Redis test data
create_redis_test_data() {
    log "${BLUE}Creating Redis test data...${NC}"
    
    # Add test data to Redis
    docker exec "$REDIS_CONTAINER" redis-cli SET "backup-test:key1" "value1" EX 3600
    docker exec "$REDIS_CONTAINER" redis-cli SET "backup-test:key2" "value2" EX 3600
    docker exec "$REDIS_CONTAINER" redis-cli SET "backup-test:key3" "value3" EX 3600
    docker exec "$REDIS_CONTAINER" redis-cli HSET "backup-test:hash" "field1" "hashvalue1" "field2" "hashvalue2"
    docker exec "$REDIS_CONTAINER" redis-cli LPUSH "backup-test:list" "item1" "item2" "item3"
    
    # Verify Redis data
    local key_count=$(docker exec "$REDIS_CONTAINER" redis-cli KEYS "backup-test:*" | wc -l)
    log "${GREEN}✅ Created $key_count Redis test keys${NC}"
    
    # Save Redis keys for verification
    docker exec "$REDIS_CONTAINER" redis-cli KEYS "backup-test:*" > "$TEST_RESULTS_DIR/original-redis-keys.txt"
    
    return 0
}

# Function to backup PostgreSQL database
backup_postgresql() {
    log "${BLUE}Creating PostgreSQL backup...${NC}"
    
    local backup_file="$BACKUP_DIR/postgres-backup-$(date +%Y%m%d-%H%M%S).sql"
    
    # Create database backup
    if docker exec "$POSTGRES_CONTAINER" pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists > "$backup_file"; then
        log "${GREEN}✅ PostgreSQL backup created: $(basename "$backup_file")${NC}"
        
        # Verify backup file
        local backup_size=$(stat -f%z "$backup_file" 2>/dev/null || stat -c%s "$backup_file" 2>/dev/null || echo "0")
        log "${BLUE}Backup file size: $backup_size bytes${NC}"
        
        if [ "$backup_size" -gt 1000 ]; then
            log "${GREEN}✅ Backup file appears to contain data${NC}"
            echo "$backup_file" > "$TEST_RESULTS_DIR/postgres-backup-path.txt"
            return 0
        else
            log "${RED}❌ Backup file is too small${NC}"
            return 1
        fi
    else
        log "${RED}❌ PostgreSQL backup failed${NC}"
        return 1
    fi
}

# Function to backup Redis data
backup_redis() {
    log "${BLUE}Creating Redis backup...${NC}"
    
    local backup_file="$BACKUP_DIR/redis-backup-$(date +%Y%m%d-%H%M%S).rdb"
    
    # Trigger Redis save
    docker exec "$REDIS_CONTAINER" redis-cli BGSAVE
    
    # Wait for background save to complete
    local save_in_progress=1
    local attempts=0
    while [ $save_in_progress -eq 1 ] && [ $attempts -lt 30 ]; do
        if docker exec "$REDIS_CONTAINER" redis-cli LASTSAVE | grep -q "$(docker exec "$REDIS_CONTAINER" redis-cli LASTSAVE)"; then
            sleep 1
            ((attempts++))
            
            # Check if BGSAVE is still in progress
            if docker exec "$REDIS_CONTAINER" redis-cli INFO persistence | grep -q "rdb_bgsave_in_progress:0"; then
                save_in_progress=0
            fi
        else
            break
        fi
    done
    
    # Copy Redis dump file
    if docker cp "$REDIS_CONTAINER:/data/dump.rdb" "$backup_file"; then
        log "${GREEN}✅ Redis backup created: $(basename "$backup_file")${NC}"
        
        # Verify backup file
        local backup_size=$(stat -f%z "$backup_file" 2>/dev/null || stat -c%s "$backup_file" 2>/dev/null || echo "0")
        log "${BLUE}Backup file size: $backup_size bytes${NC}"
        
        echo "$backup_file" > "$TEST_RESULTS_DIR/redis-backup-path.txt"
        return 0
    else
        log "${RED}❌ Redis backup failed${NC}"
        return 1
    fi
}

# Function to simulate data corruption/loss
simulate_data_loss() {
    log "${BLUE}Simulating data loss...${NC}"
    
    # Delete test data from PostgreSQL
    docker exec "$POSTGRES_CONTAINER" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "DELETE FROM trades WHERE id LIKE 'trade-%';"
    docker exec "$POSTGRES_CONTAINER" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "DELETE FROM positions WHERE id LIKE 'position-%';"
    docker exec "$POSTGRES_CONTAINER" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "DELETE FROM portfolios WHERE id LIKE 'portfolio-%';"
    docker exec "$POSTGRES_CONTAINER" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "DELETE FROM strategies WHERE id LIKE 'strategy-%';"
    docker exec "$POSTGRES_CONTAINER" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "DELETE FROM users WHERE email LIKE 'backup-test-%';"
    
    # Delete test data from Redis
    docker exec "$REDIS_CONTAINER" redis-cli DEL "backup-test:key1" "backup-test:key2" "backup-test:key3" "backup-test:hash" "backup-test:list"
    
    # Verify data loss
    local remaining_users=$(docker exec "$POSTGRES_CONTAINER" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -t -c "SELECT COUNT(*) FROM users WHERE email LIKE 'backup-test-%';" | tr -d ' ')
    local remaining_redis_keys=$(docker exec "$REDIS_CONTAINER" redis-cli KEYS "backup-test:*" | wc -l)
    
    log "${YELLOW}⚠️  Data loss simulated: $remaining_users users, $remaining_redis_keys Redis keys remaining${NC}"
    
    return 0
}

# Function to restore PostgreSQL database
restore_postgresql() {
    log "${BLUE}Restoring PostgreSQL database...${NC}"
    
    local backup_file=$(cat "$TEST_RESULTS_DIR/postgres-backup-path.txt")
    
    if [ ! -f "$backup_file" ]; then
        log "${RED}❌ Backup file not found: $backup_file${NC}"
        return 1
    fi
    
    # Restore database
    if docker exec -i "$POSTGRES_CONTAINER" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" < "$backup_file"; then
        log "${GREEN}✅ PostgreSQL database restored${NC}"
        
        # Verify restoration
        local restored_users=$(docker exec "$POSTGRES_CONTAINER" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -t -c "SELECT COUNT(*) FROM users WHERE email LIKE 'backup-test-%';" | tr -d ' ')
        local restored_strategies=$(docker exec "$POSTGRES_CONTAINER" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -t -c "SELECT COUNT(*) FROM strategies WHERE name LIKE 'Test Strategy%';" | tr -d ' ')
        local restored_trades=$(docker exec "$POSTGRES_CONTAINER" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -t -c "SELECT COUNT(*) FROM trades WHERE id LIKE 'trade-%';" | tr -d ' ')
        
        log "${BLUE}Restored: $restored_users users, $restored_strategies strategies, $restored_trades trades${NC}"
        
        # Compare with original counts
        local original_users=$(grep "users:" "$TEST_RESULTS_DIR/original-counts.txt" | cut -d: -f2)
        local original_strategies=$(grep "strategies:" "$TEST_RESULTS_DIR/original-counts.txt" | cut -d: -f2)
        local original_trades=$(grep "trades:" "$TEST_RESULTS_DIR/original-counts.txt" | cut -d: -f2)
        
        if [ "$restored_users" -eq "$original_users" ] && \
           [ "$restored_strategies" -eq "$original_strategies" ] && \
           [ "$restored_trades" -eq "$original_trades" ]; then
            log "${GREEN}✅ All data restored successfully${NC}"
            return 0
        else
            log "${RED}❌ Data restoration incomplete${NC}"
            log "${RED}Expected: $original_users users, $original_strategies strategies, $original_trades trades${NC}"
            log "${RED}Restored: $restored_users users, $restored_strategies strategies, $restored_trades trades${NC}"
            return 1
        fi
    else
        log "${RED}❌ PostgreSQL database restoration failed${NC}"
        return 1
    fi
}

# Function to restore Redis data
restore_redis() {
    log "${BLUE}Restoring Redis data...${NC}"
    
    local backup_file=$(cat "$TEST_RESULTS_DIR/redis-backup-path.txt")
    
    if [ ! -f "$backup_file" ]; then
        log "${RED}❌ Redis backup file not found: $backup_file${NC}"
        return 1
    fi
    
    # Stop Redis to replace dump file
    docker exec "$REDIS_CONTAINER" redis-cli SHUTDOWN NOSAVE || true
    sleep 2
    
    # Replace dump file
    if docker cp "$backup_file" "$REDIS_CONTAINER:/data/dump.rdb"; then
        log "${BLUE}Redis dump file replaced${NC}"
        
        # Start Redis container
        docker start "$REDIS_CONTAINER" &>/dev/null || true
        sleep 5
        
        # Verify Redis is running
        if docker exec "$REDIS_CONTAINER" redis-cli ping &>/dev/null; then
            log "${GREEN}✅ Redis restarted successfully${NC}"
            
            # Verify restored data
            local restored_keys=$(docker exec "$REDIS_CONTAINER" redis-cli KEYS "backup-test:*" | wc -l)
            local original_keys=$(wc -l < "$TEST_RESULTS_DIR/original-redis-keys.txt")
            
            log "${BLUE}Restored Redis keys: $restored_keys (original: $original_keys)${NC}"
            
            if [ "$restored_keys" -eq "$original_keys" ]; then
                log "${GREEN}✅ Redis data restored successfully${NC}"
                return 0
            else
                log "${YELLOW}⚠️  Redis data restoration incomplete${NC}"
                return 1
            fi
        else
            log "${RED}❌ Redis failed to restart${NC}"
            return 1
        fi
    else
        log "${RED}❌ Failed to replace Redis dump file${NC}"
        return 1
    fi
}

# Function to test incremental backup
test_incremental_backup() {
    log "${BLUE}Testing incremental backup...${NC}"
    
    # Create additional test data
    local incremental_sql="$BACKUP_DIR/incremental-data.sql"
    
    cat > "$incremental_sql" << 'EOF'
-- Additional data for incremental backup test
INSERT INTO users (id, email, password_hash, first_name, last_name, created_at, updated_at) VALUES
('incremental-user-1', 'incremental-test@example.com', '$2b$10$hash4', 'Incremental', 'Test', NOW(), NOW());

INSERT INTO trades (id, portfolio_id, strategy_id, symbol, side, quantity, price, executed_at, created_at) VALUES
('incremental-trade-1', 'portfolio-1', 'strategy-1', 'TSLA', 'buy', 50, 800.00, NOW(), NOW());
EOF
    
    # Add incremental data
    if docker exec -i "$POSTGRES_CONTAINER" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" < "$incremental_sql"; then
        log "${GREEN}✅ Incremental data added${NC}"
        
        # Create incremental backup (using timestamp-based approach)
        local incremental_backup="$BACKUP_DIR/incremental-backup-$(date +%Y%m%d-%H%M%S).sql"
        local timestamp=$(date -u -d '1 minute ago' '+%Y-%m-%d %H:%M:%S')
        
        # Export only recently modified data
        docker exec "$POSTGRES_CONTAINER" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "\\copy (SELECT * FROM users WHERE updated_at > '$timestamp') TO STDOUT WITH CSV HEADER" > "$incremental_backup.users.csv"
        docker exec "$POSTGRES_CONTAINER" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "\\copy (SELECT * FROM trades WHERE created_at > '$timestamp') TO STDOUT WITH CSV HEADER" > "$incremental_backup.trades.csv"
        
        log "${GREEN}✅ Incremental backup created${NC}"
        return 0
    else
        log "${RED}❌ Failed to create incremental data${NC}"
        return 1
    fi
}

# Function to test point-in-time recovery
test_point_in_time_recovery() {
    log "${BLUE}Testing point-in-time recovery simulation...${NC}"
    
    # This is a simulation since full PITR requires WAL archiving
    # In production, this would involve WAL files and pg_basebackup
    
    # Record current timestamp
    local recovery_point=$(date -u '+%Y-%m-%d %H:%M:%S')
    echo "$recovery_point" > "$TEST_RESULTS_DIR/recovery-point.txt"
    
    # Create some data after the recovery point
    sleep 2
    docker exec "$POSTGRES_CONTAINER" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "INSERT INTO users (id, email, password_hash, first_name, last_name, created_at, updated_at) VALUES ('pitr-user', 'pitr-test@example.com', 'hash', 'PITR', 'Test', NOW(), NOW());"
    
    # Count data before and after recovery point
    local total_users=$(docker exec "$POSTGRES_CONTAINER" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -t -c "SELECT COUNT(*) FROM users;" | tr -d ' ')
    local users_before_recovery=$(docker exec "$POSTGRES_CONTAINER" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -t -c "SELECT COUNT(*) FROM users WHERE created_at <= '$recovery_point';" | tr -d ' ')
    
    log "${BLUE}Total users: $total_users, Users before recovery point: $users_before_recovery${NC}"
    
    # Simulate PITR by deleting data created after recovery point
    docker exec "$POSTGRES_CONTAINER" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "DELETE FROM users WHERE created_at > '$recovery_point';"
    
    local users_after_pitr=$(docker exec "$POSTGRES_CONTAINER" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -t -c "SELECT COUNT(*) FROM users;" | tr -d ' ')
    
    if [ "$users_after_pitr" -eq "$users_before_recovery" ]; then
        log "${GREEN}✅ Point-in-time recovery simulation successful${NC}"
        return 0
    else
        log "${RED}❌ Point-in-time recovery simulation failed${NC}"
        return 1
    fi
}

# Function to test backup integrity
test_backup_integrity() {
    log "${BLUE}Testing backup integrity...${NC}"
    
    local postgres_backup=$(cat "$TEST_RESULTS_DIR/postgres-backup-path.txt")
    local redis_backup=$(cat "$TEST_RESULTS_DIR/redis-backup-path.txt")
    
    # Test PostgreSQL backup integrity
    if [ -f "$postgres_backup" ]; then
        # Check if backup contains expected tables
        if grep -q "CREATE TABLE users" "$postgres_backup" && \
           grep -q "CREATE TABLE strategies" "$postgres_backup" && \
           grep -q "CREATE TABLE trades" "$postgres_backup"; then
            log "${GREEN}✅ PostgreSQL backup contains expected schema${NC}"
        else
            log "${RED}❌ PostgreSQL backup missing expected schema${NC}"
            return 1
        fi
        
        # Check if backup contains test data
        if grep -q "backup-test-" "$postgres_backup"; then
            log "${GREEN}✅ PostgreSQL backup contains test data${NC}"
        else
            log "${YELLOW}⚠️  PostgreSQL backup may not contain test data${NC}"
        fi
    else
        log "${RED}❌ PostgreSQL backup file not found${NC}"
        return 1
    fi
    
    # Test Redis backup integrity
    if [ -f "$redis_backup" ]; then
        local backup_size=$(stat -f%z "$redis_backup" 2>/dev/null || stat -c%s "$redis_backup" 2>/dev/null || echo "0")
        
        if [ "$backup_size" -gt 100 ]; then
            log "${GREEN}✅ Redis backup file has reasonable size${NC}"
        else
            log "${RED}❌ Redis backup file is too small${NC}"
            return 1
        fi
        
        # Check Redis backup magic number (RDB format starts with "REDIS")
        if file "$redis_backup" | grep -q "Redis" || head -c 5 "$redis_backup" | grep -q "REDIS"; then
            log "${GREEN}✅ Redis backup has correct format${NC}"
        else
            log "${YELLOW}⚠️  Redis backup format could not be verified${NC}"
        fi
    else
        log "${RED}❌ Redis backup file not found${NC}"
        return 1
    fi
    
    return 0
}

# Function to generate backup/restore report
generate_report() {
    local total_tests=$1
    local passed_tests=$2
    local failed_tests=$3
    
    log "${YELLOW}Generating backup and restore report...${NC}"
    
    cat > "$TEST_RESULTS_DIR/backup-restore-report.md" << EOF
# Backup and Restore Testing Report

Generated: $(date)

## Test Summary
- Total Tests: $total_tests
- Passed: $passed_tests
- Failed: $failed_tests
- Success Rate: $(( passed_tests * 100 / total_tests ))%

## Test Results
$(cat "$TEST_RESULTS_DIR/backup-restore.log" | grep -E "✅|❌|⚠️" | sed 's/\[.*\] /- /')

## Backup Files Created
$(ls -la "$BACKUP_DIR" | grep -E "\\.sql$|\\.rdb$|\\.csv$" | awk '{print "- " $9 " (" $5 " bytes)"}')

## Data Verification
$(if [ -f "$TEST_RESULTS_DIR/original-counts.txt" ]; then
    echo "### Original Data Counts"
    cat "$TEST_RESULTS_DIR/original-counts.txt" | sed 's/^/- /'
fi)

## Recovery Point Information
$(if [ -f "$TEST_RESULTS_DIR/recovery-point.txt" ]; then
    echo "- Point-in-time recovery test point: $(cat "$TEST_RESULTS_DIR/recovery-point.txt")"
fi)

## Recommendations
$(if [ $failed_tests -gt 0 ]; then
    echo "1. Investigate failed backup/restore procedures immediately"
    echo "2. Review backup file integrity and permissions"
    echo "3. Test restore procedures in isolated environment"
fi)
4. Implement automated backup validation
5. Set up regular backup testing schedule
6. Configure backup retention policies
7. Test disaster recovery procedures end-to-end
8. Document backup and restore procedures
9. Train operations team on recovery procedures
10. Implement monitoring for backup job success/failure

## Production Recommendations
1. Enable PostgreSQL WAL archiving for point-in-time recovery
2. Set up automated daily backups with retention policy
3. Store backups in multiple locations (local + cloud)
4. Encrypt backup files for security
5. Test restore procedures monthly
6. Monitor backup job completion and file integrity
7. Document RTO (Recovery Time Objective) and RPO (Recovery Point Objective)

## Files Generated
- backup-restore.log - Detailed test execution log
- postgres-backup-*.sql - PostgreSQL backup files
- redis-backup-*.rdb - Redis backup files
- incremental-backup-*.csv - Incremental backup files
- original-counts.txt - Original data counts for verification
- recovery-point.txt - Point-in-time recovery test timestamp

## Next Steps
1. Fix any failed backup/restore procedures
2. Implement production backup automation
3. Set up backup monitoring and alerting
4. Create disaster recovery runbooks
5. Schedule regular backup testing
EOF
}

# Main test execution
main() {
    log "${GREEN}🚀 Starting Backup and Restore Testing${NC}"
    
    # Check prerequisites
    if ! check_container "$POSTGRES_CONTAINER"; then
        log "${RED}❌ PostgreSQL container not running: $POSTGRES_CONTAINER${NC}"
        exit 1
    fi
    
    if ! check_container "$REDIS_CONTAINER"; then
        log "${RED}❌ Redis container not running: $REDIS_CONTAINER${NC}"
        exit 1
    fi
    
    # Wait for database to be ready
    if ! wait_for_database "$POSTGRES_CONTAINER"; then
        log "${RED}❌ Database is not ready${NC}"
        exit 1
    fi
    
    local total_tests=0
    local passed_tests=0
    local failed_tests=0
    
    # Test 1: Create test data
    log "\n${YELLOW}=== Creating Test Data ===${NC}"
    ((total_tests++))
    if create_test_data && create_redis_test_data; then
        ((passed_tests++))
    else
        ((failed_tests++))
        log "${RED}❌ Cannot proceed without test data${NC}"
        exit 1
    fi
    
    # Test 2: Create backups
    log "\n${YELLOW}=== Creating Backups ===${NC}"
    ((total_tests++))
    if backup_postgresql && backup_redis; then
        ((passed_tests++))
    else
        ((failed_tests++))
    fi
    
    # Test 3: Test backup integrity
    log "\n${YELLOW}=== Testing Backup Integrity ===${NC}"
    ((total_tests++))
    if test_backup_integrity; then
        ((passed_tests++))
    else
        ((failed_tests++))
    fi
    
    # Test 4: Simulate data loss
    log "\n${YELLOW}=== Simulating Data Loss ===${NC}"
    ((total_tests++))
    if simulate_data_loss; then
        ((passed_tests++))
    else
        ((failed_tests++))
    fi
    
    # Test 5: Restore from backups
    log "\n${YELLOW}=== Restoring from Backups ===${NC}"
    ((total_tests++))
    if restore_postgresql && restore_redis; then
        ((passed_tests++))
    else
        ((failed_tests++))
    fi
    
    # Test 6: Incremental backup
    log "\n${YELLOW}=== Testing Incremental Backup ===${NC}"
    ((total_tests++))
    if test_incremental_backup; then
        ((passed_tests++))
    else
        ((failed_tests++))
    fi
    
    # Test 7: Point-in-time recovery simulation
    log "\n${YELLOW}=== Testing Point-in-Time Recovery ===${NC}"
    ((total_tests++))
    if test_point_in_time_recovery; then
        ((passed_tests++))
    else
        ((failed_tests++))
    fi
    
    # Generate report
    generate_report $total_tests $passed_tests $failed_tests
    
    # Cleanup test data
    log "\n${YELLOW}Cleaning up test data...${NC}"
    docker exec "$POSTGRES_CONTAINER" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "DELETE FROM trades WHERE id LIKE 'trade-%' OR id LIKE 'incremental-trade-%';" &>/dev/null || true
    docker exec "$POSTGRES_CONTAINER" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "DELETE FROM positions WHERE id LIKE 'position-%';" &>/dev/null || true
    docker exec "$POSTGRES_CONTAINER" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "DELETE FROM portfolios WHERE id LIKE 'portfolio-%';" &>/dev/null || true
    docker exec "$POSTGRES_CONTAINER" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "DELETE FROM strategies WHERE id LIKE 'strategy-%';" &>/dev/null || true
    docker exec "$POSTGRES_CONTAINER" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "DELETE FROM users WHERE email LIKE '%test%' OR id LIKE '%user%';" &>/dev/null || true
    docker exec "$REDIS_CONTAINER" redis-cli DEL "backup-test:key1" "backup-test:key2" "backup-test:key3" "backup-test:hash" "backup-test:list" &>/dev/null || true
    
    # Final summary
    log "\n${GREEN}🎉 Backup and Restore Testing Completed!${NC}"
    log "${BLUE}Results: $passed_tests/$total_tests tests passed${NC}"
    log "${BLUE}Report saved to: $TEST_RESULTS_DIR/backup-restore-report.md${NC}"
    log "${BLUE}Backup files saved to: $BACKUP_DIR/${NC}"
    
    if [ $failed_tests -eq 0 ]; then
        log "${GREEN}✅ All backup and restore tests passed${NC}"
        exit 0
    else
        log "${RED}❌ $failed_tests tests failed - Backup/restore procedures need attention${NC}"
        exit 1
    fi
}

# Run main function
main "$@"