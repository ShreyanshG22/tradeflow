# Zerodha Integration API Reference

## Base URL

- **Development**: `http://localhost:3000/api/zerodha`
- **Staging**: `https://staging-api.tradeflow.com/api/zerodha`
- **Production**: `https://api.tradeflow.com/api/zerodha`

## Authentication

All API endpoints (except login initiation) require JWT authentication via the `Authorization` header:

```
Authorization: Bearer <jwt_token>
```

## Response Format

All API responses follow a consistent format:

### Success Response
```json
{
  "success": true,
  "data": {
    // Response data
  },
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

### Error Response
```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable error message",
    "details": {
      // Additional error context
    }
  },
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

## Authentication Endpoints

### POST /auth/login

Initiate Zerodha OAuth login flow.

**Request Body:**
```json
{
  "user_id": "string" // TradeFlow user ID
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "login_url": "https://kite.zerodha.com/connect/login?api_key=xxx&state=yyy",
    "state": "random_state_string"
  }
}
```

**Error Codes:**
- `VALIDATION_ERROR`: Invalid user_id
- `USER_NOT_FOUND`: User does not exist
- `RATE_LIMIT_EXCEEDED`: Too many login attempts

---

### GET /auth/callback

Handle OAuth callback from Zerodha (typically called by Zerodha, not directly).

**Query Parameters:**
- `request_token` (required): OAuth request token from Zerodha
- `state` (required): State parameter for CSRF protection
- `action` (required): OAuth action (should be "login")
- `status` (required): OAuth status ("success" or "error")

**Response:**
```json
{
  "success": true,
  "data": {
    "access_token": "jwt_token_string",
    "expires_at": "2024-01-15T18:30:00.000Z",
    "user_profile": {
      "user_id": "ZU1234",
      "user_name": "John Doe",
      "email": "john@example.com",
      "broker": "ZERODHA"
    }
  }
}
```

**Error Codes:**
- `INVALID_STATE`: State parameter mismatch
- `INVALID_REQUEST_TOKEN`: Invalid or expired request token
- `OAUTH_ERROR`: Zerodha OAuth error
- `TOKEN_GENERATION_FAILED`: Failed to generate access token

---

### GET /auth/profile

Get authenticated user profile information.

**Headers:**
- `Authorization: Bearer <jwt_token>` (required)

**Response:**
```json
{
  "success": true,
  "data": {
    "user_id": "ZU1234",
    "user_name": "John Doe",
    "email": "john@example.com",
    "broker": "ZERODHA",
    "exchanges": ["NSE", "BSE"],
    "products": ["CNC", "MIS", "NRML"],
    "order_types": ["MARKET", "LIMIT", "SL", "SL-M"],
    "account_status": "ACTIVE"
  }
}
```

**Error Codes:**
- `UNAUTHORIZED`: Invalid or expired token
- `USER_NOT_FOUND`: User profile not found

---

### POST /auth/refresh

Refresh the JWT access token.

**Headers:**
- `Authorization: Bearer <jwt_token>` (required)

**Response:**
```json
{
  "success": true,
  "data": {
    "access_token": "new_jwt_token_string",
    "expires_at": "2024-01-15T18:30:00.000Z"
  }
}
```

**Error Codes:**
- `UNAUTHORIZED`: Invalid or expired token
- `REFRESH_FAILED`: Token refresh failed

---

### DELETE /auth/logout

Logout and invalidate the current session.

**Headers:**
- `Authorization: Bearer <jwt_token>` (required)

**Response:**
```json
{
  "success": true,
  "message": "Successfully logged out"
}
```

## Market Data Endpoints

### GET /market/instruments

Get list of tradeable instruments.

