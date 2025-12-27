import { BaseRepository, DatabaseConfig } from '../../database/BaseRepository';
import { Pool } from 'pg';

// Mock pg module
jest.mock('pg', () => ({
  Pool: jest.fn().mockImplementation(() => ({
    connect: jest.fn(),
    query: jest.fn(),
    end: jest.fn(),
    on: jest.fn()
  }))
}));

// Test implementation of BaseRepository
class TestRepository extends BaseRepository {
  constructor(config: DatabaseConfig) {
    super(config, 'test_table');
  }

  public async testQuery(text: string, params?: any[]) {
    return this.query(text, params);
  }

  public async testTransaction<T>(callback: any) {
    return this.transaction(callback);
  }

  public async testFindById(id: string) {
    return this.findById(id);
  }

  public async testFindBy(criteria: Record<string, any>) {
    return this.findBy(criteria);
  }

  public async testInsert(data: any) {
    return this.insert(data);
  }

  public async testUpdateById(id: string, data: any) {
    return this.updateById(id, data);
  }

  public async testDeleteById(id: string) {
    return this.deleteById(id);
  }

  public async testCount(criteria?: Record<string, any>) {
    return this.count(criteria);
  }

  public async testExists(criteria: Record<string, any>) {
    return this.exists(criteria);
  }

  public async testUpsert(data: any, conflictColumns: string[]) {
    return this.upsert(data, conflictColumns);
  }
}

