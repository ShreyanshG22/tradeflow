#!/bin/bash

# =============================================================================
# TradeFlow Zerodha Services Deployment Tests Runner
# =============================================================================

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
TEST_TYPE="${TEST_TYPE:-all}"
ENVIRONMENT="${ENVIRONMENT:-staging}"
VERBOSE="${VERBOSE:-false}"
PARALLEL="${PARALLEL:-true}"

# Default values
TIMEOUT="${TIMEOUT:-300}"
RETRY_COUNT="${RETRY_COUNT:-3}"
REPORT_FORMAT="${REPORT_FORMAT:-json}"

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

# Function to show usage
show_usage() {
    cat << EOF
Usage: $0 [OPTIONS]

Run deployment tests for TradeFlow Zerodha integration services

OPTIONS:
    -t, --type TYPE          Test type (all|config|docker|connectivity|k8s)
    -e, --environment ENV    Target environment (staging|production)
    -v, --verbose           Enable verbose output
    -s, --sequential        Run tests sequentially instead of parallel
    -r, --retry COUNT       Number of retries for failed tests
    -f, --format FORMAT     Report format (json|junit|html)
    -o, --timeout SECONDS   Test timeout in seconds
    -h, --help              Show this help message

TEST TYPES:
    all                     Run all deployment tests
    config                  Configuration validation tests
    docker                  Docker container health tests
    connectivity            Service connectivity tests
    k8s                     Kubernetes deployment tests

EXAMPLES:
    $0                                    # Run all tests
    $0 -t config -v                      # Run config tests with verbose output
    $0 -t docker -e production           # Run Docker tests for production
    $0 -t k8s --sequential               # Run K8s tests sequentially
    $0 --retry 5 --timeout 600          # Run with 5 retries and 10min timeout

ENVIRONMENT VARIABLES:
    TEST_TYPE               Type of tests to run
    ENVIRONMENT             Target environment
    VERBOSE                 Enable verbose output (true/false)
    PARALLEL                Run tests in parallel (true/false)
    TIMEOUT                 Test timeout in seconds
    RETRY_COUNT             Number of retries for failed tests
    REPORT_FORMAT           Report format (json|junit|html)

EOF
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -t|--type)
            TEST_TYPE="$2"
            shift 2
            ;;
        -e|--environment)
            ENVIRONMENT="$2"
            shift 2
            ;;
        -v|--verbose)
            VERBOSE="true"
            shift
            ;;
        -s|--sequential)
            PARALLEL="false"
            shift
            ;;
        -r|--retry)
            RETRY_COUNT="$2"
            shift 2
            ;;
        -f|--format)
            REPORT_FORMAT="$2"
            shift 2
            ;;
        -o|--timeout)
            TIMEOUT="$2"
            shift 2
            ;;
        -h|--help)
            show_usage
            exit 0
            ;;
        *)
            print_error "Unknown option: $1"
            show_usage
            exit 1
            ;;
    esac
done

# Validate test type
if [[ ! "$TEST_TYPE" =~ ^(all|config|docker|connectivity|k8s)$ ]]; then
    print_error "Invalid test type: $TEST_TYPE"
    print_error "Must be one of: all, config, docker, connectivity, k8s"
    exit 1
fi

# Validate environment
if [[ ! "$ENVIRONMENT" =~ ^(staging|production|development)$ ]]; then
    print_error "Invalid environment: $ENVIRONMENT"
    print_error "Must be one of: staging, production, development"
    exit 1
fi

print_status "Running deployment tests"
print_status "Test type: $TEST_TYPE"
print_status "Environment: $ENVIRONMENT"
print_status "Parallel execution: $PARALLEL"
print_status "Timeout: ${TIMEOUT}s"
print_status "Retry count: $RETRY_COUNT"

# Change to project root
cd "$PROJECT_ROOT"

# Function to check prerequisites
check_prerequisites() {
    print_status "Checking test prerequisites..."
    
    # Check if Node.js and npm are available
    if ! command -v node &> /dev/null; then
        print_error "Node.js is not installed"
        exit 1
    fi
    
    if ! command -v npm &> /dev/null; then
        print_error "npm is not installed"
        exit 1
    fi
    
    # Check if Jest is available
    if ! npm list jest &> /dev/null; then
        print_warning "Jest not found in dependencies, installing..."
        npm install --save-dev jest @types/jest ts-jest
    fi
    
    # Check Docker availability for Docker tests
    if [[ "$TEST_TYPE" == "all" || "$TEST_TYPE" == "docker" ]]; then
        if ! command -v docker &> /dev/null; then
            print_warning "Docker not available, Docker tests will be skipped"
        fi
    fi
    
    # Check kubectl availability for K8s tests
    if [[ "$TEST_TYPE" == "all" || "$TEST_TYPE" == "k8s" ]]; then
        if ! command -v kubectl &> /dev/null; then
            print_warning "kubectl not available, Kubernetes tests will be skipped"
        fi
    fi
    
    print_success "Prerequisites check completed"
}

