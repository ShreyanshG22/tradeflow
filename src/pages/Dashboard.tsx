
import { useEffect } from "react";
import { Link } from "react-router-dom";
import { PanelLeft, LayoutDashboard, LineChart, Zap, BarChart, Settings, Plus, Rocket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import {
  SidebarProvider,
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
  SidebarInset,
  useSidebar
} from "@/components/ui/sidebar";
import { DashboardMarketOverview } from "@/components/dashboard/MarketOverview";
import { DashboardActiveStrategies } from "@/components/dashboard/ActiveStrategies";
import { DashboardRecentBacktests } from "@/components/dashboard/RecentBacktests";

const Dashboard = () => {
  // Update the page title
  useEffect(() => {
    document.title = "Dashboard | TradeFlow";
  }, []);

  return (
    <SidebarProvider defaultOpen={true}>
      <div className="min-h-screen w-full flex bg-muted/10">
        <AppSidebar />
        <SidebarInset className="pt-6">
          <div className="container px-4 md:px-6">
            <div className="flex flex-col gap-2 md:gap-4">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
                  <p className="text-muted-foreground">Welcome back! Here's an overview of your trading activities.</p>
                </div>
                <div className="flex gap-2">
                  <Button asChild variant="outline" size="sm" className="gap-1">
                    <Link to="/backtest">
                      <LineChart className="h-4 w-4" />
                      <span className="hidden sm:inline">Backtest</span>
                    </Link>
                  </Button>
                  <Button asChild size="sm" className="gap-1">
                    <Link to="/strategy/new">
                      <Plus className="h-4 w-4" />
                      <span className="hidden sm:inline">New Strategy</span>
                    </Link>
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                <DashboardMarketOverview />
                <DashboardActiveStrategies />
                <DashboardRecentBacktests />
              </div>

              <div className="fixed bottom-8 right-8 flex flex-col gap-2">
                <Button size="icon" className="rounded-full h-14 w-14 shadow-lg">
                  <Plus className="h-6 w-6" />
                </Button>
              </div>
            </div>
          </div>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
};

const AppSidebar = () => {
  const { state, toggleSidebar } = useSidebar();
  const isExpanded = state === "expanded";

  return (
    <Sidebar>
      <SidebarHeader className="flex items-center justify-between p-4">
        <div className="flex items-center gap-2">
          <div className="relative w-8 h-8 rounded-lg bg-primary flex items-center justify-center overflow-hidden">
            <span className="text-primary-foreground font-semibold">T</span>
          </div>
          {isExpanded && <span className="font-semibold text-xl">TradeFlow</span>}
        </div>
        <SidebarTrigger />
      </SidebarHeader>
      <SidebarContent>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild isActive tooltip="Dashboard">
              <Link to="/dashboard">
                <LayoutDashboard className="h-5 w-5" />
                <span>Dashboard</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip="Strategy Builder">
              <Link to="/strategy">
                <PanelLeft className="h-5 w-5" />
                <span>Strategy Builder</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip="Backtesting">
              <Link to="/backtest">
                <LineChart className="h-5 w-5" />
                <span>Backtesting</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip="Live Trading">
              <Link to="/trading">
                <Zap className="h-5 w-5" />
                <span>Live Trading</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip="Performance Reports">
              <Link to="/reports">
                <BarChart className="h-5 w-5" />
                <span>Performance Reports</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip="Settings">
              <Link to="/settings">
                <Settings className="h-5 w-5" />
                <span>Settings</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarContent>
      <SidebarFooter className="p-4">
        <Button asChild variant="outline" className="w-full flex items-center gap-2">
          <Link to="/">
            <Rocket className="h-4 w-4" />
            <span>Back to Home</span>
          </Link>
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
};

export default Dashboard;
