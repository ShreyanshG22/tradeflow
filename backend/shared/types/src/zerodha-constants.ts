// Zerodha API Constants and Market Utilities

export const ZERODHA_CONSTANTS = {
  // API Endpoints
  API_BASE_URL: 'https://api.kite.trade',
  LOGIN_URL: 'https://kite.zerodha.com/connect/login',
  
  // WebSocket
  WEBSOCKET_URL: 'wss://ws.kite.trade',
  
  // Market Timings (IST)
  MARKET_TIMINGS: {
    NSE: {
      PRE_OPEN_START: '09:00:00',
      PRE_OPEN_END: '09:15:00',
      MARKET_OPEN: '09:15:00',
      MARKET_CLOSE: '15:30:00',
      POST_MARKET_START: '15:40:00',
      POST_MARKET_END: '16:00:00',
    },
    BSE: {
      PRE_OPEN_START: '09:00:00',
      PRE_OPEN_END: '09:15:00',
      MARKET_OPEN: '09:15:00',
      MARKET_CLOSE: '15:30:00',
      POST_MARKET_START: '15:40:00',
      POST_MARKET_END: '16:00:00',
    },
  },
  
  // Exchanges
  EXCHANGES: {
    NSE: 'NSE',
    BSE: 'BSE',
    NFO: 'NFO', // NSE Futures & Options
    BFO: 'BFO', // BSE Futures & Options
    CDS: 'CDS', // Currency Derivatives
    MCX: 'MCX', // Multi Commodity Exchange
  } as const,
  
  // Product Types
  PRODUCTS: {
    CNC: 'CNC', // Cash and Carry
    MIS: 'MIS', // Margin Intraday Squareoff
    NRML: 'NRML', // Normal
  } as const,
  
  // Order Types
  ORDER_TYPES: {
    MARKET: 'MARKET',
    LIMIT: 'LIMIT',
    SL: 'SL', // Stop Loss
    SL_M: 'SL-M', // Stop Loss Market
  } as const,
  
  // Transaction Types
  TRANSACTION_TYPES: {
    BUY: 'BUY',
    SELL: 'SELL',
  } as const,
  
  // Order Validity
  VALIDITY: {
    DAY: 'DAY',
    IOC: 'IOC', // Immediate or Cancel
  } as const,
  
  // Order Status
  ORDER_STATUS: {
    OPEN: 'OPEN',
    COMPLETE: 'COMPLETE',
    CANCELLED: 'CANCELLED',
    CANCELLED_AMO: 'CANCELLED AMO',
    REJECTED: 'REJECTED',
    MODIFY_PENDING: 'MODIFY_PENDING',
    CANCEL_PENDING: 'CANCEL_PENDING',
  } as const,
  
  // Instrument Types
  INSTRUMENT_TYPES: {
    EQ: 'EQ', // Equity
    BE: 'BE', // Book Entry
    FUT: 'FUT', // Futures
    CE: 'CE', // Call Option
    PE: 'PE', // Put Option
  } as const,
  
  // Market Segments
  SEGMENTS: {
    EQ: 'EQ', // Equity
    FO: 'FO', // Futures & Options
    CD: 'CD', // Currency Derivatives
    COM: 'COM', // Commodity
  } as const,
  
  // WebSocket Modes
  WS_MODES: {
    LTP: 'ltp', // Last Traded Price
    QUOTE: 'quote', // Quote with OHLC
    FULL: 'full', // Full market depth
  } as const,
  
  // API Rate Limits
  RATE_LIMITS: {
    ORDERS_PER_SECOND: 10,
    HISTORICAL_DATA_PER_MINUTE: 3,
    QUOTE_REQUESTS_PER_SECOND: 1,
  },
  
  // Error Codes
  ERROR_CODES: {
    INVALID_API_KEY: 'AB1001',
    INVALID_ACCESS_TOKEN: 'AB1002',
    TOKEN_EXPIRED: 'AB1003',
    INSUFFICIENT_FUNDS: 'AB2001',
    INVALID_ORDER_TYPE: 'AB3001',
    ORDER_NOT_FOUND: 'AB3002',
    MARKET_CLOSED: 'AB4001',
    INSTRUMENT_NOT_FOUND: 'AB5001',
    RATE_LIMIT_EXCEEDED: 'AB6001',
  },
} as const;

