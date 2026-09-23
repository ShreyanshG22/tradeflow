/**
 * Zerodha Authentication Hook
 * Manages Zerodha-specific authentication state and operations
 */

import { useState, useEffect, useContext, createContext, ReactNode } from 'react';
import { toast } from 'sonner';

// Zerodha API Types
export interface ZerodhaAuthResponse {
  access_token: string;
  public_token: string;
  refresh_token?: string;
  login_time: string;
  user_id: string;
  user_name: string;
  user_shortname: string;
  avatar_url?: string;
  user_type: string;
  email: string;
  broker: string;
  exchanges: string[];
  products: string[];
  order_types: string[];
  api_key: string;
}

export interface ZerodhaUserProfile {
  user_id: string;
  user_name: string;
  user_shortname: string;
  avatar_url?: string;
  user_type: string;
  email: string;
  phone: string;
  broker: string;
  exchanges: string[];
  products: string[];
  order_types: string[];
}

export interface ZerodhaLoginRequest {
  api_key: string;
  redirect_url: string;
}

export interface ZerodhaCallbackRequest {
  request_token: string;
  api_key: string;
  api_secret: string;
}

interface ZerodhaAuthContextType {
  isZerodhaAuthenticated: boolean;
  zerodhaProfile: ZerodhaUserProfile | null;
  isLoading: boolean;
  loginUrl: string | null;
  initiateZerodhaLogin: () => Promise<void>;
  handleZerodhaCallback: (requestToken: string) => Promise<void>;
  refreshZerodhaToken: () => Promise<void>;
  logoutZerodha: () => Promise<void>;
  getZerodhaProfile: () => Promise<void>;
}

const ZerodhaAuthContext = createContext<ZerodhaAuthContextType | undefined>(undefined);

// Zerodha API configuration
const ZERODHA_API_KEY = import.meta.env.VITE_ZERODHA_API_KEY || '';
const ZERODHA_API_SECRET = import.meta.env.VITE_ZERODHA_API_SECRET || '';
const ZERODHA_REDIRECT_URL = import.meta.env.VITE_ZERODHA_REDIRECT_URL || `${window.location.origin}/zerodha/callback`;

