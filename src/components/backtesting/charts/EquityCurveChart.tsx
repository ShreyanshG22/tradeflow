
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, XAxis, YAxis, Tooltip } from "recharts";

// Mock data for the equity curve
const generateEquityCurveData = () => {
  const data = [];
  let equity = 100000;
  const startDate = new Date(2023, 0, 1);
  
  for (let i = 0; i < 180; i++) {
    const date = new Date(startDate);
    date.setDate(startDate.getDate() + i);
    
    // Create some random price movements
    const change = (Math.random() * 2 - 0.5) * 1000;
    equity += change;
    
    // Add a drawdown period
    if (i > 60 && i < 90) {
      equity -= Math.random() * 500;
    }
    
    // Add a strong bullish period
    if (i > 120 && i < 150) {
      equity += Math.random() * 1500;
    }
    
    data.push({
      date: date.toISOString().split('T')[0],
      equity: Math.max(equity, 20000), // Ensure we don't go too low for the demo
    });
  }
  
  return data;
};

const equityCurveData = generateEquityCurveData();

interface EquityCurveChartProps {
  chartHeight?: number;
}

export function EquityCurveChart({ chartHeight = 300 }: EquityCurveChartProps) {
  const config = {
    equity: {
      label: "Equity",
      color: "hsl(var(--primary))",
    },
  };
  
  return (
    <ChartContainer config={config} className="h-full">
      <ResponsiveContainer width="100%" height={chartHeight}>
        <AreaChart data={equityCurveData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="colorEquity" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
              <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis 
            dataKey="date" 
            tickLine={false}
            axisLine={false}
            tickFormatter={(val) => {
              const date = new Date(val);
              return `${date.getDate()}/${date.getMonth() + 1}`;
            }}
            minTickGap={30}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            tickFormatter={(val) => `₹${(val / 1000).toFixed(0)}K`}
            domain={['dataMin - 10000', 'dataMax + 5000']}
          />
          <Tooltip content={<CustomTooltip />} />
          <Area 
            type="monotone" 
            dataKey="equity" 
            stroke="hsl(var(--primary))" 
            strokeWidth={2}
            fill="url(#colorEquity)" 
            name="Equity"
          />
        </AreaChart>
      </ResponsiveContainer>
    </ChartContainer>
  );
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const date = new Date(label);
    const formattedDate = date.toLocaleDateString('en-IN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
    
    return (
      <div className="bg-background border border-border p-2 rounded-md shadow-sm">
        <p className="font-medium text-sm">{formattedDate}</p>
        <p className="text-sm">
          <span className="text-primary">Equity: </span>
          <span className="font-mono">₹{payload[0].value.toLocaleString('en-IN')}</span>
        </p>
      </div>
    );
  }

  return null;
};
