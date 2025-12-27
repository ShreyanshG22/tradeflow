#!/bin/bash

# TradeFlow C++ Engines Clean Script

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}Cleaning TradeFlow C++ Engines${NC}"

# Change to engines directory
cd "$(dirname "$0")/../engines"

# Stop engines first
echo -e "${YELLOW}Stopping engines...${NC}"
../scripts/start-engines.sh stop 2>/dev/null || true

# Clean build artifacts
echo -e "${YELLOW}Cleaning build artifacts...${NC}"
rm -rf build/
rm -rf bin/
rm -rf ../logs/
rm -rf ../pids/

# Clean CMake cache
find . -name "CMakeCache.txt" -delete 2>/dev/null || true
find . -name "CMakeFiles" -type d -exec rm -rf {} + 2>/dev/null || true
find . -name "cmake_install.cmake" -delete 2>/dev/null || true
find . -name "Makefile" -delete 2>/dev/null || true

echo -e "${GREEN}Clean completed successfully!${NC}"