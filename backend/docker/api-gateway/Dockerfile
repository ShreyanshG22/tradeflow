# Multi-stage build for API Gateway
FROM node:18-alpine AS base
WORKDIR /app
RUN apk add --no-cache dumb-init

# Development stage
FROM base AS development
ENV NODE_ENV=development
COPY services/api-gateway/package*.json ./
RUN npm ci --only=development
COPY services/api-gateway/ .
EXPOSE 3000 9229
CMD ["dumb-init", "npm", "run", "dev"]

# Build stage
FROM base AS build
ENV NODE_ENV=production
COPY services/api-gateway/package*.json ./
RUN npm ci --only=production && npm cache clean --force
COPY services/api-gateway/ .
RUN npm run build

# Production stage
FROM base AS production
ENV NODE_ENV=production
USER node
COPY --chown=node:node --from=build /app/dist ./dist
COPY --chown=node:node --from=build /app/node_modules ./node_modules
COPY --chown=node:node --from=build /app/package.json ./package.json
EXPOSE 3000
CMD ["dumb-init", "node", "dist/index.js"]