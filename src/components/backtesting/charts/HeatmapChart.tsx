
import { ChartContainer } from "@/components/ui/chart";
import { memo } from "react";

// Dummy data for the heatmap
const generateHeatmapData = () => {
  const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
  const hours = Array.from({ length: 7 }, (_, i) => `${9 + i}:00`);
  
  const data = [];
  
  for (const day of days) {
    for (const hour of hours) {
      // Generate a random value between -5 and 10 for performance
      const performance = (Math.random() * 15) - 5;
      
      // Generate random trade count between 1 and 15
      const trades = Math.floor(Math.random() * 15) + 1;
      
      data.push({
        day,
        hour,
        performance,
        trades
      });
    }
  }
  
  return data;
};

const heatmapData = generateHeatmapData();

export function HeatmapChart() {
  const config = {};
  
  // Get min and max values for color scaling
  const performances = heatmapData.map(d => d.performance);
  const minPerf = Math.min(...performances);
  const maxPerf = Math.max(...performances);
  
  const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
  const hours = Array.from({ length: 7 }, (_, i) => `${9 + i}:00`);
  
  return (
    <ChartContainer config={config} className="h-full">
      <div className="relative h-full w-full p-4">
        {/* Color scale legend */}
        <div className="absolute right-4 top-0 flex flex-col text-xs gap-1">
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 bg-green-500 rounded-sm" />
            <span>Strong performance</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 bg-lime-200 rounded-sm" />
            <span>Average performance</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 bg-red-500 rounded-sm" />
            <span>Poor performance</span>
          </div>
        </div>
        
        <div className="grid grid-cols-[auto_1fr] w-full h-full pt-8">
          {/* Y-axis labels (days) */}
          <div className="flex flex-col justify-around pr-4 font-medium">
            {days.map(day => (
              <div key={day} className="text-sm text-right">{day}</div>
            ))}
          </div>
          
          {/* Heatmap cells and X-axis labels */}
          <div className="flex flex-col w-full h-full">
            <div className="grid grid-cols-7 w-full h-full">
              {days.map(day => (
                <div key={day} className="contents">
                  {hours.map(hour => {
                    const cell = heatmapData.find(d => d.day === day && d.hour === hour);
                    const normalizedPerformance = (cell.performance - minPerf) / (maxPerf - minPerf);
                    
                    // Generate color based on performance (red for negative, green for positive)
                    const bgColor = cell.performance < 0 
                      ? `rgb(${Math.floor(255 * Math.min(-cell.performance / minPerf, 1))}, 50, 50)`
                      : `rgb(50, ${Math.floor(100 + 155 * Math.min(cell.performance / maxPerf, 1))}, 50)`;
                    
                    return (
                      <div 
                        key={`${day}-${hour}`} 
                        className="border border-muted m-0.5 rounded-sm relative"
                        style={{ backgroundColor: bgColor }}
                      >
                        <div className="absolute inset-0 flex flex-col items-center justify-center text-white">
                          <div className="font-medium text-sm">{cell.performance.toFixed(1)}%</div>
                          <div className="text-xs opacity-80">{cell.trades} trades</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
            
            {/* X-axis labels (hours) */}
            <div className="grid grid-cols-7 mt-2">
              {hours.map(hour => (
                <div key={hour} className="text-xs text-center">{hour}</div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </ChartContainer>
  );
}