**Query Parameters:**
- `exchange` (optional): Filter by exchange ("NSE" or "BSE")
- `segment` (optional): Filter by segment ("EQ", "FO", etc.)
- `limit` (optional): Limit number of results (default: 1000)
- `offset` (optional): Pagination offset (default: 0)

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "instrument_token": 738561,
      "tradingsymbol": "RELIANCE",
      "name": "Reliance Industries Limited",
      "exchange": "NSE",
      "segment": "NSE",
      "lot_size": 1,
      "tick_size": 0.05,
      "instrument_type": "EQ",
      "expiry": null,
      "strike": null
    }
  ]
}
```

---

### GET /market/search

Search for instruments by name or symbol.

**Query Parameters:**
- `q` (required): Search query string
- `exchange` (optional): Filter by exchange
- `limit` (optional): Limit results (default: 20)

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "instrument_token": 738561,
      "tradingsymbol": "RELIANCE",
      "name": "Reliance Industries Limited",
      "exchange": "NSE",
      "segment": "NSE"
    }
  ]
}
```

---

### GET /market/quotes

Get real-time quotes for instruments.

**Query Parameters:**
- `instruments` (required): Comma-separated instrument identifiers (e.g., "NSE:RELIANCE,NSE:INFY")

**Response:**
```json
{
  "success": true,
  "data": {
    "NSE:RELIANCE": {
      "instrument_token": 738561,
      "tradingsymbol": "RELIANCE",
      "last_price": 2550.75,
      "volume": 1234567,
      "buy_quantity": 500000,
      "sell_quantity": 450000,
      "ohlc": {
        "open": 2540.00,
        "high": 2565.50,
        "low": 2535.25,
        "close": 2548.75
      },
      "net_change": 2.00,
      "oi": 0,
      "oi_day_high": 0,
      "oi_day_low": 0,
      "timestamp": "2024-01-15T10:30:00.000Z",
      "depth": {
        "buy": [
          {"price": 2550.50, "quantity": 100, "orders": 5},
          {"price": 2550.25, "quantity": 200, "orders": 8}
        ],
        "sell": [
          {"price": 2550.75, "quantity": 150, "orders": 6},
          {"price": 2551.00, "quantity": 250, "orders": 10}
        ]
      }
    }
  }
}
```

---

### GET /market/historical

Get historical OHLCV data for an instrument.

**Query Parameters:**
- `instrument` (required): Instrument identifier (e.g., "NSE:RELIANCE")
- `from` (required): Start date in YYYY-MM-DD format
- `to` (required): End date in YYYY-MM-DD format
- `interval` (required): Data interval ("minute", "3minute", "5minute", "10minute", "15minute", "30minute", "60minute", "day")
- `continuous` (optional): Continuous contract for futures (default: false)
- `oi` (optional): Include open interest data (default: false)

**Response:**
```json
{
  "success": true,
  "data": {
    "candles": [
      {
        "timestamp": "2024-01-15T09:15:00.000Z",
        "open": 2540.00,
        "high": 2545.50,
        "low": 2538.25,
        "close": 2542.75,
        "volume": 125000,
        "oi": 0
      }
    ],
    "metadata": {
      "instrument": "NSE:RELIANCE",
      "interval": "day",
      "from": "2024-01-01",
      "to": "2024-01-31",
      "count": 21
    }
  }
}
```

---

### GET /market/indices

