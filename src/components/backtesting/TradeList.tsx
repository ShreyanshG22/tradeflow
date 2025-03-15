
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ArrowUp, ArrowDown } from "lucide-react";

interface TradeListProps {
  limit?: number;
}

export function TradeList({ limit }: TradeListProps) {
  // Mock trade data
  const trades = [
    { id: 1, date: "2023-06-10", symbol: "RELIANCE", type: "LONG", entry: 2450.75, exit: 2520.30, profit: 69.55, profitPercent: 2.84, status: "win" },
    { id: 2, date: "2023-06-15", symbol: "HDFC", type: "LONG", entry: 1672.50, exit: 1645.20, profit: -27.30, profitPercent: -1.63, status: "loss" },
    { id: 3, date: "2023-06-20", symbol: "TCS", type: "SHORT", entry: 3250.60, exit: 3150.75, profit: 99.85, profitPercent: 3.07, status: "win" },
    { id: 4, date: "2023-06-25", symbol: "INFY", type: "LONG", entry: 1450.25, exit: 1475.60, profit: 25.35, profitPercent: 1.75, status: "win" },
    { id: 5, date: "2023-06-30", symbol: "SBIN", type: "SHORT", entry: 585.40, exit: 602.30, profit: -16.90, profitPercent: -2.89, status: "loss" },
    { id: 6, date: "2023-07-05", symbol: "RELIANCE", type: "LONG", entry: 2490.30, exit: 2550.75, profit: 60.45, profitPercent: 2.43, status: "win" },
    { id: 7, date: "2023-07-10", symbol: "HCLTECH", type: "SHORT", entry: 1120.80, exit: 1145.60, profit: -24.80, profitPercent: -2.21, status: "loss" },
    { id: 8, date: "2023-07-15", symbol: "WIPRO", type: "LONG", entry: 420.35, exit: 405.20, profit: -15.15, profitPercent: -3.60, status: "loss" },
  ].slice(0, limit);

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Date</TableHead>
          <TableHead>Symbol</TableHead>
          <TableHead>Type</TableHead>
          <TableHead className="text-right">Entry</TableHead>
          <TableHead className="text-right">Exit</TableHead>
          <TableHead className="text-right">P/L</TableHead>
          <TableHead className="text-right">%</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {trades.map((trade) => (
          <TableRow key={trade.id}>
            <TableCell>{formatDate(trade.date)}</TableCell>
            <TableCell className="font-medium">{trade.symbol}</TableCell>
            <TableCell>
              {trade.type === "LONG" ? (
                <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800">
                  <ArrowUp className="h-3 w-3 mr-1" />
                  LONG
                </Badge>
              ) : (
                <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800">
                  <ArrowDown className="h-3 w-3 mr-1" />
                  SHORT
                </Badge>
              )}
            </TableCell>
            <TableCell className="text-right font-mono">₹{trade.entry.toFixed(2)}</TableCell>
            <TableCell className="text-right font-mono">₹{trade.exit.toFixed(2)}</TableCell>
            <TableCell className={`text-right font-mono ${trade.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {trade.profit >= 0 ? '+' : ''}₹{trade.profit.toFixed(2)}
            </TableCell>
            <TableCell className={`text-right font-mono ${trade.profitPercent >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {trade.profitPercent >= 0 ? '+' : ''}{trade.profitPercent.toFixed(2)}%
            </TableCell>
            <TableCell>
              {trade.status === "win" ? (
                <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800">
                  WIN
                </Badge>
              ) : (
                <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800">
                  LOSS
                </Badge>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-IN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}
