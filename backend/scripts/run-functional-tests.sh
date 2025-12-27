#!/bin/bash

# TradeFlow Backend Functional Test Runner
# This script runs comprehensive functional tests for all backend services

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
TEST_DB_NAME="tradeflow_test"
TEST_REDIS_DB="1"
DOCKER_COMPOSE_FILE="docker-compose.test.yml"

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

# Function to wait for service to be ready
wait_for_service() {
    local host=$1
    local port=$2
    local service_name=$3
    local max_attempts=30
    local attempt=1

    print_status "Waiting for $service_name to be ready..."
    
    while [ $attempt -le $max_attempts ]; do
        if nc -z "$host" "$port" 2>/dev/null; then
            print_success "$service_name is ready!"
            return 0
        fi
        
        echo -n "."
        sleep 1
        attempt=$((attempt + 1))
    done
    
    print_error "$service_name failed to start within $max_attempts seconds"
    return 1
}

# Function to setup test database
setup_test_database() {
    print_status "Setting up test database..."
    
    # Check if PostgreSQL is running
    if ! command_exists psql; then
        print_error "PostgreSQL client (psql) not found. Please install PostgreSQL."
        exit 1
    fi
    
    # Create test database if it doesn't exist
    createdb "$TEST_DB_NAME" 2>/dev/null || true
    
    # Run migrations
    print_status "Running database migrations..."
    cd database
    npm install
    npm run migrate
    cd ..
    
    print_success "Test database setup complete"
}

# Function to setup test Redis
setup_test_redis() {
    print_status "Setting up test Redis..."
    
    # Check if Redis is running
    if ! command_exists redis-cli; then
        print_error "Redis client (redis-cli) not found. Please install Redis."
        exit 1
    fi
    
    # Clear test Redis database
    redis-cli -n "$TEST_REDIS_DB" FLUSHDB
    
    print_success "Test Redis setup complete"
}

# Function to start test services
start_test_services() {
    print_status "Starting test services..."
    
    # Check if Docker Compose is available
    if command_exists docker-compose; then
        if [ -f "$DOCKER_COMPOSE_FILE" ]; then
            print_status "Starting services with Docker Compose..."
            docker-compose -f "$DOCKER_COMPOSE_FILE" up -d
            
            # Wait for services to be ready
            wait_for_service "localhost" "5432" "PostgreSQL"
            wait_for_service "localhost" "6379" "Redis"
        else
            print_warning "Docker Compose test file not found, assuming services are already running"
        fi
    else
        print_warning "Docker Compose not found, assuming services are already running"
    fi
}

# Function to stop test services
stop_test_services() {
    if command_exists docker-compose && [ -f "$DOCKER_COMPOSE_FILE" ]; then
        print_status "Stopping test services..."
        docker-compose -f "$DOCKER_COMPOSE_FILE" down
    fi
}

# Function to install dependencies
install_dependencies() {
    print_status "Installing dependencies..."
    
    # Install root dependencies
    npm install
    
    # Install service dependencies
    for service_dir in services/*/; do
        if [ -f "${service_dir}package.json" ]; then
            print_status "Installing dependencies for $(basename "$service_dir")"
            (cd "$service_dir" && npm install)
        fi
    done
    
    # Install shared dependencies
    for shared_dir in shared/*/; do
        if [ -f "${shared_dir}package.json" ]; then
            print_status "Installing dependencies for $(basename "$shared_dir")"
            (cd "$shared_dir" && npm install)
        fi
    done
    
    print_success "Dependencies installed"
}

# Function to run functional tests for a specific service
run_service_functional_tests() {
    local service_name=$1
    local service_dir="services/$service_name"
    
    if [ ! -d "$service_dir" ]; then
        print_error "Service directory $service_dir not found"
        return 1
    fi
    
    if [ ! -f "$service_dir/jest.functional.config.js" ]; then
        print_warning "No functional test configuration found for $service_name"
        return 0
    fi
    
    print_status "Running functional tests for $service_name..."
    
    (cd "$service_dir" && npm run test:functional) || {
        print_error "Functional tests failed for $service_name"
        return 1
    }
    
    print_success "Functional tests passed for $service_name"
}

