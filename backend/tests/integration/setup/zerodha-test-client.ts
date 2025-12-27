import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { encrypt } from '../../../shared/zerodha-utils/src/encryption';

export class ZerodhaTestClient {
  private apiFailures: Map<string, number> = new Map();
  private marketPrices: Map<string, number> = new Map();
  private orderExecutions: Map<string, string> = new Map();

  constructor() {
    // Initialize with some default market prices
    this.marketPrices.set('NSE:RELIANCE', 2500);
    this.marketPrices.set('NSE:INFY', 1400);
    this.marketPrices.set('NSE:TCS', 3200);
    this.marketPrices.set('NSE:HDFCBANK', 1600);
    this.marketPrices.set('NSE:ICICIBANK', 850);
    this.marketPrices.set('NSE:WIPRO', 400);
    this.marketPrices.set('NSE:BHARTIARTL', 700);
    this.marketPrices.set('NSE:MARUTI', 9000);
  }

  generateMockRequestToken(): string {
    return `mock_request_token_${uuidv4().slice(0, 8)}`;
  }

  generateExpiredToken(): string {
    const payload = {
      user_id: 'test_user',
      exp: Math.floor(Date.now() / 1000) - 3600 // Expired 1 hour ago
    };
    
    return jwt.sign(payload, process.env.JWT_SECRET || 'test_jwt_secret');
  }

  async authenticateTestUser(userId: string): Promise<{ access_token: string; user_profile: any }> {
    const payload = {
      user_id: userId,
      zerodha_user_id: `ZU${userId.slice(0, 8)}`,
      exp: Math.floor(Date.now() / 1000) + 3600 // Expires in 1 hour
    };

    const access_token = jwt.sign(payload, process.env.JWT_SECRET || 'test_jwt_secret');

    const user_profile = {
      user_id: `ZU${userId.slice(0, 8)}`,
      user_name: `Test User ${userId.slice(0, 8)}`,
      email: `test-${userId}@example.com`,
      broker: 'ZERODHA',
      exchanges: ['NSE', 'BSE'],
      products: ['CNC', 'MIS', 'NRML'],
      order_types: ['MARKET', 'LIMIT', 'SL', 'SL-M']
    };

    return { access_token, user_profile };
  }

  simulateApiFailure(endpoint: string, statusCode: number): void {
    this.apiFailures.set(endpoint, statusCode);
  }

  restoreApiService(endpoint: string): void {
    this.apiFailures.delete(endpoint);
  }

  isApiFailureSimulated(endpoint: string): number | null {
    return this.apiFailures.get(endpoint) || null;
  }

  updateMarketPrice(instrument: string, price: number): void {
    this.marketPrices.set(instrument, price);
    
    // Simulate real-time price broadcast
    this.broadcastPriceUpdate(instrument, price);
  }

  getMarketPrice(instrument: string): number {
    return this.marketPrices.get(instrument) || 1000; // Default price
  }

  simulateOrderExecution(orderId: string, status: string): void {
    this.orderExecutions.set(orderId, status);
  }

  getOrderStatus(orderId: string): string {
    return this.orderExecutions.get(orderId) || 'OPEN';
  }

  generateMockMarketData(instrument: string): any {
    const basePrice = this.getMarketPrice(instrument);
    const variation = basePrice * 0.02; // 2% variation
    
    return {
      instrument_token: this.getInstrumentToken(instrument),
      tradingsymbol: instrument.split(':')[1],
      exchange: instrument.split(':')[0],
      last_price: basePrice + (Math.random() - 0.5) * variation,
      volume: Math.floor(Math.random() * 1000000) + 10000,
      ohlc: {
        open: basePrice * (0.98 + Math.random() * 0.04),
        high: basePrice * (1.01 + Math.random() * 0.02),
        low: basePrice * (0.97 + Math.random() * 0.02),
        close: basePrice * (0.99 + Math.random() * 0.02)
      },
      timestamp: new Date().toISOString(),
      depth: {
        buy: this.generateDepthData(basePrice, 'buy'),
        sell: this.generateDepthData(basePrice, 'sell')
      }
    };
  }

