#!/bin/bash

# TradeFlow Monitoring Infrastructure Startup Script

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] $1${NC}"
}

warn() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] WARNING: $1${NC}"
}

error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ERROR: $1${NC}"
}

info() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')] INFO: $1${NC}"
}

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
DOCKER_COMPOSE_LOGGING="$PROJECT_ROOT/docker/logging/docker-compose.logging.yml"
DOCKER_COMPOSE_MONITORING="$PROJECT_ROOT/docker/monitoring/docker-compose.monitoring.yml"

# Check if Docker is running
check_docker() {
    if ! docker info > /dev/null 2>&1; then
        error "Docker is not running. Please start Docker and try again."
        exit 1
    fi
    log "Docker is running"
}

# Check if Docker Compose is available
check_docker_compose() {
    if ! command -v docker-compose > /dev/null 2>&1; then
        error "Docker Compose is not installed. Please install Docker Compose and try again."
        exit 1
    fi
    log "Docker Compose is available"
}

# Create necessary directories
create_directories() {
    log "Creating necessary directories..."
    
    mkdir -p "$PROJECT_ROOT/logs"
    mkdir -p "$PROJECT_ROOT/docker/logging/elasticsearch/data"
    mkdir -p "$PROJECT_ROOT/docker/monitoring/prometheus/data"
    mkdir -p "$PROJECT_ROOT/docker/monitoring/grafana/data"
    mkdir -p "$PROJECT_ROOT/docker/monitoring/alertmanager/data"
    
    # Set permissions for Elasticsearch
    chmod 777 "$PROJECT_ROOT/docker/logging/elasticsearch/data"
    chmod 777 "$PROJECT_ROOT/docker/monitoring/prometheus/data"
    chmod 777 "$PROJECT_ROOT/docker/monitoring/grafana/data"
    chmod 777 "$PROJECT_ROOT/docker/monitoring/alertmanager/data"
    
    log "Directories created successfully"
}

# Start logging infrastructure
start_logging() {
    log "Starting logging infrastructure..."
    
    if [[ -f "$DOCKER_COMPOSE_LOGGING" ]]; then
        cd "$(dirname "$DOCKER_COMPOSE_LOGGING")"
        docker-compose -f docker-compose.logging.yml up -d
        
        # Wait for Elasticsearch to be ready
        info "Waiting for Elasticsearch to be ready..."
        timeout=60
        while ! curl -s http://localhost:9200/_cluster/health > /dev/null; do
            sleep 2
            timeout=$((timeout - 2))
            if [[ $timeout -le 0 ]]; then
                error "Elasticsearch failed to start within 60 seconds"
                exit 1
            fi
        done
        
        log "Logging infrastructure started successfully"
    else
        warn "Logging Docker Compose file not found: $DOCKER_COMPOSE_LOGGING"
    fi
}

# Start monitoring infrastructure
start_monitoring() {
    log "Starting monitoring infrastructure..."
    
    if [[ -f "$DOCKER_COMPOSE_MONITORING" ]]; then
        cd "$(dirname "$DOCKER_COMPOSE_MONITORING")"
        docker-compose -f docker-compose.monitoring.yml up -d
        
        # Wait for Prometheus to be ready
        info "Waiting for Prometheus to be ready..."
        timeout=60
        while ! curl -s http://localhost:9090/-/ready > /dev/null; do
            sleep 2
            timeout=$((timeout - 2))
            if [[ $timeout -le 0 ]]; then
                error "Prometheus failed to start within 60 seconds"
                exit 1
            fi
        done
        
        # Wait for Grafana to be ready
        info "Waiting for Grafana to be ready..."
        timeout=60
        while ! curl -s http://localhost:3007/api/health > /dev/null; do
            sleep 2
            timeout=$((timeout - 2))
            if [[ $timeout -le 0 ]]; then
                error "Grafana failed to start within 60 seconds"
                exit 1
            fi
        done
        
        log "Monitoring infrastructure started successfully"
    else
        warn "Monitoring Docker Compose file not found: $DOCKER_COMPOSE_MONITORING"
    fi
}

# Setup log management
setup_log_management() {
    log "Setting up log management..."
    
    if [[ -f "$PROJECT_ROOT/scripts/log-management.sh" ]]; then
        # Make sure the script is executable
        chmod +x "$PROJECT_ROOT/scripts/log-management.sh"
        
        # Run initial setup
        "$PROJECT_ROOT/scripts/log-management.sh" setup
        
        log "Log management setup completed"
    else
        warn "Log management script not found"
    fi
}

# Start monitoring service
start_monitoring_service() {
    log "Starting TradeFlow monitoring service..."
    
    cd "$PROJECT_ROOT/services/monitoring-service"
    
    # Check if dependencies are installed
    if [[ ! -d "node_modules" ]]; then
        info "Installing monitoring service dependencies..."
        npm install
    fi
    
    # Build the service
    info "Building monitoring service..."
    npm run build
    
    # Start the service in background
    info "Starting monitoring service..."
    nohup npm start > "$PROJECT_ROOT/logs/monitoring-service.log" 2>&1 &
    MONITORING_PID=$!
    echo $MONITORING_PID > "$PROJECT_ROOT/logs/monitoring-service.pid"
    
    # Wait for service to be ready
    timeout=30
    while ! curl -s http://localhost:3006/health > /dev/null; do
        sleep 2
        timeout=$((timeout - 2))
        if [[ $timeout -le 0 ]]; then
            error "Monitoring service failed to start within 30 seconds"
            exit 1
        fi
    done
    
    log "Monitoring service started successfully (PID: $MONITORING_PID)"
}

