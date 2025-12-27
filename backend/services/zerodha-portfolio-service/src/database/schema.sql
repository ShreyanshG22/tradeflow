-- Zerodha-specific tables for portfolio service

-- Zerodha positions table (Requirements: 5.1, 5.4)
CREATE TABLE IF NOT EXISTS zerodha_positions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tradingsymbol VARCHAR(50) NOT NULL,
  exchange VARCHAR(10) NOT NULL,
  instrument_token BIGINT NOT NULL,
  product VARCHAR(10) NOT NULL, -- CNC, MIS, NRML
  quantity DECIMAL(15,8) NOT NULL DEFAULT 0,
  overnight_quantity DECIMAL(15,8) DEFAULT 0,
  multiplier DECIMAL(10,4) DEFAULT 1,
  average_price DECIMAL(15,8) NOT NULL,
  close_price DECIMAL(15,8),
  last_price DECIMAL(15,8),
  value DECIMAL(15,2),
  pnl DECIMAL(15,2) DEFAULT 0.00,
  m2m DECIMAL(15,2) DEFAULT 0.00,
  unrealised DECIMAL(15,2) DEFAULT 0.00,
  realised DECIMAL(15,2) DEFAULT 0.00,
  buy_quantity DECIMAL(15,8) DEFAULT 0,
  buy_price DECIMAL(15,8) DEFAULT 0,
  buy_value DECIMAL(15,2) DEFAULT 0,
  buy_m2m DECIMAL(15,2) DEFAULT 0,
  sell_quantity DECIMAL(15,8) DEFAULT 0,
  sell_price DECIMAL(15,8) DEFAULT 0,
  sell_value DECIMAL(15,2) DEFAULT 0,
  sell_m2m DECIMAL(15,2) DEFAULT 0,
  day_buy_quantity DECIMAL(15,8) DEFAULT 0,
  day_buy_price DECIMAL(15,8) DEFAULT 0,
  day_buy_value DECIMAL(15,2) DEFAULT 0,
  day_sell_quantity DECIMAL(15,8) DEFAULT 0,
  day_sell_price DECIMAL(15,8) DEFAULT 0,
  day_sell_value DECIMAL(15,2) DEFAULT 0,
  position_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  CONSTRAINT zerodha_positions_symbol_format CHECK (LENGTH(tradingsymbol) >= 1),
  CONSTRAINT zerodha_positions_exchange_valid CHECK (exchange IN ('NSE', 'BSE', 'NFO', 'BFO', 'CDS', 'MCX')),
  CONSTRAINT zerodha_positions_product_valid CHECK (product IN ('CNC', 'MIS', 'NRML')),
  UNIQUE(user_id, tradingsymbol, exchange, product, position_date)
);

-- Zerodha holdings table (Requirements: 5.2, 5.3)
CREATE TABLE IF NOT EXISTS zerodha_holdings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tradingsymbol VARCHAR(50) NOT NULL,
  exchange VARCHAR(10) NOT NULL,
  instrument_token BIGINT NOT NULL,
  isin VARCHAR(12),
  product VARCHAR(10) NOT NULL,
  price DECIMAL(15,8) NOT NULL,
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
  average_price DECIMAL(15,8) NOT NULL,
  last_price DECIMAL(15,8),
  close_price DECIMAL(15,8),
  pnl DECIMAL(15,2) DEFAULT 0.00,
  day_change DECIMAL(15,2) DEFAULT 0.00,
  day_change_percentage DECIMAL(8,4) DEFAULT 0.00,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  CONSTRAINT zerodha_holdings_symbol_format CHECK (LENGTH(tradingsymbol) >= 1),
  CONSTRAINT zerodha_holdings_exchange_valid CHECK (exchange IN ('NSE', 'BSE', 'NFO', 'BFO', 'CDS', 'MCX')),
  CONSTRAINT zerodha_holdings_product_valid CHECK (product IN ('CNC', 'MIS', 'NRML')),
  CONSTRAINT zerodha_holdings_quantity_positive CHECK (quantity >= 0),
  UNIQUE(user_id, tradingsymbol, exchange, isin)
);

