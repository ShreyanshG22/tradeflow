import { UserService } from '../services/user';
import { DatabaseService } from '../services/database';
import bcrypt from 'bcrypt';

// Mock the database service
jest.mock('../services/database');
jest.mock('bcrypt');

const mockDatabaseService = DatabaseService as jest.Mocked<typeof DatabaseService>;
const mockBcrypt = bcrypt as jest.Mocked<typeof bcrypt>;

describe('UserService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getUserProfile', () => {
    it('should return user profile when user exists', async () => {
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        first_name: 'John',
        last_name: 'Doe',
        phone: '+1234567890',
        timezone: 'UTC',
        is_active: true,
        is_verified: true,
        last_login_at: new Date(),
        created_at: new Date(),
        updated_at: new Date()
      };

      mockDatabaseService.query.mockResolvedValueOnce({
        rows: [mockUser],
        rowCount: 1
      });

      const result = await UserService.getUserProfile('user-123');

      expect(result).toEqual({
        id: 'user-123',
        email: 'test@example.com',
        firstName: 'John',
        lastName: 'Doe',
        phone: '+1234567890',
        timezone: 'UTC',
        isActive: true,
        isVerified: true,
        lastLoginAt: mockUser.last_login_at,
        createdAt: mockUser.created_at,
        updatedAt: mockUser.updated_at
      });
    });

    it('should return null when user does not exist', async () => {
      mockDatabaseService.query.mockResolvedValueOnce({
        rows: [],
        rowCount: 0
      });

      const result = await UserService.getUserProfile('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('updateUserProfile', () => {
    it('should update user profile successfully', async () => {
      const mockUpdatedUser = {
        id: 'user-123',
        email: 'test@example.com',
        first_name: 'Jane',
        last_name: 'Smith',
        phone: '+1234567890',
        timezone: 'EST',
        is_active: true,
        is_verified: true,
        last_login_at: new Date(),
        created_at: new Date(),
        updated_at: new Date()
      };

      mockDatabaseService.query.mockResolvedValueOnce({
        rows: [mockUpdatedUser],
        rowCount: 1
      });

      const updates = {
        firstName: 'Jane',
        lastName: 'Smith',
        timezone: 'EST'
      };

      const result = await UserService.updateUserProfile('user-123', updates);

      expect(result.firstName).toBe('Jane');
      expect(result.lastName).toBe('Smith');
      expect(result.timezone).toBe('EST');
    });

    it('should throw error when no fields to update', async () => {
      await expect(UserService.updateUserProfile('user-123', {}))
        .rejects.toThrow('No valid fields to update');
    });

    it('should throw error when user not found', async () => {
      mockDatabaseService.query.mockResolvedValueOnce({
        rows: [],
        rowCount: 0
      });

      const updates = { firstName: 'Jane' };

      await expect(UserService.updateUserProfile('user-123', updates))
        .rejects.toThrow('User not found');
    });
  });

  describe('changePassword', () => {
    it('should change password successfully', async () => {
      mockDatabaseService.query
        .mockResolvedValueOnce({
          rows: [{ password_hash: 'old-hash' }],
          rowCount: 1
        })
        .mockResolvedValueOnce({
          rows: [],
          rowCount: 1
        })
        .mockResolvedValueOnce({
          rows: [],
          rowCount: 1
        });

      mockBcrypt.compare.mockResolvedValueOnce(true);
      mockBcrypt.hash.mockResolvedValueOnce('new-hash');

      const passwordData = {
        currentPassword: 'oldPassword',
        newPassword: 'newPassword'
      };

      await UserService.changePassword('user-123', passwordData);

      expect(mockBcrypt.compare).toHaveBeenCalledWith('oldPassword', 'old-hash');
      expect(mockBcrypt.hash).toHaveBeenCalledWith('newPassword', expect.any(Number));
    });

    it('should throw error when current password is incorrect', async () => {
      mockDatabaseService.query.mockResolvedValueOnce({
        rows: [{ password_hash: 'old-hash' }],
        rowCount: 1
      });

      mockBcrypt.compare.mockResolvedValueOnce(false);

      const passwordData = {
        currentPassword: 'wrongPassword',
        newPassword: 'newPassword'
      };

      await expect(UserService.changePassword('user-123', passwordData))
        .rejects.toThrow('Current password is incorrect');
    });

    it('should throw error when user not found', async () => {
      mockDatabaseService.query.mockResolvedValueOnce({
        rows: [],
        rowCount: 0
      });

      const passwordData = {
        currentPassword: 'oldPassword',
        newPassword: 'newPassword'
      };

      await expect(UserService.changePassword('user-123', passwordData))
        .rejects.toThrow('User not found');
    });
  });

  describe('getUserSetting', () => {
    it('should return user setting when it exists', async () => {
      const mockSetting = {
        id: 'setting-123',
        user_id: 'user-123',
        setting_key: 'theme',
        setting_value: 'dark',
        created_at: new Date(),
        updated_at: new Date()
      };

      mockDatabaseService.query.mockResolvedValueOnce({
        rows: [mockSetting],
        rowCount: 1
      });

      const result = await UserService.getUserSetting('user-123', 'theme');

      expect(result).toEqual({
        id: 'setting-123',
        userId: 'user-123',
        settingKey: 'theme',
        settingValue: 'dark',
        createdAt: mockSetting.created_at,
        updatedAt: mockSetting.updated_at
      });
    });

    it('should return null when setting does not exist', async () => {
      mockDatabaseService.query.mockResolvedValueOnce({
        rows: [],
        rowCount: 0
      });

      const result = await UserService.getUserSetting('user-123', 'nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('setUserSetting', () => {
    it('should create or update user setting', async () => {
      const mockSetting = {
        id: 'setting-123',
        user_id: 'user-123',
        setting_key: 'theme',
        setting_value: '"dark"',
        created_at: new Date(),
        updated_at: new Date()
      };

      mockDatabaseService.query.mockResolvedValueOnce({
        rows: [mockSetting],
        rowCount: 1
      });

      const result = await UserService.setUserSetting('user-123', 'theme', 'dark');

      expect(result.settingKey).toBe('theme');
      expect(result.settingValue).toBe('"dark"');
    });
  });

  describe('deleteUserSetting', () => {
    it('should delete user setting successfully', async () => {
      mockDatabaseService.query.mockResolvedValueOnce({
        rows: [],
        rowCount: 1
      });

      const result = await UserService.deleteUserSetting('user-123', 'theme');
      expect(result).toBe(true);
    });

    it('should return false when setting does not exist', async () => {
      mockDatabaseService.query.mockResolvedValueOnce({
        rows: [],
        rowCount: 0
      });

      const result = await UserService.deleteUserSetting('user-123', 'nonexistent');
      expect(result).toBe(false);
    });
  });

  describe('deactivateUser', () => {
    it('should deactivate user successfully', async () => {
      mockDatabaseService.query
        .mockResolvedValueOnce({
          rows: [],
          rowCount: 1
        })
        .mockResolvedValueOnce({
          rows: [],
          rowCount: 1
        });

      await UserService.deactivateUser('user-123');

      expect(mockDatabaseService.query).toHaveBeenCalledTimes(2);
    });
  });

  describe('getUserStats', () => {
    it('should return user statistics', async () => {
      const mockResults = [
        { rows: [{ count: '5' }] },
        { rows: [{ count: '3' }] },
        { rows: [{ count: '2' }] },
        { rows: [{ count: '10' }] },
        { rows: [{ count: '1' }] }
      ];

      mockDatabaseService.query
        .mockResolvedValueOnce(mockResults[0])
        .mockResolvedValueOnce(mockResults[1])
        .mockResolvedValueOnce(mockResults[2])
        .mockResolvedValueOnce(mockResults[3])
        .mockResolvedValueOnce(mockResults[4]);

      const result = await UserService.getUserStats('user-123');

      expect(result).toEqual({
        totalStrategies: 5,
        activeStrategies: 3,
        totalPortfolios: 2,
        totalBacktests: 10,
        activeSessions: 1
      });
    });
  });
});