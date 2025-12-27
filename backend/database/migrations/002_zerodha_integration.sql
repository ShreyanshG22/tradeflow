-- Migration: 002_zerodha_integration
-- Description: Add Zerodha integration tables for orders, positions, and user data
-- Created: 2024-12-27
-- Requires: 001_initial_schema

BEGIN;

-- Check if this migration has already been applied
DO $
BEGIN
    IF EXISTS (SELECT 1 FROM public.schema_migrations WHERE version = '002_zerodha_integration') THEN
        RAISE NOTICE 'Migration 002_zerodha_integration already applied, skipping...';
        ROLLBACK;
        RETURN;
    END IF;
END $;

-- Create zerodha schema for Zerodha-specific tables
CREATE SCHEMA IF NOT EXISTS zerodha;

-- Set search path to include zerodha schema
ALTER DATABASE tradeflow SET search_path TO public, auth, trading, analytics, market_data, zerodha;

-- ============================================================================
-- ZERODHA SCHEMA - Zerodha integration specific tables
-- ============================================================================

-- Extend users table with Zerodha-specific fields (Requirements: 1.3)
ALTER TABLE auth.users 
ADD COLUMN IF NOT EXISTS zerodha_user_id VARCHAR(50),
ADD COLUMN IF NOT EXISTS zerodha_access_token TEXT,
ADD COLUMN IF NOT EXISTS zerodha_refresh_token TEXT,
ADD COLUMN IF NOT EXISTS zerodha_token_expires_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS zerodha_api_key VARCHAR(100),
ADD COLUMN IF NOT EXISTS zerodha_public_token VARCHAR(100);

-- Zerodha user sessions for token management (Requirements: 1.3, 1.4)
CREATE TABLE IF NOT EXISTS zerodha.user_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    zerodha_user_id VARCHAR(50) NOT NULL,
    access_token_hash VARCHAR(255) NOT NULL,
    refresh_token_hash VARCHAR(255),
    public_token VARCHAR(100),
    login_time TIMESTAMP WITH TIME ZONE NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    last_used_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    is_active BOOLEAN DEFAULT true,
    session_data JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT zerodha_sessions_user_id_unique UNIQUE(user_id),
    CONSTRAINT zerodha_sessions_expires_future CHECK (expires_at > login_time)
);

-- Zerodha orders table (Requirements: 3.3, 3.4)
CREATE TABLE IF NOT EXISTS zerodha.orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    order_id VARCHAR(50) UNIQUE NOT NULL,
    parent_order_id VARCHAR(50),
    exchange VARCHAR(10) NOT NULL,
    tradingsymbol VARCHAR(50) NOT NULL,
    instrument_token BIGINT,
    transaction_type VARCHAR(10) NOT NULL, -- BUY, SELL
    quantity INTEGER NOT NULL,
    product VARCHAR(10) NOT NULL, -- CNC, MIS, NRML
    order_type VARCHAR(10) NOT NULL, -- MARKET, LIMIT, SL, SL-M
    price DECIMAL(10,2),
    trigger_price DECIMAL(10,2),
    disclosed_quantity INTEGER DEFAULT 0,
    validity VARCHAR(10) DEFAULT 'DAY', -- DAY, IOC
    validity_ttl INTEGER,
    iceberg_legs INTEGER,
    iceberg_quantity INTEGER,
    status VARCHAR(20) NOT NULL,
    status_message TEXT,
    filled_quantity INTEGER DEFAULT 0,
    pending_quantity INTEGER,
    cancelled_quantity INTEGER DEFAULT 0,
    average_price DECIMAL(10,2) DEFAULT 0,
    order_timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    exchange_timestamp TIMESTAMP WITH TIME ZONE,
    exchange_order_id VARCHAR(50),
    rejection_reason TEXT,
    placed_by VARCHAR(50),
    variety VARCHAR(20) DEFAULT 'regular', -- regular, bo, co, amo
    tag VARCHAR(50),
    guid VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT zerodha_orders_exchange_valid CHECK (exchange IN ('NSE', 'BSE', 'NFO', 'BFO', 'CDS', 'MCX')),
    CONSTRAINT zerodha_orders_transaction_type_valid CHECK (transaction_type IN ('BUY', 'SELL')),
    CONSTRAINT zerodha_orders_product_valid CHECK (product IN ('CNC', 'MIS', 'NRML')),
    CONSTRAINT zerodha_orders_order_type_valid CHECK (order_type IN ('MARKET', 'LIMIT', 'SL', 'SL-M')),
    CONSTRAINT zerodha_orders_validity_valid CHECK (validity IN ('DAY', 'IOC')),
    CONSTRAINT zerodha_orders_quantity_positive CHECK (quantity > 0),
    CONSTRAINT zerodha_orders_price_positive CHECK (price IS NULL OR price > 0),
    CONSTRAINT zerodha_orders_trigger_price_positive CHECK (trigger_price IS NULL OR trigger_price > 0)
);

