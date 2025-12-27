#!/bin/bash

# TradeFlow Database Migration Script
# This script is designed for automated execution in deployment pipelines

set -e  # Exit on any error

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DATABASE_URL="${POSTGRES_URL:-postgresql://tradeflow:tradeflow_dev_password@localhost:5432/tradeflow}"
MAX_RETRIES=30
RETRY_DELAY=2

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Wait for database to be ready
wait_for_database() {
    log_info "Waiting for database to be ready..."
    
    for i in $(seq 1 $MAX_RETRIES); do
        if pg_isready -d "$DATABASE_URL" >/dev/null 2>&1; then
            log_success "Database is ready"
            return 0
        fi
        
        log_info "Database not ready, attempt $i/$MAX_RETRIES. Retrying in ${RETRY_DELAY}s..."
        sleep $RETRY_DELAY
    done
    
    log_error "Database failed to become ready after $MAX_RETRIES attempts"
    return 1
}

# Install dependencies if needed
install_dependencies() {
    if [ ! -d "$SCRIPT_DIR/node_modules" ]; then
        log_info "Installing migration dependencies..."
        cd "$SCRIPT_DIR"
        npm install --production
        log_success "Dependencies installed"
    fi
}

# Run migrations
run_migrations() {
    log_info "Running database migrations..."
    cd "$SCRIPT_DIR"
    
    # Set the database URL for the migration script
    export POSTGRES_URL="$DATABASE_URL"
    
    # Run the migration
    if node migrate.js migrate; then
        log_success "Migrations completed successfully"
        return 0
    else
        log_error "Migrations failed"
        return 1
    fi
}

# Show migration status
show_status() {
    log_info "Checking migration status..."
    cd "$SCRIPT_DIR"
    
    export POSTGRES_URL="$DATABASE_URL"
    node migrate.js status
}

# Rollback migrations
rollback_migrations() {
    local target_version="$1"
    
    if [ -z "$target_version" ]; then
        log_error "Target version required for rollback"
        echo "Usage: $0 rollback <version>"
        return 1
    fi
    
    log_warning "Rolling back migrations to version: $target_version"
    cd "$SCRIPT_DIR"
    
    export POSTGRES_URL="$DATABASE_URL"
    
    if node migrate.js rollback "$target_version"; then
        log_success "Rollback completed successfully"
        return 0
    else
        log_error "Rollback failed"
        return 1
    fi
}

# Validate database connection
validate_connection() {
    log_info "Validating database connection..."
    
    if psql "$DATABASE_URL" -c "SELECT version();" >/dev/null 2>&1; then
        log_success "Database connection validated"
        return 0
    else
        log_error "Failed to connect to database"
        return 1
    fi
}

# Main execution
main() {
    local command="${1:-migrate}"
    
    log_info "TradeFlow Database Migration Script"
    log_info "Command: $command"
    log_info "Database URL: ${DATABASE_URL%@*}@***"  # Hide password in logs
    
    case "$command" in
        "migrate"|"up")
            wait_for_database
            validate_connection
            install_dependencies
            run_migrations
            ;;
        "status")
            wait_for_database
            validate_connection
            install_dependencies
            show_status
            ;;
        "rollback"|"down")
            wait_for_database
            validate_connection
            install_dependencies
            rollback_migrations "$2"
            ;;
        "validate")
            wait_for_database
            validate_connection
            ;;
        "help"|"--help"|"-h")
            echo "Usage: $0 [command] [options]"
            echo ""
            echo "Commands:"
            echo "  migrate, up          Run pending migrations (default)"
            echo "  status               Show migration status"
            echo "  rollback, down <ver> Rollback to specified version"
            echo "  validate             Validate database connection"
            echo "  help                 Show this help message"
            echo ""
            echo "Environment Variables:"
            echo "  POSTGRES_URL         Database connection URL"
            echo ""
            echo "Examples:"
            echo "  $0 migrate"
            echo "  $0 status"
            echo "  $0 rollback 001_initial_schema"
            ;;
        *)
            log_error "Unknown command: $command"
            echo "Use '$0 help' for usage information"
            exit 1
            ;;
    esac
}

# Execute main function with all arguments
main "$@"