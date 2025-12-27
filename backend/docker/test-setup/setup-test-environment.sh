#!/bin/bash

# Test Environment Setup Script
# Initializes databases and test data for CI/CD pipeline

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
DATABASE_URL="${DATABASE_URL:-postgresql://test_user:test_password@postgres-test:5432/test_db}"
REDIS_URL="${REDIS_URL:-redis://redis-test:6379}"

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

# Function to wait for services
wait_for_services() {
    print_status "Waiting for database and Redis to be ready..."
    
    # Wait for PostgreSQL
    local db_host=$(echo "$DATABASE_URL" | sed -n 's/.*@\([^:]*\):.*/\1/p')
    local db_port=$(echo "$DATABASE_URL" | sed -n 's/.*:\([0-9]*\)\/.*/\1/p')
    local db_name=$(echo "$DATABASE_URL" | sed -n 's/.*\/\([^?]*\).*/\1/p')
    local db_user=$(echo "$DATABASE_URL" | sed -n 's/.*\/\/\([^:]*\):.*/\1/p')
    local db_pass=$(echo "$DATABASE_URL" | sed -n 's/.*\/\/[^:]*:\([^@]*\)@.*/\1/p')
    
    export PGPASSWORD="$db_pass"
    
    local max_attempts=30
    local attempt=1
    
    while [ $attempt -le $max_attempts ]; do
        if pg_isready -h "$db_host" -p "$db_port" -U "$db_user" -d "$db_name" >/dev/null 2>&1; then
            print_success "PostgreSQL is ready"
            break
        fi
        
        print_status "Waiting for PostgreSQL... (attempt $attempt/$max_attempts)"
        sleep 2
        attempt=$((attempt + 1))
    done
    
    if [ $attempt -gt $max_attempts ]; then
        print_error "PostgreSQL failed to become ready"
        exit 1
    fi
    
    # Wait for Redis
    local redis_host=$(echo "$REDIS_URL" | sed -n 's/.*\/\/\([^:]*\):.*/\1/p')
    local redis_port=$(echo "$REDIS_URL" | sed -n 's/.*:\([0-9]*\)$/\1/p')
    
    attempt=1
    while [ $attempt -le $max_attempts ]; do
        if redis-cli -h "$redis_host" -p "$redis_port" ping >/dev/null 2>&1; then
            print_success "Redis is ready"
            break
        fi
        
        print_status "Waiting for Redis... (attempt $attempt/$max_attempts)"
        sleep 2
        attempt=$((attempt + 1))
    done
    
    if [ $attempt -gt $max_attempts ]; then
        print_error "Redis failed to become ready"
        exit 1
    fi
}

