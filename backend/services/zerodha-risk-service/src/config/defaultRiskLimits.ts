import { RiskLimits } from '../types/riskTypes';

export const DEFAULT_RISK_LIMITS: RiskLimits = {
  // Order-level limits
  max_order_value: 100000, // ₹1 lakh per order
  max_position_size: 500000, // ₹5 lakh per position
  max_orders_per_minute: 10,
  
  // Portfolio-level limits
  max_daily_loss: 50000, // ₹50,000 daily loss limit
  max_portfolio_exposure: 1000000, // ₹10 lakh total exposure
  max_sector_exposure: 300000, // ₹3 lakh per sector
  
  // Product and exchange restrictions
  allowed_products: ['CNC', 'MIS', 'NRML'],
  allowed_exchanges: ['NSE', 'BSE'],
  blocked_instruments: [],
  
  // Margin requirements
  margin_multiplier: 1.2, // 20% buffer on margin requirements
  min_margin_balance: 10000, // ₹10,000 minimum margin
  
  // Time-based restrictions
  trading_hours_start: '09:15',
  trading_hours_end: '15:30',
  
  // Auto square-off settings
  auto_square_off_enabled: true,
  square_off_time: '15:20', // 10 minutes before market close
  
  // Alert thresholds (as percentage of limits)
  loss_alert_threshold: 0.8, // Alert at 80% of daily loss limit
  exposure_alert_threshold: 0.9 // Alert at 90% of exposure limit
};

export const CONSERVATIVE_RISK_LIMITS: RiskLimits = {
  ...DEFAULT_RISK_LIMITS,
  max_order_value: 50000,
  max_position_size: 200000,
  max_daily_loss: 25000,
  max_portfolio_exposure: 500000,
  max_orders_per_minute: 5,
  margin_multiplier: 1.5,
  loss_alert_threshold: 0.7,
  exposure_alert_threshold: 0.8
};

export const AGGRESSIVE_RISK_LIMITS: RiskLimits = {
  ...DEFAULT_RISK_LIMITS,
  max_order_value: 500000,
  max_position_size: 2000000,
  max_daily_loss: 200000,
  max_portfolio_exposure: 5000000,
  max_orders_per_minute: 20,
  margin_multiplier: 1.1,
  loss_alert_threshold: 0.9,
  exposure_alert_threshold: 0.95
};

export const RISK_LIMIT_PRESETS = {
  conservative: CONSERVATIVE_RISK_LIMITS,
  default: DEFAULT_RISK_LIMITS,
  aggressive: AGGRESSIVE_RISK_LIMITS
};