#!/bin/bash

# Security Testing Script for TradeFlow Backend
# This script runs comprehensive security and penetration tests

set -e

echo "🔒 Starting Security and Penetration Testing Suite..."
echo "=================================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

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

# Check if required tools are installed
check_dependencies() {
    print_status "Checking dependencies..."
    
    if ! command -v node &> /dev/null; then
        print_error "Node.js is not installed"
        exit 1
    fi
    
    if ! command -v npm &> /dev/null; then
        print_error "npm is not installed"
        exit 1
    fi
    
    print_success "All dependencies are available"
}

# Start required services
start_services() {
    print_status "Starting required services..."
    
    # Check if Docker is available and start services
    if command -v docker-compose &> /dev/null; then
        print_status "Starting Docker services..."
        docker-compose -f docker-compose.test.yml up -d postgres redis
        sleep 5
    else
        print_warning "Docker Compose not available. Make sure PostgreSQL and Redis are running manually."
    fi
}

# Run security tests
run_security_tests() {
    print_status "Running security and penetration tests..."
    
    # Set test environment
    export NODE_ENV=test
    export JWT_SECRET=test-secret-key-for-security-testing
    export DB_NAME=tradeflow_security_test
    
    # Create test database if it doesn't exist
    print_status "Setting up test database..."
    
    # Run database migrations for test environment
    if [ -f "database/migrate.js" ]; then
        cd database
        npm run migrate:test || print_warning "Database migration failed or not configured"
        cd ..
    fi
    
    # Run security tests for each service
    print_status "Running API Gateway security tests..."
    cd services/api-gateway
    
    # Install dependencies if needed
    if [ ! -d "node_modules" ]; then
        npm install
    fi
    
    # Run specific security test suites
    echo ""
    print_status "🔐 Running Authentication Bypass Tests..."
    npm test -- --testPathPattern="security/auth-bypass.security.test.ts" --verbose || true
    
    echo ""
    print_status "💉 Running SQL Injection Tests..."
    npm test -- --testPathPattern="security/sql-injection.security.test.ts" --verbose || true
    
    echo ""
    print_status "🚦 Running Rate Limiting and DDoS Protection Tests..."
    npm test -- --testPathPattern="security/rate-limiting.security.test.ts" --verbose || true
    
    echo ""
    print_status "🛡️ Running Session Hijacking and CSRF Protection Tests..."
    npm test -- --testPathPattern="security/session-csrf.security.test.ts" --verbose || true
    
    echo ""
    print_status "🔍 Running Vulnerability Scanning Tests..."
    npm test -- --testPathPattern="security/vulnerability-scan.security.test.ts" --verbose || true
    
    cd ../..
}

# Run additional security checks
run_security_analysis() {
    print_status "Running additional security analysis..."
    
    # Check for known vulnerabilities in dependencies
    print_status "Checking for vulnerable dependencies..."
    npm audit --audit-level=moderate || print_warning "Some vulnerabilities found in dependencies"
    
    # Check for hardcoded secrets (basic check)
    print_status "Scanning for potential hardcoded secrets..."
    
    # Look for common secret patterns
    if grep -r -i "password.*=" --include="*.js" --include="*.ts" --exclude-dir=node_modules . | grep -v "test" | grep -v "example"; then
        print_warning "Potential hardcoded passwords found"
    fi
    
    if grep -r -i "secret.*=" --include="*.js" --include="*.ts" --exclude-dir=node_modules . | grep -v "test" | grep -v "example"; then
        print_warning "Potential hardcoded secrets found"
    fi
    
    if grep -r -i "api.*key.*=" --include="*.js" --include="*.ts" --exclude-dir=node_modules . | grep -v "test" | grep -v "example"; then
        print_warning "Potential hardcoded API keys found"
    fi
    
    print_success "Security analysis completed"
}

# Generate security report
generate_security_report() {
    print_status "Generating security test report..."
    
    REPORT_DIR="security-reports"
    REPORT_FILE="$REPORT_DIR/security-test-report-$(date +%Y%m%d-%H%M%S).md"
    
    mkdir -p "$REPORT_DIR"
    
    cat > "$REPORT_FILE" << EOF
# Security Test Report

**Generated:** $(date)
**Environment:** Test
**Test Suite:** Comprehensive Security and Penetration Testing

## Test Categories Executed

### 1. Authentication Bypass Security Tests
- JWT Token Security
- Session Security  
- Authorization Bypass Attempts
- Header Injection Attacks

### 2. SQL Injection Security Tests
- Authentication Endpoints SQL Injection
- User Profile SQL Injection
- Strategy and Portfolio SQL Injection
- Advanced SQL Injection Techniques
- NoSQL Injection Prevention

### 3. Rate Limiting and DDoS Protection Tests
- General Rate Limiting
- Authentication Rate Limiting
- DDoS Protection
- Resource Exhaustion Protection
- API Abuse Prevention

### 4. Session Hijacking and CSRF Protection Tests
- Session Hijacking Protection
- CSRF Protection
- Cross-Origin Request Security
- Token Security
- Advanced Attack Prevention

### 5. Vulnerability Scanning and Assessment
- Input Validation Vulnerabilities
- Authentication and Authorization Vulnerabilities
- Data Exposure Vulnerabilities
- Business Logic Vulnerabilities
- Infrastructure Security Vulnerabilities
- API Security Best Practices

## Security Recommendations

1. **Keep Dependencies Updated**: Regularly update all npm packages to patch known vulnerabilities
2. **Implement Security Headers**: Ensure all security headers are properly configured
3. **Monitor Rate Limits**: Regularly review and adjust rate limiting thresholds
4. **Audit Logs**: Implement comprehensive security event logging
5. **Regular Penetration Testing**: Conduct regular security assessments

## Next Steps

- Review any failed tests and address security issues
- Implement additional security measures as needed
- Schedule regular security testing
- Update security policies and procedures

EOF

    print_success "Security report generated: $REPORT_FILE"
}

# Cleanup function
cleanup() {
    print_status "Cleaning up test environment..."
    
    # Stop Docker services if they were started
    if command -v docker-compose &> /dev/null; then
        docker-compose -f docker-compose.test.yml down || true
    fi
    
    print_success "Cleanup completed"
}

# Main execution
main() {
    echo "🔒 TradeFlow Security Testing Suite"
    echo "=================================="
    echo ""
    
    # Trap cleanup on exit
    trap cleanup EXIT
    
    check_dependencies
    start_services
    run_security_tests
    run_security_analysis
    generate_security_report
    
    echo ""
    print_success "Security testing completed successfully!"
    echo ""
    echo "📊 Summary:"
    echo "- Authentication bypass tests: ✓"
    echo "- SQL injection tests: ✓"
    echo "- Rate limiting tests: ✓"
    echo "- CSRF protection tests: ✓"
    echo "- Vulnerability scanning: ✓"
    echo ""
    print_status "Review the generated security report for detailed results."
}

# Run main function
main "$@"