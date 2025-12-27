#!/bin/bash

# =============================================================================
# TradeFlow Zerodha Services Startup Script
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
ENVIRONMENT="${NODE_ENV:-development}"
COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-tradeflow}"

# Default values
SERVICES_TO_START="${SERVICES:-all}"
BUILD_IMAGES="${BUILD:-false}"
DETACHED="${DETACHED:-true}"
VALIDATE_CONFIG="${VALIDATE_CONFIG:-true}"
WAIT_FOR_HEALTH="${WAIT_FOR_HEALTH:-true}"

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

Start TradeFlow Zerodha integration services

OPTIONS:
    -e, --environment ENV     Environment to use (development|staging|production)
    -s, --services SERVICES   Services to start (all|auth|market|order|portfolio|risk)
    -b, --build              Build images before starting
    -f, --foreground         Run in foreground (don't detach)
    -n, --no-validate        Skip configuration validation
    -w, --no-wait           Don't wait for health checks
    -h, --help              Show this help message

EXAMPLES:
    $0                                    # Start all services in development
    $0 -e production -b                   # Build and start all services in production
    $0 -s auth,market -f                  # Start only auth and market services in foreground
    $0 --environment staging --build      # Build and start all services in staging

ENVIRONMENT VARIABLES:
    NODE_ENV                 Environment (development|staging|production)
    COMPOSE_PROJECT_NAME     Docker Compose project name
    SERVICES                 Comma-separated list of services to start
    BUILD                    Set to 'true' to build images
    DETACHED                 Set to 'false' to run in foreground
    VALIDATE_CONFIG          Set to 'false' to skip validation
    WAIT_FOR_HEALTH          Set to 'false' to skip health checks

EOF
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -e|--environment)
            ENVIRONMENT="$2"
            shift 2
            ;;
        -s|--services)
            SERVICES_TO_START="$2"
            shift 2
            ;;
        -b|--build)
            BUILD_IMAGES="true"
            shift
            ;;
        -f|--foreground)
            DETACHED="false"
            shift
            ;;
        -n|--no-validate)
            VALIDATE_CONFIG="false"
            shift
            ;;
        -w|--no-wait)
            WAIT_FOR_HEALTH="false"
            shift
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

# Validate environment
if [[ ! "$ENVIRONMENT" =~ ^(development|staging|production)$ ]]; then
    print_error "Invalid environment: $ENVIRONMENT"
    print_error "Must be one of: development, staging, production"
    exit 1
fi

print_status "Starting TradeFlow Zerodha services in $ENVIRONMENT environment"

# Change to project root
cd "$PROJECT_ROOT"

