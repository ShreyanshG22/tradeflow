#!/bin/bash

# Monitoring and Alerting System Validation Tests for TradeFlow Backend

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
TEST_RESULTS_DIR="$PROJECT_ROOT/monitoring-validation-results"

# Configuration
PROMETHEUS_URL=${PROMETHEUS_URL:-"http://localhost:9090"}
GRAFANA_URL=${GRAFANA_URL:-"http://localhost:3001"}
ALERTMANAGER_URL=${ALERTMANAGER_URL:-"http://localhost:9093"}
ELASTICSEARCH_URL=${ELASTICSEARCH_URL:-"http://localhost:9200"}
KIBANA_URL=${KIBANA_URL:-"http://localhost:5601"}

echo -e "${GREEN}📊 Monitoring and Alerting System Validation${NC}"
echo -e "${BLUE}Testing monitoring infrastructure and alerting capabilities...${NC}"

# Create results directory
mkdir -p "$TEST_RESULTS_DIR"

# Function to log with timestamp
log() {
    echo -e "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$TEST_RESULTS_DIR/monitoring-validation.log"
}

# Function to make HTTP request with timeout
make_request() {
    local url=$1
    local method=${2:-GET}
    local data=${3:-""}
    local timeout=${4:-10}
    
    if [ -n "$data" ]; then
        curl -s -X "$method" "$url" \
            -H "Content-Type: application/json" \
            -d "$data" \
            --max-time $timeout 2>/dev/null || echo "ERROR"
    else
        curl -s -X "$method" "$url" \
            --max-time $timeout 2>/dev/null || echo "ERROR"
    fi
}

# Function to test Prometheus
test_prometheus() {
    log "${BLUE}Testing Prometheus monitoring...${NC}"
    
    # Test Prometheus health
    local prometheus_health=$(make_request "$PROMETHEUS_URL/-/healthy")
    
    if [ "$prometheus_health" = "Prometheus is Healthy." ]; then
        log "${GREEN}✅ Prometheus is healthy${NC}"
    else
        log "${RED}❌ Prometheus health check failed${NC}"
        return 1
    fi
    
    # Test Prometheus API
    local prometheus_config=$(make_request "$PROMETHEUS_URL/api/v1/status/config")
    
    if echo "$prometheus_config" | jq . &>/dev/null; then
        log "${GREEN}✅ Prometheus API is accessible${NC}"
    else
        log "${RED}❌ Prometheus API is not accessible${NC}"
        return 1
    fi
    
    # Test metrics collection
    local metrics_query="up"
    local metrics_response=$(make_request "$PROMETHEUS_URL/api/v1/query?query=$metrics_query")
    
    if echo "$metrics_response" | jq '.data.result | length' &>/dev/null; then
        local metric_count=$(echo "$metrics_response" | jq '.data.result | length')
        log "${GREEN}✅ Prometheus collecting metrics from $metric_count targets${NC}"
        
        # Save metrics for analysis
        echo "$metrics_response" > "$TEST_RESULTS_DIR/prometheus-metrics.json"
    else
        log "${RED}❌ Prometheus metrics query failed${NC}"
        return 1
    fi
    
    # Test specific TradeFlow metrics
    local tradeflow_metrics=(
        "tradeflow_api_requests_total"
        "tradeflow_database_connections"
        "tradeflow_redis_operations_total"
        "tradeflow_trading_engine_latency"
        "tradeflow_strategy_executions_total"
    )
    
    local found_metrics=0
    for metric in "${tradeflow_metrics[@]}"; do
        local metric_response=$(make_request "$PROMETHEUS_URL/api/v1/query?query=$metric")
        
        if echo "$metric_response" | jq '.data.result | length' &>/dev/null && \
           [ "$(echo "$metric_response" | jq '.data.result | length')" -gt 0 ]; then
            log "${GREEN}✅ Found metric: $metric${NC}"
            ((found_metrics++))
        else
            log "${YELLOW}⚠️  Metric not found: $metric${NC}"
        fi
    done
    
    log "${BLUE}Found $found_metrics/${#tradeflow_metrics[@]} TradeFlow-specific metrics${NC}"
    
    return 0
}

