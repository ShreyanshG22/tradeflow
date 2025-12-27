export interface MarketData {
  symbol: string;
  timestamp: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  timeframe: string;
}

export interface RealTimeQuote {
  symbol: string;
  price: number;
  bid: number;
  ask: number;
  volume: number;
  timestamp: Date;
}

export interface HistoricalDataRequest {
  symbol: string;
  timeframe: '1min' | '5min' | '15min' | '30min' | '60min' | '1day';
  startDate: Date;
  endDate: Date;
}

export interface DataProvider {
  name: string;
  getHistoricalData(request: HistoricalDataRequest): Promise<MarketData[]>;
  getCurrentQuote(symbol: string): Promise<RealTimeQuote>;
  isAvailable(): Promise<boolean>;
}

export interface AlphaVantageResponse {
  'Meta Data': {
    '1. Information': string;
    '2. Symbol': string;
    '3. Last Refreshed': string;
    '4. Interval': string;
    '5. Output Size': string;
    '6. Time Zone': string;
  };
  'Time Series (1min)'?: Record<string, AlphaVantageDataPoint>;
  'Time Series (5min)'?: Record<string, AlphaVantageDataPoint>;
  'Time Series (15min)'?: Record<string, AlphaVantageDataPoint>;
  'Time Series (30min)'?: Record<string, AlphaVantageDataPoint>;
  'Time Series (60min)'?: Record<string, AlphaVantageDataPoint>;
  'Time Series (Daily)'?: Record<string, AlphaVantageDataPoint>;
}

export interface AlphaVantageDataPoint {
  '1. open': string;
  '2. high': string;
  '3. low': string;
  '4. close': string;
  '5. volume': string;
}

export interface YahooFinanceResponse {
  chart: {
    result: Array<{
      meta: {
        symbol: string;
        exchangeTimezoneName: string;
        instrumentType: string;
        firstTradeDate: number;
        regularMarketTime: number;
        gmtoffset: number;
        timezone: string;
        exchangeName: string;
        regularMarketPrice: number;
        chartPreviousClose: number;
      };
      timestamp: number[];
      indicators: {
        quote: Array<{
          open: number[];
          high: number[];
          low: number[];
          close: number[];
          volume: number[];
        }>;
      };
    }>;
  };
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export interface CacheEntry<T> {
  data: T;
  timestamp: Date;
  ttl: number;
}