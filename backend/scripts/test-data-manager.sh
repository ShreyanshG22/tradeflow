#!/bin/bash

# TradeFlow Test Data Management Script
# Handles test data generation, cleanup, and management

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
BACKEND_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEST_DATA_DIR="$BACKEND_DIR/test-data"
DATABASE_URL="${DATABASE_URL:-postgresql://test_user:test_password@localhost:5432/test_db}"
REDIS_URL="${REDIS_URL:-redis://localhost:6379/1}"

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

# Function to generate test market data
generate_market_data() {
    print_status "Generating test market data..."
    
    mkdir -p "$TEST_DATA_DIR/market-data"
    
    # Generate sample OHLCV data for multiple symbols
    local symbols=("AAPL" "GOOGL" "MSFT" "TSLA" "AMZN")
    local start_date="2024-01-01"
    local end_date="2024-12-31"
    
    for symbol in "${symbols[@]}"; do
        local file="$TEST_DATA_DIR/market-data/${symbol}_1d.csv"
        
        cat > "$file" << EOF
timestamp,symbol,open,high,low,close,volume
EOF
        
        # Generate 365 days of data
        local base_price=100
        local current_price=$base_price
        
        for i in {1..365}; do
            local date=$(date -d "$start_date + $i days" +%Y-%m-%d)
            local timestamp="${date}T09:30:00Z"
            
            # Generate realistic price movements
            local change=$(echo "scale=2; ($RANDOM % 1000 - 500) / 10000" | bc -l)
            current_price=$(echo "scale=2; $current_price * (1 + $change)" | bc -l)
            
            local open=$current_price
            local high=$(echo "scale=2; $current_price * (1 + ($RANDOM % 300) / 10000)" | bc -l)
            local low=$(echo "scale=2; $current_price * (1 - ($RANDOM % 300) / 10000)" | bc -l)
            local close=$(echo "scale=2; $current_price * (1 + ($RANDOM % 200 - 100) / 10000)" | bc -l)
            local volume=$((RANDOM % 1000000 + 100000))
            
            echo "$timestamp,$symbol,$open,$high,$low,$close,$volume" >> "$file"
            current_price=$close
        done
        
        print_success "Generated market data for $symbol"
    done
}

# Function to generate test user data
generate_user_data() {
    print_status "Generating test user data..."
    
    mkdir -p "$TEST_DATA_DIR/users"
    
    cat > "$TEST_DATA_DIR/users/test_users.json" << 'EOF'
[
  {
    "id": "test-user-1",
    "email": "trader1@example.com",
    "password": "TestPassword123!",
    "firstName": "John",
    "lastName": "Trader",
    "role": "trader",
    "settings": {
      "riskTolerance": "medium",
      "defaultPositionSize": 1000,
      "maxDailyLoss": 0.05
    }
  },
  {
    "id": "test-user-2", 
    "email": "trader2@example.com",
    "password": "TestPassword123!",
    "firstName": "Jane",
    "lastName": "Investor",
    "role": "trader",
    "settings": {
      "riskTolerance": "low",
      "defaultPositionSize": 500,
      "maxDailyLoss": 0.02
    }
  },
  {
    "id": "admin-user",
    "email": "admin@example.com", 
    "password": "AdminPassword123!",
    "firstName": "Admin",
    "lastName": "User",
    "role": "admin",
    "settings": {
      "riskTolerance": "high",
      "defaultPositionSize": 10000,
      "maxDailyLoss": 0.10
    }
  }
]
EOF
    
    print_success "Generated test user data"
}