// NSE/BSE Market Utilities
export const MARKET_UTILS = {
  // Major Indices
  INDICES: {
    NIFTY_50: {
      symbol: 'NIFTY 50',
      instrument_token: 256265,
      exchange: 'NSE',
    },
    NIFTY_BANK: {
      symbol: 'NIFTY BANK',
      instrument_token: 260105,
      exchange: 'NSE',
    },
    SENSEX: {
      symbol: 'SENSEX',
      instrument_token: 265,
      exchange: 'BSE',
    },
    BANKEX: {
      symbol: 'BANKEX',
      instrument_token: 275,
      exchange: 'BSE',
    },
  },
  
  // Common Lot Sizes
  LOT_SIZES: {
    NIFTY: 50,
    BANKNIFTY: 25,
    SENSEX: 10,
    BANKEX: 15,
  },
  
  // Tick Sizes
  TICK_SIZES: {
    EQUITY_ABOVE_10: 0.05,
    EQUITY_BELOW_10: 0.01,
    FUTURES: 0.05,
    OPTIONS_BELOW_3: 0.05,
    OPTIONS_ABOVE_3: 0.05,
  },
  
  // Market Holidays (2024) - This should be updated annually
  MARKET_HOLIDAYS_2024: [
    '2024-01-26', // Republic Day
    '2024-03-08', // Holi
    '2024-03-29', // Good Friday
    '2024-04-11', // Id-Ul-Fitr
    '2024-04-17', // Ram Navami
    '2024-05-01', // Maharashtra Day
    '2024-06-17', // Bakri Id
    '2024-08-15', // Independence Day
    '2024-10-02', // Gandhi Jayanti
    '2024-11-01', // Diwali Laxmi Pujan
    '2024-11-15', // Guru Nanak Jayanti
    '2024-12-25', // Christmas
  ],
  
  // Circuit Limits
  CIRCUIT_LIMITS: {
    GROUP_A: { upper: 20, lower: 20 }, // 20% circuit limit
    GROUP_B: { upper: 10, lower: 10 }, // 10% circuit limit
    GROUP_T: { upper: 5, lower: 5 },   // 5% circuit limit
  },
} as const;

