#!/bin/bash

# TradeFlow Backend Integration Test Runner
# This script runs comprehensive integration tests for the backend services

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

# Function to setup test environment
setup_test_environment() {
    print_status "Setting up integration test environment..."
    
    # Start test services if Docker Compose is available
    if command_exists docker-compose && [ -f "$DOCKER_COMPOSE_FILE" ]; then
        print_status "Starting test services with Docker Compose..."
        docker-compose -f "$DOCKER_COMPOSE_FILE" up -d
        
        # Wait for services to be ready
        wait_for_service "localhost" "5433" "PostgreSQL"
        wait_for_service "localhost" "6380" "Redis"
    else
        print_warning "Docker Compose not available, assuming services are already running"
    fi
    
    # Install dependencies
    print_status "Installing dependencies..."
    npm install
    
    # Install service dependencies
    for service_dir in services/*/; do
        if [ -f "${service_dir}package.json" ]; then
            print_status "Installing dependencies for $(basename "$service_dir")"
            (cd "$service_dir" && npm install)
        fi
    done
    
    # Run database migrations
    if [ -d "database" ]; then
        print_status "Running database migrations..."
        (cd database && npm install && npm run migrate)
    fi
    
    print_success "Test environment setup complete"
}

# Function to run integration tests
run_integration_tests() {
    local test_type=$1
    local coverage=$2
    
    print_status "Running integration tests..."
    
    local jest_command="npx jest --config jest.integration.config.js"
    
    if [ "$coverage" = true ]; then
        jest_command="$jest_command --coverage"
    fi
    
    case $test_type in
        "all")
            print_status "Running all integration tests..."
            $jest_command
            ;;
        "user-service")
            print_status "Running user service integration tests..."
            $jest_command --testPathPattern="user-service.*integration"
            ;;
        "strategy-service")
            print_status "Running strategy service integration tests..."
            $jest_command --testPathPattern="strategy-service.*integration"
            ;;
        "market-data-service")
            print_status "Running market data service integration tests..."
            $jest_command --testPathPattern="market-data-service.*integration"
            ;;
        "portfolio-service")
            print_status "Running portfolio service integration tests..."
            $jest_command --testPathPattern="portfolio-service.*integration"
            ;;
        "end-to-end")
            print_status "Running end-to-end integration tests..."
            $jest_command --testPathPattern="integration.test.ts"
            ;;
        *)
            print_error "Unknown test type: $test_type"
            return 1
            ;;
    esac
}

# Function to generate test reports
generate_test_reports() {
    print_status "Generating integration test reports..."
    
    # Create reports directory
    mkdir -p reports/integration
    
    # Copy coverage reports if they exist
    if [ -d "coverage/integration" ]; then
        cp -r coverage/integration/* reports/integration/
        print_success "Coverage reports copied to reports/integration/"
    fi
    
    # Generate summary report
    cat > reports/integration/summary.md << EOF
# Integration Test Summary

Generated: $(date)

## Test Environment
- Node.js: $(node --version)
- npm: $(npm --version)
- Database: PostgreSQL (Test)
- Cache: Redis (Test)

## Test Results
See detailed results in the coverage reports.

## Test Categories
- End-to-End Integration Tests
- Service-to-Service Communication Tests
- Database Transaction and Consistency Tests
- Market Data Pipeline Integration Tests
- Strategy Execution Integration Tests
- Error Handling and Recovery Tests

EOF
    
    print_success "Test reports generated in reports/integration/"
}

# Function to cleanup test environment
cleanup_test_environment() {
    print_status "Cleaning up integration test environment..."
    
    # Stop Docker services if they were started
    if command_exists docker-compose && [ -f "$DOCKER_COMPOSE_FILE" ]; then
        print_status "Stopping test services..."
        docker-compose -f "$DOCKER_COMPOSE_FILE" down
    fi
    
    print_success "Test environment cleanup complete"
}

# Function to show usage
show_usage() {
    echo "Usage: $0 [OPTIONS] [TEST_TYPE]"
    echo ""
    echo "Options:"
    echo "  --setup-only     Only setup test environment, don't run tests"
    echo "  --no-setup       Skip test environment setup"
    echo "  --no-cleanup     Skip cleanup after tests"
    echo "  --coverage       Generate coverage reports"
    echo "  --help           Show this help message"
    echo ""
    echo "Test Types:"
    echo "  all              Run all integration tests (default)"
    echo "  user-service     Run user service integration tests"
    echo "  strategy-service Run strategy service integration tests"
    echo "  market-data-service Run market data service integration tests"
    echo "  portfolio-service Run portfolio service integration tests"
    echo "  end-to-end       Run end-to-end integration tests"
    echo ""
    echo "Examples:"
    echo "  $0                           # Run all integration tests"
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
    local test_type="all"
    
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
            all|user-service|strategy-service|market-data-service|portfolio-service|end-to-end)
                test_type=$1
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
    
    print_status "Starting TradeFlow integration tests..."
    
    # Setup test environment
    if [ "$no_setup" = false ]; then
        setup_test_environment
    fi
    
    # Exit if setup-only
    if [ "$setup_only" = true ]; then
        print_success "Test environment setup complete"
        exit 0
    fi
    
    # Run tests
    local test_result=0
    
    if ! run_integration_tests "$test_type" "$generate_coverage"; then
        test_result=1
    fi
    
    # Generate reports if requested
    if [ "$generate_coverage" = true ]; then
        generate_test_reports
    fi
    
    # Cleanup
    if [ "$no_cleanup" = false ]; then
        cleanup_test_environment
    fi
    
    # Exit with test result
    if [ $test_result -eq 0 ]; then
        print_success "All integration tests completed successfully!"
    else
        print_error "Some integration tests failed!"
    fi
    
    exit $test_result
}

# Trap to ensure cleanup on script exit
trap 'cleanup_test_environment' EXIT

# Run main function
main "$@"