-- Zerodha margins table (Requirements: 5.5)
CREATE TABLE IF NOT EXISTS zerodha_margins (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  segment VARCHAR(20) NOT NULL, -- equity, commodity
  enabled BOOLEAN DEFAULT true,
  net DECIMAL(15,2) DEFAULT 0.00,
  available_adhoc_margin DECIMAL(15,2) DEFAULT 0.00,
  available_cash DECIMAL(15,2) DEFAULT 0.00,
  available_opening_balance DECIMAL(15,2) DEFAULT 0.00,
  available_live_balance DECIMAL(15,2) DEFAULT 0.00,
  available_collateral DECIMAL(15,2) DEFAULT 0.00,
  available_intraday_payin DECIMAL(15,2) DEFAULT 0.00,
  utilised_debits DECIMAL(15,2) DEFAULT 0.00,
  utilised_exposure DECIMAL(15,2) DEFAULT 0.00,
  utilised_m2m_realised DECIMAL(15,2) DEFAULT 0.00,
  utilised_m2m_unrealised DECIMAL(15,2) DEFAULT 0.00,
  utilised_option_premium DECIMAL(15,2) DEFAULT 0.00,
  utilised_payout DECIMAL(15,2) DEFAULT 0.00,
  utilised_span DECIMAL(15,2) DEFAULT 0.00,
  utilised_holding_sales DECIMAL(15,2) DEFAULT 0.00,
  utilised_turnover DECIMAL(15,2) DEFAULT 0.00,
  utilised_liquid_collateral DECIMAL(15,2) DEFAULT 0.00,
  utilised_stock_collateral DECIMAL(15,2) DEFAULT 0.00,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  CONSTRAINT zerodha_margins_segment_valid CHECK (segment IN ('equity', 'commodity')),
  UNIQUE(user_id, segment, DATE(created_at))
);

-- Portfolio summary cache table
CREATE TABLE IF NOT EXISTS zerodha_portfolio_summary (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  total_portfolio_value DECIMAL(15,2) DEFAULT 0.00,
  total_investment DECIMAL(15,2) DEFAULT 0.00,
  total_current_value DECIMAL(15,2) DEFAULT 0.00,
  total_pnl DECIMAL(15,2) DEFAULT 0.00,
  total_day_change DECIMAL(15,2) DEFAULT 0.00,
  total_day_change_percentage DECIMAL(8,4) DEFAULT 0.00,
  positions_count INTEGER DEFAULT 0,
  holdings_count INTEGER DEFAULT 0,
  summary_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE(user_id, summary_date)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_zerodha_positions_user_id ON zerodha_positions(user_id);
CREATE INDEX IF NOT EXISTS idx_zerodha_positions_symbol ON zerodha_positions(tradingsymbol);
CREATE INDEX IF NOT EXISTS idx_zerodha_positions_exchange ON zerodha_positions(exchange);
CREATE INDEX IF NOT EXISTS idx_zerodha_positions_date ON zerodha_positions(position_date);
CREATE INDEX IF NOT EXISTS idx_zerodha_positions_user_date ON zerodha_positions(user_id, position_date);

CREATE INDEX IF NOT EXISTS idx_zerodha_holdings_user_id ON zerodha_holdings(user_id);
CREATE INDEX IF NOT EXISTS idx_zerodha_holdings_symbol ON zerodha_holdings(tradingsymbol);
CREATE INDEX IF NOT EXISTS idx_zerodha_holdings_exchange ON zerodha_holdings(exchange);

CREATE INDEX IF NOT EXISTS idx_zerodha_margins_user_id ON zerodha_margins(user_id);
CREATE INDEX IF NOT EXISTS idx_zerodha_margins_segment ON zerodha_margins(segment);

CREATE INDEX IF NOT EXISTS idx_zerodha_portfolio_summary_user_id ON zerodha_portfolio_summary(user_id);
CREATE INDEX IF NOT EXISTS idx_zerodha_portfolio_summary_date ON zerodha_portfolio_summary(summary_date);

-- Triggers for updated_at
CREATE TRIGGER update_zerodha_positions_updated_at BEFORE UPDATE ON zerodha_positions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_zerodha_holdings_updated_at BEFORE UPDATE ON zerodha_holdings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_zerodha_margins_updated_at BEFORE UPDATE ON zerodha_margins
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_zerodha_portfolio_summary_updated_at BEFORE UPDATE ON zerodha_portfolio_summary
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();