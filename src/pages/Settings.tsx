
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel } from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { 
  Bell, 
  Mail, 
  Shield, 
  CreditCard, 
  User, 
  RefreshCw, 
  Database, 
  Settings as SettingsIcon, 
  Plus, 
  Moon, 
  Sun, 
  AlertCircle, 
  Download, 
  Upload, 
  Users, 
  ChevronRight, 
  Globe, 
  BarChart4, 
  Gauge, 
  Webhook, 
  PanelLeft, 
  Info,
  ArrowLeft
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

const Settings = () => {
  // Update the page title
  useEffect(() => {
    document.title = "Settings | TradeFlow";
  }, []);

  const [loading, setLoading] = useState(false);
  const [activeSettingCategory, setActiveSettingCategory] = useState("account");
  const [darkMode, setDarkMode] = useState(false);
  const [liveNotifications, setLiveNotifications] = useState(true);
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);

  const saveSettings = () => {
    setLoading(true);
    // Simulate API call
    setTimeout(() => {
      setLoading(false);
      toast({
        title: "Settings saved",
        description: "Your changes have been successfully saved.",
      });
    }, 1000);
  };

  const handleEmergencyStop = () => {
    setConfirmDialogOpen(true);
  };

  const confirmEmergencyStop = () => {
    toast({
      title: "Emergency Stop Activated",
      description: "All automated trading has been halted.",
      variant: "destructive",
    });
    setConfirmDialogOpen(false);
  };

  const SettingsSidebar = () => (
    <div className="w-72 border-r h-full shrink-0 bg-background">
      <div className="p-4 border-b">
        <h2 className="text-lg font-semibold">Settings</h2>
        <p className="text-sm text-muted-foreground">Customize your trading platform</p>
      </div>
      
      <div className="py-2">
        <button 
          onClick={() => setActiveSettingCategory("account")}
          className={`w-full flex items-center gap-3 px-4 py-2.5 text-left ${activeSettingCategory === "account" ? "bg-accent text-accent-foreground" : "hover:bg-secondary/50"}`}
        >
          <User size={18} />
          <span>Account</span>
          <ChevronRight size={16} className="ml-auto" />
        </button>
        
        <button 
          onClick={() => setActiveSettingCategory("api")}
          className={`w-full flex items-center gap-3 px-4 py-2.5 text-left ${activeSettingCategory === "api" ? "bg-accent text-accent-foreground" : "hover:bg-secondary/50"}`}
        >
          <Database size={18} />
          <span>API & Brokers</span>
          <ChevronRight size={16} className="ml-auto" />
        </button>
        
        <button 
          onClick={() => setActiveSettingCategory("trading")}
          className={`w-full flex items-center gap-3 px-4 py-2.5 text-left ${activeSettingCategory === "trading" ? "bg-accent text-accent-foreground" : "hover:bg-secondary/50"}`}
        >
          <BarChart4 size={18} />
          <span>Trading</span>
          <ChevronRight size={16} className="ml-auto" />
        </button>
        
        <button 
          onClick={() => setActiveSettingCategory("notifications")}
          className={`w-full flex items-center gap-3 px-4 py-2.5 text-left ${activeSettingCategory === "notifications" ? "bg-accent text-accent-foreground" : "hover:bg-secondary/50"}`}
        >
          <Bell size={18} />
          <span>Notifications</span>
          <ChevronRight size={16} className="ml-auto" />
        </button>
        
        <button 
          onClick={() => setActiveSettingCategory("visualization")}
          className={`w-full flex items-center gap-3 px-4 py-2.5 text-left ${activeSettingCategory === "visualization" ? "bg-accent text-accent-foreground" : "hover:bg-secondary/50"}`}
        >
          <Gauge size={18} />
          <span>Data & Visualization</span>
          <ChevronRight size={16} className="ml-auto" />
        </button>
        
        <button 
          onClick={() => setActiveSettingCategory("risk")}
          className={`w-full flex items-center gap-3 px-4 py-2.5 text-left ${activeSettingCategory === "risk" ? "bg-accent text-accent-foreground" : "hover:bg-secondary/50"}`}
        >
          <Shield size={18} />
          <span>Risk Management</span>
          <ChevronRight size={16} className="ml-auto" />
        </button>
      </div>
      
      <div className="absolute bottom-4 w-[250px] px-4">
        <Button className="w-full" onClick={saveSettings} disabled={loading}>
          {loading ? (
            <>
              <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            "Save All Changes"
          )}
        </Button>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Mobile-friendly sidebar toggle */}
      <Sheet>
        <SheetTrigger asChild>
          <Button variant="outline" size="icon" className="md:hidden absolute top-4 left-4 z-50">
            <PanelLeft size={18} />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="p-0">
          <SettingsSidebar />
        </SheetContent>
      </Sheet>

      {/* Desktop sidebar */}
      <div className="hidden md:block h-full">
        <SettingsSidebar />
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-auto">
        {/* Top Bar */}
        <div className="border-b px-6 py-3 flex items-center justify-between bg-card">
          <div className="flex items-center">
            <Button variant="outline" size="icon" asChild className="mr-2">
              <Link to="/dashboard">
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <h1 className="text-xl font-semibold">
              {activeSettingCategory === "account" && "Account Settings"}
              {activeSettingCategory === "api" && "API & Brokers"}
              {activeSettingCategory === "trading" && "Trading Preferences"}
              {activeSettingCategory === "notifications" && "Notifications & Alerts"}
              {activeSettingCategory === "visualization" && "Data & Visualization"}
              {activeSettingCategory === "risk" && "Risk Management"}
            </h1>
          </div>

          <div className="flex items-center gap-4">
            {/* Theme Toggle */}
            <div className="flex items-center gap-2">
              <Label htmlFor="theme-toggle" className="sr-only">Toggle Theme</Label>
              <Switch
                id="theme-toggle"
                checked={darkMode}
                onCheckedChange={setDarkMode}
              />
              {darkMode ? <Moon size={18} /> : <Sun size={18} />}
            </div>
            
            {/* Notifications Toggle */}
            <div className="flex items-center gap-2">
              <Label htmlFor="notifications-toggle" className="sr-only">Toggle Notifications</Label>
              <Switch
                id="notifications-toggle"
                checked={liveNotifications}
                onCheckedChange={setLiveNotifications}
              />
              <Bell size={18} />
            </div>
            
            {/* Emergency Stop Button */}
            <Button variant="destructive" size="sm" onClick={handleEmergencyStop}>
              <AlertCircle className="mr-2 h-4 w-4" />
              Emergency Stop
            </Button>
            
            {/* User Profile */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="h-9 w-9 rounded-full p-0">
                  <span className="sr-only">Open user menu</span>
                  <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-medium">
                    AJ
                  </div>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <div className="flex items-center justify-start p-2">
                  <div className="flex flex-col space-y-0.5">
                    <p className="text-sm font-medium">Alex Johnson</p>
                    <p className="text-xs text-muted-foreground">Premium Plan</p>
                  </div>
                </div>
                <DropdownMenuItem>
                  <User className="mr-2 h-4 w-4" />
                  <span>Profile</span>
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <Users className="mr-2 h-4 w-4" />
                  <span>Subscription</span>
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <Info className="mr-2 h-4 w-4" />
                  <span>About</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Main Panel Content */}
        <div className="p-6 max-w-5xl mx-auto">
          {/* Account Settings */}
          {activeSettingCategory === "account" && (
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Profile Information</CardTitle>
                  <CardDescription>
                    Update your personal information and preferences
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="name">Full Name</Label>
                      <Input id="name" defaultValue="Alex Johnson" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="email">Email</Label>
                      <Input id="email" type="email" defaultValue="alex@example.com" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="timezone">Timezone</Label>
                      <Select defaultValue="utc">
                        <SelectTrigger>
                          <SelectValue placeholder="Select timezone" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="utc">UTC (GMT+0)</SelectItem>
                          <SelectItem value="est">Eastern Time (GMT-5)</SelectItem>
                          <SelectItem value="pst">Pacific Time (GMT-8)</SelectItem>
                          <SelectItem value="ist">India (GMT+5:30)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="currency">Default Currency</Label>
                      <Select defaultValue="usd">
                        <SelectTrigger>
                          <SelectValue placeholder="Select currency" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="usd">USD ($)</SelectItem>
                          <SelectItem value="eur">EUR (€)</SelectItem>
                          <SelectItem value="gbp">GBP (£)</SelectItem>
                          <SelectItem value="jpy">JPY (¥)</SelectItem>
                          <SelectItem value="inr">INR (₹)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="language">Language</Label>
                      <Select defaultValue="en">
                        <SelectTrigger>
                          <SelectValue placeholder="Select language" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="en">English</SelectItem>
                          <SelectItem value="es">Spanish</SelectItem>
                          <SelectItem value="fr">French</SelectItem>
                          <SelectItem value="de">German</SelectItem>
                          <SelectItem value="hi">Hindi</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Security</CardTitle>
                  <CardDescription>
                    Manage your password and account security
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="current-password">Current Password</Label>
                      <Input id="current-password" type="password" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="new-password">New Password</Label>
                      <Input id="new-password" type="password" />
                    </div>
                  </div>
                  <div className="flex items-center space-x-2 pt-2">
                    <Switch id="2fa" />
                    <Label htmlFor="2fa">Enable Two-Factor Authentication</Label>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* API & Brokers */}
          {activeSettingCategory === "api" && (
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Broker API Connections</CardTitle>
                  <CardDescription>
                    Manage your broker API connections and keys
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Zerodha Connection */}
                  <div className="border rounded-lg p-4">
                    <div className="flex justify-between items-center mb-4">
                      <div className="flex items-center gap-2">
                        <div className="h-8 w-8 bg-primary/10 rounded-full flex items-center justify-center">
                          <Database className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <h3 className="font-medium">Zerodha</h3>
                          <p className="text-sm text-muted-foreground">Indian Discount Broker</p>
                        </div>
                      </div>
                      <Badge>Connected</Badge>
                    </div>
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="zerodha-api-key">API Key</Label>
                        <Input id="zerodha-api-key" defaultValue="********ABCD" type="password" />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="zerodha-api-secret">API Secret</Label>
                        <Input id="zerodha-api-secret" defaultValue="*****************" type="password" />
                      </div>
                    </div>
                    <div className="mt-4 flex gap-2">
                      <Button variant="outline" size="sm">Update Keys</Button>
                      <Button variant="outline" size="sm" className="text-destructive">
                        Disconnect
                      </Button>
                    </div>
                  </div>

                  {/* Fyers Connection */}
                  <div className="border rounded-lg p-4">
                    <div className="flex justify-between items-center mb-4">
                      <div className="flex items-center gap-2">
                        <div className="h-8 w-8 bg-primary/10 rounded-full flex items-center justify-center">
                          <Database className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <h3 className="font-medium">Fyers</h3>
                          <p className="text-sm text-muted-foreground">Indian Broker</p>
                        </div>
                      </div>
                      <Badge variant="outline">Not Connected</Badge>
                    </div>
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="fyers-api-key">API Key</Label>
                        <Input id="fyers-api-key" placeholder="Enter API Key" />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="fyers-api-secret">API Secret</Label>
                        <Input id="fyers-api-secret" placeholder="Enter API Secret" />
                      </div>
                    </div>
                    <div className="mt-4">
                      <Button size="sm">Connect</Button>
                    </div>
                  </div>

                  {/* Add New Broker */}
                  <div className="border border-dashed rounded-lg p-4 flex flex-col items-center justify-center py-6">
                    <div className="h-12 w-12 bg-primary/10 rounded-full flex items-center justify-center mb-3">
                      <Plus className="h-6 w-6 text-primary" />
                    </div>
                    <h3 className="font-medium mb-2">Connect New Broker</h3>
                    <p className="text-sm text-muted-foreground text-center mb-3">
                      Add a new broker connection to trade with
                    </p>
                    <Button variant="outline">Add Broker</Button>
                  </div>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader>
                  <CardTitle>API Webhook Integrations</CardTitle>
                  <CardDescription>
                    Connect with external platforms and services
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between border-b pb-4">
                      <div className="flex items-center gap-3">
                        <Webhook className="h-5 w-5 text-primary" />
                        <div>
                          <h4 className="font-medium">TradingView Signals</h4>
                          <p className="text-sm text-muted-foreground">Receive trade signals</p>
                        </div>
                      </div>
                      <Switch id="tradingview-webhook" />
                    </div>
                    
                    <div className="flex items-center justify-between border-b pb-4">
                      <div className="flex items-center gap-3">
                        <Webhook className="h-5 w-5 text-primary" />
                        <div>
                          <h4 className="font-medium">Telegram Bot</h4>
                          <p className="text-sm text-muted-foreground">Trade notification channel</p>
                        </div>
                      </div>
                      <Switch id="telegram-webhook" defaultChecked />
                    </div>
                    
                    <div className="pt-2">
                      <Button variant="outline" size="sm">
                        <Plus className="mr-2 h-4 w-4" />
                        Add Webhook
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Trading Settings */}
          {activeSettingCategory === "trading" && (
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Trading Preferences</CardTitle>
                  <CardDescription>
                    Configure your default trading parameters and risk management
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="default-position-size">Default Position Size (%)</Label>
                      <Input id="default-position-size" type="number" defaultValue="2" min="0.1" max="100" step="0.1" />
                      <p className="text-xs text-muted-foreground mt-1">
                        Percentage of your capital to use per trade
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="max-open-positions">Maximum Open Positions</Label>
                      <Input id="max-open-positions" type="number" defaultValue="5" min="1" max="50" />
                      <p className="text-xs text-muted-foreground mt-1">
                        Maximum number of positions you can have open simultaneously
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="stop-loss">Default Stop Loss (%)</Label>
                      <Input id="stop-loss" type="number" defaultValue="3" min="0.1" max="50" step="0.1" />
                      <p className="text-xs text-muted-foreground mt-1">
                        Default percentage for stop loss orders
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="take-profit">Default Take Profit (%)</Label>
                      <Input id="take-profit" type="number" defaultValue="6" min="0.1" max="100" step="0.1" />
                      <p className="text-xs text-muted-foreground mt-1">
                        Default percentage for take profit orders
                      </p>
                    </div>
                  </div>

                  <div className="pt-4">
                    <h3 className="font-medium mb-2">Risk Management</h3>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <Label htmlFor="daily-loss-limit">Daily Loss Limit</Label>
                          <p className="text-xs text-muted-foreground">
                            Stop trading if you lose this percentage in a day
                          </p>
                        </div>
                        <div className="w-[100px]">
                          <Input id="daily-loss-limit" type="number" defaultValue="5" min="0.1" max="100" step="0.1" />
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <Label htmlFor="daily-profit-target">Daily Profit Target</Label>
                          <p className="text-xs text-muted-foreground">
                            Consider stopping trading when this profit is reached
                          </p>
                        </div>
                        <div className="w-[100px]">
                          <Input id="daily-profit-target" type="number" defaultValue="10" min="0.1" max="100" step="0.1" />
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Backtesting Parameters</CardTitle>
                  <CardDescription>
                    Default settings for backtesting strategies
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="default-symbol">Default Symbol</Label>
                      <Select defaultValue="btcusd">
                        <SelectTrigger>
                          <SelectValue placeholder="Select default symbol" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="btcusd">BTC/USD</SelectItem>
                          <SelectItem value="ethusd">ETH/USD</SelectItem>
                          <SelectItem value="aapl">AAPL</SelectItem>
                          <SelectItem value="msft">MSFT</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="default-timeframe">Default Timeframe</Label>
                      <Select defaultValue="1h">
                        <SelectTrigger>
                          <SelectValue placeholder="Select default timeframe" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1m">1 Minute</SelectItem>
                          <SelectItem value="5m">5 Minutes</SelectItem>
                          <SelectItem value="15m">15 Minutes</SelectItem>
                          <SelectItem value="1h">1 Hour</SelectItem>
                          <SelectItem value="4h">4 Hours</SelectItem>
                          <SelectItem value="1d">1 Day</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="commission-rate">Commission Rate (%)</Label>
                      <Input id="commission-rate" type="number" defaultValue="0.1" min="0" max="100" step="0.01" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="slippage">Slippage (%)</Label>
                      <Input id="slippage" type="number" defaultValue="0.05" min="0" max="100" step="0.01" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Notifications & Alerts */}
          {activeSettingCategory === "notifications" && (
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Notification Preferences</CardTitle>
                  <CardDescription>
                    Configure when and how you receive notifications
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <Bell className="h-4 w-4 text-muted-foreground" />
                        <Label htmlFor="trade-executed">Trade Executed</Label>
                      </div>
                      <Switch id="trade-executed" defaultChecked />
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <Bell className="h-4 w-4 text-muted-foreground" />
                        <Label htmlFor="stop-loss-hit">Stop Loss Hit</Label>
                      </div>
                      <Switch id="stop-loss-hit" defaultChecked />
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <Bell className="h-4 w-4 text-muted-foreground" />
                        <Label htmlFor="take-profit-hit">Take Profit Hit</Label>
                      </div>
                      <Switch id="take-profit-hit" defaultChecked />
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <Bell className="h-4 w-4 text-muted-foreground" />
                        <Label htmlFor="new-signal">New Signal Generated</Label>
                      </div>
                      <Switch id="new-signal" />
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <Bell className="h-4 w-4 text-muted-foreground" />
                        <Label htmlFor="strategy-error">Strategy Error/Warning</Label>
                      </div>
                      <Switch id="strategy-error" defaultChecked />
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <Bell className="h-4 w-4 text-muted-foreground" />
                        <Label htmlFor="daily-summary">Daily Performance Summary</Label>
                      </div>
                      <Switch id="daily-summary" defaultChecked />
                    </div>
                  </div>
                  
                  <div className="pt-4 border-t">
                    <h3 className="font-medium mb-3">Notification Channels</h3>
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <Mail className="h-4 w-4 text-muted-foreground" />
                          <div>
                            <Label>Email Notifications</Label>
                            <p className="text-xs text-muted-foreground">
                              Receive notifications via email
                            </p>
                          </div>
                        </div>
                        <Switch id="email-notifications" defaultChecked />
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <Mail className="h-4 w-4 text-muted-foreground" />
                          <div>
                            <Label>Push Notifications</Label>
                            <p className="text-xs text-muted-foreground">
                              Receive notifications in your browser
                            </p>
                          </div>
                        </div>
                        <Switch id="push-notifications" defaultChecked />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="telegram-webhook">Telegram Bot Token (Optional)</Label>
                        <Input id="telegram-webhook" placeholder="Enter your Telegram bot token" />
                        <p className="text-xs text-muted-foreground">
                          Connect a Telegram bot to receive notifications via Telegram
                        </p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader>
                  <CardTitle>Custom Alert Rules</CardTitle>
                  <CardDescription>
                    Create personalized alerts based on market conditions
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="border rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="font-medium">Price Alert - BTC/USD</h4>
                        <Switch id="btc-alert" defaultChecked />
                      </div>
                      <p className="text-sm text-muted-foreground mb-3">
                        Alert when BTC price rises above $50,000
                      </p>
                      <Badge variant="outline">Price Alert</Badge>
                    </div>
                    
                    <div className="border rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="font-medium">Daily Loss Warning</h4>
                        <Switch id="loss-alert" defaultChecked />
                      </div>
                      <p className="text-sm text-muted-foreground mb-3">
                        Alert when daily losses exceed 3% of account value
                      </p>
                      <Badge variant="outline">Account Alert</Badge>
                    </div>
                    
                    <Button size="sm" variant="outline">
                      <Plus className="mr-2 h-4 w-4" />
                      Create New Alert
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
          
          {/* Data & Visualization */}
          {activeSettingCategory === "visualization" && (
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Chart & Display Preferences</CardTitle>
                  <CardDescription>
                    Customize how data and charts are presented
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="chart-type">Default Chart Type</Label>
                      <Select defaultValue="candlestick">
                        <SelectTrigger>
                          <SelectValue placeholder="Select chart type" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="candlestick">Candlestick</SelectItem>
                          <SelectItem value="line">Line</SelectItem>
                          <SelectItem value="bar">OHLC Bar</SelectItem>
                          <SelectItem value="heikinashi">Heikin-Ashi</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="default-timeframe-viz">Default Timeframe</Label>
                      <Select defaultValue="15m">
                        <SelectTrigger>
                          <SelectValue placeholder="Select timeframe" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1m">1 Minute</SelectItem>
                          <SelectItem value="5m">5 Minutes</SelectItem>
                          <SelectItem value="15m">15 Minutes</SelectItem>
                          <SelectItem value="1h">1 Hour</SelectItem>
                          <SelectItem value="4h">4 Hours</SelectItem>
                          <SelectItem value="1d">1 Day</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="theme">Chart Color Theme</Label>
                      <Select defaultValue="dark">
                        <SelectTrigger>
                          <SelectValue placeholder="Select theme" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="dark">Dark</SelectItem>
                          <SelectItem value="light">Light</SelectItem>
                          <SelectItem value="blue">Blue</SelectItem>
                          <SelectItem value="green">Green</SelectItem>
                          <SelectItem value="custom">Custom</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="order-book-depth">Order Book Depth</Label>
                      <Select defaultValue="10">
                        <SelectTrigger>
                          <SelectValue placeholder="Select depth" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="5">5 Levels</SelectItem>
                          <SelectItem value="10">10 Levels</SelectItem>
                          <SelectItem value="15">15 Levels</SelectItem>
                          <SelectItem value="20">20 Levels</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </div>
      
      {/* Emergency Stop Confirmation Dialog */}
      <Dialog open={confirmDialogOpen} onOpenChange={setConfirmDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-destructive">Emergency Stop</DialogTitle>
            <DialogDescription>
              This will immediately halt all automated trading activity. Are you sure?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmEmergencyStop}>
              Stop All Trading
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Settings;
