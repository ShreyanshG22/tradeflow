# Multi-stage build for C++ Engines
FROM ubuntu:22.04 AS base

# Install build dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    cmake \
    pkg-config \
    libhiredis-dev \
    libpq-dev \
    libssl-dev \
    libjemalloc-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Development stage
FROM base AS development
RUN apt-get update && apt-get install -y \
    gdb \
    valgrind \
    perf-tools-unstable \
    && rm -rf /var/lib/apt/lists/*

# Copy source code
COPY engines/ ./engines/
COPY scripts/ ./scripts/

# Build in debug mode for development
RUN mkdir -p build && cd build && \
    cmake ../engines -DCMAKE_BUILD_TYPE=Debug && \
    make -j$(nproc)

CMD ["./scripts/start-engines.sh"]

# Build stage
FROM base AS build
COPY engines/ ./engines/
RUN mkdir -p build && cd build && \
    cmake ../engines -DCMAKE_BUILD_TYPE=Release && \
    make -j$(nproc)

# Production stage
FROM ubuntu:22.04 AS production
RUN apt-get update && apt-get install -y \
    libhiredis0.14 \
    libpq5 \
    libssl3 \
    libjemalloc2 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=build /app/build/bin/* ./bin/
COPY scripts/start-engines.sh ./

# Set CPU affinity and other performance optimizations
ENV CPU_AFFINITY=1
ENV MALLOC_CONF="background_thread:true,metadata_thp:auto"

CMD ["./start-engines.sh"]