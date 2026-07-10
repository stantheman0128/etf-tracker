import { useMemo } from 'react';
import { usePortfolioData, type MarketStatus } from '@/lib/hooks/usePortfolioData';
import type { DailyPortfolioDetail, PortfolioChartProps, TodayData } from './types';

// 取 SWR 歷史資料並與即時 todayData 合併成單一 allData 序列，
// 附帶 date → data 的查找 Map（讓 crosshair 查找降為 O(1)）。
export function useMergedPortfolioData(
  marketStatus: PortfolioChartProps['marketStatus'],
  todayData: TodayData | undefined,
) {
  const { data: swrData, error: swrError, isLoading, isValidating, refresh, refreshInterval } = usePortfolioData({
    days: 365,
    marketStatus: marketStatus as MarketStatus,
  });

  // 處理 SWR 資料和 todayData 的合併（直接作為 allData，無需額外 state）
  const allData = useMemo(() => {
    if (!swrData || swrData.length === 0) return [];

    let result = swrData;

    if (todayData && todayData.stocks.length > 0) {
      const lastHistoricalDate = swrData[swrData.length - 1]?.date;

      if (!lastHistoricalDate || todayData.date > lastHistoricalDate) {
        // 計算今日總值
        const todayTotalValue = Math.round(
          todayData.stocks.reduce((sum, s) => sum + s.valueTWD, 0)
        );

        // 計算今日漲跌幅
        const previousTotal = swrData[swrData.length - 1]?.totalValueTWD || todayTotalValue;
        const todayChangePercent = previousTotal > 0
          ? ((todayTotalValue - previousTotal) / previousTotal) * 100
          : 0;

        // 計算固定匯率價值
        const todayTotalValueFixedRate = Math.round(
          todayData.stocks.reduce((sum, s) => sum + s.valueFixedRate, 0)
        );

        const todayRecord: DailyPortfolioDetail = {
          date: todayData.date,
          totalValueTWD: todayTotalValue,
          totalValueFixedRate: todayTotalValueFixedRate,
          exchangeRate: todayData.exchangeRate,
          changePercent: todayChangePercent,
          stocks: todayData.stocks,
        };

        result = [...swrData, todayRecord];
      } else if (todayData.date === lastHistoricalDate) {
        // 日期相同，用即時數據更新最後一筆
        const todayTotalValue = Math.round(
          todayData.stocks.reduce((sum, s) => sum + s.valueTWD, 0)
        );

        const todayTotalValueFixedRate = Math.round(
          todayData.stocks.reduce((sum, s) => sum + s.valueFixedRate, 0)
        );

        const previousTotal = swrData.length > 1 ? swrData[swrData.length - 2].totalValueTWD : todayTotalValue;
        const todayChangePercent = previousTotal > 0
          ? ((todayTotalValue - previousTotal) / previousTotal) * 100
          : 0;

        result = [...swrData.slice(0, -1), {
          ...swrData[swrData.length - 1],
          totalValueTWD: todayTotalValue,
          totalValueFixedRate: todayTotalValueFixedRate,
          exchangeRate: todayData.exchangeRate,
          changePercent: todayChangePercent,
          stocks: todayData.stocks,
        }];
      }
    }

    return result;
  }, [swrData, todayData]);

  // 預建 date → data 的 Map，讓 crosshair 查找從 O(n) 降為 O(1)
  const dataByDate = useMemo(() => new Map(allData.map(d => [d.date, d])), [allData]);

  return {
    allData,
    dataByDate,
    error: swrError,
    isLoading,
    isValidating,
    refresh,
    refreshInterval,
  };
}
