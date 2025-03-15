
import React from "react";
import { Link } from "react-router-dom";
import { Sidebar, SidebarMenuItem, SidebarMenuButton } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard,
  Brain,
  LineChart,
  Settings,
  HelpCircle,
  LogOut,
  Play,
  BellRing,
  Plus,
} from "lucide-react";
import { DashboardMarketOverview } from "@/components/dashboard/MarketOverview";
import { DashboardActiveStrategies } from "@/components/dashboard/ActiveStrategies";
import { DashboardRecentBacktests } from "@/components/dashboard/RecentBacktests";

export default function Dashboard() {
  return (
    <div className="flex h-screen bg-background">
      <title>Dashboard | AlgoTrade</title>
      <Sidebar>
        <div className="flex h-full flex-col">
          <div className="p-2">
            <h2 className="mb-4 ml-4 text-xl font-semibold tracking-tight">AlgoTrade</h2>
            <div className="space-y-1">
              <SidebarMenuItem>
                <SidebarMenuButton asChild tooltip="Dashboard">
                  <Link to="/dashboard">
                    <LayoutDashboard className="h-5 w-5" />
                    <span>Dashboard</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild tooltip="Strategy Builder">
                  <Link to="/strategy-builder">
                    <Brain className="h-5 w-5" />
                    <span>Strategy Builder</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild tooltip="Backtesting">
                  <Link to="/backtesting">
                    <LineChart className="h-5 w-5" />
                    <span>Backtesting</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild tooltip="Live Trading">
                  <Link to="/live-trading">
                    <Play className="h-5 w-5" />
                    <span>Live Trading</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </div>
          </div>
          <div className="mt-auto hidden p-2 pt-6 lg:block">
            <div className="space-y-2">
              <SidebarMenuItem>
                <SidebarMenuButton tooltip="Settings">
                  <Settings className="h-5 w-5" />
                  <span>Settings</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton tooltip="Help">
                  <HelpCircle className="h-5 w-5" />
                  <span>Help</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton tooltip="Logout">
                  <LogOut className="h-5 w-5" />
                  <span>Logout</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </div>
          </div>
        </div>
      </Sidebar>

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="sticky top-0 z-10 border-b bg-background">
          <div className="flex h-16 items-center justify-between px-4 sm:px-6">
            <div>
              <h1 className="text-xl font-semibold text-foreground">Dashboard</h1>
            </div>
            <div className="flex items-center gap-4">
              <Button asChild variant="outline" size="icon">
                <div>
                  <BellRing className="h-5 w-5" />
                  <span className="sr-only">Notifications</span>
                </div>
              </Button>
              <Button asChild variant="outline" size="icon">
                <div>
                  <HelpCircle className="h-5 w-5" />
                  <span className="sr-only">Help</span>
                </div>
              </Button>
              <Button asChild variant="outline" size="icon">
                <div>
                  <Settings className="h-5 w-5" />
                  <span className="sr-only">Settings</span>
                </div>
              </Button>
            </div>
          </div>
          <div className="border-t px-4 py-3 sm:px-6">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex-1">
                <h2 className="text-sm font-medium text-muted-foreground">
                  Welcome back! Here's an overview of your trading
                </h2>
              </div>
              <div className="flex gap-2">
                <Button asChild variant="outline" size="sm" className="gap-1">
                  <Link to="/backtesting">
                    <LineChart className="h-4 w-4" />
                    <span className="hidden sm:inline">Backtest</span>
                  </Link>
                </Button>
                <Button asChild variant="outline" size="sm" className="gap-1">
                  <Link to="/live-trading">
                    <Play className="h-4 w-4" />
                    <span className="hidden sm:inline">Live Trading</span>
                  </Link>
                </Button>
                <Button asChild size="sm" className="gap-1">
                  <Link to="/strategy-builder">
                    <Plus className="h-4 w-4" />
                    <span className="hidden sm:inline">New Strategy</span>
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-auto p-4 sm:p-6">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-7">
            <DashboardMarketOverview />
            <DashboardActiveStrategies />
            <DashboardRecentBacktests />
          </div>
        </main>
      </div>
    </div>
  );
}
