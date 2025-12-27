/**
 * Strategies Hook
 * Manages strategy data and operations
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient, Strategy, BacktestRequest, BacktestResult } from '@/lib/api';
import { toast } from 'sonner';

export function useStrategies() {
  return useQuery({
    queryKey: ['strategies'],
    queryFn: () => apiClient.getStrategies(),
    staleTime: 60000, // 1 minute
  });
}

export function useStrategy(id: string) {
  return useQuery({
    queryKey: ['strategy', id],
    queryFn: () => apiClient.getStrategy(id),
    enabled: !!id,
    staleTime: 30000, // 30 seconds
  });
}

export function useCreateStrategy() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (strategy: Partial<Strategy>) => apiClient.createStrategy(strategy),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['strategies'] });
      toast.success('Strategy created successfully');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create strategy');
    },
  });
}

export function useUpdateStrategy() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<Strategy> }) =>
      apiClient.updateStrategy(id, updates),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['strategies'] });
      queryClient.invalidateQueries({ queryKey: ['strategy', data.id] });
      toast.success('Strategy updated successfully');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update strategy');
    },
  });
}

export function useDeleteStrategy() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => apiClient.deleteStrategy(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['strategies'] });
      toast.success('Strategy deleted successfully');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete strategy');
    },
  });
}

export function useBacktests(strategyId?: string) {
  return useQuery({
    queryKey: ['backtests', strategyId],
    queryFn: () => apiClient.getBacktests(strategyId),
    staleTime: 30000, // 30 seconds
  });
}

export function useBacktest(id: string) {
  return useQuery({
    queryKey: ['backtest', id],
    queryFn: () => apiClient.getBacktest(id),
    enabled: !!id,
    refetchInterval: (data) => {
      // Poll every 2 seconds if backtest is running
      return data?.status === 'running' ? 2000 : false;
    },
  });
}

export function useCreateBacktest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (request: BacktestRequest) => apiClient.createBacktest(request),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['backtests'] });
      queryClient.setQueryData(['backtest', data.id], data);
      toast.success('Backtest started successfully');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to start backtest');
    },
  });
}