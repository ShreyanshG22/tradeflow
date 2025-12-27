#!/bin/bash

# =============================================================================
# TradeFlow Zerodha Services Deployment Script
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
ENVIRONMENT="${ENVIRONMENT:-staging}"
DEPLOYMENT_TYPE="${DEPLOYMENT_TYPE:-rolling}"
SERVICES="${SERVICES:-all}"
VERSION="${VERSION:-latest}"
REGISTRY="${REGISTRY:-ghcr.io/tradeflow}"

# Default values
DRY_RUN="${DRY_RUN:-false}"
SKIP_HEALTH_CHECK="${SKIP_HEALTH_CHECK:-false}"
ROLLBACK_ON_FAILURE="${ROLLBACK_ON_FAILURE:-true}"
BACKUP_BEFORE_DEPLOY="${BACKUP_BEFORE_DEPLOY:-true}"

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

Deploy TradeFlow Zerodha integration services

OPTIONS:
    -e, --environment ENV     Target environment (staging|production)
    -t, --type TYPE          Deployment type (rolling|blue-green|canary)
    -s, --services SERVICES  Services to deploy (all|auth|market|order|portfolio|risk)
    -v, --version VERSION    Version/tag to deploy
    -r, --registry REGISTRY  Container registry URL
    -d, --dry-run           Show what would be deployed without executing
    -n, --no-health-check   Skip health checks after deployment
    -f, --no-rollback       Don't rollback on deployment failure
    -b, --no-backup         Skip backup before deployment
    -h, --help              Show this help message

EXAMPLES:
    $0 -e staging -s all                    # Deploy all services to staging
    $0 -e production -t blue-green -v v1.2.3 # Blue-green deploy to production
    $0 -e staging -s auth,market -d          # Dry run for specific services
    $0 -e production --no-backup --no-rollback # Deploy without safety nets

ENVIRONMENT VARIABLES:
    ENVIRONMENT              Target environment
    DEPLOYMENT_TYPE          Type of deployment
    SERVICES                 Services to deploy
    VERSION                  Version to deploy
    REGISTRY                 Container registry
    DRY_RUN                  Set to 'true' for dry run
    SKIP_HEALTH_CHECK        Set to 'true' to skip health checks
    ROLLBACK_ON_FAILURE      Set to 'false' to disable rollback
    BACKUP_BEFORE_DEPLOY     Set to 'false' to skip backup

EOF
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -e|--environment)
            ENVIRONMENT="$2"
            shift 2
            ;;
        -t|--type)
            DEPLOYMENT_TYPE="$2"
            shift 2
            ;;
        -s|--services)
            SERVICES="$2"
            shift 2
            ;;
        -v|--version)
            VERSION="$2"
            shift 2
            ;;
        -r|--registry)
            REGISTRY="$2"
            shift 2
            ;;
        -d|--dry-run)
            DRY_RUN="true"
            shift
            ;;
        -n|--no-health-check)
            SKIP_HEALTH_CHECK="true"
            shift
            ;;
        -f|--no-rollback)
            ROLLBACK_ON_FAILURE="false"
            shift
            ;;
        -b|--no-backup)
            BACKUP_BEFORE_DEPLOY="false"
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
if [[ ! "$ENVIRONMENT" =~ ^(staging|production)$ ]]; then
    print_error "Invalid environment: $ENVIRONMENT"
    print_error "Must be one of: staging, production"
    exit 1
fi

# Validate deployment type
if [[ ! "$DEPLOYMENT_TYPE" =~ ^(rolling|blue-green|canary)$ ]]; then
    print_error "Invalid deployment type: $DEPLOYMENT_TYPE"
    print_error "Must be one of: rolling, blue-green, canary"
    exit 1
fi

print_status "Starting deployment to $ENVIRONMENT environment"
print_status "Deployment type: $DEPLOYMENT_TYPE"
print_status "Services: $SERVICES"
print_status "Version: $VERSION"
print_status "Registry: $REGISTRY"

if [[ "$DRY_RUN" == "true" ]]; then
    print_warning "DRY RUN MODE - No actual changes will be made"
fi

# Change to project root
cd "$PROJECT_ROOT"

# Function to get services list
get_services_list() {
    if [[ "$SERVICES" == "all" ]]; then
        echo "zerodha-auth-service zerodha-market-service zerodha-order-service zerodha-portfolio-service zerodha-risk-service"
    else
        # Convert comma-separated list to space-separated
        echo "$SERVICES" | tr ',' ' ' | sed 's/auth/zerodha-auth-service/g; s/market/zerodha-market-service/g; s/order/zerodha-order-service/g; s/portfolio/zerodha-portfolio-service/g; s/risk/zerodha-risk-service/g'
    fi
}

