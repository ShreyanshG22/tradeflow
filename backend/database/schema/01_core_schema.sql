-- TradeFlow Core Database Schema
-- This file contains the complete database schema for the TradeFlow trading platform

-- Create extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";
CREATE EXTENSION IF NOT EXISTS "btree_gin";

-- Create schemas
CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS trading;
CREATE SCHEMA IF NOT EXISTS analytics;
CREATE SCHEMA IF NOT EXISTS market_data;

-- Set default search path
ALTER DATABASE tradeflow SET search_path TO public, auth, trading, analytics, market_data;

-- ============================================================================
-- AUTH SCHEMA - User management and authentication
-- ============================================================================

-- Users table (Requirements: 1.1, 1.2)
CREATE TABLE IF NOT EXISTS auth.users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    phone VARCHAR(20),
    timezone VARCHAR(50) DEFAULT 'UTC',
    is_active BOOLEAN DEFAULT true,
    is_verified BOOLEAN DEFAULT false,
    last_login_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT users_email_format CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$')
);

-- User sessions table (Requirements: 1.3, 1.4)
CREATE TABLE IF NOT EXISTS auth.user_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL,
    refresh_token_hash VARCHAR(255),
    device_info JSONB,
    ip_address INET,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_used_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    is_revoked BOOLEAN DEFAULT false
);

-- User preferences and settings (Requirements: 1.5)
CREATE TABLE IF NOT EXISTS auth.user_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    setting_key VARCHAR(100) NOT NULL,
    setting_value JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(user_id, setting_key)
);

-- ============================================================================
-- TRADING SCHEMA - Core trading functionality
-- ============================================================================

-- Strategies table (Requirements: 2.1, 2.2, 2.4)
CREATE TABLE IF NOT EXISTS trading.strategies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    config_json JSONB NOT NULL,
    version INTEGER DEFAULT 1,
    parent_strategy_id UUID REFERENCES trading.strategies(id),
    is_active BOOLEAN DEFAULT false,
    is_template BOOLEAN DEFAULT false,
    tags TEXT[],
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT strategies_name_length CHECK (LENGTH(name) >= 3),
    CONSTRAINT strategies_version_positive CHECK (version > 0)
);

-- Strategy executions (Requirements: 5.1, 5.2)
CREATE TABLE IF NOT EXISTS trading.strategy_executions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    strategy_id UUID NOT NULL REFERENCES trading.strategies(id) ON DELETE CASCADE,
    portfolio_id UUID NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    execution_mode VARCHAR(20) NOT NULL DEFAULT 'paper', -- paper, live, backtest
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    error_message TEXT,
    execution_params JSONB,
    
    CONSTRAINT strategy_executions_status_valid CHECK (status IN ('pending', 'running', 'completed', 'failed', 'stopped')),
    CONSTRAINT strategy_executions_mode_valid CHECK (execution_mode IN ('paper', 'live', 'backtest'))
);

-- Portfolios table (Requirements: 6.1, 6.2)
CREATE TABLE IF NOT EXISTS trading.portfolios (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    portfolio_type VARCHAR(20) NOT NULL DEFAULT 'trading', -- trading, paper, backtest
    base_currency VARCHAR(3) DEFAULT 'USD',
    initial_cash DECIMAL(15,2) NOT NULL DEFAULT 0.00,
    cash_balance DECIMAL(15,2) DEFAULT 0.00,
    total_value DECIMAL(15,2) DEFAULT 0.00,
    unrealized_pnl DECIMAL(15,2) DEFAULT 0.00,
    realized_pnl DECIMAL(15,2) DEFAULT 0.00,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT portfolios_name_length CHECK (LENGTH(name) >= 3),
    CONSTRAINT portfolios_type_valid CHECK (portfolio_type IN ('trading', 'paper', 'backtest')),
    CONSTRAINT portfolios_currency_valid CHECK (LENGTH(base_currency) = 3),
    CONSTRAINT portfolios_cash_positive CHECK (cash_balance >= 0)
);

