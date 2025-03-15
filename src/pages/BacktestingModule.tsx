
import React, { useState } from "react";
import { Sidebar, SidebarProvider } from "@/components/ui/sidebar";
import { BacktestingForm } from "@/components/backtesting/BacktestingForm";
import { BacktestingResults } from "@/components/backtesting/BacktestingResults";

export default function BacktestingModule() {
  const [hasResults, setHasResults] = useState(false);
  
  return (
    <SidebarProvider>
      <div className="flex min-h-screen">
        <title>Backtesting | AlgoTrade</title>
        <Sidebar />
        <div className="flex flex-1 flex-col">
          <div className="flex flex-col gap-6 p-6 md:p-8">
            <div className="flex flex-col gap-2">
              <h1 className="text-3xl font-bold tracking-tight">Backtesting</h1>
              <p className="text-muted-foreground">Test your trading strategies with historical data</p>
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <BacktestingForm />
              <BacktestingResults hasResults={hasResults} />
            </div>
          </div>
        </div>
      </div>
    </SidebarProvider>
  );
}
