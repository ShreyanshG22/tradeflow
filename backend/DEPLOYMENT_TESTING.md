# Deployment and Production Readiness Testing

This document describes the comprehensive deployment and production readiness testing framework for the TradeFlow backend infrastructure.

## Overview

The deployment testing framework validates that the TradeFlow backend is ready for production deployment by testing various aspects of the system including security, deployment strategies, monitoring, backup procedures, and disaster recovery capabilities.

## Test Suites

### 1. Docker Security Scanning (`docker-security-scan.sh`)

**Purpose**: Validates container security and identifies vulnerabilities in Docker images.

**What it tests**:
- Container vulnerability scanning with Trivy and Docker Scout
- Dockerfile security best practices
- Base image security analysis
- Runtime security configurations
- Package manager presence checks
- Root user usage validation

**Usage**:
```bash
npm run deploy:security-scan
# or
./scripts/docker-security-scan.sh
```

**Output**: `security-scan-results/security-summary.md`

### 2. Blue-Green Deployment Testing (`blue-green-deployment-test.sh`)

**Purpose**: Tests deployment strategies and zero-downtime deployment capabilities.

**What it tests**:
- Blue environment deployment and validation
- Green environment deployment and validation
- Traffic switching between environments
- Rollback procedures
- Zero-downtime deployment scenarios
- Parallel environment operation

**Usage**:
```bash
npm run deploy:blue-green
# or
./scripts/blue-green-deployment-test.sh
```

**Output**: `deployment-test-results/deployment-test-report.md`

### 3. Production Smoke Tests (`production-smoke-tests.sh`)

**Purpose**: Validates production environment functionality and health.

**What it tests**:
- Service health checks
- Database connectivity
- Redis connectivity
- Authentication flow
- Market data endpoints
- WebSocket connectivity
- Authenticated endpoints
- System performance metrics

**Usage**:
```bash
npm run deploy:smoke-tests
# or
./scripts/production-smoke-tests.sh
```