# Function to run all functional tests
run_all_functional_tests() {
    print_status "Running all functional tests..."
    
    local services=("user-service" "api-gateway" "market-data-service" "strategy-service" "portfolio-service")
    local failed_services=()
    
    for service in "${services[@]}"; do
        if ! run_service_functional_tests "$service"; then
            failed_services+=("$service")
        fi
    done
    
    if [ ${#failed_services[@]} -eq 0 ]; then
        print_success "All functional tests passed!"
        return 0
    else
        print_error "Functional tests failed for: ${failed_services[*]}"
        return 1
    fi
}

# Function to generate test reports
generate_test_reports() {
    print_status "Generating test reports..."
    
    # Create reports directory
    mkdir -p reports/functional
    
    # Combine coverage reports
    if command_exists nyc; then
        print_status "Combining coverage reports..."
        nyc merge services/*/coverage/functional/coverage-final.json reports/functional/coverage-merged.json
        nyc report --reporter=html --reporter=text --temp-dir=reports/functional --report-dir=reports/functional/html
    fi
    
    print_success "Test reports generated in reports/functional/"
}

# Function to cleanup test environment
cleanup_test_environment() {
    print_status "Cleaning up test environment..."
    
    # Clear test database
    if command_exists psql; then
        psql -d "$TEST_DB_NAME" -c "TRUNCATE TABLE users, strategies, portfolios, positions, trades CASCADE;" 2>/dev/null || true
    fi
    
    # Clear test Redis
    if command_exists redis-cli; then
        redis-cli -n "$TEST_REDIS_DB" FLUSHDB 2>/dev/null || true
    fi
    
    print_success "Test environment cleaned up"
}

# Function to show usage
show_usage() {
    echo "Usage: $0 [OPTIONS] [SERVICE]"
    echo ""
    echo "Options:"
    echo "  --setup-only     Only setup test environment, don't run tests"
    echo "  --no-setup       Skip test environment setup"
    echo "  --no-cleanup     Skip cleanup after tests"
    echo "  --coverage       Generate coverage reports"
    echo "  --help           Show this help message"
    echo ""
    echo "Services:"
    echo "  user-service     Run tests for user service only"
    echo "  api-gateway      Run tests for API gateway only"
    echo "  market-data      Run tests for market data service only"
    echo "  strategy         Run tests for strategy service only"
    echo "  portfolio        Run tests for portfolio service only"
    echo ""
    echo "Examples:"
    echo "  $0                           # Run all functional tests"
    echo "  $0 user-service             # Run user service tests only"
    echo "  $0 --coverage               # Run all tests with coverage"
    echo "  $0 --setup-only             # Setup test environment only"
}

# Main execution
main() {
    local setup_only=false
    local no_setup=false
    local no_cleanup=false
    local generate_coverage=false
    local specific_service=""
    
    # Parse command line arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --setup-only)
                setup_only=true
                shift
                ;;
            --no-setup)
                no_setup=true
                shift
                ;;
            --no-cleanup)
                no_cleanup=true
                shift
                ;;
            --coverage)
                generate_coverage=true
                shift
                ;;
            --help)
                show_usage
                exit 0
                ;;
            user-service|api-gateway|market-data|strategy|portfolio)
                specific_service=$1
                shift
                ;;
            *)
                print_error "Unknown option: $1"
                show_usage
                exit 1
                ;;
        esac
    done
    
    # Change to backend directory
    cd "$(dirname "$0")/.."
    
    print_status "Starting TradeFlow functional tests..."
    
    # Setup test environment
    if [ "$no_setup" = false ]; then
        start_test_services
        setup_test_database
        setup_test_redis
        install_dependencies
    fi
    
    # Exit if setup-only
    if [ "$setup_only" = true ]; then
        print_success "Test environment setup complete"
        exit 0
    fi
    
    # Run tests
    local test_result=0
    
    if [ -n "$specific_service" ]; then
        run_service_functional_tests "$specific_service" || test_result=1
    else
        run_all_functional_tests || test_result=1
    fi
    
    # Generate reports if requested
    if [ "$generate_coverage" = true ]; then
        generate_test_reports
    fi
    
    # Cleanup
    if [ "$no_cleanup" = false ]; then
        cleanup_test_environment
        stop_test_services
    fi
    
    # Exit with test result
    if [ $test_result -eq 0 ]; then
        print_success "All functional tests completed successfully!"
    else
        print_error "Some functional tests failed!"
    fi
    
    exit $test_result
}

# Trap to ensure cleanup on script exit
trap 'cleanup_test_environment; stop_test_services' EXIT

# Run main function
main "$@"