
import { useState } from "react";
import { BacktestingForm } from "@/components/backtesting/BacktestingForm";
import { BacktestingResults } from "@/components/backtesting/BacktestingResults";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChevronRight } from "lucide-react";
import { BackButton } from "@/components/BackButton";

const BacktestingModule = () => {
  const [isResultsReady, setIsResultsReady] = useState(false);
  const [activeTab, setActiveTab] = useState("setup");
  
  const handleRunBacktest = () => {
    // Simulate API call delay
    setTimeout(() => {
      setIsResultsReady(true);
      setActiveTab("results");
    }, 1500);
  };

  return (
    <div className="flex flex-col h-screen">
      <header className="border-b py-3 px-6 bg-background">
        <div className="flex items-center">
          <BackButton to="/dashboard" className="mr-2" />
          <div>
            <h1 className="text-xl font-semibold">Backtesting Module</h1>
            <div className="flex items-center text-sm text-muted-foreground">
              <span>EMA Crossover Strategy</span>
              <ChevronRight className="h-3 w-3 mx-1" />
              <span>Backtest</span>
            </div>
          </div>
        </div>
      </header>
      
      <div className="flex-1 p-6 overflow-auto">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-6">
            <TabsTrigger value="setup">Backtest Setup</TabsTrigger>
            <TabsTrigger value="results" disabled={!isResultsReady}>Results Analysis</TabsTrigger>
          </TabsList>
          
          <TabsContent value="setup">
            <BacktestingForm onRunBacktest={handleRunBacktest} />
          </TabsContent>
          
          <TabsContent value="results">
            <BacktestingResults hasResults={isResultsReady} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default BacktestingModule;