-- Positions table (Requirements: 6.1, 6.2)
CREATE TABLE IF NOT EXISTS trading.positions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    portfolio_id UUID NOT NULL REFERENCES trading.portfolios(id) ON DELETE CASCADE,
    symbol VARCHAR(20) NOT NULL,
    quantity DECIMAL(15,8) NOT NULL DEFAULT 0,
    avg_price DECIMAL(15,8),
    current_price DECIMAL(15,8),
    market_value DECIMAL(15,2),
    unrealized_pnl DECIMAL(15,2) DEFAULT 0.00,
    realized_pnl DECIMAL(15,2) DEFAULT 0.00,
    side VARCHAR(5) NOT NULL, -- long, short
    opened_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT positions_symbol_format CHECK (LENGTH(symbol) >= 1 AND LENGTH(symbol) <= 20),
    CONSTRAINT positions_side_valid CHECK (side IN ('long', 'short')),
    UNIQUE(portfolio_id, symbol, side)
);

-- Trades table (Requirements: 6.1, 6.2)
CREATE TABLE IF NOT EXISTS trading.trades (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    portfolio_id UUID NOT NULL REFERENCES trading.portfolios(id) ON DELETE CASCADE,
    strategy_id UUID REFERENCES trading.strategies(id),
    position_id UUID REFERENCES trading.positions(id),
    symbol VARCHAR(20) NOT NULL,
    side VARCHAR(4) NOT NULL, -- buy, sell
    quantity DECIMAL(15,8) NOT NULL,
    price DECIMAL(15,8) NOT NULL,
    total_amount DECIMAL(15,2) NOT NULL,
    fees DECIMAL(15,2) DEFAULT 0.00,
    commission DECIMAL(15,2) DEFAULT 0.00,
    trade_type VARCHAR(20) DEFAULT 'market', -- market, limit, stop, stop_limit
    status VARCHAR(20) DEFAULT 'pending', -- pending, filled, cancelled, rejected
    order_id VARCHAR(100),
    broker_trade_id VARCHAR(100),
    executed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT trades_symbol_format CHECK (LENGTH(symbol) >= 1 AND LENGTH(symbol) <= 20),
    CONSTRAINT trades_side_valid CHECK (side IN ('buy', 'sell')),
    CONSTRAINT trades_quantity_positive CHECK (quantity > 0),
    CONSTRAINT trades_price_positive CHECK (price > 0),
    CONSTRAINT trades_type_valid CHECK (trade_type IN ('market', 'limit', 'stop', 'stop_limit')),
    CONSTRAINT trades_status_valid CHECK (status IN ('pending', 'filled', 'cancelled', 'rejected', 'partial'))
);

-- Orders table for order management
CREATE TABLE IF NOT EXISTS trading.orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    portfolio_id UUID NOT NULL REFERENCES trading.portfolios(id) ON DELETE CASCADE,
    strategy_id UUID REFERENCES trading.strategies(id),
    symbol VARCHAR(20) NOT NULL,
    side VARCHAR(4) NOT NULL, -- buy, sell
    order_type VARCHAR(20) NOT NULL, -- market, limit, stop, stop_limit
    quantity DECIMAL(15,8) NOT NULL,
    price DECIMAL(15,8),
    stop_price DECIMAL(15,8),
    filled_quantity DECIMAL(15,8) DEFAULT 0,
    remaining_quantity DECIMAL(15,8),
    status VARCHAR(20) DEFAULT 'pending',
    time_in_force VARCHAR(10) DEFAULT 'GTC', -- GTC, IOC, FOK, DAY
    broker_order_id VARCHAR(100),
    submitted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    filled_at TIMESTAMP WITH TIME ZONE,
    cancelled_at TIMESTAMP WITH TIME ZONE,
    
    CONSTRAINT orders_symbol_format CHECK (LENGTH(symbol) >= 1 AND LENGTH(symbol) <= 20),
    CONSTRAINT orders_side_valid CHECK (side IN ('buy', 'sell')),
    CONSTRAINT orders_type_valid CHECK (order_type IN ('market', 'limit', 'stop', 'stop_limit')),
    CONSTRAINT orders_quantity_positive CHECK (quantity > 0),
    CONSTRAINT orders_status_valid CHECK (status IN ('pending', 'submitted', 'filled', 'cancelled', 'rejected', 'partial')),
    CONSTRAINT orders_tif_valid CHECK (time_in_force IN ('GTC', 'IOC', 'FOK', 'DAY'))
);

-- ============================================================================
-- MARKET_DATA SCHEMA - Market data and pricing
-- ============================================================================

