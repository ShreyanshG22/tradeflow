#!/bin/bash

# TradeFlow Backend Setup Script

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${GREEN}🚀 TradeFlow Backend Setup${NC}"
echo -e "${BLUE}Setting up development environment...${NC}"

# Check prerequisites
echo -e "\n${YELLOW}Checking prerequisites...${NC}"

# Check Node.js
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js is not installed${NC}"
    echo -e "Please install Node.js 18+ from https://nodejs.org/"
    exit 1
fi

NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo -e "${RED}❌ Node.js version 18+ required (found: $(node --version))${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Node.js $(node --version)${NC}"

# Check npm
if ! command -v npm &> /dev/null; then
    echo -e "${RED}❌ npm is not installed${NC}"
    exit 1
fi
echo -e "${GREEN}✅ npm $(npm --version)${NC}"

# Check Docker
if ! command -v docker &> /dev/null; then
    echo -e "${RED}❌ Docker is not installed${NC}"
    echo -e "Please install Docker from https://docs.docker.com/get-docker/"
    exit 1
fi
echo -e "${GREEN}✅ Docker $(docker --version | cut -d' ' -f3 | cut -d',' -f1)${NC}"

# Check Docker Compose
if ! command -v docker-compose &> /dev/null; then
    echo -e "${RED}❌ Docker Compose is not installed${NC}"
    echo -e "Please install Docker Compose"
    exit 1
fi
echo -e "${GREEN}✅ Docker Compose $(docker-compose --version | cut -d' ' -f3 | cut -d',' -f1)${NC}"

# Check CMake
if ! command -v cmake &> /dev/null; then
    echo -e "${YELLOW}⚠️  CMake is not installed (required for C++ engines)${NC}"
    echo -e "Install CMake from https://cmake.org/download/"
else
    echo -e "${GREEN}✅ CMake $(cmake --version | head -n1 | cut -d' ' -f3)${NC}"
fi

# Check C++ compiler
if command -v g++ &> /dev/null; then
    echo -e "${GREEN}✅ GCC $(g++ --version | head -n1 | cut -d' ' -f4)${NC}"
elif command -v clang++ &> /dev/null; then
    echo -e "${GREEN}✅ Clang $(clang++ --version | head -n1 | cut -d' ' -f4)${NC}"
else
    echo -e "${YELLOW}⚠️  No C++ compiler found (required for C++ engines)${NC}"
    echo -e "Install GCC or Clang"
fi

# Install Node.js dependencies
echo -e "\n${YELLOW}Installing Node.js dependencies...${NC}"
npm install

# Copy environment file
echo -e "\n${YELLOW}Setting up environment configuration...${NC}"
if [ ! -f .env ]; then
    cp .env.example .env
    echo -e "${GREEN}✅ Created .env file from template${NC}"
    echo -e "${BLUE}💡 Please review and update .env file with your configuration${NC}"
else
    echo -e "${BLUE}ℹ️  .env file already exists${NC}"
fi

# Start Docker services
echo -e "\n${YELLOW}Starting Docker services...${NC}"
docker-compose up -d postgres redis

# Wait for services to be ready
echo -e "${YELLOW}Waiting for services to be ready...${NC}"
sleep 10

# Check service health
echo -e "\n${YELLOW}Checking service health...${NC}"

# Check PostgreSQL
if docker-compose exec -T postgres pg_isready -U tradeflow -d tradeflow &> /dev/null; then
    echo -e "${GREEN}✅ PostgreSQL is ready${NC}"
else
    echo -e "${RED}❌ PostgreSQL is not ready${NC}"
fi

# Check Redis
if docker-compose exec -T redis redis-cli ping &> /dev/null; then
    echo -e "${GREEN}✅ Redis is ready${NC}"
else
    echo -e "${RED}❌ Redis is not ready${NC}"
fi

# Build C++ engines (if CMake is available)
if command -v cmake &> /dev/null && command -v g++ &> /dev/null; then
    echo -e "\n${YELLOW}Building C++ engines...${NC}"
    ./scripts/build-cpp.sh
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✅ C++ engines built successfully${NC}"
    else
        echo -e "${YELLOW}⚠️  C++ engines build failed (non-critical for Node.js services)${NC}"
    fi
else
    echo -e "\n${YELLOW}⚠️  Skipping C++ engines build (missing dependencies)${NC}"
fi

# Final status
echo -e "\n${GREEN}🎉 Setup completed!${NC}"
echo -e "\n${BLUE}Next steps:${NC}"
echo -e "1. Review and update the .env file"
echo -e "2. Start the development services: ${YELLOW}npm run dev${NC}"
echo -e "3. Check service status: ${YELLOW}docker-compose ps${NC}"
echo -e "4. View logs: ${YELLOW}docker-compose logs -f${NC}"
echo -e "\n${BLUE}Available commands:${NC}"
echo -e "• ${YELLOW}npm run dev${NC} - Start all services in development mode"
echo -e "• ${YELLOW}npm run build${NC} - Build all services"
echo -e "• ${YELLOW}npm run test${NC} - Run tests"
echo -e "• ${YELLOW}npm run docker:up${NC} - Start Docker services"
echo -e "• ${YELLOW}npm run docker:down${NC} - Stop Docker services"
echo -e "• ${YELLOW}./scripts/build-cpp.sh${NC} - Build C++ engines"
echo -e "• ${YELLOW}./scripts/start-engines.sh${NC} - Start C++ engines"

echo -e "\n${GREEN}Happy coding! 🚀${NC}"