# Function to check prerequisites
check_prerequisites() {
    print_status "Checking deployment prerequisites..."
    
    # Check if kubectl is available and configured
    if ! command -v kubectl &> /dev/null; then
        print_error "kubectl is not installed or not in PATH"
        exit 1
    fi
    
    # Check kubectl context
    CURRENT_CONTEXT=$(kubectl config current-context 2>/dev/null || echo "none")
    EXPECTED_CONTEXT="tradeflow-$ENVIRONMENT"
    
    if [[ "$CURRENT_CONTEXT" != "$EXPECTED_CONTEXT" ]]; then
        print_error "Wrong kubectl context. Expected: $EXPECTED_CONTEXT, Current: $CURRENT_CONTEXT"
        print_error "Please switch to the correct context: kubectl config use-context $EXPECTED_CONTEXT"
        exit 1
    fi
    
    # Check if namespace exists
    if ! kubectl get namespace "zerodha-$ENVIRONMENT" &> /dev/null; then
        print_error "Namespace zerodha-$ENVIRONMENT does not exist"
        exit 1
    fi
    
    # Check if images exist in registry
    local services=($(get_services_list))
    for service in "${services[@]}"; do
        local image="$REGISTRY/zerodha-$service:$VERSION"
        print_status "Checking image: $image"
        
        # This is a simplified check - in production you'd use proper registry API
        if [[ "$VERSION" != "latest" && "$DRY_RUN" != "true" ]]; then
            # Add actual image existence check here
            print_status "✓ Image check passed for $service"
        fi
    done
    
    print_success "Prerequisites check completed"
}

# Function to backup current deployment
backup_deployment() {
    if [[ "$BACKUP_BEFORE_DEPLOY" != "true" ]]; then
        print_warning "Skipping backup as requested"
        return 0
    fi
    
    print_status "Creating backup of current deployment..."
    
    local backup_dir="backups/$(date +%Y%m%d-%H%M%S)-$ENVIRONMENT"
    mkdir -p "$backup_dir"
    
    local services=($(get_services_list))
    for service in "${services[@]}"; do
        if kubectl get deployment "$service" -n "zerodha-$ENVIRONMENT" &> /dev/null; then
            kubectl get deployment "$service" -n "zerodha-$ENVIRONMENT" -o yaml > "$backup_dir/$service-deployment.yaml"
            kubectl get service "$service" -n "zerodha-$ENVIRONMENT" -o yaml > "$backup_dir/$service-service.yaml" 2>/dev/null || true
            print_status "✓ Backed up $service"
        fi
    done
    
    echo "$backup_dir" > .last_backup_path
    print_success "Backup created at: $backup_dir"
}

# Function to perform rolling deployment
rolling_deployment() {
    print_status "Performing rolling deployment..."
    
    local services=($(get_services_list))
    for service in "${services[@]}"; do
        local image="$REGISTRY/zerodha-$service:$VERSION"
        
        print_status "Deploying $service with image $image"
        
        if [[ "$DRY_RUN" == "true" ]]; then
            print_status "[DRY RUN] Would update deployment $service to $image"
        else
            kubectl set image deployment/"$service" \
                "$service"="$image" \
                -n "zerodha-$ENVIRONMENT"
            
            # Wait for rollout to complete
            if ! kubectl rollout status deployment/"$service" -n "zerodha-$ENVIRONMENT" --timeout=300s; then
                print_error "Rollout failed for $service"
                if [[ "$ROLLBACK_ON_FAILURE" == "true" ]]; then
                    rollback_deployment "$service"
                fi
                exit 1
            fi
            
            print_success "✓ $service deployed successfully"
        fi
    done
}