# Function to generate test strategy configurations
generate_strategy_data() {
    print_status "Generating test strategy data..."
    
    mkdir -p "$TEST_DATA_DIR/strategies"
    
    # Simple Moving Average Crossover Strategy
    cat > "$TEST_DATA_DIR/strategies/sma_crossover.json" << 'EOF'
{
  "id": "sma-crossover-test",
  "name": "SMA Crossover Test Strategy",
  "description": "Simple moving average crossover strategy for testing",
  "nodes": [
    {
      "id": "sma-fast",
      "type": "indicator",
      "config": {
        "indicator": "sma",
        "period": 10,
        "source": "close"
      },
      "position": { "x": 100, "y": 100 }
    },
    {
      "id": "sma-slow", 
      "type": "indicator",
      "config": {
        "indicator": "sma",
        "period": 20,
        "source": "close"
      },
      "position": { "x": 100, "y": 200 }
    },
    {
      "id": "crossover",
      "type": "operator",
      "config": {
        "operator": "crossover",
        "threshold": 0
      },
      "position": { "x": 300, "y": 150 }
    },
    {
      "id": "entry-long",
      "type": "entry",
      "config": {
        "side": "long",
        "orderType": "market"
      },
      "position": { "x": 500, "y": 100 }
    },
    {
      "id": "exit-long",
      "type": "exit", 
      "config": {
        "side": "long",
        "stopLoss": 0.02,
        "takeProfit": 0.04
      },
      "position": { "x": 500, "y": 200 }
    }
  ],
  "connections": [
    { "from": "sma-fast", "to": "crossover", "fromHandle": "output", "toHandle": "input1" },
    { "from": "sma-slow", "to": "crossover", "fromHandle": "output", "toHandle": "input2" },
    { "from": "crossover", "to": "entry-long", "fromHandle": "output", "toHandle": "signal" },
    { "from": "entry-long", "to": "exit-long", "fromHandle": "position", "toHandle": "position" }
  ],
  "parameters": {
    "timeframe": "1d",
    "symbols": ["AAPL", "GOOGL"],
    "positionSizing": {
      "method": "fixed",
      "amount": 1000
    },
    "riskManagement": {
      "maxPositions": 5,
      "maxDailyLoss": 0.05,
      "positionSizeLimit": 0.1
    }
  }
}
EOF

    # RSI Mean Reversion Strategy
    cat > "$TEST_DATA_DIR/strategies/rsi_mean_reversion.json" << 'EOF'
{
  "id": "rsi-mean-reversion-test",
  "name": "RSI Mean Reversion Test Strategy", 
  "description": "RSI-based mean reversion strategy for testing",
  "nodes": [
    {
      "id": "rsi",
      "type": "indicator",
      "config": {
        "indicator": "rsi",
        "period": 14,
        "source": "close"
      },
      "position": { "x": 100, "y": 100 }
    },
    {
      "id": "oversold-check",
      "type": "operator", 
      "config": {
        "operator": "less_than",
        "threshold": 30
      },
      "position": { "x": 300, "y": 100 }
    },
    {
      "id": "overbought-check",
      "type": "operator",
      "config": {
        "operator": "greater_than", 
        "threshold": 70
      },
      "position": { "x": 300, "y": 200 }
    },
    {
      "id": "entry-long",
      "type": "entry",
      "config": {
        "side": "long",
        "orderType": "market"
      },
      "position": { "x": 500, "y": 100 }
    },
    {
      "id": "entry-short",
      "type": "entry",
      "config": {
        "side": "short", 
        "orderType": "market"
      },
      "position": { "x": 500, "y": 200 }
    }
  ],
  "connections": [
    { "from": "rsi", "to": "oversold-check", "fromHandle": "output", "toHandle": "input" },
    { "from": "rsi", "to": "overbought-check", "fromHandle": "output", "toHandle": "input" },
    { "from": "oversold-check", "to": "entry-long", "fromHandle": "output", "toHandle": "signal" },
    { "from": "overbought-check", "to": "entry-short", "fromHandle": "output", "toHandle": "signal" }
  ],
  "parameters": {
    "timeframe": "1h",
    "symbols": ["MSFT", "TSLA"],
    "positionSizing": {
      "method": "percent_equity",
      "percent": 0.1
    },
    "riskManagement": {
      "maxPositions": 3,
      "maxDailyLoss": 0.03,
      "positionSizeLimit": 0.15
    }
  }
}
EOF
    
    print_success "Generated test strategy data"
}

