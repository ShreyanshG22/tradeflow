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
  ChevronDown,
  Activity,
  ZapOff,
  BarChart,
  LineChart,
  Eye,
  Filter,
  ListFilter,
  Bell,
  BellRing,
  AlarmClock,
  Bookmark,
  Pencil
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
import { Calendar } from "@/components/ui/calendar";

const LiveTradingModule = () => {
  useEffect(() => {
    document.title = "Live Trading | TradeFlow";
  }, []);

  const [selectedStrategy, setSelectedStrategy] = useState<string>("algo");
  const [strategyStatus, setStrategyStatus] = useState<"active" | "pending" | "stopped">("active");
  const [selectedMarket, setSelectedMarket] = useState<string>("stocks");
  const [selectedTimeframe, setSelectedTimeframe] = useState<string>("5min");
  const [accountValue, setAccountValue] = useState<number>(125000);
  const [availableMargin, setAvailableMargin] = useState<number>(75000);
  const [usedMargin, setUsedMargin] = useState<number>(50000);
  const [leverageLevel, setLeverageLevel] = useState<number>(2);
  const [tradingMode, setTradingMode] = useState<"paper" | "live">("paper");
  const [sessionDuration, setSessionDuration] = useState<string>("02:45:18");
  const [autoHedgeEnabled, setAutoHedgeEnabled] = useState<boolean>(false);

  const [activeStrategies, setActiveStrategies] = useState([
    { 
      id: 1, 
      name: "Momentum Breakout", 
      status: "active", 
      pnl: 2500, 
      lastTrade: "10:45", 
      riskLevel: "medium" 
    },
    { 
      id: 2, 
      name: "Mean Reversion", 
      status: "paused", 
      pnl: -850, 
      lastTrade: "11:22", 
      riskLevel: "high" 
    },
    { 
      id: 3, 
      name: "Volatility Arbitrage", 
      status: "active", 
      pnl: 1200, 
      lastTrade: "09:58", 
      riskLevel: "low" 
    },
  ]);

  const [historicalStrategies, setHistoricalStrategies] = useState([
    { 
      id: 101, 
      name: "Gap & Go", 
      executionDate: "2023-06-15", 
      performance: "+4.2%",
      trades: 8
    },
    { 
      id: 102, 
      name: "Moving Average Cross", 
      executionDate: "2023-06-12", 
      performance: "-1.8%",
      trades: 12
    },
  ]);

  const [activeStrategyFilter, setActiveStrategyFilter] = useState<string>("all");

  const [brokerConnected, setBrokerConnected] = useState<boolean>(false);
  const [connectionStatus, setConnectionStatus] = useState<"connected" | "pending" | "disconnected">("disconnected");
  const [selectedBroker, setSelectedBroker] = useState<string>("");
  const [apiKey, setApiKey] = useState<string>("");
  const [secretKey, setSecretKey] = useState<string>("");
  const [isTestingConnection, setIsTestingConnection] = useState<boolean>(false);
  const [autoReconnect, setAutoReconnect] = useState<boolean>(true);

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
      takeProfit: 18750,
      executionSpeed: "142ms",
      slippage: "0.05%"
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
      takeProfit: 2350,
      executionSpeed: "156ms",
      slippage: "0.08%"
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
      takeProfit: 1625,
      executionSpeed: "189ms",
      slippage: "0.03%"
    }
  ]);

  const [pendingOrders, setPendingOrders] = useState([
    {
      id: 1,
      instrument: "INFY",
      quantity: 3,
      price: 1525,
      type: "LIMIT_BUY",
      status: "pending",
      strategy: "Momentum Breakout"
    },
    {
      id: 2,
      instrument: "TCS",
      quantity: 2,
      price: 3400,
      type: "STOP_SELL",
      status: "pending",
      strategy: "Mean Reversion"
    }
  ]);

  const [executionMetrics, setExecutionMetrics] = useState({
    realizedPnL: 2500,
    unrealizedPnL: -500,
    totalPnL: 2000,
    avgExecutionSpeed: "165ms",
    avgSlippage: "0.05%",
    fillRate: "98.5%",
    marginUsed: "40.0%",
    maxDrawdown: "2.8%",
    winRate: "62.5%"
  });

  const [selectedStock, setSelectedStock] = useState<string>("");
  const [orderType, setOrderType] = useState<string>("market");
  const [quantity, setQuantity] = useState<number>(1);
  const [selectedOrderDirection, setSelectedOrderDirection] = useState<string>("buy");
  const [showOrderConfirmation, setShowOrderConfirmation] = useState<boolean>(false);
  const [orderPrice, setOrderPrice] = useState<number>(18500);
  const [showKillSwitchConfirmation, setShowKillSwitchConfirmation] = useState<boolean>(false);

  const [maxLossPerStrategy, setMaxLossPerStrategy] = useState<number>(1000);
  const [maxDailyDrawdown, setMaxDailyDrawdown] = useState<number>(5000);
  const [autoLiquidateOnBreach, setAutoLiquidateOnBreach] = useState<boolean>(true);

  const [tradeLogs, setTradeLogs] = useState([
    {
      id: 1,
      timestamp: "10:32:45",
      action: "BUY",
      instrument: "NIFTY50",
      quantity: 2,
      price: 18500,
      executionTime: "142ms",
      status: "EXECUTED",
      strategy: "Momentum Breakout"
    },
    {
      id: 2,
      timestamp: "11:15:22",
      action: "SELL",
      instrument: "RELIANCE",
      quantity: 1,
      price: 2420,
      executionTime: "156ms",
      status: "EXECUTED",
      strategy: "Mean Reversion"
    },
    {
      id: 3,
      timestamp: "13:45:11",
      action: "BUY",
      instrument: "HDFCBANK",
      quantity: 5,
      price: 1580,
      executionTime: "189ms",
      status: "EXECUTED",
      strategy: "Momentum Breakout"
    }
  ]);

  const [recentMarketTrades, setRecentMarketTrades] = useState([
    { time: "14:02:05", price: 18505, volume: 100, side: "buy" },
    { time: "14:02:01", price: 18503, volume: 75, side: "buy" },
    { time: "14:01:58", price: 18500, volume: 150, side: "sell" },
    { time: "14:01:55", price: 18498, volume: 200, side: "sell" },
    { time: "14:01:50", price: 18495, volume: 120, side: "buy" },
  ]);

  const [alerts, setAlerts] = useState([
    { id: 1, type: "warning", message: "NIFTY50 approaching stop loss level", time: "14:01:30" },
    { id: 2, type: "info", message: "Order executed: Buy 5 HDFCBANK at 1580", time: "13:45:11" },
    { id: 3, type: "error", message: "Execution failed: Sell 2 INFY at 1520", time: "13:30:22" },
  ]);

  const testBrokerConnection = () => {
    setIsTestingConnection(true);
    setConnectionStatus("pending");
    
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

  const toggleStrategyStatus = (id: number) => {
    setActiveStrategies(activeStrategies.map(strategy => {
      if (strategy.id === id) {
        const newStatus = strategy.status === "active" ? "paused" : "active";
        
        toast({
          title: `Strategy ${newStatus === "active" ? "Activated" : "Paused"}`,
          description: `${strategy.name} has been ${newStatus === "active" ? "activated" : "paused"}.`,
          variant: "default",
        });
        
        return { ...strategy, status: newStatus };
      }
      return strategy;
    }));
  };

  const emergencyPauseAllTrades = () => {
    setShowKillSwitchConfirmation(false);
    setStrategyStatus("stopped");
    
    setActiveStrategies(activeStrategies.map(strategy => ({ ...strategy, status: "paused" })));
    
    toast({
      title: "Emergency Stop Activated",
      description: "All trading activities have been paused.",
      variant: "destructive",
    });
  };

  const closePosition = (id: number) => {
    const position = positions.find(p => p.id === id);
    
    if (position) {
      setPositions(positions.filter(p => p.id !== id));
      
      toast({
        title: "Position Closed",
        description: `Closed ${position.instrument} position at market price.`,
        variant: "default",
      });
      
      setTradeLogs([
        {
          id: tradeLogs.length + 1,
          timestamp: new Date().toLocaleTimeString('en-US', { hour12: false }),
          action: position.type === "LONG" ? "SELL" : "BUY",
          instrument: position.instrument,
          quantity: position.quantity,
          price: position.currentPrice,
          executionTime: `${Math.floor(Math.random() * 100) + 100}ms`,
          status: "EXECUTED",
          strategy: selectedStrategy
        },
        ...tradeLogs
      ]);
    }
  };

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

  const placeManualOrder = () => {
    setShowOrderConfirmation(false);
    
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
        takeProfit: selectedOrderDirection.toUpperCase() === "BUY" ? orderPrice * 1.03 : orderPrice * 0.97,
        executionSpeed: `${Math.floor(Math.random() * 100) + 100}ms`,
        slippage: "0.04%"
      };
      
      setPositions([...positions, newPosition]);
      
      setTradeLogs([
        {
          id: tradeLogs.length + 1,
          timestamp: new Date().toLocaleTimeString('en-US', { hour12: false }),
          action: selectedOrderDirection.toUpperCase(),
          instrument: selectedStock,
          quantity: quantity,
          price: orderPrice,
          executionTime: `${Math.floor(Math.random() * 100) + 100}ms`,
          status: "EXECUTED",
          strategy: selectedStrategy
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

  const increaseQuantity = () => {
    setQuantity(prev => prev + 1);
  };

  const decreaseQuantity = () => {
    if (quantity > 1) {
      setQuantity(prev => prev - 1);
    }
  };

  const filterStrategies = (filter: string) => {
    setActiveStrategyFilter(filter);
  };

  return (
    <div className="container p-4 mx-auto">
      <div className="grid grid-cols-12 gap-3 mb-4">
        <div className="col-span-3 flex items-center gap-2">
          <div>
            <Select value={selectedStrategy} onValueChange={setSelectedStrategy}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Select Strategy" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="algo">Algorithmic</SelectItem>
                <SelectItem value="momentum">Momentum Breakout</SelectItem>
                <SelectItem value="mean-reversion">Mean Reversion</SelectItem>
                <SelectItem value="volatility">Volatility Arbitrage</SelectItem>
                <SelectItem value="manual">Manual</SelectItem>
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
          <div className="flex gap-2 items-center">
            <ToggleGroup type="single" value={tradingMode} onValueChange={(value) => {
              if (value) setTradingMode(value as "paper" | "live");
            }}>
              <ToggleGroupItem value="paper" className="text-xs px-3 h-8">Paper Trading</ToggleGroupItem>
              <ToggleGroupItem value="live" className="text-xs px-3 h-8">Live Trading</ToggleGroupItem>
            </ToggleGroup>
            
            <div className="flex items-center gap-1 text-sm ml-3">
              <AlarmClock className="h-4 w-4 text-muted-foreground" />
              <span>{sessionDuration}</span>
            </div>
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
            <Button 
              variant="destructive" 
              size="sm"
              className="h-8"
              onClick={() => setShowKillSwitchConfirmation(true)}
            >
              <ZapOff className="h-4 w-4 mr-1" />
              Kill Switch
            </Button>
            
            <div className="flex items-center ml-2">
              <Switch 
                id="auto-hedge"
                checked={autoHedgeEnabled}
                onCheckedChange={setAutoHedgeEnabled}
                className="scale-75"
              />
              <Label htmlFor="auto-hedge" className="text-xs ml-1">Auto-Hedge</Label>
            </div>
          </div>
        </div>
      </div>
      
      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-3 space-y-4">
          <Card>
            <CardHeader className="py-3">
              <div className="flex justify-between items-center">
                <CardTitle className="text-lg">Active Strategies</CardTitle>
                <div className="flex gap-1">
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="h-7 w-7 p-0"
                    onClick={() => filterStrategies("all")}
                  >
                    <ListFilter className="h-4 w-4" />
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="h-7 w-7 p-0"
                    onClick={() => filterStrategies("profitable")}
                  >
                    <TrendingUp className="h-4 w-4" />
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="h-7 w-7 p-0"
                    onClick={() => filterStrategies("losing")}
                  >
                    <TrendingDown className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="space-y-1">
                {activeStrategies.map(strategy => (
                  <div key={strategy.id} className="flex items-center justify-between p-2 border-b hover:bg-muted/30 cursor-pointer">
                    <div className="flex flex-col">
                      <div className="flex items-center gap-2">
                        <div className={`h-2 w-2 rounded-full ${
                          strategy.status === "active" ? "bg-green-500" : 
                          strategy.status === "paused" ? "bg-yellow-500" : 
                          "bg-red-500"
                        }`}></div>
                        <span className="font-medium">{strategy.name}</span>
                      </div>
                      <div className="flex items-center text-xs text-muted-foreground mt-1">
                        <Clock className="h-3 w-3 mr-1" />
                        <span>Last trade: {strategy.lastTrade}</span>
                        <Separator orientation="vertical" className="h-3 mx-2" />
                        <Shield className="h-3 w-3 mr-1" />
                        <span>Risk: {strategy.riskLevel}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-medium ${strategy.pnl >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                        {strategy.pnl >= 0 ? '+' : ''}{strategy.pnl}
                      </span>
                      <Button 
                        variant="ghost"
                        size="sm" 
                        className="h-6 w-6 p-0"
                        onClick={() => toggleStrategyStatus(strategy.id)}
                      >
                        {strategy.status === "active" ? 
                          <Pause className="h-3 w-3" /> : 
                          <Play className="h-3 w-3" />
                        }
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
            <CardFooter className="border-t py-2">
              <Button variant="ghost" size="sm" className="text-xs h-7 w-full">
                View All Strategies
              </Button>
            </CardFooter>
          </Card>
          
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-lg">Historical Strategies</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="space-y-1">
                {historicalStrategies.map(strategy => (
                  <div key={strategy.id} className="flex items-center justify-between p-2 border-b hover:bg-muted/30 cursor-pointer">
                    <div className="flex flex-col">
                      <div className="flex items-center gap-2">
                        <Bookmark className="h-3 w-3" />
                        <span className="font-medium">{strategy.name}</span>
                      </div>
                      <div className="flex items-center text-xs text-muted-foreground mt-1">
                        <Calendar className="h-3 w-3 mr-1" />
                        <span>{strategy.executionDate}</span>
                        <Separator orientation="vertical" className="h-3 mx-2" />
                        <BarChart className="h-3 w-3 mr-1" />
                        <span>{strategy.trades} trades</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-medium ${strategy.performance.startsWith('+') ? 'text-green-500' : 'text-red-500'}`}>
                        {strategy.performance}
                      </span>
                      <Button 
                        variant="ghost"
                        size="sm" 
                        className="h-6 w-6 p-0"
                      >
                        <Play className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
            <CardFooter className="border-t py-2">
              <Button variant="ghost" size="sm" className="text-xs h-7 w-full">
                View All Historical Strategies
              </Button>
            </CardFooter>
          </Card>
          
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
        
        <div className="col-span-6 space-y-4">
          <Card>
            <CardHeader className="py-3">
              <div className="flex justify-between items-center">
                <CardTitle className="text-lg">Strategy Execution Metrics</CardTitle>
                <Button variant="outline" size="sm" className="h-8">
                  <RefreshCw className="h-3 w-3 mr-1" />
                  Refresh
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-4 gap-4 mb-4">
                <div className="flex flex-col p-3 bg-muted rounded-lg">
                  <span className="text-sm text-muted-foreground">Realized P&L</span>
                  <span className={`text-lg font-bold ${executionMetrics.realizedPnL >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                    {executionMetrics.realizedPnL >= 0 ? '+' : ''}₹{executionMetrics.realizedPnL.toLocaleString()}
                  </span>
                </div>
                <div className="flex flex-col p-3 bg-muted rounded-lg">
                  <span className="text-sm text-muted-foreground">Unrealized P&L</span>
                  <span className={`text-lg font-bold ${executionMetrics.unrealizedPnL >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                    {executionMetrics.unrealizedPnL >= 0 ? '+' : ''}₹{executionMetrics.unrealizedPnL.toLocaleString()}
                  </span>
                </div>
                <div className="flex flex-col p-3 bg-muted rounded-lg">
                  <span className="text-sm text-muted-foreground">Total P&L</span>
                  <span className={`text-lg font-bold ${executionMetrics.totalPnL >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                    {executionMetrics.totalPnL >= 0 ? '+' : ''}₹{executionMetrics.totalPnL.toLocaleString()}
                  </span>
                </div>
                <div className="flex flex-col p-3 bg-muted rounded-lg">
                  <span className="text-sm text-muted-foreground">Win Rate</span>
                  <span className={`text-lg font-bold ${parseFloat(executionMetrics.winRate) > 50 ? 'text-green-500' : 'text-red-500'}`}>
                    {executionMetrics.winRate}
                  </span>
                </div>
              </div>
              
              <div className="grid grid-cols-3 gap-4">
                <div className="flex items-center p-3 bg-muted rounded-lg">
                  <Activity className="h-5 w-5 mr-2 text-muted-foreground" />
                  <div className="flex flex-col">
                    <span className="text-xs text-muted-foreground">Execution Speed</span>
                    <span className="text-sm font-medium">{executionMetrics.avgExecutionSpeed}</span>
                  </div>
                </div>
                <div className="flex items-center p-3 bg-muted rounded-lg">
                  <ArrowRightLeft className="h-5 w-5 mr-2 text-muted-foreground" />
                  <div className="flex flex-col">
                    <span className="text-xs text-muted-foreground">Avg. Slippage</span>
                    <span className="text-sm font-medium">{executionMetrics.avgSlippage}</span>
                  </div>
                </div>
                <div className="flex items-center p-3 bg-muted rounded-lg">
                  <Layers className="h-5 w-5 mr-2 text-muted-foreground" />
                  <div className="flex flex-col">
                    <span className="text-xs text-muted-foreground">Fill Rate</span>
                    <span className="text-sm font-medium">{executionMetrics.fillRate}</span>
                  </div>
                </div>
                <div className="flex items-center p-3 bg-muted rounded-lg">
                  <Coins className="h-5 w-5 mr-2 text-muted-foreground" />
                  <div className="flex flex-col">
                    <span className="text-xs text-muted-foreground">Margin Used</span>
                    <span className="text-sm font-medium">{executionMetrics.marginUsed}</span>
                  </div>
                </div>
                <div className="flex items-center p-3 bg-muted rounded-lg">
                  <TrendingDown className="h-5 w-5 mr-2 text-muted-foreground" />
                  <div className="flex flex-col">
                    <span className="text-xs text-muted-foreground">Max Drawdown</span>
                    <span className="text-sm font-medium">{executionMetrics.maxDrawdown}</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-lg">Open Positions</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Instrument</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Entry</TableHead>
                    <TableHead>Current</TableHead>
                    <TableHead>P&L</TableHead>
                    <TableHead>SL/TP</TableHead>
                    <TableHead>Execution</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {positions.map(position => (
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
                      </TableCell>
                      <TableCell>{position.entryPrice}</TableCell>
                      <TableCell>{position.currentPrice}</TableCell>
                      <TableCell className={position.pnl > 0 ? "text-green-500" : "text-red-500"}>
                        {position.pnl > 0 ? "+" : ""}{position.pnl}
                      </TableCell>
                      <TableCell className="text-xs">
                        <span className="text-red-500">SL: {position.stopLoss}</span>
                        <span className="mx-1">|</span>
                        <span className="text-green-500">TP: {position.takeProfit}</span>
                      </TableCell>
                      <TableCell>
                        <div className="text-xs">
                          <span className="text-muted-foreground">Speed: </span>
                          <span>{position.executionSpeed}</span>
                        </div>
                        <div className="text-xs">
                          <span className="text-muted-foreground">Slip: </span>
                          <span>{position.slippage}</span>
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
          </Card>
          
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-lg">Pending Orders</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Instrument</TableHead>
                    <TableHead>Strategy</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Price</TableHead>
                    <TableHead>Status</TableHead>
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
                      <TableCell className="text-sm">
                        {order.strategy}
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
                        <div className="flex items-center gap-1">
                          <div className={`h-2 w-2 rounded-full ${
                            order.status === 'pending' ? 'bg-yellow-500' : 
                            order.status === 'executed' ? 'bg-green-500' : 
                            'bg-red-500'
                          }`}></div>
                          <span className="text-xs capitalize">{order.status}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex">
                          <Button 
                            variant="outline" 
                            size="sm"
                            className="h-7 w-7 p-0 mr-1"
                          >
                            <Pencil className="h-3 w-3" />
                          </Button>
                          <Button 
                            variant="outline" 
                            size="sm"
                            className="h-7 w-7 p-0"
                            onClick={() => cancelOrder(order.id)}
                          >
                            <Trash className="h-3 w-3" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-lg">Manual Order Execution</CardTitle>
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
        </div>
        
        <div className="col-span-3 space-y-4">
          <Card>
            <CardHeader className="py-3">
              <div className="flex justify-between items-center">
                <CardTitle className="text-lg">Market Data</CardTitle>
                <Select defaultValue="NIFTY50">
                  <SelectTrigger className="w-[120px]">
                    <SelectValue placeholder="Symbol" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NIFTY50">NIFTY 50</SelectItem>
                    <SelectItem value="BANKNIFTY">BANK NIFTY</SelectItem>
                    <SelectItem value="RELIANCE">RELIANCE</SelectItem>
                    <SelectItem value="INFY">INFOSYS</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 mb-4">
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
              
              <div className="mt-3 mb-4">
                <div className="text-sm font-medium mb-2">Recent Trades</div>
                <div className="space-y-1 max-h-[120px] overflow-y-auto pr-1">
                  {recentMarketTrades.map((trade, index) => (
                    <div key={index} className="flex justify-between text-xs border-b pb-1">
                      <span className="text-muted-foreground">{trade.time}</span>
                      <span className={trade.side === 'buy' ? 'text-green-500' : 'text-red-500'}>
                        {trade.price}
                      </span>
                      <span>{trade.volume}</span>
                    </div>
                  ))}
                </div>
              </div>
              
              <div className="p-2 bg-muted rounded-md flex justify-between items-center">
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
          
          <Card>
            <CardHeader className="py-3">
              <div className="flex justify-between items-center">
                <CardTitle className="text-lg">Alerts Feed</CardTitle>
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                  <BellRing className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {alerts.map(alert => (
                  <Alert key={alert.id} variant={
                    alert.type === "warning" ? "default" : 
                    alert.type === "error" ? "destructive" : 
                    "default"
                  } className="py-2">
                    <div className="flex items-center">
                      {alert.type === "warning" && <AlertTriangle className="h-4 w-4 mr-2" />}
                      {alert.type === "error" && <AlertTriangle className="h-4 w-4 mr-2" />}
                      {alert.type === "info" && <Info className="h-4 w-4 mr-2" />}
                      <div className="flex flex-col">
                        <span className="text-sm">{alert.message}</span>
                        <span className="text-xs text-muted-foreground">{alert.time}</span>
                      </div>
                    </div>
                  </Alert>
                ))}
              </div>
            </CardContent>
            <CardFooter className="border-t py-2">
              <Button variant="ghost" size="sm" className="text-xs h-7 w-full">
                View All Alerts
              </Button>
            </CardFooter>
          </Card>
          
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
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tradeLogs.slice(0, 5).map(log => (
                    <TableRow key={log.id}>
                      <TableCell className="text-xs">{log.timestamp}</TableCell>
                      <TableCell>
                        <Badge className={log.action === "BUY" ? "bg-green-500" : "bg-red-500"}>
                          {log.action}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-medium text-xs">{log.instrument}</TableCell>
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
      </div>
      
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

      <Dialog open={showKillSwitchConfirmation} onOpenChange={setShowKillSwitchConfirmation}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-red-500">Emergency Kill Switch</DialogTitle>
            <DialogDescription>
              Are you sure you want to stop all trading activity and close all positions? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4">
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Warning</AlertTitle>
              <AlertDescription>
                This will immediately:
                <ul className="list-disc pl-5 mt-2 space-y-1">
                  <li>Pause all active strategies</li>
                  <li>Cancel all pending orders</li>
                  <li>Emergency close all open positions at market price</li>
                </ul>
              </AlertDescription>
            </Alert>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowKillSwitchConfirmation(false)}>
              Cancel
            </Button>
            <Button 
              variant="destructive"
              onClick={emergencyPauseAllTrades}
            >
              <ZapOff className="h-4 w-4 mr-2" />
              Confirm Kill Switch
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default LiveTradingModule;
