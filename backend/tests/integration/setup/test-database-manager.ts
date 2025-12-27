import { Pool } from 'pg';

export class TestDatabaseManager {
  private pool: Pool;

  constructor() {
    this.pool = new Pool({
      connectionString: process.env.DATABASE_URL || 'postgresql://test:test@localhost:5432/tradeflow_test',
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });
  }

  async initialize(): Promise<void> {
    try {
      // Test connection
      const client = await this.pool.connect();
      await client.query('SELECT NOW()');
      client.release();
      
      console.log('Test database connection established');
      
      // Run migrations if needed
      await this.runTestMigrations();
    } catch (error) {
      console.error('Failed to initialize test database:', error);
      throw error;
    }
  }

  async cleanup(): Promise<void> {
    await this.pool.end();
  }

  getPool(): Pool {
    return this.pool;
  }

  private async runTestMigrations(): Promise<void> {
    // Ensure all required tables exist for testing
    const migrations = [
      `
        CREATE TABLE IF NOT EXISTS users (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          email VARCHAR(255) UNIQUE NOT NULL,
          username VARCHAR(100) NOT NULL,
          zerodha_user_id VARCHAR(50),
          zerodha_access_token TEXT,
          zerodha_refresh_token TEXT,
          token_expires_at TIMESTAMP,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        )
      `,
      `
        CREATE TABLE IF NOT EXISTS zerodha_orders (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID REFERENCES users(id) ON DELETE CASCADE,
          order_id VARCHAR(50) UNIQUE NOT NULL,
          exchange VARCHAR(10) NOT NULL,
          tradingsymbol VARCHAR(50) NOT NULL,
          transaction_type VARCHAR(10) NOT NULL,
          quantity INTEGER NOT NULL,
          product VARCHAR(10) NOT NULL,
          order_type VARCHAR(10) NOT NULL,
          price DECIMAL(10,2),
          trigger_price DECIMAL(10,2),
          status VARCHAR(20) NOT NULL DEFAULT 'OPEN',
          filled_quantity INTEGER DEFAULT 0,
          average_price DECIMAL(10,2) DEFAULT 0,
          order_timestamp TIMESTAMP NOT NULL DEFAULT NOW(),
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        )
      `,
      `
        CREATE TABLE IF NOT EXISTS zerodha_positions (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID REFERENCES users(id) ON DELETE CASCADE,
          tradingsymbol VARCHAR(50) NOT NULL,
          exchange VARCHAR(10) NOT NULL,
          quantity INTEGER NOT NULL,
          average_price DECIMAL(10,2) NOT NULL,
          last_price DECIMAL(10,2),
          pnl DECIMAL(15,2),
          unrealised_pnl DECIMAL(15,2),
          realised_pnl DECIMAL(15,2),
          product VARCHAR(10) DEFAULT 'CNC',
          sector VARCHAR(50) DEFAULT 'Unknown',
          position_date DATE NOT NULL DEFAULT CURRENT_DATE,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW(),
          UNIQUE(user_id, tradingsymbol, exchange, position_date)
        )
      `,
      `
        CREATE TABLE IF NOT EXISTS zerodha_instruments (
          instrument_token BIGINT PRIMARY KEY,
          tradingsymbol VARCHAR(50) NOT NULL,
          name VARCHAR(200),
          exchange VARCHAR(10) NOT NULL,
          segment VARCHAR(10),
          lot_size INTEGER DEFAULT 1,
          tick_size DECIMAL(10,4) DEFAULT 0.05,
          instrument_type VARCHAR(10),
          expiry DATE,
          strike DECIMAL(10,2),
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        )
      `,
      `
        CREATE INDEX IF NOT EXISTS idx_zerodha_orders_user_id ON zerodha_orders(user_id);
      `,
      `
        CREATE INDEX IF NOT EXISTS idx_zerodha_orders_status ON zerodha_orders(status);
      `,
      `
        CREATE INDEX IF NOT EXISTS idx_zerodha_positions_user_id ON zerodha_positions(user_id);
      `,
      `
        CREATE INDEX IF NOT EXISTS idx_zerodha_instruments_exchange ON zerodha_instruments(exchange);
      `,
      `
        CREATE INDEX IF NOT EXISTS idx_zerodha_instruments_tradingsymbol ON zerodha_instruments(tradingsymbol);
      `
    ];

    for (const migration of migrations) {
      try {
        await this.pool.query(migration);
      } catch (error) {
        console.error('Migration failed:', error);
        // Continue with other migrations
      }
    }

    console.log('Test database migrations completed');
  }
}