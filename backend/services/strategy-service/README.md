# Strategy Service

The Strategy Service is a core component of the TradeFlow trading platform that manages trading strategy configuration, validation, and execution coordination.

## Features

### Strategy Configuration Management
- **CRUD Operations**: Complete create, read, update, delete operations for strategies
- **Versioning System**: Track strategy versions with rollback capabilities
- **Template Sharing**: Public template system for sharing strategies between users
- **Caching**: Redis-based caching for improved performance

### Strategy Validation Engine
- **Visual Strategy Parser**: Parse React Flow configurations from the frontend
- **Comprehensive Validation**: Validate nodes, connections, flow logic, and parameters
- **Error Reporting**: Detailed validation errors and warnings
- **Dry-Run Simulation**: Test strategies before live execution

### Strategy Execution Coordinator
- **C++ Engine Interface**: Communicate with ultra-low latency C++ trading engines via Redis
- **Lifecycle Management**: Start, stop, pause, resume strategy executions
- **Performance Monitoring**: Real-time performance tracking with alerts
- **Health Monitoring**: Monitor execution health and detect stale processes

## API Endpoints

### Strategy Management
- `POST /api/strategies` - Create a new strategy
- `GET /api/strategies` - Get user strategies with filtering and pagination
- `GET /api/strategies/:id` - Get strategy by ID
- `PUT /api/strategies/:id` - Update strategy
- `DELETE /api/strategies/:id` - Delete strategy
- `POST /api/strategies/:id/versions` - Create new strategy version
- `GET /api/strategies/:id/versions` - Get strategy versions
- `POST /api/strategies/:id/share` - Share strategy as public template

### Strategy Validation
- `POST /api/strategies/validate` - Validate strategy configuration
- `POST /api/strategies/parse-react-flow` - Parse React Flow data to strategy config
- `POST /api/strategies/simulate` - Run dry-run simulation
- `POST /api/strategies/:id/validate` - Validate specific strategy

### Strategy Execution
- `POST /api/strategies/:id/execute` - Start strategy execution
- `GET /api/strategies/:id/executions` - Get strategy executions
- `GET /api/strategies/executions/:executionId` - Get execution status
- `POST /api/strategies/executions/:executionId/stop` - Stop execution
- `POST /api/strategies/executions/:executionId/pause` - Pause execution
- `POST /api/strategies/executions/:executionId/resume` - Resume execution

### Public Templates
- `GET /api/strategies/templates` - Get public strategy templates

### Health Check
- `GET /health` - Basic health check
- `GET /health/detailed` - Detailed health check with service dependencies

## Environment Variables

Copy `.env.example` to `.env` and configure:

```bash
# Environment
NODE_ENV=development
PORT=3003

# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=tradeflow
DB_USER=postgres
DB_PASSWORD=password

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0

# JWT
JWT_SECRET=your-super-secret-jwt-key
JWT_EXPIRES_IN=1h

# Strategy Execution
MAX_CONCURRENT_STRATEGIES=10
DEFAULT_TIMEFRAME=1h
MAX_BACKTEST_DURATION=365

# Logging
LOG_LEVEL=info
LOG_FORMAT=json
```

## Development

```bash
# Install dependencies
npm install

# Build the service
npm run build

# Start development server
npm run dev

# Start production server
npm start

# Run tests
npm test

# Lint code
npm run lint
```

## Architecture

The service follows a clean architecture pattern with:

- **Routes**: Express.js route handlers for API endpoints
- **Services**: Business logic layer (StrategyService, ValidationEngine, ExecutionCoordinator)
- **Middleware**: Authentication, validation, error handling, request logging
- **Database**: PostgreSQL integration with connection pooling
- **Cache**: Redis integration for caching and pub/sub messaging
- **Types**: TypeScript type definitions for type safety

## Integration

The Strategy Service integrates with:

- **API Gateway**: Routes requests through the main API gateway
- **User Service**: Authentication and user management
- **Portfolio Service**: Portfolio data for strategy execution
- **C++ Trading Engines**: Ultra-low latency execution engines via Redis
- **Database**: PostgreSQL for persistent storage
- **Redis**: Caching and real-time communication

## Security

- JWT-based authentication
- User isolation (users can only access their own strategies)
- Input validation and sanitization
- SQL injection prevention
- Rate limiting (via API Gateway)
- Error handling without information leakage

## Monitoring

- Structured logging with Winston
- Performance metrics tracking
- Health checks for dependencies
- Real-time execution monitoring
- Alert system for performance issues