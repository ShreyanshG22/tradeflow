/**
 * Portfolio Hook
 * Manages portfolio data and operations
 */

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient, Portfolio, Trade } from '@/lib/api';
import { toast } from 'sonner';

export function usePortfolios() {
  return useQuery({
    queryKey: ['portfolios'],
    queryFn: () => apiClient.getPortfolios(),
    staleTime: 30000, // 30 seconds
  });
}

export function usePortfolio(id: string) {
  return useQuery({
    queryKey: ['portfolio', id],
    queryFn: () => apiClient.getPortfolio(id),
    enabled: !!id,
    staleTime: 10000, // 10 seconds for individual portfolio
  });
}

export function useCreatePortfolio() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (portfolio: Partial<Portfolio>) => apiClient.createPortfolio(portfolio),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['portfolios'] });
      toast.success('Portfolio created successfully');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create portfolio');
    },
  });
}

export function useUpdatePortfolio() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<Portfolio> }) =>
      apiClient.updatePortfolio(id, updates),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['portfolios'] });
      queryClient.invalidateQueries({ queryKey: ['portfolio', data.id] });
      toast.success('Portfolio updated successfully');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update portfolio');
    },
  });
}

export function useDeletePortfolio() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => apiClient.deletePortfolio(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['portfolios'] });
      toast.success('Portfolio deleted successfully');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete portfolio');
    },
  });
}

export function useTrades(portfolioId?: string, limit = 50, offset = 0) {
  return useQuery({
    queryKey: ['trades', portfolioId, limit, offset],
    queryFn: () => apiClient.getTrades(portfolioId, limit, offset),
    staleTime: 5000, // 5 seconds
  });
}

export function useCreateTrade() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (trade: Partial<Trade>) => apiClient.createTrade(trade),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trades'] });
      queryClient.invalidateQueries({ queryKey: ['portfolios'] });
      toast.success('Trade executed successfully');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to execute trade');
    },
  });
}

// Real-time portfolio updates
export function usePortfolioRealtime(portfolioId: string) {
  const [realtimeData, setRealtimeData] = useState<Partial<Portfolio> | null>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    const ws = apiClient.connectWebSocket();

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        if (data.type === 'portfolio_update' && data.portfolioId === portfolioId) {
          setRealtimeData(data.data);
          
          // Update the cached portfolio data
          queryClient.setQueryData(['portfolio', portfolioId], (oldData: Portfolio | undefined) => {
            if (oldData) {
              return { ...oldData, ...data.data };
            }
            return oldData;
          });
        }
      } catch (error) {
        console.error('Failed to parse WebSocket message:', error);
      }
    };

    // Subscribe to portfolio updates
    ws.onopen = () => {
      ws.send(JSON.stringify({
        type: 'subscribe',
        channel: 'portfolio',
        portfolioId: portfolioId
      }));
    };

    return () => {
      ws.close();
    };
  }, [portfolioId, queryClient]);

  return realtimeData;
}