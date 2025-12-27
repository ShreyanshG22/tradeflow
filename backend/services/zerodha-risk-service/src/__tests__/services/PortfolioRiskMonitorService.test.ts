import { PortfolioRiskMonitorService } from '../../services/PortfolioRiskMonitorService';
import { RiskLimitConfigService } from '../../services/RiskLimitConfigService';
import { mockDb, createMockRiskLimits } from '../setup';

describe('PortfolioRiskMonitorService', () => {
  let service: PortfolioRiskMonitorService;
  let mockRiskLimitService: jest.Mocked<RiskLimitConfigService>;

  beforeEach(() => {
    mockRiskLimitService = {
      getEffectiveRiskLimits: jest.fn()
    } as any;
    
    service = new PortfolioRiskMonitorService(mockDb, mockRiskLimitService);
  });

  describe('monitorPortfolioRisks', () => {
    beforeEach(() => {
      // Mock portfolio data
      mockDb.query = jest.fn()
        .mockResolvedValueOnce({ // Positions query
          rows: [
            {
              tradingsymbol: 'RELIANCE',
              exchange: 'NSE',
              quantity: 100,
              average_price: 2400,
              last_price: 2500,
              pnl: 10000,
              unrealised: 10000,
              realised: 0
            }
          ]
        });
    });

    it('should pass all checks for healthy portfolio', async () => {
      const userId = 'test-user-123';
      const riskLimits = createMockRiskLimits();
      
      mockRiskLimitService.getEffectiveRiskLimits.mockResolvedValue(riskLimits);

      const results = await service.monitorPortfolioRisks(userId);

      const failedChecks = results.filter(r => !r.allowed);
      expect(failedChecks).toHaveLength(0);
    });

    it('should detect daily loss limit breach', async () => {
      const userId = 'test-user-123';
      const riskLimits = createMockRiskLimits({ max_daily_loss: 5000 });
      
      // Mock portfolio with loss
      mockDb.query = jest.fn()
        .mockResolvedValueOnce({
          rows: [
            {
              tradingsymbol: 'RELIANCE',
              exchange: 'NSE',
              quantity: 100,
              average_price: 2500,
              last_price: 2400,
              pnl: -10000,
              unrealised: -10000,
              realised: 0
            }
          ]
        });
      
      mockRiskLimitService.getEffectiveRiskLimits.mockResolvedValue(riskLimits);

      const results = await service.monitorPortfolioRisks(userId);

      const dailyLossCheck = results.find(r => r.breach_type === 'DAILY_LOSS');
      expect(dailyLossCheck?.allowed).toBe(false);
      expect(dailyLossCheck?.message).toContain('Daily loss');
      expect(dailyLossCheck?.message).toContain('exceeds limit');
    });

    it('should detect portfolio exposure limit breach', async () => {
      const userId = 'test-user-123';
      const riskLimits = createMockRiskLimits({ max_portfolio_exposure: 100000 });
      
      // Mock high exposure portfolio
      mockDb.query = jest.fn()
        .mockResolvedValueOnce({
          rows: [
            {
              tradingsymbol: 'RELIANCE',
              exchange: 'NSE',
              quantity: 1000,
              average_price: 2500,
              last_price: 2500,
              pnl: 0,
              unrealised: 0,
              realised: 0
            }
          ]
        });
      
      mockRiskLimitService.getEffectiveRiskLimits.mockResolvedValue(riskLimits);

      const results = await service.monitorPortfolioRisks(userId);

      const exposureCheck = results.find(r => r.breach_type === 'EXPOSURE');
      expect(exposureCheck?.allowed).toBe(false);
      expect(exposureCheck?.message).toContain('Portfolio exposure');
      expect(exposureCheck?.message).toContain('exceeds limit');
    });

    it('should detect sector exposure limit breach', async () => {
      const userId = 'test-user-123';
      const riskLimits = createMockRiskLimits({ max_sector_exposure: 100000 });
      
      // Mock high sector exposure
      mockDb.query = jest.fn()
        .mockResolvedValueOnce({
          rows: [
            {
              tradingsymbol: 'RELIANCE',
              exchange: 'NSE',
              quantity: 1000,
              average_price: 2500,
              last_price: 2500,
              pnl: 0,
              unrealised: 0,
              realised: 0
            }
          ]
        });
      
      mockRiskLimitService.getEffectiveRiskLimits.mockResolvedValue(riskLimits);

      const results = await service.monitorPortfolioRisks(userId);

      const sectorCheck = results.find(r => r.breach_type === 'SECTOR_EXPOSURE');
      expect(sectorCheck?.allowed).toBe(false);
      expect(sectorCheck?.message).toContain('sector exposure');
      expect(sectorCheck?.message).toContain('exceeds limit');
    });

    it('should detect margin limit breach', async () => {
      const userId = 'test-user-123';
      const riskLimits = createMockRiskLimits({ min_margin_balance: 200000 });
      
      mockRiskLimitService.getEffectiveRiskLimits.mockResolvedValue(riskLimits);

      const results = await service.monitorPortfolioRisks(userId);

      const marginCheck = results.find(r => r.breach_type === 'MARGIN');
      expect(marginCheck?.allowed).toBe(false);
      expect(marginCheck?.message).toContain('Available margin');
      expect(marginCheck?.message).toContain('below minimum required');
    });

    it('should provide warnings when approaching limits', async () => {
      const userId = 'test-user-123';
      const riskLimits = createMockRiskLimits({ 
        max_daily_loss: 50000,
        loss_alert_threshold: 0.8 
      });
      
      // Mock portfolio approaching loss limit (85% of limit)
      mockDb.query = jest.fn()
        .mockResolvedValueOnce({
          rows: [
            {
              tradingsymbol: 'RELIANCE',
              exchange: 'NSE',
              quantity: 100,
              average_price: 2500,
              last_price: 2075, // Loss of 42,500 (85% of 50k limit)
              pnl: -42500,
              unrealised: -42500,
              realised: 0
            }
          ]
        });
      
      mockRiskLimitService.getEffectiveRiskLimits.mockResolvedValue(riskLimits);

      const results = await service.monitorPortfolioRisks(userId);

      const dailyLossCheck = results.find(r => r.message === 'Daily loss check passed');
      expect(dailyLossCheck?.allowed).toBe(true);
      expect(dailyLossCheck?.warnings.length).toBeGreaterThan(0);
    });
  });

  describe('updateDailyRiskMetrics', () => {
    it('should update daily risk metrics successfully', async () => {
      const userId = 'test-user-123';
      
      // Mock database queries
      mockDb.query = jest.fn()
        .mockResolvedValueOnce({ // Positions query
          rows: [
            {
              tradingsymbol: 'RELIANCE',
              exchange: 'NSE',
              quantity: 100,
              average_price: 2400,
              last_price: 2500,
              pnl: 10000,
              unrealised: 10000,
              realised: 0
            }
          ]
        })
        .mockResolvedValueOnce({ // Orders query
          rows: [{ total_orders: '5', total_order_value: '500000' }]
        })
        .mockResolvedValueOnce({ // Risk events query
          rows: [{ risk_breaches: '0' }]
        })
        .mockResolvedValueOnce({ // Upsert query
          rows: [{}]
        });

      await service.updateDailyRiskMetrics(userId);

      expect(mockDb.query).toHaveBeenCalledTimes(4);
      
      // Check that upsert query was called with correct parameters
      const upsertCall = (mockDb.query as jest.Mock).mock.calls[3];
      expect(upsertCall[0]).toContain('INSERT INTO daily_risk_metrics');
    });
  });
});