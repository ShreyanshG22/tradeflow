
import React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AlertTriangle, BellRing, Clock } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface LogEntry {
  id: number;
  type: "info" | "warning" | "error";
  message: string;
  time: string;
}

export function LiveTradingMonitoring() {
  const logs: LogEntry[] = [
    {
      id: 1,
      type: "info",
      message: "Moving Average Crossover executed buy order for RELIANCE at ₹2,450",
      time: "2 mins ago",
    },
    {
      id: 2,
      type: "warning",
      message: "RSI + MACD Strategy approaching stop loss on INFY position",
      time: "15 mins ago",
    },
    {
      id: 3,
      type: "error",
      message: "Failed to execute sell order for HDFCBANK due to insufficient holdings",
      time: "32 mins ago",
    },
    {
      id: 4,
      type: "info",
      message: "Bollinger Bands Breakout took profit on TATASTEEL at ₹145.50",
      time: "45 mins ago",
    },
    {
      id: 5,
      type: "warning",
      message: "Network connection unstable, potential delay in order execution",
      time: "1 hour ago",
    },
  ];

  // Mock data for the profit/loss heatmap
  const heatmapData = [
    { name: "RELIANCE", value: 850, color: "bg-green-500" },
    { name: "HDFCBANK", value: 430, color: "bg-green-400" },
    { name: "INFY", value: -320, color: "bg-red-400" },
    { name: "TCS", value: 220, color: "bg-green-300" },
    { name: "TATASTEEL", value: -150, color: "bg-red-300" },
    { name: "SBIN", value: 125, color: "bg-green-200" },
    { name: "WIPRO", value: -80, color: "bg-red-200" },
    { name: "BAJFINANCE", value: 60, color: "bg-green-100" },
  ];

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle>P&L Heatmap</CardTitle>
          <CardDescription>Current profit/loss by instrument</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-2">
            {heatmapData.map((item) => (
              <div
                key={item.name}
                className={`flex flex-col justify-between rounded-md ${item.color} p-3 text-white`}
              >
                <div className="text-xs font-medium">{item.name}</div>
                <div className="text-xl font-bold">
                  {item.value >= 0 ? "+" : ""}₹{Math.abs(item.value)}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Execution Logs</CardTitle>
          <CardDescription>Recent trading activity and alerts</CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[300px] rounded-md">
            <div className="space-y-4 pr-3">
              {logs.map((log) => (
                <div key={log.id} className="flex items-start gap-4">
                  <div className="mt-0.5">
                    {log.type === "info" && <Clock className="h-5 w-5 text-blue-500" />}
                    {log.type === "warning" && <BellRing className="h-5 w-5 text-amber-500" />}
                    {log.type === "error" && <AlertTriangle className="h-5 w-5 text-red-500" />}
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-medium leading-none">{log.message}</p>
                    <p className="text-xs text-muted-foreground">{log.time}</p>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      <Alert variant="destructive" className="border-amber-200 bg-amber-50 text-amber-800">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Critical Alert</AlertTitle>
        <AlertDescription>
          Low margin balance (₹5,000). Add funds to avoid position liquidation.
        </AlertDescription>
      </Alert>
    </div>
  );
}
