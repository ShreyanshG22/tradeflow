import { it } from 'node:test';
import { describe } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { describe } from 'node:test';
import { beforeEach } from 'node:test';
import { describe } from 'node:test';
import { AuthService } from '../services/auth';
import { DatabaseService } from '../services/database';

// Mock the database service
jest.mock('../services/database');
jest.mock('../services/redis');

const mockDatabaseService = DatabaseService as jest.Mocked<typeof DatabaseService>;

describe('AuthService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('register', () => {
    it('should register a new user successfully', async () => {
      // Mock database responses
      mockDatabaseService.query
        .mockResolvedValueOnce({ rows: [] }) // Check existing user
        .mockResolvedValueOnce({ // Create user
          rows: [{
            id: 'user-123',
            email: 'test@example.com',
            first_name: 'John',
            last_name: 'Doe',
            is_active: true,
            created_at: new Date(),
            updated_at: new Date()
          }]
        })
        .mockResolvedValueOnce({ rows: [{ id: 'session-123' }] }) // Create session
        .mockResolvedValueOnce({ rows: [{ count: '0' }] }); // Session count for cleanup

      const userData = {
        email: 'test@example.com',
        password: 'TestPassword123!',
        firstName: 'John',
        lastName: 'Doe'
      };

      const result = await AuthService.register(userData);

      expect(result.user.email).toBe('test@example.com');
      expect(result.tokens.accessToken).toBeDefined();
      expect(result.tokens.refreshToken).toBeDefined();
    });

    it('should throw error if user already exists', async () => {
      mockDatabaseService.query.mockResolvedValueOnce({
        rows: [{ id: 'existing-user' }]
      });

      const userData = {
        email: 'existing@example.com',
        password: 'TestPassword123!'
      };

      await expect(AuthService.register(userData)).rejects.toThrow('User with this email already exists');
    });
  });

  describe('validateToken', () => {
    it('should validate a valid token', async () => {
      mockDatabaseService.query.mockResolvedValueOnce({
        rows: [{
          id: 'session-123',
          is_revoked: false,
          expires_at: new Date(Date.now() + 3600000) // 1 hour from now
        }]
      });

      // Mock jwt.verify
      const jwt = require('jsonwebtoken');
      jest.spyOn(jwt, 'verify').mockReturnValue({
        userId: 'user-123',
        type: 'access'
      });

      const result = await AuthService.validateToken('valid-token');
      expect(result.userId).toBe('user-123');
    });
  });
});