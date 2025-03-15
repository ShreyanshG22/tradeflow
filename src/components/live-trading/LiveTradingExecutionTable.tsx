
import React, { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Pause, Play, Eye, Activity, TrendingUp, TrendingDown } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type StrategyStatus = "running" | "paused" | "stopped";

interface LiveStrategy {
  id: number;
  name: string;
  status: StrategyStatus;
  profit: number;
  trades: number;
  lastTrade: string;
}

export function LiveTradingExecutionTable() {
  const { toast } = useToast();
  const [strategies, setStrategies] = useState<LiveStrategy[]>([
    {
      id: 1,
      name: "Moving Average Crossover",
      status: "running",
      profit: 1250.75,
      trades: 8,
      lastTrade: "20 mins ago",
    },
    {
      id: 2,
      name: "RSI + MACD Strategy",
      status: "paused",
      profit: -320.50,
      trades: 5,
      lastTrade: "1 hour ago",
    },
    {
      id: 3,
      name: "Bollinger Bands Breakout",
      status: "running",
      profit: 745.25,
      trades: 12,
      lastTrade: "5 mins ago",
    },
  ]);

  const toggleStrategyStatus = (id: number) => {
    setStrategies(
      strategies.map((strategy) => {
        if (strategy.id === id) {
          const newStatus = strategy.status === "running" ? "paused" : "running";
          
          toast({
            title: `Strategy ${newStatus}`,
            description: `"${strategy.name}" is now ${newStatus}`,
          });
          
          return {
            ...strategy,
            status: newStatus,
          };
        }
        return strategy;
      })
    );
  };

  const pauseAllStrategies = () => {
    setStrategies(
      strategies.map((strategy) => ({
        ...strategy,
        status: "paused",
      }))
    );
    
    toast({
      title: "All strategies paused",
      description: "All running strategies have been paused",
      variant: "destructive",
    });
  };

  const getStatusBadge = (status: StrategyStatus) => {
    switch (status) {
      case "running":
        return <Badge className="bg-green-500">Running</Badge>;
      case "paused":
        return <Badge variant="outline">Paused</Badge>;
      case "stopped":
        return <Badge variant="destructive">Stopped</Badge>;
      default:
        return null;
    }
  };

  return (
    <Card className="h-full">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div className="space-y-1">
          <CardTitle>Live Strategies</CardTitle>
          <CardDescription>Currently active trading strategies</CardDescription>
        </div>
        <Button
          variant="destructive"
          size="sm"
          onClick={pauseAllStrategies}
          className="h-8"
        >
          <Pause className="mr-2 h-4 w-4" />
          Pause All Trades
        </Button>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Strategy</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Profit/Loss</TableHead>
              <TableHead>Trades</TableHead>
              <TableHead>Last Trade</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {strategies.map((strategy) => (
              <TableRow key={strategy.id}>
                <TableCell className="font-medium">{strategy.name}</TableCell>
                <TableCell>{getStatusBadge(strategy.status)}</TableCell>
                <TableCell>
                  <div className={`flex items-center ${strategy.profit >= 0 ? "text-green-500" : "text-red-500"}`}>
                    {strategy.profit >= 0 ? (
                      <TrendingUp className="mr-1 h-4 w-4" />
                    ) : (
                      <TrendingDown className="mr-1 h-4 w-4" />
                    )}
                    {strategy.profit >= 0 ? "+" : ""}
                    ₹{strategy.profit.toFixed(2)}
                  </div>
                </TableCell>
                <TableCell>{strategy.trades}</TableCell>
                <TableCell>{strategy.lastTrade}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => toggleStrategyStatus(strategy.id)}
                      className="h-8 w-8 p-0"
                    >
                      {strategy.status === "running" ? (
                        <Pause className="h-4 w-4" />
                      ) : (
                        <Play className="h-4 w-4" />
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 w-8 p-0"
                      onClick={() => {
                        toast({
                          title: "Viewing trade details",
                          description: `Showing details for ${strategy.name}`,
                        });
                      }}
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 w-8 p-0"
                      onClick={() => {
                        toast({
                          title: "Checking execution logs",
                          description: `Viewing logs for ${strategy.name}`,
                        });
                      }}
                    >
                      <Activity className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