# Function to test Grafana
test_grafana() {
    log "${BLUE}Testing Grafana dashboards...${NC}"
    
    # Test Grafana health
    local grafana_health=$(make_request "$GRAFANA_URL/api/health")
    
    if echo "$grafana_health" | jq '.database' &>/dev/null; then
        local db_status=$(echo "$grafana_health" | jq -r '.database')
        log "${GREEN}✅ Grafana is healthy (DB: $db_status)${NC}"
    else
        log "${RED}❌ Grafana health check failed${NC}"
        return 1
    fi
    
    # Test Grafana API (without authentication for basic check)
    local grafana_datasources=$(make_request "$GRAFANA_URL/api/datasources")
    
    if echo "$grafana_datasources" | jq . &>/dev/null; then
        local datasource_count=$(echo "$grafana_datasources" | jq 'length')
        log "${GREEN}✅ Grafana has $datasource_count configured datasources${NC}"
    else
        log "${YELLOW}⚠️  Grafana datasources check failed (may require authentication)${NC}"
    fi
    
    # Test dashboard availability
    local grafana_dashboards=$(make_request "$GRAFANA_URL/api/search?type=dash-db")
    
    if echo "$grafana_dashboards" | jq . &>/dev/null; then
        local dashboard_count=$(echo "$grafana_dashboards" | jq 'length')
        log "${GREEN}✅ Grafana has $dashboard_count dashboards${NC}"
        
        # Save dashboard info
        echo "$grafana_dashboards" > "$TEST_RESULTS_DIR/grafana-dashboards.json"
    else
        log "${YELLOW}⚠️  Grafana dashboards check failed (may require authentication)${NC}"
    fi
    
    return 0
}

# Function to test Alertmanager
test_alertmanager() {
    log "${BLUE}Testing Alertmanager...${NC}"
    
    # Test Alertmanager health
    local alertmanager_health=$(make_request "$ALERTMANAGER_URL/-/healthy")
    
    if [ "$alertmanager_health" = "OK" ]; then
        log "${GREEN}✅ Alertmanager is healthy${NC}"
    else
        log "${RED}❌ Alertmanager health check failed${NC}"
        return 1
    fi
    
    # Test Alertmanager API
    local alertmanager_status=$(make_request "$ALERTMANAGER_URL/api/v1/status")
    
    if echo "$alertmanager_status" | jq . &>/dev/null; then
        log "${GREEN}✅ Alertmanager API is accessible${NC}"
        
        local version=$(echo "$alertmanager_status" | jq -r '.data.versionInfo.version // "unknown"')
        log "${BLUE}  Alertmanager version: $version${NC}"
    else
        log "${RED}❌ Alertmanager API is not accessible${NC}"
        return 1
    fi
    
    # Test alert configuration
    local alertmanager_config=$(make_request "$ALERTMANAGER_URL/api/v1/status")
    
    if echo "$alertmanager_config" | jq '.data.configYAML' &>/dev/null; then
        log "${GREEN}✅ Alertmanager configuration is loaded${NC}"
    else
        log "${YELLOW}⚠️  Alertmanager configuration check failed${NC}"
    fi
    
    # Test current alerts
    local current_alerts=$(make_request "$ALERTMANAGER_URL/api/v1/alerts")
    
    if echo "$current_alerts" | jq . &>/dev/null; then
        local alert_count=$(echo "$current_alerts" | jq '.data | length')
        log "${BLUE}Current active alerts: $alert_count${NC}"
        
        # Save alerts for analysis
        echo "$current_alerts" > "$TEST_RESULTS_DIR/current-alerts.json"
    else
        log "${YELLOW}⚠️  Failed to retrieve current alerts${NC}"
    fi
    
    return 0
}

# Function to test Elasticsearch
test_elasticsearch() {
    log "${BLUE}Testing Elasticsearch logging...${NC}"
    
    # Test Elasticsearch health
    local es_health=$(make_request "$ELASTICSEARCH_URL/_cluster/health")
    
    if echo "$es_health" | jq . &>/dev/null; then
        local cluster_status=$(echo "$es_health" | jq -r '.status')
        local node_count=$(echo "$es_health" | jq -r '.number_of_nodes')
        
        log "${GREEN}✅ Elasticsearch cluster is $cluster_status with $node_count nodes${NC}"
        
        # Save cluster info
        echo "$es_health" > "$TEST_RESULTS_DIR/elasticsearch-health.json"
    else
        log "${RED}❌ Elasticsearch health check failed${NC}"
        return 1
    fi
    
    # Test indices
    local es_indices=$(make_request "$ELASTICSEARCH_URL/_cat/indices?format=json")
    
    if echo "$es_indices" | jq . &>/dev/null; then
        local index_count=$(echo "$es_indices" | jq 'length')
        log "${GREEN}✅ Elasticsearch has $index_count indices${NC}"
        
        # Check for TradeFlow-specific indices
        local tradeflow_indices=$(echo "$es_indices" | jq -r '.[].index' | grep -c "tradeflow" || echo "0")
        log "${BLUE}TradeFlow-specific indices: $tradeflow_indices${NC}"
        
        # Save indices info
        echo "$es_indices" > "$TEST_RESULTS_DIR/elasticsearch-indices.json"
    else
        log "${YELLOW}⚠️  Failed to retrieve Elasticsearch indices${NC}"
    fi
    
    # Test log ingestion
    local recent_logs=$(make_request "$ELASTICSEARCH_URL/tradeflow-*/_search?size=10&sort=@timestamp:desc")
    
    if echo "$recent_logs" | jq . &>/dev/null; then
        local hit_count=$(echo "$recent_logs" | jq '.hits.total.value // .hits.total')
        log "${GREEN}✅ Found $hit_count recent log entries${NC}"
    else
        log "${YELLOW}⚠️  No recent logs found or search failed${NC}"
    fi
    
    return 0
}

