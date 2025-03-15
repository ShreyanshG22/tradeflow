
import { useState } from "react";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import { StrategyBlocks } from "@/components/strategy-builder/StrategyBlocks";
import { StrategyCanvas } from "@/components/strategy-builder/StrategyCanvas";
import { StrategyPreview } from "@/components/strategy-builder/StrategyPreview";
import { Button } from "@/components/ui/button";
import { Save, Play } from "lucide-react";

const StrategyBuilder = () => {
  const [strategyName, setStrategyName] = useState("Untitled Strategy");

  return (
    <div className="flex flex-col h-screen">
      <header className="border-b py-4 px-6 flex items-center justify-between bg-background">
        <div>
          <h1 className="text-2xl font-bold">{strategyName}</h1>
          <p className="text-sm text-muted-foreground">Strategy Builder</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline">
            <Save className="mr-2 h-4 w-4" />
            Save
          </Button>
          <Button>
            <Play className="mr-2 h-4 w-4" />
            Backtest
          </Button>
        </div>
      </header>

      <div className="flex-1 overflow-hidden">
        <ResizablePanelGroup direction="horizontal" className="h-full">
          <ResizablePanel defaultSize={20} minSize={15} maxSize={30} className="bg-muted/10">
            <StrategyBlocks />
          </ResizablePanel>
          
          <ResizableHandle withHandle />
          
          <ResizablePanel defaultSize={60} minSize={40}>
            <StrategyCanvas />
          </ResizablePanel>
          
          <ResizableHandle withHandle />
          
          <ResizablePanel defaultSize={20} minSize={15} maxSize={30} className="bg-muted/10">
            <StrategyPreview />
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </div>
  );
};

export default StrategyBuilder;
