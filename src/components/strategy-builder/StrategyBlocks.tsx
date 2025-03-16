
import { useState } from "react";
import { ArrowDownToLine, ArrowUpFromLine, Activity, DollarSign, Calculator, Search, Clock, Percent, Layers, ChevronDown, ChevronUp, TrendingUp, BarChart2, CandlestickChart, Volume2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

type StrategyBlockCategory = {
  title: string;
  icon: React.ReactNode;
  collapsed?: boolean;
  blocks: {
    id: string;
    name: string;
    description: string;
    tooltip?: string;
  }[];
};

const categoryData: StrategyBlockCategory[] = [
  {
    title: "Entry Conditions",
    icon: <ArrowDownToLine className="h-5 w-5" />,
    blocks: [
      { id: "entry-price-above", name: "Price Above", description: "Enter when price is above a value", tooltip: "Triggers entry when the price is greater than a specified value" },
      { id: "entry-price-below", name: "Price Below", description: "Enter when price is below a value", tooltip: "Triggers entry when the price is less than a specified value" },
      { id: "entry-crossover", name: "Crossover", description: "Enter on indicator crossover", tooltip: "Triggers entry when one line crosses above another" },
      { id: "entry-volume-spike", name: "Volume Spike", description: "Enter on volume increase", tooltip: "Triggers entry when volume increases by a percentage" },
      { id: "entry-candlestick", name: "Candlestick Pattern", description: "Enter on pattern formation", tooltip: "Triggers entry when a specific candlestick pattern forms" },
      { id: "entry-market-condition", name: "Market Condition", description: "Enter based on index/market", tooltip: "Triggers entry based on broader market conditions" }
    ]
  },
  {
    title: "Exit Conditions",
    icon: <ArrowUpFromLine className="h-5 w-5" />,
    blocks: [
      { id: "exit-take-profit", name: "Take Profit", description: "Exit at profit target", tooltip: "Exits position when profit reaches specified target" },
      { id: "exit-stop-loss", name: "Stop Loss", description: "Exit at stop loss level", tooltip: "Exits position when loss reaches specified level" },
      { id: "exit-trailing-stop", name: "Trailing Stop", description: "Dynamic stop loss that follows price", tooltip: "Exits position with a stop that adjusts as price moves favorably" },
      { id: "exit-time-based", name: "Time-Based Exit", description: "Exit after time period", tooltip: "Exits position after a specific time period has elapsed" },
      { id: "exit-indicator", name: "Indicator Exit", description: "Exit on indicator signal", tooltip: "Exits position based on technical indicator signals" }
    ]
  },
  {
    title: "Logic Operators",
    icon: <Calculator className="h-5 w-5" />,
    blocks: [
      { id: "operator-and", name: "AND", description: "Both conditions must be true", tooltip: "Requires all connected conditions to be true" },
      { id: "operator-or", name: "OR", description: "Either condition can be true", tooltip: "Requires at least one connected condition to be true" },
      { id: "operator-not", name: "NOT", description: "Inverts the condition", tooltip: "Makes the condition true when it's false and vice versa" },
      { id: "operator-xor", name: "XOR", description: "Exclusive OR", tooltip: "Requires exactly one connected condition to be true" }
    ]
  },
  {
    title: "Indicators",
    icon: <Activity className="h-5 w-5" />,
    blocks: [
      { id: "indicator-rsi", name: "RSI", description: "Relative Strength Index", tooltip: "Momentum oscillator that measures the speed and change of price movements" },
      { id: "indicator-macd", name: "MACD", description: "Moving Average Convergence Divergence", tooltip: "Trend-following momentum indicator showing relationship between two moving averages" },
      { id: "indicator-bollinger", name: "Bollinger Bands", description: "Volatility bands", tooltip: "Shows price volatility with upper and lower bands around a moving average" },
      { id: "indicator-moving-avg", name: "Moving Average", description: "Average price over N periods", tooltip: "Shows the average price over a specified number of periods" },
      { id: "indicator-vwap", name: "VWAP", description: "Volume-Weighted Average Price", tooltip: "Average price weighted by volume over a specific time frame" },
      { id: "indicator-atr", name: "ATR", description: "Average True Range", tooltip: "Measures market volatility by decomposing price range" }
    ]
  },
  {
    title: "Position Sizing",
    icon: <DollarSign className="h-5 w-5" />,
    blocks: [
      { id: "size-fixed", name: "Fixed Size", description: "Trade with fixed position size", tooltip: "Uses the same position size for every trade" },
      { id: "size-percent", name: "Percent of Capital", description: "Size based on capital percentage", tooltip: "Calculates position size as a percentage of available capital" },
      { id: "size-risk", name: "Risk-Based", description: "Size based on risk per trade", tooltip: "Calculates position size to risk a specific percentage of capital" },
      { id: "size-volatility", name: "Volatility-Based", description: "Size based on market volatility", tooltip: "Adjusts position size according to current market volatility" }
    ]
  },
  {
    title: "Time Frames",
    icon: <Clock className="h-5 w-5" />,
    blocks: [
      { id: "timeframe-1min", name: "1 Minute", description: "Use 1-minute candles", tooltip: "Analyzes data using 1-minute timeframe" },
      { id: "timeframe-5min", name: "5 Minutes", description: "Use 5-minute candles", tooltip: "Analyzes data using 5-minute timeframe" },
      { id: "timeframe-15min", name: "15 Minutes", description: "Use 15-minute candles", tooltip: "Analyzes data using 15-minute timeframe" },
      { id: "timeframe-1hour", name: "1 Hour", description: "Use 1-hour candles", tooltip: "Analyzes data using 1-hour timeframe" },
      { id: "timeframe-daily", name: "Daily", description: "Use daily candles", tooltip: "Analyzes data using daily timeframe" }
    ]
  }
];

export function StrategyBlocks() {
  const [searchTerm, setSearchTerm] = useState('');
  const [categories, setCategories] = useState(categoryData);

  const onDragStart = (event: React.DragEvent, nodeType: string) => {
    event.dataTransfer.setData('application/reactflow', nodeType);
    event.dataTransfer.effectAllowed = 'move';
    
    // Create a ghost image for the drag
    const ghostElement = document.createElement('div');
    ghostElement.classList.add('bg-background', 'border', 'rounded-md', 'p-2', 'text-sm', 'shadow-md');
    ghostElement.textContent = nodeType.split('-').slice(1).join(' ');
    document.body.appendChild(ghostElement);
    ghostElement.style.position = 'absolute';
    ghostElement.style.top = '-1000px';
    event.dataTransfer.setDragImage(ghostElement, 20, 20);
    
    // Remove the ghost element after drag
    setTimeout(() => {
      document.body.removeChild(ghostElement);
    }, 0);
  };

  const toggleCategory = (index: number) => {
    const newCategories = [...categories];
    newCategories[index].collapsed = !newCategories[index].collapsed;
    setCategories(newCategories);
  };

  const filteredCategories = categories.map(category => {
    const filteredBlocks = category.blocks.filter(block => 
      block.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
      block.description.toLowerCase().includes(searchTerm.toLowerCase())
    );
    return { ...category, blocks: filteredBlocks };
  }).filter(category => category.blocks.length > 0);

  return (
    <ScrollArea className="h-full">
      <div className="p-4 space-y-6">
        <div className="relative">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search blocks..."
            className="pl-8"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        
        {filteredCategories.map((category, index) => (
          <Collapsible 
            key={category.title} 
            defaultOpen={!category.collapsed}
            className="space-y-2"
          >
            <CollapsibleTrigger className="flex items-center gap-2 font-medium w-full hover:text-primary transition-colors">
              <div className="flex items-center justify-between w-full">
                <div className="flex items-center gap-2">
                  {category.icon}
                  <h3>{category.title}</h3>
                </div>
                {category.collapsed ? 
                  <ChevronDown className="h-4 w-4" /> : 
                  <ChevronUp className="h-4 w-4" />
                }
              </div>
            </CollapsibleTrigger>
            
            <CollapsibleContent className="space-y-2">
              {category.blocks.map((block) => (
                <TooltipProvider key={block.id}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Card 
                        className="cursor-grab active:cursor-grabbing hover:border-primary/50 hover:shadow-sm transition-all"
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
                    </TooltipTrigger>
                    {block.tooltip && (
                      <TooltipContent side="right" className="max-w-xs">
                        <p>{block.tooltip}</p>
                      </TooltipContent>
                    )}
                  </Tooltip>
                </TooltipProvider>
              ))}
            </CollapsibleContent>
          </Collapsible>
        ))}
      </div>
    </ScrollArea>
  );
}