# Function to setup test environment
setup_test_environment() {
    print_status "Setting up test environment..."
    
    # Create test reports directory
    mkdir -p test-reports/deployment
    
    # Set environment variables for tests
    export NODE_ENV=test
    export TEST_ENVIRONMENT="$ENVIRONMENT"
    export TEST_TIMEOUT="$TIMEOUT"
    export JEST_TIMEOUT="$((TIMEOUT * 1000))" # Jest expects milliseconds
    
    # Set service URLs based on environment
    case "$ENVIRONMENT" in
        staging)
            export TEST_BASE_URL="https://staging-api.tradeflow.com"
            export K8S_NAMESPACE="zerodha-staging"
            ;;
        production)
            export TEST_BASE_URL="https://api.tradeflow.com"
            export K8S_NAMESPACE="zerodha-production"
            ;;
        development|*)
            export TEST_BASE_URL="http://localhost"
            export K8S_NAMESPACE="zerodha-staging"
            ;;
    esac
    
    print_success "Test environment setup completed"
}

# Function to run configuration tests
run_config_tests() {
    print_status "Running configuration validation tests..."
    
    local test_command="npx jest tests/deployment/config-validation.test.ts"
    
    if [[ "$VERBOSE" == "true" ]]; then
        test_command="$test_command --verbose"
    fi
    
    if [[ "$REPORT_FORMAT" == "junit" ]]; then
        test_command="$test_command --reporters=default --reporters=jest-junit"
        export JEST_JUNIT_OUTPUT_DIR="test-reports/deployment"
        export JEST_JUNIT_OUTPUT_NAME="config-tests.xml"
    fi
    
    local attempt=1
    while [[ $attempt -le $RETRY_COUNT ]]; do
        print_status "Configuration tests attempt $attempt/$RETRY_COUNT"
        
        if timeout "$TIMEOUT" $test_command; then
            print_success "Configuration tests passed"
            return 0
        else
            print_warning "Configuration tests failed on attempt $attempt"
            if [[ $attempt -eq $RETRY_COUNT ]]; then
                print_error "Configuration tests failed after $RETRY_COUNT attempts"
                return 1
            fi
            ((attempt++))
            sleep 5
        fi
    done
}

# Function to run Docker health tests
run_docker_tests() {
    print_status "Running Docker health tests..."
    
    # Check if Docker is available
    if ! command -v docker &> /dev/null; then
        print_warning "Docker not available, skipping Docker tests"
        return 0
    fi
    
    local test_command="npx jest tests/deployment/docker-health-check.test.ts"
    
    if [[ "$VERBOSE" == "true" ]]; then
        test_command="$test_command --verbose"
    fi
    
    if [[ "$REPORT_FORMAT" == "junit" ]]; then
        test_command="$test_command --reporters=default --reporters=jest-junit"
        export JEST_JUNIT_OUTPUT_DIR="test-reports/deployment"
        export JEST_JUNIT_OUTPUT_NAME="docker-tests.xml"
    fi
    
    local attempt=1
    while [[ $attempt -le $RETRY_COUNT ]]; do
        print_status "Docker tests attempt $attempt/$RETRY_COUNT"
        
        if timeout "$TIMEOUT" $test_command; then
            print_success "Docker tests passed"
            return 0
        else
            print_warning "Docker tests failed on attempt $attempt"
            if [[ $attempt -eq $RETRY_COUNT ]]; then
                print_error "Docker tests failed after $RETRY_COUNT attempts"
                return 1
            fi
            ((attempt++))
            sleep 10
        fi
    done
}

# Function to run connectivity tests
run_connectivity_tests() {
    print_status "Running service connectivity tests..."
    
    local test_command="npx jest tests/deployment/service-connectivity.test.ts"
    
    if [[ "$VERBOSE" == "true" ]]; then
        test_command="$test_command --verbose"
    fi
    
    if [[ "$REPORT_FORMAT" == "junit" ]]; then
        test_command="$test_command --reporters=default --reporters=jest-junit"
        export JEST_JUNIT_OUTPUT_DIR="test-reports/deployment"
        export JEST_JUNIT_OUTPUT_NAME="connectivity-tests.xml"
    fi
    
    local attempt=1
    while [[ $attempt -le $RETRY_COUNT ]]; do
        print_status "Connectivity tests attempt $attempt/$RETRY_COUNT"
        
        if timeout "$TIMEOUT" $test_command; then
            print_success "Connectivity tests passed"
            return 0
        else
            print_warning "Connectivity tests failed on attempt $attempt"
            if [[ $attempt -eq $RETRY_COUNT ]]; then
                print_error "Connectivity tests failed after $RETRY_COUNT attempts"
                return 1
            fi
            ((attempt++))
            sleep 10
        fi
    done
}

