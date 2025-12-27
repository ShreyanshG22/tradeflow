#!/bin/bash

# TradeFlow Performance Regression Detection System
# Compares current performance metrics with historical baselines

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
BACKEND_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PERFORMANCE_DIR="$BACKEND_DIR/performance-results"
BASELINE_DIR="$PERFORMANCE_DIR/baselines"
CURRENT_DIR="$PERFORMANCE_DIR/current"
REPORTS_DIR="$PERFORMANCE_DIR/reports"

# Thresholds (configurable via environment)
LATENCY_REGRESSION_THRESHOLD="${LATENCY_REGRESSION_THRESHOLD:-5.0}"  # 5% increase
THROUGHPUT_REGRESSION_THRESHOLD="${THROUGHPUT_REGRESSION_THRESHOLD:-5.0}"  # 5% decrease
MEMORY_REGRESSION_THRESHOLD="${MEMORY_REGRESSION_THRESHOLD:-10.0}"  # 10% increase
CPU_REGRESSION_THRESHOLD="${CPU_REGRESSION_THRESHOLD:-10.0}"  # 10% increase

# Notification settings
SLACK_WEBHOOK_URL="${SLACK_WEBHOOK_URL:-}"
EMAIL_RECIPIENTS="${EMAIL_RECIPIENTS:-}"
GITHUB_TOKEN="${GITHUB_TOKEN:-}"
GITHUB_REPO="${GITHUB_REPO:-}"

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

# Function to setup directories
setup_directories() {
    mkdir -p "$PERFORMANCE_DIR" "$BASELINE_DIR" "$CURRENT_DIR" "$REPORTS_DIR"
}

# Function to run performance benchmarks
run_benchmarks() {
    print_status "Running performance benchmarks..."
    
    local engines_dir="$BACKEND_DIR/engines"
    local build_dir="$engines_dir/build"
    
    if [ ! -d "$build_dir" ]; then
        print_status "Building C++ engines for benchmarking..."
        cd "$engines_dir"
        mkdir -p build
        cd build
        cmake -DCMAKE_BUILD_TYPE=Release -DBUILD_TESTS=ON -DENABLE_BENCHMARKS=ON ..
        make -j$(nproc)
    fi
    
    cd "$build_dir"
    
    # Run latency benchmarks
    print_status "Running latency benchmarks..."
    if [ -f "./benchmark_latency" ]; then
        ./benchmark_latency > "$CURRENT_DIR/latency_results.txt" 2>&1 || true
    fi
    
    # Run throughput benchmarks
    print_status "Running throughput benchmarks..."
    if [ -f "./benchmark_throughput" ]; then
        ./benchmark_throughput > "$CURRENT_DIR/throughput_results.txt" 2>&1 || true
    fi
    
    # Run memory benchmarks
    print_status "Running memory benchmarks..."
    if [ -f "./benchmark_memory" ]; then
        ./benchmark_memory > "$CURRENT_DIR/memory_results.txt" 2>&1 || true
    fi
    
    # Extract metrics and create JSON summary
    create_metrics_summary
}

