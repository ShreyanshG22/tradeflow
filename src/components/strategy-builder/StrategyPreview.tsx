
import { AlertTriangle, CheckCircle, InfoIcon, HelpCircle, BarChart2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";

export function StrategyPreview() {
  return (
    <ScrollArea className="h-full">
      <div className="p-4 space-y-6">
        <Tabs defaultValue="summary" className="w-full">
          <TabsList className="w-full grid grid-cols-3 mb-4">
            <TabsTrigger value="summary">Summary</TabsTrigger>
            <TabsTrigger value="validation">Validation</TabsTrigger>
            <TabsTrigger value="performance">Performance</TabsTrigger>
          </TabsList>
          
          <TabsContent value="summary" className="space-y-4">
            <Card>
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
            
            <Card>
              <CardHeader className="py-3 px-4">
                <CardTitle className="text-sm font-medium">Strategy Components</CardTitle>
              </CardHeader>
              <CardContent className="py-0 px-4 pb-4">
                <div className="space-y-3">
                  <div>
                    <h4 className="text-sm font-medium mb-1">Entry Conditions</h4>
                    <ul className="list-disc pl-5 text-xs text-muted-foreground">
                      <li>RSI(14) below 30</li>
                      <li>MACD(12,26,9) Signal Line Crossover</li>
                    </ul>
                  </div>
                  
                  <div>
                    <h4 className="text-sm font-medium mb-1">Exit Conditions</h4>
                    <ul className="list-disc pl-5 text-xs text-muted-foreground">
                      <li>Take Profit: 5% gain</li>
                      <li>Stop Loss: 2% loss</li>
                    </ul>
                  </div>
                  
                  <div>
                    <h4 className="text-sm font-medium mb-1">Position Sizing</h4>
                    <p className="text-xs text-muted-foreground pl-5">2% of available capital per trade</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="py-3 px-4">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium">Quick Backtest Preview</CardTitle>
                  <Button size="sm" variant="outline" className="h-7 text-xs">
                    <BarChart2 className="h-3 w-3 mr-1" />
                    Run Full Backtest
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="py-0 px-4 pb-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-muted/30 rounded-md p-2">
                    <p className="text-xs text-muted-foreground">Win Rate</p>
                    <p className="text-base font-semibold">62%</p>
                  </div>
                  <div className="bg-muted/30 rounded-md p-2">
                    <p className="text-xs text-muted-foreground">Profit Factor</p>
                    <p className="text-base font-semibold">1.8</p>
                  </div>
                  <div className="bg-muted/30 rounded-md p-2">
                    <p className="text-xs text-muted-foreground">Max Drawdown</p>
                    <p className="text-base font-semibold text-red-600">-12%</p>
                  </div>
                  <div className="bg-muted/30 rounded-md p-2">
                    <p className="text-xs text-muted-foreground">Annual Return</p>
                    <p className="text-base font-semibold text-green-600">+24%</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="validation" className="space-y-4">
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
            
            <Card>
              <CardHeader className="py-3 px-4">
                <CardTitle className="text-sm font-medium">Logic Validation</CardTitle>
              </CardHeader>
              <CardContent className="py-0 px-4 pb-4">
                <div className="space-y-3">
                  <div className="flex items-start gap-2">
                    <CheckCircle className="h-4 w-4 text-green-500 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium">Entry conditions properly defined</p>
                      <p className="text-xs text-muted-foreground">All entry conditions have valid connections</p>
                    </div>
                  </div>
                  
                  <div className="flex items-start gap-2">
                    <CheckCircle className="h-4 w-4 text-green-500 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium">Exit conditions properly defined</p>
                      <p className="text-xs text-muted-foreground">Both profit target and stop loss are set</p>
                    </div>
                  </div>
                  
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium">Timeframe considerations</p>
                      <p className="text-xs text-muted-foreground">No specific timeframe selected, using default (15min)</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="py-3 px-4">
                <CardTitle className="text-sm font-medium">Strategy Improvements</CardTitle>
              </CardHeader>
              <CardContent className="py-0 px-4 pb-4">
                <div className="space-y-3">
                  <div className="flex items-start gap-2">
                    <InfoIcon className="h-4 w-4 text-blue-500 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium">Consider volume confirmation</p>
                      <p className="text-xs text-muted-foreground">Adding volume-based conditions could improve accuracy</p>
                    </div>
                  </div>
                  
                  <div className="flex items-start gap-2">
                    <InfoIcon className="h-4 w-4 text-blue-500 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium">Explore trailing stops</p>
                      <p className="text-xs text-muted-foreground">Using trailing stops could improve profit capture</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="performance" className="space-y-4">
            <Card>
              <CardHeader className="py-3 px-4">
                <CardTitle className="text-sm font-medium">Estimated Performance</CardTitle>
              </CardHeader>
              <CardContent className="py-0 px-4 pb-4">
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
            
            <Card>
              <CardHeader className="py-3 px-4">
                <CardTitle className="text-sm font-medium">Market Conditions</CardTitle>
              </CardHeader>
              <CardContent className="py-0 px-4 pb-4">
                <div className="space-y-3">
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Best performing in:</p>
                    <div className="flex items-center gap-2">
                      <div className="bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-300 text-xs px-2 py-1 rounded-full">Trending Markets</div>
                      <div className="bg-blue-100 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 text-xs px-2 py-1 rounded-full">Low Volatility</div>
                    </div>
                  </div>
                  
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Poorest performing in:</p>
                    <div className="flex items-center gap-2">
                      <div className="bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-300 text-xs px-2 py-1 rounded-full">Choppy Markets</div>
                      <div className="bg-orange-100 dark:bg-orange-900/20 text-orange-700 dark:text-orange-300 text-xs px-2 py-1 rounded-full">High Volatility</div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="py-3 px-4">
                <CardTitle className="text-sm font-medium">Risk Analysis</CardTitle>
              </CardHeader>
              <CardContent className="py-0 px-4 pb-4">
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-sm text-muted-foreground mb-1">Max Drawdown</p>
                      <p className="text-base font-medium text-red-600">-12.4%</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground mb-1">Recovery Time</p>
                      <p className="text-base font-medium">38 days</p>
                    </div>
                  </div>
                  
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Risk Assessment:</p>
                    <div className="flex items-center gap-2 mt-1">
                      <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-amber-500 w-[65%]"></div>
                      </div>
                      <span className="text-xs font-medium">Medium</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </ScrollArea>
  );
}
