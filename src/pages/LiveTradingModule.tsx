
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
  Settings,
  BarChart3,
  Clock,
  DollarSign,
  Coins,
  Layers,
  GitBranch,
  Clock1,
  ChevronDown
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
import { Separator } from "@/components/ui/separator";
import { DashboardRecentBacktests } from "@/components/dashboard/RecentBacktests";

const LiveTradingModule = () => {
  // Update the page title
  useEffect(() => {
    document.title = "Live Trading | TradeFlow";
  }, []);

  // Top Bar States
  const [selectedStrategy, setSelectedStrategy] = useState<string>("algo");
  const [strategyStatus, setStrategyStatus] = useState<"active" | "pending" | "stopped">("active");
  const [selectedMarket, setSelectedMarket] = useState<string>("stocks");
  const [selectedTimeframe, setSelectedTimeframe] = useState<string>("5min");
  const [accountValue, setAccountValue] = useState<number>(125000);
  const [availableMargin, setAvailableMargin] = useState<number>(75000);
  const [usedMargin, setUsedMargin] = useState<number>(50000);
  const [leverageLevel, setLeverageLevel] = useState<number>(2);
  const [tradingMode, setTradingMode] = useState<"paper" | "live">("paper");

  // Broker connection states
  const [brokerConnected, setBrokerConnected] = useState<boolean>(false);
  const [connectionStatus, setConnectionStatus] = useState<"connected" | "pending" | "disconnected">("disconnected");
  const [selectedBroker, setSelectedBroker] = useState<string>("");
  const [apiKey, setApiKey] = useState<string>("");
  const [secretKey, setSecretKey] = useState<string>("");
  const [isTestingConnection, setIsTestingConnection] = useState<boolean>(false);
  const [autoReconnect, setAutoReconnect] = useState<boolean>(true);

  // Order Book States
  const [bidOrders, setBidOrders] = useState([
    { price: 18495, volume: 125 },
    { price: 18490, volume: 230 },
    { price: 18485, volume: 312 },
    { price: 18480, volume: 240 },
    { price: 18475, volume: 190 },
  ]);
  
  const [askOrders, setAskOrders] = useState([
    { price: 18505, volume: 110 },
    { price: 18510, volume: 185 },
    { price: 18515, volume: 230 },
    { price: 18520, volume: 300 },
    { price: 18525, volume: 275 },
  ]);

  // Position and Order States
  const [positions, setPositions] = useState([
    {
      id: 1, 
      instrument: "NIFTY50",
      quantity: 2,
      entryPrice: 18500,
      currentPrice: 18650,
      pnl: 3000,
      type: "LONG",
      stopLoss: 18400,
      takeProfit: 18750
    },
    {
      id: 2, 
      instrument: "RELIANCE",
      quantity: 1,
      entryPrice: 2420,
      currentPrice: 2400,
      pnl: -2000,
      type: "SHORT",
      stopLoss: 2450,
      takeProfit: 2350
    },
    {
      id: 3, 
      instrument: "HDFCBANK",
      quantity: 5,
      entryPrice: 1580,
      currentPrice: 1550,
      pnl: -1500,
      type: "LONG",
      stopLoss: 1535,
      takeProfit: 1625
    }
  ]);

  const [pendingOrders, setPendingOrders] = useState([
    {
      id: 1,
      instrument: "INFY",
      quantity: 3,
      price: 1525,
      type: "LIMIT_BUY"
    },
    {
      id: 2,
      instrument: "TCS",
      quantity: 2,
      price: 3400,
      type: "STOP_SELL"
    }
  ]);

  // Manual trading states
  const [selectedStock, setSelectedStock] = useState<string>("");
  const [orderType, setOrderType] = useState<string>("market");
  const [quantity, setQuantity] = useState<number>(1);
  const [selectedOrderDirection, setSelectedOrderDirection] = useState<string>("buy");
  const [showOrderConfirmation, setShowOrderConfirmation] = useState<boolean>(false);
  const [orderPrice, setOrderPrice] = useState<number>(18500);

  // Risk management states
  const [maxLossPerStrategy, setMaxLossPerStrategy] = useState<number>(1000);
  const [maxDailyDrawdown, setMaxDailyDrawdown] = useState<number>(5000);
  const [autoLiquidateOnBreach, setAutoLiquidateOnBreach] = useState<boolean>(true);

  // Trade logs state
  const [tradeLogs, setTradeLogs] = useState([
    {
      id: 1,
      timestamp: "10:32:45",
      action: "BUY",
      instrument: "NIFTY50",
      quantity: 2,
      price: 18500,
      executionTime: "142ms",
      status: "EXECUTED"
    },
    {
      id: 2,
      timestamp: "11:15:22",
      action: "SELL",
      instrument: "RELIANCE",
      quantity: 1,
      price: 2420,
      executionTime: "156ms",
      status: "EXECUTED"
    },
    {
      id: 3,
      timestamp: "13:45:11",
      action: "BUY",
      instrument: "HDFCBANK",
      quantity: 5,
      price: 1580,
      executionTime: "189ms",
      status: "EXECUTED"
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
    setStrategyStatus("stopped");
    
    toast({
      title: "Emergency Stop Activated",
      description: "All trading activities have been paused.",
      variant: "destructive",
    });
  };

  // Close position function
  const closePosition = (id: number) => {
    const position = positions.find(p => p.id === id);
    
    if (position) {
      setPositions(positions.filter(p => p.id !== id));
      
      toast({
        title: "Position Closed",
        description: `Closed ${position.instrument} position at market price.`,
        variant: "default",
      });
      
      // Add to trade log
      setTradeLogs([
        {
          id: tradeLogs.length + 1,
          timestamp: new Date().toLocaleTimeString('en-US', { hour12: false }),
          action: position.type === "LONG" ? "SELL" : "BUY",
          instrument: position.instrument,
          quantity: position.quantity,
          price: position.currentPrice,
          executionTime: `${Math.floor(Math.random() * 100) + 100}ms`,
          status: "EXECUTED"
        },
        ...tradeLogs
      ]);
    }
  };

  // Cancel order function
  const cancelOrder = (id: number) => {
    const order = pendingOrders.find(o => o.id === id);
    
    if (order) {
      setPendingOrders(pendingOrders.filter(o => o.id !== id));
      
      toast({
        title: "Order Cancelled",
        description: `Cancelled ${order.type} order for ${order.instrument}.`,
        variant: "default",
      });
    }
  };

  // Place manual order function
  const placeManualOrder = () => {
    setShowOrderConfirmation(false);
    
    // Add to positions
    if (selectedStock) {
      const newPosition = {
        id: positions.length + 1,
        instrument: selectedStock,
        quantity: quantity,
        entryPrice: orderPrice,
        currentPrice: orderPrice,
        pnl: 0,
        type: selectedOrderDirection.toUpperCase() === "BUY" ? "LONG" : "SHORT",
        stopLoss: selectedOrderDirection.toUpperCase() === "BUY" ? orderPrice * 0.98 : orderPrice * 1.02,
        takeProfit: selectedOrderDirection.toUpperCase() === "BUY" ? orderPrice * 1.03 : orderPrice * 0.97
      };
      
      setPositions([...positions, newPosition]);
      
      // Add to trade log
      setTradeLogs([
        {
          id: tradeLogs.length + 1,
          timestamp: new Date().toLocaleTimeString('en-US', { hour12: false }),
          action: selectedOrderDirection.toUpperCase(),
          instrument: selectedStock,
          quantity: quantity,
          price: orderPrice,
          executionTime: `${Math.floor(Math.random() * 100) + 100}ms`,
          status: "EXECUTED"
        },
        ...tradeLogs
      ]);
      
      toast({
        title: "Order Placed Successfully",
        description: `${selectedOrderDirection.toUpperCase()} ${quantity} ${selectedStock} at ${orderPrice} via ${orderType} order.`,
        variant: "default",
      });
    }
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
    <div className="container p-4 mx-auto">
      {/* Top Bar */}
      <div className="grid grid-cols-12 gap-3 mb-4">
        <div className="col-span-3 flex items-center gap-2">
          <div>
            <Select value={selectedStrategy} onValueChange={setSelectedStrategy}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Select Strategy" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="algo">Algorithmic</SelectItem>
                <SelectItem value="manual">Manual</SelectItem>
                <SelectItem value="hybrid">Hybrid</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Badge className={
            strategyStatus === "active" ? "bg-green-500" : 
            strategyStatus === "pending" ? "bg-yellow-500" : 
            "bg-red-500"
          }>
            {strategyStatus === "active" ? "Active" : 
             strategyStatus === "pending" ? "Pending" : 
             "Stopped"}
          </Badge>
        </div>
        
        <div className="col-span-3">
          <div className="flex gap-2">
            <Select value={selectedMarket} onValueChange={setSelectedMarket}>
              <SelectTrigger className="w-[120px]">
                <SelectValue placeholder="Market" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="stocks">Stocks</SelectItem>
                <SelectItem value="futures">Futures</SelectItem>
                <SelectItem value="options">Options</SelectItem>
                <SelectItem value="forex">Forex</SelectItem>
              </SelectContent>
            </Select>
            
            <Select value={selectedTimeframe} onValueChange={setSelectedTimeframe}>
              <SelectTrigger className="w-[100px]">
                <SelectValue placeholder="Timeframe" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1min">1 min</SelectItem>
                <SelectItem value="5min">5 min</SelectItem>
                <SelectItem value="15min">15 min</SelectItem>
                <SelectItem value="1hour">1 hour</SelectItem>
                <SelectItem value="1day">1 day</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        
        <div className="col-span-4 flex items-center border rounded-md px-3 py-1 gap-4">
          <div>
            <div className="text-xs text-muted-foreground">Account Value</div>
            <div className="font-semibold">₹{accountValue.toLocaleString()}</div>
          </div>
          <Separator orientation="vertical" className="h-8" />
          <div>
            <div className="text-xs text-muted-foreground">Available Margin</div>
            <div className="font-semibold">₹{availableMargin.toLocaleString()}</div>
          </div>
          <Separator orientation="vertical" className="h-8" />
          <div>
            <div className="text-xs text-muted-foreground">Leverage</div>
            <div className="font-semibold">{leverageLevel}x</div>
          </div>
        </div>
        
        <div className="col-span-2 flex items-center justify-end">
          <div className="flex gap-2 items-center">
            <div className="text-sm mr-1">Mode:</div>
            <ToggleGroup type="single" value={tradingMode} onValueChange={(value) => {
              if (value) setTradingMode(value as "paper" | "live");
            }}>
              <ToggleGroupItem value="paper" className="text-xs px-2 h-8">Paper</ToggleGroupItem>
              <ToggleGroupItem value="live" className="text-xs px-2 h-8">Live</ToggleGroupItem>
            </ToggleGroup>
          </div>
        </div>
      </div>
      
      {/* Main Content Area */}
      <div className="grid grid-cols-12 gap-4">
        {/* Left Sidebar */}
        <div className="col-span-3 space-y-4">
          {/* Open Positions */}
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-lg">Open Positions</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-1/3">Instrument</TableHead>
                    <TableHead className="w-1/4">Pos</TableHead>
                    <TableHead className="w-1/4">P&L</TableHead>
                    <TableHead className="w-1/6"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {positions.slice(0, 3).map(position => (
                    <TableRow key={position.id}>
                      <TableCell className="font-medium">
                        {position.instrument}
                        <div className="text-xs text-muted-foreground">
                          {position.quantity} lots
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={position.type === "LONG" ? "bg-green-500" : "bg-red-500"}>
                          {position.type}
                        </Badge>
                        <div className="text-xs mt-1">
                          @{position.entryPrice}
                        </div>
                      </TableCell>
                      <TableCell className={position.pnl > 0 ? "text-green-500" : "text-red-500"}>
                        {position.pnl > 0 ? "+" : ""}{position.pnl}
                        <div className="text-xs text-muted-foreground">
                          SL: {position.stopLoss} | TP: {position.takeProfit}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Button 
                          variant="outline" 
                          size="sm"
                          className="h-7 w-7 p-0"
                          onClick={() => closePosition(position.id)}
                        >
                          <Trash className="h-3 w-3" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
            <CardFooter className="border-t py-2">
              <Button variant="ghost" size="sm" className="text-xs h-7 w-full">
                View All Positions
              </Button>
            </CardFooter>
          </Card>
          
          {/* Pending Orders */}
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-lg">Pending Orders</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Instrument</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Price</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendingOrders.map(order => (
                    <TableRow key={order.id}>
                      <TableCell className="font-medium">
                        {order.instrument}
                        <div className="text-xs text-muted-foreground">
                          {order.quantity} lots
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={
                          order.type.includes("BUY") ? "border-green-500 text-green-500" : 
                          "border-red-500 text-red-500"
                        }>
                          {order.type.replace("_", " ")}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {order.price}
                      </TableCell>
                      <TableCell>
                        <Button 
                          variant="outline" 
                          size="sm"
                          className="h-7 w-7 p-0"
                          onClick={() => cancelOrder(order.id)}
                        >
                          <Trash className="h-3 w-3" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
            <CardFooter className="border-t py-2">
              <Button variant="ghost" size="sm" className="text-xs h-7 w-full">
                View All Orders
              </Button>
            </CardFooter>
          </Card>
          
          {/* Broker Connection UI */}
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-lg">Broker Connection</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex gap-2 items-center">
                  <div className={`h-3 w-3 rounded-full 
                    ${connectionStatus === 'connected' ? 'bg-green-500' : 
                      connectionStatus === 'pending' ? 'bg-yellow-500' : 'bg-red-500'}`}>
                  </div>
                  <span className="text-sm">
                    {connectionStatus === 'connected' 
                      ? 'Connected to ' + selectedBroker
                      : connectionStatus === 'pending' 
                        ? 'Connecting...' 
                        : 'Disconnected'}
                  </span>
                </div>
                
                <Select value={selectedBroker} onValueChange={setSelectedBroker}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select Broker" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="zerodha">Zerodha</SelectItem>
                    <SelectItem value="fyers">Fyers</SelectItem>
                    <SelectItem value="dhan">Dhan</SelectItem>
                    <SelectItem value="angelone">Angel One</SelectItem>
                    <SelectItem value="aliceblue">Alice Blue</SelectItem>
                  </SelectContent>
                </Select>
                
                <Button 
                  onClick={testBrokerConnection} 
                  disabled={!selectedBroker || isTestingConnection}
                  variant="outline"
                  className="w-full"
                >
                  {isTestingConnection ? (
                    <>
                      <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                      Testing
                    </>
                  ) : (
                    <>
                      <ExternalLink className="mr-2 h-4 w-4" />
                      Connect
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
        
        {/* Main Panel */}
        <div className="col-span-6 space-y-4">
          {/* Order Book */}
          <Card>
            <CardHeader className="py-3 flex flex-row items-center justify-between">
              <CardTitle className="text-lg">Order Book</CardTitle>
              <Select defaultValue="NIFTY50">
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Symbol" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="NIFTY50">NIFTY 50</SelectItem>
                  <SelectItem value="BANKNIFTY">BANK NIFTY</SelectItem>
                  <SelectItem value="RELIANCE">RELIANCE</SelectItem>
                  <SelectItem value="INFY">INFOSYS</SelectItem>
                </SelectContent>
              </Select>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <div className="text-sm font-medium text-green-500">Bids (Buy)</div>
                  <div className="space-y-1">
                    {bidOrders.map((order, index) => (
                      <div key={index} className="flex justify-between text-sm border-b last:border-0 pb-1 last:pb-0">
                        <span className="text-green-500 font-medium">{order.price}</span>
                        <span>{order.volume}</span>
                      </div>
                    ))}
                  </div>
                </div>
                
                <div className="space-y-2">
                  <div className="text-sm font-medium text-red-500">Asks (Sell)</div>
                  <div className="space-y-1">
                    {askOrders.map((order, index) => (
                      <div key={index} className="flex justify-between text-sm border-b last:border-0 pb-1 last:pb-0">
                        <span className="text-red-500 font-medium">{order.price}</span>
                        <span>{order.volume}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              
              <div className="mt-3 flex justify-between items-center p-2 bg-muted rounded-md">
                <div>
                  <span className="text-xs text-muted-foreground">Spread:</span>
                  <span className="text-sm ml-1">10 pts (0.05%)</span>
                </div>
                <div>
                  <Badge className="bg-green-500">Bullish</Badge>
                </div>
              </div>
            </CardContent>
          </Card>
          
          {/* Execution Panel */}
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-lg">Trade Execution</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label htmlFor="stock-search">Instrument</Label>
                    <div className="relative">
                      <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="stock-search"
                        placeholder="Search for symbols..."
                        className="pl-8"
                        value={selectedStock}
                        onChange={(e) => setSelectedStock(e.target.value)}
                      />
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <Label>Direction</Label>
                    <ToggleGroup type="single" value={selectedOrderDirection} onValueChange={(value) => {
                      if (value) setSelectedOrderDirection(value);
                    }} className="justify-start w-full">
                      <ToggleGroupItem value="buy" className="flex-1 bg-green-50 data-[state=on]:bg-green-500">Buy</ToggleGroupItem>
                      <ToggleGroupItem value="sell" className="flex-1 bg-red-50 data-[state=on]:bg-red-500">Sell</ToggleGroupItem>
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
                        <SelectItem value="oco">OCO (One Cancels Other)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label htmlFor="quantity">Quantity/Lots</Label>
                    <div className="flex">
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="rounded-r-none h-10 w-10"
                        onClick={decreaseQuantity}
                        disabled={quantity <= 1}
                      >
                        <Minus className="h-4 w-4" />
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
                        className="rounded-l-none h-10 w-10"
                        onClick={increaseQuantity}
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  
                  {orderType !== "market" && (
                    <div className="space-y-2">
                      <Label htmlFor="price">Price</Label>
                      <Input
                        id="price"
                        type="number"
                        value={orderPrice}
                        onChange={(e) => setOrderPrice(Number(e.target.value))}
                      />
                    </div>
                  )}
                  
                  <Button 
                    className={`w-full ${selectedOrderDirection === "buy" ? "bg-green-500 hover:bg-green-600" : "bg-red-500 hover:bg-red-600"}`}
                    disabled={!selectedStock || !orderType}
                    onClick={() => setShowOrderConfirmation(true)}
                  >
                    {selectedOrderDirection === "buy" ? "BUY" : "SELL"} {selectedStock || "INSTRUMENT"}
                  </Button>
                </div>
              </div>
              
              <div className="mt-4 p-3 bg-muted rounded-md">
                <div className="text-sm font-medium mb-2">Position Sizing</div>
                <div className="grid grid-cols-3 gap-2 text-sm">
                  <div>
                    <span className="text-muted-foreground">Risk:</span>
                    <span className="ml-1">2%</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Est. Value:</span>
                    <span className="ml-1">₹{(quantity * orderPrice).toLocaleString()}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Margin Req:</span>
                    <span className="ml-1">₹{Math.round((quantity * orderPrice) / leverageLevel).toLocaleString()}</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
          
          {/* Trade Logs */}
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-lg">Execution Logs</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Time</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Instrument</TableHead>
                    <TableHead>Qty</TableHead>
                    <TableHead>Price</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tradeLogs.slice(0, 3).map(log => (
                    <TableRow key={log.id}>
                      <TableCell className="text-xs">{log.timestamp}</TableCell>
                      <TableCell>
                        <Badge className={log.action === "BUY" ? "bg-green-500" : "bg-red-500"}>
                          {log.action}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-medium">{log.instrument}</TableCell>
                      <TableCell>{log.quantity}</TableCell>
                      <TableCell>{log.price}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <div className="h-2 w-2 rounded-full bg-green-500"></div>
                          <span className="text-xs">{log.status}</span>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
            <CardFooter className="border-t py-2">
              <Button variant="ghost" size="sm" className="text-xs h-7 w-full">
                View All Logs
              </Button>
            </CardFooter>
          </Card>
        </div>
        
        {/* Right Panel */}
        <div className="col-span-3 space-y-4">
          {/* Trade Modifications & Risk Management */}
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-lg">Risk Management</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
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
              </div>
            </CardContent>
          </Card>
          
          {/* Emergency Controls */}
          <Card className="border-red-200">
            <CardHeader className="py-3">
              <CardTitle className="text-lg">Emergency Controls</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <Button 
                  variant="destructive" 
                  className="w-full"
                  onClick={emergencyPauseAllTrades}
                >
                  <PowerOff className="mr-2 h-4 w-4" />
                  Emergency Stop All Trades
                </Button>
                
                <Button 
                  variant="outline" 
                  className="w-full border-red-200 text-red-500"
                  onClick={() => {
                    positions.forEach(p => closePosition(p.id));
                  }}
                >
                  <Trash className="mr-2 h-4 w-4" />
                  Close All Positions
                </Button>
                
                <Button 
                  variant="outline" 
                  className="w-full"
                >
                  <ShieldAlert className="mr-2 h-4 w-4" />
                  Freeze Account
                </Button>
              </div>
            </CardContent>
          </Card>
          
          {/* Recent Backtests */}
          <DashboardRecentBacktests />
        </div>
      </div>
      
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
              <span>₹{(quantity * orderPrice).toLocaleString()}</span>
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowOrderConfirmation(false)}>
              Cancel
            </Button>
            <Button 
              onClick={placeManualOrder}
              className={selectedOrderDirection === "buy" ? "bg-green-500 hover:bg-green-600" : "bg-red-500 hover:bg-red-600"}
            >
              Confirm & Execute
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default LiveTradingModule;
