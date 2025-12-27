/**
 * Zerodha Session Manager Component
 * Manages Zerodha session state and provides session controls
 */

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { useZerodhaAuth } from '@/hooks/useZerodhaAuth';
import { 
  Clock, 
  RefreshCw, 
  AlertTriangle, 
  CheckCircle,
  LogOut,
  Shield
} from 'lucide-react';
import { toast } from 'sonner';

interface ZerodhaSessionManagerProps {
  className?: string;
  showControls?: boolean;
}

export function ZerodhaSessionManager({ 
  className = '',
  showControls = true 
}: ZerodhaSessionManagerProps) {
  const { 
    isZerodhaAuthenticated, 
    zerodhaProfile,
    refreshZerodhaToken,
    logoutZerodha,
    isLoading 
  } = useZerodhaAuth();

  const [sessionInfo, setSessionInfo] = useState({
    loginTime: null as string | null,
    expiresAt: null as string | null,
    timeRemaining: 0,
    isExpiringSoon: false,
  });

  const [isRefreshing, setIsRefreshing] = useState(false);

  // Calculate session info
  useEffect(() => {
    if (!isZerodhaAuthenticated) {
      setSessionInfo({
        loginTime: null,
        expiresAt: null,
        timeRemaining: 0,
        isExpiringSoon: false,
      });
      return;
    }

    const updateSessionInfo = () => {
      const accessToken = localStorage.getItem('zerodha_access_token');
      if (!accessToken) return;

      // Zerodha tokens typically expire at 6 AM next day
      const now = new Date();
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(6, 0, 0, 0); // 6 AM next day

      const timeRemaining = tomorrow.getTime() - now.getTime();
      const hoursRemaining = timeRemaining / (1000 * 60 * 60);
      
      setSessionInfo({
        loginTime: localStorage.getItem('zerodha_login_time'),
        expiresAt: tomorrow.toISOString(),
        timeRemaining: Math.max(0, timeRemaining),
        isExpiringSoon: hoursRemaining < 2, // Warn if less than 2 hours
      });
    };

    updateSessionInfo();
    const interval = setInterval(updateSessionInfo, 60000); // Update every minute

    return () => clearInterval(interval);
  }, [isZerodhaAuthenticated]);

  const handleRefreshToken = async () => {
    try {
      setIsRefreshing(true);
      await refreshZerodhaToken();
      toast.success('Session refreshed successfully');
    } catch (error) {
      console.error('Token refresh failed:', error);
      toast.error('Failed to refresh session');
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleLogout = async () => {
    try {
      await logoutZerodha();
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  const formatTimeRemaining = (milliseconds: number) => {
    const hours = Math.floor(milliseconds / (1000 * 60 * 60));
    const minutes = Math.floor((milliseconds % (1000 * 60 * 60)) / (1000 * 60));
    
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  const getSessionProgress = () => {
    if (!sessionInfo.timeRemaining) return 0;
    
    // Assume 18 hours total session time (6 AM to 6 AM next day)
    const totalSessionTime = 18 * 60 * 60 * 1000;
    const elapsed = totalSessionTime - sessionInfo.timeRemaining;
    return Math.min(100, Math.max(0, (elapsed / totalSessionTime) * 100));
  };

  if (!isZerodhaAuthenticated) {
    return (
      <Card className={className}>
        <CardContent className="flex items-center justify-center py-6">
          <div className="text-center space-y-2">
            <Shield className="h-8 w-8 text-muted-foreground mx-auto" />
            <p className="text-sm text-muted-foreground">
              No active Zerodha session
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-base">
          <div className="flex items-center space-x-2">
            <Clock className="h-4 w-4 text-orange-600" />
            <span>Session Status</span>
          </div>
          {sessionInfo.isExpiringSoon ? (
            <Badge variant="destructive" className="text-xs">
              <AlertTriangle className="mr-1 h-3 w-3" />
              Expiring Soon
            </Badge>
          ) : (
            <Badge className="bg-green-100 text-green-800 border-green-200 text-xs">
              <CheckCircle className="mr-1 h-3 w-3" />
              Active
            </Badge>
          )}
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Session Progress */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Session Progress</span>
            <span className="font-medium">
              {sessionInfo.timeRemaining > 0 
                ? formatTimeRemaining(sessionInfo.timeRemaining) + ' remaining'
                : 'Expired'
              }
            </span>
          </div>
          <Progress 
            value={getSessionProgress()} 
            className={`h-2 ${
              sessionInfo.isExpiringSoon 
                ? '[&>div]:bg-red-500' 
                : '[&>div]:bg-green-500'
            }`}
          />
        </div>

        {/* Session Details */}
        <div className="space-y-2 text-sm">
          {sessionInfo.loginTime && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Login Time:</span>
              <span>{new Date(sessionInfo.loginTime).toLocaleTimeString()}</span>
            </div>
          )}
          
          {sessionInfo.expiresAt && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Expires At:</span>
              <span>
                {new Date(sessionInfo.expiresAt).toLocaleString()}
              </span>
            </div>
          )}

          {zerodhaProfile && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">User ID:</span>
              <span className="font-mono text-xs">
                {zerodhaProfile.user_id}
              </span>
            </div>
          )}
        </div>

        {/* Warning Message */}
        {sessionInfo.isExpiringSoon && (
          <>
            <Separator />
            <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3">
              <div className="flex items-start space-x-2">
                <AlertTriangle className="h-4 w-4 text-yellow-600 mt-0.5" />
                <div className="text-sm">
                  <p className="font-medium text-yellow-800 dark:text-yellow-200">
                    Session Expiring Soon
                  </p>
                  <p className="text-yellow-700 dark:text-yellow-300 mt-1">
                    Your Zerodha session will expire in {formatTimeRemaining(sessionInfo.timeRemaining)}. 
                    You may need to re-authenticate to continue trading.
                  </p>
                </div>
              </div>
            </div>
          </>
        )}

        {/* Controls */}
        {showControls && (
          <>
            <Separator />
            <div className="flex justify-between">
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefreshToken}
                disabled={isRefreshing || isLoading}
              >
                <RefreshCw className={`mr-2 h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                Refresh Session
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={handleLogout}
                className="text-red-600 hover:text-red-700 hover:bg-red-50"
              >
                <LogOut className="mr-2 h-4 w-4" />
                End Session
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default ZerodhaSessionManager;