-- Zerodha positions table (Requirements: 5.1, 5.4)
CREATE TABLE IF NOT EXISTS zerodha.positions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    tradingsymbol VARCHAR(50) NOT NULL,
    exchange VARCHAR(10) NOT NULL,
    instrument_token BIGINT,
    product VARCHAR(10) NOT NULL, -- CNC, MIS, NRML
    quantity INTEGER NOT NULL,
    overnight_quantity INTEGER DEFAULT 0,
    multiplier DECIMAL(10,4) DEFAULT 1.0000,
    average_price DECIMAL(10,2) NOT NULL,
    close_price DECIMAL(10,2),
    last_price DECIMAL(10,2),
    value DECIMAL(15,2),
    pnl DECIMAL(15,2),
    m2m DECIMAL(15,2), -- Mark to market
    unrealised DECIMAL(15,2),
    realised DECIMAL(15,2),
    buy_quantity INTEGER DEFAULT 0,
    buy_price DECIMAL(10,2) DEFAULT 0,
    buy_value DECIMAL(15,2) DEFAULT 0,
    buy_m2m DECIMAL(15,2) DEFAULT 0,
    sell_quantity INTEGER DEFAULT 0,
    sell_price DECIMAL(10,2) DEFAULT 0,
    sell_value DECIMAL(15,2) DEFAULT 0,
    sell_m2m DECIMAL(15,2) DEFAULT 0,
    day_buy_quantity INTEGER DEFAULT 0,
    day_buy_price DECIMAL(10,2) DEFAULT 0,
    day_buy_value DECIMAL(15,2) DEFAULT 0,
    day_sell_quantity INTEGER DEFAULT 0,
    day_sell_price DECIMAL(10,2) DEFAULT 0,
    day_sell_value DECIMAL(15,2) DEFAULT 0,
    position_date DATE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT zerodha_positions_exchange_valid CHECK (exchange IN ('NSE', 'BSE', 'NFO', 'BFO', 'CDS', 'MCX')),
    CONSTRAINT zerodha_positions_product_valid CHECK (product IN ('CNC', 'MIS', 'NRML')),
    UNIQUE(user_id, tradingsymbol, exchange, product, position_date)
);