# Function to generate test portfolio data
generate_portfolio_data() {
    print_status "Generating test portfolio data..."
    
    mkdir -p "$TEST_DATA_DIR/portfolios"
    
    cat > "$TEST_DATA_DIR/portfolios/test_portfolios.json" << 'EOF'
[
  {
    "userId": "test-user-1",
    "cashBalance": 10000.00,
    "positions": [
      {
        "symbol": "AAPL",
        "quantity": 50,
        "averagePrice": 150.00,
        "currentPrice": 155.00,
        "unrealizedPnL": 250.00
      },
      {
        "symbol": "GOOGL", 
        "quantity": 10,
        "averagePrice": 2800.00,
        "currentPrice": 2850.00,
        "unrealizedPnL": 500.00
      }
    ],
    "trades": [
      {
        "symbol": "AAPL",
        "side": "buy",
        "quantity": 50,
        "price": 150.00,
        "timestamp": "2024-01-15T10:30:00Z",
        "fees": 1.00
      },
      {
        "symbol": "GOOGL",
        "side": "buy", 
        "quantity": 10,
        "price": 2800.00,
        "timestamp": "2024-01-16T11:45:00Z",
        "fees": 5.00
      }
    ]
  },
  {
    "userId": "test-user-2",
    "cashBalance": 5000.00,
    "positions": [
      {
        "symbol": "MSFT",
        "quantity": 25,
        "averagePrice": 400.00,
        "currentPrice": 405.00,
        "unrealizedPnL": 125.00
      }
    ],
    "trades": [
      {
        "symbol": "MSFT",
        "side": "buy",
        "quantity": 25, 
        "price": 400.00,
        "timestamp": "2024-01-17T09:15:00Z",
        "fees": 2.50
      }
    ]
  }
]
EOF
    
    print_success "Generated test portfolio data"
}

