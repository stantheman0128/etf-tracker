'use client';

import { useEffect, useRef, useState, useCallback, useMemo, memo } from 'react';
import { createChart, ColorType, IChartApi, ISeriesApi, Time, CrosshairMode, LineStyle } from 'lightweight-charts';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { TrendingUp, TrendingDown, RefreshCw } from 'lucide-react';
import { useAnimatedNumber } from '@/lib/hooks/useAnimatedNumber';
import { PORTFOLIO_CONFIG } from '@/lib/config';
import { usePortfolioData, type MarketStatus } from '@/lib/hooks/usePortfolioData';
import { useHourlyRange } from '@/lib/hooks/useIntradayData';
import DayDrilldownPanel from '@/components/DayDrilldownPanel';

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

// 即時數據介面（從 page.tsx 傳入）
interface TodayData {
  date: string;
  exchangeRate: number;
  stocks: (StockDetail & { valueFixedRate: number })[];  // 包含固定匯率價值
}

interface PortfolioChartProps {
  className?: string;
  marketStatus: {
    taiwan: { isOpen: boolean; display: string };
    us: { isOpen: boolean; display: string };
    isAnyOpen: boolean;
  };
  todayData?: TodayData;
}

import { STOCK_COLORS } from '@/lib/constants';

// 數字跳動顯示組件
function AnimatedValue({ 
  value, 
  prefix = '', 
  suffix = '',
  className = '',
  showSign = false,
}: { 
  value: number; 
  prefix?: string; 
  suffix?: string;
  className?: string;
  showSign?: boolean;
}) {
  const animatedValue = useAnimatedNumber(value, { duration: 400 });
  const sign = showSign && value >= 0 ? '+' : '';
  
  return (
    <span className={className}>
      {sign}{prefix}{Math.round(animatedValue).toLocaleString()}{suffix}
    </span>
  );
}

