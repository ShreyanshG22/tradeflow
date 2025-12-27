import { RiskLimitConfigService } from '../../services/RiskLimitConfigService';
import { mockDb, createMockUser, createMockRiskLimits } from '../setup';

describe('RiskLimitConfigService', () => {
  let service: RiskLimitConfigService;

  beforeEach(() => {
    service = new RiskLimitConfigService(mockDb);
  });

  describe('validateRiskLimits', () => {
    it('should validate correct risk limits', () => {
      const limits = createMockRiskLimits();
      const result = service.validateRiskLimits(limits);

      expect(result.is_valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject negative order values', () => {
      const limits = createMockRiskLimits({ max_order_value: -1000 });
      const result = service.validateRiskLimits(limits);

      expect(result.is_valid).toBe(false);
      expect(result.errors).toContain('Maximum order value must be greater than 0');
    });

    it('should reject invalid margin multiplier', () => {
      const limits = createMockRiskLimits({ margin_multiplier: 0.5 });
      const result = service.validateRiskLimits(limits);

      expect(result.is_valid).toBe(false);
      expect(result.errors).toContain('Margin multiplier must be between 1.0 and 3.0');
    });

    it('should reject invalid trading hours', () => {
      const limits = createMockRiskLimits({ 
        trading_hours_start: '15:30',
        trading_hours_end: '09:15'
      });
      const result = service.validateRiskLimits(limits);

      expect(result.is_valid).toBe(false);
      expect(result.errors).toContain('Trading start time must be before end time');
    });

    it('should reject empty allowed products', () => {
      const limits = createMockRiskLimits({ allowed_products: [] });
      const result = service.validateRiskLimits(limits);

      expect(result.is_valid).toBe(false);
      expect(result.errors).toContain('At least one product must be allowed');
    });

    it('should warn about high order values', () => {
      const limits = createMockRiskLimits({ max_order_value: 15000000 });
      const result = service.validateRiskLimits(limits);

      expect(result.is_valid).toBe(true);
      expect(result.warnings).toContain('Maximum order value is very high (>₹1 crore)');
    });
  });

  describe('getUserRiskLimits', () => {
    it('should return user risk limits when they exist', async () => {
      const mockUser = createMockUser();
      const mockLimits = createMockRiskLimits();
      
      mockDb.query = jest.fn().mockResolvedValue({
        rows: [{
          user_id: mockUser.user_id,
          is_active: true,
          created_at: new Date(),
          updated_at: new Date(),
          ...mockLimits,
          allowed_products: JSON.stringify(mockLimits.allowed_products),
          allowed_exchanges: JSON.stringify(mockLimits.allowed_exchanges),
          blocked_instruments: JSON.stringify(mockLimits.blocked_instruments)
        }]
      });

      const result = await service.getUserRiskLimits(mockUser.user_id);

      expect(result).toBeTruthy();
      expect(result?.user_id).toBe(mockUser.user_id);
      expect(result?.max_order_value).toBe(mockLimits.max_order_value);
    });

    it('should return null when user has no risk limits', async () => {
      mockDb.query = jest.fn().mockResolvedValue({ rows: [] });

      const result = await service.getUserRiskLimits('non-existent-user');

      expect(result).toBeNull();
    });
  });

  describe('setUserRiskLimits', () => {
    it('should set valid risk limits for user', async () => {
      const mockUser = createMockUser();
      const mockLimits = createMockRiskLimits();
      
      mockDb.query = jest.fn()
        .mockResolvedValueOnce({ rows: [] }) // getUserRiskLimits returns null
        .mockResolvedValueOnce({ // setUserRiskLimits insert
          rows: [{
            user_id: mockUser.user_id,
            is_active: true,
            created_at: new Date(),
            updated_at: new Date(),
            ...mockLimits,
            allowed_products: JSON.stringify(mockLimits.allowed_products),
            allowed_exchanges: JSON.stringify(mockLimits.allowed_exchanges),
            blocked_instruments: JSON.stringify(mockLimits.blocked_instruments)
          }]
        });

      const result = await service.setUserRiskLimits(mockUser.user_id, mockLimits);

      expect(result.user_id).toBe(mockUser.user_id);
      expect(result.max_order_value).toBe(mockLimits.max_order_value);
    });

    it('should reject invalid risk limits', async () => {
      const mockUser = createMockUser();
      const invalidLimits = createMockRiskLimits({ max_order_value: -1000 });

      await expect(service.setUserRiskLimits(mockUser.user_id, invalidLimits))
        .rejects.toThrow('Invalid risk limits');
    });
  });

  describe('getEffectiveRiskLimits', () => {
    it('should return user limits when they exist', async () => {
      const mockUser = createMockUser();
      const mockLimits = createMockRiskLimits();
      
      mockDb.query = jest.fn().mockResolvedValue({
        rows: [{
          user_id: mockUser.user_id,
          is_active: true,
          created_at: new Date(),
          updated_at: new Date(),
          ...mockLimits,
          allowed_products: JSON.stringify(mockLimits.allowed_products),
          allowed_exchanges: JSON.stringify(mockLimits.allowed_exchanges),
          blocked_instruments: JSON.stringify(mockLimits.blocked_instruments)
        }]
      });

      const result = await service.getEffectiveRiskLimits(mockUser.user_id);

      expect(result.max_order_value).toBe(mockLimits.max_order_value);
    });

    it('should return default limits when user has no custom limits', async () => {
      mockDb.query = jest.fn().mockResolvedValue({ rows: [] });

      const result = await service.getEffectiveRiskLimits('non-existent-user');

      expect(result.max_order_value).toBe(100000); // Default value
    });
  });

  describe('applyRiskLimitPreset', () => {
    it('should apply conservative preset', async () => {
      const mockUser = createMockUser();
      
      mockDb.query = jest.fn()
        .mockResolvedValueOnce({ rows: [] }) // getUserRiskLimits returns null
        .mockResolvedValueOnce({ // setUserRiskLimits insert
          rows: [{
            user_id: mockUser.user_id,
            is_active: true,
            created_at: new Date(),
            updated_at: new Date(),
            max_order_value: 50000, // Conservative preset value
            allowed_products: JSON.stringify(['CNC', 'MIS', 'NRML']),
            allowed_exchanges: JSON.stringify(['NSE', 'BSE']),
            blocked_instruments: JSON.stringify([])
          }]
        });

      const result = await service.applyRiskLimitPreset(mockUser.user_id, 'conservative');

      expect(result.max_order_value).toBe(50000);
    });

    it('should reject invalid preset name', async () => {
      const mockUser = createMockUser();

      await expect(service.applyRiskLimitPreset(mockUser.user_id, 'invalid' as any))
        .rejects.toThrow('Invalid preset name');
    });
  });

  describe('disableUserRiskLimits', () => {
    it('should disable user risk limits', async () => {
      const mockUser = createMockUser();
      mockDb.query = jest.fn().mockResolvedValue({ rows: [] });

      await service.disableUserRiskLimits(mockUser.user_id);

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE user_risk_limits'),
        [mockUser.user_id]
      );
    });
  });
});