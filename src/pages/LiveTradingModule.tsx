
import { useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Play, Pause, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const LiveTradingModule = () => {
  // Update the page title
  useEffect(() => {
    document.title = "Live Trading | TradeFlow";
  }, []);

  return (
    <div className="container p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Live Trading</h1>
          <p className="text-muted-foreground">
            Monitor and control your active trading strategies
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm">
            <Pause className="mr-2 h-4 w-4" />
            Pause All
          </Button>
          <Button size="sm">
            <Play className="mr-2 h-4 w-4" />
            Start All
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {/* Active Strategy Card 1 */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-xl">Moving Average Crossover</CardTitle>
              <Badge className="bg-green-500">Running</Badge>
            </div>
            <CardDescription>BTC/USD • 15 minute chart</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Today's P/L</p>
                  <p className="text-lg font-semibold text-green-500">+$312.45</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Active Since</p>
                  <p className="text-lg font-semibold">2 days</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Open Positions</p>
                  <p className="text-lg font-semibold">1</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Position Size</p>
                  <p className="text-lg font-semibold">0.5 BTC</p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="w-full">Pause</Button>
                <Button variant="outline" size="sm" className="w-full">Edit</Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Active Strategy Card 2 */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-xl">RSI Counter-Trend</CardTitle>
              <Badge className="bg-yellow-500">Warning</Badge>
            </div>
            <CardDescription>ETH/USD • 1 hour chart</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Today's P/L</p>
                  <p className="text-lg font-semibold text-red-500">-$87.22</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Active Since</p>
                  <p className="text-lg font-semibold">5 days</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Open Positions</p>
                  <p className="text-lg font-semibold">1</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Position Size</p>
                  <p className="text-lg font-semibold">2.5 ETH</p>
                </div>
              </div>
              <div className="flex items-center gap-2 p-2 bg-yellow-500/10 rounded-md">
                <AlertTriangle className="h-4 w-4 text-yellow-500" />
                <p className="text-xs">Volatility exceeding threshold</p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="w-full">Pause</Button>
                <Button variant="outline" size="sm" className="w-full">Edit</Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Add New Strategy Card */}
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center h-full py-8">
            <div className="rounded-full bg-primary/10 p-4 mb-4">
              <Play className="h-6 w-6 text-primary" />
            </div>
            <h3 className="text-xl font-medium mb-2">Deploy New Strategy</h3>
            <p className="text-sm text-muted-foreground text-center mb-4">
              Create and deploy a trading strategy to the live market
            </p>
            <Button>Start New Strategy</Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Market Connection Status</CardTitle>
          <CardDescription>
            Status of your connections to trading venues
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-2 border rounded-md">
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 rounded-full bg-green-500"></div>
                <span className="font-medium">Binance</span>
              </div>
              <Badge variant="outline">Connected</Badge>
            </div>
            <div className="flex items-center justify-between p-2 border rounded-md">
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 rounded-full bg-green-500"></div>
                <span className="font-medium">Coinbase</span>
              </div>
              <Badge variant="outline">Connected</Badge>
            </div>
            <div className="flex items-center justify-between p-2 border rounded-md">
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 rounded-full bg-red-500"></div>
                <span className="font-medium">Kraken</span>
              </div>
              <Badge variant="outline">Disconnected</Badge>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default LiveTradingModule;