Get major market indices data.

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "name": "NIFTY 50",
      "value": 21500.75,
      "change": 125.50,
      "change_percent": 0.59,
      "timestamp": "2024-01-15T10:30:00.000Z"
    },
    {
      "name": "SENSEX",
      "value": 71250.25,
      "change": 350.75,
      "change_percent": 0.49,
      "timestamp": "2024-01-15T10:30:00.000Z"
    }
  ]
}
```

---

### GET /market/status

Get market status and trading hours.

**Response:**
```json
{
  "success": true,
  "data": {
    "NSE": {
      "status": "OPEN",
      "market_type": "equity",
      "opening_time": "09:15",
      "closing_time": "15:30",
      "current_time": "10:30:00",
      "is_trading_day": true
    },
    "BSE": {
      "status": "OPEN",
      "market_type": "equity",
      "opening_time": "09:15",
      "closing_time": "15:30",
      "current_time": "10:30:00",
      "is_trading_day": true
    }
  }
}
```

## WebSocket Market Data

### Connection

Connect to real-time market data stream:

```
ws://localhost:3000/ws/market-data
```

**Headers:**
- `Authorization: Bearer <jwt_token>` (required)

### Subscribe to Instruments

**Message:**
```json
{
  "action": "subscribe",
  "instruments": ["NSE:RELIANCE", "NSE:INFY", "NSE:TCS"]
}
```

**Response:**
```json
{
  "type": "subscription_success",
  "subscribed_instruments": ["NSE:RELIANCE", "NSE:INFY", "NSE:TCS"],
  "subscribed_count": 3
}
```

### Unsubscribe from Instruments

**Message:**
```json
{
  "action": "unsubscribe",
  "instruments": ["NSE:RELIANCE"]
}
```

### Real-time Tick Data

**Message Format:**
```json
{
  "type": "tick",
  "instrument_token": 738561,
  "tradingsymbol": "RELIANCE",
  "exchange": "NSE",
  "last_price": 2550.75,
  "volume": 1234567,
  "ohlc": {
    "open": 2540.00,
    "high": 2565.50,
    "low": 2535.25,
    "close": 2548.75
  },
  "net_change": 2.00,
  "timestamp": "2024-01-15T10:30:15.123Z",
  "depth": {
    "buy": [
      {"price": 2550.50, "quantity": 100, "orders": 5}
    ],
    "sell": [
      {"price": 2550.75, "quantity": 150, "orders": 6}
    ]
  }
}
```

## Order Management Endpoints

### POST /orders

Place a new order.

**Request Body:**
```json
{
  "exchange": "NSE",
  "tradingsymbol": "RELIANCE",
  "transaction_type": "BUY",
  "quantity": 10,
  "product": "CNC",
  "order_type": "LIMIT",
  "price": 2550.00,
  "trigger_price": 2540.00,
  "validity": "DAY",
  "disclosed_quantity": 0,
  "squareoff": 0,
  "stoploss": 0,
  "trailing_stoploss": 0,
  "tag": "my_order_tag"
}
```

**Field Descriptions:**
- `exchange`: "NSE" or "BSE"
- `transaction_type`: "BUY" or "SELL"
- `product`: "CNC" (Cash & Carry), "MIS" (Intraday), "NRML" (Normal)
- `order_type`: "MARKET", "LIMIT", "SL" (Stop Loss), "SL-M" (Stop Loss Market)
- `validity`: "DAY", "IOC" (Immediate or Cancel)

**Response:**
```json
{
  "success": true,
  "data": {
    "order_id": "240115000123456",
    "status": "OPEN",
    "message": "Order placed successfully"
  }
}
```

**Error Codes:**
- `VALIDATION_ERROR`: Invalid order parameters
- `INSUFFICIENT_FUNDS`: Insufficient account balance
- `RISK_LIMIT_EXCEEDED`: Order exceeds risk limits
- `MARKET_CLOSED`: Market is closed for trading
- `INVALID_INSTRUMENT`: Invalid tradingsymbol or exchange

---

### GET /orders

Get all orders for the authenticated user.

**Query Parameters:**
- `status` (optional): Filter by order status ("OPEN", "COMPLETE", "CANCELLED", etc.)
- `from_date` (optional): Filter orders from date (YYYY-MM-DD)
- `to_date` (optional): Filter orders to date (YYYY-MM-DD)
- `limit` (optional): Limit number of results (default: 100)
- `offset` (optional): Pagination offset (default: 0)

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "order_id": "240115000123456",
      "exchange": "NSE",
      "tradingsymbol": "RELIANCE",
      "transaction_type": "BUY",
      "quantity": 10,
      "filled_quantity": 10,
      "pending_quantity": 0,
      "price": 2550.00,
      "average_price": 2549.75,
      "trigger_price": 0,
      "product": "CNC",
      "order_type": "LIMIT",
      "status": "COMPLETE",
      "status_message": "Order executed successfully",
      "validity": "DAY",
      "order_timestamp": "2024-01-15T10:15:00.000Z",
      "exchange_timestamp": "2024-01-15T10:15:05.000Z",
      "tag": "my_order_tag"
    }
  ],
  "pagination": {
    "total": 1,
    "limit": 100,
    "offset": 0,
    "has_more": false
  }
}
```

