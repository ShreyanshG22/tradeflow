/**
 * ZerodhaAuthStatus Component Tests
 * Tests for authentication status display functionality
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ZerodhaAuthStatus } from '../ZerodhaAuthStatus';
import { ZerodhaAuthProvider } from '../../../hooks/useZerodhaAuth';

// Mock the useZerodhaAuth hook
const mockUseZerodhaAuth = vi.fn();
vi.mock('../../../hooks/useZerodhaAuth', () => ({
  useZerodhaAuth: () => mockUseZerodhaAuth(),
  ZerodhaAuthProvider: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

describe('ZerodhaAuthStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should display loading state when checking authentication', () => {
    mockUseZerodhaAuth.mockReturnValue({
      isZerodhaAuthenticated: false,
      zerodhaProfile: null,
      isLoading: true,
      logoutZerodha: vi.fn(),
    });

    render(<ZerodhaAuthStatus />);
    
    expect(screen.getByText('Checking Zerodha status...')).toBeInTheDocument();
  });

  it('should display not connected state when user is not authenticated', () => {
    mockUseZerodhaAuth.mockReturnValue({
      isZerodhaAuthenticated: false,
      zerodhaProfile: null,
      isLoading: false,
      logoutZerodha: vi.fn(),
    });

    render(<ZerodhaAuthStatus />);
    
    expect(screen.getByText('Not Connected')).toBeInTheDocument();
    expect(screen.getByText('Connect your Zerodha account to start trading')).toBeInTheDocument();
  });

  it('should display connected state when user is authenticated', () => {
    const mockProfile = {
      user_id: 'TEST123',
      user_name: 'Test User',
      user_shortname: 'Test',
      email: 'test@example.com',
      phone: '+91-9876543210',
      broker: 'ZERODHA',
      exchanges: ['NSE', 'BSE'],
      products: ['CNC', 'MIS'],
      order_types: ['MARKET', 'LIMIT'],
    };

    mockUseZerodhaAuth.mockReturnValue({
      isZerodhaAuthenticated: true,
      zerodhaProfile: mockProfile,
      isLoading: false,
      logoutZerodha: vi.fn(),
    });

    render(<ZerodhaAuthStatus />);
    
    expect(screen.getByText('Connected')).toBeInTheDocument();
    expect(screen.getByText('Test User')).toBeInTheDocument();
    expect(screen.getByText('test@example.com')).toBeInTheDocument();
  });

  it('should display compact view when compact prop is true', () => {
    const mockProfile = {
      user_id: 'TEST123',
      user_name: 'Test User',
      user_shortname: 'Test',
      email: 'test@example.com',
      phone: '+91-9876543210',
      broker: 'ZERODHA',
      exchanges: ['NSE', 'BSE'],
      products: ['CNC', 'MIS'],
      order_types: ['MARKET', 'LIMIT'],
    };

    mockUseZerodhaAuth.mockReturnValue({
      isZerodhaAuthenticated: true,
      zerodhaProfile: mockProfile,
      isLoading: false,
      logoutZerodha: vi.fn(),
    });

    render(<ZerodhaAuthStatus compact={true} />);
    
    expect(screen.getByText('Connected')).toBeInTheDocument();
    expect(screen.getByText('Test')).toBeInTheDocument();
    // Should not show detailed profile information in compact mode
    expect(screen.queryByText('test@example.com')).not.toBeInTheDocument();
  });

  it('should call logout function when disconnect button is clicked', async () => {
    const mockLogout = vi.fn();
    const mockProfile = {
      user_id: 'TEST123',
      user_name: 'Test User',
      user_shortname: 'Test',
      email: 'test@example.com',
      phone: '+91-9876543210',
      broker: 'ZERODHA',
      exchanges: ['NSE', 'BSE'],
      products: ['CNC', 'MIS'],
      order_types: ['MARKET', 'LIMIT'],
    };

    mockUseZerodhaAuth.mockReturnValue({
      isZerodhaAuthenticated: true,
      zerodhaProfile: mockProfile,
      isLoading: false,
      logoutZerodha: mockLogout,
    });

    render(<ZerodhaAuthStatus />);
    
    const disconnectButton = screen.getByText('Disconnect');
    await userEvent.click(disconnectButton);
    
    expect(mockLogout).toHaveBeenCalledTimes(1);
  });

  it('should display trading access information', () => {
    const mockProfile = {
      user_id: 'TEST123',
      user_name: 'Test User',
      user_shortname: 'Test',
      email: 'test@example.com',
      phone: '+91-9876543210',
      broker: 'ZERODHA',
      exchanges: ['NSE', 'BSE'],
      products: ['CNC', 'MIS', 'NRML'],
      order_types: ['MARKET', 'LIMIT'],
    };

    mockUseZerodhaAuth.mockReturnValue({
      isZerodhaAuthenticated: true,
      zerodhaProfile: mockProfile,
      isLoading: false,
      logoutZerodha: vi.fn(),
    });

    render(<ZerodhaAuthStatus />);
    
    expect(screen.getByText('NSE')).toBeInTheDocument();
    expect(screen.getByText('BSE')).toBeInTheDocument();
    expect(screen.getByText('CNC')).toBeInTheDocument();
    expect(screen.getByText('MIS')).toBeInTheDocument();
    expect(screen.getByText('+1')).toBeInTheDocument(); // Should show +1 for additional products
  });
});