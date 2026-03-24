'use client';

import { useEffect, useRef } from 'react';
import { createChart, ColorType, IChartApi, Time } from 'lightweight-charts';
import { useIntradayData } from '@/lib/hooks/useIntradayData';
import { Skeleton } from '@/components/ui/skeleton';

interface DayDrilldownPanelProps {
  date: string;
  onClose: () => void;
}

export default function DayDrilldownPanel({ date, onClose }: DayDrilldownPanelProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const { data, isLoading } = useIntradayData(date);

  // 格式化日期顯示（直接拆字串避免 UTC 時區陷阱，手動算星期）
  const formatDate = (dateStr: string) => {
    const [y, m, d] = dateStr.split('-').map(Number);
    // 用 local midnight 建立 Date 以取得正確的星期
    const localDate = new Date(y, m - 1, d);
    const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
    return `${y}/${m}/${d} (${weekdays[localDate.getDay()]})`;
  };

  // 建立和更新圖表
  useEffect(() => {
    if (!chartContainerRef.current || !data?.snapshots?.length) return;

    // 清除舊圖表
    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
    }

    const container = chartContainerRef.current;
    const chart = createChart(container, {
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#666',
        fontFamily: "'Inter', 'Noto Sans TC', sans-serif",
      },
      width: container.clientWidth,
      height: 200,
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
        borderVisible: false,
        tickMarkFormatter: (time: Time) => {
          const d = new Date((time as number) * 1000);
          return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
        },
      },
      rightPriceScale: {
        borderVisible: false,
        scaleMargins: { top: 0.1, bottom: 0.1 },
      },
      leftPriceScale: { visible: false },
      grid: {
        vertLines: { visible: false },
        horzLines: { color: '#f0f0f0' },
      },
      crosshair: {
        vertLine: { width: 1, color: 'rgba(102, 126, 234, 0.5)', style: 0 },
        horzLine: { visible: false },
      },
      handleScroll: { mouseWheel: false, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
      handleScale: { mouseWheel: false, pinch: false },
    });

    chartRef.current = chart;

    const areaSeries = chart.addAreaSeries({
      lineColor: '#10b981',
      topColor: 'rgba(16, 185, 129, 0.3)',
      bottomColor: 'rgba(16, 185, 129, 0.0)',
      lineWidth: 2,
      crosshairMarkerVisible: true,
      crosshairMarkerRadius: 4,
      crosshairMarkerBorderColor: '#10b981',
      crosshairMarkerBackgroundColor: '#fff',
    });

    const chartData = data.snapshots.map(s => ({
      time: s.t as Time,
      value: s.tv,
    }));

    areaSeries.setData(chartData);
    chart.timeScale().fitContent();

    // Resize observer
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const width = entry.contentRect.width;
        if (width > 0 && chartRef.current) {
          chartRef.current.applyOptions({ width });
          chartRef.current.timeScale().fitContent();
        }
      }
    });
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }
    };
  }, [data]);

  // 計算當日最高/最低/變化
  const dayStats = data?.snapshots?.length ? (() => {
    const values = data.snapshots.map(s => s.tv);
    const high = Math.max(...values);
    const low = Math.min(...values);
    const first = values[0];
    const last = values[values.length - 1];
    const change = last - first;
    const changePct = first > 0 ? (change / first) * 100 : 0;
    return { high, low, first, last, change, changePct };
  })() : null;

  return (
    <div className="mt-3 border-t border-gray-200 overflow-hidden transition-all duration-300 ease-out">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <div className="flex items-center gap-3">
          <h3 className="text-base font-bold text-gray-800">
            {formatDate(date)} 盤中走勢
          </h3>
          {data?.source && (
            <span className={`text-xs px-2 py-0.5 rounded-full ${
              data.source === 'collected'
                ? 'bg-green-100 text-green-700'
                : 'bg-blue-100 text-blue-700'
            }`}>
              {data.source === 'collected' ? '5 分鐘' : '小時級'}
            </span>
          )}
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors text-gray-400 hover:text-gray-600"
          title="關閉"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* 日統計 */}
      {dayStats && (
        <div className="flex gap-6 px-4 pb-2 text-sm">
          <div>
            <span className="text-gray-400">最高</span>
            <span className="ml-2 font-semibold text-gray-700 tabular-nums">NT$ {dayStats.high.toLocaleString()}</span>
          </div>
          <div>
            <span className="text-gray-400">最低</span>
            <span className="ml-2 font-semibold text-gray-700 tabular-nums">NT$ {dayStats.low.toLocaleString()}</span>
          </div>
          <div>
            <span className="text-gray-400">變化</span>
            <span className={`ml-2 font-semibold tabular-nums ${dayStats.change >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {dayStats.change >= 0 ? '+' : ''}{dayStats.change.toLocaleString()} ({dayStats.changePct >= 0 ? '+' : ''}{dayStats.changePct.toFixed(2)}%)
            </span>
          </div>
        </div>
      )}

      {/* Chart */}
      <div className="px-4 pb-4">
        {isLoading && (
          <div className="h-[200px] flex items-center justify-center">
            <div className="flex items-center gap-2 text-gray-500">
              <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              載入盤中數據...
            </div>
          </div>
        )}

        {!isLoading && (!data?.snapshots?.length) && (
          <div className="h-[200px] flex items-center justify-center text-gray-400">
            此日期無盤中數據
          </div>
        )}

        <div
          ref={chartContainerRef}
          className={isLoading || !data?.snapshots?.length ? 'hidden' : 'w-full'}
          style={{ height: 200 }}
        />

        {/* 個股當日表現 */}
        {data?.snapshots?.length ? (() => {
          const lastSnapshot = data.snapshots[data.snapshots.length - 1];
          const firstSnapshot = data.snapshots[0];
          return (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-7 gap-2 mt-3">
              {lastSnapshot.st.map(stock => {
                const firstStock = firstSnapshot.st.find(s => s.s === stock.s);
                const change = firstStock ? ((stock.p - firstStock.p) / firstStock.p) * 100 : 0;
                const isUp = change >= 0;
                return (
                  <div key={stock.s} className="text-center p-2 rounded-lg bg-gray-50">
                    <div className="text-xs font-bold text-gray-600">{stock.s}</div>
                    <div className={`text-sm font-semibold tabular-nums ${isUp ? 'text-green-600' : 'text-red-600'}`}>
                      {isUp ? '+' : ''}{change.toFixed(2)}%
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })() : null}
      </div>
    </div>
  );
}
