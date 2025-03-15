
import { useEffect, useState } from "react";
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
import { Bell, Mail, Shield, CreditCard, User, RefreshCw, Database, Settings as SettingsIcon } from "lucide-react";
import { toast } from "@/hooks/use-toast";

const Settings = () => {
  // Update the page title
  useEffect(() => {
    document.title = "Settings | TradeFlow";
  }, []);

  const [loading, setLoading] = useState(false);

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

  return (
    <div className="container p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
          <p className="text-muted-foreground">
            Manage your account and application preferences
          </p>
        </div>
        <Button onClick={saveSettings} disabled={loading}>
          {loading ? (
            <>
              <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            "Save Changes"
          )}
        </Button>
      </div>

      <Tabs defaultValue="account">
        <TabsList className="grid w-full grid-cols-4 md:w-fit">
          <TabsTrigger value="account">Account</TabsTrigger>
          <TabsTrigger value="api">API & Brokers</TabsTrigger>
          <TabsTrigger value="trading">Trading</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
        </TabsList>

        {/* Account Settings */}
        <TabsContent value="account" className="space-y-4 mt-4">
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
        </TabsContent>

        {/* API Settings */}
        <TabsContent value="api" className="space-y-4 mt-4">
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
        </TabsContent>

        {/* Trading Settings */}
        <TabsContent value="trading" className="space-y-4 mt-4">
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
        </TabsContent>

        {/* Notification Settings */}
        <TabsContent value="notifications" className="space-y-4 mt-4">
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
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Settings;