// Utility Functions
export const ZerodhaUtils = {
  /**
   * Check if market is currently open
   */
  isMarketOpen(exchange: 'NSE' | 'BSE' = 'NSE'): boolean {
    const now = new Date();
    const currentTime = now.toTimeString().slice(0, 8);
    const currentDay = now.getDay();
    
    // Check if it's a weekend
    if (currentDay === 0 || currentDay === 6) {
      return false;
    }
    
    // Check if it's a market holiday
    const currentDate = now.toISOString().slice(0, 10);
    if (MARKET_UTILS.MARKET_HOLIDAYS_2024.includes(currentDate)) {
      return false;
    }
    
    const timings = ZERODHA_CONSTANTS.MARKET_TIMINGS[exchange];
    return currentTime >= timings.MARKET_OPEN && currentTime <= timings.MARKET_CLOSE;
  },
  
  /**
   * Check if it's pre-market session
   */
  isPreMarketOpen(exchange: 'NSE' | 'BSE' = 'NSE'): boolean {
    const now = new Date();
    const currentTime = now.toTimeString().slice(0, 8);
    const currentDay = now.getDay();
    
    if (currentDay === 0 || currentDay === 6) {
      return false;
    }
    
    const timings = ZERODHA_CONSTANTS.MARKET_TIMINGS[exchange];
    return currentTime >= timings.PRE_OPEN_START && currentTime < timings.PRE_OPEN_END;
  },
  
  /**
   * Get next market open time
   */
  getNextMarketOpen(exchange: 'NSE' | 'BSE' = 'NSE'): Date {
    const now = new Date();
    const nextOpen = new Date(now);
    
    // If it's weekend, move to next Monday
    if (now.getDay() === 0) { // Sunday
      nextOpen.setDate(now.getDate() + 1);
    } else if (now.getDay() === 6) { // Saturday
      nextOpen.setDate(now.getDate() + 2);
    } else {
      // Check if market is already closed for today
      const currentTime = now.toTimeString().slice(0, 8);
      const timings = ZERODHA_CONSTANTS.MARKET_TIMINGS[exchange];
      
      if (currentTime > timings.MARKET_CLOSE) {
        nextOpen.setDate(now.getDate() + 1);
      }
    }
    
    // Set to market open time
    const [hours, minutes, seconds] = ZERODHA_CONSTANTS.MARKET_TIMINGS[exchange].MARKET_OPEN.split(':');
    nextOpen.setHours(parseInt(hours), parseInt(minutes), parseInt(seconds), 0);
    
    return nextOpen;
  },
  
  /**
   * Calculate tick size for a given price
   */
  getTickSize(price: number, instrumentType: string = 'EQ'): number {
    if (instrumentType === 'EQ') {
      return price >= 10 ? MARKET_UTILS.TICK_SIZES.EQUITY_ABOVE_10 : MARKET_UTILS.TICK_SIZES.EQUITY_BELOW_10;
    } else if (instrumentType === 'FUT') {
      return MARKET_UTILS.TICK_SIZES.FUTURES;
    } else if (instrumentType === 'CE' || instrumentType === 'PE') {
      return price < 3 ? MARKET_UTILS.TICK_SIZES.OPTIONS_BELOW_3 : MARKET_UTILS.TICK_SIZES.OPTIONS_ABOVE_3;
    }
    return 0.05; // Default
  },
  
  /**
   * Validate order parameters
   */
  validateOrderParams(order: any): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    if (!order.exchange || !Object.values(ZERODHA_CONSTANTS.EXCHANGES).includes(order.exchange)) {
      errors.push('Invalid exchange');
    }
    
    if (!order.tradingsymbol || typeof order.tradingsymbol !== 'string') {
      errors.push('Invalid trading symbol');
    }
    
    if (!order.transaction_type || !Object.values(ZERODHA_CONSTANTS.TRANSACTION_TYPES).includes(order.transaction_type)) {
      errors.push('Invalid transaction type');
    }
    
    if (!order.quantity || order.quantity <= 0) {
      errors.push('Invalid quantity');
    }
    
    if (!order.product || !Object.values(ZERODHA_CONSTANTS.PRODUCTS).includes(order.product)) {
      errors.push('Invalid product type');
    }
    
    if (!order.order_type || !Object.values(ZERODHA_CONSTANTS.ORDER_TYPES).includes(order.order_type)) {
      errors.push('Invalid order type');
    }
    
    if ((order.order_type === 'LIMIT' || order.order_type === 'SL') && (!order.price || order.price <= 0)) {
      errors.push('Price required for LIMIT/SL orders');
    }
    
    if ((order.order_type === 'SL' || order.order_type === 'SL-M') && (!order.trigger_price || order.trigger_price <= 0)) {
      errors.push('Trigger price required for SL orders');
    }
    
    return {
      valid: errors.length === 0,
      errors,
    };
  },
  
  /**
   * Format instrument token for WebSocket subscription
   */
  formatInstrumentToken(token: number): string {
    return token.toString();
  },
  
  /**
   * Parse trading symbol to extract exchange and symbol
   */
  parseTradingSymbol(tradingsymbol: string): { exchange?: string; symbol: string } {
    // Handle symbols like "NSE:RELIANCE" or just "RELIANCE"
    if (tradingsymbol.includes(':')) {
      const [exchange, symbol] = tradingsymbol.split(':');
      return { exchange, symbol };
    }
    return { symbol: tradingsymbol };
  },
  
  /**
   * Generate checksum for API requests
   */
  generateChecksum(apiKey: string, requestToken: string, apiSecret: string): string {
    const crypto = require('crypto');
    const data = apiKey + requestToken + apiSecret;
    return crypto.createHash('sha256').update(data).digest('hex');
  },
} as const;

// Type exports for constants
export type ZerodhaExchange = keyof typeof ZERODHA_CONSTANTS.EXCHANGES;
export type ZerodhaProduct = keyof typeof ZERODHA_CONSTANTS.PRODUCTS;
export type ZerodhaOrderType = keyof typeof ZERODHA_CONSTANTS.ORDER_TYPES;
export type ZerodhaTransactionType = keyof typeof ZERODHA_CONSTANTS.TRANSACTION_TYPES;
export type ZerodhaValidity = keyof typeof ZERODHA_CONSTANTS.VALIDITY;
export type ZerodhaOrderStatus = keyof typeof ZERODHA_CONSTANTS.ORDER_STATUS;