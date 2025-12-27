FROM node:18-alpine

# Install system dependencies
RUN apk add --no-cache \
    postgresql-client \
    redis \
    bash \
    curl \
    jq \
    bc

# Create app directory
WORKDIR /app

# Copy setup scripts
COPY docker/test-setup/setup-test-environment.sh /app/
COPY scripts/test-data-manager.sh /app/
COPY database/migrations /app/migrations/
COPY database/schema /app/schema/

# Make scripts executable
RUN chmod +x /app/setup-test-environment.sh /app/test-data-manager.sh

# Set default command
CMD ["/app/setup-test-environment.sh"]