# Function to seed database with test data
seed_database() {
    print_status "Seeding database with test data..."
    
    # Check if database is accessible
    if ! command -v psql >/dev/null 2>&1; then
        print_warning "psql not found, skipping database seeding"
        return 0
    fi
    
    # Extract connection details from DATABASE_URL
    local db_host=$(echo "$DATABASE_URL" | sed -n 's/.*@\([^:]*\):.*/\1/p')
    local db_port=$(echo "$DATABASE_URL" | sed -n 's/.*:\([0-9]*\)\/.*/\1/p')
    local db_name=$(echo "$DATABASE_URL" | sed -n 's/.*\/\([^?]*\).*/\1/p')
    local db_user=$(echo "$DATABASE_URL" | sed -n 's/.*\/\/\([^:]*\):.*/\1/p')
    local db_pass=$(echo "$DATABASE_URL" | sed -n 's/.*\/\/[^:]*:\([^@]*\)@.*/\1/p')
    
    export PGPASSWORD="$db_pass"
    
    # Test database connection
    if ! psql -h "$db_host" -p "$db_port" -U "$db_user" -d "$db_name" -c "SELECT 1;" >/dev/null 2>&1; then
        print_warning "Cannot connect to database, skipping seeding"
        return 0
    fi
    
    # Clear existing test data
    psql -h "$db_host" -p "$db_port" -U "$db_user" -d "$db_name" << 'EOF'
DELETE FROM trades WHERE portfolio_id IN (SELECT id FROM portfolios WHERE user_id LIKE 'test-%');
DELETE FROM positions WHERE portfolio_id IN (SELECT id FROM portfolios WHERE user_id LIKE 'test-%');
DELETE FROM portfolios WHERE user_id LIKE 'test-%';
DELETE FROM strategy_executions WHERE strategy_id IN (SELECT id FROM strategies WHERE user_id LIKE 'test-%');
DELETE FROM strategies WHERE user_id LIKE 'test-%';
DELETE FROM user_sessions WHERE user_id LIKE 'test-%';
DELETE FROM users WHERE id LIKE 'test-%' OR id = 'admin-user';
EOF
    
    # Insert test users
    if [ -f "$TEST_DATA_DIR/users/test_users.json" ]; then
        node -e "
        const fs = require('fs');
        const users = JSON.parse(fs.readFileSync('$TEST_DATA_DIR/users/test_users.json'));
        users.forEach(user => {
          console.log(\`INSERT INTO users (id, email, password_hash, first_name, last_name, role, settings, created_at) VALUES ('\${user.id}', '\${user.email}', '\$2b\$10\$dummy.hash.for.testing', '\${user.firstName}', '\${user.lastName}', '\${user.role}', '\${JSON.stringify(user.settings)}', NOW());\`);
        });
        " | psql -h "$db_host" -p "$db_port" -U "$db_user" -d "$db_name"
    fi
    
    print_success "Database seeded with test data"
}

# Function to seed Redis with test data
seed_redis() {
    print_status "Seeding Redis with test data..."
    
    if ! command -v redis-cli >/dev/null 2>&1; then
        print_warning "redis-cli not found, skipping Redis seeding"
        return 0
    fi
    
    # Extract Redis connection details
    local redis_host=$(echo "$REDIS_URL" | sed -n 's/.*\/\/\([^:]*\):.*/\1/p')
    local redis_port=$(echo "$REDIS_URL" | sed -n 's/.*:\([0-9]*\)\/.*/\1/p')
    local redis_db=$(echo "$REDIS_URL" | sed -n 's/.*\/\([0-9]*\)$/\1/p')
    
    # Test Redis connection
    if ! redis-cli -h "$redis_host" -p "$redis_port" -n "$redis_db" ping >/dev/null 2>&1; then
        print_warning "Cannot connect to Redis, skipping seeding"
        return 0
    fi
    
    # Clear existing test data
    redis-cli -h "$redis_host" -p "$redis_port" -n "$redis_db" FLUSHDB
    
    # Seed market data cache
    if [ -f "$TEST_DATA_DIR/market-data/AAPL_1d.csv" ]; then
        redis-cli -h "$redis_host" -p "$redis_port" -n "$redis_db" SET "market_data:AAPL:1d:latest" "$(tail -1 $TEST_DATA_DIR/market-data/AAPL_1d.csv)"
        redis-cli -h "$redis_host" -p "$redis_port" -n "$redis_db" EXPIRE "market_data:AAPL:1d:latest" 3600
    fi
    
    print_success "Redis seeded with test data"
}

# Function to cleanup test data
cleanup_test_data() {
    print_status "Cleaning up test data..."
    
    # Remove test data files
    if [ -d "$TEST_DATA_DIR" ]; then
        rm -rf "$TEST_DATA_DIR"
        print_success "Removed test data directory"
    fi
    
    # Clean database
    if command -v psql >/dev/null 2>&1; then
        local db_host=$(echo "$DATABASE_URL" | sed -n 's/.*@\([^:]*\):.*/\1/p')
        local db_port=$(echo "$DATABASE_URL" | sed -n 's/.*:\([0-9]*\)\/.*/\1/p')
        local db_name=$(echo "$DATABASE_URL" | sed -n 's/.*\/\([^?]*\).*/\1/p')
        local db_user=$(echo "$DATABASE_URL" | sed -n 's/.*\/\/\([^:]*\):.*/\1/p')
        local db_pass=$(echo "$DATABASE_URL" | sed -n 's/.*\/\/[^:]*:\([^@]*\)@.*/\1/p')
        
        export PGPASSWORD="$db_pass"
        
        if psql -h "$db_host" -p "$db_port" -U "$db_user" -d "$db_name" -c "SELECT 1;" >/dev/null 2>&1; then
            psql -h "$db_host" -p "$db_port" -U "$db_user" -d "$db_name" << 'EOF'
DELETE FROM trades WHERE portfolio_id IN (SELECT id FROM portfolios WHERE user_id LIKE 'test-%');
DELETE FROM positions WHERE portfolio_id IN (SELECT id FROM portfolios WHERE user_id LIKE 'test-%');
DELETE FROM portfolios WHERE user_id LIKE 'test-%';
DELETE FROM strategy_executions WHERE strategy_id IN (SELECT id FROM strategies WHERE user_id LIKE 'test-%');
DELETE FROM strategies WHERE user_id LIKE 'test-%';
DELETE FROM user_sessions WHERE user_id LIKE 'test-%';
DELETE FROM users WHERE id LIKE 'test-%' OR id = 'admin-user';
EOF
            print_success "Cleaned database test data"
        fi
    fi
    
    # Clean Redis
    if command -v redis-cli >/dev/null 2>&1; then
        local redis_host=$(echo "$REDIS_URL" | sed -n 's/.*\/\/\([^:]*\):.*/\1/p')
        local redis_port=$(echo "$REDIS_URL" | sed -n 's/.*:\([0-9]*\)\/.*/\1/p')
        local redis_db=$(echo "$REDIS_URL" | sed -n 's/.*\/\([0-9]*\)$/\1/p')
        
        if redis-cli -h "$redis_host" -p "$redis_port" -n "$redis_db" ping >/dev/null 2>&1; then
            redis-cli -h "$redis_host" -p "$redis_port" -n "$redis_db" FLUSHDB
            print_success "Cleaned Redis test data"
        fi
    fi
}

# Function to validate test data
validate_test_data() {
    print_status "Validating test data..."
    
    local errors=0
    
    # Check required directories
    if [ ! -d "$TEST_DATA_DIR" ]; then
        print_error "Test data directory not found: $TEST_DATA_DIR"
        errors=$((errors + 1))
    fi
    
    # Check market data files
    local required_files=(
        "market-data/AAPL_1d.csv"
        "market-data/GOOGL_1d.csv"
        "users/test_users.json"
        "strategies/sma_crossover.json"
        "portfolios/test_portfolios.json"
    )
    
    for file in "${required_files[@]}"; do
        if [ ! -f "$TEST_DATA_DIR/$file" ]; then
            print_error "Required test data file not found: $file"
            errors=$((errors + 1))
        fi
    done
    
    # Validate JSON files
    for json_file in $(find "$TEST_DATA_DIR" -name "*.json" 2>/dev/null); do
        if ! jq empty "$json_file" >/dev/null 2>&1; then
            print_error "Invalid JSON file: $json_file"
            errors=$((errors + 1))
        fi
    done
    
    if [ $errors -eq 0 ]; then
        print_success "Test data validation passed"
        return 0
    else
        print_error "Test data validation failed with $errors errors"
        return 1
    fi
}

# Main function
main() {
    case "${1:-generate}" in
        generate)
            print_status "Generating all test data..."
            generate_market_data
            generate_user_data
            generate_strategy_data
            generate_portfolio_data
            validate_test_data
            print_success "Test data generation completed"
            ;;
        seed)
            print_status "Seeding databases with test data..."
            seed_database
            seed_redis
            print_success "Database seeding completed"
            ;;
        cleanup)
            cleanup_test_data
            print_success "Test data cleanup completed"
            ;;
        validate)
            validate_test_data
            ;;
        full)
            print_status "Running full test data setup..."
            cleanup_test_data
            generate_market_data
            generate_user_data
            generate_strategy_data
            generate_portfolio_data
            validate_test_data
            seed_database
            seed_redis
            print_success "Full test data setup completed"
            ;;
        *)
            echo "Usage: $0 {generate|seed|cleanup|validate|full}"
            echo ""
            echo "Commands:"
            echo "  generate  - Generate test data files"
            echo "  seed      - Seed databases with test data"
            echo "  cleanup   - Remove all test data"
            echo "  validate  - Validate test data integrity"
            echo "  full      - Complete setup (cleanup + generate + seed)"
            exit 1
            ;;
    esac
}

# Run main function
main "$@"