---

### GET /orders/:orderId

Get details of a specific order.

**Path Parameters:**
- `orderId` (required): Order ID

**Response:**
```json
{
  "success": true,
  "data": {
    "order_id": "240115000123456",
    "exchange": "NSE",
    "tradingsymbol": "RELIANCE",
    "transaction_type": "BUY",
    "quantity": 10,
    "filled_quantity": 10,
    "pending_quantity": 0,
    "price": 2550.00,
    "average_price": 2549.75,
    "product": "CNC",
    "order_type": "LIMIT",
    "status": "COMPLETE",
    "order_timestamp": "2024-01-15T10:15:00.000Z",
    "exchange_timestamp": "2024-01-15T10:15:05.000Z"
  }
}
```

---

### PUT /orders/:orderId

Modify an existing order.

**Path Parameters:**
- `orderId` (required): Order ID

**Request Body:**
```json
{
  "quantity": 15,
  "price": 2545.00,
  "trigger_price": 2535.00,
  "order_type": "LIMIT",
  "validity": "DAY"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "order_id": "240115000123456",
    "status": "OPEN",
    "message": "Order modified successfully"
  }
}
```

---

### DELETE /orders/:orderId

Cancel an existing order.

**Path Parameters:**
- `orderId` (required): Order ID

**Response:**
```json
{
  "success": true,
  "data": {
    "order_id": "240115000123456",
    "status": "CANCELLED",
    "message": "Order cancelled successfully"
  }
}
```

## Portfolio Management Endpoints

### GET /portfolio/positions

Get current trading positions.

**Query Parameters:**
- `date` (optional): Position date (YYYY-MM-DD, default: today)

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "tradingsymbol": "RELIANCE",
      "exchange": "NSE",
      "instrument_token": 738561,
      "product": "CNC",
      "quantity": 10,
      "overnight_quantity": 0,
      "multiplier": 1,
      "average_price": 2549.75,
      "close_price": 2548.75,
      "last_price": 2550.75,
      "value": 25497.50,
      "pnl": 10.00,
      "m2m": 20.00,
      "unrealised": 20.00,
      "realised": 0.00,
      "buy_quantity": 10,
      "buy_price": 2549.75,
      "buy_value": 25497.50,
      "sell_quantity": 0,
      "sell_price": 0,
      "sell_value": 0,
      "day_buy_quantity": 10,
      "day_buy_price": 2549.75,
      "day_buy_value": 25497.50,
      "day_sell_quantity": 0,
      "day_sell_price": 0,
      "day_sell_value": 0
    }
  ]
}
```

---

### GET /portfolio/holdings

Get long-term holdings.

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "tradingsymbol": "HDFCBANK",
      "exchange": "NSE",
      "instrument_token": 341249,
      "isin": "INE040A01034",
      "product": "CNC",
      "quantity": 50,
      "t1_quantity": 0,
      "realised_quantity": 50,
      "authorised_quantity": 50,
      "authorised_date": "2024-01-10T00:00:00.000Z",
      "opening_quantity": 50,
      "collateral_quantity": 0,
      "collateral_type": "",
      "discrepancy": false,
      "average_price": 1600.00,
      "last_price": 1650.00,
      "close_price": 1645.00,
      "pnl": 2500.00,
      "day_change": 5.00,
      "day_change_percent": 0.30
    }
  ]
}
```

---

### GET /portfolio/summary

Get portfolio summary with P&L calculations.

**Response:**
```json
{
  "success": true,
  "data": {
    "total_value": 125000.50,
    "total_investment": 110000.25,
    "day_change": 2500.75,
    "day_change_percent": 2.04,
    "total_pnl": 15000.25,
    "total_pnl_percent": 13.64,
    "unrealised_pnl": 12000.50,
    "realised_pnl": 2999.75,
    "positions_count": 5,
    "holdings_count": 3,
    "last_updated": "2024-01-15T10:30:00.000Z"
  }
}
```

---

### GET /portfolio/margins

Get margin information for different segments.

