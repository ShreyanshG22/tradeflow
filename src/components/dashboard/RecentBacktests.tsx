
import { ArrowRight, TrendingUp, TrendingDown } from "lucide-react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export function DashboardRecentBacktests() {
  const backtests = [
    {
      id: 1,
      name: "Moving Average Crossover",
      return: "+12.4%",
      isPositive: true,
      date: "2 days ago",
    },
    {
      id: 2,
      name: "RSI + MACD Strategy",
      return: "+8.7%",
      isPositive: true,
      date: "Yesterday",
    },
    {
      id: 3,
      name: "Bollinger Bands Breakout",
      return: "-2.3%",
      isPositive: false,
      date: "5 hours ago",
    },
  ];

  return (
    <Card className="col-span-1 md:col-span-3 lg:col-span-1 h-full">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div className="space-y-1">
          <CardTitle>Recent Backtests</CardTitle>
          <CardDescription>Strategy performance</CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {backtests.map((backtest) => (
            <div key={backtest.id} className="flex items-center justify-between">
              <div className="space-y-1">
                <div className="font-medium">{backtest.name}</div>
                <div className="flex items-center gap-2">
                  <div className={`flex items-center text-sm font-medium ${backtest.isPositive ? 'text-green-500' : 'text-red-500'}`}>
                    {backtest.isPositive ? <TrendingUp className="mr-1 h-3 w-3" /> : <TrendingDown className="mr-1 h-3 w-3" />}
                    {backtest.return}
                  </div>
                  <div className="text-xs text-muted-foreground">{backtest.date}</div>
                </div>
              </div>
              <Button variant="outline" size="sm" className="h-8">
                View
              </Button>
            </div>
          ))}
        </div>
      </CardContent>
      <CardFooter>
        <Button variant="ghost" className="w-full justify-between">
          <span>View all backtests</span>
          <ArrowRight className="h-4 w-4" />
        </Button>
      </CardFooter>
    </Card>
  );
}
