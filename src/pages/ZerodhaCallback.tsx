/**
 * Zerodha OAuth Callback Page
 * Handles the callback from Zerodha OAuth flow
 */

import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import LoadingSpinner from '@/components/LoadingSpinner';
import { useZerodhaAuth } from '@/hooks/useZerodhaAuth';
import { CheckCircle, XCircle, ArrowLeft, Shield } from 'lucide-react';
import { toast } from 'sonner';

export default function ZerodhaCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { handleZerodhaCallback } = useZerodhaAuth();
  
  const [status, setStatus] = useState<'processing' | 'success' | 'error'>('processing');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const processCallback = async () => {
      try {
        // Get request token from URL parameters
        const requestToken = searchParams.get('request_token');
        const action = searchParams.get('action');
        const status = searchParams.get('status');

        // Check for error parameters
        if (status === 'error' || action === 'error') {
          const errorMessage = searchParams.get('message') || 'Authentication was cancelled or failed';
          throw new Error(errorMessage);
        }

        if (!requestToken) {
          throw new Error('No request token received from Zerodha');
        }

        // Process the callback
        await handleZerodhaCallback(requestToken);
        
        setStatus('success');
        
        // Redirect to dashboard after a short delay
        setTimeout(() => {
          navigate('/dashboard', { replace: true });
        }, 2000);
        
      } catch (error) {
        console.error('Zerodha callback error:', error);
        const errorMessage = error instanceof Error ? error.message : 'Authentication failed';
        setError(errorMessage);
        setStatus('error');
        toast.error(errorMessage);
      }
    };

    processCallback();
  }, [searchParams, handleZerodhaCallback, navigate]);

  const handleRetry = () => {
    navigate('/dashboard', { replace: true });
  };

  const handleGoBack = () => {
    navigate(-1);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 p-4">
      <div className="w-full max-w-md">
        {/* Logo and Brand */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center mb-4">
            <div className="bg-gradient-to-r from-orange-600 to-red-600 p-3 rounded-xl">
              <Shield className="h-8 w-8 text-white" />
            </div>
          </div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-orange-600 to-red-600 bg-clip-text text-transparent">
            Zerodha Authentication
          </h1>
        </div>

        <Card className="shadow-xl border-0 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm">
          <CardHeader className="text-center">
            <CardTitle className="text-xl">
              {status === 'processing' && 'Processing Authentication...'}
              {status === 'success' && 'Authentication Successful!'}
              {status === 'error' && 'Authentication Failed'}
            </CardTitle>
          </CardHeader>
          
          <CardContent className="text-center space-y-6">
            {status === 'processing' && (
              <>
                <div className="flex justify-center">
                  <LoadingSpinner className="h-12 w-12 text-orange-600" />
                </div>
                <div className="space-y-2">
                  <p className="text-muted-foreground">
                    Connecting to your Zerodha account...
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Please wait while we verify your credentials.
                  </p>
                </div>
              </>
            )}

            {status === 'success' && (
              <>
                <div className="flex justify-center">
                  <div className="bg-green-100 dark:bg-green-900/20 p-4 rounded-full">
                    <CheckCircle className="h-12 w-12 text-green-600" />
                  </div>
                </div>
                <div className="space-y-2">
                  <p className="text-lg font-medium text-green-600">
                    Successfully Connected!
                  </p>
                  <p className="text-muted-foreground">
                    Your Zerodha account has been linked to TradeFlow.
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Redirecting to dashboard...
                  </p>
                </div>
              </>
            )}

            {status === 'error' && (
              <>
                <div className="flex justify-center">
                  <div className="bg-red-100 dark:bg-red-900/20 p-4 rounded-full">
                    <XCircle className="h-12 w-12 text-red-600" />
                  </div>
                </div>
                <div className="space-y-2">
                  <p className="text-lg font-medium text-red-600">
                    Connection Failed
                  </p>
                  <p className="text-muted-foreground">
                    {error || 'Unable to connect to your Zerodha account.'}
                  </p>
                </div>
                
                <div className="flex flex-col space-y-2">
                  <Button 
                    onClick={handleRetry}
                    className="bg-orange-600 hover:bg-orange-700"
                  >
                    Go to Dashboard
                  </Button>
                  <Button 
                    variant="outline" 
                    onClick={handleGoBack}
                  >
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Go Back
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Help Text */}
        {status === 'error' && (
          <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
            <p className="text-sm font-medium text-blue-800 dark:text-blue-200 mb-2">
              Troubleshooting Tips:
            </p>
            <ul className="text-xs text-blue-600 dark:text-blue-300 space-y-1">
              <li>• Ensure you have a valid Zerodha account</li>
              <li>• Check if your API credentials are correct</li>
              <li>• Try the authentication process again</li>
              <li>• Contact support if the issue persists</li>
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}