**Response:**
```json
{
  "success": true,
  "data": {
    "equity": {
      "enabled": true,
      "net": 50000.00,
      "available": {
        "adhoc_margin": 0,
        "cash": 45000.00,
        "opening_balance": 50000.00,
        "live_balance": 45000.00,
        "collateral": 0,
        "intraday_payin": 0
      },
      "utilised": {
        "debits": 5000.00,
        "exposure": 0,
        "m2m_realised": 0,
        "m2m_unrealised": 0,
        "option_premium": 0,
        "payout": 0,
        "span": 0,
        "holding_sales": 0,
        "turnover": 0,
        "liquid_collateral": 0,
        "stock_collateral": 0
      }
    },
    "commodity": {
      "enabled": false,
      "net": 0,
      "available": {},
      "utilised": {}
    }
  }
}
```

## Risk Management Endpoints

### GET /risk/status

Get current risk status for the user.

**Response:**
```json
{
  "success": true,
  "data": {
    "risk_level": "LOW",
    "daily_pnl": 1500.75,
    "daily_loss_limit": 10000.00,
    "daily_loss_used": 0.00,
    "daily_loss_remaining": 10000.00,
    "max_order_value": 50000.00,
    "max_position_size": 100,
    "orders_today": 5,
    "max_orders_per_minute": 10,
    "current_exposure": 25000.00,
    "max_exposure": 100000.00,
    "warnings": [],
    "restrictions": []
  }
}
```

---

### GET /risk/limits

Get configured risk limits for the user.

**Response:**
```json
{
  "success": true,
  "data": {
    "max_order_value": 50000.00,
    "max_daily_loss": 10000.00,
    "max_position_size": 100,
    "max_orders_per_minute": 10,
    "allowed_exchanges": ["NSE", "BSE"],
    "allowed_products": ["CNC", "MIS", "NRML"],
    "allowed_order_types": ["MARKET", "LIMIT", "SL", "SL-M"],
    "auto_square_off_enabled": true,
    "auto_square_off_time": "15:20",
    "created_at": "2024-01-10T00:00:00.000Z",
    "updated_at": "2024-01-15T10:00:00.000Z"
  }
}
```

---

### POST /risk/limits

Update risk limits for the user.

**Request Body:**
```json
{
  "max_order_value": 75000.00,
  "max_daily_loss": 15000.00,
  "max_position_size": 150,
  "max_orders_per_minute": 15,
  "allowed_exchanges": ["NSE", "BSE"],
  "allowed_products": ["CNC", "MIS"],
  "auto_square_off_enabled": true,
  "auto_square_off_time": "15:15"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "message": "Risk limits updated successfully",
    "effective_from": "2024-01-15T10:30:00.000Z"
  }
}
```

## System Endpoints

### GET /system/health

Get system health status.

**Response:**
```json
{
  "success": true,
  "data": {
    "overall_status": "HEALTHY",
    "services": {
      "auth_service": {
        "status": "HEALTHY",
        "response_time": 25,
        "last_check": "2024-01-15T10:30:00.000Z"
      },
      "market_data_service": {
        "status": "HEALTHY",
        "response_time": 15,
        "last_check": "2024-01-15T10:30:00.000Z"
      },
      "order_service": {
        "status": "HEALTHY",
        "response_time": 35,
        "last_check": "2024-01-15T10:30:00.000Z"
      }
    },
    "database": {
      "status": "CONNECTED",
      "response_time": 5,
      "connections": {
        "active": 8,
        "idle": 12,
        "total": 20
      }
    },
    "redis": {
      "status": "CONNECTED",
      "response_time": 2,
      "memory_usage": "45.2MB",
      "connected_clients": 15
    },
    "external_apis": {
      "zerodha_api": {
        "status": "HEALTHY",
        "response_time": 150,
        "rate_limit_remaining": 2850
      }
    }
  }
}
```

---

### GET /system/metrics

Get system performance metrics.