# Function to test Kibana
test_kibana() {
    log "${BLUE}Testing Kibana dashboards...${NC}"
    
    # Test Kibana health
    local kibana_health=$(make_request "$KIBANA_URL/api/status")
    
    if echo "$kibana_health" | jq . &>/dev/null; then
        local overall_status=$(echo "$kibana_health" | jq -r '.status.overall.state // "unknown"')
        log "${GREEN}✅ Kibana status: $overall_status${NC}"
    else
        log "${RED}❌ Kibana health check failed${NC}"
        return 1
    fi
    
    # Test Kibana spaces
    local kibana_spaces=$(make_request "$KIBANA_URL/api/spaces/space")
    
    if echo "$kibana_spaces" | jq . &>/dev/null; then
        local space_count=$(echo "$kibana_spaces" | jq 'length')
        log "${GREEN}✅ Kibana has $space_count configured spaces${NC}"
    else
        log "${YELLOW}⚠️  Kibana spaces check failed${NC}"
    fi
    
    return 0
}

# Function to test alert rules
test_alert_rules() {
    log "${BLUE}Testing Prometheus alert rules...${NC}"
    
    # Get alert rules from Prometheus
    local alert_rules=$(make_request "$PROMETHEUS_URL/api/v1/rules")
    
    if echo "$alert_rules" | jq . &>/dev/null; then
        local rule_groups=$(echo "$alert_rules" | jq '.data.groups | length')
        log "${GREEN}✅ Prometheus has $rule_groups rule groups${NC}"
        
        # Count total alert rules
        local total_rules=$(echo "$alert_rules" | jq '[.data.groups[].rules[] | select(.type == "alerting")] | length')
        log "${BLUE}Total alert rules: $total_rules${NC}"
        
        # Check for TradeFlow-specific alerts
        local tradeflow_alerts=$(echo "$alert_rules" | jq '[.data.groups[].rules[] | select(.type == "alerting" and (.alert | test("TradeFlow|tradeflow"; "i")))] | length')
        log "${BLUE}TradeFlow-specific alerts: $tradeflow_alerts${NC}"
        
        # Save alert rules
        echo "$alert_rules" > "$TEST_RESULTS_DIR/prometheus-alert-rules.json"
        
        # Check for critical alerts
        local critical_alerts=(
            "HighErrorRate"
            "DatabaseDown"
            "RedisDown"
            "HighLatency"
            "DiskSpaceLow"
            "MemoryUsageHigh"
        )
        
        local found_critical=0
        for alert in "${critical_alerts[@]}"; do
            if echo "$alert_rules" | jq -e ".data.groups[].rules[] | select(.alert == \"$alert\")" &>/dev/null; then
                log "${GREEN}✅ Found critical alert: $alert${NC}"
                ((found_critical++))
            else
                log "${YELLOW}⚠️  Missing critical alert: $alert${NC}"
            fi
        done
        
        log "${BLUE}Found $found_critical/${#critical_alerts[@]} critical alerts${NC}"
    else
        log "${RED}❌ Failed to retrieve Prometheus alert rules${NC}"
        return 1
    fi
    
    return 0
}

