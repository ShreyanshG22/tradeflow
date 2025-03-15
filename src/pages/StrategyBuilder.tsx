
import React from "react";
import { Link } from "react-router-dom";
import { Sidebar, SidebarProvider } from "@/components/ui/sidebar";
import { StrategyBlocks } from "@/components/strategy-builder/StrategyBlocks";
import { StrategyCanvas } from "@/components/strategy-builder/StrategyCanvas";
import { StrategyPreview } from "@/components/strategy-builder/StrategyPreview";
import { Button } from "@/components/ui/button";
import { LineChart, Play } from "lucide-react";

export default function StrategyBuilder() {
  return (
    <SidebarProvider>
      <div className="flex min-h-screen">
        <title>Strategy Builder | AlgoTrade</title>
        <Sidebar />
        <div className="flex flex-1 overflow-hidden">
          <div className="flex w-full flex-col">
            <div className="flex items-center justify-between border-b p-4">
              <h1 className="text-xl font-bold">Strategy Builder</h1>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" asChild>
                  <Link to="/backtesting">
                    <LineChart className="mr-2 h-4 w-4" />
                    Backtest
                  </Link>
                </Button>
                <Button size="sm" asChild>
                  <Link to="/live-trading">
                    <Play className="mr-2 h-4 w-4" />
                    Deploy Live
                  </Link>
                </Button>
              </div>
            </div>
            <div className="flex flex-1 overflow-hidden">
              <div className="w-64 border-r p-4">
                <StrategyBlocks />
              </div>
              <div className="flex-1 overflow-hidden">
                <StrategyCanvas />
              </div>
              <div className="w-64 border-l p-4">
                <StrategyPreview />
              </div>
            </div>
          </div>
        </div>
      </div>
    </SidebarProvider>
  );
}