# Function to validate configuration
validate_configuration() {
    if [[ "$VALIDATE_CONFIG" != "true" ]]; then
        print_warning "Skipping configuration validation"
        return 0
    fi

    print_status "Validating configuration for $ENVIRONMENT environment"

    # Check if environment file exists
    ENV_FILE=".env.zerodha.$ENVIRONMENT"
    if [[ "$ENVIRONMENT" == "development" ]]; then
        ENV_FILE=".env.zerodha.example"
    fi

    if [[ ! -f "$ENV_FILE" ]]; then
        print_error "Environment file not found: $ENV_FILE"
        print_error "Please create the environment file with required configuration"
        exit 1
    fi

    # Load environment file
    set -a  # Automatically export all variables
    source "$ENV_FILE"
    set +a

    # Check required variables
    REQUIRED_VARS=(
        "ZERODHA_API_KEY"
        "ZERODHA_API_SECRET"
        "JWT_SECRET"
        "ENCRYPTION_KEY"
        "POSTGRES_URL"
        "REDIS_URL"
    )

    MISSING_VARS=()
    for var in "${REQUIRED_VARS[@]}"; do
        if [[ -z "${!var}" ]]; then
            MISSING_VARS+=("$var")
        fi
    done

    if [[ ${#MISSING_VARS[@]} -gt 0 ]]; then
        print_error "Missing required environment variables:"
        for var in "${MISSING_VARS[@]}"; do
            print_error "  - $var"
        done
        exit 1
    fi

    # Validate secret lengths
    if [[ ${#JWT_SECRET} -lt 32 ]]; then
        print_error "JWT_SECRET must be at least 32 characters long"
        exit 1
    fi

    if [[ ${#ENCRYPTION_KEY} -ne 32 ]]; then
        print_error "ENCRYPTION_KEY must be exactly 32 characters long"
        exit 1
    fi

    print_success "Configuration validation passed"
}

# Function to determine Docker Compose files
get_compose_files() {
    local files=("-f" "docker-compose.yml")
    
    case "$ENVIRONMENT" in
        development)
            files+=("-f" "docker-compose.zerodha.override.yml")
            ;;
        staging)
            files+=("-f" "docker-compose.zerodha.staging.yml")
            ;;
        production)
            files+=("-f" "docker-compose.zerodha.prod.yml")
            ;;
    esac
    
    echo "${files[@]}"
}

# Function to determine services to start
get_services_list() {
    if [[ "$SERVICES_TO_START" == "all" ]]; then
        echo "zerodha-auth-service zerodha-market-service zerodha-order-service zerodha-portfolio-service zerodha-risk-service influxdb"
    else
        # Convert comma-separated list to space-separated
        echo "$SERVICES_TO_START" | tr ',' ' ' | sed 's/auth/zerodha-auth-service/g; s/market/zerodha-market-service/g; s/order/zerodha-order-service/g; s/portfolio/zerodha-portfolio-service/g; s/risk/zerodha-risk-service/g'
    fi
}

# Function to wait for service health
wait_for_health() {
    if [[ "$WAIT_FOR_HEALTH" != "true" ]]; then
        print_warning "Skipping health checks"
        return 0
    fi

    local services=($(get_services_list))
    local max_attempts=30
    local attempt=1

    print_status "Waiting for services to become healthy..."

    for service in "${services[@]}"; do
        if [[ "$service" == "influxdb" ]]; then
            continue  # InfluxDB health check is different
        fi

        print_status "Checking health of $service..."
        
        while [[ $attempt -le $max_attempts ]]; do
            if docker-compose $(get_compose_files) ps "$service" | grep -q "healthy\|Up"; then
                print_success "$service is healthy"
                break
            fi
            
            if [[ $attempt -eq $max_attempts ]]; then
                print_error "$service failed to become healthy after $max_attempts attempts"
                return 1
            fi
            
            print_status "Attempt $attempt/$max_attempts: $service not ready yet, waiting..."
            sleep 5
            ((attempt++))
        done
        
        attempt=1
    done

    print_success "All services are healthy"
}

# Function to show service status
show_service_status() {
    print_status "Service Status:"
    docker-compose $(get_compose_files) ps
    
    print_status "Service Logs (last 10 lines each):"
    local services=($(get_services_list))
    for service in "${services[@]}"; do
        echo -e "\n${BLUE}=== $service ===${NC}"
        docker-compose $(get_compose_files) logs --tail=10 "$service" 2>/dev/null || echo "No logs available"
    done
}

# Function to cleanup on exit
cleanup() {
    if [[ "$DETACHED" == "false" ]]; then
        print_status "Stopping services..."
        docker-compose $(get_compose_files) down
    fi
}

# Set up cleanup trap
trap cleanup EXIT INT TERM

# Main execution
main() {
    # Validate configuration
    validate_configuration

    # Get compose files and services
    local compose_files=($(get_compose_files))
    local services=($(get_services_list))

    print_status "Using Docker Compose files: ${compose_files[*]}"
    print_status "Starting services: ${services[*]}"

    # Build images if requested
    if [[ "$BUILD_IMAGES" == "true" ]]; then
        print_status "Building Docker images..."
        docker-compose "${compose_files[@]}" build "${services[@]}"
        print_success "Images built successfully"
    fi

    # Start services
    print_status "Starting services..."
    
    if [[ "$DETACHED" == "true" ]]; then
        docker-compose "${compose_files[@]}" up -d "${services[@]}"
    else
        docker-compose "${compose_files[@]}" up "${services[@]}"
        exit 0  # Exit here for foreground mode
    fi

    print_success "Services started successfully"

    # Wait for health checks
    wait_for_health

    # Show status
    show_service_status

    print_success "TradeFlow Zerodha services are running!"
    print_status "Use 'docker-compose logs -f <service-name>' to view logs"
    print_status "Use 'docker-compose down' to stop all services"
}

# Run main function
main "$@"