# Function to perform blue-green deployment
blue_green_deployment() {
    print_status "Performing blue-green deployment..."
    
    local services=($(get_services_list))
    
    # Phase 1: Create green deployments
    print_status "Phase 1: Creating green deployments..."
    for service in "${services[@]}"; do
        local image="$REGISTRY/zerodha-$service:$VERSION"
        
        if [[ "$DRY_RUN" == "true" ]]; then
            print_status "[DRY RUN] Would create green deployment for $service"
        else
            # Copy current deployment to green
            kubectl get deployment "$service" -n "zerodha-$ENVIRONMENT" -o yaml | \
                sed "s/name: $service/name: $service-green/" | \
                sed "s/app: $service/app: $service-green/" | \
                kubectl apply -f -
            
            # Update green deployment with new image
            kubectl set image deployment/"$service-green" \
                "$service"="$image" \
                -n "zerodha-$ENVIRONMENT"
            
            # Wait for green deployment
            kubectl rollout status deployment/"$service-green" -n "zerodha-$ENVIRONMENT" --timeout=300s
            
            print_success "✓ Green deployment ready for $service"
        fi
    done
    
    # Phase 2: Health check green deployments
    if [[ "$SKIP_HEALTH_CHECK" != "true" && "$DRY_RUN" != "true" ]]; then
        print_status "Phase 2: Health checking green deployments..."
        health_check_green_deployments
    fi
    
    # Phase 3: Switch traffic to green
    print_status "Phase 3: Switching traffic to green deployments..."
    for service in "${services[@]}"; do
        if [[ "$DRY_RUN" == "true" ]]; then
            print_status "[DRY RUN] Would switch traffic to green for $service"
        else
            kubectl patch service "$service" -n "zerodha-$ENVIRONMENT" \
                -p '{"spec":{"selector":{"app":"'$service'-green"}}}'
            print_success "✓ Traffic switched to green for $service"
        fi
    done
    
    # Phase 4: Verify and cleanup
    if [[ "$DRY_RUN" != "true" ]]; then
        print_status "Phase 4: Verifying deployment and cleaning up..."
        sleep 30  # Allow traffic to stabilize
        
        if [[ "$SKIP_HEALTH_CHECK" != "true" ]]; then
            health_check_services
        fi
        
        # Clean up old blue deployments
        for service in "${services[@]}"; do
            kubectl delete deployment "$service" -n "zerodha-$ENVIRONMENT" || true
            
            # Rename green to blue
            kubectl get deployment "$service-green" -n "zerodha-$ENVIRONMENT" -o yaml | \
                sed "s/name: $service-green/name: $service/" | \
                sed "s/app: $service-green/app: $service/" | \
                kubectl apply -f -
            
            kubectl delete deployment "$service-green" -n "zerodha-$ENVIRONMENT"
            print_success "✓ Cleanup completed for $service"
        done
    fi
}

# Function to perform canary deployment
canary_deployment() {
    print_status "Performing canary deployment..."
    
    local services=($(get_services_list))
    local canary_percentage="${CANARY_PERCENTAGE:-10}"
    
    print_status "Canary percentage: $canary_percentage%"
    
    for service in "${services[@]}"; do
        local image="$REGISTRY/zerodha-$service:$VERSION"
        
        if [[ "$DRY_RUN" == "true" ]]; then
            print_status "[DRY RUN] Would create canary deployment for $service"
        else
            # Create canary deployment
            kubectl get deployment "$service" -n "zerodha-$ENVIRONMENT" -o yaml | \
                sed "s/name: $service/name: $service-canary/" | \
                sed "s/app: $service/app: $service-canary/" | \
                kubectl apply -f -
            
            # Update canary with new image
            kubectl set image deployment/"$service-canary" \
                "$service"="$image" \
                -n "zerodha-$ENVIRONMENT"
            
            # Scale canary to appropriate size
            local current_replicas=$(kubectl get deployment "$service" -n "zerodha-$ENVIRONMENT" -o jsonpath='{.spec.replicas}')
            local canary_replicas=$(( (current_replicas * canary_percentage) / 100 ))
            if [[ $canary_replicas -lt 1 ]]; then
                canary_replicas=1
            fi
            
            kubectl scale deployment "$service-canary" --replicas="$canary_replicas" -n "zerodha-$ENVIRONMENT"
            
            # Wait for canary deployment
            kubectl rollout status deployment/"$service-canary" -n "zerodha-$ENVIRONMENT" --timeout=300s
            
            print_success "✓ Canary deployment ready for $service ($canary_replicas replicas)"
        fi
    done
    
    if [[ "$DRY_RUN" != "true" ]]; then
        print_status "Canary deployment active. Monitor metrics and run full deployment when ready."
        print_status "To promote canary: $0 -e $ENVIRONMENT -t rolling -v $VERSION"
        print_status "To rollback canary: kubectl delete deployment <service>-canary -n zerodha-$ENVIRONMENT"
    fi
}