# Display service URLs
show_urls() {
    log "Monitoring infrastructure is ready!"
    echo ""
    info "Service URLs:"
    echo "  📊 Grafana Dashboard:    http://localhost:3007 (admin/admin123)"
    echo "  📈 Prometheus:           http://localhost:9090"
    echo "  🔍 Kibana (Logs):       http://localhost:5601"
    echo "  🚨 Alertmanager:         http://localhost:9093"
    echo "  🔧 Monitoring API:       http://localhost:3006"
    echo "  📋 Node Exporter:       http://localhost:9100"
    echo "  🐳 cAdvisor:             http://localhost:8080"
    echo ""
    info "Default Grafana credentials: admin / admin123"
    echo ""
}

# Stop all monitoring services
stop_monitoring() {
    log "Stopping monitoring infrastructure..."
    
    # Stop monitoring service
    if [[ -f "$PROJECT_ROOT/logs/monitoring-service.pid" ]]; then
        MONITORING_PID=$(cat "$PROJECT_ROOT/logs/monitoring-service.pid")
        if kill -0 "$MONITORING_PID" 2>/dev/null; then
            kill "$MONITORING_PID"
            log "Monitoring service stopped"
        fi
        rm -f "$PROJECT_ROOT/logs/monitoring-service.pid"
    fi
    
    # Stop Docker containers
    if [[ -f "$DOCKER_COMPOSE_MONITORING" ]]; then
        cd "$(dirname "$DOCKER_COMPOSE_MONITORING")"
        docker-compose -f docker-compose.monitoring.yml down
    fi
    
    if [[ -f "$DOCKER_COMPOSE_LOGGING" ]]; then
        cd "$(dirname "$DOCKER_COMPOSE_LOGGING")"
        docker-compose -f docker-compose.logging.yml down
    fi
    
    log "Monitoring infrastructure stopped"
}

# Show status of monitoring services
show_status() {
    info "Monitoring Infrastructure Status:"
    echo ""
    
    # Check Docker containers
    echo "Docker Containers:"
    docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" | grep -E "(tradeflow|prometheus|grafana|elasticsearch|kibana)" || echo "No monitoring containers running"
    echo ""
    
    # Check monitoring service
    if [[ -f "$PROJECT_ROOT/logs/monitoring-service.pid" ]]; then
        MONITORING_PID=$(cat "$PROJECT_ROOT/logs/monitoring-service.pid")
        if kill -0 "$MONITORING_PID" 2>/dev/null; then
            echo "✅ Monitoring Service: Running (PID: $MONITORING_PID)"
        else
            echo "❌ Monitoring Service: Not running"
        fi
    else
        echo "❌ Monitoring Service: Not running"
    fi
    echo ""
    
    # Check service endpoints
    echo "Service Health:"
    services=(
        "Prometheus:http://localhost:9090/-/ready"
        "Grafana:http://localhost:3007/api/health"
        "Elasticsearch:http://localhost:9200/_cluster/health"
        "Kibana:http://localhost:5601/api/status"
        "Monitoring API:http://localhost:3006/health"
    )
    
    for service in "${services[@]}"; do
        name=$(echo "$service" | cut -d: -f1)
        url=$(echo "$service" | cut -d: -f2-)
        
        if curl -s "$url" > /dev/null 2>&1; then
            echo "✅ $name: Healthy"
        else
            echo "❌ $name: Unhealthy"
        fi
    done
}

# Main execution
main() {
    case "${1:-start}" in
        "start")
            log "Starting TradeFlow monitoring infrastructure..."
            check_docker
            check_docker_compose
            create_directories
            start_logging
            start_monitoring
            setup_log_management
            start_monitoring_service
            show_urls
            ;;
        "stop")
            stop_monitoring
            ;;
        "restart")
            stop_monitoring
            sleep 5
            main start
            ;;
        "status")
            show_status
            ;;
        "logs")
            service="${2:-all}"
            if [[ "$service" == "all" ]]; then
                docker-compose -f "$DOCKER_COMPOSE_LOGGING" logs -f
            else
                docker-compose -f "$DOCKER_COMPOSE_LOGGING" logs -f "$service"
            fi
            ;;
        *)
            echo "Usage: $0 {start|stop|restart|status|logs [service]}"
            echo ""
            echo "Commands:"
            echo "  start    - Start all monitoring services"
            echo "  stop     - Stop all monitoring services"
            echo "  restart  - Restart all monitoring services"
            echo "  status   - Show status of monitoring services"
            echo "  logs     - Show logs (optionally for specific service)"
            exit 1
            ;;
    esac
}

# Run main function
main "$@"