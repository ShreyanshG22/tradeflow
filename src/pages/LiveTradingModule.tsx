
import React from "react";
import { Sidebar } from "@/components/ui/sidebar";
import { LiveTradingBrokerConnection } from "@/components/live-trading/LiveTradingBrokerConnection";
import { LiveTradingExecutionTable } from "@/components/live-trading/LiveTradingExecutionTable";
import { LiveTradingMonitoring } from "@/components/live-trading/LiveTradingMonitoring";

export default function LiveTradingModule() {
  return (
    <div className="flex min-h-screen">
      <title>Live Trading | AlgoTrade</title>
      <Sidebar />
      <div className="flex-1 p-6 lg:p-8">
        <div className="space-y-6">
          <div className="flex flex-col items-start justify-between gap-4 border-b pb-5 sm:flex-row sm:items-center">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Live Trading</h1>
              <p className="text-muted-foreground">
                Connect to brokers and monitor your live trading strategies
              </p>
            </div>
          </div>

          <div className="grid gap-6">
            <LiveTradingBrokerConnection />
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3">
              <div className="col-span-full md:col-span-2 lg:col-span-2">
                <LiveTradingExecutionTable />
              </div>
              <div className="col-span-full md:col-span-2 lg:col-span-1">
                <LiveTradingMonitoring />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