# Function to run Kubernetes tests
run_k8s_tests() {
    print_status "Running Kubernetes deployment tests..."
    
    # Check if kubectl is available
    if ! command -v kubectl &> /dev/null; then
        print_warning "kubectl not available, skipping Kubernetes tests"
        return 0
    fi
    
    local test_command="npx jest tests/deployment/kubernetes-deployment.test.ts"
    
    if [[ "$VERBOSE" == "true" ]]; then
        test_command="$test_command --verbose"
    fi
    
    if [[ "$REPORT_FORMAT" == "junit" ]]; then
        test_command="$test_command --reporters=default --reporters=jest-junit"
        export JEST_JUNIT_OUTPUT_DIR="test-reports/deployment"
        export JEST_JUNIT_OUTPUT_NAME="k8s-tests.xml"
    fi
    
    local attempt=1
    while [[ $attempt -le $RETRY_COUNT ]]; do
        print_status "Kubernetes tests attempt $attempt/$RETRY_COUNT"
        
        if timeout "$TIMEOUT" $test_command; then
            print_success "Kubernetes tests passed"
            return 0
        else
            print_warning "Kubernetes tests failed on attempt $attempt"
            if [[ $attempt -eq $RETRY_COUNT ]]; then
                print_error "Kubernetes tests failed after $RETRY_COUNT attempts"
                return 1
            fi
            ((attempt++))
            sleep 15
        fi
    done
}

# Function to run all tests
run_all_tests() {
    print_status "Running all deployment tests..."
    
    local failed_tests=()
    
    if [[ "$PARALLEL" == "true" ]]; then
        print_status "Running tests in parallel..."
        
        # Run tests in background
        run_config_tests &
        local config_pid=$!
        
        run_docker_tests &
        local docker_pid=$!
        
        run_connectivity_tests &
        local connectivity_pid=$!
        
        run_k8s_tests &
        local k8s_pid=$!
        
        # Wait for all tests to complete
        wait $config_pid || failed_tests+=("config")
        wait $docker_pid || failed_tests+=("docker")
        wait $connectivity_pid || failed_tests+=("connectivity")
        wait $k8s_pid || failed_tests+=("k8s")
        
    else
        print_status "Running tests sequentially..."
        
        run_config_tests || failed_tests+=("config")
        run_docker_tests || failed_tests+=("docker")
        run_connectivity_tests || failed_tests+=("connectivity")
        run_k8s_tests || failed_tests+=("k8s")
    fi
    
    if [[ ${#failed_tests[@]} -eq 0 ]]; then
        print_success "All deployment tests passed"
        return 0
    else
        print_error "Some tests failed: ${failed_tests[*]}"
        return 1
    fi
}

# Function to generate test report
generate_test_report() {
    print_status "Generating test report..."
    
    local report_file="test-reports/deployment/deployment-test-report.json"
    
    cat > "$report_file" << EOF
{
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "environment": "$ENVIRONMENT",
  "test_type": "$TEST_TYPE",
  "parallel": $PARALLEL,
  "timeout": $TIMEOUT,
  "retry_count": $RETRY_COUNT,
  "status": "$1",
  "duration_seconds": $2,
  "test_files": [
    "tests/deployment/config-validation.test.ts",
    "tests/deployment/docker-health-check.test.ts",
    "tests/deployment/service-connectivity.test.ts",
    "tests/deployment/kubernetes-deployment.test.ts"
  ],
  "reports_generated": [
    "test-reports/deployment/config-tests.xml",
    "test-reports/deployment/docker-tests.xml",
    "test-reports/deployment/connectivity-tests.xml",
    "test-reports/deployment/k8s-tests.xml"
  ]
}
EOF
    
    print_success "Test report generated: $report_file"
}

# Function to cleanup
cleanup() {
    print_status "Cleaning up test environment..."
    
    # Kill any background processes
    jobs -p | xargs -r kill 2>/dev/null || true
    
    # Clean up temporary files
    rm -f /tmp/deployment-test-* 2>/dev/null || true
}

# Set up cleanup trap
trap cleanup EXIT INT TERM

# Main execution
main() {
    local start_time=$(date +%s)
    local exit_code=0
    
    check_prerequisites
    setup_test_environment
    
    case "$TEST_TYPE" in
        config)
            run_config_tests || exit_code=1
            ;;
        docker)
            run_docker_tests || exit_code=1
            ;;
        connectivity)
            run_connectivity_tests || exit_code=1
            ;;
        k8s)
            run_k8s_tests || exit_code=1
            ;;
        all)
            run_all_tests || exit_code=1
            ;;
        *)
            print_error "Unknown test type: $TEST_TYPE"
            exit 1
            ;;
    esac
    
    local end_time=$(date +%s)
    local duration=$((end_time - start_time))
    
    if [[ $exit_code -eq 0 ]]; then
        generate_test_report "passed" "$duration"
        print_success "Deployment tests completed successfully in ${duration}s"
    else
        generate_test_report "failed" "$duration"
        print_error "Deployment tests failed after ${duration}s"
    fi
    
    exit $exit_code
}

# Run main function
main "$@"