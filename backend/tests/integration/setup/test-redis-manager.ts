import Redis from 'ioredis';

export class TestRedisManager {
  private redis: Redis;

  constructor() {
    this.redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379/1', {
      retryDelayOnFailover: 100,
      maxRetriesPerRequest: 3,
      lazyConnect: true
    });
  }

  async initialize(): Promise<void> {
    try {
      await this.redis.connect();
      
      // Test connection
      await this.redis.ping();
      
      // Clear test database
      await this.redis.flushdb();
      
      console.log('Test Redis connection established');
      
      // Set up test data
      await this.setupTestData();
    } catch (error) {
      console.error('Failed to initialize test Redis:', error);
      throw error;
    }
  }

  async cleanup(): Promise<void> {
    await this.redis.flushdb();
    await this.redis.quit();
  }

  getClient(): Redis {
    return this.redis;
  }

  private async setupTestData(): Promise<void> {
    // Set up some default market data for testing
    const marketData = {
      'quote:NSE:RELIANCE': JSON.stringify({
        instrument_token: 738561,
        tradingsymbol: 'RELIANCE',
        last_price: 2500,
        volume: 1000000,
        ohlc: { open: 2480, high: 2520, low: 2470, close: 2490 },
        timestamp: new Date().toISOString()
      }),
      'quote:NSE:INFY': JSON.stringify({
        instrument_token: 408065,
        tradingsymbol: 'INFY',
        last_price: 1400,
        volume: 800000,
        ohlc: { open: 1390, high: 1410, low: 1385, close: 1395 },
        timestamp: new Date().toISOString()
      }),
      'quote:NSE:TCS': JSON.stringify({
        instrument_token: 2953217,
        tradingsymbol: 'TCS',
        last_price: 3200,
        volume: 600000,
        ohlc: { open: 3180, high: 3220, low: 3170, close: 3190 },
        timestamp: new Date().toISOString()
      })
    };

    // Set market data with TTL
    for (const [key, value] of Object.entries(marketData)) {
      await this.redis.setex(key, 60, value);
    }

    // Set up instrument cache
    const instruments = [
      {
        instrument_token: 738561,
        tradingsymbol: 'RELIANCE',
        name: 'Reliance Industries Limited',
        exchange: 'NSE',
        lot_size: 1,
        tick_size: 0.05
      },
      {
        instrument_token: 408065,
        tradingsymbol: 'INFY',
        name: 'Infosys Limited',
        exchange: 'NSE',
        lot_size: 1,
        tick_size: 0.05
      },
      {
        instrument_token: 2953217,
        tradingsymbol: 'TCS',
        name: 'Tata Consultancy Services Limited',
        exchange: 'NSE',
        lot_size: 1,
        tick_size: 0.05
      }
    ];

    for (const instrument of instruments) {
      const key = `instrument:${instrument.exchange}:${instrument.tradingsymbol}`;
      await this.redis.setex(key, 86400, JSON.stringify(instrument)); // 24 hours TTL
    }

    // Set up search cache
    await this.redis.setex('search:reliance', 3600, JSON.stringify([
      {
        instrument_token: 738561,
        tradingsymbol: 'RELIANCE',
        name: 'Reliance Industries Limited',
        exchange: 'NSE'
      }
    ]));

    console.log('Test Redis data setup completed');
  }
}