// 迷你趨勢圖（memoized，避免每次 render 重算 SVG path）
const MiniSparkline = memo(function MiniSparkline({ symbol, allData }: { symbol: string; allData: DailyPortfolioDetail[] }) {
  const recentData = allData.slice(-30);
  const prices = recentData.map(d => {
    const s = d.stocks.find(st => st.symbol === symbol);
    return s?.price || 0;
  }).filter(p => p > 0);

  if (prices.length < 2) return null;

  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const range = maxPrice - minPrice || 1;

  const width = 80;
  const height = 24;
  const points = prices.map((p, i) => {
    const x = (i / (prices.length - 1)) * width;
    const y = height - ((p - minPrice) / range) * (height - 4) - 2;
    return `${x},${y}`;
  }).join(' ');

  const trendUp = prices[prices.length - 1] >= prices[0];

  return (
    <div className="flex-1 flex items-center justify-end ml-3">
      <svg width={width} height={height} className="opacity-70">
        <polyline
          points={points}
          fill="none"
          stroke={trendUp ? '#22c55e' : '#ef4444'}
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
});

export default function PortfolioChart({ className, marketStatus, todayData }: PortfolioChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const mainSeriesRef = useRef<ISeriesApi<'Area'> | null>(null);
  const returnSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);  // 報酬率序列（左軸）
  const fixedRateSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);  // 固定匯率報酬率序列
  const stockSeriesRef = useRef<Map<string, ISeriesApi<'Line'>>>(new Map());
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  
  // 使用 SWR 獲取資料（智慧更新機制）
  const { data: swrData, error: swrError, isLoading, isValidating, refresh, refreshInterval } = usePortfolioData({
    days: 365,
    marketStatus,
  });
  
  // 盤中模式（平滑曲線）+ 日鑽取
  const [intradayMode, setIntradayMode] = useState(true);  // default on for smooth curves
  const [drilldownDate, setDrilldownDate] = useState<string | null>(null);
  const { data: hourlyRangeData, isLoading: hourlyLoading } = useHourlyRange(365, true);  // always fetch

  // 當前選中/hover 的資料
  const [selectedData, setSelectedData] = useState<DailyPortfolioDetail | null>(null);
  const [isHovering, setIsHovering] = useState(false);
  const [mousePosition, setMousePosition] = useState<{ x: number; y: number } | null>(null);
  
  // 選中要顯示的個股（用於疊加圖表）
  const [selectedStocks, setSelectedStocks] = useState<Set<string>>(new Set());
  
  // 是否展開完整持股明細表格
  const [showFullTable, setShowFullTable] = useState(false);
  
  // 排序欄位
  const [sortBy, setSortBy] = useState<'name' | 'value' | 'change' | 'shares' | 'valueTWD' | 'valueUSD' | 'weight'>('valueTWD');
  const [sortDesc, setSortDesc] = useState(true);
  
  // 是否顯示固定匯率報酬率曲線
  const [showFixedRateReturn, setShowFixedRateReturn] = useState(false);
  
  // 當日匯率
  const currentExchangeRate = selectedData?.exchangeRate || 30.0;
  
  // 計算獲利和百分比
  const initialValue = PORTFOLIO_CONFIG.totalCostTWD;
  const currentValue = selectedData?.totalValueTWD || 0;
  const profit = currentValue - initialValue;
  const profitPercent = initialValue > 0 ? (profit / initialValue) * 100 : 0;
  const isPositive = profit >= 0;

  // 處理容器大小變化
  const handleResize = useCallback(() => {
    if (chartContainerRef.current && chartRef.current) {
      const width = chartContainerRef.current.clientWidth;
      if (width > 0) {
        chartRef.current.applyOptions({ width });
        chartRef.current.timeScale().fitContent();
      }
    }
  }, []);

  // 根據佔倉位比重計算線條粗細 (1-4，lightweight-charts 限制)
  const getLineWidth = useCallback((weight: number): 1 | 2 | 3 | 4 => {
    const width = Math.round(weight / 10);
    if (width >= 4) return 4;
    if (width <= 1) return 1;
    return width as 1 | 2 | 3 | 4;
  }, []);

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

  // 當 allData 變化時更新 selectedData 到最新一筆
  useEffect(() => {
    if (allData.length > 0) {
      setSelectedData(allData[allData.length - 1]);
    }
  }, [allData]);

  // 轉換 loading 和 error 狀態
  const loading = isLoading;
  const error = swrError ? '無法載入資料' : null;

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
  }, [allData, getLineWidth]);

  // 移除單一個股曲線
  const removeStockSeries = useCallback((symbol: string) => {
    const series = stockSeriesRef.current.get(symbol);
    if (series && chartRef.current) {
      chartRef.current.removeSeries(series);
      stockSeriesRef.current.delete(symbol);
      // 不再隱藏左側價格軸，因為報酬率 % 軸始終需要顯示
    }
  }, []);

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

  // 切換固定匯率報酬率曲線
  const toggleFixedRateReturn = useCallback(() => {
    if (!chartRef.current || allData.length === 0) return;
    
    if (showFixedRateReturn) {
      // 移除曲線
      if (fixedRateSeriesRef.current) {
        chartRef.current.removeSeries(fixedRateSeriesRef.current);
        fixedRateSeriesRef.current = null;
      }
      setShowFixedRateReturn(false);
    } else {
      // 添加固定匯率價值曲線（右軸，顯示真實價值）
      const fixedRateSeries = chartRef.current.addLineSeries({
        color: '#f59e0b',  // 橙色，與主色區分
        lineWidth: 2,
        lineStyle: LineStyle.Dashed,  // 虛線以區分
        priceScaleId: 'right',  // 與主曲線共用右軸，方便比較價值差距
        lastValueVisible: true,
        priceLineVisible: false,
        title: '固定匯率',
      });
      
      // 顯示固定匯率的價值（TWD），而非報酬率
      const fixedRateData = allData.map(d => ({
        time: d.date as Time,
        value: d.totalValueFixedRate,
      }));
      
      fixedRateSeries.setData(fixedRateData);
      fixedRateSeriesRef.current = fixedRateSeries;
      setShowFixedRateReturn(true);
    }
  }, [allData, showFixedRateReturn]);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    // 清除舊圖表
    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
      mainSeriesRef.current = null;
      stockSeriesRef.current.clear();
    }

    const container = chartContainerRef.current;
    const initialWidth = container.clientWidth || container.offsetWidth || 800;

    const chart = createChart(container, {
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#666',
        fontFamily: "'Inter', 'Noto Sans TC', sans-serif",
      },
      width: initialWidth,
      height: 380,
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          width: 1,
          color: 'rgba(102, 126, 234, 0.5)',
          style: 0,
        },
        horzLine: {
          visible: false,
        },
      },
      timeScale: {
        timeVisible: false,
        borderVisible: false,
        fixLeftEdge: true,
        fixRightEdge: true,
        tickMarkFormatter: (time: Time) => {
          // 日期字串直接拆（避免 UTC 時區問題），Unix timestamp 用本地時間
          if (typeof time === 'string') {
            const [, m, d] = time.split('-');
            return `${parseInt(m)}/${parseInt(d)}`;
          }
          const date = new Date((time as number) * 1000);
          return `${date.getMonth() + 1}/${date.getDate()}`;
        },
      },
      rightPriceScale: {
        borderVisible: false,
        scaleMargins: {
          top: 0.1,
          bottom: 0.1,
        },
      },
      leftPriceScale: {
        visible: true,
        borderVisible: false,
        scaleMargins: {
          top: 0.1,
          bottom: 0.1,
        },
      },
      grid: {
        vertLines: { visible: false },
        horzLines: { color: '#f0f0f0' },
      },
      handleScale: {
        axisPressedMouseMove: true,
        mouseWheel: true,
        pinch: true,
      },
      handleScroll: {
        mouseWheel: false,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: false,
      },
    });

    chartRef.current = chart;

    const areaSeries = chart.addAreaSeries({
      lineColor: '#667eea',
      topColor: 'rgba(102, 126, 234, 0.4)',
      bottomColor: 'rgba(102, 126, 234, 0.0)',
      lineWidth: 2,
      crosshairMarkerVisible: true,
      crosshairMarkerRadius: 6,
      crosshairMarkerBorderColor: '#667eea',
      crosshairMarkerBackgroundColor: '#fff',
      priceScaleId: 'right',
    });

    mainSeriesRef.current = areaSeries;

    // 添加報酬率序列（左軸） - 隱藏線條，只顯示軸刻度
    const returnSeries = chart.addLineSeries({
      color: 'transparent',
      lineWidth: 1,
      priceScaleId: 'left',
      lastValueVisible: false,
      priceLineVisible: false,
      crosshairMarkerVisible: false,
    });

    returnSeriesRef.current = returnSeries;

    // ResizeObserver
    resizeObserverRef.current = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const width = entry.contentRect.width;
        if (width > 0 && chartRef.current) {
          chartRef.current.applyOptions({ width });
          requestAnimationFrame(() => {
            chartRef.current?.timeScale().fitContent();
          });
        }
      }
    });
    resizeObserverRef.current.observe(container);

    return () => {
      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect();
        resizeObserverRef.current = null;
      }
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
        mainSeriesRef.current = null;
        returnSeriesRef.current = null;
        fixedRateSeriesRef.current = null;
        stockSeriesRef.current.clear();
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handleResize]);

  // 當資料變化時更新圖表
  useEffect(() => {
    if (!chartRef.current || !mainSeriesRef.current || !returnSeriesRef.current) return;

    // 盤中模式：使用小時級數據（Unix timestamp）
    if (intradayMode && hourlyRangeData?.length) {
      const chartData = hourlyRangeData.map(d => ({
        time: d.time as Time,
        value: d.value,
      }));
      mainSeriesRef.current.setData(chartData);

      const initialCost = PORTFOLIO_CONFIG.totalCostTWD;
      const returnData = hourlyRangeData.map(d => ({
        time: d.time as Time,
        value: initialCost > 0 ? ((d.value - initialCost) / initialCost) * 100 : 0,
      }));
      returnSeriesRef.current.setData(returnData);

      // Detect significant daily movements and mark them
      // Group hourly points by date, compare each day's close to open
      const byDate = new Map<string, { first: number; last: number; lastTime: number }>();
      for (const pt of hourlyRangeData) {
        const d = new Date(pt.time * 1000).toISOString().slice(0, 10);
        const existing = byDate.get(d);
        if (!existing) {
          byDate.set(d, { first: pt.value, last: pt.value, lastTime: pt.time });
        } else {
          existing.last = pt.value;
          existing.lastTime = pt.time;
        }
      }

      type MarkerItem = { time: Time; position: 'aboveBar' | 'belowBar'; color: string; shape: 'arrowUp' | 'arrowDown'; text: string };
      const markers: MarkerItem[] = [];
      for (const [, info] of byDate) {
        const changePct = info.first > 0 ? ((info.last - info.first) / info.first) * 100 : 0;
        if (Math.abs(changePct) >= 1.5) {
          const isUp = changePct > 0;
          markers.push({
            time: info.lastTime as Time,
            position: isUp ? 'aboveBar' : 'belowBar',
            color: isUp ? '#16a34a' : '#dc2626',
            shape: isUp ? 'arrowUp' : 'arrowDown',
            text: `${isUp ? '+' : ''}${changePct.toFixed(1)}%`,
          });
        }
      }
      markers.sort((a, b) => (a.time as number) - (b.time as number));
      mainSeriesRef.current.setMarkers(markers);

      // 更新 timeScale 顯示時間
      chartRef.current.applyOptions({
        timeScale: { timeVisible: true, secondsVisible: false },
      });

      requestAnimationFrame(() => {
        chartRef.current?.timeScale().fitContent();
      });
      return;
    }

    // 每日模式（原有邏輯）
    if (allData.length === 0) return;

    const chartData = allData.map(d => ({
      time: d.date as Time,
      value: d.totalValueTWD,
    }));

    mainSeriesRef.current.setData(chartData);
    mainSeriesRef.current.setMarkers([]);  // No markers in daily mode

    // 計算報酬率數據（用初始成本計算）
    const initialCost = PORTFOLIO_CONFIG.totalCostTWD;
    const returnData = allData.map(d => ({
      time: d.date as Time,
      value: initialCost > 0 ? ((d.totalValueTWD - initialCost) / initialCost) * 100 : 0,
    }));

    returnSeriesRef.current.setData(returnData);

    // 恢復 timeScale 隱藏時間
    chartRef.current.applyOptions({
      timeScale: { timeVisible: false },
    });

    requestAnimationFrame(() => {
      chartRef.current?.timeScale().fitContent();
    });
  }, [allData, intradayMode, hourlyRangeData]);

  // 訂閱 crosshair 移動
  useEffect(() => {
    if (!chartRef.current || allData.length === 0) return;

    const chart = chartRef.current;
    
    const handler = (param: { time?: Time; seriesData: Map<unknown, unknown> }) => {
      if (param.time && param.seriesData.size > 0) {
        // Handle both date strings (daily mode) and Unix timestamps (intraday mode)
        let dateStr: string;
        if (typeof param.time === 'number') {
          const d = new Date(param.time * 1000);
          dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        } else {
          dateStr = param.time as string;
        }
        const dayData = dataByDate.get(dateStr);
        if (dayData) {
          setSelectedData(dayData);
          setIsHovering(true);
        }
      } else {
        setIsHovering(false);
      }
    };

    chart.subscribeCrosshairMove(handler);

    return () => {
      chart.unsubscribeCrosshairMove(handler);
    };
  }, [allData, dataByDate]);

  // 圖表點擊 → 展開/關閉日鑽取面板
  useEffect(() => {
    if (!chartRef.current || allData.length === 0) return;
    const chart = chartRef.current;

    const clickHandler = (param: { time?: Time }) => {
      if (!param.time) return;
      // 轉換成使用者本地日期
      let dateStr: string;
      if (typeof param.time === 'number') {
        const d = new Date(param.time * 1000);
        dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      } else {
        dateStr = param.time as string;
      }
      setDrilldownDate(prev => prev === dateStr ? null : dateStr);
    };

    chart.subscribeClick(clickHandler);
    return () => { chart.unsubscribeClick(clickHandler); };
  }, [allData]);

  // 滑鼠離開時顯示最新資料
  useEffect(() => {
    if (!isHovering && allData.length > 0) {
      setSelectedData(allData[allData.length - 1]);
    }
  }, [isHovering, allData]);

  // 格式化日期（直接拆字串，避免 new Date('YYYY-MM-DD') 的 UTC 時區陷阱）
  const formatDate = (dateStr: string) => {
    const [y, m, d] = dateStr.split('-');
    return `${y}/${parseInt(m)}/${parseInt(d)}`;
  };

  return (
    <Card className={`bg-white/95 backdrop-blur overflow-hidden ${className}`}>
      {/* 頂部資訊區 */}
      <div className="px-6 pt-6 pb-4">
        {/* 標題列 + 匯率 + 市場狀態 */}
        <div className="flex flex-wrap items-center justify-between gap-4 mb-5">
          <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
            💰 投資組合總覽
            {/* 背景更新指示器 */}
            {isValidating && !loading && (
              <span className="flex items-center gap-1 text-xs font-normal text-blue-500 bg-blue-50 px-2 py-1 rounded-full">
                <RefreshCw className="animate-spin" size={12} />
                更新中
              </span>
            )}
          </h2>
          
          {/* 右側：匯率 + 市場狀態 */}
          <div className="flex items-center gap-3">
            {/* 匯率 - 可點擊切換固定匯率報酬率曲線 */}
            <button
              onClick={toggleFixedRateReturn}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg border min-w-[200px] transition-all cursor-pointer hover:shadow-md ${
                showFixedRateReturn
                  ? 'bg-gradient-to-r from-amber-50 to-orange-50 border-amber-300 ring-2 ring-amber-200'
                  : 'bg-gradient-to-r from-blue-50 to-purple-50 border-blue-100 hover:border-blue-200'
              }`}
              title={showFixedRateReturn ? '點擊隱藏固定匯率報酬率' : '點擊顯示固定匯率報酬率（排除匯率影響）'}
            >
              <span className="text-lg">{showFixedRateReturn ? '📊' : '💱'}</span>
              <span className="text-lg font-semibold text-gray-700 tabular-nums">
                1 USD = <span className={`inline-block w-[55px] text-right ${showFixedRateReturn ? 'text-amber-600' : 'text-blue-600'}`}>
                  {showFixedRateReturn ? '29.90' : currentExchangeRate.toFixed(2)}
                </span> TWD
              </span>
            </button>
            
            {/* 盤中模式切換 */}
            <button
              onClick={() => { setIntradayMode(!intradayMode); setDrilldownDate(null); }}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium transition-all cursor-pointer hover:shadow-md ${
                intradayMode
                  ? 'bg-gradient-to-r from-emerald-50 to-teal-50 border-emerald-300 ring-2 ring-emerald-200 text-emerald-700'
                  : 'bg-gray-50 border-gray-200 text-gray-600 hover:border-gray-300'
              }`}
              title={intradayMode ? '切換回每日模式' : '切換到盤中模式（顯示小時級數據）'}
            >
              <span className="text-base">{intradayMode ? '⏱️' : '📅'}</span>
              <span>{intradayMode ? '盤中' : '每日'}</span>
              {intradayMode && hourlyLoading && (
                <RefreshCw className="animate-spin" size={12} />
              )}
            </button>

            {/* 市場狀態 */}
            <div className="flex gap-2 items-center">
              <span className="px-3 py-2 rounded-lg bg-gray-50 text-sm font-medium text-gray-600 border">
                {marketStatus.taiwan.display}
              </span>
              <span className="px-3 py-2 rounded-lg bg-gray-50 text-sm font-medium text-gray-600 border">
                {marketStatus.us.display}
              </span>
            </div>
          </div>
        </div>

        {/* 數值顯示區 Skeleton */}
        {loading && (
          <div className="flex items-center justify-between">
            <div className="grid grid-cols-3 gap-6 max-w-2xl">
              <div className="min-w-[180px]">
                <Skeleton className="h-4 w-16 mb-2" />
                <Skeleton className="h-9 w-36" />
              </div>
              <div className="min-w-[160px]">
                <Skeleton className="h-4 w-12 mb-2" />
                <Skeleton className="h-7 w-32" />
              </div>
              <div className="min-w-[100px]">
                <Skeleton className="h-4 w-12 mb-2" />
                <Skeleton className="h-7 w-20" />
              </div>
            </div>
          </div>
        )}

        {/* 數值顯示區 - 固定寬度 */}
        {selectedData && !loading && (
          <div className="flex items-center justify-between">
            <div className="grid grid-cols-3 gap-6 max-w-2xl">
              {/* 總價值 */}
              <div className="min-w-[180px]">
                <div className="text-sm text-gray-500 mb-1">
                  {isHovering ? formatDate(selectedData.date) : '目前總值'}
                </div>
                <AnimatedValue
                  value={currentValue}
                  prefix="NT$ "
                  className="text-3xl font-bold text-gray-900 tabular-nums"
                />
              </div>
            
              {/* 獲利金額 */}
              <div className={`min-w-[160px] ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
                <div className="text-sm opacity-70 mb-1 flex items-center gap-1">
                  {isPositive ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                  獲利
                </div>
                <AnimatedValue
                  value={profit}
                  prefix="NT$ "
                  showSign={true}
                  className="text-2xl font-bold tabular-nums"
                />
              </div>
            
              {/* 報酬率 */}
              <div className={`min-w-[100px] ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
                <div className="text-sm opacity-70 mb-1">報酬率</div>
                <span className="text-2xl font-bold tabular-nums">
                  {isPositive ? '+' : ''}{profitPercent.toFixed(2)}%
                </span>
              </div>
            </div>
            
            {/* 全部選取按鈕 */}
            {selectedData.stocks && (
              <button
                onClick={toggleSelectAll}
                className={`px-4 py-2 rounded-lg font-medium text-sm shadow-sm transition-all flex items-center gap-2 ${
                  selectedStocks.size === selectedData.stocks.length
                    ? 'bg-blue-600 text-white hover:bg-blue-700'
                    : 'bg-blue-500 text-white hover:bg-blue-600'
                }`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  {selectedStocks.size === selectedData.stocks.length ? (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  ) : (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                  )}
                </svg>
                {selectedStocks.size === selectedData.stocks.length ? '取消全選' : '全部選取'}
              </button>
            )}
          </div>
        )}
      </div>

      <CardContent className="pt-0 px-4 pb-2">
        {/* Loading Skeleton */}
        {loading && (
          <div className="space-y-4">
            {/* 圖表區域 Skeleton */}
            <div className="relative h-[380px] rounded-lg overflow-hidden">
              <Skeleton className="absolute inset-0" />
              {/* 模擬圖表線條 */}
              <div className="absolute bottom-8 left-0 right-0 h-[200px] flex items-end justify-between px-8">
                {[...Array(12)].map((_, i) => (
                  <Skeleton 
                    key={i} 
                    className="w-4 bg-gray-300" 
                    style={{ height: `${30 + Math.random() * 60}%` }}
                  />
                ))}
              </div>
              {/* 載入文字 */}
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="flex items-center gap-2 bg-white/80 backdrop-blur px-4 py-2 rounded-lg shadow">
                  <RefreshCw className="animate-spin text-blue-500" size={20} />
                  <span className="text-gray-600 font-medium">載入歷史資料中...</span>
                </div>
              </div>
            </div>
            
            {/* 卡片區域 Skeleton */}
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
              {[...Array(7)].map((_, i) => (
                <div key={i} className="p-4 rounded-xl border border-gray-100 bg-gray-50">
                  <div className="flex items-center gap-2 mb-2">
                    <Skeleton className="w-3 h-3 rounded-full" />
                    <Skeleton className="h-4 w-12" />
                    <Skeleton className="h-3 w-8 ml-auto" />
                  </div>
                  <Skeleton className="h-5 w-16 mb-1" />
                  <Skeleton className="h-3 w-10" />
                </div>
              ))}
            </div>
          </div>
        )}
        {error && (
          <div className="flex items-center justify-center h-[380px]">
            <div className="text-red-500">{error}</div>
          </div>
        )}
        
        {/* 圖表 */}
        <div className="relative">
          <div
            ref={chartContainerRef}
            className={loading || error ? 'hidden' : 'w-full'}
            style={{ height: 380 }}
            onMouseMove={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              setMousePosition({ x: e.clientX - rect.left, y: e.clientY - rect.top });
            }}
            onMouseLeave={() => setMousePosition(null)}
          />
          
          {/* 浮動提示 - 跟隨滑鼠移動 */}
          {isHovering && mousePosition && selectedData && (
            <div 
              className="absolute bg-white/95 backdrop-blur px-3 py-2 rounded-lg shadow-lg border border-gray-200 z-10 pointer-events-none"
              style={{ 
                left: Math.min(mousePosition.x + 15, (chartContainerRef.current?.clientWidth || 400) - 180),
                top: Math.max(mousePosition.y - 40, 10)
              }}
            >
              <div className="space-y-1">
                {/* 總價值 - 永遠顯示 */}
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-gray-500">💰</span>
                  <span className="font-bold text-gray-800 tabular-nums">
                    NT$ {selectedData.totalValueTWD.toLocaleString()}
                  </span>
                </div>
                
                {/* 匯率影響 */}
                {showFixedRateReturn && selectedData.totalValueFixedRate && (() => {
                  const fixedRateProfit = selectedData.totalValueFixedRate - initialValue;
                  const fixedRateProfitPercent = initialValue > 0 ? (fixedRateProfit / initialValue) * 100 : 0;
                  const gap = profitPercent - fixedRateProfitPercent;
                  const isGapPositive = gap >= 0;
                  return (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-amber-600">💱</span>
                      <span className={`text-sm font-bold tabular-nums ${isGapPositive ? 'text-green-600' : 'text-red-600'}`}>
                        {isGapPositive ? '+' : ''}{gap.toFixed(2)}%
                      </span>
                    </div>
                  );
                })()}
                
                {/* 選中的個股股價 */}
                {selectedStocks.size > 0 && (
                  <div className="pt-1 border-t border-gray-100 space-y-1">
                    {[...selectedStocks].map(symbol => {
                      const stock = selectedData.stocks.find(s => s.symbol === symbol);
                      if (!stock) return null;
                      const stockColor = STOCK_COLORS[symbol] || '#888888';
                      const isUp = stock.changePercent >= 0;
                      return (
                        <div key={symbol} className="flex items-center gap-2">
                          <span 
                            className="w-2 h-2 rounded-full"
                            style={{ backgroundColor: stockColor }}
                          />
                          <span className="text-xs font-medium text-gray-600 w-10">{symbol}</span>
                          <span className={`text-sm font-bold tabular-nums ${isUp ? 'text-green-600' : 'text-red-600'}`}>
                            {stock.currency === 'USD' ? '$' : 'NT$'}
                            {stock.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* 日鑽取面板 - 點擊某天展開 24 小時走勢 */}
        <DayDrilldownPanel
          date={drilldownDate}
          isOpen={!!drilldownDate}
          onClose={() => setDrilldownDate(null)}
        />

        {/* 個股價值區塊 - 按佔倉位大小排序 */}
        {selectedData && selectedData.stocks && !loading && allData.length > 0 && (
          <div className="mt-4 pt-4 border-t border-gray-100">
            {/* 表頭 - 只在展開時顯示，可排序 */}
            <div 
              className={`
                grid gap-2 px-5 py-3 text-base text-gray-500 font-semibold border-b border-gray-200 rounded-t-xl bg-gray-50
                transition-all duration-300 ease-out overflow-hidden
                ${showFullTable ? 'opacity-100 max-h-20' : 'opacity-0 max-h-0'}
              `}
              style={{ gridTemplateColumns: '2fr 1.2fr 0.9fr 0.8fr 1.3fr 1.3fr 0.7fr' }}
            >
              <button 
                onClick={() => { setSortBy('name'); setSortDesc(sortBy === 'name' ? !sortDesc : false); }}
                className={`text-left hover:text-gray-800 transition-colors flex items-center gap-1 ${sortBy === 'name' ? 'text-blue-600' : ''}`}
              >
                股票 <span className={sortBy === 'name' ? '' : 'opacity-30'}>{!sortDesc && sortBy === 'name' ? '↑' : '↓'}</span>
              </button>
              <button 
                onClick={() => { setSortBy('value'); setSortDesc(sortBy === 'value' ? !sortDesc : true); }}
                className={`text-right hover:text-gray-800 transition-colors flex items-center justify-end gap-1 ${sortBy === 'value' ? 'text-blue-600' : ''}`}
              >
                現價 <span className={sortBy === 'value' ? '' : 'opacity-30'}>{sortDesc && sortBy === 'value' ? '↓' : '↑'}</span>
              </button>
              <button 
                onClick={() => { setSortBy('change'); setSortDesc(sortBy === 'change' ? !sortDesc : true); }}
                className={`text-right hover:text-gray-800 transition-colors flex items-center justify-end gap-1 ${sortBy === 'change' ? 'text-blue-600' : ''}`}
              >
                漲跌 <span className={sortBy === 'change' ? '' : 'opacity-30'}>{sortDesc && sortBy === 'change' ? '↓' : '↑'}</span>
              </button>
              <button 
                onClick={() => { setSortBy('shares'); setSortDesc(sortBy === 'shares' ? !sortDesc : true); }}
                className={`text-right hover:text-gray-800 transition-colors flex items-center justify-end gap-1 ${sortBy === 'shares' ? 'text-blue-600' : ''}`}
              >
                持股 <span className={sortBy === 'shares' ? '' : 'opacity-30'}>{sortDesc && sortBy === 'shares' ? '↓' : '↑'}</span>
              </button>
              <button 
                onClick={() => { setSortBy('valueUSD'); setSortDesc(sortBy === 'valueUSD' ? !sortDesc : true); }}
                className={`text-right hover:text-gray-800 transition-colors flex items-center justify-end gap-1 ${sortBy === 'valueUSD' ? 'text-blue-600' : ''}`}
              >
                市值 USD <span className={sortBy === 'valueUSD' ? '' : 'opacity-30'}>{sortDesc && sortBy === 'valueUSD' ? '↓' : '↑'}</span>
              </button>
              <button 
                onClick={() => { setSortBy('valueTWD'); setSortDesc(sortBy === 'valueTWD' ? !sortDesc : true); }}
                className={`text-right hover:text-gray-800 transition-colors flex items-center justify-end gap-1 ${sortBy === 'valueTWD' ? 'text-blue-600' : ''}`}
              >
                市值 TWD <span className={sortBy === 'valueTWD' ? '' : 'opacity-30'}>{sortDesc && sortBy === 'valueTWD' ? '↓' : '↑'}</span>
              </button>
              <button 
                onClick={() => { setSortBy('weight'); setSortDesc(sortBy === 'weight' ? !sortDesc : true); }}
                className={`text-right hover:text-gray-800 transition-colors flex items-center justify-end gap-1 ${sortBy === 'weight' ? 'text-blue-600' : ''}`}
              >
                佔比 <span className={sortBy === 'weight' ? '' : 'opacity-30'}>{sortDesc && sortBy === 'weight' ? '↓' : '↑'}</span>
              </button>
            </div>
            
            {/* 統一卡片/行 - 根據 showFullTable 狀態變形 */}
            <div 
              className={`
                transition-all duration-300 ease-out
                ${showFullTable 
                  ? 'flex flex-col gap-0' 
                  : 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-5'
                }
              `}
            >
              {[...selectedData.stocks]
                .sort((a, b) => {
                  const aWeight = selectedData.totalValueTWD > 0 ? (a.valueTWD / selectedData.totalValueTWD) * 100 : 0;
                  const bWeight = selectedData.totalValueTWD > 0 ? (b.valueTWD / selectedData.totalValueTWD) * 100 : 0;
                  const exchangeRate = selectedData?.exchangeRate || 30;
                  const aValueUSD = a.valueTWD / exchangeRate;
                  const bValueUSD = b.valueTWD / exchangeRate;
                  // 名稱排序用字母順序
                  if (sortBy === 'name') {
                    const cmp = a.symbol.localeCompare(b.symbol);
                    return sortDesc ? -cmp : cmp;
                  }
                  let diff = 0;
                  switch (sortBy) {
                    case 'value': diff = a.price - b.price; break;
                    case 'change': diff = a.changePercent - b.changePercent; break;
                    case 'shares': diff = a.shares - b.shares; break;
                    case 'valueTWD': diff = a.valueTWD - b.valueTWD; break;
                    case 'valueUSD': diff = aValueUSD - bValueUSD; break;
                    case 'weight': diff = aWeight - bWeight; break;
                    default: diff = a.valueTWD - b.valueTWD;
                  }
                  return sortDesc ? -diff : diff;
                })
                .map((stock, index) => {
                  const dailyChangePercent = stock.changePercent;
                  const isUp = dailyChangePercent >= 0;
                  const isSelected = selectedStocks.has(stock.symbol);
                  const stockColor = STOCK_COLORS[stock.symbol] || '#888888';
                  const weight = selectedData.totalValueTWD > 0 
                    ? (stock.valueTWD / selectedData.totalValueTWD) * 100 
                    : 0;
                  
                  return (
                    <div
                      key={stock.symbol}
                      onClick={() => toggleStock(stock.symbol)}
                      className={`
                        cursor-pointer transition-all duration-300 ease-out
                        ${showFullTable 
                          ? `grid gap-2 px-5 py-4 items-center border-b border-gray-100 rounded-xl mx-1 my-0.5
                             ${isSelected ? 'ring-2 shadow-md' : 'hover:bg-gray-50'}`
                          : `rounded-xl p-5 relative overflow-hidden
                             ${isSelected ? 'ring-2 ring-offset-2 shadow-lg' : 'hover:bg-gray-100 bg-gray-50'}`
                        }
                      `}
                      style={{
                        backgroundColor: isSelected ? `${stockColor}15` : undefined,
                        // @ts-expect-error - custom property
                        '--tw-ring-color': stockColor,
                        order: index,
                        ...(showFullTable && { gridTemplateColumns: '2fr 1.2fr 0.9fr 0.8fr 1.3fr 1.3fr 0.7fr' }),
                      }}
                    >
                      {/* 股票名稱區塊 */}
                      <div className={`flex items-center gap-3 ${showFullTable ? '' : 'mb-2 justify-between'}`}>
                        <div className="flex items-center gap-2 min-w-0">
                          <span 
                            className={`rounded-full flex-shrink-0 transition-all duration-300 ${showFullTable ? 'w-3 h-3' : 'w-4 h-4'}`}
                            style={{ backgroundColor: stockColor }}
                          />
                          <div className="min-w-0">
                            <span className={`font-bold text-gray-800 ${showFullTable ? 'text-lg' : 'text-lg'}`}>
                              {stock.symbol}
                            </span>
                            {showFullTable && (
                              <span className="text-sm text-gray-400 ml-2">{stock.name}</span>
                            )}
                          </div>
                        </div>
                        {/* 迷你趨勢圖 - 只在表格模式顯示 */}
                        {showFullTable && allData.length > 1 && (
                          <MiniSparkline symbol={stock.symbol} allData={allData} />
                        )}
                        {!showFullTable && (
                          <span className="text-sm text-gray-400 font-semibold">{weight.toFixed(0)}%</span>
                        )}
                      </div>
                      
                      {/* 現價 */}
                      <div className={`
                        transition-all duration-300 font-mono
                        ${showFullTable 
                          ? `text-right text-lg text-gray-800 ${sortBy === 'value' ? 'font-bold' : 'font-medium'}` 
                          : `text-base font-bold truncate ${isUp ? 'text-green-600' : 'text-red-600'}`
                        }
                      `}>
                        {stock.currency === 'USD' ? '$' : 'NT$'}
                        {showFullTable 
                          ? stock.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                          : stock.price < 1000 
                            ? stock.price.toFixed(2) 
                            : stock.price.toLocaleString(undefined, { maximumFractionDigits: 0 })
                        }
                      </div>
                      
                      {/* 漲跌幅 - 小卡模式放右下角 */}
                      {!showFullTable && (
                        <div className={`
                          absolute bottom-3 right-3 text-sm font-bold font-mono
                          ${isUp ? 'text-green-600' : 'text-red-600'}
                        `}>
                          {isUp ? '▲' : '▼'}{Math.abs(dailyChangePercent).toFixed(2)}%
                        </div>
                      )}
                      
                      {/* 漲跌 - 只在表格模式顯示 */}
                      <div className={`
                        text-right text-lg font-mono transition-all duration-300
                        ${isUp ? 'text-green-600' : 'text-red-600'}
                        ${sortBy === 'change' ? 'font-bold' : 'font-medium'}
                        ${showFullTable ? 'opacity-100' : 'opacity-0 absolute'}
                      `}>
                        {isUp ? '+' : ''}{stock.changePercent.toFixed(2)}%
                      </div>
                      
                      {/* 持股 - 只在表格模式顯示 */}
                      <div className={`
                        text-right text-lg font-mono text-gray-700 transition-all duration-300
                        ${sortBy === 'shares' ? 'font-bold' : 'font-medium'}
                        ${showFullTable ? 'opacity-100' : 'opacity-0 absolute'}
                      `}>
                        {stock.shares.toLocaleString()}
                      </div>
                      
                      {/* 市值 USD - 只在表格模式顯示 */}
                      <div className={`
                        text-right text-lg font-mono text-gray-800 transition-all duration-300
                        ${sortBy === 'valueUSD' ? 'font-bold' : 'font-medium'}
                        ${showFullTable ? 'opacity-100' : 'opacity-0 absolute'}
                      `}>
                        ${(stock.valueTWD / (selectedData?.exchangeRate || 30)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                      
                      {/* 市值 TWD - 只在表格模式顯示 */}
                      <div className={`
                        text-right text-lg font-mono text-gray-800 transition-all duration-300
                        ${sortBy === 'valueTWD' ? 'font-bold' : 'font-medium'}
                        ${showFullTable ? 'opacity-100' : 'opacity-0 absolute'}
                      `}>
                        NT$ {stock.valueTWD.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </div>
                      
                      {/* 佔比 - 只在表格模式顯示 */}
                      <div className={`
                        text-right text-lg font-mono text-gray-600 transition-all duration-300
                        ${sortBy === 'weight' ? 'font-bold' : 'font-medium'}
                        ${showFullTable ? 'opacity-100' : 'opacity-0 absolute'}
                      `}>
                        {weight.toFixed(1)}%
                      </div>
                    </div>
                  );
                })
            }
            </div>
            
            {/* 底部：展開箭頭 */}
            <div className="mt-3 flex items-center justify-center">
              <div
                onClick={() => setShowFullTable(!showFullTable)}
                className="py-1.5 px-6 cursor-pointer flex items-center justify-center opacity-40 hover:opacity-70 transition-opacity"
              >
                <svg 
                  className={`w-8 h-5 text-gray-500 transition-transform duration-300 ${showFullTable ? 'rotate-180' : ''}`}
                  fill="none" 
                  stroke="currentColor" 
                  viewBox="0 0 32 20"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6l12 8L28 6" />
                </svg>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
