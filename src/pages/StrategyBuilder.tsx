
import { useState } from "react";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import { StrategyBlocks } from "@/components/strategy-builder/StrategyBlocks";
import { StrategyCanvas } from "@/components/strategy-builder/StrategyCanvas";
import { StrategyPreview } from "@/components/strategy-builder/StrategyPreview";
import { Button } from "@/components/ui/button";
import { Save, Play, RotateCcw, Undo, Redo, Trash2, ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

const StrategyBuilder = () => {
  const [strategyName, setStrategyName] = useState("Untitled Strategy");
  const { toast } = useToast();
  
  const handleSave = () => {
    toast({
      title: "Strategy saved",
      description: `${strategyName} has been saved successfully.`,
    });
  };
  
  const handleClearCanvas = () => {
    // This will be implemented in the StrategyCanvas component
    window.dispatchEvent(new CustomEvent('clearCanvas'));
    
    toast({
      title: "Canvas cleared",
      description: "All strategy blocks have been removed from the canvas.",
    });
  };

  return (
    <div className="flex flex-col h-screen">
      <header className="border-b py-4 px-6 flex items-center justify-between bg-background">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild className="mr-2">
            <Link to="/dashboard">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <Input 
              value={strategyName} 
              onChange={(e) => setStrategyName(e.target.value)}
              className="text-lg font-bold h-8 border-none focus-visible:ring-0 p-0 bg-transparent"
            />
            <p className="text-sm text-muted-foreground">Strategy Builder</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center mr-3 text-sm text-muted-foreground">
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <Undo className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <Redo className="h-4 w-4" />
            </Button>
          </div>
          
          <Button variant="outline" onClick={handleClearCanvas}>
            <Trash2 className="mr-2 h-4 w-4" />
            Clear
          </Button>
          
          <Button variant="outline" onClick={handleSave}>
            <Save className="mr-2 h-4 w-4" />
            Save
          </Button>
          
          <Button asChild>
            <Link to="/backtesting">
              <Play className="mr-2 h-4 w-4" />
              Backtest
            </Link>
          </Button>
        </div>
      </header>

      <div className="flex-1 overflow-hidden">
        <ResizablePanelGroup direction="horizontal" className="h-full">
          <ResizablePanel defaultSize={22} minSize={15} maxSize={30} className="bg-muted/10">
            <StrategyBlocks />
          </ResizablePanel>
          
          <ResizableHandle withHandle />
          
          <ResizablePanel defaultSize={50} minSize={40}>
            <StrategyCanvas />
          </ResizablePanel>
          
          <ResizableHandle withHandle />
          
          <ResizablePanel defaultSize={28} minSize={15} maxSize={35} className="bg-muted/10">
            <StrategyPreview />
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </div>
  );
};

export default StrategyBuilder;
