/**
 * Zerodha Login Button Component
 * Provides a button to initiate Zerodha authentication flow
 */

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { useZerodhaAuth } from '@/hooks/useZerodhaAuth';
import { ExternalLink, Shield } from 'lucide-react';

interface ZerodhaLoginButtonProps {
  variant?: 'default' | 'outline' | 'secondary';
  size?: 'sm' | 'default' | 'lg';
  className?: string;
  showIcon?: boolean;
  children?: React.ReactNode;
}

export function ZerodhaLoginButton({
  variant = 'default',
  size = 'default',
  className = '',
  showIcon = true,
  children,
}: ZerodhaLoginButtonProps) {
  const { initiateZerodhaLogin, isLoading } = useZerodhaAuth();
  const [isInitiating, setIsInitiating] = useState(false);

  const handleLogin = async () => {
    try {
      setIsInitiating(true);
      await initiateZerodhaLogin();
    } catch (error) {
      console.error('Zerodha login failed:', error);
    } finally {
      setIsInitiating(false);
    }
  };

  const isButtonLoading = isLoading || isInitiating;

  return (
    <Button
      onClick={handleLogin}
      disabled={isButtonLoading}
      variant={variant}
      size={size}
      className={`${className} ${
        variant === 'default' 
          ? 'bg-orange-600 hover:bg-orange-700 text-white' 
          : ''
      }`}
    >
      {isButtonLoading ? (
        <>
          <LoadingSpinner className="mr-2 h-4 w-4" />
          Connecting...
        </>
      ) : (
        <>
          {showIcon && <Shield className="mr-2 h-4 w-4" />}
          {children || 'Connect Zerodha'}
          {showIcon && <ExternalLink className="ml-2 h-4 w-4" />}
        </>
      )}
    </Button>
  );
}

export default ZerodhaLoginButton;