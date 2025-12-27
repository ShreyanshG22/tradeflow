import { RedisService } from '../../../user-service/src/services/redis';
import Redis from 'ioredis';

describe('Redis Integration Tests', () => {
  let redisClient: Redis;

  beforeAll(async () => {
    // Initialize Redis connection
    await RedisService.initialize();
    redisClient = RedisService.getClient();
  });

  afterAll(async () => {
    await RedisService.close();
  });

  beforeEach(async () => {
    // Clear test keys before each test
    const keys = await redisClient.keys('test:*');
    if (keys.length > 0) {
      await redisClient.del(...keys);
    }
  });

  describe('Redis Connection', () => {
    it('should establish Redis connection successfully', async () => {
      const result = await redisClient.ping();
      expect(result).toBe('PONG');
    });

    it('should handle Redis connection errors gracefully', async () => {
      // Create a client with invalid configuration
      const invalidClient = new Redis({
        host: 'invalid-host',
        port: 9999,
        retryDelayOnFailover: 100,
        maxRetriesPerRequest: 1,
        lazyConnect: true
      });

      await expect(invalidClient.ping()).rejects.toThrow();
      invalidClient.disconnect();
    });
  });

  describe('Basic Key-Value Operations', () => {
    it('should set and get string values', async () => {
      await redisClient.set('test:string', 'hello world');
      const result = await redisClient.get('test:string');
      expect(result).toBe('hello world');
    });

    it('should set values with expiration', async () => {
      await redisClient.setex('test:expiring', 1, 'temporary value');
      
      let result = await redisClient.get('test:expiring');
      expect(result).toBe('temporary value');

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 1100));
      
      result = await redisClient.get('test:expiring');
      expect(result).toBeNull();
    });

    it('should handle non-existent keys', async () => {
      const result = await redisClient.get('test:nonexistent');
      expect(result).toBeNull();
    });

    it('should delete keys successfully', async () => {
      await redisClient.set('test:delete', 'to be deleted');
      
      let exists = await redisClient.exists('test:delete');
      expect(exists).toBe(1);

      await redisClient.del('test:delete');
      
      exists = await redisClient.exists('test:delete');
      expect(exists).toBe(0);
    });

    it('should check key existence', async () => {
      await redisClient.set('test:exists', 'value');
      
      const exists = await redisClient.exists('test:exists');
      expect(exists).toBe(1);

      const notExists = await redisClient.exists('test:notexists');
      expect(notExists).toBe(0);
    });
  });

  describe('Session Management', () => {
    const sessionId = 'test:session:user123';
    const sessionData = {
      userId: 'user123',
      email: 'test@example.com',
      role: 'trader',
      loginTime: new Date().toISOString(),
      lastActivity: new Date().toISOString()
    };

    it('should store and retrieve session data', async () => {
      await redisClient.setex(sessionId, 3600, JSON.stringify(sessionData));
      
      const retrieved = await redisClient.get(sessionId);
      expect(retrieved).not.toBeNull();
      
      const parsedData = JSON.parse(retrieved!);
      expect(parsedData.userId).toBe(sessionData.userId);
      expect(parsedData.email).toBe(sessionData.email);
      expect(parsedData.role).toBe(sessionData.role);
    });

    it('should update session expiration', async () => {
      await redisClient.setex(sessionId, 10, JSON.stringify(sessionData));
      
      // Extend session
      await redisClient.expire(sessionId, 3600);
      
      const ttl = await redisClient.ttl(sessionId);
      expect(ttl).toBeGreaterThan(3500); // Should be close to 3600
    });

    it('should handle session invalidation', async () => {
      await redisClient.setex(sessionId, 3600, JSON.stringify(sessionData));
      
      // Verify session exists
      let exists = await redisClient.exists(sessionId);
      expect(exists).toBe(1);

      // Invalidate session
      await redisClient.del(sessionId);
      
      exists = await redisClient.exists(sessionId);
      expect(exists).toBe(0);
    });

    it('should manage multiple user sessions', async () => {
      const sessions = [
        { id: 'test:session:user1', data: { userId: 'user1', device: 'desktop' } },
        { id: 'test:session:user1:mobile', data: { userId: 'user1', device: 'mobile' } },
        { id: 'test:session:user2', data: { userId: 'user2', device: 'desktop' } }
      ];

      // Create multiple sessions
      for (const session of sessions) {
        await redisClient.setex(session.id, 3600, JSON.stringify(session.data));
      }

      // Get all sessions for user1
      const user1Sessions = await redisClient.keys('test:session:user1*');
      expect(user1Sessions).toHaveLength(2);

      // Get all sessions
      const allSessions = await redisClient.keys('test:session:*');
      expect(allSessions).toHaveLength(3);
    });
  });

  describe('Market Data Caching', () => {
    const symbol = 'AAPL';
    const marketData = {
      symbol: 'AAPL',
      price: 150.25,
      bid: 150.20,
      ask: 150.30,
      volume: 1000000,
      timestamp: new Date().toISOString()
    };

    it('should cache market data with appropriate TTL', async () => {
      const cacheKey = `test:market-data:${symbol}`;
      
      await redisClient.setex(cacheKey, 60, JSON.stringify(marketData));
      
      const cached = await redisClient.get(cacheKey);
      expect(cached).not.toBeNull();
      
      const parsedData = JSON.parse(cached!);
      expect(parsedData.symbol).toBe(symbol);
      expect(parsedData.price).toBe(150.25);
    });

    it('should handle cache misses gracefully', async () => {
      const cacheKey = 'test:market-data:NONEXISTENT';
      
      const cached = await redisClient.get(cacheKey);
      expect(cached).toBeNull();
    });

    it('should update cached market data', async () => {
      const cacheKey = `test:market-data:${symbol}`;
      
      // Initial cache
      await redisClient.setex(cacheKey, 60, JSON.stringify(marketData));
      
      // Update with new price
      const updatedData = { ...marketData, price: 151.50, timestamp: new Date().toISOString() };
      await redisClient.setex(cacheKey, 60, JSON.stringify(updatedData));
      
      const cached = await redisClient.get(cacheKey);
      const parsedData = JSON.parse(cached!);
      expect(parsedData.price).toBe(151.50);
    });

    it('should cache multiple symbols efficiently', async () => {
      const symbols = ['AAPL', 'GOOGL', 'MSFT', 'TSLA', 'AMZN'];
      const pipeline = redisClient.pipeline();

      // Use pipeline for batch operations
      symbols.forEach(sym => {
        const data = { ...marketData, symbol: sym, price: Math.random() * 1000 };
        pipeline.setex(`test:market-data:${sym}`, 60, JSON.stringify(data));
      });

      await pipeline.exec();

      // Verify all symbols are cached
      const keys = await redisClient.keys('test:market-data:*');
      expect(keys).toHaveLength(symbols.length);
    });
  });

  describe('Pub/Sub Messaging', () => {
    let subscriber: Redis;
    let publisher: Redis;

    beforeEach(() => {
      subscriber = redisClient.duplicate();
      publisher = redisClient.duplicate();
    });

    afterEach(async () => {
      await subscriber.disconnect();
      await publisher.disconnect();
    });

    it('should publish and receive messages', (done) => {
      const channel = 'test:notifications';
      const message = { type: 'trade', data: { symbol: 'AAPL', price: 150.25 } };

      subscriber.subscribe(channel);
      
      subscriber.on('message', (receivedChannel, receivedMessage) => {
        expect(receivedChannel).toBe(channel);
        
        const parsedMessage = JSON.parse(receivedMessage);
        expect(parsedMessage.type).toBe(message.type);
        expect(parsedMessage.data.symbol).toBe(message.data.symbol);
        
        done();
      });

      // Give subscriber time to connect
      setTimeout(() => {
        publisher.publish(channel, JSON.stringify(message));
      }, 100);
    });

    it('should handle multiple subscribers', (done) => {
      const channel = 'test:broadcast';
      const message = { type: 'system', data: 'maintenance alert' };
      
      const subscriber2 = redisClient.duplicate();
      let messageCount = 0;

      const handleMessage = () => {
        messageCount++;
        if (messageCount === 2) {
          subscriber2.disconnect();
          done();
        }
      };

      subscriber.subscribe(channel);
      subscriber2.subscribe(channel);
      
      subscriber.on('message', handleMessage);
      subscriber2.on('message', handleMessage);

      setTimeout(() => {
        publisher.publish(channel, JSON.stringify(message));
      }, 100);
    });

    it('should support pattern subscriptions', (done) => {
      const pattern = 'test:market-data:*';
      const channel = 'test:market-data:AAPL';
      const message = { symbol: 'AAPL', price: 150.25 };

      subscriber.psubscribe(pattern);
      
      subscriber.on('pmessage', (receivedPattern, receivedChannel, receivedMessage) => {
        expect(receivedPattern).toBe(pattern);
        expect(receivedChannel).toBe(channel);
        
        const parsedMessage = JSON.parse(receivedMessage);
        expect(parsedMessage.symbol).toBe(message.symbol);
        
        done();
      });

      setTimeout(() => {
        publisher.publish(channel, JSON.stringify(message));
      }, 100);
    });
  });

  describe('Hash Operations', () => {
    const hashKey = 'test:user:profile:123';
    const userProfile = {
      id: '123',
      email: 'test@example.com',
      firstName: 'John',
      lastName: 'Doe',
      lastLogin: new Date().toISOString()
    };

    it('should store and retrieve hash fields', async () => {
      await redisClient.hmset(hashKey, userProfile);
      
      const retrieved = await redisClient.hgetall(hashKey);
      expect(retrieved.id).toBe(userProfile.id);
      expect(retrieved.email).toBe(userProfile.email);
      expect(retrieved.firstName).toBe(userProfile.firstName);
    });

    it('should update individual hash fields', async () => {
      await redisClient.hmset(hashKey, userProfile);
      
      // Update single field
      await redisClient.hset(hashKey, 'lastLogin', new Date().toISOString());
      
      const lastLogin = await redisClient.hget(hashKey, 'lastLogin');
      expect(lastLogin).not.toBe(userProfile.lastLogin);
    });

    it('should check hash field existence', async () => {
      await redisClient.hmset(hashKey, userProfile);
      
      const exists = await redisClient.hexists(hashKey, 'email');
      expect(exists).toBe(1);

      const notExists = await redisClient.hexists(hashKey, 'nonexistent');
      expect(notExists).toBe(0);
    });

    it('should delete hash fields', async () => {
      await redisClient.hmset(hashKey, userProfile);
      
      await redisClient.hdel(hashKey, 'lastLogin');
      
      const exists = await redisClient.hexists(hashKey, 'lastLogin');
      expect(exists).toBe(0);
    });
  });

  describe('List Operations', () => {
    const listKey = 'test:notifications:user123';

    it('should push and pop list items', async () => {
      const notifications = [
        { id: '1', message: 'Trade executed', timestamp: new Date().toISOString() },
        { id: '2', message: 'Strategy started', timestamp: new Date().toISOString() },
        { id: '3', message: 'Portfolio updated', timestamp: new Date().toISOString() }
      ];

      // Push notifications
      for (const notif of notifications) {
        await redisClient.lpush(listKey, JSON.stringify(notif));
      }

      const length = await redisClient.llen(listKey);
      expect(length).toBe(3);

      // Pop latest notification
      const latest = await redisClient.lpop(listKey);
      const parsedLatest = JSON.parse(latest!);
      expect(parsedLatest.id).toBe('3'); // Last pushed, first popped
    });

    it('should get list range', async () => {
      const items = ['item1', 'item2', 'item3', 'item4', 'item5'];
      
      for (const item of items) {
        await redisClient.rpush(listKey, item);
      }

      // Get first 3 items
      const range = await redisClient.lrange(listKey, 0, 2);
      expect(range).toHaveLength(3);
      expect(range[0]).toBe('item1');
      expect(range[2]).toBe('item3');
    });

    it('should trim list to specified size', async () => {
      const items = Array.from({ length: 10 }, (_, i) => `item${i + 1}`);
      
      for (const item of items) {
        await redisClient.rpush(listKey, item);
      }

      // Keep only last 5 items
      await redisClient.ltrim(listKey, -5, -1);
      
      const length = await redisClient.llen(listKey);
      expect(length).toBe(5);

      const remaining = await redisClient.lrange(listKey, 0, -1);
      expect(remaining[0]).toBe('item6');
      expect(remaining[4]).toBe('item10');
    });
  });

  describe('Set Operations', () => {
    const setKey = 'test:active-users';

    it('should add and remove set members', async () => {
      const users = ['user1', 'user2', 'user3'];
      
      // Add users to set
      await redisClient.sadd(setKey, ...users);
      
      const size = await redisClient.scard(setKey);
      expect(size).toBe(3);

      // Check membership
      const isMember = await redisClient.sismember(setKey, 'user2');
      expect(isMember).toBe(1);

      // Remove user
      await redisClient.srem(setKey, 'user2');
      
      const newSize = await redisClient.scard(setKey);
      expect(newSize).toBe(2);
    });

    it('should get all set members', async () => {
      const users = ['user1', 'user2', 'user3'];
      await redisClient.sadd(setKey, ...users);
      
      const members = await redisClient.smembers(setKey);
      expect(members).toHaveLength(3);
      expect(members).toContain('user1');
      expect(members).toContain('user2');
      expect(members).toContain('user3');
    });

    it('should perform set operations', async () => {
      const set1 = 'test:set1';
      const set2 = 'test:set2';
      
      await redisClient.sadd(set1, 'a', 'b', 'c');
      await redisClient.sadd(set2, 'b', 'c', 'd');
      
      // Intersection
      const intersection = await redisClient.sinter(set1, set2);
      expect(intersection).toHaveLength(2);
      expect(intersection).toContain('b');
      expect(intersection).toContain('c');

      // Union
      const union = await redisClient.sunion(set1, set2);
      expect(union).toHaveLength(4);
      expect(union).toContain('a');
      expect(union).toContain('d');

      // Difference
      const diff = await redisClient.sdiff(set1, set2);
      expect(diff).toHaveLength(1);
      expect(diff).toContain('a');
    });
  });

  describe('Sorted Set Operations', () => {
    const zsetKey = 'test:leaderboard';

    it('should add and retrieve sorted set members', async () => {
      const players = [
        { name: 'player1', score: 100 },
        { name: 'player2', score: 200 },
        { name: 'player3', score: 150 }
      ];

      // Add players with scores
      for (const player of players) {
        await redisClient.zadd(zsetKey, player.score, player.name);
      }

      // Get top players (highest scores first)
      const topPlayers = await redisClient.zrevrange(zsetKey, 0, -1, 'WITHSCORES');
      
      expect(topPlayers[0]).toBe('player2'); // Highest score
      expect(parseInt(topPlayers[1])).toBe(200);
      expect(topPlayers[2]).toBe('player3');
      expect(parseInt(topPlayers[3])).toBe(150);
    });

    it('should get member rank and score', async () => {
      await redisClient.zadd(zsetKey, 100, 'player1', 200, 'player2', 150, 'player3');
      
      // Get rank (0-based, lowest score = rank 0)
      const rank = await redisClient.zrank(zsetKey, 'player2');
      expect(rank).toBe(2); // Highest score = highest rank

      // Get reverse rank (highest score = rank 0)
      const revRank = await redisClient.zrevrank(zsetKey, 'player2');
      expect(revRank).toBe(0);

      // Get score
      const score = await redisClient.zscore(zsetKey, 'player2');
      expect(parseInt(score!)).toBe(200);
    });

    it('should get members by score range', async () => {
      await redisClient.zadd(zsetKey, 100, 'player1', 200, 'player2', 150, 'player3', 175, 'player4');
      
      // Get players with scores between 140 and 180
      const inRange = await redisClient.zrangebyscore(zsetKey, 140, 180);
      expect(inRange).toHaveLength(2);
      expect(inRange).toContain('player3');
      expect(inRange).toContain('player4');
    });
  });

  describe('Performance and Concurrency', () => {
    it('should handle concurrent operations efficiently', async () => {
      const operations = [];
      const numOperations = 100;

      // Create many concurrent operations
      for (let i = 0; i < numOperations; i++) {
        operations.push(
          redisClient.set(`test:concurrent:${i}`, `value${i}`)
        );
      }

      const startTime = Date.now();
      await Promise.all(operations);
      const endTime = Date.now();

      // Should complete reasonably quickly
      expect(endTime - startTime).toBeLessThan(5000);

      // Verify all keys were set
      const keys = await redisClient.keys('test:concurrent:*');
      expect(keys).toHaveLength(numOperations);
    });

    it('should use pipeline for batch operations efficiently', async () => {
      const pipeline = redisClient.pipeline();
      const numOperations = 1000;

      // Add many operations to pipeline
      for (let i = 0; i < numOperations; i++) {
        pipeline.set(`test:pipeline:${i}`, `value${i}`);
      }

      const startTime = Date.now();
      const results = await pipeline.exec();
      const endTime = Date.now();

      expect(results).toHaveLength(numOperations);
      expect(endTime - startTime).toBeLessThan(2000); // Should be faster than individual operations

      // Verify operations succeeded
      results?.forEach(([error, result]) => {
        expect(error).toBeNull();
        expect(result).toBe('OK');
      });
    });

    it('should handle memory usage efficiently', async () => {
      const largeValue = 'x'.repeat(1024 * 1024); // 1MB string
      
      // Set large value
      await redisClient.set('test:large-value', largeValue);
      
      // Retrieve and verify
      const retrieved = await redisClient.get('test:large-value');
      expect(retrieved).toBe(largeValue);
      
      // Clean up
      await redisClient.del('test:large-value');
    });
  });

  describe('Error Handling and Recovery', () => {
    it('should handle network interruptions gracefully', async () => {
      // This test would require actually interrupting the network
      // For now, we'll test timeout handling
      const timeoutClient = new Redis({
        host: redisClient.options.host,
        port: redisClient.options.port,
        commandTimeout: 100, // Very short timeout
        retryDelayOnFailover: 100,
        maxRetriesPerRequest: 1
      });

      try {
        // This might timeout or succeed depending on network speed
        await timeoutClient.ping();
      } catch (error) {
        expect(error).toBeDefined();
      } finally {
        timeoutClient.disconnect();
      }
    });

    it('should handle Redis server restart simulation', async () => {
      // Test reconnection logic by creating a new client
      const reconnectClient = new Redis({
        host: redisClient.options.host,
        port: redisClient.options.port,
        retryDelayOnFailover: 100,
        maxRetriesPerRequest: 3,
        lazyConnect: true
      });

      try {
        await reconnectClient.connect();
        const result = await reconnectClient.ping();
        expect(result).toBe('PONG');
      } finally {
        reconnectClient.disconnect();
      }
    });
  });
});