
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowUpFromLine, ArrowDownFromLine, PercentCircle, TrendingUp, Scale, Activity } from "lucide-react";

export function TradeStatsCards() {
  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Total Return</CardTitle>
          <TrendingUp className="h-4 w-4 text-green-500" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">+₹32,650</div>
          <p className="text-xs text-muted-foreground">
            <span className="text-green-500">+32.65%</span> of initial capital
          </p>
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Win Rate</CardTitle>
          <PercentCircle className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">58.7%</div>
          <p className="text-xs text-muted-foreground">
            27 wins / 19 losses
          </p>
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Profit Factor</CardTitle>
          <Scale className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">1.92</div>
          <p className="text-xs text-muted-foreground">
            Gross profit / Gross loss
          </p>
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Max Drawdown</CardTitle>
          <Activity className="h-4 w-4 text-red-500" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">-12.4%</div>
          <p className="text-xs text-muted-foreground">
            ₹12,400 from peak
          </p>
        </CardContent>
      </Card>
    </>
  );
}
