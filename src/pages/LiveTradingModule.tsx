
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
  Pencil,
  Calendar as CalendarIcon,
  SwitchCamera,
  CheckCircle2
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
import { HeatmapChart } from "@/components/backtesting/charts/HeatmapChart";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const LiveTradingModule = () => {
  useEffect(() => {
    document.title = "Live Trading | TradeFlow";
  }, []);

  // Strategy selection state
  const [strategies, setStrategies] = useState([
    { id: "momentum", name: "Momentum Breakout" },
    { id: "mean-reversion", name: "Mean Reversion" },
    { id: "volatility", name: "Volatility Arbitrage" },
    { id: "gap-go", name: "Gap & Go" },
    { id: "moving-avg", name: "Moving Average Cross" }
  ]);
  const [selectedStrategy, setSelectedStrategy] = useState<string>("");
  const [showStrategySelector, setShowStrategySelector] = useState(true);
  const [showStrategyPopover, setShowStrategyPopover] = useState(false);

  // Strategy execution states
  const [strategyStatus, setStrategyStatus] = useState<"active" | "pending" | "stopped">("stopped");
  const [selectedMarket, setSelectedMarket] = useState<string>("stocks");
  const [selectedTimeframe, setSelectedTimeframe] = useState<string>("5min");
  const [accountValue, setAccountValue] = useState<number>(125000);
  const [availableMargin, setAvailableMargin] = useState<number>(75000);
  const [usedMargin, setUsedMargin] = useState<number>(50000);
  const [leverageLevel, setLeverageLevel] = useState<number>(2);
  const [tradingMode, setTradingMode] = useState<"paper" | "live">("paper");
  const [sessionDuration, setSessionDuration] = useState<string>("00:00:00");
  const [autoHedgeEnabled, setAutoHedgeEnabled] = useState<boolean>(false);
  const [sessionStartTime, setSessionStartTime] = useState<number | null>(null);
  const [timerInterval, setTimerInterval] = useState<number | null>(null);

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
      slippage: "0.05%",
      strategy: "Momentum Breakout"
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
      slippage: "0.08%",
      strategy: "Mean Reversion"
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
      slippage: "0.03%",
      strategy: "Momentum Breakout"
    },
    {
      id: 4, 
      instrument: "INFY",
      quantity: 3,
      entryPrice: 1720,
      currentPrice: 1755,
      pnl: 1050,
      type: "LONG",
      stopLoss: 1680,
      takeProfit: 1780,
      executionSpeed: "163ms",
      slippage: "0.04%",
      strategy: "Moving Average Cross"
    },
    {
      id: 5, 
      instrument: "TCS",
      quantity: 2,
      entryPrice: 3680,
      currentPrice: 3720,
      pnl: 800,
      type: "LONG",
      stopLoss: 3640,
      takeProfit: 3800,
      executionSpeed: "148ms",
      slippage: "0.02%",
      strategy: "Gap & Go"
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
    },
    {
      id: 3,
      instrument: "BAJFINANCE",
      quantity: 5,
      price: 7150,
      type: "LIMIT_BUY",
      status: "pending",
      strategy: "Gap & Go"
    },
    {
      id: 4,
      instrument: "ICICIBANK",
      quantity: 10,
      price: 950,
      type: "LIMIT_SELL",
      status: "pending",
      strategy: "Volatility Arbitrage"
    },
    {
      id: 5,
      instrument: "SBIN",
      quantity: 8,
      price: 620,
      type: "STOP_BUY",
      status: "pending",
      strategy: "Moving Average Cross"
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
    },
    {
      id: 4,
      timestamp: "14:12:35",
      action: "BUY",
      instrument: "INFY",
      quantity: 3,
      price: 1720,
      executionTime: "163ms",
      status: "EXECUTED",
      strategy: "Moving Average Cross"
    },
    {
      id: 5,
      timestamp: "14:25:18",
      action: "BUY",
      instrument: "TCS",
      quantity: 2,
      price: 3680,
      executionTime: "148ms",
      status: "EXECUTED",
      strategy: "Gap & Go"
    },
    {
      id: 6,
      timestamp: "14:38:50",
      action: "SL_MODIFY",
      instrument: "NIFTY50",
      quantity: 2,
      price: 18400,
      executionTime: "135ms",
      status: "EXECUTED",
      strategy: "Momentum Breakout"
    },
    {
      id: 7,
      timestamp: "14:42:15",
      action: "LIMIT_PLACED",
      instrument: "BAJFINANCE",
      quantity: 5,
      price: 7150,
      executionTime: "-",
      status: "PENDING",
      strategy: "Gap & Go"
    },
    {
      id: 8,
      timestamp: "14:55:30",
      action: "TP_MODIFY",
      instrument: "TCS",
      quantity: 2,
      price: 3800,
      executionTime: "152ms",
      status: "EXECUTED",
      strategy: "Gap & Go"
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
    { id: 4, type: "success", message: "Take profit hit: Sell 2 SBIN at 640", time: "14:10:18" },
    { id: 5, type: "warning", message: "High volatility detected in RELIANCE", time: "14:20:36" },
    { id: 6, type: "info", message: "Trailing stop adjusted for HDFCBANK", time: "14:35:42" },
    { id: 7, type: "error", message: "Margin insufficient for new order", time: "14:42:15" },
    { id: 8, type: "success", message: "Strategy profit target achieved", time: "14:55:10" },
  ]);

  const [brokerConnected, setBrokerConnected] = useState<boolean>(false);
  const [connectionStatus, setConnectionStatus] = useState<"connected" | "pending" | "disconnected">("disconnected");
  const [selectedBroker, setSelectedBroker] = useState<string>("");
  const [apiKey, setApiKey] = useState<string>("");
  const [secretKey, setSecretKey] = useState<string>("");
  const [isTestingConnection, setIsTestingConnection] = useState<boolean>(false);
  const [autoReconnect, setAutoReconnect] = useState<boolean>(true);

  // Performance data for the chart
  const [performanceData, setPerformanceData] = useState([
    { time: '09:30', value: 0 },
    { time: '10:00', value: 320 },
    { time: '10:30', value: 580 },
    { time: '11:00', value: 420 },
    { time: '11:30', value: 750 },
    { time: '12:00', value: 680 },
    { time: '12:30', value: 920 },
    { time: '13:00', value: 1080 },
    { time: '13:30', value: 850 },
    { time: '14:00', value: 1250 },
    { time: '14:30', value: 1500 },
    { time: '15:00', value: 1350 },
    { time: '15:30', value: 1800 },
  ]);

  // Initialize strategy selection if URL has a strategy parameter
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const strategyId = params.get('strategy');
    
    if (strategyId) {
      const strategy = strategies.find(s => s.id === strategyId);
      if (strategy) {
        setSelectedStrategy(strategy.id);
        setShowStrategySelector(false);
      }
    }
  }, []);
  
  // Update document title based on selected strategy
  useEffect(() => {
    if (selectedStrategy) {
      const strategy = strategies.find(s => s.id === selectedStrategy);
      if (strategy) {
        document.title = `Live Trading - ${strategy.name} | TradeFlow`;
      }
    } else {
      document.title = "Live Trading | TradeFlow";
    }
  }, [selectedStrategy]);

  // Handle session timer
  useEffect(() => {
    if (strategyStatus === "active" && !sessionStartTime) {
      setSessionStartTime(Date.now());
      
      const interval = window.setInterval(() => {
        if (sessionStartTime) {
          const elapsed = Date.now() - sessionStartTime;
          const hours = Math.floor(elapsed / 3600000).toString().padStart(2, '0');
          const minutes = Math.floor((elapsed % 3600000) / 60000).toString().padStart(2, '0');
          const seconds = Math.floor((elapsed % 60000) / 1000).toString().padStart(2, '0');
          setSessionDuration(`${hours}:${minutes}:${seconds}`);
        }
      }, 1000);
      
      setTimerInterval(interval);
    } else if (strategyStatus !== "active" && timerInterval) {
      clearInterval(timerInterval);
      setTimerInterval(null);
      
      if (strategyStatus === "stopped") {
        setSessionStartTime(null);
        setSessionDuration("00:00:00");
      }
    }
    
    return () => {
      if (timerInterval) {
        clearInterval(timerInterval);
      }
    };
  }, [strategyStatus, sessionStartTime]);

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

  const switchStrategy = (strategyId: string) => {
    setSelectedStrategy(strategyId);
    setShowStrategyPopover(false);
    
    // Update URL without refreshing page
    const url = new URL(window.location.href);
    url.searchParams.set('strategy', strategyId);
    window.history.pushState({}, '', url);
    
    toast({
      title: "Strategy Switched",
      description: `Now monitoring ${strategies.find(s => s.id === strategyId)?.name}`,
      variant: "default",
    });
  };

  const startStrategy = () => {
    if (!selectedStrategy) {
      toast({
        title: "No Strategy Selected",
        description: "Please select a strategy to start trading.",
        variant: "destructive",
      });
      return;
    }
    
    if (!brokerConnected) {
      toast({
        title: "Broker Not Connected",
        description: "Please connect to a broker before starting the strategy.",
        variant: "destructive",
      });
      return;
    }
    
    setStrategyStatus("active");
    
    toast({
      title: "Strategy Started",
      description: `${strategies.find(s => s.id === selectedStrategy)?.name} strategy is now active.`,
      variant: "default",
    });
  };

  const pauseStrategy = () => {
    setStrategyStatus("pending");
    
    toast({
      title: "Strategy Paused",
      description: "No new trades will be taken, but existing positions remain open.",
      variant: "default",
    });
  };

  const stopStrategy = () => {
    setStrategyStatus("stopped");
    
    toast({
      title: "Strategy Stopped",
      description: "All orders have been canceled. You can close positions manually.",
      variant: "default",
    });
  };

  const emergencyPauseAllTrades = () => {
    setShowKillSwitchConfirmation(false);
    setStrategyStatus("stopped");
    
    toast({
      title: "Emergency Stop Activated",
      description: "All trading activities have been paused and pending orders canceled.",
      variant: "destructive",
    });
    
    // Cancel all pending orders
    setPendingOrders([]);
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
        slippage: "0.04%",
        strategy: strategies.find(s => s.id === selectedStrategy)?.name || ""
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
          strategy: strategies.find(s => s.id === selectedStrategy)?.name || ""
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

  // Get alert color based on type
  const getAlertColor = (type: string) => {
    switch (type) {
      case "error":
        return "bg-red-100 border-red-500 text-red-800";
      case "warning":
        return "bg-amber-100 border-amber-500 text-amber-800";
      case "success":
        return "bg-green-100 border-green-500 text-green-800";
      case "info":
      default:
        return "bg-blue-100 border-blue-500 text-blue-800";
    }
  };

  // Get alert icon based on type
  const getAlertIcon = (type: string) => {
    switch (type) {
      case "error":
        return <AlertTriangle className="h-4 w-4 text-red-500" />;
      case "warning":
        return <AlertTriangle className="h-4 w-4 text-amber-500" />;
      case "success":
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case "info":
      default:
        return <Info className="h-4 w-4 text-blue-500" />;
    }
  };

  // Strategy selector dialog
  if (showStrategySelector) {
    return (
      <div className="container flex items-center justify-center h-screen">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Select a Strategy to Trade</CardTitle>
            <CardDescription>Choose a trading strategy to monitor and manage</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1">
              {strategies.map(strategy => (
                <div 
                  key={strategy.id}
                  className="flex items-center justify-between p-3 rounded-md border hover:bg-muted cursor-pointer"
                  onClick={() => {
                    setSelectedStrategy(strategy.id);
                    setShowStrategySelector(false);
                    // Update URL without refreshing page
                    const url = new URL(window.location.href);
                    url.searchParams.set('strategy', strategy.id);
                    window.history.pushState({}, '', url);
                  }}
                >
                  <div className="flex items-center gap-2">
                    <Play className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">{strategy.name}</span>
                  </div>
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                </div>
              ))}
            </div>
          </CardContent>
          <CardFooter>
            <Button variant="outline" className="w-full" onClick={() => window.history.back()}>
              Back to Dashboard
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  // Main trading UI when a strategy is selected
  return (
    <div className="container p-4 mx-auto">
      <div className="grid grid-cols-12 gap-3 mb-4">
        <div className="col-span-3 flex items-center gap-2">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold">
                {strategies.find(s => s.id === selectedStrategy)?.name}
              </h2>
              <Popover open={showStrategyPopover} onOpenChange={setShowStrategyPopover}>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8 gap-1">
                    <SwitchCamera className="h-3.5 w-3.5" />
                    <span className="text-xs">Switch</span>
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-56 p-0">
                  <div className="p-2">
                    <h3 className="font-medium text-sm mb-1">Switch Strategy</h3>
                    <p className="text-xs text-muted-foreground mb-2">Select another strategy to monitor</p>
                    <div className="space-y-1 max-h-[200px] overflow-y-auto">
                      {strategies.map(strategy => (
                        <div 
                          key={strategy.id}
                          className={`flex items-center gap-2 p-2 text-sm rounded-md cursor-pointer hover:bg-muted ${
                            strategy.id === selectedStrategy ? 'bg-muted font-medium' : ''
                          }`}
                          onClick={() => switchStrategy(strategy.id)}
                        >
                          {strategy.id === selectedStrategy && (
                            <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                          )}
                          {strategy.id !== selectedStrategy && (
                            <div className="w-3.5" />
                          )}
                          {strategy.name}
                        </div>
                      ))}
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
            </div>
            <Badge className={
              strategyStatus === "active" ? "bg-green-500" : 
              strategyStatus === "pending" ? "bg-yellow-500" : 
              "bg-red-500"
            }>
              {strategyStatus === "active" ? "Active" : 
              strategyStatus === "pending" ? "Paused" : 
              "Stopped"}
            </Badge>
          </div>
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
      
      <div className="flex gap-4 mb-4">
        {strategyStatus === "stopped" && (
          <Button 
            className="bg-green-500 hover:bg-green-600" 
            onClick={startStrategy}
          >
            <Play className="h-4 w-4 mr-1" />
            Start Strategy
          </Button>
        )}
        
        {strategyStatus === "active" && (
          <Button 
            variant="outline" 
            onClick={pauseStrategy}
          >
            <Pause className="h-4 w-4 mr-1" />
            Pause Strategy
          </Button>
        )}
        
        {strategyStatus === "pending" && (
          <Button 
            className="bg-green-500 hover:bg-green-600" 
            onClick={startStrategy}
          >
            <Play className="h-4 w-4 mr-1" />
            Resume Strategy
          </Button>
        )}
        
        {(strategyStatus === "active" || strategyStatus === "pending") && (
          <Button 
            variant="outline" 
            onClick={stopStrategy}
          >
            <PowerOff className="h-4 w-4 mr-1" />
            Stop Strategy
          </Button>
        )}
      </div>
      
      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-3 space-y-4">
          <Card>
            <CardHeader className="py-3">
              <div className="flex justify-between items-center">
                <CardTitle className="text-lg">Execution Logs</CardTitle>
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0 max-h-[400px] overflow-y-auto">
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
                  {tradeLogs
                    .filter(log => {
                      // Filter logs for current strategy 
                      const strategyName = strategies.find(s => s.id === selectedStrategy)?.name;
                      return log.strategy === strategyName || log.strategy === selectedStrategy;
                    })
                    .map(log => (
                    <TableRow key={log.id}>
                      <TableCell className="text-xs">{log.timestamp}</TableCell>
                      <TableCell>
                        <Badge className={
                          log.action === "BUY" ? "bg-green-500" : 
                          log.action === "SELL" ? "bg-red-500" : 
                          log.action.includes("SL") ? "bg-amber-500" : 
                          log.action.includes("TP") ? "bg-blue-500" : 
                          "bg-gray-500"
                        }>
                          {log.action}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-medium text-xs">{log.instrument}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <div className={`h-2 w-2 rounded-full ${
                            log.status === "EXECUTED" ? "bg-green-500" : 
                            log.status === "PENDING" ? "bg-amber-500" : 
                            "bg-red-500"
                          }`}></div>
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

          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-lg">Pending Orders</CardTitle>
            </CardHeader>
            <CardContent className="p-0 max-h-[300px] overflow-y-auto">
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
                  {pendingOrders
                    .filter(order => {
                      // Only show orders for this strategy
                      const strategyName = strategies.find(s => s.id === selectedStrategy)?.name;
                      return order.strategy === strategyName;
                    })
                    .map(order => (
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
          </Card>
          
          <Card>
            <CardHeader className="py-3">
              <div className="flex justify-between items-center">
                <CardTitle className="text-lg">Strategy Details</CardTitle>
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                  <Settings className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div>
                  <span className="text-sm text-muted-foreground">Type:</span>
                  <span className="text-sm ml-2">Algorithmic</span>
                </div>
                <div>
                  <span className="text-sm text-muted-foreground">Market:</span>
                  <span className="text-sm ml-2 capitalize">{selectedMarket}</span>
                </div>
                <div>
                  <span className="text-sm text-muted-foreground">Timeframe:</span>
                  <span className="text-sm ml-2">{selectedTimeframe}</span>
                </div>
                <div>
                  <span className="text-sm text-muted-foreground">Risk Level:</span>
                  <Badge variant="outline" className="ml-2">Medium</Badge>
                </div>
                <div>
                  <span className="text-sm text-muted-foreground">Max Position Size:</span>
                  <span className="text-sm ml-2">₹25,000</span>
                </div>
              </div>
            </CardContent>
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
                <CardTitle className="text-lg">Strategy Performance</CardTitle>
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
                  {positions
                    .filter(position => {
                      // Only show positions for this strategy
                      const strategyName = strategies.find(s => s.id === selectedStrategy)?.name;
                      return position.strategy === strategyName;
                    })
                    .map(position => (
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
              <CardTitle className="text-lg">Trade Monitoring</CardTitle>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="performance">
                <TabsList className="mb-4">
                  <TabsTrigger value="performance">Strategy Performance</TabsTrigger>
                  <TabsTrigger value="heatmap">P&L Heatmap</TabsTrigger>
                </TabsList>
                
                <TabsContent value="performance" className="h-[300px]">
                  <div className="h-full border rounded-md p-4">
                    <div className="flex justify-between items-center mb-4">
                      <div className="text-sm font-medium">Profit/Loss Evolution</div>
                      <Select defaultValue="day">
                        <SelectTrigger className="w-[120px] h-8 text-xs">
                          <SelectValue placeholder="Timeframe" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="day">Today</SelectItem>
                          <SelectItem value="week">This Week</SelectItem>
                          <SelectItem value="month">This Month</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    
                    {/* Performance Chart Visualization */}
                    <div className="h-[220px] w-full">
                      <div className="relative h-full">
                        <div className="absolute left-0 top-0 h-full flex flex-col justify-between text-xs text-muted-foreground">
                          <div>₹2,000</div>
                          <div>₹1,500</div>
                          <div>₹1,000</div>
                          <div>₹500</div>
                          <div>₹0</div>
                          <div>-₹500</div>
                        </div>
                        
                        <div className="absolute left-10 right-4 top-0 bottom-0">
                          {/* Grid lines */}
                          <div className="h-full flex flex-col justify-between">
                            {[0, 1, 2, 3, 4, 5].map((i) => (
                              <div key={i} className="border-b border-dashed border-gray-200 h-[16.6%]"></div>
                            ))}
                          </div>
                          
                          {/* Time labels */}
                          <div className="absolute bottom-[-20px] left-0 right-0 flex justify-between text-xs text-muted-foreground">
                            {['09:30', '11:00', '12:30', '14:00', '15:30'].map((time) => (
                              <div key={time}>{time}</div>
                            ))}
                          </div>
                          
                          {/* Chart line */}
                          <svg className="absolute inset-0 h-full w-full overflow-visible">
                            <defs>
                              <linearGradient id="performance-gradient" x1="0" x2="0" y1="0" y2="1">
                                <stop offset="0%" stopColor="rgba(52, 211, 153, 0.2)" />
                                <stop offset="100%" stopColor="rgba(52, 211, 153, 0)" />
                              </linearGradient>
                            </defs>
                            
                            {/* Area under the chart */}
                            <path
                              d={`M0,${200 - (performanceData[0].value / 2000) * 200} ${performanceData.map((d, i) => `L${(i / (performanceData.length - 1)) * 100}%,${200 - (d.value / 2000) * 200}`).join(' ')} L100%,200 L0,200 Z`}
                              fill="url(#performance-gradient)"
                            />
                            
                            {/* Chart line */}
                            <path
                              d={`M0,${200 - (performanceData[0].value / 2000) * 200} ${performanceData.map((d, i) => `L${(i / (performanceData.length - 1)) * 100}%,${200 - (d.value / 2000) * 200}`).join(' ')}`}
                              stroke="#10b981"
                              strokeWidth="2"
                              fill="none"
                            />
                            
                            {/* Data points */}
                            {performanceData.map((d, i) => (
                              <circle
                                key={i}
                                cx={`${(i / (performanceData.length - 1)) * 100}%`}
                                cy={200 - (d.value / 2000) * 200}
                                r="3"
                                fill="#10b981"
                              />
                            ))}
                          </svg>
                        </div>
                      </div>
                    </div>
                  </div>
                </TabsContent>
                
                <TabsContent value="heatmap" className="h-[300px]">
                  <HeatmapChart />
                </TabsContent>
              </Tabs>
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
                  <div key={alert.id} className={`p-2 rounded-md border ${getAlertColor(alert.type)}`}>
                    <div className="flex items-center">
                      {getAlertIcon(alert.type)}
                      <div className="flex flex-col ml-2">
                        <span className="text-sm">{alert.message}</span>
                        <span className="text-xs opacity-80">{alert.time}</span>
                      </div>
                    </div>
                  </div>
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
                  <Label htmlFor="max-loss-strategy">Max Loss Per Trade (₹)</Label>
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
              <CardTitle className="text-lg">Session Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Session Duration:</span>
                  <span className="text-sm font-medium">{sessionDuration}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Total Trades:</span>
                  <span className="text-sm font-medium">
                    {tradeLogs.filter(log => {
                      const strategyName = strategies.find(s => s.id === selectedStrategy)?.name;
                      return log.strategy === strategyName || log.strategy === selectedStrategy;
                    }).length}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Success Rate:</span>
                  <span className="text-sm font-medium">62.5%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Avg. Trade Duration:</span>
                  <span className="text-sm font-medium">8m 45s</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Total Fees:</span>
                  <span className="text-sm font-medium">₹175.50</span>
                </div>
              </div>
            </CardContent>
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
                  <li>Pause this strategy</li>
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
