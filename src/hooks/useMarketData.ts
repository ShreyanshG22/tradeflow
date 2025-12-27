/**
 * Market Data Hook
 * Manages market data fetching and real-time updates
 */

import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient, MarketData, Candlestick } from '@/lib/api';

export function useMarketData(symbols: string[]) {
  return useQuery({
    queryKey: ['marketData', symbols],
    queryFn: () => apiClient.getMarketData(symbols),
    enabled: symbols.length > 0,
    staleTime: 5000, // 5 seconds
    refetchInterval: 10000, // Refetch every 10 seconds
  });
}

export function useHistoricalData(
  symbol: string,
  timeframe: string,
  startDate: string,
  endDate: string
) {
  return useQuery({
    queryKey: ['historicalData', symbol, timeframe, startDate, endDate],
    queryFn: () => apiClient.getHistoricalData(symbol, timeframe, startDate, endDate),
    enabled: !!symbol && !!timeframe && !!startDate && !!endDate,
    staleTime: 300000, // 5 minutes
  });
}

export function useSymbolSearch(query: string) {
  return useQuery({
    queryKey: ['symbolSearch', query],
    queryFn: () => apiClient.searchSymbols(query),
    enabled: query.length >= 2,
    staleTime: 300000, // 5 minutes
  });
}

// Real-time market data updates
export function useRealtimeMarketData(symbols: string[]) {
  const [realtimeData, setRealtimeData] = useState<Record<string, MarketData>>({});
  const queryClient = useQueryClient();

  useEffect(() => {
    if (symbols.length === 0) return;

    const ws = apiClient.connectWebSocket();

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        if (data.type === 'market_data_update') {
          const marketData: MarketData = data.data;
          
          setRealtimeData(prev => ({
            ...prev,
            [marketData.symbol]: marketData
          }));
          
          // Update the cached market data
          queryClient.setQueryData(['marketData', symbols], (oldData: MarketData[] | undefined) => {
            if (oldData) {
              return oldData.map(item => 
                item.symbol === marketData.symbol ? marketData : item
              );
            }
            return oldData;
          });
        }
      } catch (error) {
        console.error('Failed to parse WebSocket message:', error);
      }
    };

    // Subscribe to market data updates
    ws.onopen = () => {
      ws.send(JSON.stringify({
        type: 'subscribe',
        channel: 'market_data',
        symbols: symbols
      }));
    };

    return () => {
      ws.close();
    };
  }, [symbols, queryClient]);

  return realtimeData;
}

// Chart data formatting utilities
export function formatCandlestickData(data: Candlestick[]) {
  return data.map(candle => ({
    time: new Date(candle.timestamp).getTime(),
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close,
    volume: candle.volume,
  }));
}

export function formatLineChartData(data: Candlestick[], field: keyof Candlestick = 'close') {
  return data.map(candle => ({
    time: new Date(candle.timestamp).getTime(),
    value: candle[field] as number,
  }));
}