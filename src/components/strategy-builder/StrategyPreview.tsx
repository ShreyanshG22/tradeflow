
import { AlertTriangle, CheckCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export function StrategyPreview() {
  return (
    <ScrollArea className="h-full p-4">
      <div className="space-y-6">
        <div>
          <h3 className="font-medium mb-3">Strategy Summary</h3>
          <Card className="mb-4">
            <CardHeader className="py-3 px-4">
              <CardTitle className="text-sm font-medium">Plain English Rules</CardTitle>
            </CardHeader>
            <CardContent className="py-0 px-4 pb-4">
              <p className="text-sm text-muted-foreground mb-2">When <span className="font-medium">RSI</span> is below 30 and <span className="font-medium">MACD</span> shows bullish crossover:</p>
              <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-1">
                <li>Enter long position with 2% of capital</li>
                <li>Set take profit at 5% gain</li>
                <li>Set stop loss at 2% loss</li>
              </ul>
            </CardContent>
          </Card>
        </div>

        <div>
          <h3 className="font-medium mb-3">Validation</h3>
          <div className="space-y-3">
            <Alert variant="default" className="bg-green-50 dark:bg-green-900/20 border-green-500 text-green-700 dark:text-green-300">
              <CheckCircle className="h-4 w-4" />
              <AlertTitle>Valid Strategy</AlertTitle>
              <AlertDescription>All required components are properly connected</AlertDescription>
            </Alert>
            
            <Alert variant="default" className="bg-amber-50 dark:bg-amber-900/20 border-amber-500 text-amber-700 dark:text-amber-300">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Warning</AlertTitle>
              <AlertDescription>Consider adding a trailing stop for better risk management</AlertDescription>
            </Alert>
          </div>
        </div>

        <div>
          <h3 className="font-medium mb-3">Estimated Performance</h3>
          <Card>
            <CardContent className="py-4 px-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Win Rate</p>
                  <p className="text-xl font-semibold">62%</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Profit Factor</p>
                  <p className="text-xl font-semibold">1.8</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Avg. Win</p>
                  <p className="text-xl font-semibold text-green-600">+3.2%</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Avg. Loss</p>
                  <p className="text-xl font-semibold text-red-600">-1.5%</p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-4">Based on historical market conditions. Past performance is not indicative of future results.</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </ScrollArea>
  );
}
