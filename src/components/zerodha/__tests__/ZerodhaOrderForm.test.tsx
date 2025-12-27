/**
 * ZerodhaOrderForm Component Tests
 * Tests for order placement form functionality
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ZerodhaOrderForm } from '../ZerodhaOrderForm';

// Mock fetch
global.fetch = vi.fn();

// Mock localStorage
const mockLocalStorage = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
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

describe('ZerodhaOrderForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLocalStorage.getItem.mockReturnValue('mock-token');
  });

  it('should render order form with default values', () => {
    render(<ZerodhaOrderForm />);
    
    expect(screen.getByText('Place Order')).toBeInTheDocument();
    expect(screen.getByLabelText('Symbol')).toBeInTheDocument();
    expect(screen.getByLabelText('Exchange')).toBeInTheDocument();
    expect(screen.getByLabelText('Transaction Type')).toBeInTheDocument();
    expect(screen.getByLabelText('Quantity')).toBeInTheDocument();
  });

  it('should populate form with provided props', () => {
    render(
      <ZerodhaOrderForm 
        symbol="RELIANCE"
        exchange="NSE"
        defaultTransactionType="SELL"
        currentPrice={2500}
      />
    );
    
    const symbolInput = screen.getByDisplayValue('RELIANCE');
    expect(symbolInput).toBeInTheDocument();
    
    const exchangeSelect = screen.getByDisplayValue('NSE');
    expect(exchangeSelect).toBeInTheDocument();
  });

  it('should show price field when LIMIT order type is selected', async () => {
    const user = userEvent.setup();
    render(<ZerodhaOrderForm />);
    
    const orderTypeSelect = screen.getByLabelText('Order Type');
    await user.click(orderTypeSelect);
    
    const limitOption = screen.getByText('LIMIT');
    await user.click(limitOption);
    
    expect(screen.getByLabelText('Price (₹)')).toBeInTheDocument();
  });

  it('should show trigger price field when SL order type is selected', async () => {
    const user = userEvent.setup();
    render(<ZerodhaOrderForm />);
    
    const orderTypeSelect = screen.getByLabelText('Order Type');
    await user.click(orderTypeSelect);
    
    const slOption = screen.getByText('SL (Stop Loss)');
    await user.click(slOption);
    
    expect(screen.getByLabelText('Trigger Price (₹)')).toBeInTheDocument();
  });

  it('should calculate order estimate correctly', async () => {
    const user = userEvent.setup();
    render(<ZerodhaOrderForm currentPrice={1000} />);
    
    // Set quantity
    const quantityInput = screen.getByLabelText('Quantity');
    await user.clear(quantityInput);
    await user.type(quantityInput, '10');
    
    // Should show order estimate
    await waitFor(() => {
      expect(screen.getByText('Order Estimate')).toBeInTheDocument();
      expect(screen.getByText('₹10000.00')).toBeInTheDocument(); // Order value
    });
  });

  it('should submit order successfully', async () => {
    const mockOnOrderPlaced = vi.fn();
    const user = userEvent.setup();
    
    // Mock successful API response
    (fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        data: { order_id: 'ORDER123' }
      }),
    });
    
    render(<ZerodhaOrderForm onOrderPlaced={mockOnOrderPlaced} />);
    
    // Fill form
    const symbolInput = screen.getByLabelText('Symbol');
    await user.type(symbolInput, 'RELIANCE');
    
    const quantityInput = screen.getByLabelText('Quantity');
    await user.clear(quantityInput);
    await user.type(quantityInput, '1');
    
    // Submit form
    const submitButton = screen.getByText('Place BUY Order');
    await user.click(submitButton);
    
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
          transaction_type: 'BUY',
          quantity: 1,
          product: 'CNC',
          order_type: 'MARKET',
          validity: 'DAY',
        }),
      });
      
      expect(mockOnOrderPlaced).toHaveBeenCalledWith('ORDER123');
    });
  });

  it('should handle order submission error', async () => {
    const mockOnOrderError = vi.fn();
    const user = userEvent.setup();
    
    // Mock API error response
    (fetch as any).mockResolvedValueOnce({
      ok: false,
      json: async () => ({
        success: false,
        error: { message: 'Insufficient funds' }
      }),
    });
    
    render(<ZerodhaOrderForm onOrderError={mockOnOrderError} />);
    
    // Fill and submit form
    const symbolInput = screen.getByLabelText('Symbol');
    await user.type(symbolInput, 'RELIANCE');
    
    const submitButton = screen.getByText('Place BUY Order');
    await user.click(submitButton);
    
    await waitFor(() => {
      expect(mockOnOrderError).toHaveBeenCalledWith('Failed to place order');
    });
  });

  it('should validate required fields', async () => {
    const user = userEvent.setup();
    render(<ZerodhaOrderForm />);
    
    // Try to submit without filling required fields
    const submitButton = screen.getByText('Place BUY Order');
    await user.click(submitButton);
    
    // Should show validation errors
    expect(screen.getByText('Trading symbol is required')).toBeInTheDocument();
  });

  it('should show MIS warning for intraday orders', async () => {
    const user = userEvent.setup();
    render(<ZerodhaOrderForm />);
    
    const productSelect = screen.getByLabelText('Product');
    await user.click(productSelect);
    
    const misOption = screen.getByText('MIS (Intraday)');
    await user.click(misOption);
    
    expect(screen.getByText('MIS orders will be auto-squared off before market close if not manually closed.')).toBeInTheDocument();
  });

  it('should convert symbol to uppercase', async () => {
    const user = userEvent.setup();
    render(<ZerodhaOrderForm />);
    
    const symbolInput = screen.getByLabelText('Symbol');
    await user.type(symbolInput, 'reliance');
    
    expect(symbolInput).toHaveValue('RELIANCE');
  });

  it('should disable submit button while submitting', async () => {
    const user = userEvent.setup();
    
    // Mock slow API response
    (fetch as any).mockImplementation(() => new Promise(resolve => setTimeout(resolve, 1000)));
    
    render(<ZerodhaOrderForm />);
    
    const symbolInput = screen.getByLabelText('Symbol');
    await user.type(symbolInput, 'RELIANCE');
    
    const submitButton = screen.getByText('Place BUY Order');
    await user.click(submitButton);
    
    // Button should be disabled and show loading state
    expect(screen.getByText('Placing Order...')).toBeInTheDocument();
    expect(submitButton).toBeDisabled();
  });
});