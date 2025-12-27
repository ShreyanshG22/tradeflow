#!/bin/bash

# TradeFlow C++ Engines Build Script

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
BUILD_DIR="build"
BUILD_TYPE="Debug"
JOBS=$(nproc)

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --release)
            BUILD_TYPE="Release"
            shift
            ;;
        --clean)
            CLEAN=true
            shift
            ;;
        --jobs)
            JOBS="$2"
            shift 2
            ;;
        -h|--help)
            echo "Usage: $0 [OPTIONS]"
            echo "Options:"
            echo "  --release     Build in release mode (default: debug)"
            echo "  --clean       Clean build directory before building"
            echo "  --jobs N      Number of parallel jobs (default: $(nproc))"
            echo "  -h, --help    Show this help message"
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

echo -e "${GREEN}Building TradeFlow C++ Engines${NC}"
echo -e "Build Type: ${YELLOW}$BUILD_TYPE${NC}"
echo -e "Jobs: ${YELLOW}$JOBS${NC}"

# Change to engines directory
cd "$(dirname "$0")/../engines"

# Clean if requested
if [[ "$CLEAN" == "true" ]]; then
    echo -e "${YELLOW}Cleaning build directory...${NC}"
    rm -rf "$BUILD_DIR"
fi

# Create build directory
mkdir -p "$BUILD_DIR"
cd "$BUILD_DIR"

# Check for required dependencies
echo -e "${YELLOW}Checking dependencies...${NC}"

# Check for CMake
if ! command -v cmake &> /dev/null; then
    echo -e "${RED}Error: CMake is not installed${NC}"
    exit 1
fi

# Check for compiler
if ! command -v g++ &> /dev/null && ! command -v clang++ &> /dev/null; then
    echo -e "${RED}Error: No C++ compiler found (g++ or clang++)${NC}"
    exit 1
fi

# Check for pkg-config
if ! command -v pkg-config &> /dev/null; then
    echo -e "${RED}Error: pkg-config is not installed${NC}"
    exit 1
fi

# Configure with CMake
echo -e "${YELLOW}Configuring build...${NC}"
cmake .. \
    -DCMAKE_BUILD_TYPE="$BUILD_TYPE" \
    -DCMAKE_EXPORT_COMPILE_COMMANDS=ON \
    -DCMAKE_INSTALL_PREFIX="../bin"

# Build
echo -e "${YELLOW}Building engines...${NC}"
make -j"$JOBS"

# Install binaries
echo -e "${YELLOW}Installing binaries...${NC}"
make install

echo -e "${GREEN}Build completed successfully!${NC}"
echo -e "Binaries installed in: ${YELLOW}$(pwd)/../bin${NC}"

# List built executables
echo -e "\n${GREEN}Built executables:${NC}"
ls -la ../bin/ 2>/dev/null || echo "No binaries found in bin directory"