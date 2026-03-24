'use client';

import useSWR from 'swr';
import type { IntradayDayData, IntradayChartPoint } from '@/lib/types/intraday';

const fetcher = async (url: string) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error('Failed to fetch intraday data');
  return response.json();
};

/**
 * 單日盤中數據 hook（用於 day drill-down panel）
 * - 過去的日期：不自動刷新（數據不會變）
 * - 今天：每 5 分鐘刷新
 */
export function useIntradayData(date: string | null) {
  const today = new Date().toISOString().split('T')[0];
  const isToday = date === today;

  const { data, error, isLoading } = useSWR<IntradayDayData>(
    date ? `/api/intraday?date=${date}` : null,
    fetcher,
    {
      revalidateOnFocus: false,
      refreshInterval: isToday ? 5 * 60 * 1000 : 0, // 今天：5 分鐘，歷史：不刷新
      dedupingInterval: 60 * 1000,
      errorRetryCount: 2,
      keepPreviousData: true,
    }
  );

  return { data, error, isLoading };
}

/**
 * 多日小時級數據 hook（用於平滑曲線模式）
 * - enabled 為 false 時不 fetch
 * - 市場開盤時每 5 分鐘刷新
 */
export function useHourlyRange(days: number, enabled: boolean) {
  const { data, error, isLoading } = useSWR<IntradayChartPoint[]>(
    enabled ? `/api/intraday/hourly-range?days=${days}` : null,
    fetcher,
    {
      revalidateOnFocus: false,
      refreshInterval: 5 * 60 * 1000,
      dedupingInterval: 60 * 1000,
      errorRetryCount: 2,
      keepPreviousData: true,
    }
  );

  return { data, error, isLoading };
}
