
import { LineChart, ArrowRight, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export function DashboardMarketOverview() {
  return (
    <Card className="col-span-1 md:col-span-3 lg:col-span-1">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div className="space-y-1">
          <CardTitle>Market Overview</CardTitle>
          <CardDescription>Live market data</CardDescription>
        </div>
        <LineChart className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className="text-sm font-medium text-muted-foreground">NIFTY 50</div>
              <div className="flex items-center gap-2">
                <div className="text-2xl font-bold">19,425.36</div>
                <div className="flex items-center text-sm font-medium text-green-500">
                  <ArrowUpRight className="h-4 w-4" />
                  +1.2%
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <div className="text-sm font-medium text-muted-foreground">SENSEX</div>
              <div className="flex items-center gap-2">
                <div className="text-2xl font-bold">64,718.56</div>
                <div className="flex items-center text-sm font-medium text-green-500">
                  <ArrowUpRight className="h-4 w-4" />
                  +0.9%
                </div>
              </div>
            </div>
          </div>
          <div className="space-y-2">
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1">
                <div className="text-xs font-medium text-muted-foreground">HDFC Bank</div>
                <div className="text-sm font-semibold">1,542.80</div>
                <div className="flex items-center text-xs font-medium text-red-500">
                  <ArrowDownRight className="h-3 w-3" />
                  -0.4%
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-xs font-medium text-muted-foreground">Reliance</div>
                <div className="text-sm font-semibold">2,780.15</div>
                <div className="flex items-center text-xs font-medium text-green-500">
                  <ArrowUpRight className="h-3 w-3" />
                  +1.1%
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-xs font-medium text-muted-foreground">TCS</div>
                <div className="text-sm font-semibold">3,456.70</div>
                <div className="flex items-center text-xs font-medium text-green-500">
                  <ArrowUpRight className="h-3 w-3" />
                  +0.6%
                </div>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
      <CardFooter>
        <Button variant="ghost" className="w-full justify-between">
          <span>View all markets</span>
          <ArrowRight className="h-4 w-4" />
        </Button>
      </CardFooter>
    </Card>
  );
}
