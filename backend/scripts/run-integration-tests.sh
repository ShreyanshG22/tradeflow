#!/bin/bash

# Zerodha Integration Test Runner
# This script runs comprehensive integration tests for the Zerodha integration

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
TEST_ENV_FILE=".env.test"
TEST_PORT=3001
COVERAGE_THRESHOLD=70

echo -e "${BLUE}🚀 Zerodha Integration Test Suite${NC}"
echo "=================================="

# Function to print colored output
print_status() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️ $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ️ $1${NC}"
}

# Function to check if a service is running
check_service() {
    local service_name=$1
    local port=$2
    local max_attempts=30
    local attempt=1

    print_info "Checking $service_name on port $port..."
    
    while [ $attempt -le $max_attempts ]; do
        if nc -z localhost $port 2>/dev/null; then
            print_status "$service_name is running on port $port"
            return 0
        fi
        
        if [ $attempt -eq 1 ]; then
            print_info "Waiting for $service_name to start..."
        fi
        
        sleep 2
        attempt=$((attempt + 1))
    done
    
    print_error "$service_name is not running on port $port after $((max_attempts * 2)) seconds"
    return 1
}

# Function to setup test environment
setup_test_environment() {
    print_info "Setting up test environment..."
    
    # Check if test environment file exists
    if [ ! -f "$TEST_ENV_FILE" ]; then
        print_warning "Test environment file not found, creating from example..."
        if [ -f ".env.example" ]; then
            cp .env.example $TEST_ENV_FILE
            print_info "Created $TEST_ENV_FILE from .env.example"
            print_warning "Please update $TEST_ENV_FILE with test-specific values"
        else
            print_error "No .env.example file found"
            exit 1
        fi
    fi
    
    # Load test environment
    export $(grep -v '^#' $TEST_ENV_FILE | xargs)
    export NODE_ENV=test
    export TEST_PORT=$TEST_PORT
    
    print_status "Test environment loaded"
}

# Function to check prerequisites
check_prerequisites() {
    print_info "Checking prerequisites..."
    
    # Check Node.js
    if ! command -v node &> /dev/null; then
        print_error "Node.js is not installed"
        exit 1
    fi
    
    # Check npm
    if ! command -v npm &> /dev/null; then
        print_error "npm is not installed"
        exit 1
    fi
    
    # Check Docker (optional)
    if command -v docker &> /dev/null; then
        print_status "Docker is available"
    else
        print_warning "Docker is not available (some tests may be skipped)"
    fi
    
    # Check PostgreSQL
    if command -v psql &> /dev/null; then
        print_status "PostgreSQL client is available"
    else
        print_warning "PostgreSQL client not found"
    fi
    
    # Check Redis CLI (optional)
    if command -v redis-cli &> /dev/null; then
        print_status "Redis CLI is available"
    else
        print_warning "Redis CLI not found"
    fi
    
    print_status "Prerequisites check completed"
}

# Function to start required services
start_services() {
    print_info "Starting required services..."
    
    # Start PostgreSQL if not running
    if ! check_service "PostgreSQL" 5432; then
        print_info "Starting PostgreSQL with Docker..."
        docker run -d --name test-postgres \
            -e POSTGRES_DB=tradeflow_test \
            -e POSTGRES_USER=test \
            -e POSTGRES_PASSWORD=test \
            -p 5432:5432 \
            postgres:13 || print_warning "Failed to start PostgreSQL container"
    fi
    
    # Start Redis if not running
    if ! check_service "Redis" 6379; then
        print_info "Starting Redis with Docker..."
        docker run -d --name test-redis \
            -p 6379:6379 \
            redis:6-alpine || print_warning "Failed to start Redis container"
    fi
    
    # Wait for services to be ready
    sleep 5
    
    print_status "Services startup completed"
}

# Function to run database migrations
run_migrations() {
    print_info "Running database migrations..."
    
    if npm run migrate 2>/dev/null; then
        print_status "Database migrations completed"
    else
        print_warning "Migration script not available or failed"
        print_info "Tests will attempt to create tables automatically"
    fi
}

# Function to install dependencies
install_dependencies() {
    print_info "Installing dependencies..."
    
    if [ ! -d "node_modules" ]; then
        npm install
    else
        print_info "Dependencies already installed"
    fi
    
    print_status "Dependencies ready"
}

# Function to run specific test suite
run_test_suite() {
    local suite_name=$1
    local test_pattern=$2
    local description=$3
    
    echo ""
    echo -e "${BLUE}📋 Running $description${NC}"
    echo "----------------------------------------"
    
    if npm test -- --testPathPattern="$test_pattern" --verbose; then
        print_status "$description completed successfully"
        return 0
    else
        print_error "$description failed"
        return 1
    fi
}

