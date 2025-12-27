/**
 * Zerodha Authentication Status Component
 * Displays current Zerodha authentication status and user information
 */

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { useZerodhaAuth } from '@/hooks/useZerodhaAuth';
import { 
  CheckCircle, 
  XCircle, 
  User, 
  Building, 
  Mail, 
  Phone,
  LogOut,
  Loader2
} from 'lucide-react';

interface ZerodhaAuthStatusProps {
  showDetails?: boolean;
  compact?: boolean;
  className?: string;
}

export function ZerodhaAuthStatus({ 
  showDetails = true, 
  compact = false,
  className = '' 
}: ZerodhaAuthStatusProps) {
  const { 
    isZerodhaAuthenticated, 
    zerodhaProfile, 
    isLoading,
    logoutZerodha 
  } = useZerodhaAuth();

  const handleLogout = async () => {
    try {
      await logoutZerodha();
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  if (isLoading) {
    return (
      <div className={`flex items-center space-x-2 ${className}`}>
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-sm text-muted-foreground">
          Checking Zerodha status...
        </span>
      </div>
    );
  }

  if (compact) {
    return (
      <div className={`flex items-center space-x-2 ${className}`}>
        {isZerodhaAuthenticated ? (
          <>
            <CheckCircle className="h-4 w-4 text-green-500" />
            <Badge variant="secondary" className="bg-green-100 text-green-800">
              Connected
            </Badge>
            {zerodhaProfile && (
              <span className="text-sm text-muted-foreground">
                {zerodhaProfile.user_shortname}
              </span>
            )}
          </>
        ) : (
          <>
            <XCircle className="h-4 w-4 text-red-500" />
            <Badge variant="secondary" className="bg-red-100 text-red-800">
              Not Connected
            </Badge>
          </>
        )}
      </div>
    );
  }

  if (!showDetails) {
    return (
      <Badge 
        variant={isZerodhaAuthenticated ? "default" : "secondary"}
        className={`${className} ${
          isZerodhaAuthenticated 
            ? 'bg-green-100 text-green-800 border-green-200' 
            : 'bg-red-100 text-red-800 border-red-200'
        }`}
      >
        {isZerodhaAuthenticated ? (
          <>
            <CheckCircle className="mr-1 h-3 w-3" />
            Zerodha Connected
          </>
        ) : (
          <>
            <XCircle className="mr-1 h-3 w-3" />
            Zerodha Disconnected
          </>
        )}
      </Badge>
    );
  }

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-lg">
          <div className="flex items-center space-x-2">
            <Building className="h-5 w-5 text-orange-600" />
            <span>Zerodha Account</span>
          </div>
          {isZerodhaAuthenticated ? (
            <Badge className="bg-green-100 text-green-800 border-green-200">
              <CheckCircle className="mr-1 h-3 w-3" />
              Connected
            </Badge>
          ) : (
            <Badge variant="secondary" className="bg-red-100 text-red-800 border-red-200">
              <XCircle className="mr-1 h-3 w-3" />
              Not Connected
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {isZerodhaAuthenticated && zerodhaProfile ? (
          <>
            {/* User Profile Section */}
            <div className="flex items-start space-x-3">
              <Avatar className="h-12 w-12">
                <AvatarImage 
                  src={zerodhaProfile.avatar_url} 
                  alt={zerodhaProfile.user_name}
                />
                <AvatarFallback className="bg-orange-100 text-orange-600">
                  {zerodhaProfile.user_shortname.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              
              <div className="flex-1 space-y-1">
                <div className="flex items-center space-x-2">
                  <User className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">{zerodhaProfile.user_name}</span>
                  <Badge variant="outline" className="text-xs">
                    {zerodhaProfile.user_type}
                  </Badge>
                </div>
                
                <div className="flex items-center space-x-2 text-sm text-muted-foreground">
                  <Mail className="h-3 w-3" />
                  <span>{zerodhaProfile.email}</span>
                </div>
                
                {zerodhaProfile.phone && (
                  <div className="flex items-center space-x-2 text-sm text-muted-foreground">
                    <Phone className="h-3 w-3" />
                    <span>{zerodhaProfile.phone}</span>
                  </div>
                )}
              </div>
            </div>

            <Separator />

            {/* Account Details */}
            <div className="space-y-3">
              <div>
                <h4 className="text-sm font-medium mb-2">Trading Access</h4>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-xs text-muted-foreground">Exchanges</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {zerodhaProfile.exchanges.map((exchange) => (
                        <Badge key={exchange} variant="outline" className="text-xs">
                          {exchange}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  
                  <div>
                    <span className="text-xs text-muted-foreground">Products</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {zerodhaProfile.products.slice(0, 3).map((product) => (
                        <Badge key={product} variant="outline" className="text-xs">
                          {product}
                        </Badge>
                      ))}
                      {zerodhaProfile.products.length > 3 && (
                        <Badge variant="outline" className="text-xs">
                          +{zerodhaProfile.products.length - 3}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <Separator />

            {/* Actions */}
            <div className="flex justify-end">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleLogout}
                className="text-red-600 hover:text-red-700 hover:bg-red-50"
              >
                <LogOut className="mr-2 h-4 w-4" />
                Disconnect
              </Button>
            </div>
          </>
        ) : (
          <div className="text-center py-4">
            <XCircle className="h-12 w-12 text-red-500 mx-auto mb-3" />
            <h3 className="text-lg font-medium mb-2">Not Connected</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Connect your Zerodha account to start trading
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default ZerodhaAuthStatus;