-- Zerodha holdings table (Requirements: 5.2)
CREATE TABLE IF NOT EXISTS zerodha.holdings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    tradingsymbol VARCHAR(50) NOT NULL,
    exchange VARCHAR(10) NOT NULL,
    instrument_token BIGINT,
    isin VARCHAR(12),
    product VARCHAR(10) NOT NULL, -- CNC, MIS, NRML
    price DECIMAL(10,2) DEFAULT 0,
    quantity INTEGER NOT NULL,
    used_quantity INTEGER DEFAULT 0,
    t1_quantity INTEGER DEFAULT 0,
    realised_quantity INTEGER DEFAULT 0,
    authorised_quantity INTEGER DEFAULT 0,
    authorised_date DATE,
    opening_quantity INTEGER DEFAULT 0,
    collateral_quantity INTEGER DEFAULT 0,
    collateral_type VARCHAR(20),
    discrepancy BOOLEAN DEFAULT false,
    average_price DECIMAL(10,2) NOT NULL,
    last_price DECIMAL(10,2),
    close_price DECIMAL(10,2),
    pnl DECIMAL(15,2),
    day_change DECIMAL(15,2),
    day_change_percentage DECIMAL(8,4),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT zerodha_holdings_exchange_valid CHECK (exchange IN ('NSE', 'BSE', 'NFO', 'BFO', 'CDS', 'MCX')),
    CONSTRAINT zerodha_holdings_product_valid CHECK (product IN ('CNC', 'MIS', 'NRML')),
    CONSTRAINT zerodha_holdings_quantity_non_negative CHECK (quantity >= 0),
    CONSTRAINT zerodha_holdings_average_price_positive CHECK (average_price > 0),
    UNIQUE(user_id, tradingsymbol, exchange, product)
);

-- Zerodha instruments table for NSE/BSE instrument data (Requirements: 2.1, 9.1, 9.2)
CREATE TABLE IF NOT EXISTS zerodha.instruments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    instrument_token BIGINT UNIQUE NOT NULL,
    exchange_token BIGINT NOT NULL,
    tradingsymbol VARCHAR(50) NOT NULL,
    name VARCHAR(255),
    last_price DECIMAL(10,2) DEFAULT 0,
    expiry DATE,
    strike DECIMAL(10,2),
    tick_size DECIMAL(8,4) NOT NULL DEFAULT 0.0500,
    lot_size INTEGER NOT NULL DEFAULT 1,
    instrument_type VARCHAR(20) NOT NULL, -- EQ, FUT, CE, PE
    segment VARCHAR(20) NOT NULL, -- NSE, BSE, NFO, BFO, CDS, MCX
    exchange VARCHAR(10) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT zerodha_instruments_exchange_valid CHECK (exchange IN ('NSE', 'BSE', 'NFO', 'BFO', 'CDS', 'MCX')),
    CONSTRAINT zerodha_instruments_segment_valid CHECK (segment IN ('NSE', 'BSE', 'NFO', 'BFO', 'CDS', 'MCX')),
    CONSTRAINT zerodha_instruments_type_valid CHECK (instrument_type IN ('EQ', 'FUT', 'CE', 'PE')),
    CONSTRAINT zerodha_instruments_lot_size_positive CHECK (lot_size > 0),
    CONSTRAINT zerodha_instruments_tick_size_positive CHECK (tick_size > 0)
);

-- Zerodha market quotes cache (Requirements: 2.1, 6.2)
CREATE TABLE IF NOT EXISTS zerodha.market_quotes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    instrument_token BIGINT NOT NULL,
    tradingsymbol VARCHAR(50) NOT NULL,
    exchange VARCHAR(10) NOT NULL,
    last_price DECIMAL(10,2) NOT NULL,
    last_quantity INTEGER,
    average_price DECIMAL(10,2),
    volume INTEGER DEFAULT 0,
    buy_quantity INTEGER DEFAULT 0,
    sell_quantity INTEGER DEFAULT 0,
    ohlc_open DECIMAL(10,2),
    ohlc_high DECIMAL(10,2),
    ohlc_low DECIMAL(10,2),
    ohlc_close DECIMAL(10,2),
    net_change DECIMAL(10,2),
    lower_circuit_limit DECIMAL(10,2),
    upper_circuit_limit DECIMAL(10,2),
    oi BIGINT DEFAULT 0, -- Open Interest
    oi_day_high BIGINT DEFAULT 0,
    oi_day_low BIGINT DEFAULT 0,
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT zerodha_quotes_exchange_valid CHECK (exchange IN ('NSE', 'BSE', 'NFO', 'BFO', 'CDS', 'MCX')),
    CONSTRAINT zerodha_quotes_last_price_positive CHECK (last_price > 0),
    UNIQUE(instrument_token, timestamp)
);

