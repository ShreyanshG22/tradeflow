import { Pool } from 'pg';
import Redis from 'ioredis';

export default async function globalTeardown() {
  console.log('🧹 Cleaning up global test environment...');

  try {
    // Clean up test database
    await cleanupTestDatabase();
    
    // Clean up test Redis
    await cleanupTestRedis();
    
    // Stop any test services
    await stopTestServices();
    
    console.log('✅ Global test environment cleanup completed');
  } catch (error) {
    console.error('❌ Global test cleanup failed:', error);
  }
}

async function cleanupTestDatabase() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.log('ℹ️ No database URL provided, skipping database cleanup');
    return;
  }

  try {
    const pool = new Pool({ connectionString: dbUrl });
    
    // Clean up test data
    const cleanupQueries = [
      'DELETE FROM zerodha_positions WHERE created_at < NOW() - INTERVAL \'1 hour\'',
      'DELETE FROM zerodha_orders WHERE created_at < NOW() - INTERVAL \'1 hour\'',
      'DELETE FROM users WHERE email LIKE \'test-%@example.com\'',
      'DELETE FROM zerodha_instruments WHERE created_at < NOW() - INTERVAL \'1 day\''
    ];

    for (const query of cleanupQueries) {
      try {
        const result = await pool.query(query);
        console.log(`🗑️ Cleaned up ${result.rowCount} rows from ${query.split(' ')[2]}`);
      } catch (error) {
        console.log(`⚠️ Cleanup query failed: ${error.message}`);
      }
    }

    await pool.end();
    console.log('✅ Test database cleanup completed');
  } catch (error) {
    console.log('⚠️ Test database cleanup failed:', error.message);
  }
}

async function cleanupTestRedis() {
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379/1';
  
  try {
    const redis = new Redis(redisUrl);
    
    // Get all test keys
    const keys = await redis.keys('test:*');
    const sessionKeys = await redis.keys('session:*');
    const cacheKeys = await redis.keys('cache:*');
    
    const allKeys = [...keys, ...sessionKeys, ...cacheKeys];
    
    if (allKeys.length > 0) {
      await redis.del(...allKeys);
      console.log(`🗑️ Cleaned up ${allKeys.length} Redis keys`);
    }
    
    await redis.quit();
    console.log('✅ Test Redis cleanup completed');
  } catch (error) {
    console.log('⚠️ Test Redis cleanup failed:', error.message);
  }
}

async function stopTestServices() {
  // Stop any background services that were started for testing
  
  try {
    // Check if test server is running and stop it if needed
    const testPort = process.env.TEST_PORT || '3001';
    
    try {
      const response = await fetch(`http://localhost:${testPort}/health`);
      if (response.ok) {
        console.log('ℹ️ Test server is still running (will be stopped by test runner)');
      }
    } catch (error) {
      // Server not running, which is expected after tests
      console.log('✅ Test server already stopped');
    }
    
    // Clean up any other resources
    await cleanupTempFiles();
    
  } catch (error) {
    console.log('⚠️ Service cleanup failed:', error.message);
  }
}

async function cleanupTempFiles() {
  // Clean up any temporary files created during testing
  const fs = require('fs').promises;
  const path = require('path');
  
  try {
    const tempDir = path.join(process.cwd(), 'temp');
    
    try {
      const files = await fs.readdir(tempDir);
      for (const file of files) {
        if (file.startsWith('test-')) {
          await fs.unlink(path.join(tempDir, file));
        }
      }
      console.log(`🗑️ Cleaned up temporary test files`);
    } catch (error) {
      // Temp directory doesn't exist or is empty
    }
  } catch (error) {
    console.log('⚠️ Temp file cleanup failed:', error.message);
  }
}

// Handle process termination
process.on('SIGINT', async () => {
  console.log('\n🛑 Received SIGINT, cleaning up...');
  await globalTeardown();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Received SIGTERM, cleaning up...');
  await globalTeardown();
  process.exit(0);
});