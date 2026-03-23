'use client';

import useSWR from 'swr';
import { useMemo } from 'react';

interface StockDetail {
  symbol: string;
  name: string;
  shares: number;
  price: number;
  valueTWD: number;
  currency: string;
  changePercent: number;
}

interface DailyPortfolioDetail {
  date: string;
  totalValueTWD: number;
  totalValueFixedRate: number;
  exchangeRate: number;
  changePercent: number;
  stocks: StockDetail[];
}

interface MarketStatus {
  taiwan: { isOpen: boolean; display: string };
  us: { isOpen: boolean; display: string };
  isAnyOpen: boolean;
}

// 根據市場狀態決定刷新間隔
function getRefreshInterval(marketStatus: MarketStatus): number {
  // 任一市場開市中：每 5 分鐘更新
  if (marketStatus.isAnyOpen) {
    return 5 * 60 * 1000; // 5 分鐘
  }
  
  // 檢查是否為週末
  const now = new Date();
  const day = now.getDay();
  const isWeekend = day === 0 || day === 6;
  
  if (isWeekend) {
    // 週末：每 1 小時更新（基本上不需要頻繁更新）
    return 60 * 60 * 1000; // 60 分鐘
  }
  
  // 平日收盤後：每 30 分鐘更新
  return 30 * 60 * 1000; // 30 分鐘
}

// SWR fetcher
const fetcher = async (url: string): Promise<DailyPortfolioDetail[]> => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error('Failed to fetch portfolio data');
  }
  return response.json();
};

interface UsePortfolioDataOptions {
  days?: number;
  marketStatus: MarketStatus;
}

export function usePortfolioData({ days = 365, marketStatus }: UsePortfolioDataOptions) {
  // 使用 primitive 值作為依賴，避免 object reference 變化導致 useMemo 失效
  const isAnyOpen = marketStatus.isAnyOpen;
  const refreshInterval = useMemo(() => getRefreshInterval(marketStatus), [isAnyOpen]); // eslint-disable-line react-hooks/exhaustive-deps
  
  const { data, error, isLoading, isValidating, mutate } = useSWR<DailyPortfolioDetail[]>(
    `/api/portfolio-detail?days=${days}`,
    fetcher,
    {
      // 快取設定
      revalidateOnFocus: false,        // 視窗聚焦時不自動重新驗證
      revalidateOnReconnect: true,     // 網路重連時重新驗證
      dedupingInterval: 60 * 1000,     // 1 分鐘內相同請求去重
      
      // 智慧更新間隔（根據市場狀態）
      refreshInterval,
      
      // 錯誤處理
      errorRetryCount: 3,              // 最多重試 3 次
      errorRetryInterval: 5000,        // 重試間隔 5 秒
      
      // 保持上次資料（避免閃爍）
      keepPreviousData: true,
    }
  );

  // 手動刷新函數
  const refresh = async () => {
    await mutate();
  };

  return {
    data,
    error,
    isLoading,
    isValidating,          // 背景重新驗證中
    refresh,               // 手動刷新
    refreshInterval,       // 當前刷新間隔（毫秒）
  };
}

// 導出類型
export type { DailyPortfolioDetail, StockDetail, MarketStatus };
