
import { Play, Pause, ArrowRight, CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";

export function DashboardActiveStrategies() {
  const strategies = [
    {
      id: 1,
      name: "HDFC Bank Momentum",
      status: "active",
      profit: "+₹1,205.40",
      percentChange: "+2.4%",
      isPositive: true,
    },
    {
      id: 2,
      name: "IT Sector Swing",
      status: "active",
      profit: "+₹765.20",
      percentChange: "+1.2%",
      isPositive: true,
    },
    {
      id: 3,
      name: "Pharma Breakout",
      status: "paused",
      profit: "-₹340.75",
      percentChange: "-0.7%",
      isPositive: false,
    },
  ];

  return (
    <Card className="col-span-1 md:col-span-3 lg:col-span-1 h-full">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div className="space-y-1">
          <CardTitle>Active Strategies</CardTitle>
          <CardDescription>Real-time performance</CardDescription>
        </div>
        <div className="flex items-center gap-2 text-xs font-medium">
          <div className="flex items-center">
            <div className="mr-1 h-2 w-2 rounded-full bg-green-500"></div>
            Active
          </div>
          <div className="flex items-center">
            <div className="mr-1 h-2 w-2 rounded-full bg-amber-500"></div>
            Paused
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {strategies.map((strategy) => (
            <div key={strategy.id} className="flex items-center justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <div className={`h-2 w-2 rounded-full ${strategy.status === 'active' ? 'bg-green-500' : 'bg-amber-500'}`}></div>
                  <span className="font-medium">{strategy.name}</span>
                </div>
                <div className={`text-sm font-medium ${strategy.isPositive ? 'text-green-500' : 'text-red-500'}`}>
                  {strategy.profit} ({strategy.percentChange})
                </div>
              </div>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                {strategy.status === 'active' ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              </Button>
            </div>
          ))}
        </div>
      </CardContent>
      <CardFooter>
        <Button asChild variant="ghost" className="w-full justify-between">
          <Link to="/strategy-builder">
            <span>Manage strategies</span>
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </CardFooter>
    </Card>
  );
}
