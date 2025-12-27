FROM node:18-alpine

# Install system dependencies
RUN apk add --no-cache \
    bash \
    curl \
    jq \
    bc \
    git \
    postgresql-client \
    redis \
    python3 \
    py3-pip \
    build-base \
    cmake \
    make \
    g++ \
    docker-cli

# Install Node.js testing tools globally
RUN npm install -g \
    jest \
    @jest/core \
    supertest \
    artillery \
    newman

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY services/*/package*.json ./services/
COPY shared/*/package*.json ./shared/

# Install dependencies
RUN npm ci --only=production

# Copy source code
COPY . .

# Copy test runner scripts
COPY docker/test-runner/run-integration-tests.sh /app/
COPY scripts/ /app/scripts/

# Make scripts executable
RUN chmod +x /app/run-integration-tests.sh /app/scripts/*.sh

# Create directories for test results
RUN mkdir -p /app/test-results /app/coverage /app/performance-results

# Set default command
CMD ["/app/run-integration-tests.sh"]