import { OrderRiskCheckService } from '../../services/OrderRiskCheckService';
import { RiskLimitConfigService } from '../../services/RiskLimitConfigService';
import { mockDb, createMockRiskLimits, createMockOrderRequest } from '../setup';

describe('OrderRiskCheckService', () => {
  let service: OrderRiskCheckService;
  let mockRiskLimitService: jest.Mocked<RiskLimitConfigService>;

  beforeEach(() => {
    mockRiskLimitService = {
      getEffectiveRiskLimits: jest.fn()
    } as any;
    
    service = new OrderRiskCheckService(mockDb, mockRiskLimitService);
  });

  describe('validateOrder', () => {
    beforeEach(() => {
      // Mock current time to be within trading hours
      jest.spyOn(Date.prototype, 'toTimeString').mockReturnValue('10:30:00 GMT+0530 (IST)');
      
      // Mock database queries
      mockDb.query = jest.fn()
        .mockResolvedValueOnce({ rows: [] }) // Position query
        .mockResolvedValueOnce({ rows: [{ order_count: '0' }] }); // Frequency query
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('should allow valid order within all limits', async () => {
      const orderRequest = createMockOrderRequest();
      const riskLimits = createMockRiskLimits();
      
      mockRiskLimitService.getEffectiveRiskLimits.mockResolvedValue(riskLimits);

      const result = await service.validateOrder(orderRequest);

      expect(result.allowed).toBe(true);
      expect(result.message).toBe('Order passed all risk checks');
    });

    it('should reject order outside trading hours', async () => {
      jest.spyOn(Date.prototype, 'toTimeString').mockReturnValue('08:00:00 GMT+0530 (IST)');
      
      const orderRequest = createMockOrderRequest();
      const riskLimits = createMockRiskLimits();
      
      mockRiskLimitService.getEffectiveRiskLimits.mockResolvedValue(riskLimits);

      const result = await service.validateOrder(orderRequest);

      expect(result.allowed).toBe(false);
      expect(result.message).toContain('Trading not allowed outside market hours');
    });

    it('should reject order with disallowed exchange', async () => {
      const orderRequest = createMockOrderRequest({ exchange: 'MCX' });
      const riskLimits = createMockRiskLimits();
      
      mockRiskLimitService.getEffectiveRiskLimits.mockResolvedValue(riskLimits);

      const result = await service.validateOrder(orderRequest);

      expect(result.allowed).toBe(false);
      expect(result.message).toContain('Exchange MCX is not allowed');
    });

    it('should reject order with disallowed product', async () => {
      const orderRequest = createMockOrderRequest({ product: 'CO' });
      const riskLimits = createMockRiskLimits();
      
      mockRiskLimitService.getEffectiveRiskLimits.mockResolvedValue(riskLimits);

      const result = await service.validateOrder(orderRequest);

      expect(result.allowed).toBe(false);
      expect(result.message).toContain('Product CO is not allowed');
    });

    it('should reject order with blocked instrument', async () => {
      const orderRequest = createMockOrderRequest({ tradingsymbol: 'BLOCKED' });
      const riskLimits = createMockRiskLimits({ blocked_instruments: ['BLOCKED'] });
      
      mockRiskLimitService.getEffectiveRiskLimits.mockResolvedValue(riskLimits);

      const result = await service.validateOrder(orderRequest);

      expect(result.allowed).toBe(false);
      expect(result.message).toContain('Instrument BLOCKED is blocked');
    });

    it('should reject order exceeding value limit', async () => {
      const orderRequest = createMockOrderRequest({ 
        quantity: 1000, 
        price: 2500 // Total: 25,00,000
      });
      const riskLimits = createMockRiskLimits({ max_order_value: 100000 });
      
      mockRiskLimitService.getEffectiveRiskLimits.mockResolvedValue(riskLimits);

      const result = await service.validateOrder(orderRequest);

      expect(result.allowed).toBe(false);
      expect(result.breach_type).toBe('ORDER_VALUE');
      expect(result.message).toContain('Order value');
      expect(result.message).toContain('exceeds maximum limit');
    });

    it('should reject order exceeding position size limit', async () => {
      const orderRequest = createMockOrderRequest({ quantity: 1000 });
      const riskLimits = createMockRiskLimits({ max_position_size: 100000 });
      
      // Mock existing position
      mockDb.query = jest.fn()
        .mockResolvedValueOnce({ 
          rows: [{ 
            quantity: 500, 
            average_price: 2400,
            last_price: 2500 
          }] 
        })
        .mockResolvedValueOnce({ rows: [{ order_count: '0' }] });
      
      mockRiskLimitService.getEffectiveRiskLimits.mockResolvedValue(riskLimits);

      const result = await service.validateOrder(orderRequest);

      expect(result.allowed).toBe(false);
      expect(result.breach_type).toBe('POSITION_SIZE');
    });

    it('should reject order exceeding frequency limit', async () => {
      const orderRequest = createMockOrderRequest();
      const riskLimits = createMockRiskLimits({ max_orders_per_minute: 5 });
      
      // Mock high order frequency
      mockDb.query = jest.fn()
        .mockResolvedValueOnce({ rows: [] }) // Position query
        .mockResolvedValueOnce({ rows: [{ order_count: '6' }] }); // Frequency query
      
      mockRiskLimitService.getEffectiveRiskLimits.mockResolvedValue(riskLimits);

      const result = await service.validateOrder(orderRequest);

      expect(result.allowed).toBe(false);
      expect(result.breach_type).toBe('ORDER_FREQUENCY');
      expect(result.message).toContain('Order frequency limit exceeded');
    });

    it('should provide warnings when approaching limits', async () => {
      const orderRequest = createMockOrderRequest({ 
        quantity: 360, // 90% of 100k limit at price 2500
        price: 2500 
      });
      const riskLimits = createMockRiskLimits({ max_order_value: 1000000 });
      
      mockRiskLimitService.getEffectiveRiskLimits.mockResolvedValue(riskLimits);

      const result = await service.validateOrder(orderRequest);

      expect(result.allowed).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
    });
  });
});