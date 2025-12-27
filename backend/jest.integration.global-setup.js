const { execSync } = require('child_process');

module.exports = async () => {
  console.log('Setting up integration test environment...');
  
  try {
    // Set test environment variables
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://test_user:test_password@localhost:5433/tradeflow_test';
    process.env.REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6380/1';
    
    // Check if test database is available
    try {
      execSync('pg_isready -h localhost -p 5433', { stdio: 'ignore' });
      console.log('✓ PostgreSQL test database is ready');
    } catch (error) {
      console.warn('⚠ PostgreSQL test database not available, some tests may fail');
    }
    
    // Check if test Redis is available
    try {
      execSync('redis-cli -p 6380 ping', { stdio: 'ignore' });
      console.log('✓ Redis test instance is ready');
    } catch (error) {
      console.warn('⚠ Redis test instance not available, some tests may fail');
    }
    
    // Run database migrations if needed
    try {
      execSync('cd database && npm run migrate', { stdio: 'ignore' });
      console.log('✓ Database migrations completed');
    } catch (error) {
      console.warn('⚠ Database migrations failed:', error.message);
    }
    
    console.log('Integration test environment setup complete');
    
  } catch (error) {
    console.error('Failed to setup integration test environment:', error.message);
    throw error;
  }
};