**Environment Variables**:
- `API_GATEWAY_URL` - API Gateway endpoint (default: http://localhost:3000)
- `USER_SERVICE_URL` - User Service endpoint (default: http://localhost:3001)
- `STRATEGY_SERVICE_URL` - Strategy Service endpoint (default: http://localhost:3002)
- `PORTFOLIO_SERVICE_URL` - Portfolio Service endpoint (default: http://localhost:3003)
- `MARKET_DATA_SERVICE_URL` - Market Data Service endpoint (default: http://localhost:3004)

**Output**: `production-smoke-results/smoke-test-report.md`

### 4. Monitoring Validation (`monitoring-validation-tests.sh`)

**Purpose**: Tests monitoring and alerting infrastructure.

**What it tests**:
- Prometheus health and metrics collection
- Grafana dashboard availability
- Alertmanager configuration and alerts
- Elasticsearch log ingestion
- Kibana dashboard access
- Alert rule validation
- Notification channel testing
- Alert condition simulation

**Usage**:
```bash
npm run deploy:monitoring
# or
./scripts/monitoring-validation-tests.sh
```

**Environment Variables**:
- `PROMETHEUS_URL` - Prometheus endpoint (default: http://localhost:9090)
- `GRAFANA_URL` - Grafana endpoint (default: http://localhost:3001)
- `ALERTMANAGER_URL` - Alertmanager endpoint (default: http://localhost:9093)
- `ELASTICSEARCH_URL` - Elasticsearch endpoint (default: http://localhost:9200)
- `KIBANA_URL` - Kibana endpoint (default: http://localhost:5601)

**Output**: `monitoring-validation-results/monitoring-validation-report.md`

### 5. Backup and Restore Testing (`backup-restore-tests.sh`)

**Purpose**: Validates data backup and recovery procedures.

**What it tests**:
- PostgreSQL backup creation and restoration
- Redis backup creation and restoration
- Backup integrity validation
- Data consistency after restore
- Incremental backup procedures
- Point-in-time recovery simulation
- Backup file security and format validation

**Usage**:
```bash
npm run deploy:backup-restore
# or
./scripts/backup-restore-tests.sh
```

**Environment Variables**:
- `POSTGRES_CONTAINER` - PostgreSQL container name (default: tradeflow-postgres)
- `REDIS_CONTAINER` - Redis container name (default: tradeflow-redis)
- `POSTGRES_DB` - Database name (default: tradeflow)
- `POSTGRES_USER` - Database user (default: tradeflow)
- `POSTGRES_PASSWORD` - Database password (default: tradeflow_dev_password)

**Output**: `backup-restore-results/backup-restore-report.md`

### 6. Disaster Recovery Testing (`disaster-recovery-tests.sh`)

**Purpose**: Tests system resilience and business continuity procedures.

**What it tests**:
- Database failure and recovery scenarios
- Redis failure and recovery scenarios
- Microservice failure and recovery
- Network partition simulation
- Cascading failure scenarios
- Data consistency validation
- Backup system resilience during disasters
- RTO/RPO compliance testing

**Usage**:
```bash
npm run deploy:disaster-recovery
# or
./scripts/disaster-recovery-tests.sh
```

**Configuration**:
- `RTO_TARGET` - Recovery Time Objective in seconds (default: 300)
- `RPO_TARGET` - Recovery Point Objective in seconds (default: 60)

**Output**: `disaster-recovery-results/disaster-recovery-report.md`

## Master Test Suite

### Comprehensive Testing (`run-deployment-tests.sh`)

**Purpose**: Orchestrates all deployment and production readiness tests.

**Usage**:
```bash
npm run deploy:test
# or
./scripts/run-deployment-tests.sh
```

**Options**:
- `--help` - Show help information
- `--cleanup` - Clean up test artifacts and exit

**Output**: `deployment-test-results/deployment-readiness-report.md`

## Prerequisites

### Required Software
- Docker (latest version)
- Docker Compose (latest version)
- curl (for HTTP testing)
- jq (for JSON parsing)
- wscat (for WebSocket testing, optional)

### Optional Tools
- Trivy (for container vulnerability scanning)
- Docker Scout (for additional security insights)

### Installation Commands

**macOS (Homebrew)**:
```bash
brew install docker docker-compose curl jq
brew install aquasecurity/trivy/trivy
npm install -g wscat
```

**Ubuntu/Debian**:
```bash
sudo apt-get update
sudo apt-get install docker.io docker-compose curl jq
curl -sfL https://raw.githubusercontent.com/aquasecurity/trivy/main/contrib/install.sh | sh -s -- -b /usr/local/bin
npm install -g wscat
```

## Running Tests

### Individual Test Suites

Run specific test suites individually:

```bash
# Security scanning
npm run deploy:security-scan

# Blue-green deployment testing
npm run deploy:blue-green

# Production smoke tests
npm run deploy:smoke-tests

# Monitoring validation
npm run deploy:monitoring

# Backup and restore testing
npm run deploy:backup-restore

# Disaster recovery testing
npm run deploy:disaster-recovery
```

### Complete Test Suite

Run all deployment tests:

```bash
npm run deploy:test
```

### Cleanup

Clean up all test artifacts:

```bash
npm run deploy:cleanup
```

## Test Results

### Report Locations

Each test suite generates detailed reports in dedicated directories:

- `security-scan-results/` - Security scan reports and vulnerability data
- `deployment-test-results/` - Blue-green deployment test results
- `production-smoke-results/` - Smoke test results and performance metrics
- `monitoring-validation-results/` - Monitoring infrastructure validation
- `backup-restore-results/` - Backup and restore test results
- `disaster-recovery-results/` - Disaster recovery test results

### Master Report

The comprehensive deployment readiness report is generated at:
`deployment-test-results/deployment-readiness-report.md`

This report includes:
- Executive summary with pass/fail status
- Detailed results from each test suite
- Production readiness checklist
- Critical issues and recommendations
- Compliance and governance information

## CI/CD Integration

### GitHub Actions

Add to your `.github/workflows/deployment-tests.yml`:

```yaml
name: Deployment Tests

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  deployment-tests:
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Set up Node.js
      uses: actions/setup-node@v3
      with:
        node-version: '18'
    
    - name: Install dependencies
      run: |
        cd backend
        npm install
    
    - name: Run deployment tests
      run: |
        cd backend
        npm run deploy:test
    
    - name: Upload test results
      uses: actions/upload-artifact@v3
      if: always()
      with:
        name: deployment-test-results
        path: backend/deployment-test-results/
```

### Jenkins Pipeline

Add to your `Jenkinsfile`:

```groovy
pipeline {
    agent any
    
    stages {
        stage('Deployment Tests') {
            steps {
                dir('backend') {
                    sh 'npm install'
                    sh 'npm run deploy:test'
                }
            }
            post {
                always {
                    archiveArtifacts artifacts: 'backend/deployment-test-results/**/*', fingerprint: true
                    publishHTML([
                        allowMissing: false,
                        alwaysLinkToLastBuild: true,
                        keepAll: true,
                        reportDir: 'backend/deployment-test-results',
                        reportFiles: 'deployment-readiness-report.md',
                        reportName: 'Deployment Readiness Report'
                    ])
                }
            }
        }
    }
}
```

## Production Deployment Checklist

Before deploying to production, ensure:

### ✅ Security
- [ ] All container security scans pass
- [ ] No critical vulnerabilities found
- [ ] Secrets management configured
- [ ] SSL/TLS certificates installed
- [ ] Network security rules implemented

### ✅ Deployment
- [ ] Blue-green deployment tests pass
- [ ] Zero-downtime deployment validated
- [ ] Rollback procedures tested
- [ ] Environment configuration verified
- [ ] CI/CD pipeline configured

### ✅ Monitoring
- [ ] All monitoring services healthy
- [ ] Metrics collection validated
- [ ] Alert rules configured and tested
- [ ] Dashboards accessible
- [ ] Log aggregation working

### ✅ Data Protection
- [ ] Backup procedures tested and working
- [ ] Restore procedures validated
- [ ] Backup encryption enabled
- [ ] Cross-region replication configured
- [ ] Data retention policies implemented

### ✅ Business Continuity
- [ ] Disaster recovery procedures tested
- [ ] RTO/RPO targets met
- [ ] Failover procedures documented
- [ ] Communication plans established
- [ ] Recovery runbooks created

### ✅ Performance
- [ ] Production smoke tests pass
- [ ] Performance benchmarks established
- [ ] Load testing completed
- [ ] Auto-scaling configured
- [ ] Capacity planning completed

## Troubleshooting

### Common Issues

**Docker containers not starting**:
```bash
# Check Docker service
sudo systemctl status docker

# Check container logs
docker-compose logs -f

# Restart Docker services
docker-compose down && docker-compose up -d
```

**Permission denied errors**:
```bash
# Make scripts executable
chmod +x backend/scripts/*.sh

# Check Docker permissions
sudo usermod -aG docker $USER
```

**Test timeouts**:
```bash
# Increase timeout values in scripts
export TIMEOUT=60

# Check system resources
docker stats
```

**Network connectivity issues**:
```bash
# Check Docker networks
docker network ls

# Inspect network configuration
docker network inspect tradeflow-network
```

### Getting Help

1. Check the detailed test logs in each result directory
2. Review the master deployment readiness report
3. Consult individual test suite documentation
4. Check Docker container logs for service-specific issues
5. Verify environment variables and configuration

## Best Practices

### Regular Testing
- Run deployment tests before every production deployment
- Schedule weekly comprehensive testing
- Include deployment tests in CI/CD pipeline
- Test disaster recovery procedures monthly

### Monitoring
- Set up alerts for test failures
- Monitor test execution times
- Track test success rates over time
- Review and update test scenarios regularly

### Documentation
- Keep runbooks updated based on test results
- Document any test customizations
- Maintain environment-specific configurations
- Update procedures based on lessons learned

### Security
- Regularly update security scanning tools
- Review and address security findings promptly
- Test security procedures during deployments
- Maintain security compliance documentation

---

For more information, see the individual test script documentation and the generated test reports.