/**
 * ZerodhaPositions Component Tests
 * Tests for positions display functionality
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ZerodhaPositions } from '../ZerodhaPositions';

// Mock fetch
global.fetch = vi.fn();

// Mock localStorage
const mockLocalStorage = {
  getItem: vi.fn(),
};
Object.defineProperty(window, 'localStorage', {
  value: mockLocalStorage,
});

// Mock toast
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

const mockPositions = [
  {
    tradingsymbol: 'RELIANCE',
    exchange: 'NSE',
    instrument_token: 738561,
    product: 'CNC',
    quantity: 10,
    overnight_quantity: 10,
    multiplier: 1,
    average_price: 2500.00,
    close_price: 2480.00,
    last_price: 2520.00,
    value: 25200.00,
    pnl: 200.00,
    m2m: 200.00,
    unrealised: 200.00,
    realised: 0.00,
    buy_quantity: 10,
    buy_price: 2500.00,
    buy_value: 25000.00,
    buy_m2m: 200.00,
    sell_quantity: 0,
    sell_price: 0.00,
    sell_value: 0.00,
    sell_m2m: 0.00,
    day_buy_quantity: 0,
    day_buy_price: 0.00,
    day_buy_value: 0.00,
    day_sell_quantity: 0,
    day_sell_price: 0.00,
    day_sell_value: 0.00,
  },
  {
    tradingsymbol: 'TCS',
    exchange: 'NSE',
    instrument_token: 2953217,
    product: 'MIS',
    quantity: -5,
    overnight_quantity: 0,
    multiplier: 1,
    average_price: 3200.00,
    close_price: 3180.00,
    last_price: 3190.00,
    value: -15950.00,
    pnl: -50.00,
    m2m: -50.00,
    unrealised: -50.00,
    realised: 0.00,
    buy_quantity: 0,
    buy_price: 0.00,
    buy_value: 0.00,
    buy_m2m: 0.00,
    sell_quantity: 5,
    sell_price: 3200.00,
    sell_value: 16000.00,
    sell_m2m: -50.00,
    day_buy_quantity: 0,
    day_buy_price: 0.00,
    day_buy_value: 0.00,
    day_sell_quantity: 5,
    day_sell_price: 3200.00,
    day_sell_value: 16000.00,
  },
];

describe('ZerodhaPositions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLocalStorage.getItem.mockReturnValue('mock-token');
  });

  it('should display loading state initially', () => {
    // Mock pending API response
    (fetch as any).mockImplementation(() => new Promise(() => {}));
    
    render(<ZerodhaPositions />);
    
    expect(screen.getByText('Positions')).toBeInTheDocument();
    // Should show skeleton loaders
    expect(document.querySelectorAll('[data-testid="skeleton"]')).toHaveLength.greaterThan(0);
  });

  it('should display positions when data is loaded', async () => {
    // Mock successful API response
    (fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        data: mockPositions,
      }),
    });
    
    render(<ZerodhaPositions />);
    
    await waitFor(() => {
      expect(screen.getByText('RELIANCE')).toBeInTheDocument();
      expect(screen.getByText('TCS')).toBeInTheDocument();
    });
  });

  it('should display correct position types (LONG/SHORT)', async () => {
    (fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        data: mockPositions,
      }),
    });
    
    render(<ZerodhaPositions />);
    
    await waitFor(() => {
      expect(screen.getByText('LONG')).toBeInTheDocument(); // RELIANCE position
      expect(screen.getByText('SHORT')).toBeInTheDocument(); // TCS position
    });
  });

  it('should display P&L with correct colors', async () => {
    (fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        data: mockPositions,
      }),
    });
    
    render(<ZerodhaPositions />);
    
    await waitFor(() => {
      // Positive P&L should be green
      const positivePnL = screen.getByText('+₹200.00');
      expect(positivePnL).toHaveClass('text-green-600');
      
      // Negative P&L should be red
      const negativePnL = screen.getByText('-₹50.00');
      expect(negativePnL).toHaveClass('text-red-600');
    });
  });

  it('should calculate and display summary statistics', async () => {
    (fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        data: mockPositions,
      }),
    });
    
    render(<ZerodhaPositions />);
    
    await waitFor(() => {
      expect(screen.getByText('2')).toBeInTheDocument(); // Total positions
      expect(screen.getByText('1')).toBeInTheDocument(); // Long positions
      expect(screen.getByText('1')).toBeInTheDocument(); // Short positions
      expect(screen.getByText('+₹150.00')).toBeInTheDocument(); // Total P&L (200 - 50)
    });
  });

  it('should handle square off action', async () => {
    const mockOnSquareOff = vi.fn();
    const user = userEvent.setup();
    
    // Mock positions API response
    (fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        data: mockPositions,
      }),
    });
    
    // Mock square off API response
    (fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        data: { order_id: 'ORDER123' },
      }),
    });
    
    render(<ZerodhaPositions onSquareOff={mockOnSquareOff} />);
    
    await waitFor(() => {
      expect(screen.getByText('RELIANCE')).toBeInTheDocument();
    });
    
    // Click on actions menu for RELIANCE position
    const actionButtons = screen.getAllByRole('button');
    const moreButton = actionButtons.find(button => 
      button.querySelector('svg')?.getAttribute('data-testid') === 'more-horizontal'
    );
    
    if (moreButton) {
      await user.click(moreButton);
      
      const squareOffButton = screen.getByText('Square Off');
      await user.click(squareOffButton);
      
      await waitFor(() => {
        expect(fetch).toHaveBeenCalledWith('/api/zerodha/orders', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer mock-token',
          },
          body: JSON.stringify({
            exchange: 'NSE',
            tradingsymbol: 'RELIANCE',
            transaction_type: 'SELL', // Opposite of long position
            quantity: 10,
            product: 'CNC',
            order_type: 'MARKET',
            validity: 'DAY',
          }),
        });
        
        expect(mockOnSquareOff).toHaveBeenCalledWith(mockPositions[0]);
      });
    }
  });

  it('should show MIS warning when intraday positions exist', async () => {
    (fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        data: mockPositions,
      }),
    });
    
    render(<ZerodhaPositions />);
    
    await waitFor(() => {
      expect(screen.getByText('Intraday Positions Alert')).toBeInTheDocument();
      expect(screen.getByText(/MIS positions will be auto-squared off/)).toBeInTheDocument();
    });
  });

  it('should handle API error gracefully', async () => {
    // Mock API error
    (fetch as any).mockRejectedValueOnce(new Error('Network error'));
    
    render(<ZerodhaPositions />);
    
    await waitFor(() => {
      expect(screen.getByText('Failed to fetch positions')).toBeInTheDocument();
      expect(screen.getByText('Retry')).toBeInTheDocument();
    });
  });

  it('should show empty state when no positions exist', async () => {
    (fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        data: [],
      }),
    });
    
    render(<ZerodhaPositions />);
    
    await waitFor(() => {
      expect(screen.getByText('No open positions')).toBeInTheDocument();
    });
  });

  it('should refresh positions when refresh button is clicked', async () => {
    const user = userEvent.setup();
    
    (fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: mockPositions,
      }),
    });
    
    render(<ZerodhaPositions />);
    
    await waitFor(() => {
      expect(screen.getByText('RELIANCE')).toBeInTheDocument();
    });
    
    const refreshButton = screen.getByRole('button', { name: /refresh/i });
    await user.click(refreshButton);
    
    // Should make another API call
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('should filter out zero quantity positions', async () => {
    const positionsWithZero = [
      ...mockPositions,
      {
        ...mockPositions[0],
        tradingsymbol: 'ZERO_QTY',
        quantity: 0,
      },
    ];
    
    (fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        data: positionsWithZero,
      }),
    });
    
    render(<ZerodhaPositions />);
    
    await waitFor(() => {
      expect(screen.getByText('RELIANCE')).toBeInTheDocument();
      expect(screen.getByText('TCS')).toBeInTheDocument();
      expect(screen.queryByText('ZERO_QTY')).not.toBeInTheDocument();
    });
  });
});