-- Market data symbols
CREATE TABLE IF NOT EXISTS market_data.symbols (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    symbol VARCHAR(20) UNIQUE NOT NULL,
    name VARCHAR(255),
    exchange VARCHAR(50),
    asset_type VARCHAR(20), -- stock, forex, crypto, commodity
    base_currency VARCHAR(3),
    quote_currency VARCHAR(3),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT symbols_symbol_format CHECK (LENGTH(symbol) >= 1 AND LENGTH(symbol) <= 20),
    CONSTRAINT symbols_asset_type_valid CHECK (asset_type IN ('stock', 'forex', 'crypto', 'commodity', 'index'))
);

-- Historical price data
CREATE TABLE IF NOT EXISTS market_data.price_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    symbol VARCHAR(20) NOT NULL,
    timeframe VARCHAR(10) NOT NULL, -- 1m, 5m, 15m, 1h, 4h, 1d
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    open_price DECIMAL(15,8) NOT NULL,
    high_price DECIMAL(15,8) NOT NULL,
    low_price DECIMAL(15,8) NOT NULL,
    close_price DECIMAL(15,8) NOT NULL,
    volume DECIMAL(20,8) DEFAULT 0,
    
    CONSTRAINT price_history_symbol_format CHECK (LENGTH(symbol) >= 1 AND LENGTH(symbol) <= 20),
    CONSTRAINT price_history_timeframe_valid CHECK (timeframe IN ('1m', '5m', '15m', '30m', '1h', '4h', '1d', '1w')),
    CONSTRAINT price_history_prices_positive CHECK (open_price > 0 AND high_price > 0 AND low_price > 0 AND close_price > 0),
    CONSTRAINT price_history_high_low CHECK (high_price >= low_price),
    UNIQUE(symbol, timeframe, timestamp)
);

-- ============================================================================
-- ANALYTICS SCHEMA - Performance tracking and analytics
-- ============================================================================

-- Backtests table (Requirements: 3.1, 3.2, 3.3)
CREATE TABLE IF NOT EXISTS analytics.backtests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    strategy_id UUID NOT NULL REFERENCES trading.strategies(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    initial_capital DECIMAL(15,2) NOT NULL,
    symbols TEXT[] NOT NULL,
    timeframe VARCHAR(10) NOT NULL,
    status VARCHAR(20) DEFAULT 'pending',
    progress INTEGER DEFAULT 0,
    results_json JSONB,
    performance_metrics JSONB,
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT backtests_name_length CHECK (LENGTH(name) >= 3),
    CONSTRAINT backtests_date_range CHECK (end_date >= start_date),
    CONSTRAINT backtests_capital_positive CHECK (initial_capital > 0),
    CONSTRAINT backtests_status_valid CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
    CONSTRAINT backtests_progress_range CHECK (progress >= 0 AND progress <= 100)
);

-- Performance metrics table (Requirements: 6.3, 6.6)
CREATE TABLE IF NOT EXISTS analytics.performance_metrics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    portfolio_id UUID REFERENCES trading.portfolios(id) ON DELETE CASCADE,
    backtest_id UUID REFERENCES analytics.backtests(id) ON DELETE CASCADE,
    strategy_id UUID REFERENCES trading.strategies(id),
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    total_return DECIMAL(10,4),
    annualized_return DECIMAL(10,4),
    volatility DECIMAL(10,4),
    sharpe_ratio DECIMAL(10,4),
    sortino_ratio DECIMAL(10,4),
    max_drawdown DECIMAL(10,4),
    win_rate DECIMAL(5,4),
    profit_factor DECIMAL(10,4),
    total_trades INTEGER DEFAULT 0,
    winning_trades INTEGER DEFAULT 0,
    losing_trades INTEGER DEFAULT 0,
    avg_win DECIMAL(15,2),
    avg_loss DECIMAL(15,2),
    largest_win DECIMAL(15,2),
    largest_loss DECIMAL(15,2),
    calculated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT performance_metrics_date_range CHECK (period_end >= period_start),
    CONSTRAINT performance_metrics_win_rate CHECK (win_rate >= 0 AND win_rate <= 1),
    CONSTRAINT performance_metrics_trades_positive CHECK (total_trades >= 0),
    CONSTRAINT performance_metrics_trades_sum CHECK (winning_trades + losing_trades <= total_trades)
);