# Function to create metrics summary
create_metrics_summary() {
    print_status "Creating metrics summary..."
    
    local timestamp=$(date -u +%Y-%m-%dT%H:%M:%SZ)
    local commit_hash="${GITHUB_SHA:-$(git rev-parse HEAD 2>/dev/null || echo 'unknown')}"
    
    # Extract latency metrics
    local avg_latency="0"
    local p99_latency="0"
    if [ -f "$CURRENT_DIR/latency_results.txt" ]; then
        avg_latency=$(grep -o 'Average latency: [0-9.]*' "$CURRENT_DIR/latency_results.txt" | grep -o '[0-9.]*' || echo "0")
        p99_latency=$(grep -o 'P99 latency: [0-9.]*' "$CURRENT_DIR/latency_results.txt" | grep -o '[0-9.]*' || echo "0")
    fi
    
    # Extract throughput metrics
    local throughput="0"
    local max_throughput="0"
    if [ -f "$CURRENT_DIR/throughput_results.txt" ]; then
        throughput=$(grep -o 'Throughput: [0-9]*' "$CURRENT_DIR/throughput_results.txt" | grep -o '[0-9]*' || echo "0")
        max_throughput=$(grep -o 'Max throughput: [0-9]*' "$CURRENT_DIR/throughput_results.txt" | grep -o '[0-9]*' || echo "0")
    fi
    
    # Extract memory metrics
    local peak_memory="0"
    local avg_memory="0"
    if [ -f "$CURRENT_DIR/memory_results.txt" ]; then
        peak_memory=$(grep -o 'Peak memory: [0-9]*' "$CURRENT_DIR/memory_results.txt" | grep -o '[0-9]*' || echo "0")
        avg_memory=$(grep -o 'Average memory: [0-9]*' "$CURRENT_DIR/memory_results.txt" | grep -o '[0-9]*' || echo "0")
    fi
    
    # Create JSON summary
    cat > "$CURRENT_DIR/metrics_summary.json" << EOF
{
  "timestamp": "$timestamp",
  "commit": "$commit_hash",
  "branch": "${GITHUB_REF_NAME:-$(git branch --show-current 2>/dev/null || echo 'unknown')}",
  "metrics": {
    "latency": {
      "average_us": $avg_latency,
      "p99_us": $p99_latency
    },
    "throughput": {
      "ops_per_second": $throughput,
      "max_ops_per_second": $max_throughput
    },
    "memory": {
      "peak_mb": $peak_memory,
      "average_mb": $avg_memory
    }
  },
  "environment": {
    "os": "$(uname -s)",
    "arch": "$(uname -m)",
    "cpu_cores": $(nproc),
    "compiler": "${CXX:-g++}",
    "build_type": "Release"
  }
}
EOF
    
    print_success "Metrics summary created"
}

# Function to find baseline for comparison
find_baseline() {
    local baseline_file=""
    
    # Try to find baseline from same branch
    local current_branch="${GITHUB_REF_NAME:-$(git branch --show-current 2>/dev/null || echo 'main')}"
    if [ -f "$BASELINE_DIR/${current_branch}_baseline.json" ]; then
        baseline_file="$BASELINE_DIR/${current_branch}_baseline.json"
    elif [ -f "$BASELINE_DIR/main_baseline.json" ]; then
        baseline_file="$BASELINE_DIR/main_baseline.json"
    elif [ -f "$BASELINE_DIR/latest_baseline.json" ]; then
        baseline_file="$BASELINE_DIR/latest_baseline.json"
    fi
    
    echo "$baseline_file"
}

