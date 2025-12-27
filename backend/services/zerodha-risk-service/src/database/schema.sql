-- User-specific risk limits table
CREATE TABLE IF NOT EXISTS user_risk_limits (
    user_id UUID PRIMARY KEY,
    
    -- Order-level limits
    max_order_value DECIMAL(15,2) NOT NULL DEFAULT 100000,
    max_position_size DECIMAL(15,2) NOT NULL DEFAULT 500000,
    max_orders_per_minute INTEGER NOT NULL DEFAULT 10,
    
    -- Portfolio-level limits
    max_daily_loss DECIMAL(15,2) NOT NULL DEFAULT 50000,
    max_portfolio_exposure DECIMAL(15,2) NOT NULL DEFAULT 1000000,
    max_sector_exposure DECIMAL(15,2) NOT NULL DEFAULT 300000,
    
    -- Product and exchange restrictions
    allowed_products JSONB NOT NULL DEFAULT '["CNC", "MIS", "NRML"]',
    allowed_exchanges JSONB NOT NULL DEFAULT '["NSE", "BSE"]',
    blocked_instruments JSONB NOT NULL DEFAULT '[]',
    
    -- Margin requirements
    margin_multiplier DECIMAL(3,2) NOT NULL DEFAULT 1.2,
    min_margin_balance DECIMAL(15,2) NOT NULL DEFAULT 10000,
    
    -- Time-based restrictions
    trading_hours_start TIME NOT NULL DEFAULT '09:15:00',
    trading_hours_end TIME NOT NULL DEFAULT '15:30:00',
    
    -- Auto square-off settings
    auto_square_off_enabled BOOLEAN NOT NULL DEFAULT true,
    square_off_time TIME NOT NULL DEFAULT '15:20:00',
    
    -- Alert thresholds
    loss_alert_threshold DECIMAL(3,2) NOT NULL DEFAULT 0.8,
    exposure_alert_threshold DECIMAL(3,2) NOT NULL DEFAULT 0.9,
    
    -- Metadata
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Global risk limits templates
CREATE TABLE IF NOT EXISTS global_risk_limits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    
    -- Same risk limit fields as user_risk_limits
    max_order_value DECIMAL(15,2) NOT NULL,
    max_position_size DECIMAL(15,2) NOT NULL,
    max_orders_per_minute INTEGER NOT NULL,
    max_daily_loss DECIMAL(15,2) NOT NULL,
    max_portfolio_exposure DECIMAL(15,2) NOT NULL,
    max_sector_exposure DECIMAL(15,2) NOT NULL,
    allowed_products JSONB NOT NULL,
    allowed_exchanges JSONB NOT NULL,
    blocked_instruments JSONB NOT NULL,
    margin_multiplier DECIMAL(3,2) NOT NULL,
    min_margin_balance DECIMAL(15,2) NOT NULL,
    trading_hours_start TIME NOT NULL,
    trading_hours_end TIME NOT NULL,
    auto_square_off_enabled BOOLEAN NOT NULL,
    square_off_time TIME NOT NULL,
    loss_alert_threshold DECIMAL(3,2) NOT NULL,
    exposure_alert_threshold DECIMAL(3,2) NOT NULL,
    
    -- Metadata
    is_default BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Risk breach tracking
CREATE TABLE IF NOT EXISTS risk_breaches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    breach_type VARCHAR(50) NOT NULL,
    limit_type VARCHAR(20) NOT NULL CHECK (limit_type IN ('USER', 'GLOBAL')),
    current_value DECIMAL(15,2) NOT NULL,
    limit_value DECIMAL(15,2) NOT NULL,
    breach_percentage DECIMAL(5,2) NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    is_resolved BOOLEAN NOT NULL DEFAULT false,
    action_taken TEXT,
    resolved_at TIMESTAMP WITH TIME ZONE,
    
    -- Indexes
    CONSTRAINT fk_risk_breach_user FOREIGN KEY (user_id) REFERENCES user_risk_limits(user_id)
);

-- Daily risk tracking for performance
CREATE TABLE IF NOT EXISTS daily_risk_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    trade_date DATE NOT NULL,
    
    -- Daily metrics
    total_orders INTEGER NOT NULL DEFAULT 0,
    total_order_value DECIMAL(15,2) NOT NULL DEFAULT 0,
    realized_pnl DECIMAL(15,2) NOT NULL DEFAULT 0,
    unrealized_pnl DECIMAL(15,2) NOT NULL DEFAULT 0,
    max_exposure DECIMAL(15,2) NOT NULL DEFAULT 0,
    margin_used DECIMAL(15,2) NOT NULL DEFAULT 0,
    
    -- Risk events
    risk_breaches INTEGER NOT NULL DEFAULT 0,
    orders_blocked INTEGER NOT NULL DEFAULT 0,
    auto_square_offs INTEGER NOT NULL DEFAULT 0,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(user_id, trade_date)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_risk_breaches_user_id ON risk_breaches(user_id);
CREATE INDEX IF NOT EXISTS idx_risk_breaches_timestamp ON risk_breaches(timestamp);
CREATE INDEX IF NOT EXISTS idx_risk_breaches_type ON risk_breaches(breach_type);
CREATE INDEX IF NOT EXISTS idx_daily_risk_metrics_user_date ON daily_risk_metrics(user_id, trade_date);
CREATE INDEX IF NOT EXISTS idx_user_risk_limits_active ON user_risk_limits(is_active) WHERE is_active = true;

-- Insert default global risk limit templates
INSERT INTO global_risk_limits (
    name, description, is_default,
    max_order_value, max_position_size, max_orders_per_minute,
    max_daily_loss, max_portfolio_exposure, max_sector_exposure,
    allowed_products, allowed_exchanges, blocked_instruments,
    margin_multiplier, min_margin_balance,
    trading_hours_start, trading_hours_end,
    auto_square_off_enabled, square_off_time,
    loss_alert_threshold, exposure_alert_threshold
) VALUES 
(
    'Default', 'Standard risk limits for most users', true,
    100000, 500000, 10,
    50000, 1000000, 300000,
    '["CNC", "MIS", "NRML"]', '["NSE", "BSE"]', '[]',
    1.2, 10000,
    '09:15:00', '15:30:00',
    true, '15:20:00',
    0.8, 0.9
),
(
    'Conservative', 'Lower risk limits for conservative traders', false,
    50000, 200000, 5,
    25000, 500000, 150000,
    '["CNC", "MIS", "NRML"]', '["NSE", "BSE"]', '[]',
    1.5, 15000,
    '09:15:00', '15:30:00',
    true, '15:20:00',
    0.7, 0.8
),
(
    'Aggressive', 'Higher risk limits for experienced traders', false,
    500000, 2000000, 20,
    200000, 5000000, 1000000,
    '["CNC", "MIS", "NRML"]', '["NSE", "BSE"]', '[]',
    1.1, 50000,
    '09:15:00', '15:30:00',
    true, '15:20:00',
    0.9, 0.95
)
ON CONFLICT (name) DO NOTHING;