  generateMockHistoricalData(instrument: string, from: string, to: string, interval: string): any[] {
    const fromDate = new Date(from);
    const toDate = new Date(to);
    const candles = [];
    
    let currentDate = new Date(fromDate);
    let basePrice = this.getMarketPrice(instrument);
    
    while (currentDate <= toDate) {
      // Skip weekends for daily data
      if (interval === 'day' && (currentDate.getDay() === 0 || currentDate.getDay() === 6)) {
        currentDate.setDate(currentDate.getDate() + 1);
        continue;
      }

      const variation = basePrice * 0.05; // 5% daily variation
      const open = basePrice + (Math.random() - 0.5) * variation;
      const close = open + (Math.random() - 0.5) * variation;
      const high = Math.max(open, close) + Math.random() * variation * 0.5;
      const low = Math.min(open, close) - Math.random() * variation * 0.5;
      
      candles.push({
        timestamp: currentDate.toISOString(),
        open: Math.round(open * 100) / 100,
        high: Math.round(high * 100) / 100,
        low: Math.round(low * 100) / 100,
        close: Math.round(close * 100) / 100,
        volume: Math.floor(Math.random() * 500000) + 50000
      });

      basePrice = close; // Use close as next day's base
      
      // Increment date based on interval
      if (interval === 'day') {
        currentDate.setDate(currentDate.getDate() + 1);
      } else if (interval === 'minute') {
        currentDate.setMinutes(currentDate.getMinutes() + 1);
      }
    }

    return candles;
  }

  generateMockInstruments(exchange?: string): any[] {
    const instruments = [
      {
        instrument_token: 738561,
        tradingsymbol: 'RELIANCE',
        name: 'Reliance Industries Limited',
        exchange: 'NSE',
        segment: 'NSE',
        lot_size: 1,
        tick_size: 0.05,
        instrument_type: 'EQ'
      },
      {
        instrument_token: 408065,
        tradingsymbol: 'INFY',
        name: 'Infosys Limited',
        exchange: 'NSE',
        segment: 'NSE',
        lot_size: 1,
        tick_size: 0.05,
        instrument_type: 'EQ'
      },
      {
        instrument_token: 2953217,
        tradingsymbol: 'TCS',
        name: 'Tata Consultancy Services Limited',
        exchange: 'NSE',
        segment: 'NSE',
        lot_size: 1,
        tick_size: 0.05,
        instrument_type: 'EQ'
      },
      {
        instrument_token: 341249,
        tradingsymbol: 'HDFCBANK',
        name: 'HDFC Bank Limited',
        exchange: 'NSE',
        segment: 'NSE',
        lot_size: 1,
        tick_size: 0.05,
        instrument_type: 'EQ'
      },
      {
        instrument_token: 1270529,
        tradingsymbol: 'ICICIBANK',
        name: 'ICICI Bank Limited',
        exchange: 'NSE',
        segment: 'NSE',
        lot_size: 1,
        tick_size: 0.05,
        instrument_type: 'EQ'
      }
    ];

    if (exchange) {
      return instruments.filter(i => i.exchange === exchange);
    }

    return instruments;
  }

  generateMockIndices(): any[] {
    return [
      {
        name: 'NIFTY 50',
        value: 21500 + (Math.random() - 0.5) * 200,
        change: (Math.random() - 0.5) * 100,
        change_percent: (Math.random() - 0.5) * 2,
        timestamp: new Date().toISOString()
      },
      {
        name: 'SENSEX',
        value: 71000 + (Math.random() - 0.5) * 500,
        change: (Math.random() - 0.5) * 200,
        change_percent: (Math.random() - 0.5) * 1.5,
        timestamp: new Date().toISOString()
      },
      {
        name: 'NIFTY BANK',
        value: 46000 + (Math.random() - 0.5) * 400,
        change: (Math.random() - 0.5) * 150,
        change_percent: (Math.random() - 0.5) * 2.5,
        timestamp: new Date().toISOString()
      }
    ];
  }

  private getInstrumentToken(instrument: string): number {
    const tokenMap: { [key: string]: number } = {
      'NSE:RELIANCE': 738561,
      'NSE:INFY': 408065,
      'NSE:TCS': 2953217,
      'NSE:HDFCBANK': 341249,
      'NSE:ICICIBANK': 1270529,
      'NSE:WIPRO': 969473,
      'NSE:BHARTIARTL': 2714625,
      'NSE:MARUTI': 2815745
    };

    return tokenMap[instrument] || Math.floor(Math.random() * 9999999) + 100000;
  }

  private generateDepthData(basePrice: number, side: 'buy' | 'sell'): any[] {
    const depth = [];
    const priceStep = basePrice * 0.001; // 0.1% price steps
    
    for (let i = 0; i < 5; i++) {
      const price = side === 'buy' 
        ? basePrice - (i + 1) * priceStep
        : basePrice + (i + 1) * priceStep;
      
      depth.push({
        price: Math.round(price * 100) / 100,
        quantity: Math.floor(Math.random() * 1000) + 100,
        orders: Math.floor(Math.random() * 10) + 1
      });
    }

    return depth;
  }

  private broadcastPriceUpdate(instrument: string, price: number): void {
    // In a real implementation, this would broadcast to WebSocket clients
    // For testing, we just update the internal price map
    console.log(`Price update: ${instrument} -> ${price}`);
  }
}