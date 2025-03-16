
import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tabs } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import { PlayCircle, PauseCircle, AlertCircle, Info, ChevronRight, BarChart4, ArrowRight, ChevronDown, X, RefreshCw, Zap, Clock, BarChart2, CalendarClock } from "lucide-react";
import { BackButton } from "@/components/BackButton";

const LiveTradingModule = () => {
  const [isPaused, setIsPaused] = useState(false);
  
  return (
    <div className="flex flex-col h-screen">
      <header className="border-b px-6 py-3 bg-background flex items-center justify-between">
        <div className="flex items-center">
          <BackButton to="/dashboard" className="mr-2" />
          <div>
            <h1 className="text-xl font-semibold">Live Trading</h1>
            <div className="flex items-center text-sm text-muted-foreground">
              <span>EMA Crossover</span>
              <ChevronRight className="h-3 w-3 mx-1" />
              <span>Live</span>
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <Badge variant={isPaused ? "outline" : "default"} className="h-7 gap-1">
            {isPaused ? <PauseCircle className="h-3.5 w-3.5" /> : <PlayCircle className="h-3.5 w-3.5" />}
            {isPaused ? "Paused" : "Live Trading"}
          </Badge>
          
          <Button 
            variant={isPaused ? "default" : "outline"} 
            size="sm" 
            onClick={() => setIsPaused(!isPaused)}
            className="gap-1.5"
          >
            {isPaused ? (
              <>
                <PlayCircle className="h-4 w-4" />
                Resume
              </>
            ) : (
              <>
                <PauseCircle className="h-4 w-4" />
                Pause
              </>
            )}
          </Button>
          
          <Button variant="destructive" size="sm" className="gap-1.5">
            <AlertCircle className="h-4 w-4" />
            Emergency Stop
          </Button>
        </div>
      </header>
      
      <div className="flex-1 overflow-hidden">
        <ResizablePanelGroup direction="horizontal">
          <ResizablePanel defaultSize={20} minSize={15} maxSize={30}>
            <div className="h-full flex flex-col">
              <div className="border-b p-4">
                <h2 className="font-medium">Active Strategies</h2>
              </div>
              <div className="flex-1 p-2 overflow-y-auto space-y-2">
                <Card className="border-green-500 shadow-sm">
                  <CardContent className="p-3">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <h3 className="font-medium text-sm">EMA Crossover</h3>
                        <p className="text-xs text-muted-foreground">BTCUSDT 5m</p>
                      </div>
                      <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/20">Active</Badge>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">PnL Today</span>
                      <span className="font-medium text-green-500">+2.35%</span>
                    </div>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardContent className="p-3">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <h3 className="font-medium text-sm">RSI Strategy</h3>
                        <p className="text-xs text-muted-foreground">ETHUSD 15m</p>
                      </div>
                      <Badge variant="outline" className="bg-secondary/40 text-muted-foreground">Paused</Badge>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">PnL Today</span>
                      <span className="font-medium">0.00%</span>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </ResizablePanel>
          
          <ResizableHandle withHandle />
          
          <ResizablePanel defaultSize={55} minSize={40}>
            <Tabs defaultValue="overview" className="h-full flex flex-col">
              <div className="border-b px-4 py-2">
                <TabsList className="grid grid-cols-4">
                  <TabsTrigger value="overview">Overview</TabsTrigger>
                  <TabsTrigger value="trades">Trades</TabsTrigger>
                  <TabsTrigger value="chart">Chart</TabsTrigger>
                  <TabsTrigger value="settings">Settings</TabsTrigger>
                </TabsList>
              </div>
              
              <TabsContent value="overview" className="flex-1 p-4 overflow-y-auto">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base font-medium">Current Position</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        <div className="flex justify-between">
                          <span className="text-sm text-muted-foreground">Symbol</span>
                          <span className="text-sm font-medium">BTC/USDT</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm text-muted-foreground">Direction</span>
                          <Badge className="bg-green-500">Long</Badge>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm text-muted-foreground">Entry Price</span>
                          <span className="text-sm font-medium">$27,354.23</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm text-muted-foreground">Current Price</span>
                          <span className="text-sm font-medium">$27,843.15</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm text-muted-foreground">Unrealized PnL</span>
                          <span className="text-sm font-medium text-green-500">+$488.92 (1.78%)</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base font-medium">Strategy Performance</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        <div className="flex justify-between">
                          <span className="text-sm text-muted-foreground">Win Rate</span>
                          <span className="text-sm font-medium">65.7%</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm text-muted-foreground">Profit Factor</span>
                          <span className="text-sm font-medium">1.87</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm text-muted-foreground">Today's P&L</span>
                          <span className="text-sm font-medium text-green-500">+$893.25 (3.26%)</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm text-muted-foreground">Total P&L</span>
                          <span className="text-sm font-medium text-green-500">+$4,231.75 (15.39%)</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm text-muted-foreground">Running Since</span>
                          <span className="text-sm font-medium">25 days</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
                
                <div className="space-y-4">
                  <h3 className="font-medium">Recent Trades</h3>
                  <div className="border rounded-lg overflow-hidden">
                    <table className="w-full">
                      <thead>
                        <tr className="bg-muted/50">
                          <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Time</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Side</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Price</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Qty</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">P&L</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        <tr>
                          <td className="px-4 py-2 text-xs">10:32:45</td>
                          <td className="px-4 py-2 text-xs">
                            <Badge className="bg-green-500">BUY</Badge>
                          </td>
                          <td className="px-4 py-2 text-xs font-medium">$27,354.23</td>
                          <td className="px-4 py-2 text-xs">0.15</td>
                          <td className="px-4 py-2 text-xs text-green-500">+$488.92</td>
                        </tr>
                        <tr>
                          <td className="px-4 py-2 text-xs">09:15:22</td>
                          <td className="px-4 py-2 text-xs">
                            <Badge className="bg-red-500">SELL</Badge>
                          </td>
                          <td className="px-4 py-2 text-xs font-medium">$27,125.34</td>
                          <td className="px-4 py-2 text-xs">0.15</td>
                          <td className="px-4 py-2 text-xs text-green-500">+$312.45</td>
                        </tr>
                        <tr>
                          <td className="px-4 py-2 text-xs">08:02:11</td>
                          <td className="px-4 py-2 text-xs">
                            <Badge className="bg-green-500">BUY</Badge>
                          </td>
                          <td className="px-4 py-2 text-xs font-medium">$26,987.12</td>
                          <td className="px-4 py-2 text-xs">0.15</td>
                          <td className="px-4 py-2 text-xs text-red-500">-$138.50</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </TabsContent>
              
              <TabsContent value="trades" className="flex-1 p-4 overflow-y-auto">
                <Card>
                  <CardHeader>
                    <CardTitle>Trading History</CardTitle>
                    <CardDescription>Complete history of trades executed by this strategy</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="border rounded-lg overflow-hidden">
                      <table className="w-full">
                        <thead>
                          <tr className="bg-muted/50">
                            <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Date</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Time</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Type</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Price</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Size</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Status</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">P&L</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          <tr>
                            <td className="px-4 py-2 text-xs">07/12/2023</td>
                            <td className="px-4 py-2 text-xs">10:32:45</td>
                            <td className="px-4 py-2 text-xs">
                              <Badge className="bg-green-500">ENTRY</Badge>
                            </td>
                            <td className="px-4 py-2 text-xs font-medium">$27,354.23</td>
                            <td className="px-4 py-2 text-xs">0.15 BTC</td>
                            <td className="px-4 py-2 text-xs">
                              <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/20">FILLED</Badge>
                            </td>
                            <td className="px-4 py-2 text-xs">-</td>
                          </tr>
                          <tr>
                            <td className="px-4 py-2 text-xs">07/12/2023</td>
                            <td className="px-4 py-2 text-xs">09:15:22</td>
                            <td className="px-4 py-2 text-xs">
                              <Badge className="bg-red-500">EXIT</Badge>
                            </td>
                            <td className="px-4 py-2 text-xs font-medium">$27,125.34</td>
                            <td className="px-4 py-2 text-xs">0.15 BTC</td>
                            <td className="px-4 py-2 text-xs">
                              <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/20">FILLED</Badge>
                            </td>
                            <td className="px-4 py-2 text-xs text-green-500">+$312.45</td>
                          </tr>
                          <tr>
                            <td className="px-4 py-2 text-xs">07/12/2023</td>
                            <td className="px-4 py-2 text-xs">08:02:11</td>
                            <td className="px-4 py-2 text-xs">
                              <Badge className="bg-green-500">ENTRY</Badge>
                            </td>
                            <td className="px-4 py-2 text-xs font-medium">$26,987.12</td>
                            <td className="px-4 py-2 text-xs">0.15 BTC</td>
                            <td className="px-4 py-2 text-xs">
                              <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/20">FILLED</Badge>
                            </td>
                            <td className="px-4 py-2 text-xs">-</td>
                          </tr>
                          <tr>
                            <td className="px-4 py-2 text-xs">07/12/2023</td>
                            <td className="px-4 py-2 text-xs">07:45:33</td>
                            <td className="px-4 py-2 text-xs">
                              <Badge className="bg-red-500">EXIT</Badge>
                            </td>
                            <td className="px-4 py-2 text-xs font-medium">$26,893.45</td>
                            <td className="px-4 py-2 text-xs">0.15 BTC</td>
                            <td className="px-4 py-2 text-xs">
                              <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/20">FILLED</Badge>
                            </td>
                            <td className="px-4 py-2 text-xs text-red-500">-$138.50</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
              
              <TabsContent value="chart" className="flex-1 p-4 overflow-y-auto">
                <Card className="h-full">
                  <CardHeader>
                    <CardTitle>Price Chart with Signals</CardTitle>
                    <CardDescription>BTC/USDT with EMA Crossover signals</CardDescription>
                  </CardHeader>
                  <CardContent className="h-full flex items-center justify-center border rounded-lg bg-muted/40">
                    <div className="text-center">
                      <BarChart4 className="h-16 w-16 mx-auto text-muted-foreground/60" />
                      <p className="text-muted-foreground mt-4">Chart visualization will be displayed here</p>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
              
              <TabsContent value="settings" className="flex-1 p-4 overflow-y-auto">
                <Card>
                  <CardHeader>
                    <CardTitle>Strategy Parameters</CardTitle>
                    <CardDescription>Configure and optimize your strategy parameters</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <span className="text-sm font-medium">Fast EMA Period</span>
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors"
                            placeholder="12"
                            defaultValue="12"
                            min="1"
                            max="50"
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <span className="text-sm font-medium">Slow EMA Period</span>
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors"
                            placeholder="26"
                            defaultValue="26"
                            min="1"
                            max="100"
                          />
                        </div>
                      </div>
                    </div>
                    
                    <div className="space-y-3 pt-3 border-t">
                      <h3 className="text-sm font-medium">Risk Management</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <span className="text-sm">Stop Loss (%)</span>
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors"
                              placeholder="2"
                              defaultValue="2"
                              min="0.1"
                              max="20"
                              step="0.1"
                            />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <span className="text-sm">Take Profit (%)</span>
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors"
                              placeholder="5"
                              defaultValue="5"
                              min="0.1"
                              max="50"
                              step="0.1"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center justify-between pt-3 border-t">
                      <span className="text-sm font-medium">Trade at Market Open</span>
                      <Switch defaultChecked />
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Use Trailing Stop</span>
                      <Switch />
                    </div>
                    
                    <div className="pt-3">
                      <Button>
                        <RefreshCw className="mr-2 h-4 w-4" />
                        Apply Changes
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </ResizablePanel>
          
          <ResizableHandle withHandle />
          
          <ResizablePanel defaultSize={25} minSize={15} maxSize={40}>
            <div className="h-full flex flex-col">
              <div className="border-b p-4">
                <h2 className="font-medium">Activity Log</h2>
              </div>
              <div className="flex-1 p-3 overflow-y-auto space-y-2">
                <div className="flex gap-2 pb-2 border-b">
                  <div className="h-6 w-6 bg-green-500/10 rounded-full flex items-center justify-center shrink-0">
                    <Zap className="h-3 w-3 text-green-500" />
                  </div>
                  <div className="flex-1">
                    <p className="text-xs">BUY signal generated</p>
                    <div className="flex justify-between mt-0.5">
                      <span className="text-xs text-muted-foreground">BTC $27,354.23</span>
                      <span className="text-xs text-muted-foreground">10:32:45 AM</span>
                    </div>
                  </div>
                </div>
                
                <div className="flex gap-2 pb-2 border-b">
                  <div className="h-6 w-6 bg-blue-500/10 rounded-full flex items-center justify-center shrink-0">
                    <BarChart2 className="h-3 w-3 text-blue-500" />
                  </div>
                  <div className="flex-1">
                    <p className="text-xs">Fast EMA crossed above Slow EMA</p>
                    <div className="flex justify-between mt-0.5">
                      <span className="text-xs text-muted-foreground">Bullish signal</span>
                      <span className="text-xs text-muted-foreground">10:32:30 AM</span>
                    </div>
                  </div>
                </div>
                
                <div className="flex gap-2 pb-2 border-b">
                  <div className="h-6 w-6 bg-orange-500/10 rounded-full flex items-center justify-center shrink-0">
                    <Info className="h-3 w-3 text-orange-500" />
                  </div>
                  <div className="flex-1">
                    <p className="text-xs">Strategy entered monitoring mode</p>
                    <div className="flex justify-between mt-0.5">
                      <span className="text-xs text-muted-foreground">Waiting for signals</span>
                      <span className="text-xs text-muted-foreground">10:00:00 AM</span>
                    </div>
                  </div>
                </div>
                
                <div className="flex gap-2 pb-2 border-b">
                  <div className="h-6 w-6 bg-purple-500/10 rounded-full flex items-center justify-center shrink-0">
                    <CalendarClock className="h-3 w-3 text-purple-500" />
                  </div>
                  <div className="flex-1">
                    <p className="text-xs">Session started</p>
                    <div className="flex justify-between mt-0.5">
                      <span className="text-xs text-muted-foreground">System</span>
                      <span className="text-xs text-muted-foreground">09:30:00 AM</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </div>
  );
};

export default LiveTradingModule;