-- Zerodha risk limits configuration (Requirements: 7.1, 7.5)
CREATE TABLE IF NOT EXISTS zerodha.risk_limits (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    limit_type VARCHAR(30) NOT NULL, -- max_order_value, max_daily_loss, max_position_size, max_orders_per_minute
    limit_value DECIMAL(15,2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'INR',
    is_active BOOLEAN DEFAULT true,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT zerodha_risk_limits_type_valid CHECK (limit_type IN (
        'max_order_value', 'max_daily_loss', 'max_position_size', 
        'max_orders_per_minute', 'max_exposure', 'max_leverage'
    )),
    CONSTRAINT zerodha_risk_limits_value_positive CHECK (limit_value > 0),
    UNIQUE(user_id, limit_type)
);

-- Zerodha risk breaches log (Requirements: 7.2, 7.4)
CREATE TABLE IF NOT EXISTS zerodha.risk_breaches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    breach_type VARCHAR(30) NOT NULL,
    breach_value DECIMAL(15,2) NOT NULL,
    limit_value DECIMAL(15,2) NOT NULL,
    order_id VARCHAR(50),
    tradingsymbol VARCHAR(50),
    exchange VARCHAR(10),
    action_taken VARCHAR(50), -- blocked, alert_sent, position_squared_off
    breach_timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    resolved_at TIMESTAMP WITH TIME ZONE,
    notes TEXT,
    
    CONSTRAINT zerodha_risk_breaches_type_valid CHECK (breach_type IN (
        'max_order_value', 'max_daily_loss', 'max_position_size', 
        'max_orders_per_minute', 'max_exposure', 'max_leverage'
    )),
    CONSTRAINT zerodha_risk_breaches_action_valid CHECK (action_taken IN (
        'blocked', 'alert_sent', 'position_squared_off', 'manual_review'
    ))
);

-- ============================================================================
-- INDEXES FOR ZERODHA TABLES
-- ============================================================================

-- Users table Zerodha-specific indexes
CREATE INDEX IF NOT EXISTS idx_users_zerodha_user_id ON auth.users(zerodha_user_id) WHERE zerodha_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_zerodha_token_expires ON auth.users(zerodha_token_expires_at) WHERE zerodha_token_expires_at IS NOT NULL;

-- Zerodha user sessions indexes
CREATE INDEX IF NOT EXISTS idx_zerodha_sessions_user_id ON zerodha.user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_zerodha_sessions_zerodha_user_id ON zerodha.user_sessions(zerodha_user_id);
CREATE INDEX IF NOT EXISTS idx_zerodha_sessions_expires_at ON zerodha.user_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_zerodha_sessions_active ON zerodha.user_sessions(user_id, is_active) WHERE is_active = true;

-- Zerodha orders indexes
CREATE INDEX IF NOT EXISTS idx_zerodha_orders_user_id ON zerodha.orders(user_id);
CREATE INDEX IF NOT EXISTS idx_zerodha_orders_order_id ON zerodha.orders(order_id);
CREATE INDEX IF NOT EXISTS idx_zerodha_orders_tradingsymbol ON zerodha.orders(tradingsymbol);
CREATE INDEX IF NOT EXISTS idx_zerodha_orders_exchange ON zerodha.orders(exchange);
CREATE INDEX IF NOT EXISTS idx_zerodha_orders_status ON zerodha.orders(status);
CREATE INDEX IF NOT EXISTS idx_zerodha_orders_order_timestamp ON zerodha.orders(order_timestamp);
CREATE INDEX IF NOT EXISTS idx_zerodha_orders_user_symbol ON zerodha.orders(user_id, tradingsymbol);
CREATE INDEX IF NOT EXISTS idx_zerodha_orders_user_status ON zerodha.orders(user_id, status);
CREATE INDEX IF NOT EXISTS idx_zerodha_orders_exchange_order_id ON zerodha.orders(exchange_order_id) WHERE exchange_order_id IS NOT NULL;

