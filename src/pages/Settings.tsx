
import { useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const Settings = () => {
  // Update the page title
  useEffect(() => {
    document.title = "Settings | TradeFlow";
  }, []);

  return (
    <div className="container p-4 md:p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">
          Manage your account and application preferences
        </p>
      </div>

      <Tabs defaultValue="account">
        <TabsList className="mb-4">
          <TabsTrigger value="account">Account</TabsTrigger>
          <TabsTrigger value="api">API Connections</TabsTrigger>
          <TabsTrigger value="trading">Trading Preferences</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
        </TabsList>
        
        <TabsContent value="account" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Personal Information</CardTitle>
              <CardDescription>Update your account details</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="fullName">Full Name</Label>
                  <Input id="fullName" placeholder="Your name" defaultValue="Alex Johnson" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" placeholder="Your email" defaultValue="alex@example.com" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="timezone">Timezone</Label>
                  <Select defaultValue="utc-5">
                    <SelectTrigger id="timezone">
                      <SelectValue placeholder="Select timezone" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="utc-8">Pacific Time (UTC-8)</SelectItem>
                      <SelectItem value="utc-7">Mountain Time (UTC-7)</SelectItem>
                      <SelectItem value="utc-6">Central Time (UTC-6)</SelectItem>
                      <SelectItem value="utc-5">Eastern Time (UTC-5)</SelectItem>
                      <SelectItem value="utc-0">UTC</SelectItem>
                      <SelectItem value="utc+1">Central European Time (UTC+1)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="currency">Default Currency</Label>
                  <Select defaultValue="usd">
                    <SelectTrigger id="currency">
                      <SelectValue placeholder="Select currency" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="usd">USD ($)</SelectItem>
                      <SelectItem value="eur">EUR (€)</SelectItem>
                      <SelectItem value="gbp">GBP (£)</SelectItem>
                      <SelectItem value="jpy">JPY (¥)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Button className="mt-2">Save Changes</Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Security</CardTitle>
              <CardDescription>Manage your account security settings</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="currentPassword">Current Password</Label>
                <Input id="currentPassword" type="password" placeholder="••••••••" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="newPassword">New Password</Label>
                <Input id="newPassword" type="password" placeholder="••••••••" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm New Password</Label>
                <Input id="confirmPassword" type="password" placeholder="••••••••" />
              </div>
              <div className="flex items-center space-x-2 pt-2">
                <Switch id="2fa" />
                <Label htmlFor="2fa">Enable Two-Factor Authentication</Label>
              </div>
              <Button className="mt-2">Update Password</Button>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="api" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Exchange API Keys</CardTitle>
              <CardDescription>Connect your trading exchange accounts</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4 border p-4 rounded-md">
                <div className="flex justify-between items-center">
                  <h3 className="font-medium">Binance</h3>
                  <Badge className="bg-green-500">Connected</Badge>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="binanceApiKey">API Key</Label>
                  <Input id="binanceApiKey" type="password" value="•••••••••••••••••••••••" readOnly />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="binanceSecretKey">Secret Key</Label>
                  <Input id="binanceSecretKey" type="password" value="•••••••••••••••••••••••" readOnly />
                </div>
                <div className="flex items-center space-x-2">
                  <Switch id="binanceTrading" defaultChecked />
                  <Label htmlFor="binanceTrading">Enable Trading</Label>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1">Update</Button>
                  <Button variant="destructive" className="flex-1">Disconnect</Button>
                </div>
              </div>

              <div className="space-y-4 border p-4 rounded-md">
                <div className="flex justify-between items-center">
                  <h3 className="font-medium">Coinbase</h3>
                  <div className="text-sm text-muted-foreground">Not Connected</div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="coinbaseApiKey">API Key</Label>
                  <Input id="coinbaseApiKey" placeholder="Enter API key" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="coinbaseSecretKey">Secret Key</Label>
                  <Input id="coinbaseSecretKey" type="password" placeholder="Enter secret key" />
                </div>
                <div className="flex items-center space-x-2">
                  <Switch id="coinbaseTrading" />
                  <Label htmlFor="coinbaseTrading">Enable Trading</Label>
                </div>
                <Button>Connect</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="trading" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Trading Preferences</CardTitle>
              <CardDescription>Configure default trading settings</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="defaultExchange">Default Exchange</Label>
                  <Select defaultValue="binance">
                    <SelectTrigger id="defaultExchange">
                      <SelectValue placeholder="Select exchange" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="binance">Binance</SelectItem>
                      <SelectItem value="coinbase">Coinbase</SelectItem>
                      <SelectItem value="kraken">Kraken</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="defaultPair">Default Trading Pair</Label>
                  <Select defaultValue="btcusd">
                    <SelectTrigger id="defaultPair">
                      <SelectValue placeholder="Select pair" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="btcusd">BTC/USD</SelectItem>
                      <SelectItem value="ethusd">ETH/USD</SelectItem>
                      <SelectItem value="solusd">SOL/USD</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="defaultSize">Default Position Size (%)</Label>
                  <Input id="defaultSize" type="number" defaultValue="5" min="1" max="100" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="stopLoss">Default Stop Loss (%)</Label>
                  <Input id="stopLoss" type="number" defaultValue="2" min="0.1" max="50" />
                </div>
              </div>

              <div className="flex items-center space-x-2 pt-4">
                <Switch id="demoTrading" defaultChecked />
                <div>
                  <Label htmlFor="demoTrading">Demo Trading Mode</Label>
                  <p className="text-xs text-muted-foreground">Trade with simulated funds instead of real money</p>
                </div>
              </div>

              <div className="flex items-center space-x-2 pt-2">
                <Switch id="confirmOrders" defaultChecked />
                <div>
                  <Label htmlFor="confirmOrders">Confirm Orders</Label>
                  <p className="text-xs text-muted-foreground">Require confirmation before placing trades</p>
                </div>
              </div>

              <Button className="mt-2">Save Preferences</Button>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="notifications" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Notification Settings</CardTitle>
              <CardDescription>Manage how you receive alerts</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="emailAlerts" className="font-medium">Email Notifications</Label>
                    <p className="text-xs text-muted-foreground">Receive trading alerts via email</p>
                  </div>
                  <Switch id="emailAlerts" defaultChecked />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="pushAlerts" className="font-medium">Push Notifications</Label>
                    <p className="text-xs text-muted-foreground">Receive alerts on your devices</p>
                  </div>
                  <Switch id="pushAlerts" defaultChecked />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="tradeExecution" className="font-medium">Trade Execution Alerts</Label>
                    <p className="text-xs text-muted-foreground">Receive alerts when trades are executed</p>
                  </div>
                  <Switch id="tradeExecution" defaultChecked />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="priceAlerts" className="font-medium">Price Movement Alerts</Label>
                    <p className="text-xs text-muted-foreground">Receive alerts for significant price movements</p>
                  </div>
                  <Switch id="priceAlerts" defaultChecked />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="systemAlerts" className="font-medium">System Notifications</Label>
                    <p className="text-xs text-muted-foreground">Receive alerts about system status and maintenance</p>
                  </div>
                  <Switch id="systemAlerts" defaultChecked />
                </div>
              </div>
              <Button className="mt-6">Save Notification Settings</Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Settings;