# Function to run all integration tests
run_integration_tests() {
    local failed_suites=()
    
    print_info "Starting integration test execution..."
    
    # Test suites in order
    declare -A test_suites=(
        ["setup"]="setup.*test\.ts|test-.*\.ts"
        ["e2e"]="e2e/.*\.test\.ts"
        ["performance"]="performance/.*\.test\.ts"
        ["security"]="security/.*\.test\.ts"
        ["system"]="system/.*\.test\.ts"
    )
    
    declare -A suite_descriptions=(
        ["setup"]="Setup and Configuration Tests"
        ["e2e"]="End-to-End Integration Tests"
        ["performance"]="Performance and Load Tests"
        ["security"]="Security and Compliance Tests"
        ["system"]="Full System Integration Tests"
    )
    
    # Run each test suite
    for suite in setup e2e performance security system; do
        if ! run_test_suite "$suite" "${test_suites[$suite]}" "${suite_descriptions[$suite]}"; then
            failed_suites+=("$suite")
        fi
    done
    
    # Report results
    echo ""
    echo -e "${BLUE}📊 Test Results Summary${NC}"
    echo "========================"
    
    if [ ${#failed_suites[@]} -eq 0 ]; then
        print_status "All test suites passed! 🎉"
        return 0
    else
        print_error "Failed test suites: ${failed_suites[*]}"
        return 1
    fi
}

# Function to generate coverage report
generate_coverage_report() {
    print_info "Generating coverage report..."
    
    if npm run test:coverage 2>/dev/null; then
        print_status "Coverage report generated"
        
        # Check coverage threshold
        if [ -f "coverage/coverage-summary.json" ]; then
            local coverage=$(node -e "
                const fs = require('fs');
                const coverage = JSON.parse(fs.readFileSync('coverage/coverage-summary.json'));
                console.log(Math.round(coverage.total.lines.pct));
            ")
            
            if [ "$coverage" -ge "$COVERAGE_THRESHOLD" ]; then
                print_status "Coverage threshold met: $coverage% (required: $COVERAGE_THRESHOLD%)"
            else
                print_warning "Coverage below threshold: $coverage% (required: $COVERAGE_THRESHOLD%)"
            fi
        fi
    else
        print_warning "Coverage report generation failed or not available"
    fi
}

# Function to cleanup test environment
cleanup_test_environment() {
    print_info "Cleaning up test environment..."
    
    # Stop test containers
    docker stop test-postgres test-redis 2>/dev/null || true
    docker rm test-postgres test-redis 2>/dev/null || true
    
    # Clean up test files
    rm -rf temp/test-* 2>/dev/null || true
    
    print_status "Cleanup completed"
}

# Function to display help
show_help() {
    echo "Zerodha Integration Test Runner"
    echo ""
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  -h, --help              Show this help message"
    echo "  -s, --suite SUITE       Run specific test suite (setup|e2e|performance|security|system)"
    echo "  -c, --coverage          Generate coverage report"
    echo "  -v, --verbose           Enable verbose output"
    echo "  --no-setup             Skip environment setup"
    echo "  --no-cleanup           Skip cleanup after tests"
    echo "  --ci                   Run in CI mode (no interactive prompts)"
    echo ""
    echo "Examples:"
    echo "  $0                     Run all test suites"
    echo "  $0 -s e2e             Run only end-to-end tests"
    echo "  $0 -c                 Run tests with coverage report"
    echo "  $0 --ci               Run in CI mode"
}

# Parse command line arguments
SUITE=""
COVERAGE=false
VERBOSE=false
NO_SETUP=false
NO_CLEANUP=false
CI_MODE=false

while [[ $# -gt 0 ]]; do
    case $1 in
        -h|--help)
            show_help
            exit 0
            ;;
        -s|--suite)
            SUITE="$2"
            shift 2
            ;;
        -c|--coverage)
            COVERAGE=true
            shift
            ;;
        -v|--verbose)
            VERBOSE=true
            export VERBOSE_TESTS=true
            shift
            ;;
        --no-setup)
            NO_SETUP=true
            shift
            ;;
        --no-cleanup)
            NO_CLEANUP=true
            shift
            ;;
        --ci)
            CI_MODE=true
            shift
            ;;
        *)
            print_error "Unknown option: $1"
            show_help
            exit 1
            ;;
    esac
done

# Main execution
main() {
    local start_time=$(date +%s)
    local exit_code=0
    
    # Trap to ensure cleanup on exit
    if [ "$NO_CLEANUP" != true ]; then
        trap cleanup_test_environment EXIT
    fi
    
    # Setup phase
    if [ "$NO_SETUP" != true ]; then
        setup_test_environment
        check_prerequisites
        install_dependencies
        start_services
        run_migrations
    fi
    
    # Test execution phase
    if [ -n "$SUITE" ]; then
        # Run specific test suite
        case $SUITE in
            setup|e2e|performance|security|system)
                if ! run_test_suite "$SUITE" "${SUITE}/.*\.test\.ts" "${SUITE} Tests"; then
                    exit_code=1
                fi
                ;;
            *)
                print_error "Invalid test suite: $SUITE"
                print_info "Valid suites: setup, e2e, performance, security, system"
                exit 1
                ;;
        esac
    else
        # Run all test suites
        if ! run_integration_tests; then
            exit_code=1
        fi
    fi
    
    # Coverage report
    if [ "$COVERAGE" = true ]; then
        generate_coverage_report
    fi
    
    # Final summary
    local end_time=$(date +%s)
    local duration=$((end_time - start_time))
    
    echo ""
    echo -e "${BLUE}⏱️ Test Execution Summary${NC}"
    echo "=========================="
    echo "Duration: ${duration}s"
    echo "Exit Code: $exit_code"
    
    if [ $exit_code -eq 0 ]; then
        print_status "All tests completed successfully! 🎉"
        print_info "Zerodha integration is ready for deployment"
    else
        print_error "Some tests failed. Please review the output above."
        print_info "Check the test logs for detailed error information"
    fi
    
    exit $exit_code
}

# Run main function
main "$@"