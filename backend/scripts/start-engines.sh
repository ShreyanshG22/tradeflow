#!/bin/bash

# TradeFlow C++ Engines Startup Script

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
BIN_DIR="$(dirname "$0")/../engines/bin"
LOG_DIR="$(dirname "$0")/../logs"
PID_DIR="$(dirname "$0")/../pids"

# Create directories
mkdir -p "$LOG_DIR" "$PID_DIR"

# Engine configurations
declare -A ENGINES=(
    ["trading-engine"]="8001"
    ["backtest-engine"]="8002"
    ["risk-manager"]="8003"
    ["market-data-parser"]="8004"
)

# Function to start an engine
start_engine() {
    local engine_name="$1"
    local port="$2"
    local pid_file="$PID_DIR/${engine_name}.pid"
    local log_file="$LOG_DIR/${engine_name}.log"
    
    echo -e "${YELLOW}Starting $engine_name on port $port...${NC}"
    
    # Check if already running
    if [[ -f "$pid_file" ]] && kill -0 "$(cat "$pid_file")" 2>/dev/null; then
        echo -e "${YELLOW}$engine_name is already running (PID: $(cat "$pid_file"))${NC}"
        return 0
    fi
    
    # Start the engine
    if [[ -f "$BIN_DIR/$engine_name" ]]; then
        nohup "$BIN_DIR/$engine_name" --port="$port" > "$log_file" 2>&1 &
        local pid=$!
        echo "$pid" > "$pid_file"
        
        # Wait a moment and check if it's still running
        sleep 2
        if kill -0 "$pid" 2>/dev/null; then
            echo -e "${GREEN}$engine_name started successfully (PID: $pid)${NC}"
        else
            echo -e "${RED}Failed to start $engine_name${NC}"
            rm -f "$pid_file"
            return 1
        fi
    else
        echo -e "${RED}Engine binary not found: $BIN_DIR/$engine_name${NC}"
        echo -e "${YELLOW}Run './scripts/build-cpp.sh' first${NC}"
        return 1
    fi
}

# Function to stop an engine
stop_engine() {
    local engine_name="$1"
    local pid_file="$PID_DIR/${engine_name}.pid"
    
    if [[ -f "$pid_file" ]]; then
        local pid=$(cat "$pid_file")
        if kill -0 "$pid" 2>/dev/null; then
            echo -e "${YELLOW}Stopping $engine_name (PID: $pid)...${NC}"
            kill "$pid"
            
            # Wait for graceful shutdown
            local count=0
            while kill -0 "$pid" 2>/dev/null && [[ $count -lt 10 ]]; do
                sleep 1
                ((count++))
            done
            
            # Force kill if still running
            if kill -0 "$pid" 2>/dev/null; then
                echo -e "${YELLOW}Force killing $engine_name...${NC}"
                kill -9 "$pid"
            fi
            
            rm -f "$pid_file"
            echo -e "${GREEN}$engine_name stopped${NC}"
        else
            echo -e "${YELLOW}$engine_name is not running${NC}"
            rm -f "$pid_file"
        fi
    else
        echo -e "${YELLOW}$engine_name is not running (no PID file)${NC}"
    fi
}

# Function to show status
show_status() {
    echo -e "${GREEN}Engine Status:${NC}"
    for engine_name in "${!ENGINES[@]}"; do
        local pid_file="$PID_DIR/${engine_name}.pid"
        if [[ -f "$pid_file" ]] && kill -0 "$(cat "$pid_file")" 2>/dev/null; then
            echo -e "  $engine_name: ${GREEN}RUNNING${NC} (PID: $(cat "$pid_file"))"
        else
            echo -e "  $engine_name: ${RED}STOPPED${NC}"
        fi
    done
}

# Parse command line arguments
case "${1:-start}" in
    start)
        echo -e "${GREEN}Starting TradeFlow C++ Engines${NC}"
        for engine_name in "${!ENGINES[@]}"; do
            start_engine "$engine_name" "${ENGINES[$engine_name]}"
        done
        echo -e "\n${GREEN}All engines startup completed${NC}"
        show_status
        ;;
    stop)
        echo -e "${GREEN}Stopping TradeFlow C++ Engines${NC}"
        for engine_name in "${!ENGINES[@]}"; do
            stop_engine "$engine_name"
        done
        echo -e "\n${GREEN}All engines stopped${NC}"
        ;;
    restart)
        echo -e "${GREEN}Restarting TradeFlow C++ Engines${NC}"
        for engine_name in "${!ENGINES[@]}"; do
            stop_engine "$engine_name"
            start_engine "$engine_name" "${ENGINES[$engine_name]}"
        done
        echo -e "\n${GREEN}All engines restarted${NC}"
        show_status
        ;;
    status)
        show_status
        ;;
    logs)
        engine_name="${2:-trading-engine}"
        log_file="$LOG_DIR/${engine_name}.log"
        if [[ -f "$log_file" ]]; then
            tail -f "$log_file"
        else
            echo -e "${RED}Log file not found: $log_file${NC}"
            exit 1
        fi
        ;;
    *)
        echo "Usage: $0 {start|stop|restart|status|logs [engine_name]}"
        echo "Available engines: ${!ENGINES[*]}"
        exit 1
        ;;
esac