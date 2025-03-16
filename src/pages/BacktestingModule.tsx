import { useState, useEffect } from "react";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import { BacktestingForm } from "@/components/backtesting/BacktestingForm";
import { BacktestingResults } from "@/components/backtesting/BacktestingResults"; 
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Play, Pause, Save, XCircle, ArrowLeft, Zap, Clock } from "lucide-react";
import { Link } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";

const BacktestingModule = () => {
  const [isBacktestRunning, setIsBacktestRunning] = useState(false);
  const [hasResults, setHasResults] = useState(false);
  const [progress, setProgress] = useState(0);
  const [timeElapsed, setTimeElapsed] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [fastMode, setFastMode] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    if (isBacktestRunning && !isPaused) {
      interval = setInterval(() => {
        setProgress((prev) => {
          const increment = fastMode ? 5 : 1;
          const newValue = prev + increment;
          
          if (newValue >= 100) {
            clearInterval(interval);
            setIsBacktestRunning(false);
            setHasResults(true);
            setProgress(100);
            
            toast({
              title: "Backtest completed",
              description: "Your backtest has finished running successfully.",
            });
            
            return 100;
          }
          
          return newValue;
        });
        
        setTimeElapsed((prev) => prev + 1);
      }, 100);
    }
    
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isBacktestRunning, isPaused, fastMode, toast]);

  const handleRunBacktest = () => {
    if (isBacktestRunning) return;
    
    setIsBacktestRunning(true);
    setProgress(0);
    setTimeElapsed(0);
    
    toast({
      title: "Backtest started",
      description: fastMode ? "Running in fast mode..." : "Running backtest...",
    });
  };

  const handlePauseBacktest = () => {
    setIsPaused(!isPaused);
    
    toast({
      title: isPaused ? "Backtest resumed" : "Backtest paused",
      description: isPaused ? "Continuing execution..." : "You can resume at any time.",
    });
  };

  const handleCancelBacktest = () => {
    if (!isBacktestRunning) return;
    
    setIsBacktestRunning(false);
    setIsPaused(false);
    setProgress(0);
    setTimeElapsed(0);
    
    toast({
      title: "Backtest cancelled",
      description: "The backtest was stopped and progress was discarded.",
      variant: "destructive",
    });
  };

  const toggleFastMode = () => {
    setFastMode(!fastMode);
    
    toast({
      title: fastMode ? "Fast mode disabled" : "Fast mode enabled",
      description: fastMode 
        ? "Backtest will run at normal speed" 
        : "Backtest will run at accelerated speed",
    });
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  const calculateEstimatedTime = (): string => {
    if (progress === 0) return "--:--";
    
    const totalTime = (timeElapsed / progress) * 100;
    const remainingTime = totalTime - timeElapsed;
    return formatTime(Math.floor(remainingTime));
  };

  const handleSaveResults = () => {
    toast({
      title: "Results saved",
      description: "Backtest results have been saved to your account."
    });
  };

  return (
    <div className="flex flex-col h-screen">
      <header className="border-b py-4 px-6 flex items-center justify-between bg-background">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" asChild>
            <Link to="/dashboard">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Backtesting Module</h1>
            <p className="text-sm text-muted-foreground">Test your strategy against historical data</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isBacktestRunning && (
            <div className="flex items-center gap-4 max-w-md mr-4">
              <Progress value={progress} className="w-40 h-2" />
              <div className="flex flex-col text-xs">
                <span>{progress.toFixed(0)}% complete</span>
                <span className="text-muted-foreground flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {formatTime(timeElapsed)} / Est. {calculateEstimatedTime()}
                </span>
              </div>
            </div>
          )}
          
          {hasResults && !isBacktestRunning && (
            <Button variant="outline" onClick={handleSaveResults}>
              <Save className="mr-2 h-4 w-4" />
              Save Results
            </Button>
          )}
          
          {isBacktestRunning && (
            <>
              <Button variant="outline" size="sm" onClick={toggleFastMode}>
                <Zap className={`mr-2 h-4 w-4 ${fastMode ? "text-amber-500" : ""}`} />
                {fastMode ? "Fast Mode: ON" : "Fast Mode"}
              </Button>
              
              <Button variant="outline" size="sm" onClick={handlePauseBacktest}>
                <Pause className="mr-2 h-4 w-4" />
                {isPaused ? "Resume" : "Pause"}
              </Button>
              
              <Button variant="outline" size="sm" onClick={handleCancelBacktest}>
                <XCircle className="mr-2 h-4 w-4" />
                Cancel
              </Button>
            </>
          )}
          
          <Button 
            onClick={handleRunBacktest} 
            disabled={isBacktestRunning}
          >
            <Play className="mr-2 h-4 w-4" />
            {isBacktestRunning ? "Running..." : "Run Backtest"}
          </Button>
        </div>
      </header>

      <div className="flex-1 overflow-hidden">
        <ResizablePanelGroup direction="horizontal" className="h-full">
          <ResizablePanel defaultSize={25} minSize={20} maxSize={40} className="bg-muted/10">
            <BacktestingForm 
              onRunBacktest={handleRunBacktest} 
              isRunning={isBacktestRunning}
              fastMode={fastMode}
              onSetFastMode={setFastMode}
            />
          </ResizablePanel>
          
          <ResizableHandle withHandle />
          
          <ResizablePanel defaultSize={75}>
            <BacktestingResults 
              hasResults={hasResults} 
              progress={progress} 
              isRunning={isBacktestRunning}
            />
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </div>
  );
};

export default BacktestingModule;