# Function to compare metrics with baseline
compare_with_baseline() {
    print_status "Comparing current metrics with baseline..."
    
    local baseline_file=$(find_baseline)
    
    if [ -z "$baseline_file" ] || [ ! -f "$baseline_file" ]; then
        print_warning "No baseline found for comparison"
        return 0
    fi
    
    if [ ! -f "$CURRENT_DIR/metrics_summary.json" ]; then
        print_error "Current metrics summary not found"
        return 1
    fi
    
    print_status "Using baseline: $baseline_file"
    
    # Extract current metrics
    local current_avg_latency=$(jq -r '.metrics.latency.average_us' "$CURRENT_DIR/metrics_summary.json")
    local current_throughput=$(jq -r '.metrics.throughput.ops_per_second' "$CURRENT_DIR/metrics_summary.json")
    local current_memory=$(jq -r '.metrics.memory.peak_mb' "$CURRENT_DIR/metrics_summary.json")
    
    # Extract baseline metrics
    local baseline_avg_latency=$(jq -r '.metrics.latency.average_us' "$baseline_file")
    local baseline_throughput=$(jq -r '.metrics.throughput.ops_per_second' "$baseline_file")
    local baseline_memory=$(jq -r '.metrics.memory.peak_mb' "$baseline_file")
    
    # Calculate percentage changes
    local latency_change=$(echo "scale=2; (($current_avg_latency - $baseline_avg_latency) / $baseline_avg_latency) * 100" | bc -l 2>/dev/null || echo "0")
    local throughput_change=$(echo "scale=2; (($current_throughput - $baseline_throughput) / $baseline_throughput) * 100" | bc -l 2>/dev/null || echo "0")
    local memory_change=$(echo "scale=2; (($current_memory - $baseline_memory) / $baseline_memory) * 100" | bc -l 2>/dev/null || echo "0")
    
    # Check for regressions
    local regressions=()
    local warnings=()
    
    # Latency regression (increase is bad)
    if [ $(echo "$latency_change > $LATENCY_REGRESSION_THRESHOLD" | bc -l 2>/dev/null || echo "0") -eq 1 ]; then
        regressions+=("Latency regression: ${latency_change}% increase (${current_avg_latency}μs vs ${baseline_avg_latency}μs)")
    elif [ $(echo "$latency_change > $(echo "$LATENCY_REGRESSION_THRESHOLD / 2" | bc -l)" | bc -l 2>/dev/null || echo "0") -eq 1 ]; then
        warnings+=("Latency warning: ${latency_change}% increase (${current_avg_latency}μs vs ${baseline_avg_latency}μs)")
    fi
    
    # Throughput regression (decrease is bad)
    if [ $(echo "$throughput_change < -$THROUGHPUT_REGRESSION_THRESHOLD" | bc -l 2>/dev/null || echo "0") -eq 1 ]; then
        regressions+=("Throughput regression: ${throughput_change}% decrease (${current_throughput} vs ${baseline_throughput} ops/sec)")
    elif [ $(echo "$throughput_change < -$(echo "$THROUGHPUT_REGRESSION_THRESHOLD / 2" | bc -l)" | bc -l 2>/dev/null || echo "0") -eq 1 ]; then
        warnings+=("Throughput warning: ${throughput_change}% decrease (${current_throughput} vs ${baseline_throughput} ops/sec)")
    fi
    
    # Memory regression (increase is bad)
    if [ $(echo "$memory_change > $MEMORY_REGRESSION_THRESHOLD" | bc -l 2>/dev/null || echo "0") -eq 1 ]; then
        regressions+=("Memory regression: ${memory_change}% increase (${current_memory}MB vs ${baseline_memory}MB)")
    elif [ $(echo "$memory_change > $(echo "$MEMORY_REGRESSION_THRESHOLD / 2" | bc -l)" | bc -l 2>/dev/null || echo "0") -eq 1 ]; then
        warnings+=("Memory warning: ${memory_change}% increase (${current_memory}MB vs ${baseline_memory}MB)")
    fi
    
    # Create comparison report
    local timestamp=$(date -u +%Y-%m-%dT%H:%M:%SZ)
    cat > "$REPORTS_DIR/regression_report_$(date +%Y%m%d_%H%M%S).json" << EOF
{
  "timestamp": "$timestamp",
  "baseline_file": "$baseline_file",
  "current_metrics": {
    "latency_us": $current_avg_latency,
    "throughput_ops": $current_throughput,
    "memory_mb": $current_memory
  },
  "baseline_metrics": {
    "latency_us": $baseline_avg_latency,
    "throughput_ops": $baseline_throughput,
    "memory_mb": $baseline_memory
  },
  "changes": {
    "latency_percent": $latency_change,
    "throughput_percent": $throughput_change,
    "memory_percent": $memory_change
  },
  "thresholds": {
    "latency_regression": $LATENCY_REGRESSION_THRESHOLD,
    "throughput_regression": $THROUGHPUT_REGRESSION_THRESHOLD,
    "memory_regression": $MEMORY_REGRESSION_THRESHOLD
  },
  "regressions": $(printf '%s\n' "${regressions[@]}" | jq -R . | jq -s .),
  "warnings": $(printf '%s\n' "${warnings[@]}" | jq -R . | jq -s .)
}
EOF
    
    # Print results
    echo ""
    print_status "Performance Comparison Results:"
    echo "================================"
    printf "%-15s %12s %12s %10s\n" "Metric" "Current" "Baseline" "Change"
    echo "-------------------------------------------------------"
    printf "%-15s %10.2fμs %10.2fμs %8.1f%%\n" "Latency" "$current_avg_latency" "$baseline_avg_latency" "$latency_change"
    printf "%-15s %10.0f/s %10.0f/s %8.1f%%\n" "Throughput" "$current_throughput" "$baseline_throughput" "$throughput_change"
    printf "%-15s %10.0fMB %10.0fMB %8.1f%%\n" "Memory" "$current_memory" "$baseline_memory" "$memory_change"
    echo ""
    
    # Report warnings
    if [ ${#warnings[@]} -gt 0 ]; then
        print_warning "Performance warnings detected:"
        for warning in "${warnings[@]}"; do
            print_warning "  - $warning"
        done
        echo ""
    fi
    
    # Report regressions
    if [ ${#regressions[@]} -gt 0 ]; then
        print_error "Performance regressions detected:"
        for regression in "${regressions[@]}"; do
            print_error "  - $regression"
        done
        echo ""
        
        # Send notifications
        send_notifications "${regressions[@]}"
        
        return 1
    else
        print_success "No performance regressions detected"
        return 0
    fi
}

# Function to send notifications
send_notifications() {
    local regressions=("$@")
    
    print_status "Sending performance regression notifications..."
    
    # Prepare notification message
    local message="🚨 Performance Regression Detected in TradeFlow Backend\n\n"
    message+="Commit: ${GITHUB_SHA:-$(git rev-parse HEAD 2>/dev/null || echo 'unknown')}\n"
    message+="Branch: ${GITHUB_REF_NAME:-$(git branch --show-current 2>/dev/null || echo 'unknown')}\n"
    message+="Timestamp: $(date -u +%Y-%m-%dT%H:%M:%SZ)\n\n"
    message+="Regressions:\n"
    
    for regression in "${regressions[@]}"; do
        message+="• $regression\n"
    done
    
    # Send Slack notification
    if [ -n "$SLACK_WEBHOOK_URL" ]; then
        print_status "Sending Slack notification..."
        curl -X POST -H 'Content-type: application/json' \
            --data "{\"text\":\"$message\"}" \
            "$SLACK_WEBHOOK_URL" || print_warning "Failed to send Slack notification"
    fi
    
    # Send email notification
    if [ -n "$EMAIL_RECIPIENTS" ] && command -v mail >/dev/null 2>&1; then
        print_status "Sending email notification..."
        echo -e "$message" | mail -s "TradeFlow Performance Regression Alert" "$EMAIL_RECIPIENTS" || \
            print_warning "Failed to send email notification"
    fi
    
    # Create GitHub issue
    if [ -n "$GITHUB_TOKEN" ] && [ -n "$GITHUB_REPO" ]; then
        print_status "Creating GitHub issue..."
        create_github_issue "$message"
    fi
}

# Function to create GitHub issue
create_github_issue() {
    local message="$1"
    
    local issue_title="Performance Regression Detected - $(date +%Y-%m-%d)"
    local issue_body=$(echo -e "$message" | sed 's/\\n/\n/g')
    
    local json_payload=$(jq -n \
        --arg title "$issue_title" \
        --arg body "$issue_body" \
        --argjson labels '["performance", "regression", "bug"]' \
        '{title: $title, body: $body, labels: $labels}')
    
    curl -X POST \
        -H "Authorization: token $GITHUB_TOKEN" \
        -H "Accept: application/vnd.github.v3+json" \
        "https://api.github.com/repos/$GITHUB_REPO/issues" \
        -d "$json_payload" || print_warning "Failed to create GitHub issue"
}

# Function to update baseline
update_baseline() {
    print_status "Updating performance baseline..."
    
    if [ ! -f "$CURRENT_DIR/metrics_summary.json" ]; then
        print_error "Current metrics summary not found"
        return 1
    fi
    
    local current_branch="${GITHUB_REF_NAME:-$(git branch --show-current 2>/dev/null || echo 'main')}"
    local baseline_file="$BASELINE_DIR/${current_branch}_baseline.json"
    
    cp "$CURRENT_DIR/metrics_summary.json" "$baseline_file"
    cp "$CURRENT_DIR/metrics_summary.json" "$BASELINE_DIR/latest_baseline.json"
    
    print_success "Baseline updated: $baseline_file"
}

# Function to generate historical report
generate_historical_report() {
    print_status "Generating historical performance report..."
    
    local report_file="$REPORTS_DIR/historical_performance_$(date +%Y%m%d).html"
    
    cat > "$report_file" << 'EOF'
<!DOCTYPE html>
<html>
<head>
    <title>TradeFlow Performance History</title>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .chart-container { width: 800px; height: 400px; margin: 20px 0; }
        .metrics-table { border-collapse: collapse; width: 100%; }
        .metrics-table th, .metrics-table td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        .metrics-table th { background-color: #f2f2f2; }
        .regression { color: red; font-weight: bold; }
        .improvement { color: green; font-weight: bold; }
    </style>
</head>
<body>
    <h1>TradeFlow Backend Performance History</h1>
    <p>Generated: $(date)</p>
    
    <h2>Performance Trends</h2>
    <div class="chart-container">
        <canvas id="latencyChart"></canvas>
    </div>
    
    <div class="chart-container">
        <canvas id="throughputChart"></canvas>
    </div>
    
    <h2>Recent Performance Data</h2>
    <table class="metrics-table">
        <tr>
            <th>Date</th>
            <th>Commit</th>
            <th>Latency (μs)</th>
            <th>Throughput (ops/s)</th>
            <th>Memory (MB)</th>
            <th>Status</th>
        </tr>
EOF
    
    # Add recent performance data from reports
    find "$REPORTS_DIR" -name "regression_report_*.json" -type f | sort -r | head -10 | while read report; do
        if [ -f "$report" ]; then
            local timestamp=$(jq -r '.timestamp' "$report")
            local commit=$(jq -r '.current_metrics.commit // "unknown"' "$report" 2>/dev/null || echo "unknown")
            local latency=$(jq -r '.current_metrics.latency_us' "$report")
            local throughput=$(jq -r '.current_metrics.throughput_ops' "$report")
            local memory=$(jq -r '.current_metrics.memory_mb' "$report")
            local regressions=$(jq -r '.regressions | length' "$report")
            
            local status="✅ Good"
            local status_class=""
            if [ "$regressions" -gt 0 ]; then
                status="❌ Regression"
                status_class="regression"
            fi
            
            echo "        <tr>" >> "$report_file"
            echo "            <td>$timestamp</td>" >> "$report_file"
            echo "            <td>${commit:0:8}</td>" >> "$report_file"
            echo "            <td>$latency</td>" >> "$report_file"
            echo "            <td>$throughput</td>" >> "$report_file"
            echo "            <td>$memory</td>" >> "$report_file"
            echo "            <td class=\"$status_class\">$status</td>" >> "$report_file"
            echo "        </tr>" >> "$report_file"
        fi
    done
    
    cat >> "$report_file" << 'EOF'
    </table>
    
    <script>
        // Chart.js configuration would go here
        // This is a placeholder for actual chart implementation
    </script>
</body>
</html>
EOF
    
    print_success "Historical report generated: $report_file"
}

# Main function
main() {
    setup_directories
    
    case "${1:-run}" in
        run)
            print_status "Running performance regression detection..."
            run_benchmarks
            if compare_with_baseline; then
                print_success "No performance regressions detected"
                exit 0
            else
                print_error "Performance regressions detected"
                exit 1
            fi
            ;;
        benchmark)
            run_benchmarks
            print_success "Benchmarks completed"
            ;;
        compare)
            if [ -f "$CURRENT_DIR/metrics_summary.json" ]; then
                compare_with_baseline
            else
                print_error "No current metrics found. Run benchmarks first."
                exit 1
            fi
            ;;
        update-baseline)
            update_baseline
            ;;
        report)
            generate_historical_report
            ;;
        *)
            echo "Usage: $0 {run|benchmark|compare|update-baseline|report}"
            echo ""
            echo "Commands:"
            echo "  run             - Run benchmarks and compare with baseline"
            echo "  benchmark       - Run performance benchmarks only"
            echo "  compare         - Compare current metrics with baseline"
            echo "  update-baseline - Update performance baseline"
            echo "  report          - Generate historical performance report"
            echo ""
            echo "Environment Variables:"
            echo "  LATENCY_REGRESSION_THRESHOLD     - Latency regression threshold % (default: 5.0)"
            echo "  THROUGHPUT_REGRESSION_THRESHOLD  - Throughput regression threshold % (default: 5.0)"
            echo "  MEMORY_REGRESSION_THRESHOLD      - Memory regression threshold % (default: 10.0)"
            echo "  SLACK_WEBHOOK_URL               - Slack webhook for notifications"
            echo "  EMAIL_RECIPIENTS                - Email addresses for notifications"
            echo "  GITHUB_TOKEN                    - GitHub token for issue creation"
            echo "  GITHUB_REPO                     - GitHub repository (owner/repo)"
            exit 1
            ;;
    esac
}

# Run main function
main "$@"