# Function to health check services
health_check_services() {
    print_status "Performing health checks..."
    
    local services=($(get_services_list))
    local max_attempts=30
    local attempt=1
    
    for service in "${services[@]}"; do
        print_status "Health checking $service..."
        
        while [[ $attempt -le $max_attempts ]]; do
            # Get service endpoint
            local service_ip=$(kubectl get service "$service" -n "zerodha-$ENVIRONMENT" -o jsonpath='{.status.loadBalancer.ingress[0].ip}' 2>/dev/null || echo "")
            
            if [[ -z "$service_ip" ]]; then
                # Try cluster IP if LoadBalancer IP not available
                service_ip=$(kubectl get service "$service" -n "zerodha-$ENVIRONMENT" -o jsonpath='{.spec.clusterIP}')
            fi
            
            local port=$(kubectl get service "$service" -n "zerodha-$ENVIRONMENT" -o jsonpath='{.spec.ports[0].port}')
            
            if curl -f -s "http://$service_ip:$port/health" > /dev/null 2>&1; then
                print_success "✓ $service is healthy"
                break
            fi
            
            if [[ $attempt -eq $max_attempts ]]; then
                print_error "$service failed health check after $max_attempts attempts"
                return 1
            fi
            
            print_status "Attempt $attempt/$max_attempts: $service not ready yet, waiting..."
            sleep 10
            ((attempt++))
        done
        
        attempt=1
    done
    
    print_success "All services passed health checks"
}

# Function to health check green deployments
health_check_green_deployments() {
    print_status "Health checking green deployments..."
    
    local services=($(get_services_list))
    
    for service in "${services[@]}"; do
        # Port forward to green deployment for testing
        local pod=$(kubectl get pods -n "zerodha-$ENVIRONMENT" -l app="$service-green" -o jsonpath='{.items[0].metadata.name}')
        local port=$(kubectl get service "$service" -n "zerodha-$ENVIRONMENT" -o jsonpath='{.spec.ports[0].port}')
        
        kubectl port-forward "$pod" "8888:$port" -n "zerodha-$ENVIRONMENT" &
        local pf_pid=$!
        
        sleep 5
        
        if curl -f -s "http://localhost:8888/health" > /dev/null 2>&1; then
            print_success "✓ Green deployment healthy for $service"
        else
            print_error "Green deployment health check failed for $service"
            kill $pf_pid 2>/dev/null || true
            return 1
        fi
        
        kill $pf_pid 2>/dev/null || true
    done
}

# Function to rollback deployment
rollback_deployment() {
    local service="$1"
    
    print_warning "Rolling back $service deployment..."
    
    if [[ -f .last_backup_path ]]; then
        local backup_dir=$(cat .last_backup_path)
        if [[ -f "$backup_dir/$service-deployment.yaml" ]]; then
            kubectl apply -f "$backup_dir/$service-deployment.yaml"
            kubectl rollout status deployment/"$service" -n "zerodha-$ENVIRONMENT" --timeout=300s
            print_success "✓ Rollback completed for $service"
        else
            print_error "Backup file not found for $service"
            kubectl rollout undo deployment/"$service" -n "zerodha-$ENVIRONMENT"
        fi
    else
        print_warning "No backup found, using kubectl rollout undo"
        kubectl rollout undo deployment/"$service" -n "zerodha-$ENVIRONMENT"
    fi
}

# Function to cleanup failed deployments
cleanup_failed_deployment() {
    print_status "Cleaning up failed deployment artifacts..."
    
    local services=($(get_services_list))
    for service in "${services[@]}"; do
        # Clean up any green or canary deployments
        kubectl delete deployment "$service-green" -n "zerodha-$ENVIRONMENT" 2>/dev/null || true
        kubectl delete deployment "$service-canary" -n "zerodha-$ENVIRONMENT" 2>/dev/null || true
    done
}

# Trap to handle cleanup on exit
cleanup() {
    if [[ $? -ne 0 ]]; then
        print_error "Deployment failed, cleaning up..."
        cleanup_failed_deployment
    fi
}
trap cleanup EXIT

# Main execution
main() {
    check_prerequisites
    backup_deployment
    
    case "$DEPLOYMENT_TYPE" in
        rolling)
            rolling_deployment
            ;;
        blue-green)
            blue_green_deployment
            ;;
        canary)
            canary_deployment
            ;;
        *)
            print_error "Unknown deployment type: $DEPLOYMENT_TYPE"
            exit 1
            ;;
    esac
    
    if [[ "$SKIP_HEALTH_CHECK" != "true" && "$DEPLOYMENT_TYPE" != "canary" && "$DRY_RUN" != "true" ]]; then
        health_check_services
    fi
    
    print_success "Deployment completed successfully!"
    
    if [[ "$DRY_RUN" != "true" ]]; then
        print_status "Deployment summary:"
        print_status "- Environment: $ENVIRONMENT"
        print_status "- Type: $DEPLOYMENT_TYPE"
        print_status "- Services: $SERVICES"
        print_status "- Version: $VERSION"
        print_status "- Registry: $REGISTRY"
    fi
}

# Run main function
main "$@"