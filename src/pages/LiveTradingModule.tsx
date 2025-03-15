
import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { 
  Play, 
  Pause, 
  AlertTriangle, 
  Trash, 
  ExternalLink, 
  Info, 
  RefreshCw,
  Link,
  Link2Off,
  PowerOff,
  TrendingUp,
  TrendingDown,
  Search,
  Plus,
  Minus,
  ArrowRightLeft,
  Shield,
  ShieldAlert,
  Settings
} from "lucide-react";
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
import { Switch } from "@/components/ui/switch";
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

const LiveTradingModule = () => {
  // Update the page title
  useEffect(() => {
    document.title = "Live Trading | TradeFlow";
  }, []);

  // Broker connection states
  const [brokerConnected, setBrokerConnected] = useState<boolean>(false);
  const [connectionStatus, setConnectionStatus] = useState<"connected" | "pending" | "disconnected">("disconnected");
  const [selectedBroker, setSelectedBroker] = useState<string>("");
  const [apiKey, setApiKey] = useState<string>("");
  const [secretKey, setSecretKey] = useState<string>("");
  const [isTestingConnection, setIsTestingConnection] = useState<boolean>(false);
  const [autoReconnect, setAutoReconnect] = useState<boolean>(true);

  // Manual trading states
  const [selectedStock, setSelectedStock] = useState<string>("");
  const [orderType, setOrderType] = useState<string>("market");
  const [quantity, setQuantity] = useState<number>(1);
  const [selectedOrderDirection, setSelectedOrderDirection] = useState<string>("buy");
  const [showOrderConfirmation, setShowOrderConfirmation] = useState<boolean>(false);

  // Risk management states
  const [maxLossPerStrategy, setMaxLossPerStrategy] = useState<number>(1000);
  const [maxDailyDrawdown, setMaxDailyDrawdown] = useState<number>(5000);
  const [autoLiquidateOnBreach, setAutoLiquidateOnBreach] = useState<boolean>(true);

  // Mock strategies data
  const [strategies, setStrategies] = useState([
    {
      id: 1,
      name: "Mean Reversion",
      symbol: "NIFTY50",
      position: "Long (2 lots)",
      entryPrice: 18500,
      currentPrice: 18650,
      pnl: 3000,
      status: "active"
    },
    {
      id: 2,
      name: "Momentum Breakout",
      symbol: "RELIANCE",
      position: "Short (1 lot)",
      entryPrice: 2420,
      currentPrice: 2400,
      pnl: 2000,
      status: "active"
    },
    {
      id: 3,
      name: "RSI Divergence",
      symbol: "HDFCBANK",
      position: "Long (5 lots)",
      entryPrice: 1580,
      currentPrice: 1550,
      pnl: -1500,
      status: "active"
    },
    {
      id: 4,
      name: "Volatility Breakout",
      symbol: "BANKNIFTY",
      position: "No Position",
      entryPrice: 0,
      currentPrice: 0,
      pnl: 0,
      status: "paused"
    }
  ]);

  // Mock function to test broker connection
  const testBrokerConnection = () => {
    setIsTestingConnection(true);
    setConnectionStatus("pending");
    
    // Simulate API call
    setTimeout(() => {
      setIsTestingConnection(false);
      setBrokerConnected(true);
      setConnectionStatus("connected");
      
      toast({
        title: "Connection Successful",
        description: `Connected to ${selectedBroker} successfully.`,
        variant: "default",
      });
    }, 1500);
  };

  // Emergency stop function
  const emergencyPauseAllTrades = () => {
    // Update status of all strategies to paused
    setStrategies(strategies.map(strategy => ({
      ...strategy,
      status: "paused"
    })));
    
    toast({
      title: "Emergency Stop Activated",
      description: "All trading activities have been paused.",
      variant: "destructive",
    });
  };

  // Toggle strategy status function
  const toggleStrategyStatus = (id: number) => {
    setStrategies(strategies.map(strategy => 
      strategy.id === id 
        ? { ...strategy, status: strategy.status === "active" ? "paused" : "active" } 
        : strategy
    ));

    const strategy = strategies.find(s => s.id === id);
    const newStatus = strategy?.status === "active" ? "paused" : "active";
    
    toast({
      title: `Strategy ${newStatus === "active" ? "Activated" : "Paused"}`,
      description: `${strategy?.name} is now ${newStatus}.`,
      variant: "default",
    });
  };

  // Close strategy position function
  const closeStrategyPosition = (id: number) => {
    const strategy = strategies.find(s => s.id === id);
    
    if (strategy && strategy.status === "active") {
      setStrategies(strategies.map(s => 
        s.id === id 
          ? { ...s, position: "No Position", pnl: 0 } 
          : s
      ));
      
      toast({
        title: "Position Closed",
        description: `Closed position for ${strategy.name}.`,
        variant: "default",
      });
    }
  };

  // Place manual order function
  const placeManualOrder = () => {
    setShowOrderConfirmation(false);
    
    toast({
      title: "Order Placed Successfully",
      description: `${selectedOrderDirection.toUpperCase()} ${quantity} lots of ${selectedStock} via ${orderType} order.`,
      variant: "default",
    });
  };

  // Increase quantity handler
  const increaseQuantity = () => {
    setQuantity(prev => prev + 1);
  };

  // Decrease quantity handler
  const decreaseQuantity = () => {
    if (quantity > 1) {
      setQuantity(prev => prev - 1);
    }
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
          className="flex items-center"
        >
          <PowerOff className="mr-2 h-4 w-4" />
          Emergency Stop All Trades
        </Button>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {/* Left Column: Broker Connection UI */}
        <div className="space-y-6">
          {/* Broker Connection UI */}
          <Card>
            <CardHeader>
              <CardTitle>Broker Connection</CardTitle>
              <CardDescription>
                Connect to your trading broker to execute live trades
              </CardDescription>
            </CardHeader>
            <CardContent>
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
                      <SelectItem value="angelone">Angel One</SelectItem>
                      <SelectItem value="aliceblue">Alice Blue</SelectItem>
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

                <div className="flex items-center space-x-2">
                  <Switch 
                    id="auto-reconnect"
                    checked={autoReconnect}
                    onCheckedChange={setAutoReconnect}
                  />
                  <Label htmlFor="auto-reconnect">Auto-Reconnect</Label>
                </div>
                
                <Button 
                  onClick={testBrokerConnection} 
                  disabled={!selectedBroker || !apiKey || !secretKey || isTestingConnection}
                  className="w-full"
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

                <div className="rounded-md border p-4">
                  <div className="font-medium">Connection Status</div>
                  <div className="mt-2 flex items-center">
                    <div className={`h-3 w-3 rounded-full 
                      ${connectionStatus === 'connected' ? 'bg-green-500' : 
                        connectionStatus === 'pending' ? 'bg-yellow-500' : 'bg-red-500'} 
                      mr-2`}>
                    </div>
                    <span>
                      {connectionStatus === 'connected' 
                        ? 'Connected' 
                        : connectionStatus === 'pending' 
                          ? 'Connecting...' 
                          : 'Disconnected'}
                    </span>
                  </div>
                  {connectionStatus === 'connected' && (
                    <div className="mt-4">
                      <div className="text-sm text-muted-foreground">Connected to: <span className="font-medium">{selectedBroker}</span></div>
                      <div className="text-sm text-muted-foreground">Account Balance: <span className="font-medium">₹125,000.00</span></div>
                      <div className="text-sm text-muted-foreground">Last Updated: <span className="font-medium">Just now</span></div>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Risk Management Settings */}
          <Card>
            <CardHeader>
              <CardTitle>Risk Management</CardTitle>
              <CardDescription>
                Control your trading risk parameters
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="max-loss-strategy">Max Loss Per Strategy (₹)</Label>
                  <Input 
                    id="max-loss-strategy"
                    type="number" 
                    value={maxLossPerStrategy}
                    onChange={(e) => setMaxLossPerStrategy(Number(e.target.value))}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="max-daily-drawdown">Max Daily Drawdown (₹)</Label>
                  <Input 
                    id="max-daily-drawdown"
                    type="number" 
                    value={maxDailyDrawdown}
                    onChange={(e) => setMaxDailyDrawdown(Number(e.target.value))}
                  />
                </div>

                <div className="flex items-center space-x-2">
                  <Switch 
                    id="auto-liquidate"
                    checked={autoLiquidateOnBreach}
                    onCheckedChange={setAutoLiquidateOnBreach}
                  />
                  <Label htmlFor="auto-liquidate">Auto-Liquidate on Breach</Label>
                </div>

                <Alert>
                  <Shield className="h-4 w-4" />
                  <AlertTitle>Risk Protection</AlertTitle>
                  <AlertDescription>
                    Your account is protected with auto-stop loss if risk parameters are breached.
                  </AlertDescription>
                </Alert>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Middle Column: Strategy Execution & Monitoring */}
        <div className="space-y-6 md:col-span-2">
          {/* Live Strategy Execution Table */}
          <Card>
            <CardHeader>
              <CardTitle>Active Strategies</CardTitle>
              <CardDescription>
                Monitor and manage your running trading strategies
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Strategy Name</TableHead>
                      <TableHead>Symbol</TableHead>
                      <TableHead>Position</TableHead>
                      <TableHead>Entry Price</TableHead>
                      <TableHead>Current Price</TableHead>
                      <TableHead>P&L</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {strategies.map(strategy => (
                      <TableRow key={strategy.id}>
                        <TableCell className="font-medium">{strategy.name}</TableCell>
                        <TableCell>{strategy.symbol}</TableCell>
                        <TableCell>{strategy.position}</TableCell>
                        <TableCell>{strategy.entryPrice > 0 ? `₹${strategy.entryPrice.toLocaleString()}` : '-'}</TableCell>
                        <TableCell>{strategy.currentPrice > 0 ? `₹${strategy.currentPrice.toLocaleString()}` : '-'}</TableCell>
                        <TableCell className={strategy.pnl > 0 ? 'text-green-500' : strategy.pnl < 0 ? 'text-red-500' : 'text-muted-foreground'}>
                          {strategy.pnl !== 0 ? (strategy.pnl > 0 ? '+' : '') + `₹${strategy.pnl.toLocaleString()}` : '-'}
                        </TableCell>
                        <TableCell>
                          <Badge className={
                            strategy.status === "active" ? "bg-green-500" : 
                            strategy.status === "warning" ? "bg-yellow-500" : 
                            "bg-gray-300"
                          }>
                            {strategy.status === "active" ? "Active" : 
                             strategy.status === "warning" ? "Warning" : 
                             "Paused"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => toggleStrategyStatus(strategy.id)}
                            >
                              {strategy.status === "active" ? (
                                <Pause className="h-4 w-4" />
                              ) : (
                                <Play className="h-4 w-4" />
                              )}
                            </Button>
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => closeStrategyPosition(strategy.id)}
                              disabled={strategy.position === "No Position"}
                            >
                              <Trash className="h-4 w-4" />
                            </Button>
                            <Dialog>
                              <DialogTrigger asChild>
                                <Button variant="outline" size="sm">
                                  <Info className="h-4 w-4" />
                                </Button>
                              </DialogTrigger>
                              <DialogContent>
                                <DialogHeader>
                                  <DialogTitle>{strategy.name} Details</DialogTitle>
                                  <DialogDescription>
                                    Strategy running on {strategy.symbol}
                                  </DialogDescription>
                                </DialogHeader>
                                <div className="space-y-4 py-4">
                                  <div className="grid grid-cols-2 gap-4">
                                    <div>
                                      <h4 className="font-medium">Entry Conditions</h4>
                                      <p className="text-sm text-muted-foreground">
                                        {strategy.name === "Mean Reversion" 
                                          ? "RSI below 30, price at support" 
                                          : strategy.name === "Momentum Breakout"
                                          ? "Price breakout above resistance with volume"
                                          : strategy.name === "RSI Divergence"
                                          ? "Positive RSI divergence on daily chart"
                                          : "Price volatility > 2 standard deviations"}
                                      </p>
                                    </div>
                                    <div>
                                      <h4 className="font-medium">Exit Conditions</h4>
                                      <p className="text-sm text-muted-foreground">
                                        {strategy.name === "Mean Reversion" 
                                          ? "RSI above 70 or 2% stop loss" 
                                          : strategy.name === "Momentum Breakout"
                                          ? "Trailing stop loss of 1.5% or price reversal"
                                          : strategy.name === "RSI Divergence"
                                          ? "RSI moves above 70 or 2.5% stop loss"
                                          : "Volatility returns to normal range"}
                                      </p>
                                    </div>
                                  </div>
                                  
                                  <div>
                                    <h4 className="font-medium">Performance</h4>
                                    <div className="mt-2 h-36 bg-gray-100 rounded-md flex items-center justify-center">
                                      <p className="text-muted-foreground text-sm">Performance chart goes here</p>
                                    </div>
                                  </div>
                                  
                                  <div>
                                    <h4 className="font-medium">Recent Trades</h4>
                                    <div className="mt-2 space-y-2">
                                      <div className="text-sm border-l-2 border-green-500 pl-2">Buy @ ₹{strategy.entryPrice} - 10:30 AM</div>
                                      {strategy.pnl !== 0 && (
                                        <div className="text-sm border-l-2 border-gray-300 pl-2">
                                          Current P&L: 
                                          <span className={strategy.pnl > 0 ? "text-green-500" : "text-red-500"}>
                                            {" "}{strategy.pnl > 0 ? "+" : ""}₹{strategy.pnl}
                                          </span>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </DialogContent>
                            </Dialog>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* Trade Monitoring UI */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Trade Monitoring</CardTitle>
                  <CardDescription>
                    Visual insights into your trading performance
                  </CardDescription>
                </div>
                <Tabs defaultValue="heatmap" className="w-[200px]">
                  <TabsList>
                    <TabsTrigger value="heatmap">Heatmap</TabsTrigger>
                    <TabsTrigger value="performance">Performance</TabsTrigger>
                    <TabsTrigger value="alerts">Alerts</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
            </CardHeader>
            <CardContent>
              <TabsContent value="heatmap" className="mt-0">
                <h3 className="text-lg font-medium mb-2">P&L Heatmap</h3>
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
              </TabsContent>
              
              <TabsContent value="performance" className="mt-0">
                <h3 className="text-lg font-medium mb-4">Strategy Performance</h3>
                <div className="h-60 bg-gray-100 rounded-md flex items-center justify-center">
                  <p className="text-muted-foreground">Cumulative P&L chart goes here</p>
                </div>
                <div className="grid grid-cols-2 gap-4 mt-4">
                  <Card>
                    <CardContent className="pt-6">
                      <div className="text-2xl font-bold text-green-500">+₹4,500</div>
                      <p className="text-sm text-muted-foreground">Today's P&L</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-6">
                      <div className="text-2xl font-bold">75%</div>
                      <p className="text-sm text-muted-foreground">Win Rate</p>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>
              
              <TabsContent value="alerts" className="mt-0">
                <h3 className="text-lg font-medium mb-4">System Alerts</h3>
                <div className="space-y-4">
                  <Alert className="bg-yellow-50 border-yellow-200">
                    <AlertTriangle className="h-4 w-4 text-yellow-500" />
                    <AlertTitle className="text-yellow-700">Slippage Warning</AlertTitle>
                    <AlertDescription className="text-yellow-700">
                      RSI Divergence strategy execution had 0.2% slippage on HDFCBANK entry.
                    </AlertDescription>
                  </Alert>
                  
                  <Alert className="bg-red-50 border-red-200">
                    <ShieldAlert className="h-4 w-4 text-red-500" />
                    <AlertTitle className="text-red-700">Risk Threshold Alert</AlertTitle>
                    <AlertDescription className="text-red-700">
                      RSI Divergence strategy approaching max loss threshold (75% reached).
                    </AlertDescription>
                  </Alert>
                  
                  <Alert className="bg-green-50 border-green-200">
                    <Info className="h-4 w-4 text-green-500" />
                    <AlertTitle className="text-green-700">Market Update</AlertTitle>
                    <AlertDescription className="text-green-700">
                      Market volatility decreasing, favorable conditions for mean reversion strategies.
                    </AlertDescription>
                  </Alert>
                </div>
              </TabsContent>
            </CardContent>
          </Card>

          {/* Manual Trade Execution Panel */}
          <Card>
            <CardHeader>
              <CardTitle>Manual Trade Execution</CardTitle>
              <CardDescription>
                Place individual orders directly to your broker
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="stock-search">Stock/Instrument</Label>
                    <div className="relative">
                      <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="stock-search"
                        placeholder="Search for stocks..."
                        className="pl-8"
                        value={selectedStock}
                        onChange={(e) => setSelectedStock(e.target.value)}
                      />
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <Label>Order Direction</Label>
                    <ToggleGroup type="single" value={selectedOrderDirection} onValueChange={(value) => {
                      if (value) setSelectedOrderDirection(value);
                    }} className="justify-start">
                      <ToggleGroupItem value="buy" className="flex-1">Buy</ToggleGroupItem>
                      <ToggleGroupItem value="sell" className="flex-1">Sell</ToggleGroupItem>
                    </ToggleGroup>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="order-type">Order Type</Label>
                    <Select 
                      value={orderType} 
                      onValueChange={setOrderType}
                    >
                      <SelectTrigger id="order-type">
                        <SelectValue placeholder="Select order type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="market">Market</SelectItem>
                        <SelectItem value="limit">Limit</SelectItem>
                        <SelectItem value="stoploss">Stop Loss</SelectItem>
                        <SelectItem value="bracket">Bracket Order</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="quantity">Quantity/Lots</Label>
                    <div className="flex">
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="rounded-r-none"
                        onClick={decreaseQuantity}
                        disabled={quantity <= 1}
                      >
                        <Minus className="h-4 w-4" />
                        <span className="sr-only">Decrease</span>
                      </Button>
                      <Input
                        id="quantity"
                        type="number"
                        value={quantity}
                        onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
                        className="rounded-none text-center"
                        min={1}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="rounded-l-none"
                        onClick={increaseQuantity}
                      >
                        <Plus className="h-4 w-4" />
                        <span className="sr-only">Increase</span>
                      </Button>
                    </div>
                  </div>
                  
                  <div className="flex items-center space-x-2 mb-4">
                    <Switch id="leverage" />
                    <Label htmlFor="leverage">Use Leverage</Label>
                  </div>
                  
                  <div className="space-y-2">
                    <Button 
                      className="w-full"
                      disabled={!selectedStock || !orderType}
                      onClick={() => setShowOrderConfirmation(true)}
                    >
                      Place Order
                    </Button>
                    
                    <Button 
                      variant="outline" 
                      className="w-full"
                      disabled={!selectedStock}
                    >
                      <ArrowRightLeft className="mr-2 h-4 w-4" />
                      Reverse Position
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

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
              <p className="text-sm">Mean Reversion • NIFTY50</p>
              <p className="text-sm text-muted-foreground">Buy 2 lots @ ₹18,500</p>
            </div>

            <div className="border-l-4 border-red-500 pl-4 py-2">
              <div className="flex justify-between">
                <span className="font-medium">SELL EXECUTED</span>
                <span className="text-sm text-muted-foreground">2 hours ago</span>
              </div>
              <p className="text-sm">Momentum Breakout • RELIANCE</p>
              <p className="text-sm text-muted-foreground">Sell 1 lot @ ₹2,420</p>
            </div>

            <div className="border-l-4 border-yellow-500 pl-4 py-2">
              <div className="flex justify-between">
                <span className="font-medium">WARNING</span>
                <span className="text-sm text-muted-foreground">3 hours ago</span>
              </div>
              <p className="text-sm">RSI Divergence • HDFCBANK</p>
              <p className="text-sm text-muted-foreground">Slippage of 0.2% detected on entry</p>
            </div>

            <div className="border-l-4 border-gray-400 pl-4 py-2">
              <div className="flex justify-between">
                <span className="font-medium">STRATEGY PAUSED</span>
                <span className="text-sm text-muted-foreground">Yesterday</span>
              </div>
              <p className="text-sm">Volatility Breakout • BANKNIFTY</p>
              <p className="text-sm text-muted-foreground">Manually paused by user</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Order Confirmation Dialog */}
      <Dialog open={showOrderConfirmation} onOpenChange={setShowOrderConfirmation}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Order</DialogTitle>
            <DialogDescription>
              Please review your order details before execution
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-2 items-center">
              <span className="text-sm font-medium">Direction:</span>
              <span className={selectedOrderDirection === "buy" ? "text-green-500" : "text-red-500"}>
                {selectedOrderDirection === "buy" ? "BUY" : "SELL"}
              </span>
              
              <span className="text-sm font-medium">Instrument:</span>
              <span>{selectedStock || "Not selected"}</span>
              
              <span className="text-sm font-medium">Quantity:</span>
              <span>{quantity} {quantity === 1 ? "lot" : "lots"}</span>
              
              <span className="text-sm font-medium">Order Type:</span>
              <span className="capitalize">{orderType}</span>
              
              <span className="text-sm font-medium">Estimated Value:</span>
              <span>₹{(quantity * 18500).toLocaleString()}</span>
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowOrderConfirmation(false)}>
              Cancel
            </Button>
            <Button onClick={placeManualOrder}>
              Confirm & Execute
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default LiveTradingModule;
