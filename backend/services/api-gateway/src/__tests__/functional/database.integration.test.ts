import { DatabaseService } from '../../../user-service/src/services/database';
import { Pool, PoolClient } from 'pg';

describe('Database Integration Tests', () => {
  let testClient: PoolClient;

  beforeAll(async () => {
    // Initialize database connection
    await DatabaseService.initialize();
    testClient = await DatabaseService.getClient();
  });

  afterAll(async () => {
    if (testClient) {
      testClient.release();
    }
    await DatabaseService.close();
  });

  beforeEach(async () => {
    // Start transaction for each test
    await testClient.query('BEGIN');
  });

  afterEach(async () => {
    // Rollback transaction after each test
    await testClient.query('ROLLBACK');
  });

  describe('Database Connection', () => {
    it('should establish database connection successfully', async () => {
      const result = await DatabaseService.query('SELECT 1 as test');
      expect(result.rows[0].test).toBe(1);
    });

    it('should handle connection pool properly', async () => {
      const promises = [];
      
      // Create multiple concurrent queries
      for (let i = 0; i < 10; i++) {
        promises.push(
          DatabaseService.query('SELECT $1 as value', [i])
        );
      }

      const results = await Promise.all(promises);
      
      results.forEach((result, index) => {
        expect(result.rows[0].value).toBe(index);
      });
    });

    it('should handle database errors gracefully', async () => {
      await expect(
        DatabaseService.query('SELECT * FROM non_existent_table')
      ).rejects.toThrow();
    });
  });

  describe('User Management Operations', () => {
    const testUser = {
      id: 'test-user-123',
      email: 'test@example.com',
      password_hash: 'hashed_password',
      first_name: 'Test',
      last_name: 'User',
      phone: '+1234567890',
      timezone: 'UTC',
      is_active: true,
      is_verified: false
    };

    it('should create user successfully', async () => {
      const result = await testClient.query(`
        INSERT INTO users (id, email, password_hash, first_name, last_name, phone, timezone, is_active, is_verified)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING *
      `, [
        testUser.id,
        testUser.email,
        testUser.password_hash,
        testUser.first_name,
        testUser.last_name,
        testUser.phone,
        testUser.timezone,
        testUser.is_active,
        testUser.is_verified
      ]);

      expect(result.rowCount).toBe(1);
      expect(result.rows[0].email).toBe(testUser.email);
      expect(result.rows[0].first_name).toBe(testUser.first_name);
      expect(result.rows[0].is_active).toBe(true);
      expect(result.rows[0].is_verified).toBe(false);
    });

    it('should enforce unique email constraint', async () => {
      // Insert first user
      await testClient.query(`
        INSERT INTO users (id, email, password_hash, first_name, last_name)
        VALUES ($1, $2, $3, $4, $5)
      `, ['user1', 'duplicate@example.com', 'hash1', 'User', 'One']);

      // Try to insert second user with same email
      await expect(
        testClient.query(`
          INSERT INTO users (id, email, password_hash, first_name, last_name)
          VALUES ($1, $2, $3, $4, $5)
        `, ['user2', 'duplicate@example.com', 'hash2', 'User', 'Two'])
      ).rejects.toThrow();
    });

    it('should update user profile correctly', async () => {
      // Insert user
      await testClient.query(`
        INSERT INTO users (id, email, password_hash, first_name, last_name)
        VALUES ($1, $2, $3, $4, $5)
      `, [testUser.id, testUser.email, testUser.password_hash, testUser.first_name, testUser.last_name]);

      // Update user
      const updateResult = await testClient.query(`
        UPDATE users 
        SET first_name = $1, last_name = $2, phone = $3, updated_at = CURRENT_TIMESTAMP
        WHERE id = $4
        RETURNING *
      `, ['Updated', 'Name', '+9876543210', testUser.id]);

      expect(updateResult.rowCount).toBe(1);
      expect(updateResult.rows[0].first_name).toBe('Updated');
      expect(updateResult.rows[0].last_name).toBe('Name');
      expect(updateResult.rows[0].phone).toBe('+9876543210');
    });

    it('should soft delete user correctly', async () => {
      // Insert user
      await testClient.query(`
        INSERT INTO users (id, email, password_hash, first_name, last_name, is_active)
        VALUES ($1, $2, $3, $4, $5, $6)
      `, [testUser.id, testUser.email, testUser.password_hash, testUser.first_name, testUser.last_name, true]);

      // Soft delete user
      const deleteResult = await testClient.query(`
        UPDATE users 
        SET is_active = false, updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
        RETURNING *
      `, [testUser.id]);

      expect(deleteResult.rowCount).toBe(1);
      expect(deleteResult.rows[0].is_active).toBe(false);

      // Verify user still exists but inactive
      const checkResult = await testClient.query('SELECT * FROM users WHERE id = $1', [testUser.id]);
      expect(checkResult.rowCount).toBe(1);
      expect(checkResult.rows[0].is_active).toBe(false);
    });
  });

  describe('Strategy Management Operations', () => {
    const testUserId = 'test-user-123';
    const testStrategy = {
      id: 'strategy-123',
      user_id: testUserId,
      name: 'Test Strategy',
      description: 'A test trading strategy',
      config_json: JSON.stringify({
        nodes: [{ id: 'entry-1', type: 'entry' }],
        connections: [],
        parameters: { timeframe: '1h' }
      }),
      version: 1,
      is_active: true
    };

    beforeEach(async () => {
      // Create test user first
      await testClient.query(`
        INSERT INTO users (id, email, password_hash, first_name, last_name)
        VALUES ($1, $2, $3, $4, $5)
      `, [testUserId, 'test@example.com', 'hash', 'Test', 'User']);
    });

    it('should create strategy successfully', async () => {
      const result = await testClient.query(`
        INSERT INTO strategies (id, user_id, name, description, config_json, version, is_active)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
      `, [
        testStrategy.id,
        testStrategy.user_id,
        testStrategy.name,
        testStrategy.description,
        testStrategy.config_json,
        testStrategy.version,
        testStrategy.is_active
      ]);

      expect(result.rowCount).toBe(1);
      expect(result.rows[0].name).toBe(testStrategy.name);
      expect(result.rows[0].user_id).toBe(testUserId);
      expect(JSON.parse(result.rows[0].config_json)).toHaveProperty('nodes');
    });

    it('should enforce foreign key constraint for user_id', async () => {
      await expect(
        testClient.query(`
          INSERT INTO strategies (id, user_id, name, description, config_json, version)
          VALUES ($1, $2, $3, $4, $5, $6)
        `, ['strategy-456', 'non-existent-user', 'Test', 'Description', '{}', 1])
      ).rejects.toThrow();
    });

    it('should retrieve user strategies correctly', async () => {
      // Insert multiple strategies
      const strategies = [
        { ...testStrategy, id: 'strategy-1', name: 'Strategy 1' },
        { ...testStrategy, id: 'strategy-2', name: 'Strategy 2' },
        { ...testStrategy, id: 'strategy-3', name: 'Strategy 3', is_active: false }
      ];

      for (const strategy of strategies) {
        await testClient.query(`
          INSERT INTO strategies (id, user_id, name, description, config_json, version, is_active)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [strategy.id, strategy.user_id, strategy.name, strategy.description, strategy.config_json, strategy.version, strategy.is_active]);
      }

      // Retrieve all strategies for user
      const allResult = await testClient.query(`
        SELECT * FROM strategies WHERE user_id = $1 ORDER BY created_at
      `, [testUserId]);

      expect(allResult.rowCount).toBe(3);

      // Retrieve only active strategies
      const activeResult = await testClient.query(`
        SELECT * FROM strategies WHERE user_id = $1 AND is_active = true ORDER BY created_at
      `, [testUserId]);

      expect(activeResult.rowCount).toBe(2);
    });

    it('should update strategy version correctly', async () => {
      // Insert initial strategy
      await testClient.query(`
        INSERT INTO strategies (id, user_id, name, description, config_json, version)
        VALUES ($1, $2, $3, $4, $5, $6)
      `, [testStrategy.id, testStrategy.user_id, testStrategy.name, testStrategy.description, testStrategy.config_json, 1]);

      // Update strategy with new version
      const newConfig = JSON.stringify({
        nodes: [{ id: 'entry-1', type: 'entry' }, { id: 'exit-1', type: 'exit' }],
        connections: [{ from: 'entry-1', to: 'exit-1' }],
        parameters: { timeframe: '1h' }
      });

      const updateResult = await testClient.query(`
        UPDATE strategies 
        SET config_json = $1, version = version + 1, updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
        RETURNING *
      `, [newConfig, testStrategy.id]);

      expect(updateResult.rowCount).toBe(1);
      expect(updateResult.rows[0].version).toBe(2);
      expect(JSON.parse(updateResult.rows[0].config_json).nodes).toHaveLength(2);
    });
  });

  describe('Portfolio Management Operations', () => {
    const testUserId = 'test-user-123';
    const testPortfolio = {
      id: 'portfolio-123',
      user_id: testUserId,
      name: 'Test Portfolio',
      cash_balance: 10000.00,
      total_value: 10000.00
    };

    beforeEach(async () => {
      // Create test user first
      await testClient.query(`
        INSERT INTO users (id, email, password_hash, first_name, last_name)
        VALUES ($1, $2, $3, $4, $5)
      `, [testUserId, 'test@example.com', 'hash', 'Test', 'User']);
    });

    it('should create portfolio successfully', async () => {
      const result = await testClient.query(`
        INSERT INTO portfolios (id, user_id, name, cash_balance, total_value)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
      `, [
        testPortfolio.id,
        testPortfolio.user_id,
        testPortfolio.name,
        testPortfolio.cash_balance,
        testPortfolio.total_value
      ]);

      expect(result.rowCount).toBe(1);
      expect(result.rows[0].name).toBe(testPortfolio.name);
      expect(parseFloat(result.rows[0].cash_balance)).toBe(10000.00);
      expect(parseFloat(result.rows[0].total_value)).toBe(10000.00);
    });

    it('should create and manage positions correctly', async () => {
      // Create portfolio first
      await testClient.query(`
        INSERT INTO portfolios (id, user_id, name, cash_balance, total_value)
        VALUES ($1, $2, $3, $4, $5)
      `, [testPortfolio.id, testPortfolio.user_id, testPortfolio.name, testPortfolio.cash_balance, testPortfolio.total_value]);

      // Create position
      const positionResult = await testClient.query(`
        INSERT INTO positions (id, portfolio_id, symbol, quantity, avg_price, current_price, status)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
      `, ['position-123', testPortfolio.id, 'AAPL', 10, 150.00, 155.00, 'open']);

      expect(positionResult.rowCount).toBe(1);
      expect(positionResult.rows[0].symbol).toBe('AAPL');
      expect(parseInt(positionResult.rows[0].quantity)).toBe(10);
      expect(parseFloat(positionResult.rows[0].avg_price)).toBe(150.00);

      // Update position
      const updateResult = await testClient.query(`
        UPDATE positions 
        SET current_price = $1, updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
        RETURNING *
      `, [160.00, 'position-123']);

      expect(updateResult.rowCount).toBe(1);
      expect(parseFloat(updateResult.rows[0].current_price)).toBe(160.00);
    });

    it('should record trades correctly', async () => {
      // Create portfolio first
      await testClient.query(`
        INSERT INTO portfolios (id, user_id, name, cash_balance, total_value)
        VALUES ($1, $2, $3, $4, $5)
      `, [testPortfolio.id, testPortfolio.user_id, testPortfolio.name, testPortfolio.cash_balance, testPortfolio.total_value]);

      // Record trade
      const tradeResult = await testClient.query(`
        INSERT INTO trades (id, portfolio_id, symbol, side, quantity, price, fees, status)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
      `, ['trade-123', testPortfolio.id, 'AAPL', 'buy', 10, 150.00, 1.00, 'filled']);

      expect(tradeResult.rowCount).toBe(1);
      expect(tradeResult.rows[0].symbol).toBe('AAPL');
      expect(tradeResult.rows[0].side).toBe('buy');
      expect(parseInt(tradeResult.rows[0].quantity)).toBe(10);
      expect(parseFloat(tradeResult.rows[0].price)).toBe(150.00);
      expect(parseFloat(tradeResult.rows[0].fees)).toBe(1.00);
    });

    it('should calculate portfolio metrics correctly', async () => {
      // Create portfolio
      await testClient.query(`
        INSERT INTO portfolios (id, user_id, name, cash_balance, total_value)
        VALUES ($1, $2, $3, $4, $5)
      `, [testPortfolio.id, testPortfolio.user_id, testPortfolio.name, 5000.00, 15000.00]);

      // Add multiple positions
      const positions = [
        { id: 'pos-1', symbol: 'AAPL', quantity: 10, avg_price: 150.00, current_price: 155.00 },
        { id: 'pos-2', symbol: 'GOOGL', quantity: 5, avg_price: 2000.00, current_price: 2100.00 }
      ];

      for (const pos of positions) {
        await testClient.query(`
          INSERT INTO positions (id, portfolio_id, symbol, quantity, avg_price, current_price, status)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [pos.id, testPortfolio.id, pos.symbol, pos.quantity, pos.avg_price, pos.current_price, 'open']);
      }

      // Calculate total position value
      const metricsResult = await testClient.query(`
        SELECT 
          p.cash_balance,
          COALESCE(SUM(pos.quantity * pos.current_price), 0) as positions_value,
          p.cash_balance + COALESCE(SUM(pos.quantity * pos.current_price), 0) as total_value
        FROM portfolios p
        LEFT JOIN positions pos ON p.id = pos.portfolio_id AND pos.status = 'open'
        WHERE p.id = $1
        GROUP BY p.id, p.cash_balance
      `, [testPortfolio.id]);

      expect(metricsResult.rowCount).toBe(1);
      expect(parseFloat(metricsResult.rows[0].cash_balance)).toBe(5000.00);
      expect(parseFloat(metricsResult.rows[0].positions_value)).toBe(12050.00); // (10 * 155) + (5 * 2100)
      expect(parseFloat(metricsResult.rows[0].total_value)).toBe(17050.00);
    });
  });

  describe('Transaction Management', () => {
    it('should handle transactions correctly', async () => {
      const testUserId = 'test-user-123';

      await testClient.query('BEGIN');

      try {
        // Create user
        await testClient.query(`
          INSERT INTO users (id, email, password_hash, first_name, last_name)
          VALUES ($1, $2, $3, $4, $5)
        `, [testUserId, 'test@example.com', 'hash', 'Test', 'User']);

        // Create portfolio
        await testClient.query(`
          INSERT INTO portfolios (id, user_id, name, cash_balance, total_value)
          VALUES ($1, $2, $3, $4, $5)
        `, ['portfolio-123', testUserId, 'Test Portfolio', 10000.00, 10000.00]);

        await testClient.query('COMMIT');

        // Verify both records exist
        const userResult = await testClient.query('SELECT * FROM users WHERE id = $1', [testUserId]);
        const portfolioResult = await testClient.query('SELECT * FROM portfolios WHERE user_id = $1', [testUserId]);

        expect(userResult.rowCount).toBe(1);
        expect(portfolioResult.rowCount).toBe(1);

      } catch (error) {
        await testClient.query('ROLLBACK');
        throw error;
      }
    });

    it('should rollback on transaction failure', async () => {
      const testUserId = 'test-user-456';

      await testClient.query('BEGIN');

      try {
        // Create user
        await testClient.query(`
          INSERT INTO users (id, email, password_hash, first_name, last_name)
          VALUES ($1, $2, $3, $4, $5)
        `, [testUserId, 'test2@example.com', 'hash', 'Test', 'User']);

        // Try to create portfolio with invalid foreign key (should fail)
        await testClient.query(`
          INSERT INTO portfolios (id, user_id, name, cash_balance, total_value)
          VALUES ($1, $2, $3, $4, $5)
        `, ['portfolio-456', 'non-existent-user', 'Test Portfolio', 10000.00, 10000.00]);

        await testClient.query('COMMIT');

      } catch (error) {
        await testClient.query('ROLLBACK');

        // Verify user was not created due to rollback
        const userResult = await testClient.query('SELECT * FROM users WHERE id = $1', [testUserId]);
        expect(userResult.rowCount).toBe(0);
      }
    });
  });

  describe('Performance and Indexing', () => {
    it('should use indexes for common queries', async () => {
      const testUserId = 'test-user-123';

      // Create test user
      await testClient.query(`
        INSERT INTO users (id, email, password_hash, first_name, last_name)
        VALUES ($1, $2, $3, $4, $5)
      `, [testUserId, 'test@example.com', 'hash', 'Test', 'User']);

      // Create multiple strategies to test index usage
      for (let i = 0; i < 100; i++) {
        await testClient.query(`
          INSERT INTO strategies (id, user_id, name, description, config_json, version)
          VALUES ($1, $2, $3, $4, $5, $6)
        `, [`strategy-${i}`, testUserId, `Strategy ${i}`, 'Description', '{}', 1]);
      }

      // Query with EXPLAIN to check index usage
      const explainResult = await testClient.query(`
        EXPLAIN (FORMAT JSON) 
        SELECT * FROM strategies WHERE user_id = $1 ORDER BY created_at DESC LIMIT 10
      `, [testUserId]);

      const plan = explainResult.rows[0]['QUERY PLAN'][0];
      
      // Should use index scan, not sequential scan for large datasets
      expect(plan.Plan['Node Type']).not.toBe('Seq Scan');
    });

    it('should handle concurrent operations correctly', async () => {
      const testUserId = 'test-user-123';
      const portfolioId = 'portfolio-123';

      // Create test data
      await testClient.query(`
        INSERT INTO users (id, email, password_hash, first_name, last_name)
        VALUES ($1, $2, $3, $4, $5)
      `, [testUserId, 'test@example.com', 'hash', 'Test', 'User']);

      await testClient.query(`
        INSERT INTO portfolios (id, user_id, name, cash_balance, total_value)
        VALUES ($1, $2, $3, $4, $5)
      `, [portfolioId, testUserId, 'Test Portfolio', 10000.00, 10000.00]);

      // Simulate concurrent balance updates
      const updatePromises = [];
      for (let i = 0; i < 10; i++) {
        updatePromises.push(
          testClient.query(`
            UPDATE portfolios 
            SET cash_balance = cash_balance - 100, updated_at = CURRENT_TIMESTAMP
            WHERE id = $1
          `, [portfolioId])
        );
      }

      await Promise.all(updatePromises);

      // Verify final balance is correct
      const result = await testClient.query('SELECT cash_balance FROM portfolios WHERE id = $1', [portfolioId]);
      expect(parseFloat(result.rows[0].cash_balance)).toBe(9000.00);
    });
  });

  describe('Data Integrity and Constraints', () => {
    it('should enforce NOT NULL constraints', async () => {
      await expect(
        testClient.query(`
          INSERT INTO users (id, password_hash, first_name, last_name)
          VALUES ($1, $2, $3, $4)
        `, ['user-123', 'hash', 'Test', 'User'])
      ).rejects.toThrow(); // email is required
    });

    it('should enforce CHECK constraints', async () => {
      const testUserId = 'test-user-123';

      // Create test user
      await testClient.query(`
        INSERT INTO users (id, email, password_hash, first_name, last_name)
        VALUES ($1, $2, $3, $4, $5)
      `, [testUserId, 'test@example.com', 'hash', 'Test', 'User']);

      // Try to create portfolio with negative balance (should fail if CHECK constraint exists)
      await expect(
        testClient.query(`
          INSERT INTO portfolios (id, user_id, name, cash_balance, total_value)
          VALUES ($1, $2, $3, $4, $5)
        `, ['portfolio-123', testUserId, 'Test Portfolio', -1000.00, -1000.00])
      ).rejects.toThrow();
    });

    it('should maintain referential integrity', async () => {
      const testUserId = 'test-user-123';
      const portfolioId = 'portfolio-123';

      // Create test data
      await testClient.query(`
        INSERT INTO users (id, email, password_hash, first_name, last_name)
        VALUES ($1, $2, $3, $4, $5)
      `, [testUserId, 'test@example.com', 'hash', 'Test', 'User']);

      await testClient.query(`
        INSERT INTO portfolios (id, user_id, name, cash_balance, total_value)
        VALUES ($1, $2, $3, $4, $5)
      `, [portfolioId, testUserId, 'Test Portfolio', 10000.00, 10000.00]);

      // Try to delete user with existing portfolio (should fail due to foreign key)
      await expect(
        testClient.query('DELETE FROM users WHERE id = $1', [testUserId])
      ).rejects.toThrow();
    });
  });
});