**Response:**
```json
{
  "success": true,
  "data": {
    "api_metrics": {
      "total_requests": 15420,
      "requests_per_minute": 125,
      "average_response_time": 45,
      "error_rate": 0.02,
      "success_rate": 99.98
    },
    "order_metrics": {
      "orders_placed": 1250,
      "orders_executed": 1235,
      "orders_cancelled": 15,
      "average_execution_time": 850,
      "execution_success_rate": 98.8
    },
    "websocket_metrics": {
      "active_connections": 45,
      "messages_sent": 125000,
      "messages_per_second": 850,
      "average_latency": 25,
      "connection_errors": 2
    },
    "database_metrics": {
      "query_count": 8500,
      "average_query_time": 15,
      "slow_queries": 5,
      "connection_pool_usage": 40
    }
  }
}
```

## Error Codes

### Authentication Errors (AUTH_xxx)
- `AUTH_001`: Invalid JWT token
- `AUTH_002`: Token expired
- `AUTH_003`: Invalid credentials
- `AUTH_004`: User not found
- `AUTH_005`: Account suspended
- `AUTH_006`: Rate limit exceeded

### Order Errors (ORDER_xxx)
- `ORDER_001`: Invalid order parameters
- `ORDER_002`: Insufficient funds
- `ORDER_003`: Order not found
- `ORDER_004`: Cannot modify order
- `ORDER_005`: Cannot cancel order
- `ORDER_006`: Market closed
- `ORDER_007`: Invalid instrument

### Risk Management Errors (RISK_xxx)
- `RISK_001`: Order value limit exceeded
- `RISK_002`: Daily loss limit exceeded
- `RISK_003`: Position size limit exceeded
- `RISK_004`: Order frequency limit exceeded
- `RISK_005`: Exchange not allowed
- `RISK_006`: Product not allowed

### Market Data Errors (MARKET_xxx)
- `MARKET_001`: Invalid instrument
- `MARKET_002`: Data not available
- `MARKET_003`: Subscription limit exceeded
- `MARKET_004`: WebSocket connection failed

### System Errors (SYS_xxx)
- `SYS_001`: Database connection failed
- `SYS_002`: Redis connection failed
- `SYS_003`: External API unavailable
- `SYS_004`: Service temporarily unavailable
- `SYS_005`: Internal server error

### Validation Errors (VAL_xxx)
- `VAL_001`: Missing required field
- `VAL_002`: Invalid field format
- `VAL_003`: Field value out of range
- `VAL_004`: Invalid enum value
- `VAL_005`: Field length exceeded

## Rate Limits

### Default Limits
- **Authentication**: 10 requests per minute per IP
- **Market Data**: 100 requests per minute per user
- **Orders**: 50 requests per minute per user
- **Portfolio**: 60 requests per minute per user
- **WebSocket**: 1000 messages per minute per connection

### Rate Limit Headers
All responses include rate limit information:

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1642248000
X-RateLimit-RetryAfter: 60
```

### Rate Limit Exceeded Response
```json
{
  "success": false,
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Rate limit exceeded. Try again in 60 seconds.",
    "details": {
      "limit": 100,
      "remaining": 0,
      "reset_at": "2024-01-15T10:31:00.000Z"
    }
  }
}
```

## Pagination

For endpoints that return lists, pagination is supported:

### Query Parameters
- `limit`: Number of items per page (default: 100, max: 1000)
- `offset`: Number of items to skip (default: 0)

### Response Format
```json
{
  "success": true,
  "data": [...],
  "pagination": {
    "total": 1500,
    "limit": 100,
    "offset": 0,
    "has_more": true,
    "next_offset": 100
  }
}
```

## Webhooks (Future Enhancement)

Webhook endpoints for real-time notifications:

### Order Status Updates
```json
{
  "event": "order.status_changed",
  "data": {
    "order_id": "240115000123456",
    "status": "COMPLETE",
    "timestamp": "2024-01-15T10:30:00.000Z"
  }
}
```

### Risk Limit Breaches
```json
{
  "event": "risk.limit_breached",
  "data": {
    "user_id": "user123",
    "limit_type": "daily_loss",
    "current_value": 12000,
    "limit_value": 10000,
    "timestamp": "2024-01-15T10:30:00.000Z"
  }
}
```