export function ZerodhaAuthProvider({ children }: { children: ReactNode }) {
  const [zerodhaProfile, setZerodhaProfile] = useState<ZerodhaUserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loginUrl, setLoginUrl] = useState<string | null>(null);

  const isZerodhaAuthenticated = !!zerodhaProfile;

  // Load Zerodha profile on mount if token exists
  useEffect(() => {
    loadZerodhaProfile();
  }, []);

  const loadZerodhaProfile = async () => {
    try {
      const zerodhaToken = localStorage.getItem('zerodha_access_token');
      if (zerodhaToken) {
        await getZerodhaProfile();
      }
    } catch (error) {
      console.error('Failed to load Zerodha profile:', error);
      // Clear invalid token
      localStorage.removeItem('zerodha_access_token');
      localStorage.removeItem('zerodha_public_token');
      localStorage.removeItem('zerodha_refresh_token');
    }
  };

  const initiateZerodhaLogin = async () => {
    try {
      setIsLoading(true);
      
      if (!ZERODHA_API_KEY) {
        throw new Error('Zerodha API key not configured');
      }

      const response = await fetch('/api/zerodha/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          api_key: ZERODHA_API_KEY,
          redirect_url: ZERODHA_REDIRECT_URL,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to generate login URL');
      }

      const data = await response.json();
      
      if (data.success && data.data?.login_url) {
        setLoginUrl(data.data.login_url);
        // Redirect to Zerodha login
        window.location.href = data.data.login_url;
      } else {
        throw new Error(data.error?.message || 'Failed to generate login URL');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to initiate Zerodha login';
      toast.error(message);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const handleZerodhaCallback = async (requestToken: string) => {
    try {
      setIsLoading(true);

      if (!ZERODHA_API_KEY || !ZERODHA_API_SECRET) {
        throw new Error('Zerodha API credentials not configured');
      }

      const response = await fetch('/api/zerodha/auth/callback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          request_token: requestToken,
          api_key: ZERODHA_API_KEY,
          api_secret: ZERODHA_API_SECRET,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to authenticate with Zerodha');
      }

      const data = await response.json();
      
      if (data.success && data.data) {
        const authData: ZerodhaAuthResponse = data.data;
        
        // Store tokens
        localStorage.setItem('zerodha_access_token', authData.access_token);
        localStorage.setItem('zerodha_public_token', authData.public_token);
        if (authData.refresh_token) {
          localStorage.setItem('zerodha_refresh_token', authData.refresh_token);
        }

        // Set profile data
        setZerodhaProfile({
          user_id: authData.user_id,
          user_name: authData.user_name,
          user_shortname: authData.user_shortname,
          avatar_url: authData.avatar_url,
          user_type: authData.user_type,
          email: authData.email,
          phone: '', // Will be fetched from profile API
          broker: authData.broker,
          exchanges: authData.exchanges,
          products: authData.products,
          order_types: authData.order_types,
        });

        toast.success('Zerodha authentication successful!');
      } else {
        throw new Error(data.error?.message || 'Authentication failed');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Zerodha authentication failed';
      toast.error(message);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const refreshZerodhaToken = async () => {
    try {
      const refreshToken = localStorage.getItem('zerodha_refresh_token');
      if (!refreshToken) {
        throw new Error('No refresh token available');
      }

      const response = await fetch('/api/zerodha/auth/refresh', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('tradeflow_token')}`,
        },
        body: JSON.stringify({
          refresh_token: refreshToken,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to refresh Zerodha token');
      }

      const data = await response.json();
      
      if (data.success && data.data) {
        localStorage.setItem('zerodha_access_token', data.data.access_token);
        if (data.data.refresh_token) {
          localStorage.setItem('zerodha_refresh_token', data.data.refresh_token);
        }
      } else {
        throw new Error(data.error?.message || 'Token refresh failed');
      }
    } catch (error) {
      console.error('Token refresh failed:', error);
      // Clear tokens and logout
      await logoutZerodha();
      throw error;
    }
  };

  const getZerodhaProfile = async () => {
    try {
      const response = await fetch('/api/zerodha/auth/profile', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('tradeflow_token')}`,
        },
      });

      if (!response.ok) {
        if (response.status === 401) {
          // Try to refresh token
          await refreshZerodhaToken();
          // Retry the request
          return getZerodhaProfile();
        }
        throw new Error('Failed to get Zerodha profile');
      }

      const data = await response.json();
      
      if (data.success && data.data) {
        setZerodhaProfile(data.data);
      } else {
        throw new Error(data.error?.message || 'Failed to get profile');
      }
    } catch (error) {
      console.error('Failed to get Zerodha profile:', error);
      throw error;
    }
  };

  const logoutZerodha = async () => {
    try {
      // Call logout API
      await fetch('/api/zerodha/auth/logout', {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('tradeflow_token')}`,
        },
      });
    } catch (error) {
      console.error('Logout API error:', error);
    } finally {
      // Clear local state and tokens
      setZerodhaProfile(null);
      setLoginUrl(null);
      localStorage.removeItem('zerodha_access_token');
      localStorage.removeItem('zerodha_public_token');
      localStorage.removeItem('zerodha_refresh_token');
      toast.success('Zerodha logout successful');
    }
  };

  const value: ZerodhaAuthContextType = {
    isZerodhaAuthenticated,
    zerodhaProfile,
    isLoading,
    loginUrl,
    initiateZerodhaLogin,
    handleZerodhaCallback,
    refreshZerodhaToken,
    logoutZerodha,
    getZerodhaProfile,
  };

  return (
    <ZerodhaAuthContext.Provider value={value}>
      {children}
    </ZerodhaAuthContext.Provider>
  );
}

export function useZerodhaAuth() {
  const context = useContext(ZerodhaAuthContext);
  if (context === undefined) {
    throw new Error('useZerodhaAuth must be used within a ZerodhaAuthProvider');
  }
  return context;
}