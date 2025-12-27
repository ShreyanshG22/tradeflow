#!/bin/bash

# TradeFlow Test Metrics Collection and Historical Tracking System
# Collects, stores, and analyzes test metrics over time

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
BACKEND_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
METRICS_DIR="$BACKEND_DIR/test-metrics"
HISTORICAL_DIR="$METRICS_DIR/historical"
REPORTS_DIR="$METRICS_DIR/reports"
DATABASE_FILE="$METRICS_DIR/test_metrics.db"

# Database connection (if available)
DATABASE_URL="${DATABASE_URL:-}"
INFLUXDB_URL="${INFLUXDB_URL:-}"
INFLUXDB_TOKEN="${INFLUXDB_TOKEN:-}"
INFLUXDB_ORG="${INFLUXDB_ORG:-tradeflow}"
INFLUXDB_BUCKET="${INFLUXDB_BUCKET:-test-metrics}"

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

# Function to setup directories and database
setup_storage() {
    print_status "Setting up metrics storage..."
    
    mkdir -p "$METRICS_DIR" "$HISTORICAL_DIR" "$REPORTS_DIR"
    
    # Create SQLite database for local storage
    if command -v sqlite3 >/dev/null 2>&1; then
        sqlite3 "$DATABASE_FILE" << 'EOF'
CREATE TABLE IF NOT EXISTS test_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT NOT NULL,
    commit_hash TEXT,
    branch TEXT,
    trigger_event TEXT,
    build_number INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS test_suites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    test_run_id INTEGER,
    suite_name TEXT NOT NULL,
    suite_type TEXT, -- unit, integration, functional, performance, security
    status TEXT, -- passed, failed, skipped
    duration_ms INTEGER,
    test_count INTEGER,
    passed_count INTEGER,
    failed_count INTEGER,
    skipped_count INTEGER,
    coverage_percent REAL,
    FOREIGN KEY (test_run_id) REFERENCES test_runs (id)
);

CREATE TABLE IF NOT EXISTS test_cases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    test_suite_id INTEGER,
    test_name TEXT NOT NULL,
    status TEXT, -- passed, failed, skipped
    duration_ms INTEGER,
    error_message TEXT,
    FOREIGN KEY (test_suite_id) REFERENCES test_suites (id)
);

CREATE TABLE IF NOT EXISTS performance_metrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    test_run_id INTEGER,
    metric_name TEXT NOT NULL,
    metric_value REAL,
    metric_unit TEXT,
    component TEXT, -- trading-engine, backtest-engine, etc.
    FOREIGN KEY (test_run_id) REFERENCES test_runs (id)
);

CREATE TABLE IF NOT EXISTS coverage_metrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    test_run_id INTEGER,
    service_name TEXT NOT NULL,
    lines_covered INTEGER,
    lines_total INTEGER,
    functions_covered INTEGER,
    functions_total INTEGER,
    branches_covered INTEGER,
    branches_total INTEGER,
    coverage_percent REAL,
    FOREIGN KEY (test_run_id) REFERENCES test_runs (id)
);

CREATE INDEX IF NOT EXISTS idx_test_runs_timestamp ON test_runs(timestamp);
CREATE INDEX IF NOT EXISTS idx_test_runs_commit ON test_runs(commit_hash);
CREATE INDEX IF NOT EXISTS idx_test_suites_run ON test_suites(test_run_id);
CREATE INDEX IF NOT EXISTS idx_performance_metrics_run ON performance_metrics(test_run_id);
CREATE INDEX IF NOT EXISTS idx_coverage_metrics_run ON coverage_metrics(test_run_id);
EOF
        print_success "SQLite database initialized"
    fi
}

