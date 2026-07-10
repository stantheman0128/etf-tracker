import { useCallback, useState, type MutableRefObject, type RefObject } from 'react';
import { type IChartApi, type ISeriesApi, type Time, LineStyle } from 'lightweight-charts';
import { STOCK_COLORS } from '@/lib/constants';
import type { DailyPortfolioDetail } from './types';

// 管理主圖上疊加的個股報酬率曲線：新增/移除/切換/全選，以及選中集合狀態。
// stockSeriesRef 由呼叫端建立並與 useChartSetup 共用，確保兩邊操作同一份序列表。
export function useStockOverlays(
  chartRef: RefObject<IChartApi | null>,
  stockSeriesRef: MutableRefObject<Map<string, ISeriesApi<'Line'>>>,
  allData: DailyPortfolioDetail[],
  selectedData: DailyPortfolioDetail | null,
) {
  // 選中要顯示的個股（用於疊加圖表）
  const [selectedStocks, setSelectedStocks] = useState<Set<string>>(new Set());

  // 根據佔倉位比重計算線條粗細 (1-4，lightweight-charts 限制)
  const getLineWidth = useCallback((weight: number): 1 | 2 | 3 | 4 => {
    const width = Math.round(weight / 10);
    if (width >= 4) return 4;
    if (width <= 1) return 1;
    return width as 1 | 2 | 3 | 4;
  }, []);

  // 添加單一個股漲跌幅曲線
  const addStockSeries = useCallback((symbol: string) => {
    if (!chartRef.current || allData.length === 0) return;
    if (stockSeriesRef.current.has(symbol)) return;

    const lastDayData = allData[allData.length - 1];
    const totalValue = lastDayData.totalValueTWD;
    const stock = lastDayData.stocks.find(s => s.symbol === symbol);
    if (!stock) return;

    const weight = totalValue > 0 ? (stock.valueTWD / totalValue) * 100 : 0;
    const firstDayStock = allData[0].stocks.find(s => s.symbol === symbol);
    if (!firstDayStock) return;

    const basePrice = firstDayStock.price;
    const color = STOCK_COLORS[symbol] || '#888888';
    const lineWidth = getLineWidth(weight);

    const lineSeries = chartRef.current.addLineSeries({
      color,
      lineWidth,
      lineStyle: LineStyle.Solid,
      priceScaleId: 'left',
      lastValueVisible: true,
      priceLineVisible: false,
      title: symbol,
    });

    const lineData = allData.map(day => {
      const dayStock = day.stocks.find(s => s.symbol === symbol);
      const price = dayStock?.price || basePrice;
      const percentChange = ((price - basePrice) / basePrice) * 100;
      return {
        time: day.date as Time,
        value: percentChange,
      };
    });

    lineSeries.setData(lineData);

    // Add symbol marker at the rightmost point for visibility
    if (lineData.length > 0) {
      const lastPoint = lineData[lineData.length - 1];
      lineSeries.setMarkers([{
        time: lastPoint.time,
        position: 'inBar',
        color,
        shape: 'circle',
        text: symbol,
      }]);
    }

    stockSeriesRef.current.set(symbol, lineSeries);

    // 設定左側價格軸（百分比）
    chartRef.current.priceScale('left').applyOptions({
      visible: true,
      borderVisible: false,
      scaleMargins: { top: 0.1, bottom: 0.1 },
    });
  }, [chartRef, allData, getLineWidth]);

  // 移除單一個股曲線
  const removeStockSeries = useCallback((symbol: string) => {
    const series = stockSeriesRef.current.get(symbol);
    if (series && chartRef.current) {
      chartRef.current.removeSeries(series);
      stockSeriesRef.current.delete(symbol);
      // 不再隱藏左側價格軸，因為報酬率 % 軸始終需要顯示
    }
  }, [chartRef]);

  // 切換個股顯示
  const toggleStock = useCallback((symbol: string) => {
    setSelectedStocks(prev => {
      const newSet = new Set(prev);
      if (newSet.has(symbol)) {
        newSet.delete(symbol);
        removeStockSeries(symbol);
      } else {
        newSet.add(symbol);
        addStockSeries(symbol);
      }
      return newSet;
    });
  }, [addStockSeries, removeStockSeries]);

  // 全部選取
  const selectAllStocks = useCallback(() => {
    if (!selectedData) return;
    const allSymbols = selectedData.stocks.map(s => s.symbol);
    allSymbols.forEach(symbol => {
      if (!selectedStocks.has(symbol)) {
        addStockSeries(symbol);
      }
    });
    setSelectedStocks(new Set(allSymbols));
  }, [selectedData, selectedStocks, addStockSeries]);

  // 全部取消選取
  const clearAllStocks = useCallback(() => {
    selectedStocks.forEach(symbol => {
      removeStockSeries(symbol);
    });
    setSelectedStocks(new Set());
  }, [selectedStocks, removeStockSeries]);

  // 切換全選/全不選
  const toggleSelectAll = useCallback(() => {
    if (!selectedData) return;
    if (selectedStocks.size === selectedData.stocks.length) {
      clearAllStocks();
    } else {
      selectAllStocks();
    }
  }, [selectedData, selectedStocks, selectAllStocks, clearAllStocks]);

  return {
    selectedStocks,
    toggleStock,
    toggleSelectAll,
  };
}
