import { TrendingUp, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export function LoadingSpinner({ className }: { className?: string }) {
  return <Loader2 className={cn('animate-spin text-primary', className)} />;
}

export default function FullPageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center">
        <div className="relative">
          <div className="bg-gradient-to-r from-blue-600 to-purple-600 p-4 rounded-xl animate-pulse">
            <TrendingUp className="h-12 w-12 text-white" />
          </div>
          <div className="absolute inset-0 bg-gradient-to-r from-blue-600 to-purple-600 rounded-xl animate-ping opacity-20"></div>
        </div>
        <h2 className="mt-4 text-xl font-semibold text-foreground">TradeFlow</h2>
        <p className="mt-2 text-muted-foreground">Loading your trading platform...</p>
        
        {/* Loading dots */}
        <div className="flex justify-center mt-4 space-x-1">
          <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce"></div>
          <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
          <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
        </div>
      </div>
    </div>
  );
}