# Function to collect test metrics from various sources
collect_test_metrics() {
    print_status "Collecting test metrics..."
    
    local timestamp=$(date -u +%Y-%m-%dT%H:%M:%SZ)
    local commit_hash="${GITHUB_SHA:-$(git rev-parse HEAD 2>/dev/null || echo 'unknown')}"
    local branch="${GITHUB_REF_NAME:-$(git branch --show-current 2>/dev/null || echo 'unknown')}"
    local trigger_event="${GITHUB_EVENT_NAME:-manual}"
    local build_number="${GITHUB_RUN_NUMBER:-0}"
    
    # Create test run record
    local test_run_id
    if command -v sqlite3 >/dev/null 2>&1; then
        test_run_id=$(sqlite3 "$DATABASE_FILE" "
            INSERT INTO test_runs (timestamp, commit_hash, branch, trigger_event, build_number)
            VALUES ('$timestamp', '$commit_hash', '$branch', '$trigger_event', $build_number);
            SELECT last_insert_rowid();
        ")
    else
        test_run_id=$(date +%s)
    fi
    
    # Collect Node.js test metrics
    collect_nodejs_metrics "$test_run_id"
    
    # Collect C++ test metrics
    collect_cpp_metrics "$test_run_id"
    
    # Collect integration test metrics
    collect_integration_metrics "$test_run_id"
    
    # Collect performance metrics
    collect_performance_metrics "$test_run_id"
    
    # Collect coverage metrics
    collect_coverage_metrics "$test_run_id"
    
    # Create JSON summary
    create_metrics_summary "$test_run_id" "$timestamp" "$commit_hash" "$branch"
    
    print_success "Test metrics collection completed for run ID: $test_run_id"
}

# Function to collect Node.js service test metrics
collect_nodejs_metrics() {
    local test_run_id="$1"
    
    print_status "Collecting Node.js test metrics..."
    
    local services=("user-service" "api-gateway" "market-data-service" "strategy-service" "portfolio-service" "monitoring-service")
    
    for service in "${services[@]}"; do
        local service_dir="$BACKEND_DIR/services/$service"
        
        if [ ! -d "$service_dir" ]; then
            continue
        fi
        
        # Check for Jest test results
        local jest_results="$service_dir/test-results.json"
        if [ -f "$jest_results" ]; then
            local suite_status=$(jq -r '.success' "$jest_results" 2>/dev/null || echo "unknown")
            local test_count=$(jq -r '.numTotalTests' "$jest_results" 2>/dev/null || echo "0")
            local passed_count=$(jq -r '.numPassedTests' "$jest_results" 2>/dev/null || echo "0")
            local failed_count=$(jq -r '.numFailedTests' "$jest_results" 2>/dev/null || echo "0")
            local duration_ms=$(jq -r '.testResults[0].perfStats.runtime' "$jest_results" 2>/dev/null || echo "0")
            
            # Insert test suite record
            if command -v sqlite3 >/dev/null 2>&1; then
                sqlite3 "$DATABASE_FILE" "
                    INSERT INTO test_suites (test_run_id, suite_name, suite_type, status, duration_ms, test_count, passed_count, failed_count, skipped_count)
                    VALUES ($test_run_id, '$service', 'unit', '$([ "$suite_status" = "true" ] && echo "passed" || echo "failed")', $duration_ms, $test_count, $passed_count, $failed_count, 0);
                "
            fi
        fi
        
        # Check for coverage data
        local coverage_summary="$service_dir/coverage/coverage-summary.json"
        if [ -f "$coverage_summary" ]; then
            local lines_covered=$(jq -r '.total.lines.covered' "$coverage_summary" 2>/dev/null || echo "0")
            local lines_total=$(jq -r '.total.lines.total' "$coverage_summary" 2>/dev/null || echo "0")
            local functions_covered=$(jq -r '.total.functions.covered' "$coverage_summary" 2>/dev/null || echo "0")
            local functions_total=$(jq -r '.total.functions.total' "$coverage_summary" 2>/dev/null || echo "0")
            local branches_covered=$(jq -r '.total.branches.covered' "$coverage_summary" 2>/dev/null || echo "0")
            local branches_total=$(jq -r '.total.branches.total' "$coverage_summary" 2>/dev/null || echo "0")
            local coverage_percent=$(jq -r '.total.lines.pct' "$coverage_summary" 2>/dev/null || echo "0")
            
            # Insert coverage record
            if command -v sqlite3 >/dev/null 2>&1; then
                sqlite3 "$DATABASE_FILE" "
                    INSERT INTO coverage_metrics (test_run_id, service_name, lines_covered, lines_total, functions_covered, functions_total, branches_covered, branches_total, coverage_percent)
                    VALUES ($test_run_id, '$service', $lines_covered, $lines_total, $functions_covered, $functions_total, $branches_covered, $branches_total, $coverage_percent);
                "
            fi
        fi
    done
}

# Function to collect C++ test metrics
collect_cpp_metrics() {
    local test_run_id="$1"
    
    print_status "Collecting C++ test metrics..."
    
    local build_dir="$BACKEND_DIR/engines/build"
    
    # Check for CTest results
    local ctest_results="$build_dir/Testing/Temporary/LastTest.log"
    if [ -f "$ctest_results" ]; then
        local test_count=$(grep -c "Test #" "$ctest_results" 2>/dev/null || echo "0")
        local passed_count=$(grep -c "Passed" "$ctest_results" 2>/dev/null || echo "0")
        local failed_count=$(grep -c "Failed" "$ctest_results" 2>/dev/null || echo "0")
        
        # Insert C++ test suite record
        if command -v sqlite3 >/dev/null 2>&1; then
            sqlite3 "$DATABASE_FILE" "
                INSERT INTO test_suites (test_run_id, suite_name, suite_type, status, test_count, passed_count, failed_count, skipped_count)
                VALUES ($test_run_id, 'cpp-engines', 'unit', '$([ "$failed_count" -eq 0 ] && echo "passed" || echo "failed")', $test_count, $passed_count, $failed_count, 0);
            "
        fi
    fi
    
    # Check for Google Test XML results
    find "$build_dir" -name "*.xml" -path "*/test_detail.xml" 2>/dev/null | while read xml_file; do
        if [ -f "$xml_file" ] && command -v xmllint >/dev/null 2>&1; then
            local test_suite_name=$(xmllint --xpath "string(//testsuite/@name)" "$xml_file" 2>/dev/null || echo "unknown")
            local test_count=$(xmllint --xpath "string(//testsuite/@tests)" "$xml_file" 2>/dev/null || echo "0")
            local failed_count=$(xmllint --xpath "string(//testsuite/@failures)" "$xml_file" 2>/dev/null || echo "0")
            local duration_ms=$(xmllint --xpath "string(//testsuite/@time)" "$xml_file" 2>/dev/null | awk '{print int($1 * 1000)}')
            
            if command -v sqlite3 >/dev/null 2>&1; then
                sqlite3 "$DATABASE_FILE" "
                    INSERT INTO test_suites (test_run_id, suite_name, suite_type, status, duration_ms, test_count, failed_count)
                    VALUES ($test_run_id, '$test_suite_name', 'unit', '$([ "$failed_count" -eq 0 ] && echo "passed" || echo "failed")', ${duration_ms:-0}, $test_count, $failed_count);
                "
            fi
        fi
    done
}

# Function to collect integration test metrics
collect_integration_metrics() {
    local test_run_id="$1"
    
    print_status "Collecting integration test metrics..."
    
    # Check for integration test results
    local integration_report="$BACKEND_DIR/test-report.md"
    if [ -f "$integration_report" ]; then
        # Parse integration test results from markdown report
        local passed_services=$(grep -c "✅" "$integration_report" 2>/dev/null || echo "0")
        local failed_services=$(grep -c "❌" "$integration_report" 2>/dev/null || echo "0")
        
        if command -v sqlite3 >/dev/null 2>&1; then
            sqlite3 "$DATABASE_FILE" "
                INSERT INTO test_suites (test_run_id, suite_name, suite_type, status, test_count, passed_count, failed_count)
                VALUES ($test_run_id, 'integration-tests', 'integration', '$([ "$failed_services" -eq 0 ] && echo "passed" || echo "failed")', $((passed_services + failed_services)), $passed_services, $failed_services);
            "
        fi
    fi
}

# Function to collect performance metrics
collect_performance_metrics() {
    local test_run_id="$1"
    
    print_status "Collecting performance metrics..."
    
    local performance_dir="$BACKEND_DIR/performance-results"
    
    # Collect latency metrics
    if [ -f "$performance_dir/current/latency_results.txt" ]; then
        local avg_latency=$(grep -o 'Average latency: [0-9.]*' "$performance_dir/current/latency_results.txt" | grep -o '[0-9.]*' || echo "0")
        local p99_latency=$(grep -o 'P99 latency: [0-9.]*' "$performance_dir/current/latency_results.txt" | grep -o '[0-9.]*' || echo "0")
        
        if command -v sqlite3 >/dev/null 2>&1; then
            sqlite3 "$DATABASE_FILE" "
                INSERT INTO performance_metrics (test_run_id, metric_name, metric_value, metric_unit, component)
                VALUES 
                    ($test_run_id, 'average_latency', $avg_latency, 'microseconds', 'trading-engine'),
                    ($test_run_id, 'p99_latency', $p99_latency, 'microseconds', 'trading-engine');
            "
        fi
    fi
    
    # Collect throughput metrics
    if [ -f "$performance_dir/current/throughput_results.txt" ]; then
        local throughput=$(grep -o 'Throughput: [0-9]*' "$performance_dir/current/throughput_results.txt" | grep -o '[0-9]*' || echo "0")
        local max_throughput=$(grep -o 'Max throughput: [0-9]*' "$performance_dir/current/throughput_results.txt" | grep -o '[0-9]*' || echo "0")
        
        if command -v sqlite3 >/dev/null 2>&1; then
            sqlite3 "$DATABASE_FILE" "
                INSERT INTO performance_metrics (test_run_id, metric_name, metric_value, metric_unit, component)
                VALUES 
                    ($test_run_id, 'throughput', $throughput, 'ops_per_second', 'trading-engine'),
                    ($test_run_id, 'max_throughput', $max_throughput, 'ops_per_second', 'trading-engine');
            "
        fi
    fi
    
    # Collect memory metrics
    if [ -f "$performance_dir/current/memory_results.txt" ]; then
        local peak_memory=$(grep -o 'Peak memory: [0-9]*' "$performance_dir/current/memory_results.txt" | grep -o '[0-9]*' || echo "0")
        local avg_memory=$(grep -o 'Average memory: [0-9]*' "$performance_dir/current/memory_results.txt" | grep -o '[0-9]*' || echo "0")
        
        if command -v sqlite3 >/dev/null 2>&1; then
            sqlite3 "$DATABASE_FILE" "
                INSERT INTO performance_metrics (test_run_id, metric_name, metric_value, metric_unit, component)
                VALUES 
                    ($test_run_id, 'peak_memory', $peak_memory, 'megabytes', 'trading-engine'),
                    ($test_run_id, 'average_memory', $avg_memory, 'megabytes', 'trading-engine');
            "
        fi
    fi
}

# Function to collect coverage metrics
collect_coverage_metrics() {
    local test_run_id="$1"
    
    print_status "Collecting coverage metrics..."
    
    # This is handled in collect_nodejs_metrics, but we can add aggregate coverage here
    if command -v sqlite3 >/dev/null 2>&1; then
        local overall_coverage=$(sqlite3 "$DATABASE_FILE" "
            SELECT AVG(coverage_percent) FROM coverage_metrics WHERE test_run_id = $test_run_id;
        " 2>/dev/null || echo "0")
        
        # Store overall coverage as a performance metric
        sqlite3 "$DATABASE_FILE" "
            INSERT INTO performance_metrics (test_run_id, metric_name, metric_value, metric_unit, component)
            VALUES ($test_run_id, 'overall_coverage', $overall_coverage, 'percent', 'all-services');
        "
    fi
}

# Function to create metrics summary
create_metrics_summary() {
    local test_run_id="$1"
    local timestamp="$2"
    local commit_hash="$3"
    local branch="$4"
    
    print_status "Creating metrics summary..."
    
    local summary_file="$HISTORICAL_DIR/metrics_summary_$(date +%Y%m%d_%H%M%S).json"
    
    # Create comprehensive JSON summary
    cat > "$summary_file" << EOF
{
  "test_run_id": $test_run_id,
  "timestamp": "$timestamp",
  "commit_hash": "$commit_hash",
  "branch": "$branch",
  "trigger_event": "${GITHUB_EVENT_NAME:-manual}",
  "build_number": ${GITHUB_RUN_NUMBER:-0},
  "summary": {
EOF
    
    # Add test suite summaries
    if command -v sqlite3 >/dev/null 2>&1; then
        echo '    "test_suites": [' >> "$summary_file"
        sqlite3 "$DATABASE_FILE" "
            SELECT 
                '      {' ||
                '\"suite_name\": \"' || suite_name || '\", ' ||
                '\"suite_type\": \"' || suite_type || '\", ' ||
                '\"status\": \"' || status || '\", ' ||
                '\"test_count\": ' || COALESCE(test_count, 0) || ', ' ||
                '\"passed_count\": ' || COALESCE(passed_count, 0) || ', ' ||
                '\"failed_count\": ' || COALESCE(failed_count, 0) || ', ' ||
                '\"duration_ms\": ' || COALESCE(duration_ms, 0) || ', ' ||
                '\"coverage_percent\": ' || COALESCE(coverage_percent, 0) ||
                '},'
            FROM test_suites 
            WHERE test_run_id = $test_run_id;
        " | sed '$ s/,$//' >> "$summary_file"
        echo '    ],' >> "$summary_file"
        
        # Add performance metrics
        echo '    "performance_metrics": [' >> "$summary_file"
        sqlite3 "$DATABASE_FILE" "
            SELECT 
                '      {' ||
                '\"metric_name\": \"' || metric_name || '\", ' ||
                '\"metric_value\": ' || metric_value || ', ' ||
                '\"metric_unit\": \"' || metric_unit || '\", ' ||
                '\"component\": \"' || component || '\"' ||
                '},'
            FROM performance_metrics 
            WHERE test_run_id = $test_run_id;
        " | sed '$ s/,$//' >> "$summary_file"
        echo '    ],' >> "$summary_file"
        
        # Add coverage metrics
        echo '    "coverage_metrics": [' >> "$summary_file"
        sqlite3 "$DATABASE_FILE" "
            SELECT 
                '      {' ||
                '\"service_name\": \"' || service_name || '\", ' ||
                '\"coverage_percent\": ' || coverage_percent || ', ' ||
                '\"lines_covered\": ' || lines_covered || ', ' ||
                '\"lines_total\": ' || lines_total ||
                '},'
            FROM coverage_metrics 
            WHERE test_run_id = $test_run_id;
        " | sed '$ s/,$//' >> "$summary_file"
        echo '    ]' >> "$summary_file"
    else
        echo '    "test_suites": [],' >> "$summary_file"
        echo '    "performance_metrics": [],' >> "$summary_file"
        echo '    "coverage_metrics": []' >> "$summary_file"
    fi
    
    cat >> "$summary_file" << EOF
  },
  "environment": {
    "os": "$(uname -s)",
    "arch": "$(uname -m)",
    "node_version": "$(node --version 2>/dev/null || echo 'unknown')",
    "npm_version": "$(npm --version 2>/dev/null || echo 'unknown')",
    "cmake_version": "$(cmake --version 2>/dev/null | head -1 | grep -o '[0-9.]*' || echo 'unknown')",
    "gcc_version": "$(gcc --version 2>/dev/null | head -1 | grep -o '[0-9.]*' | head -1 || echo 'unknown')"
  }
}
EOF
    
    print_success "Metrics summary created: $summary_file"
}

# Function to send metrics to InfluxDB
send_to_influxdb() {
    if [ -z "$INFLUXDB_URL" ] || [ -z "$INFLUXDB_TOKEN" ]; then
        print_warning "InfluxDB configuration not found, skipping"
        return 0
    fi
    
    print_status "Sending metrics to InfluxDB..."
    
    local timestamp=$(date +%s)
    local commit_hash="${GITHUB_SHA:-$(git rev-parse HEAD 2>/dev/null || echo 'unknown')}"
    local branch="${GITHUB_REF_NAME:-$(git branch --show-current 2>/dev/null || echo 'unknown')}"
    
    # Prepare line protocol data
    local line_protocol=""
    
    # Add test suite metrics
    if command -v sqlite3 >/dev/null 2>&1; then
        while IFS='|' read -r suite_name suite_type status test_count passed_count failed_count duration_ms; do
            line_protocol+="test_suite,suite_name=$suite_name,suite_type=$suite_type,branch=$branch,commit=$commit_hash "
            line_protocol+="status=\"$status\",test_count=${test_count}i,passed_count=${passed_count}i,failed_count=${failed_count}i,duration_ms=${duration_ms}i "
            line_protocol+="$timestamp\n"
        done < <(sqlite3 "$DATABASE_FILE" "
            SELECT suite_name, suite_type, status, 
                   COALESCE(test_count, 0), COALESCE(passed_count, 0), 
                   COALESCE(failed_count, 0), COALESCE(duration_ms, 0)
            FROM test_suites 
            WHERE test_run_id = (SELECT MAX(id) FROM test_runs);
        " 2>/dev/null | tr '|' '|')
        
        # Add performance metrics
        while IFS='|' read -r metric_name metric_value metric_unit component; do
            line_protocol+="performance_metric,metric_name=$metric_name,component=$component,branch=$branch,commit=$commit_hash "
            line_protocol+="value=${metric_value},unit=\"$metric_unit\" "
            line_protocol+="$timestamp\n"
        done < <(sqlite3 "$DATABASE_FILE" "
            SELECT metric_name, metric_value, metric_unit, component
            FROM performance_metrics 
            WHERE test_run_id = (SELECT MAX(id) FROM test_runs);
        " 2>/dev/null | tr '|' '|')
        
        # Add coverage metrics
        while IFS='|' read -r service_name coverage_percent lines_covered lines_total; do
            line_protocol+="coverage_metric,service_name=$service_name,branch=$branch,commit=$commit_hash "
            line_protocol+="coverage_percent=${coverage_percent},lines_covered=${lines_covered}i,lines_total=${lines_total}i "
            line_protocol+="$timestamp\n"
        done < <(sqlite3 "$DATABASE_FILE" "
            SELECT service_name, coverage_percent, lines_covered, lines_total
            FROM coverage_metrics 
            WHERE test_run_id = (SELECT MAX(id) FROM test_runs);
        " 2>/dev/null | tr '|' '|')
    fi
    
    # Send to InfluxDB
    if [ -n "$line_protocol" ]; then
        echo -e "$line_protocol" | curl -X POST "$INFLUXDB_URL/api/v2/write?org=$INFLUXDB_ORG&bucket=$INFLUXDB_BUCKET" \
            -H "Authorization: Token $INFLUXDB_TOKEN" \
            -H "Content-Type: text/plain; charset=utf-8" \
            --data-binary @- || print_warning "Failed to send metrics to InfluxDB"
        
        print_success "Metrics sent to InfluxDB"
    fi
}

# Function to generate trend analysis report
generate_trend_report() {
    print_status "Generating trend analysis report..."
    
    local report_file="$REPORTS_DIR/trend_analysis_$(date +%Y%m%d).html"
    
    cat > "$report_file" << 'EOF'
<!DOCTYPE html>
<html>
<head>
    <title>TradeFlow Test Metrics Trends</title>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/date-fns@2.29.3/index.min.js"></script>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; background-color: #f5f5f5; }
        .container { max-width: 1200px; margin: 0 auto; background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .header { text-align: center; margin-bottom: 30px; }
        .metrics-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(400px, 1fr)); gap: 20px; margin-bottom: 30px; }
        .chart-container { background: #f9f9f9; padding: 15px; border-radius: 8px; }
        .chart-container h3 { margin-top: 0; color: #333; }
        .chart-canvas { width: 100%; height: 300px; }
        .summary-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-bottom: 30px; }
        .stat-card { background: #fff; border: 1px solid #ddd; border-radius: 8px; padding: 15px; text-align: center; }
        .stat-value { font-size: 2em; font-weight: bold; color: #2196F3; }
        .stat-label { color: #666; margin-top: 5px; }
        .trend-up { color: #4CAF50; }
        .trend-down { color: #f44336; }
        .trend-stable { color: #FF9800; }
        table { width: 100%; border-collapse: collapse; margin-top: 20px; }
        th, td { border: 1px solid #ddd; padding: 12px; text-align: left; }
        th { background-color: #f2f2f2; font-weight: bold; }
        .status-passed { color: #4CAF50; font-weight: bold; }
        .status-failed { color: #f44336; font-weight: bold; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>TradeFlow Test Metrics Trends</h1>
            <p>Generated: $(date)</p>
            <p>Analysis Period: Last 30 days</p>
        </div>
        
        <div class="summary-stats">
EOF
    
    # Add summary statistics
    if command -v sqlite3 >/dev/null 2>&1; then
        local total_runs=$(sqlite3 "$DATABASE_FILE" "SELECT COUNT(*) FROM test_runs WHERE timestamp > datetime('now', '-30 days');" 2>/dev/null || echo "0")
        local avg_coverage=$(sqlite3 "$DATABASE_FILE" "SELECT ROUND(AVG(coverage_percent), 1) FROM coverage_metrics cm JOIN test_runs tr ON cm.test_run_id = tr.id WHERE tr.timestamp > datetime('now', '-30 days');" 2>/dev/null || echo "0")
        local success_rate=$(sqlite3 "$DATABASE_FILE" "SELECT ROUND(AVG(CASE WHEN status = 'passed' THEN 100.0 ELSE 0.0 END), 1) FROM test_suites ts JOIN test_runs tr ON ts.test_run_id = tr.id WHERE tr.timestamp > datetime('now', '-30 days');" 2>/dev/null || echo "0")
        
        cat >> "$report_file" << EOF
            <div class="stat-card">
                <div class="stat-value">$total_runs</div>
                <div class="stat-label">Test Runs (30 days)</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">$avg_coverage%</div>
                <div class="stat-label">Average Coverage</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">$success_rate%</div>
                <div class="stat-label">Success Rate</div>
            </div>
EOF
    fi
    
    cat >> "$report_file" << 'EOF'
        </div>
        
        <div class="metrics-grid">
            <div class="chart-container">
                <h3>Test Success Rate Trend</h3>
                <canvas id="successRateChart" class="chart-canvas"></canvas>
            </div>
            
            <div class="chart-container">
                <h3>Coverage Trend</h3>
                <canvas id="coverageChart" class="chart-canvas"></canvas>
            </div>
            
            <div class="chart-container">
                <h3>Performance Latency Trend</h3>
                <canvas id="latencyChart" class="chart-canvas"></canvas>
            </div>
            
            <div class="chart-container">
                <h3>Throughput Trend</h3>
                <canvas id="throughputChart" class="chart-canvas"></canvas>
            </div>
        </div>
        
        <h2>Recent Test Runs</h2>
        <table>
            <thead>
                <tr>
                    <th>Date</th>
                    <th>Commit</th>
                    <th>Branch</th>
                    <th>Status</th>
                    <th>Coverage</th>
                    <th>Duration</th>
                    <th>Tests</th>
                </tr>
            </thead>
            <tbody>
EOF
    
    # Add recent test runs data
    if command -v sqlite3 >/dev/null 2>&1; then
        sqlite3 "$DATABASE_FILE" "
            SELECT 
                tr.timestamp,
                SUBSTR(tr.commit_hash, 1, 8),
                tr.branch,
                CASE 
                    WHEN COUNT(CASE WHEN ts.status = 'failed' THEN 1 END) > 0 THEN 'failed'
                    ELSE 'passed'
                END as overall_status,
                ROUND(AVG(cm.coverage_percent), 1) as avg_coverage,
                SUM(ts.duration_ms) as total_duration,
                SUM(ts.test_count) as total_tests
            FROM test_runs tr
            LEFT JOIN test_suites ts ON tr.id = ts.test_run_id
            LEFT JOIN coverage_metrics cm ON tr.id = cm.test_run_id
            WHERE tr.timestamp > datetime('now', '-30 days')
            GROUP BY tr.id
            ORDER BY tr.timestamp DESC
            LIMIT 20;
        " 2>/dev/null | while IFS='|' read -r timestamp commit branch status coverage duration tests; do
            local status_class="status-passed"
            if [ "$status" = "failed" ]; then
                status_class="status-failed"
            fi
            
            echo "                <tr>" >> "$report_file"
            echo "                    <td>$(echo "$timestamp" | cut -d'T' -f1)</td>" >> "$report_file"
            echo "                    <td>$commit</td>" >> "$report_file"
            echo "                    <td>$branch</td>" >> "$report_file"
            echo "                    <td class=\"$status_class\">$status</td>" >> "$report_file"
            echo "                    <td>${coverage:-N/A}%</td>" >> "$report_file"
            echo "                    <td>$(echo "scale=1; ${duration:-0} / 1000" | bc -l 2>/dev/null || echo "0")s</td>" >> "$report_file"
            echo "                    <td>${tests:-0}</td>" >> "$report_file"
            echo "                </tr>" >> "$report_file"
        done
    fi
    
    cat >> "$report_file" << 'EOF'
            </tbody>
        </table>
        
        <script>
            // Chart.js configuration for trends
            const chartOptions = {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: {
                        type: 'time',
                        time: {
                            unit: 'day'
                        }
                    },
                    y: {
                        beginAtZero: true
                    }
                }
            };
            
            // Success Rate Chart
            new Chart(document.getElementById('successRateChart'), {
                type: 'line',
                data: {
                    datasets: [{
                        label: 'Success Rate (%)',
                        data: [], // Would be populated with actual data
                        borderColor: '#4CAF50',
                        backgroundColor: 'rgba(76, 175, 80, 0.1)'
                    }]
                },
                options: chartOptions
            });
            
            // Coverage Chart
            new Chart(document.getElementById('coverageChart'), {
                type: 'line',
                data: {
                    datasets: [{
                        label: 'Coverage (%)',
                        data: [], // Would be populated with actual data
                        borderColor: '#2196F3',
                        backgroundColor: 'rgba(33, 150, 243, 0.1)'
                    }]
                },
                options: chartOptions
            });
            
            // Latency Chart
            new Chart(document.getElementById('latencyChart'), {
                type: 'line',
                data: {
                    datasets: [{
                        label: 'Average Latency (μs)',
                        data: [], // Would be populated with actual data
                        borderColor: '#FF9800',
                        backgroundColor: 'rgba(255, 152, 0, 0.1)'
                    }]
                },
                options: chartOptions
            });
            
            // Throughput Chart
            new Chart(document.getElementById('throughputChart'), {
                type: 'line',
                data: {
                    datasets: [{
                        label: 'Throughput (ops/sec)',
                        data: [], // Would be populated with actual data
                        borderColor: '#9C27B0',
                        backgroundColor: 'rgba(156, 39, 176, 0.1)'
                    }]
                },
                options: chartOptions
            });
        </script>
    </div>
</body>
</html>
EOF
    
    print_success "Trend analysis report generated: $report_file"
}

# Function to cleanup old metrics
cleanup_old_metrics() {
    local retention_days="${1:-90}"
    
    print_status "Cleaning up metrics older than $retention_days days..."
    
    # Clean SQLite database
    if command -v sqlite3 >/dev/null 2>&1; then
        sqlite3 "$DATABASE_FILE" "
            DELETE FROM test_cases WHERE test_suite_id IN (
                SELECT ts.id FROM test_suites ts 
                JOIN test_runs tr ON ts.test_run_id = tr.id 
                WHERE tr.timestamp < datetime('now', '-$retention_days days')
            );
            
            DELETE FROM performance_metrics WHERE test_run_id IN (
                SELECT id FROM test_runs WHERE timestamp < datetime('now', '-$retention_days days')
            );
            
            DELETE FROM coverage_metrics WHERE test_run_id IN (
                SELECT id FROM test_runs WHERE timestamp < datetime('now', '-$retention_days days')
            );
            
            DELETE FROM test_suites WHERE test_run_id IN (
                SELECT id FROM test_runs WHERE timestamp < datetime('now', '-$retention_days days')
            );
            
            DELETE FROM test_runs WHERE timestamp < datetime('now', '-$retention_days days');
            
            VACUUM;
        "
        print_success "Cleaned SQLite database"
    fi
    
    # Clean old files
    find "$HISTORICAL_DIR" -name "*.json" -mtime +$retention_days -delete 2>/dev/null || true
    find "$REPORTS_DIR" -name "*.html" -mtime +$retention_days -delete 2>/dev/null || true
    
    print_success "Cleanup completed"
}

# Main function
main() {
    setup_storage
    
    case "${1:-collect}" in
        collect)
            collect_test_metrics
            send_to_influxdb
            ;;
        report)
            generate_trend_report
            ;;
        cleanup)
            cleanup_old_metrics "${2:-90}"
            ;;
        influx)
            send_to_influxdb
            ;;
        *)
            echo "Usage: $0 {collect|report|cleanup|influx}"
            echo ""
            echo "Commands:"
            echo "  collect         - Collect test metrics from all sources"
            echo "  report          - Generate trend analysis report"
            echo "  cleanup [days]  - Clean up old metrics (default: 90 days)"
            echo "  influx          - Send metrics to InfluxDB"
            echo ""
            echo "Environment Variables:"
            echo "  DATABASE_URL      - PostgreSQL connection string"
            echo "  INFLUXDB_URL      - InfluxDB server URL"
            echo "  INFLUXDB_TOKEN    - InfluxDB authentication token"
            echo "  INFLUXDB_ORG      - InfluxDB organization"
            echo "  INFLUXDB_BUCKET   - InfluxDB bucket name"
            exit 1
            ;;
    esac
}

# Run main function
main "$@"