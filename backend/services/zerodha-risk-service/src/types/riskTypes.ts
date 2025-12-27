export interface RiskLimits {
  // Order-level limits
  max_order_value: number;
  max_position_size: number;
  max_orders_per_minute: number;
  
  // Portfolio-level limits
  max_daily_loss: number;
  max_portfolio_exposure: number;
  max_sector_exposure: number;
  
  // Product and exchange restrictions
  allowed_products: string[];
  allowed_exchanges: string[];
  blocked_instruments: string[];
  
  // Margin requirements
  margin_multiplier: number;
  min_margin_balance: number;
  
  // Time-based restrictions
  trading_hours_start: string;
  trading_hours_end: string;
  
  // Auto square-off settings
  auto_square_off_enabled: boolean;
  square_off_time: string;
  
  // Alert thresholds
  loss_alert_threshold: number;
  exposure_alert_threshold: number;
}

export interface UserRiskLimits extends RiskLimits {
  user_id: string;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface GlobalRiskLimits extends RiskLimits {
  id: string;
  name: string;
  description: string;
  is_default: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface RiskLimitValidation {
  is_valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface RiskBreach {
  id: string;
  user_id: string;
  breach_type: 'ORDER_VALUE' | 'DAILY_LOSS' | 'POSITION_SIZE' | 'EXPOSURE' | 'MARGIN';
  limit_type: 'USER' | 'GLOBAL';
  current_value: number;
  limit_value: number;
  breach_percentage: number;
  timestamp: Date;
  is_resolved: boolean;
  action_taken: string;
}

export interface RiskCheckResult {
  allowed: boolean;
  breach_type?: string;
  message: string;
  current_value?: number;
  limit_value?: number;
  warnings: string[];
}

export interface MarginRequirement {
  instrument: string;
  quantity: number;
  price: number;
  margin_required: number;
  available_margin: number;
  is_sufficient: boolean;
}