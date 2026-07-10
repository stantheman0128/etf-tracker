'use client';

import { useEffect, useRef, useState } from 'react';
import type { IChartApi, ISeriesApi } from 'lightweight-charts';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { TrendingUp, TrendingDown, RefreshCw } from 'lucide-react';
import { PORTFOLIO_CONFIG } from '@/lib/config';
import { STOCK_COLORS } from '@/lib/constants';
import { useHourlyRange, useIntradayData } from '@/lib/hooks/useIntradayData';
import type { DailyPortfolioDetail, PortfolioChartProps } from '@/components/portfolio-chart/types';
import { AnimatedValue } from '@/components/portfolio-chart/AnimatedValue';
import { MiniSparkline } from '@/components/portfolio-chart/MiniSparkline';
import { useMergedPortfolioData } from '@/components/portfolio-chart/useMergedPortfolioData';
import { useStockOverlays } from '@/components/portfolio-chart/useStockOverlays';
import { useChartSetup } from '@/components/portfolio-chart/useChartSetup';
// DayDrilldownPanel replaced by inline drilldown on main chart

export default function PortfolioChart({ className, marketStatus, todayData }: PortfolioChartProps) {
  // 使用 SWR 獲取資料並與即時 todayData 合併（智慧更新機制）
  const { allData, dataByDate, error: swrError, isLoading, isValidating } = useMergedPortfolioData(marketStatus, todayData);

  // 盤中模式（平滑曲線）+ 日鑽取
  const [intradayMode, setIntradayMode] = useState(true);  // default on for smooth curves
  const [drilldownDate, setDrilldownDate] = useState<string | null>(null);
  const { data: hourlyRangeData, isLoading: hourlyLoading } = useHourlyRange(365, true);  // always fetch
  const { data: drilldownDayData } = useIntradayData(drilldownDate);  // single-day detail for drilldown

  // 當前選中/hover 的資料
  const [selectedData, setSelectedData] = useState<DailyPortfolioDetail | null>(null);
  const [isHovering, setIsHovering] = useState(false);
  const [mousePosition, setMousePosition] = useState<{ x: number; y: number } | null>(null);

  // 是否展開完整持股明細表格
  const [showFullTable, setShowFullTable] = useState(false);

  // 排序欄位
  const [sortBy, setSortBy] = useState<'name' | 'value' | 'change' | 'shares' | 'valueTWD' | 'valueUSD' | 'weight'>('valueTWD');
  const [sortDesc, setSortDesc] = useState(true);

  // 圖表與個股序列的共用 ref（useChartSetup 與 useStockOverlays 兩邊都操作同一份）
  const chartRef = useRef<IChartApi | null>(null);
  const stockSeriesRef = useRef<Map<string, ISeriesApi<'Line'>>>(new Map());

  // 圖表建立、資料渲染、crosshair/點擊訂閱、固定匯率曲線
  const {
    chartContainerRef,
    marketMarkersRef,
    showFixedRateReturn,
    toggleFixedRateReturn,
  } = useChartSetup({
    allData,
    dataByDate,
    intradayMode,
    drilldownDate,
    setDrilldownDate,
    hourlyRangeData,
    drilldownDayData,
    chartRef,
    stockSeriesRef,
    setSelectedData,
    setIsHovering,
  });

  // 個股疊加曲線管理（與圖表共用 stockSeriesRef）
  const { selectedStocks, toggleStock, toggleSelectAll } = useStockOverlays(chartRef, stockSeriesRef, allData, selectedData);

  // 當日匯率
  const currentExchangeRate = selectedData?.exchangeRate || 30.0;

  // 計算獲利和百分比
  const initialValue = PORTFOLIO_CONFIG.totalCostTWD;
  const currentValue = selectedData?.totalValueTWD || 0;
  const profit = currentValue - initialValue;
  const profitPercent = initialValue > 0 ? (profit / initialValue) * 100 : 0;
  const isPositive = profit >= 0;

  // 當 allData 變化時更新 selectedData 到最新一筆
  useEffect(() => {
    if (allData.length > 0) {
      setSelectedData(allData[allData.length - 1]);
    }
  }, [allData]);

  // 轉換 loading 和 error 狀態
  const loading = isLoading;
  const error = swrError ? '無法載入資料' : null;

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

        {/* Drilldown back button */}
        {drilldownDate && (
          <button
            onClick={() => setDrilldownDate(null)}
            className="flex items-center gap-2 mb-2 px-3 py-1.5 rounded-lg text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            返回總覽
            <span className="text-gray-400 ml-1">
              {(() => {
                const [y,m,d] = drilldownDate.split('-').map(Number);
                const weekdays = ['日','一','二','三','四','五','六'];
                return `${y}/${m}/${d} (${weekdays[new Date(y,m-1,d).getDay()]})`;
              })()}
            </span>
          </button>
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
          {/* Market hour overlay markers (shown during drilldown) */}
          <div
            ref={marketMarkersRef}
            className="absolute inset-0 pointer-events-none overflow-hidden"
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

        {/* Drilldown stock detail grid (inline, no separate chart) */}
        {drilldownDate && drilldownDayData?.snapshots?.length ? (() => {
          const snapshots = drilldownDayData.snapshots;
          const firstSnap = snapshots[0];
          const lastSnap = snapshots[snapshots.length - 1];
          const allFlat = firstSnap.st.every(s => {
            const last = lastSnap.st.find(x => x.s === s.s);
            return last && Math.abs(last.p - s.p) < 0.001;
          });
          const dow = new Date(drilldownDate + 'T12:00:00Z').getDay();
          const isWeekend = dow === 0 || dow === 6;

          return (
            <div className="mt-3 pt-3 border-t border-gray-200">
              <div className="flex items-center gap-3 mb-2 px-1">
                <span className="text-xs font-medium text-gray-500">
                  個股當日走勢
                </span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                  drilldownDayData.source === 'collected'
                    ? 'bg-green-100 text-green-700'
                    : 'bg-blue-100 text-blue-700'
                }`}>
                  {drilldownDayData.source === 'collected' ? '5 分鐘' : '小時級'}
                </span>
                {allFlat && isWeekend && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500">
                    非交易日 — 延續收盤價
                  </span>
                )}
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-7 gap-2">
                {lastSnap.st.map(stock => {
                  const firstStock = firstSnap.st.find(s => s.s === stock.s);
                  const change = firstStock ? ((stock.p - firstStock.p) / firstStock.p) * 100 : 0;
                  const holding = PORTFOLIO_CONFIG.holdings.find(h => h.symbol === stock.s);
                  const isUp = change > 0;
                  const isFlat = Math.abs(change) < 0.001;
                  const color = STOCK_COLORS[stock.s] || '#888';
                  return (
                    <div key={stock.s} className="p-2 rounded-lg bg-gray-50">
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                        <span className="text-xs font-bold text-gray-700">{stock.s}</span>
                      </div>
                      <div className="text-xs text-gray-500 tabular-nums">
                        {holding?.currency === 'USD' ? '$' : 'NT$'}
                        {stock.p < 1 ? stock.p.toFixed(4) : stock.p.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                      <div className={`text-sm font-semibold tabular-nums ${
                        isFlat ? 'text-gray-400' : isUp ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {isFlat ? '—' : `${isUp ? '+' : ''}${change.toFixed(2)}%`}
                      </div>
                      <div className="text-[10px] text-gray-400 tabular-nums">
                        NT$ {stock.v.toLocaleString()}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })() : null}

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
