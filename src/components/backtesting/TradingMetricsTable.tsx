
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";

interface TradingMetricsTableProps {
  full?: boolean;
}

export function TradingMetricsTable({ full = false }: TradingMetricsTableProps) {
  const basicMetrics = [
    { name: "Win Rate", value: "58.7%", description: "Percentage of winning trades" },
    { name: "Profit Factor", value: "1.92", description: "Gross profit / Gross loss" },
    { name: "Max Drawdown", value: "12.4%", description: "Largest peak-to-trough decline" },
    { name: "Sharpe Ratio", value: "1.32", description: "Risk-adjusted return measure" },
    { name: "Avg. Win Size", value: "₹2,140", description: "Average profit per winning trade" },
    { name: "Avg. Loss Size", value: "₹1,250", description: "Average loss per losing trade" },
  ];
  
  const advancedMetrics = [
    { name: "Win Rate", value: "58.7%", description: "Percentage of winning trades" },
    { name: "Profit Factor", value: "1.92", description: "Gross profit / Gross loss" },
    { name: "Max Drawdown", value: "12.4%", description: "Largest peak-to-trough decline" },
    { name: "Sharpe Ratio", value: "1.32", description: "Risk-adjusted return measure" },
    { name: "Sortino Ratio", value: "1.85", description: "Downside risk-adjusted return" },
    { name: "Avg. Win Size", value: "₹2,140", description: "Average profit per winning trade" },
    { name: "Avg. Loss Size", value: "₹1,250", description: "Average loss per losing trade" },
    { name: "Win/Loss Ratio", value: "1.71", description: "Avg. win / Avg. loss" },
    { name: "Expected Payoff", value: "₹645", description: "Average profit/loss per trade" },
    { name: "Recovery Factor", value: "2.63", description: "Net profit / Max drawdown" },
    { name: "Calmar Ratio", value: "1.42", description: "Annual return / Max drawdown" },
    { name: "Trades Per Month", value: "12.5", description: "Average number of trades per month" },
  ];
  
  const metrics = full ? advancedMetrics : basicMetrics;
  
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Metric</TableHead>
          <TableHead className="text-right">Value</TableHead>
          {full && <TableHead>Description</TableHead>}
        </TableRow>
      </TableHeader>
      <TableBody>
        {metrics.map((metric) => (
          <TableRow key={metric.name}>
            <TableCell className="font-medium">{metric.name}</TableCell>
            <TableCell className="text-right font-mono">{metric.value}</TableCell>
            {full && <TableCell className="text-muted-foreground text-sm">{metric.description}</TableCell>}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