-- Zerodha positions indexes
CREATE INDEX IF NOT EXISTS idx_zerodha_positions_user_id ON zerodha.positions(user_id);
CREATE INDEX IF NOT EXISTS idx_zerodha_positions_tradingsymbol ON zerodha.positions(tradingsymbol);
CREATE INDEX IF NOT EXISTS idx_zerodha_positions_exchange ON zerodha.positions(exchange);
CREATE INDEX IF NOT EXISTS idx_zerodha_positions_position_date ON zerodha.positions(position_date);
CREATE INDEX IF NOT EXISTS idx_zerodha_positions_user_date ON zerodha.positions(user_id, position_date);
CREATE INDEX IF NOT EXISTS idx_zerodha_positions_user_symbol ON zerodha.positions(user_id, tradingsymbol, exchange);

-- Zerodha holdings indexes
CREATE INDEX IF NOT EXISTS idx_zerodha_holdings_user_id ON zerodha.holdings(user_id);
CREATE INDEX IF NOT EXISTS idx_zerodha_holdings_tradingsymbol ON zerodha.holdings(tradingsymbol);
CREATE INDEX IF NOT EXISTS idx_zerodha_holdings_exchange ON zerodha.holdings(exchange);
CREATE INDEX IF NOT EXISTS idx_zerodha_holdings_user_symbol ON zerodha.holdings(user_id, tradingsymbol, exchange);
CREATE INDEX IF NOT EXISTS idx_zerodha_holdings_isin ON zerodha.holdings(isin) WHERE isin IS NOT NULL;

-- Zerodha instruments indexes
CREATE INDEX IF NOT EXISTS idx_zerodha_instruments_token ON zerodha.instruments(instrument_token);
CREATE INDEX IF NOT EXISTS idx_zerodha_instruments_exchange_token ON zerodha.instruments(exchange_token);
CREATE INDEX IF NOT EXISTS idx_zerodha_instruments_tradingsymbol ON zerodha.instruments(tradingsymbol);
CREATE INDEX IF NOT EXISTS idx_zerodha_instruments_exchange ON zerodha.instruments(exchange);
CREATE INDEX IF NOT EXISTS idx_zerodha_instruments_segment ON zerodha.instruments(segment);
CREATE INDEX IF NOT EXISTS idx_zerodha_instruments_type ON zerodha.instruments(instrument_type);
CREATE INDEX IF NOT EXISTS idx_zerodha_instruments_name ON zerodha.instruments USING gin(to_tsvector('english', name));
CREATE INDEX IF NOT EXISTS idx_zerodha_instruments_search ON zerodha.instruments(exchange, segment, instrument_type);

-- Zerodha market quotes indexes
CREATE INDEX IF NOT EXISTS idx_zerodha_quotes_instrument_token ON zerodha.market_quotes(instrument_token);
CREATE INDEX IF NOT EXISTS idx_zerodha_quotes_tradingsymbol ON zerodha.market_quotes(tradingsymbol);
CREATE INDEX IF NOT EXISTS idx_zerodha_quotes_exchange ON zerodha.market_quotes(exchange);
CREATE INDEX IF NOT EXISTS idx_zerodha_quotes_timestamp ON zerodha.market_quotes(timestamp);
CREATE INDEX IF NOT EXISTS idx_zerodha_quotes_token_timestamp ON zerodha.market_quotes(instrument_token, timestamp);