-- ============================================================================
-- INDEXES FOR HIGH PERFORMANCE QUERIES
-- ============================================================================

-- Auth schema indexes
CREATE INDEX IF NOT EXISTS idx_users_email ON auth.users(email);
CREATE INDEX IF NOT EXISTS idx_users_active ON auth.users(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_users_created_at ON auth.users(created_at);

CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON auth.user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_token_hash ON auth.user_sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_user_sessions_expires_at ON auth.user_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_user_sessions_active ON auth.user_sessions(user_id, expires_at) WHERE is_revoked = false;

CREATE INDEX IF NOT EXISTS idx_user_settings_user_id ON auth.user_settings(user_id);
CREATE INDEX IF NOT EXISTS idx_user_settings_key ON auth.user_settings(setting_key);

-- Trading schema indexes
CREATE INDEX IF NOT EXISTS idx_strategies_user_id ON trading.strategies(user_id);
CREATE INDEX IF NOT EXISTS idx_strategies_active ON trading.strategies(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_strategies_template ON trading.strategies(is_template) WHERE is_template = true;
CREATE INDEX IF NOT EXISTS idx_strategies_tags ON trading.strategies USING gin(tags);
CREATE INDEX IF NOT EXISTS idx_strategies_created_at ON trading.strategies(created_at);

CREATE INDEX IF NOT EXISTS idx_strategy_executions_strategy_id ON trading.strategy_executions(strategy_id);
CREATE INDEX IF NOT EXISTS idx_strategy_executions_portfolio_id ON trading.strategy_executions(portfolio_id);
CREATE INDEX IF NOT EXISTS idx_strategy_executions_status ON trading.strategy_executions(status);
CREATE INDEX IF NOT EXISTS idx_strategy_executions_mode ON trading.strategy_executions(execution_mode);

CREATE INDEX IF NOT EXISTS idx_portfolios_user_id ON trading.portfolios(user_id);
CREATE INDEX IF NOT EXISTS idx_portfolios_active ON trading.portfolios(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_portfolios_type ON trading.portfolios(portfolio_type);

CREATE INDEX IF NOT EXISTS idx_positions_portfolio_id ON trading.positions(portfolio_id);
CREATE INDEX IF NOT EXISTS idx_positions_symbol ON trading.positions(symbol);
CREATE INDEX IF NOT EXISTS idx_positions_portfolio_symbol ON trading.positions(portfolio_id, symbol);
CREATE INDEX IF NOT EXISTS idx_positions_updated_at ON trading.positions(updated_at);

CREATE INDEX IF NOT EXISTS idx_trades_portfolio_id ON trading.trades(portfolio_id);
CREATE INDEX IF NOT EXISTS idx_trades_strategy_id ON trading.trades(strategy_id);
CREATE INDEX IF NOT EXISTS idx_trades_symbol ON trading.trades(symbol);
CREATE INDEX IF NOT EXISTS idx_trades_status ON trading.trades(status);
CREATE INDEX IF NOT EXISTS idx_trades_created_at ON trading.trades(created_at);
CREATE INDEX IF NOT EXISTS idx_trades_executed_at ON trading.trades(executed_at);
CREATE INDEX IF NOT EXISTS idx_trades_portfolio_symbol_date ON trading.trades(portfolio_id, symbol, created_at);

CREATE INDEX IF NOT EXISTS idx_orders_portfolio_id ON trading.orders(portfolio_id);
CREATE INDEX IF NOT EXISTS idx_orders_strategy_id ON trading.orders(strategy_id);
CREATE INDEX IF NOT EXISTS idx_orders_symbol ON trading.orders(symbol);
CREATE INDEX IF NOT EXISTS idx_orders_status ON trading.orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_submitted_at ON trading.orders(submitted_at);
CREATE INDEX IF NOT EXISTS idx_orders_broker_id ON trading.orders(broker_order_id);

-- Market data schema indexes
CREATE INDEX IF NOT EXISTS idx_symbols_symbol ON market_data.symbols(symbol);
CREATE INDEX IF NOT EXISTS idx_symbols_exchange ON market_data.symbols(exchange);
CREATE INDEX IF NOT EXISTS idx_symbols_asset_type ON market_data.symbols(asset_type);
CREATE INDEX IF NOT EXISTS idx_symbols_active ON market_data.symbols(is_active) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_price_history_symbol ON market_data.price_history(symbol);
CREATE INDEX IF NOT EXISTS idx_price_history_timeframe ON market_data.price_history(timeframe);
CREATE INDEX IF NOT EXISTS idx_price_history_timestamp ON market_data.price_history(timestamp);
CREATE INDEX IF NOT EXISTS idx_price_history_symbol_timeframe_timestamp ON market_data.price_history(symbol, timeframe, timestamp);

-- Analytics schema indexes
CREATE INDEX IF NOT EXISTS idx_backtests_user_id ON analytics.backtests(user_id);
CREATE INDEX IF NOT EXISTS idx_backtests_strategy_id ON analytics.backtests(strategy_id);
CREATE INDEX IF NOT EXISTS idx_backtests_status ON analytics.backtests(status);
CREATE INDEX IF NOT EXISTS idx_backtests_created_at ON analytics.backtests(created_at);
CREATE INDEX IF NOT EXISTS idx_backtests_date_range ON analytics.backtests(start_date, end_date);

CREATE INDEX IF NOT EXISTS idx_performance_metrics_portfolio_id ON analytics.performance_metrics(portfolio_id);
CREATE INDEX IF NOT EXISTS idx_performance_metrics_backtest_id ON analytics.performance_metrics(backtest_id);
CREATE INDEX IF NOT EXISTS idx_performance_metrics_strategy_id ON analytics.performance_metrics(strategy_id);
CREATE INDEX IF NOT EXISTS idx_performance_metrics_period ON analytics.performance_metrics(period_start, period_end);

-- ============================================================================
-- TRIGGERS AND FUNCTIONS
-- ============================================================================

-- Updated at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply updated_at triggers
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON auth.users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_settings_updated_at BEFORE UPDATE ON auth.user_settings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_strategies_updated_at BEFORE UPDATE ON trading.strategies
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_portfolios_updated_at BEFORE UPDATE ON trading.portfolios
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_positions_updated_at BEFORE UPDATE ON trading.positions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Portfolio value calculation trigger
CREATE OR REPLACE FUNCTION calculate_portfolio_value()
RETURNS TRIGGER AS $$
BEGIN
    -- Update portfolio total value when positions change
    UPDATE trading.portfolios 
    SET total_value = cash_balance + COALESCE((
        SELECT SUM(market_value) 
        FROM trading.positions 
        WHERE portfolio_id = NEW.portfolio_id
    ), 0)
    WHERE id = NEW.portfolio_id;
    
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_portfolio_value_on_position_change 
    AFTER INSERT OR UPDATE OR DELETE ON trading.positions
    FOR EACH ROW EXECUTE FUNCTION calculate_portfolio_value();

-- Position quantity update trigger
CREATE OR REPLACE FUNCTION update_position_on_trade()
RETURNS TRIGGER AS $$
DECLARE
    position_record trading.positions%ROWTYPE;
    quantity_change DECIMAL(15,8);
BEGIN
    -- Calculate quantity change based on trade side
    IF NEW.side = 'buy' THEN
        quantity_change = NEW.quantity;
    ELSE
        quantity_change = -NEW.quantity;
    END IF;
    
    -- Find existing position
    SELECT * INTO position_record 
    FROM trading.positions 
    WHERE portfolio_id = NEW.portfolio_id 
    AND symbol = NEW.symbol 
    AND side = CASE WHEN quantity_change > 0 THEN 'long' ELSE 'short' END;
    
    IF FOUND THEN
        -- Update existing position
        UPDATE trading.positions 
        SET quantity = quantity + ABS(quantity_change),
            avg_price = ((avg_price * quantity) + (NEW.price * NEW.quantity)) / (quantity + NEW.quantity),
            updated_at = NOW()
        WHERE id = position_record.id;
    ELSE
        -- Create new position
        INSERT INTO trading.positions (portfolio_id, symbol, quantity, avg_price, side)
        VALUES (NEW.portfolio_id, NEW.symbol, ABS(quantity_change), NEW.price, 
                CASE WHEN quantity_change > 0 THEN 'long' ELSE 'short' END);
    END IF;
    
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_position_on_trade_fill 
    AFTER INSERT ON trading.trades
    FOR EACH ROW 
    WHEN (NEW.status = 'filled')
    EXECUTE FUNCTION update_position_on_trade();