# Function to simulate alert conditions
simulate_alert_conditions() {
    log "${BLUE}Simulating alert conditions...${NC}"
    
    # Test 1: Simulate high error rate
    log "${YELLOW}Simulating high error rate...${NC}"
    
    # Make multiple failing requests to trigger error rate alert
    for i in {1..10}; do
        make_request "http://localhost:3000/api/nonexistent-endpoint" "GET" "" "5" &>/dev/null &
    done
    wait
    
    sleep 30 # Wait for metrics to be scraped
    
    # Check if alert was triggered
    local error_rate_query="rate(tradeflow_api_requests_total{status=~\"4..|5..\"}[5m])"
    local error_rate_result=$(make_request "$PROMETHEUS_URL/api/v1/query?query=$(echo $error_rate_query | sed 's/ /%20/g')")
    
    if echo "$error_rate_result" | jq '.data.result | length' &>/dev/null && \
       [ "$(echo "$error_rate_result" | jq '.data.result | length')" -gt 0 ]; then
        log "${GREEN}✅ Error rate metrics are being collected${NC}"
    else
        log "${YELLOW}⚠️  Error rate metrics not found${NC}"
    fi
    
    # Test 2: Check for firing alerts
    log "${YELLOW}Checking for firing alerts...${NC}"
    
    local firing_alerts=$(make_request "$PROMETHEUS_URL/api/v1/alerts")
    
    if echo "$firing_alerts" | jq . &>/dev/null; then
        local firing_count=$(echo "$firing_alerts" | jq '[.data.alerts[] | select(.state == "firing")] | length')
        log "${BLUE}Currently firing alerts: $firing_count${NC}"
        
        if [ "$firing_count" -gt 0 ]; then
            log "${GREEN}✅ Alert system is responsive to conditions${NC}"
        else
            log "${BLUE}ℹ️  No alerts currently firing (system is healthy)${NC}"
        fi
        
        # Save firing alerts
        echo "$firing_alerts" > "$TEST_RESULTS_DIR/firing-alerts.json"
    else
        log "${YELLOW}⚠️  Failed to retrieve firing alerts${NC}"
    fi
    
    return 0
}

# Function to test notification channels
test_notification_channels() {
    log "${BLUE}Testing notification channels...${NC}"
    
    # Test webhook notification (if configured)
    local webhook_url="http://localhost:3000/api/webhooks/test-alert"
    local test_alert='{
        "receiver": "test-webhook",
        "status": "firing",
        "alerts": [{
            "status": "firing",
            "labels": {
                "alertname": "TestAlert",
                "severity": "warning"
            },
            "annotations": {
                "summary": "Test alert for monitoring validation"
            }
        }]
    }'
    
    local webhook_response=$(make_request "$webhook_url" "POST" "$test_alert" "10")
    
    if [ "$webhook_response" != "ERROR" ]; then
        log "${GREEN}✅ Webhook notification channel is accessible${NC}"
    else
        log "${YELLOW}⚠️  Webhook notification channel test failed${NC}"
    fi
    
    # Test email configuration (check Alertmanager config)
    local am_config=$(make_request "$ALERTMANAGER_URL/api/v1/status")
    
    if echo "$am_config" | jq '.data.configYAML' | grep -q "smtp"; then
        log "${GREEN}✅ SMTP email configuration found${NC}"
    else
        log "${YELLOW}⚠️  No SMTP email configuration found${NC}"
    fi
    
    return 0
}

# Function to generate monitoring validation report
generate_report() {
    local total_tests=$1
    local passed_tests=$2
    local failed_tests=$3
    
    log "${YELLOW}Generating monitoring validation report...${NC}"
    
    cat > "$TEST_RESULTS_DIR/monitoring-validation-report.md" << EOF
# Monitoring and Alerting Validation Report

Generated: $(date)

## Test Summary
- Total Tests: $total_tests
- Passed: $passed_tests
- Failed: $failed_tests
- Success Rate: $(( passed_tests * 100 / total_tests ))%

## Monitoring Infrastructure Status
- Prometheus: $(grep "Prometheus is healthy" "$TEST_RESULTS_DIR/monitoring-validation.log" &>/dev/null && echo "✅ Healthy" || echo "❌ Issues")
- Grafana: $(grep "Grafana is healthy" "$TEST_RESULTS_DIR/monitoring-validation.log" &>/dev/null && echo "✅ Healthy" || echo "❌ Issues")
- Alertmanager: $(grep "Alertmanager is healthy" "$TEST_RESULTS_DIR/monitoring-validation.log" &>/dev/null && echo "✅ Healthy" || echo "❌ Issues")
- Elasticsearch: $(grep "Elasticsearch cluster" "$TEST_RESULTS_DIR/monitoring-validation.log" &>/dev/null && echo "✅ Healthy" || echo "❌ Issues")
- Kibana: $(grep "Kibana status" "$TEST_RESULTS_DIR/monitoring-validation.log" &>/dev/null && echo "✅ Healthy" || echo "❌ Issues")

## Metrics Collection
$(grep "collecting metrics from" "$TEST_RESULTS_DIR/monitoring-validation.log" | sed 's/.*] /- /')
$(grep "TradeFlow-specific metrics" "$TEST_RESULTS_DIR/monitoring-validation.log" | sed 's/.*] /- /')

## Alert Configuration
$(grep "rule groups\|alert rules\|critical alerts" "$TEST_RESULTS_DIR/monitoring-validation.log" | sed 's/.*] /- /')

## Log Management
$(grep "Elasticsearch has\|TradeFlow-specific indices\|recent log entries" "$TEST_RESULTS_DIR/monitoring-validation.log" | sed 's/.*] /- /')

## Notification Channels
$(grep "notification channel" "$TEST_RESULTS_DIR/monitoring-validation.log" | sed 's/.*] /- /')

## Files Generated
- monitoring-validation.log - Detailed test execution log
- prometheus-metrics.json - Prometheus metrics data
- grafana-dashboards.json - Grafana dashboard information
- current-alerts.json - Current active alerts
- elasticsearch-health.json - Elasticsearch cluster health
- elasticsearch-indices.json - Elasticsearch indices information
- prometheus-alert-rules.json - Prometheus alert rules
- firing-alerts.json - Currently firing alerts

## Recommendations
$(if [ $failed_tests -gt 0 ]; then
    echo "1. Investigate failed monitoring components immediately"
    echo "2. Check service logs for error details"
    echo "3. Verify network connectivity between monitoring services"
fi)
$(if grep -q "Missing critical alert" "$TEST_RESULTS_DIR/monitoring-validation.log"; then
    echo "4. Configure missing critical alerts"
    echo "5. Review alert thresholds and conditions"
fi)
6. Set up regular monitoring validation tests
7. Implement monitoring for monitoring (meta-monitoring)
8. Test alert notification delivery end-to-end
9. Create runbooks for common alert scenarios

## Next Steps
1. Fix any failed monitoring components
2. Configure missing alerts and dashboards
3. Test notification delivery to actual channels
4. Set up automated monitoring validation
5. Train team on monitoring tools and procedures
EOF
}

