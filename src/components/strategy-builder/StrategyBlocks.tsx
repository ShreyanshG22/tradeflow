
import { ArrowDownToLine, ArrowUpFromLine, Activity, DollarSign, Layers } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";

type StrategyBlockCategory = {
  title: string;
  icon: React.ReactNode;
  blocks: {
    id: string;
    name: string;
    description: string;
  }[];
};

const categoryData: StrategyBlockCategory[] = [
  {
    title: "Entry Conditions",
    icon: <ArrowDownToLine className="h-5 w-5" />,
    blocks: [
      { id: "entry-price-above", name: "Price Above", description: "Enter when price is above a value" },
      { id: "entry-price-below", name: "Price Below", description: "Enter when price is below a value" },
      { id: "entry-crossover", name: "Crossover", description: "Enter on indicator crossover" },
    ]
  },
  {
    title: "Exit Conditions",
    icon: <ArrowUpFromLine className="h-5 w-5" />,
    blocks: [
      { id: "exit-take-profit", name: "Take Profit", description: "Exit at profit target" },
      { id: "exit-stop-loss", name: "Stop Loss", description: "Exit at stop loss level" },
      { id: "exit-trailing-stop", name: "Trailing Stop", description: "Dynamic stop loss that follows price" },
    ]
  },
  {
    title: "Indicators",
    icon: <Activity className="h-5 w-5" />,
    blocks: [
      { id: "indicator-rsi", name: "RSI", description: "Relative Strength Index" },
      { id: "indicator-macd", name: "MACD", description: "Moving Average Convergence Divergence" },
      { id: "indicator-bollinger", name: "Bollinger Bands", description: "Volatility bands" },
    ]
  },
  {
    title: "Position Sizing",
    icon: <DollarSign className="h-5 w-5" />,
    blocks: [
      { id: "size-fixed", name: "Fixed Size", description: "Trade with fixed position size" },
      { id: "size-percent", name: "Percent of Capital", description: "Size based on capital percentage" },
      { id: "size-risk", name: "Risk-Based", description: "Size based on risk per trade" },
    ]
  },
];

export function StrategyBlocks() {
  const onDragStart = (event: React.DragEvent, nodeType: string) => {
    event.dataTransfer.setData('application/reactflow', nodeType);
    event.dataTransfer.effectAllowed = 'move';
  };

  return (
    <ScrollArea className="h-full p-4">
      <div className="space-y-6">
        {categoryData.map((category) => (
          <div key={category.title} className="space-y-3">
            <div className="flex items-center gap-2 font-medium">
              {category.icon}
              <h3>{category.title}</h3>
            </div>
            <div className="space-y-2">
              {category.blocks.map((block) => (
                <Card 
                  key={block.id}
                  className="cursor-grab active:cursor-grabbing hover:border-primary/50 transition-colors"
                  draggable
                  onDragStart={(event) => onDragStart(event, block.id)}
                >
                  <CardHeader className="py-3 px-3">
                    <CardTitle className="text-sm font-medium">{block.name}</CardTitle>
                  </CardHeader>
                  <CardContent className="py-0 px-3 pb-3">
                    <p className="text-xs text-muted-foreground">{block.description}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}
