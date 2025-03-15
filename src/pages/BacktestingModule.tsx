
import { useState } from "react";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import { BacktestingForm } from "@/components/backtesting/BacktestingForm";
import { BacktestingResults } from "@/components/backtesting/BacktestingResults"; 
import { Button } from "@/components/ui/button";
import { Play, Save, ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";

const BacktestingModule = () => {
  const [isBacktestRunning, setIsBacktestRunning] = useState(false);
  const [hasResults, setHasResults] = useState(false);

  const handleRunBacktest = () => {
    setIsBacktestRunning(true);
    // Simulate a backtest run
    setTimeout(() => {
      setIsBacktestRunning(false);
      setHasResults(true);
    }, 2000);
  };

  return (
    <div className="flex flex-col h-screen">
      <header className="border-b py-4 px-6 flex items-center justify-between bg-background">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" asChild>
            <Link to="/strategy-builder">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Backtesting Module</h1>
            <p className="text-sm text-muted-foreground">Test your strategy against historical data</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {hasResults && (
            <Button variant="outline">
              <Save className="mr-2 h-4 w-4" />
              Save Results
            </Button>
          )}
          <Button onClick={handleRunBacktest} disabled={isBacktestRunning}>
            <Play className="mr-2 h-4 w-4" />
            {isBacktestRunning ? "Running..." : "Run Backtest"}
          </Button>
        </div>
      </header>

      <div className="flex-1 overflow-hidden">
        <ResizablePanelGroup direction="horizontal" className="h-full">
          <ResizablePanel defaultSize={25} minSize={20} maxSize={40} className="bg-muted/10">
            <BacktestingForm />
          </ResizablePanel>
          
          <ResizableHandle withHandle />
          
          <ResizablePanel defaultSize={75}>
            <BacktestingResults hasResults={hasResults} />
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </div>
  );
};

export default BacktestingModule;