# Function to setup database schema
setup_database_schema() {
    print_status "Setting up database schema..."
    
    local db_host=$(echo "$DATABASE_URL" | sed -n 's/.*@\([^:]*\):.*/\1/p')
    local db_port=$(echo "$DATABASE_URL" | sed -n 's/.*:\([0-9]*\)\/.*/\1/p')
    local db_name=$(echo "$DATABASE_URL" | sed -n 's/.*\/\([^?]*\).*/\1/p')
    local db_user=$(echo "$DATABASE_URL" | sed -n 's/.*\/\/\([^:]*\):.*/\1/p')
    local db_pass=$(echo "$DATABASE_URL" | sed -n 's/.*\/\/[^:]*:\([^@]*\)@.*/\1/p')
    
    export PGPASSWORD="$db_pass"
    
    # Run schema files
    if [ -d "/app/schema" ]; then
        for schema_file in /app/schema/*.sql; do
            if [ -f "$schema_file" ]; then
                print_status "Executing schema file: $(basename "$schema_file")"
                psql -h "$db_host" -p "$db_port" -U "$db_user" -d "$db_name" -f "$schema_file"
            fi
        done
    fi
    
    # Run migrations
    if [ -d "/app/migrations" ]; then
        for migration_file in /app/migrations/*.sql; do
            if [ -f "$migration_file" ]; then
                print_status "Executing migration: $(basename "$migration_file")"
                psql -h "$db_host" -p "$db_port" -U "$db_user" -d "$db_name" -f "$migration_file"
            fi
        done
    fi
    
    print_success "Database schema setup completed"
}

# Function to setup test data
setup_test_data() {
    print_status "Setting up test data..."
    
    # Generate test data
    /app/test-data-manager.sh generate
    
    # Seed databases
    /app/test-data-manager.sh seed
    
    print_success "Test data setup completed"
}

# Function to create test result tables
create_test_result_tables() {
    print_status "Creating test result tracking tables..."
    
    local db_host=$(echo "$DATABASE_URL" | sed -n 's/.*@\([^:]*\):.*/\1/p')
    local db_port=$(echo "$DATABASE_URL" | sed -n 's/.*:\([0-9]*\)\/.*/\1/p')
    local db_name=$(echo "$DATABASE_URL" | sed -n 's/.*\/\([^?]*\).*/\1/p')
    local db_user=$(echo "$DATABASE_URL" | sed -n 's/.*\/\/\([^:]*\):.*/\1/p')
    local db_pass=$(echo "$DATABASE_URL" | sed -n 's/.*\/\/[^:]*:\([^@]*\)@.*/\1/p')
    
    export PGPASSWORD="$db_pass"
    
    psql -h "$db_host" -p "$db_port" -U "$db_user" -d "$db_name" << 'EOF'
-- Test execution tracking tables
CREATE TABLE IF NOT EXISTS test_executions (
    id SERIAL PRIMARY KEY,
    execution_id VARCHAR(100) UNIQUE NOT NULL,
    commit_hash VARCHAR(40),
    branch VARCHAR(100),
    trigger_event VARCHAR(50),
    started_at TIMESTAMP DEFAULT NOW(),
    completed_at TIMESTAMP,
    status VARCHAR(20), -- running, completed, failed
    total_duration_ms INTEGER
);

CREATE TABLE IF NOT EXISTS test_suite_results (
    id SERIAL PRIMARY KEY,
    execution_id VARCHAR(100) REFERENCES test_executions(execution_id),
    suite_name VARCHAR(100) NOT NULL,
    suite_type VARCHAR(50), -- unit, integration, functional, performance, security
    status VARCHAR(20), -- passed, failed, skipped
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    duration_ms INTEGER,
    test_count INTEGER DEFAULT 0,
    passed_count INTEGER DEFAULT 0,
    failed_count INTEGER DEFAULT 0,
    skipped_count INTEGER DEFAULT 0,
    coverage_percent DECIMAL(5,2),
    error_message TEXT
);

CREATE TABLE IF NOT EXISTS test_case_results (
    id SERIAL PRIMARY KEY,
    suite_result_id INTEGER REFERENCES test_suite_results(id),
    test_name VARCHAR(200) NOT NULL,
    status VARCHAR(20), -- passed, failed, skipped
    duration_ms INTEGER,
    error_message TEXT,
    stack_trace TEXT
);

CREATE TABLE IF NOT EXISTS performance_benchmarks (
    id SERIAL PRIMARY KEY,
    execution_id VARCHAR(100) REFERENCES test_executions(execution_id),
    benchmark_name VARCHAR(100) NOT NULL,
    component VARCHAR(50), -- trading-engine, backtest-engine, etc.
    metric_name VARCHAR(50), -- latency, throughput, memory
    metric_value DECIMAL(15,6),
    metric_unit VARCHAR(20),
    baseline_value DECIMAL(15,6),
    regression_percent DECIMAL(5,2),
    threshold_exceeded BOOLEAN DEFAULT FALSE
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_test_executions_commit ON test_executions(commit_hash);
CREATE INDEX IF NOT EXISTS idx_test_executions_branch ON test_executions(branch);
CREATE INDEX IF NOT EXISTS idx_test_suite_results_execution ON test_suite_results(execution_id);
CREATE INDEX IF NOT EXISTS idx_test_case_results_suite ON test_case_results(suite_result_id);
CREATE INDEX IF NOT EXISTS idx_performance_benchmarks_execution ON performance_benchmarks(execution_id);

-- Views for reporting
CREATE OR REPLACE VIEW test_execution_summary AS
SELECT 
    te.execution_id,
    te.commit_hash,
    te.branch,
    te.trigger_event,
    te.started_at,
    te.completed_at,
    te.status,
    te.total_duration_ms,
    COUNT(tsr.id) as total_suites,
    COUNT(CASE WHEN tsr.status = 'passed' THEN 1 END) as passed_suites,
    COUNT(CASE WHEN tsr.status = 'failed' THEN 1 END) as failed_suites,
    ROUND(AVG(tsr.coverage_percent), 2) as avg_coverage,
    SUM(tsr.test_count) as total_tests,
    SUM(tsr.passed_count) as total_passed,
    SUM(tsr.failed_count) as total_failed
FROM test_executions te
LEFT JOIN test_suite_results tsr ON te.execution_id = tsr.execution_id
GROUP BY te.execution_id, te.commit_hash, te.branch, te.trigger_event, 
         te.started_at, te.completed_at, te.status, te.total_duration_ms;
EOF
    
    print_success "Test result tracking tables created"
}

# Function to setup Redis test data
setup_redis_test_data() {
    print_status "Setting up Redis test data..."
    
    local redis_host=$(echo "$REDIS_URL" | sed -n 's/.*\/\/\([^:]*\):.*/\1/p')
    local redis_port=$(echo "$REDIS_URL" | sed -n 's/.*:\([0-9]*\)$/\1/p')
    
    # Clear any existing test data
    redis-cli -h "$redis_host" -p "$redis_port" FLUSHALL
    
    # Set up test cache keys
    redis-cli -h "$redis_host" -p "$redis_port" << 'EOF'
SET test:market_data:AAPL:latest '{"symbol":"AAPL","price":150.00,"timestamp":"2024-01-01T10:00:00Z"}'
SET test:market_data:GOOGL:latest '{"symbol":"GOOGL","price":2800.00,"timestamp":"2024-01-01T10:00:00Z"}'
SET test:user:session:test-token '{"userId":"test-user-1","expires":"2024-12-31T23:59:59Z"}'
SADD test:active_strategies "strategy-1" "strategy-2"
HSET test:portfolio:test-user-1 cash_balance 10000 total_value 15000
EXPIRE test:market_data:AAPL:latest 3600
EXPIRE test:market_data:GOOGL:latest 3600
EXPIRE test:user:session:test-token 3600
EOF
    
    print_success "Redis test data setup completed"
}

# Function to validate test environment
validate_test_environment() {
    print_status "Validating test environment..."
    
    local errors=0
    
    # Check database connectivity
    local db_host=$(echo "$DATABASE_URL" | sed -n 's/.*@\([^:]*\):.*/\1/p')
    local db_port=$(echo "$DATABASE_URL" | sed -n 's/.*:\([0-9]*\)\/.*/\1/p')
    local db_name=$(echo "$DATABASE_URL" | sed -n 's/.*\/\([^?]*\).*/\1/p')
    local db_user=$(echo "$DATABASE_URL" | sed -n 's/.*\/\/\([^:]*\):.*/\1/p')
    local db_pass=$(echo "$DATABASE_URL" | sed -n 's/.*\/\/[^:]*:\([^@]*\)@.*/\1/p')
    
    export PGPASSWORD="$db_pass"
    
    if ! psql -h "$db_host" -p "$db_port" -U "$db_user" -d "$db_name" -c "SELECT 1;" >/dev/null 2>&1; then
        print_error "Database connectivity check failed"
        errors=$((errors + 1))
    else
        print_success "Database connectivity: OK"
    fi
    
    # Check Redis connectivity
    local redis_host=$(echo "$REDIS_URL" | sed -n 's/.*\/\/\([^:]*\):.*/\1/p')
    local redis_port=$(echo "$REDIS_URL" | sed -n 's/.*:\([0-9]*\)$/\1/p')
    
    if ! redis-cli -h "$redis_host" -p "$redis_port" ping >/dev/null 2>&1; then
        print_error "Redis connectivity check failed"
        errors=$((errors + 1))
    else
        print_success "Redis connectivity: OK"
    fi
    
    # Check required tables exist
    local table_count=$(psql -h "$db_host" -p "$db_port" -U "$db_user" -d "$db_name" -t -c "
        SELECT COUNT(*) FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name IN ('users', 'strategies', 'portfolios', 'test_executions');
    " 2>/dev/null | tr -d ' ')
    
    if [ "$table_count" -lt 4 ]; then
        print_error "Required database tables missing (found $table_count/4)"
        errors=$((errors + 1))
    else
        print_success "Database schema: OK"
    fi
    
    # Check test data exists
    local user_count=$(psql -h "$db_host" -p "$db_port" -U "$db_user" -d "$db_name" -t -c "
        SELECT COUNT(*) FROM users WHERE id LIKE 'test-%';
    " 2>/dev/null | tr -d ' ')
    
    if [ "$user_count" -lt 1 ]; then
        print_error "Test user data missing"
        errors=$((errors + 1))
    else
        print_success "Test data: OK"
    fi
    
    if [ $errors -eq 0 ]; then
        print_success "Test environment validation passed"
        return 0
    else
        print_error "Test environment validation failed with $errors errors"
        return 1
    fi
}

# Main execution
main() {
    print_status "Starting test environment setup..."
    
    wait_for_services
    setup_database_schema
    create_test_result_tables
    setup_test_data
    setup_redis_test_data
    
    if validate_test_environment; then
        print_success "Test environment setup completed successfully"
        
        # Create completion marker
        echo "Test environment setup completed at $(date)" > /tmp/test-env-ready
        
        exit 0
    else
        print_error "Test environment setup failed"
        exit 1
    fi
}

# Run main function
main "$@"