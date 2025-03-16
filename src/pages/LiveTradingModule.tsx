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
  CheckCircle2,
  Briefcase,
  Server,
  FileText
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