describe('BaseRepository', () => {
  let repository: TestRepository;
  let mockPool: jest.Mocked<Pool>;
  let mockClient: any;

  beforeEach(() => {
    mockClient = {
      query: jest.fn(),
      release: jest.fn()
    };

    mockPool = {
      connect: jest.fn().mockResolvedValue(mockClient),
      query: jest.fn(),
      end: jest.fn(),
      on: jest.fn()
    } as any;

    (Pool as jest.Mock).mockImplementation(() => mockPool);

    const config: DatabaseConfig = {
      connectionString: 'postgresql://test:test@localhost:5432/test',
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000
    };

    repository = new TestRepository(config);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with correct configuration', () => {
      expect(Pool).toHaveBeenCalledWith({
        connectionString: 'postgresql://test:test@localhost:5432/test',
        max: 10,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 2000
      });
    });

    it('should setup event handlers', () => {
      expect(mockPool.on).toHaveBeenCalledWith('connect', expect.any(Function));
      expect(mockPool.on).toHaveBeenCalledWith('error', expect.any(Function));
      expect(mockPool.on).toHaveBeenCalledWith('remove', expect.any(Function));
    });
  });

  describe('query', () => {
    it('should execute query successfully', async () => {
      const mockResult = {
        rows: [{ id: '1', name: 'test' }],
        rowCount: 1
      };
      mockClient.query.mockResolvedValue(mockResult);

      const result = await repository.testQuery('SELECT * FROM test_table WHERE id = $1', ['1']);

      expect(mockPool.connect).toHaveBeenCalled();
      expect(mockClient.query).toHaveBeenCalledWith('SELECT * FROM test_table WHERE id = $1', ['1']);
      expect(mockClient.release).toHaveBeenCalled();
      expect(result).toEqual({
        rows: [{ id: '1', name: 'test' }],
        rowCount: 1
      });
    });

    it('should handle query errors', async () => {
      const error = new Error('Database error');
      mockClient.query.mockRejectedValue(error);

      await expect(repository.testQuery('SELECT * FROM test_table')).rejects.toThrow('Database error');
      expect(mockClient.release).toHaveBeenCalled();
    });
  });

  describe('transaction', () => {
    it('should execute transaction successfully', async () => {
      const mockCallback = jest.fn().mockResolvedValue('success');
      mockClient.query.mockResolvedValue({ rows: [], rowCount: 0 });

      const result = await repository.testTransaction(mockCallback);

      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockCallback).toHaveBeenCalledWith(mockClient);
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
      expect(result).toBe('success');
    });

    it('should rollback on error', async () => {
      const error = new Error('Transaction error');
      const mockCallback = jest.fn().mockRejectedValue(error);
      mockClient.query.mockResolvedValue({ rows: [], rowCount: 0 });

      await expect(repository.testTransaction(mockCallback)).rejects.toThrow('Transaction error');
      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    });
  });

  describe('findById', () => {
    it('should find record by ID', async () => {
      const mockRecord = { id: '1', name: 'test' };
      mockClient.query.mockResolvedValue({
        rows: [mockRecord],
        rowCount: 1
      });

      const result = await repository.testFindById('1');

      expect(mockClient.query).toHaveBeenCalledWith('SELECT * FROM test_table WHERE id = $1', ['1']);
      expect(result).toEqual(mockRecord);
    });

    it('should return null when record not found', async () => {
      mockClient.query.mockResolvedValue({
        rows: [],
        rowCount: 0
      });

      const result = await repository.testFindById('1');

      expect(result).toBeNull();
    });
  });

  describe('findBy', () => {
    it('should find records by criteria', async () => {
      const mockRecords = [
        { id: '1', name: 'test1' },
        { id: '2', name: 'test2' }
      ];
      mockClient.query.mockResolvedValue({
        rows: mockRecords,
        rowCount: 2
      });

      const result = await repository.testFindBy({ name: 'test' });

      expect(mockClient.query).toHaveBeenCalledWith(
        'SELECT * FROM test_table WHERE name = $1',
        ['test']
      );
      expect(result).toEqual(mockRecords);
    });

    it('should handle empty criteria', async () => {
      const mockRecords = [{ id: '1', name: 'test' }];
      mockClient.query.mockResolvedValue({
        rows: mockRecords,
        rowCount: 1
      });

      const result = await repository.testFindBy({});

      expect(mockClient.query).toHaveBeenCalledWith(
        'SELECT * FROM test_table',
        []
      );
      expect(result).toEqual(mockRecords);
    });
  });

  describe('insert', () => {
    it('should insert record successfully', async () => {
      const mockRecord = { id: '1', name: 'test', created_at: new Date() };
      mockClient.query.mockResolvedValue({
        rows: [mockRecord],
        rowCount: 1
      });

      const result = await repository.testInsert({ name: 'test' });

      expect(mockClient.query).toHaveBeenCalledWith(
        'INSERT INTO test_table (name) VALUES ($1) RETURNING *',
        ['test']
      );
      expect(result).toEqual(mockRecord);
    });

    it('should throw error when insert fails', async () => {
      mockClient.query.mockResolvedValue({
        rows: [],
        rowCount: 0
      });

      await expect(repository.testInsert({ name: 'test' })).rejects.toThrow(
        'Failed to insert record into test_table'
      );
    });
  });

  describe('updateById', () => {
    it('should update record successfully', async () => {
      const mockRecord = { id: '1', name: 'updated', updated_at: new Date() };
      mockClient.query.mockResolvedValue({
        rows: [mockRecord],
        rowCount: 1
      });

      const result = await repository.testUpdateById('1', { name: 'updated' });

      expect(mockClient.query).toHaveBeenCalledWith(
        'UPDATE test_table SET name = $2, updated_at = NOW() WHERE id = $1 RETURNING *',
        ['1', 'updated']
      );
      expect(result).toEqual(mockRecord);
    });

    it('should return null when record not found', async () => {
      mockClient.query.mockResolvedValue({
        rows: [],
        rowCount: 0
      });

      const result = await repository.testUpdateById('1', { name: 'updated' });

      expect(result).toBeNull();
    });

    it('should throw error when no data provided', async () => {
      await expect(repository.testUpdateById('1', {})).rejects.toThrow(
        'No data provided for update'
      );
    });
  });

  describe('deleteById', () => {
    it('should delete record successfully', async () => {
      mockClient.query.mockResolvedValue({
        rows: [],
        rowCount: 1
      });

      const result = await repository.testDeleteById('1');

      expect(mockClient.query).toHaveBeenCalledWith('DELETE FROM test_table WHERE id = $1', ['1']);
      expect(result).toBe(true);
    });

    it('should return false when record not found', async () => {
      mockClient.query.mockResolvedValue({
        rows: [],
        rowCount: 0
      });

      const result = await repository.testDeleteById('1');

      expect(result).toBe(false);
    });
  });

  describe('count', () => {
    it('should count records with criteria', async () => {
      mockClient.query.mockResolvedValue({
        rows: [{ count: '5' }],
        rowCount: 1
      });

      const result = await repository.testCount({ active: true });

      expect(mockClient.query).toHaveBeenCalledWith(
        'SELECT COUNT(*) as count FROM test_table WHERE active = $1',
        [true]
      );
      expect(result).toBe(5);
    });

    it('should count all records when no criteria provided', async () => {
      mockClient.query.mockResolvedValue({
        rows: [{ count: '10' }],
        rowCount: 1
      });

      const result = await repository.testCount();

      expect(mockClient.query).toHaveBeenCalledWith(
        'SELECT COUNT(*) as count FROM test_table',
        []
      );
      expect(result).toBe(10);
    });
  });

  describe('exists', () => {
    it('should return true when record exists', async () => {
      mockClient.query.mockResolvedValue({
        rows: [{ count: '1' }],
        rowCount: 1
      });

      const result = await repository.testExists({ id: '1' });

      expect(result).toBe(true);
    });

    it('should return false when record does not exist', async () => {
      mockClient.query.mockResolvedValue({
        rows: [{ count: '0' }],
        rowCount: 1
      });

      const result = await repository.testExists({ id: '1' });

      expect(result).toBe(false);
    });
  });

  describe('upsert', () => {
    it('should upsert record successfully', async () => {
      const mockRecord = { id: '1', name: 'test', email: 'test@example.com' };
      mockClient.query.mockResolvedValue({
        rows: [mockRecord],
        rowCount: 1
      });

      const result = await repository.testUpsert(
        { id: '1', name: 'test', email: 'test@example.com' },
        ['id']
      );

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO test_table'),
        ['1', 'test', 'test@example.com']
      );
      expect(result).toEqual(mockRecord);
    });

    it('should throw error when upsert fails', async () => {
      mockClient.query.mockResolvedValue({
        rows: [],
        rowCount: 0
      });

      await expect(repository.testUpsert({ name: 'test' }, ['id'])).rejects.toThrow(
        'Failed to upsert record into test_table'
      );
    });
  });

  describe('healthCheck', () => {
    it('should return healthy status', async () => {
      mockClient.query.mockResolvedValue({ rows: [], rowCount: 0 });

      const result = await repository.healthCheck();

      expect(mockClient.query).toHaveBeenCalledWith('SELECT 1');
      expect(result.status).toBe('healthy');
      expect(result.latency).toBeGreaterThanOrEqual(0);
    });

    it('should return unhealthy status on error', async () => {
      mockClient.query.mockRejectedValue(new Error('Connection failed'));

      const result = await repository.healthCheck();

      expect(result.status).toBe('unhealthy');
      expect(result.latency).toBeUndefined();
    });
  });

  describe('close', () => {
    it('should close connection pool', async () => {
      await repository.close();

      expect(mockPool.end).toHaveBeenCalled();
    });

    it('should handle close errors gracefully', async () => {
      mockPool.end.mockRejectedValue(new Error('Close error'));

      await expect(repository.close()).resolves.not.toThrow();
    });
  });
});