
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Line, LineChart, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

// Define a proper type for our data
interface MonteCarloDataPoint {
  period: number;
  actual?: number; // Make this optional since it's only added to main simulation
  [key: string]: number | string | undefined; // For dynamic sim0, sim1, etc. properties and colors
}

// Generate Monte Carlo simulation data
const generateMonteCarloData = () => {
  const numSimulations = 50;
  const numPeriods = 100;
  const baseEquity = 100000;
  
  // Create data array with one entry per period with proper typing
  const data: MonteCarloDataPoint[] = Array.from({ length: numPeriods }, (_, i) => ({ 
    period: i + 1, 
  }));
  
  // Function to calculate equity curves with random variations
  for (let sim = 0; sim < numSimulations; sim++) {
    let equity = baseEquity;
    const isMainSim = sim === 0; // Make the first simulation the "actual" result
    
    // Assign a random color for this simulation line
    const colorOpacity = isMainSim ? 1 : 0.15; // Main simulation fully opaque, others transparent
    const lineColor = isMainSim ? 'hsl(var(--primary))' : `rgba(100, 100, 200, ${colorOpacity})`;
    
    // Create an equity curve for this simulation
    for (let period = 0; period < numPeriods; period++) {
      // Random return between -2% and +3% with some serial correlation
      let returnPct;
      
      if (isMainSim) {
        // Make the main simulation a bit more predictable for demo purposes
        returnPct = (Math.random() * 3.5) - 1 + (period < 70 ? 0.5 : -1);
      } else {
        returnPct = (Math.random() * 5) - 2;
      }
      
      equity = equity * (1 + returnPct / 100);
      
      // Add this equity value to the data array
      data[period][`sim${sim}`] = equity;
      data[period][`color${sim}`] = lineColor; // Now correctly typed as string
      
      // Mark the main simulation
      if (isMainSim) {
        data[period].actual = equity;
      }
    }
  }
  
  return data;
};

const monteCarloData = generateMonteCarloData();

export function MonteCarloChart() {
  const config = {
    main: {
      label: "Actual Performance",
      color: "hsl(var(--primary))",
    },
  };
  
  // Extract all simulation keys from the first data point
  const simKeys = Object.keys(monteCarloData[0])
    .filter(key => key.startsWith('sim') && key !== 'sim0');
  
  return (
    <ChartContainer config={config} className="h-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={monteCarloData} margin={{ top: 10, right: 10, left: 10, bottom: 10 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis 
            dataKey="period" 
            tickLine={false}
            axisLine={false}
            label={{ value: 'Trading Periods', position: 'insideBottom', offset: -5 }}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            tickFormatter={(val) => `₹${(val / 1000).toFixed(0)}K`}
            domain={['dataMin - 10000', 'dataMax + 10000']}
            label={{ value: 'Equity', angle: -90, position: 'insideLeft' }}
          />
          <Tooltip content={<CustomTooltip />} />
          
          {/* Render all simulation lines first (behind the main line) */}
          {simKeys.map((key, i) => (
            <Line 
              key={key}
              type="monotone" 
              dataKey={key} 
              dot={false}
              activeDot={false}
              stroke={`rgba(100, 100, 200, 0.15)`}
              strokeWidth={1}
            />
          ))}
          
          {/* Render the main simulation line last (on top) */}
          <Line 
            type="monotone" 
            dataKey="sim0" 
            stroke="hsl(var(--primary))" 
            strokeWidth={2.5}
            dot={false}
            name="Actual Performance"
          />
        </LineChart>
      </ResponsiveContainer>
    </ChartContainer>
  );
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const actualData = payload.find(p => p.dataKey === 'sim0');
    
    if (actualData) {
      return (
        <div className="bg-background border border-border p-2 rounded-md shadow-sm">
          <p className="font-medium text-sm">Period {label}</p>
          <p className="text-sm">
            <span className="text-primary">Actual Equity: </span>
            <span className="font-mono">₹{Math.round(actualData.value).toLocaleString('en-IN')}</span>
          </p>
        </div>
      );
    }
  }

  return null;
};