# Main test execution
main() {
    log "${GREEN}🚀 Starting Monitoring and Alerting Validation${NC}"
    
    local total_tests=0
    local passed_tests=0
    local failed_tests=0
    
    # Test 1: Prometheus
    log "\n${YELLOW}=== Prometheus Testing ===${NC}"
    ((total_tests++))
    if test_prometheus; then
        ((passed_tests++))
    else
        ((failed_tests++))
    fi
    
    # Test 2: Grafana
    log "\n${YELLOW}=== Grafana Testing ===${NC}"
    ((total_tests++))
    if test_grafana; then
        ((passed_tests++))
    else
        ((failed_tests++))
    fi
    
    # Test 3: Alertmanager
    log "\n${YELLOW}=== Alertmanager Testing ===${NC}"
    ((total_tests++))
    if test_alertmanager; then
        ((passed_tests++))
    else
        ((failed_tests++))
    fi
    
    # Test 4: Elasticsearch
    log "\n${YELLOW}=== Elasticsearch Testing ===${NC}"
    ((total_tests++))
    if test_elasticsearch; then
        ((passed_tests++))
    else
        ((failed_tests++))
    fi
    
    # Test 5: Kibana
    log "\n${YELLOW}=== Kibana Testing ===${NC}"
    ((total_tests++))
    if test_kibana; then
        ((passed_tests++))
    else
        ((failed_tests++))
    fi
    
    # Test 6: Alert Rules
    log "\n${YELLOW}=== Alert Rules Testing ===${NC}"
    ((total_tests++))
    if test_alert_rules; then
        ((passed_tests++))
    else
        ((failed_tests++))
    fi
    
    # Test 7: Alert Simulation
    log "\n${YELLOW}=== Alert Simulation ===${NC}"
    ((total_tests++))
    if simulate_alert_conditions; then
        ((passed_tests++))
    else
        ((failed_tests++))
    fi
    
    # Test 8: Notification Channels
    log "\n${YELLOW}=== Notification Channels ===${NC}"
    ((total_tests++))
    if test_notification_channels; then
        ((passed_tests++))
    else
        ((failed_tests++))
    fi
    
    # Generate report
    generate_report $total_tests $passed_tests $failed_tests
    
    # Final summary
    log "\n${GREEN}🎉 Monitoring and Alerting Validation Completed!${NC}"
    log "${BLUE}Results: $passed_tests/$total_tests tests passed${NC}"
    log "${BLUE}Report saved to: $TEST_RESULTS_DIR/monitoring-validation-report.md${NC}"
    
    if [ $failed_tests -eq 0 ]; then
        log "${GREEN}✅ All monitoring validation tests passed${NC}"
        exit 0
    else
        log "${RED}❌ $failed_tests tests failed - Monitoring system needs attention${NC}"
        exit 1
    fi
}

# Run main function
main "$@"