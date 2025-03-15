
import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Play, Pause, AlertTriangle, Trash, ExternalLink, Info, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { useForm } from "react-hook-form";
import { toast } from "@/hooks/use-toast";
import { Label } from "@/components/ui/label";

const LiveTradingModule = () => {
  // Update the page title
  useEffect(() => {
    document.title = "Live Trading | TradeFlow";
  }, []);

  const [brokerConnected, setBrokerConnected] = useState<boolean>(false);
  const [selectedBroker, setSelectedBroker] = useState<string>("");
  const [apiKey, setApiKey] = useState<string>("");
  const [secretKey, setSecretKey] = useState<string>("");
  const [isTestingConnection, setIsTestingConnection] = useState<boolean>(false);

  // Mock function to test broker connection
  const testBrokerConnection = () => {
    setIsTestingConnection(true);
    // Simulate API call
    setTimeout(() => {
      setIsTestingConnection(false);
      setBrokerConnected(true);
      toast({
        title: "Connection Successful",
        description: `Connected to ${selectedBroker} successfully.`,
        variant: "default",
      });
    }, 1500);
  };

  const emergencyPauseAllTrades = () => {
    toast({
      title: "Emergency Stop Activated",
      description: "All trading activities have been paused.",
      variant: "destructive",
    });
  };

  return (
    <div className="container p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Live Trading</h1>
          <p className="text-muted-foreground">
            Monitor and control your active trading strategies
          </p>
        </div>
        <Button 
          variant="destructive" 
          size="sm"
          onClick={emergencyPauseAllTrades}
        >
          <Pause className="mr-2 h-4 w-4" />
          Emergency Pause All Trades
        </Button>
      </div>

      {/* Broker Connection UI */}
      <Card>
        <CardHeader>
          <CardTitle>Broker Connection</CardTitle>
          <CardDescription>
            Connect to your trading broker to execute live trades
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="broker-select">Select Broker</Label>
                <Select 
                  value={selectedBroker} 
                  onValueChange={setSelectedBroker}
                >
                  <SelectTrigger id="broker-select">
                    <SelectValue placeholder="Select a broker" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="zerodha">Zerodha</SelectItem>
                    <SelectItem value="fyers">Fyers</SelectItem>
                    <SelectItem value="dhan">Dhan</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="api-key">API Key</Label>
                <Input 
                  id="api-key"
                  placeholder="Enter your API key" 
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="secret-key">Secret Key</Label>
                <Input 
                  id="secret-key"
                  placeholder="Enter your secret key" 
                  type="password"
                  value={secretKey}
                  onChange={(e) => setSecretKey(e.target.value)}
                />
              </div>
              
              <Button 
                onClick={testBrokerConnection} 
                disabled={!selectedBroker || !apiKey || !secretKey || isTestingConnection}
              >
                {isTestingConnection ? (
                  <>
                    <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                    Testing Connection
                  </>
                ) : (
                  <>
                    <ExternalLink className="mr-2 h-4 w-4" />
                    Test Connection
                  </>
                )}
              </Button>
            </div>
            
            <div className="space-y-4">
              <div className="rounded-md border p-4">
                <div className="font-medium">Connection Status</div>
                <div className="mt-2 flex items-center">
                  <div className={`h-3 w-3 rounded-full ${brokerConnected ? 'bg-green-500' : 'bg-red-500'} mr-2`}></div>
                  <span>{brokerConnected ? 'Connected' : 'Disconnected'}</span>
                </div>
                {brokerConnected && (
                  <div className="mt-4">
                    <div className="text-sm text-muted-foreground">Connected to: <span className="font-medium">{selectedBroker}</span></div>
                    <div className="text-sm text-muted-foreground">Account Balance: <span className="font-medium">₹125,000.00</span></div>
                    <div className="text-sm text-muted-foreground">Last Updated: <span className="font-medium">Just now</span></div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Live Strategy Execution Table */}
      <Card>
        <CardHeader>
          <CardTitle>Active Strategies</CardTitle>
          <CardDescription>
            Monitor and manage your running trading strategies
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Strategy Name</TableHead>
                <TableHead>Symbol</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Today's P&L</TableHead>
                <TableHead>Last Signal</TableHead>
                <TableHead>Position</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell className="font-medium">Moving Average Crossover</TableCell>
                <TableCell>BTC/USD</TableCell>
                <TableCell>
                  <Badge className="bg-green-500">Running</Badge>
                </TableCell>
                <TableCell className="text-green-500">+$312.45</TableCell>
                <TableCell>Buy @ $39,456.12</TableCell>
                <TableCell>0.5 BTC Long</TableCell>
                <TableCell>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm">
                      <Pause className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="sm">
                      <Info className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">RSI Counter-Trend</TableCell>
                <TableCell>ETH/USD</TableCell>
                <TableCell>
                  <Badge className="bg-yellow-500">Warning</Badge>
                </TableCell>
                <TableCell className="text-red-500">-$87.22</TableCell>
                <TableCell>Sell @ $2,298.15</TableCell>
                <TableCell>2.5 ETH Short</TableCell>
                <TableCell>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm">
                      <Pause className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="sm">
                      <Info className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Breakout Strategy</TableCell>
                <TableCell>AAPL</TableCell>
                <TableCell>
                  <Badge variant="outline">Paused</Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">$0.00</TableCell>
                <TableCell>None</TableCell>
                <TableCell>No Position</TableCell>
                <TableCell>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm">
                      <Play className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="sm">
                      <Trash className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Trade Monitoring UI / Heatmap */}
      <Card>
        <CardHeader>
          <CardTitle>Trade Performance Heatmap</CardTitle>
          <CardDescription>
            Visual overview of your trading performance
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-7 gap-2">
            {Array.from({ length: 28 }).map((_, i) => {
              // Randomly generate performance data
              const value = Math.random() * 100 - 50;
              let bgColor = 'bg-gray-200';
              
              if (value > 30) bgColor = 'bg-green-500';
              else if (value > 10) bgColor = 'bg-green-300';
              else if (value > 0) bgColor = 'bg-green-100';
              else if (value > -10) bgColor = 'bg-red-100';
              else if (value > -30) bgColor = 'bg-red-300';
              else bgColor = 'bg-red-500';
              
              return (
                <div key={i} className="group relative">
                  <div 
                    className={`${bgColor} h-12 rounded-md cursor-pointer hover:ring-2 hover:ring-primary`}
                  ></div>
                  <div className="absolute hidden group-hover:block bg-background border p-2 rounded-md shadow-lg z-10 -mt-1 left-1/2 transform -translate-x-1/2">
                    <p className="text-xs font-medium">Day {i+1}</p>
                    <p className={`text-xs ${value > 0 ? 'text-green-500' : 'text-red-500'}`}>
                      {value > 0 ? '+' : ''}{value.toFixed(2)}%
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Execution Logs */}
      <Card>
        <CardHeader>
          <CardTitle>Execution Logs</CardTitle>
          <CardDescription>
            Recent trade executions and signals
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="border-l-4 border-green-500 pl-4 py-2">
              <div className="flex justify-between">
                <span className="font-medium">BUY EXECUTED</span>
                <span className="text-sm text-muted-foreground">18 minutes ago</span>
              </div>
              <p className="text-sm">Moving Average Crossover • BTC/USD</p>
              <p className="text-sm text-muted-foreground">Buy 0.5 BTC @ $39,456.12</p>
            </div>

            <div className="border-l-4 border-red-500 pl-4 py-2">
              <div className="flex justify-between">
                <span className="font-medium">SELL EXECUTED</span>
                <span className="text-sm text-muted-foreground">2 hours ago</span>
              </div>
              <p className="text-sm">RSI Counter-Trend • ETH/USD</p>
              <p className="text-sm text-muted-foreground">Sell 2.5 ETH @ $2,298.15</p>
            </div>

            <div className="border-l-4 border-yellow-500 pl-4 py-2">
              <div className="flex justify-between">
                <span className="font-medium">WARNING</span>
                <span className="text-sm text-muted-foreground">3 hours ago</span>
              </div>
              <p className="text-sm">RSI Counter-Trend • ETH/USD</p>
              <p className="text-sm text-muted-foreground">Volatility exceeding threshold (34.5%)</p>
            </div>

            <div className="border-l-4 border-gray-400 pl-4 py-2">
              <div className="flex justify-between">
                <span className="font-medium">STRATEGY PAUSED</span>
                <span className="text-sm text-muted-foreground">Yesterday</span>
              </div>
              <p className="text-sm">Breakout Strategy • AAPL</p>
              <p className="text-sm text-muted-foreground">Manually paused by user</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default LiveTradingModule;
