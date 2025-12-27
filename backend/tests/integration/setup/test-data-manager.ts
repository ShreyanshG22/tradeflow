import { Pool } from 'pg';
import Redis from 'ioredis';
import { v4 as uuidv4 } from 'uuid';
import { encrypt } from '../../../shared/zerodha-utils/src/encryption';

export class TestDataManager {
  private db: Pool;
  private redis: Redis;
  private testUserIds: string[] = [];
  private dbFailureSimulated = false;

  constructor() {
    this.db = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 5
    });
    
    this.redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379/1');
  }

  async setup(): Promise<void> {
    // Ensure test database is clean
    await this.cleanupAllTestData();
    
    // Create test data tables if they don't exist
    await this.createTestTables();
  }

  async cleanup(): Promise<void> {
    await this.cleanupAllTestData();
    await this.db.end();
    await this.redis.quit();
  }

  async createTestUser(): Promise<string> {
    const userId = uuidv4();
    const email = `test-${userId}@example.com`;
    
    await this.db.query(`
      INSERT INTO users (id, email, username, created_at, updated_at)
      VALUES ($1, $2, $3, NOW(), NOW())
    `, [userId, email, `testuser-${userId.slice(0, 8)}`]);

    this.testUserIds.push(userId);
    return userId;
  }

  async cleanupTestUser(userId: string): Promise<void> {
    // Clean up all related data for the test user
    await this.db.query('DELETE FROM zerodha_positions WHERE user_id = $1', [userId]);
    await this.db.query('DELETE FROM zerodha_orders WHERE user_id = $1', [userId]);
    await this.db.query('DELETE FROM zerodha_holdings WHERE user_id = $1', [userId]);
    await this.db.query('DELETE FROM zerodha_trades WHERE user_id = $1', [userId]);
    await this.db.query('DELETE FROM risk_limits WHERE user_id = $1', [userId]);
    await this.db.query('DELETE FROM users WHERE id = $1', [userId]);

    // Clean up Redis data
    await this.redis.del(`session:${userId}`);
    await this.redis.del(`rate_limit:${userId}`);
    await this.redis.del(`portfolio:${userId}`);

    // Remove from tracking
    this.testUserIds = this.testUserIds.filter(id => id !== userId);
  }

  async createTestPosition(userId: string, position: {
    tradingsymbol: string;
    exchange?: string;
    quantity: number;
    average_price: number;
    current_price?: number;
    product?: string;
    sector?: string;
  }): Promise<void> {
    const {
      tradingsymbol,
      exchange = 'NSE',
      quantity,
      average_price,
      current_price = average_price,
      product = 'CNC',
      sector = 'Unknown'
    } = position;

    const unrealised_pnl = quantity * (current_price - average_price);

    await this.db.query(`
      INSERT INTO zerodha_positions (
        user_id, tradingsymbol, exchange, quantity, average_price, 
        last_price, unrealised_pnl, product, sector, position_date, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_DATE, NOW(), NOW())
      ON CONFLICT (user_id, tradingsymbol, exchange, position_date)
      DO UPDATE SET 
        quantity = EXCLUDED.quantity,
        average_price = EXCLUDED.average_price,
        last_price = EXCLUDED.last_price,
        unrealised_pnl = EXCLUDED.unrealised_pnl,
        updated_at = NOW()
    `, [userId, tradingsymbol, exchange, quantity, average_price, current_price, unrealised_pnl, product, sector]);
  }

  async createTestHolding(userId: string, holding: {
    tradingsymbol: string;
    exchange?: string;
    quantity: number;
    average_price: number;
    current_price: number;
    purchase_date: string;
  }): Promise<void> {
    const {
      tradingsymbol,
      exchange = 'NSE',
      quantity,
      average_price,
      current_price,
      purchase_date
    } = holding;

    const pnl = quantity * (current_price - average_price);

    await this.db.query(`
      INSERT INTO zerodha_holdings (
        user_id, tradingsymbol, exchange, quantity, average_price,
        last_price, pnl, purchase_date, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
    `, [userId, tradingsymbol, exchange, quantity, average_price, current_price, pnl, purchase_date]);
  }

  async createCompletedTrade(userId: string, trade: {
    tradingsymbol: string;
    buy_price: number;
    sell_price: number;
    quantity: number;
    trade_date: string;
  }): Promise<void> {
    const { tradingsymbol, buy_price, sell_price, quantity, trade_date } = trade;
    const pnl = quantity * (sell_price - buy_price);

    await this.db.query(`
      INSERT INTO zerodha_trades (
        user_id, tradingsymbol, buy_price, sell_price, quantity,
        pnl, trade_date, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
    `, [userId, tradingsymbol, buy_price, sell_price, quantity, pnl, trade_date]);
  }

  async createHistoricalTrade(userId: string, trade: {
    symbol: string;
    pnl: number;
    date: string;
  }): Promise<void> {
    const { symbol, pnl, date } = trade;

    await this.db.query(`
      INSERT INTO zerodha_trades (
        user_id, tradingsymbol, pnl, trade_date, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, NOW(), NOW())
    `, [userId, symbol, pnl, date]);
  }

  async setRiskLimits(userId: string, limits: {
    max_order_value?: number;
    max_daily_loss?: number;
    max_position_size?: number;
  }): Promise<void> {
    await this.db.query(`
      INSERT INTO risk_limits (user_id, max_order_value, max_daily_loss, max_position_size, created_at, updated_at)
      VALUES ($1, $2, $3, $4, NOW(), NOW())
      ON CONFLICT (user_id)
      DO UPDATE SET
        max_order_value = EXCLUDED.max_order_value,
        max_daily_loss = EXCLUDED.max_daily_loss,
        max_position_size = EXCLUDED.max_position_size,
        updated_at = NOW()
    `, [userId, limits.max_order_value, limits.max_daily_loss, limits.max_position_size]);
  }

  async updatePositionPnL(userId: string, tradingsymbol: string, newPnL: number): Promise<void> {
    await this.db.query(`
      UPDATE zerodha_positions 
      SET unrealised_pnl = $3, updated_at = NOW()
      WHERE user_id = $1 AND tradingsymbol = $2
    `, [userId, tradingsymbol, newPnL]);
  }

  async simulateDatabaseFailure(): Promise<void> {
    this.dbFailureSimulated = true;
    // Close all connections to simulate failure
    await this.db.end();
  }

  async restoreDatabase(): Promise<void> {
    if (this.dbFailureSimulated) {
      this.db = new Pool({
        connectionString: process.env.DATABASE_URL,
        max: 5
      });
      this.dbFailureSimulated = false;
    }
  }

  private async createTestTables(): Promise<void> {
    // Create test-specific tables that might not exist
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS zerodha_holdings (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL,
        tradingsymbol VARCHAR(50) NOT NULL,
        exchange VARCHAR(10) NOT NULL,
        quantity INTEGER NOT NULL,
        average_price DECIMAL(10,2) NOT NULL,
        last_price DECIMAL(10,2),
        pnl DECIMAL(15,2),
        purchase_date DATE NOT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(user_id, tradingsymbol, exchange)
      )
    `);

    await this.db.query(`
      CREATE TABLE IF NOT EXISTS zerodha_trades (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL,
        tradingsymbol VARCHAR(50) NOT NULL,
        buy_price DECIMAL(10,2),
        sell_price DECIMAL(10,2),
        quantity INTEGER,
        pnl DECIMAL(15,2) NOT NULL,
        trade_date DATE NOT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await this.db.query(`
      CREATE TABLE IF NOT EXISTS risk_limits (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID UNIQUE NOT NULL,
        max_order_value DECIMAL(15,2),
        max_daily_loss DECIMAL(15,2),
        max_position_size INTEGER,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Add sector column to positions if it doesn't exist
    await this.db.query(`
      ALTER TABLE zerodha_positions 
      ADD COLUMN IF NOT EXISTS sector VARCHAR(50) DEFAULT 'Unknown'
    `);

    await this.db.query(`
      ALTER TABLE zerodha_positions 
      ADD COLUMN IF NOT EXISTS product VARCHAR(10) DEFAULT 'CNC'
    `);
  }

  private async cleanupAllTestData(): Promise<void> {
    // Clean up all test data
    for (const userId of this.testUserIds) {
      await this.cleanupTestUser(userId);
    }
    this.testUserIds = [];

    // Clean up any orphaned test data
    await this.db.query(`DELETE FROM users WHERE email LIKE 'test-%@example.com'`);
    await this.redis.flushdb(); // Clear test Redis database
  }
}