-- Zerodha risk limits indexes
CREATE INDEX IF NOT EXISTS idx_zerodha_risk_limits_user_id ON zerodha.risk_limits(user_id);
CREATE INDEX IF NOT EXISTS idx_zerodha_risk_limits_type ON zerodha.risk_limits(limit_type);
CREATE INDEX IF NOT EXISTS idx_zerodha_risk_limits_active ON zerodha.risk_limits(user_id, is_active) WHERE is_active = true;

-- Zerodha risk breaches indexes
CREATE INDEX IF NOT EXISTS idx_zerodha_risk_breaches_user_id ON zerodha.risk_breaches(user_id);
CREATE INDEX IF NOT EXISTS idx_zerodha_risk_breaches_type ON zerodha.risk_breaches(breach_type);
CREATE INDEX IF NOT EXISTS idx_zerodha_risk_breaches_timestamp ON zerodha.risk_breaches(breach_timestamp);
CREATE INDEX IF NOT EXISTS idx_zerodha_risk_breaches_order_id ON zerodha.risk_breaches(order_id) WHERE order_id IS NOT NULL;

-- ============================================================================
-- TRIGGERS FOR ZERODHA TABLES
-- ============================================================================

-- Updated at triggers for Zerodha tables
CREATE TRIGGER update_zerodha_sessions_updated_at BEFORE UPDATE ON zerodha.user_sessions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_zerodha_orders_updated_at BEFORE UPDATE ON zerodha.orders
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_zerodha_positions_updated_at BEFORE UPDATE ON zerodha.positions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_zerodha_holdings_updated_at BEFORE UPDATE ON zerodha.holdings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_zerodha_instruments_updated_at BEFORE UPDATE ON zerodha.instruments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_zerodha_risk_limits_updated_at BEFORE UPDATE ON zerodha.risk_limits
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to calculate position P&L
CREATE OR REPLACE FUNCTION calculate_zerodha_position_pnl()
RETURNS TRIGGER AS $
BEGIN
    -- Calculate unrealized P&L for positions
    IF NEW.last_price IS NOT NULL AND NEW.average_price IS NOT NULL THEN
        NEW.unrealised = (NEW.last_price - NEW.average_price) * NEW.quantity;
        NEW.pnl = COALESCE(NEW.realised, 0) + NEW.unrealised;
        NEW.m2m = NEW.unrealised;
    END IF;
    
    RETURN NEW;
END;
$ language 'plpgsql';

CREATE TRIGGER calculate_zerodha_position_pnl_trigger 
    BEFORE INSERT OR UPDATE ON zerodha.positions
    FOR EACH ROW EXECUTE FUNCTION calculate_zerodha_position_pnl();

-- Function to calculate holdings P&L
CREATE OR REPLACE FUNCTION calculate_zerodha_holdings_pnl()
RETURNS TRIGGER AS $
BEGIN
    -- Calculate P&L and day change for holdings
    IF NEW.last_price IS NOT NULL AND NEW.average_price IS NOT NULL THEN
        NEW.pnl = (NEW.last_price - NEW.average_price) * NEW.quantity;
    END IF;
    
    IF NEW.last_price IS NOT NULL AND NEW.close_price IS NOT NULL THEN
        NEW.day_change = (NEW.last_price - NEW.close_price) * NEW.quantity;
        IF NEW.close_price > 0 THEN
            NEW.day_change_percentage = ((NEW.last_price - NEW.close_price) / NEW.close_price) * 100;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$ language 'plpgsql';

CREATE TRIGGER calculate_zerodha_holdings_pnl_trigger 
    BEFORE INSERT OR UPDATE ON zerodha.holdings
    FOR EACH ROW EXECUTE FUNCTION calculate_zerodha_holdings_pnl();

-- Record this migration
INSERT INTO public.schema_migrations (version, description, checksum) 
VALUES (
    '002_zerodha_integration', 
    'Add Zerodha integration tables for orders, positions, and user data',
    'z1e2r3o4d5h6a7i8n9t0e1g2r3a4t5i6'  -- This would be calculated from file content
);

COMMIT;