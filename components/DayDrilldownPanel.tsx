'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { createChart, ColorType, IChartApi, Time, LineStyle } from 'lightweight-charts';
import { useIntradayData } from '@/lib/hooks/useIntradayData';
import { STOCK_COLORS } from '@/lib/constants';
import { getMarketHoursUTC } from '@/lib/utils/market-hours';
import { PORTFOLIO_CONFIG } from '@/lib/config';

interface DayDrilldownPanelProps {
  date: string | null;
  isOpen: boolean;
  onClose: () => void;
}

export default function DayDrilldownPanel({ date, isOpen, onClose }: DayDrilldownPanelProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const markersRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  // Delay clearing internal data so close animation can play
  const [internalDate, setInternalDate] = useState<string | null>(null);
  useEffect(() => {
    if (date) {
      setInternalDate(date);
    } else {
      const timer = setTimeout(() => setInternalDate(null), 500);
      return () => clearTimeout(timer);
    }
  }, [date]);

  const { data, isLoading } = useIntradayData(internalDate);

  // Format date display
  const formatDate = (dateStr: string) => {
    const [y, m, d] = dateStr.split('-').map(Number);
    const localDate = new Date(y, m - 1, d);
    const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
    return `${y}/${m}/${d} (${weekdays[localDate.getDay()]})`;
  };

  // Position market-hour overlay lines
  const updateMarkerPositions = useCallback(() => {
    if (!chartRef.current || !markersRef.current || !internalDate) return;
    const timeScale = chartRef.current.timeScale();
    const container = markersRef.current;
    container.innerHTML = '';

    const windows = getMarketHoursUTC(internalDate);
    for (const win of windows) {
      for (const { ts, label } of [
        { ts: win.openUTC, label: `${win.label} 開盤` },
        { ts: win.closeUTC, label: `${win.label} 收盤` },
      ]) {
        const x = timeScale.timeToCoordinate(ts as Time);
        if (x === null || x < 0) continue;

        const line = document.createElement('div');
        line.className = 'absolute top-0 bottom-[30px]';
        line.style.left = `${x}px`;
        line.style.borderLeft = `1px dashed ${win.color}40`;
        line.style.pointerEvents = 'none';

        const tag = document.createElement('span');
        tag.className = 'absolute top-1 text-[10px] font-medium whitespace-nowrap px-1 rounded';
        tag.style.left = '2px';
        tag.style.color = win.color;
        tag.style.backgroundColor = `${win.color}10`;
        tag.textContent = label;
        line.appendChild(tag);

        container.appendChild(line);
      }
    }
  }, [internalDate]);

  // Build chart
  useEffect(() => {
    if (!chartContainerRef.current || !data?.snapshots?.length) return;

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
      height: 250,
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
      leftPriceScale: {
        visible: true,
        borderVisible: false,
        scaleMargins: { top: 0.1, bottom: 0.1 },
      },
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

    // Main area series (portfolio total value)
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

    areaSeries.setData(data.snapshots.map(s => ({
      time: s.t as Time,
      value: s.tv,
    })));

    // Per-stock % change overlay lines (left axis)
    const firstSnap = data.snapshots[0];
    for (const stockSnap of firstSnap.st) {
      const symbol = stockSnap.s;
      const basePrice = stockSnap.p;
      if (basePrice <= 0) continue;

      const color = STOCK_COLORS[symbol] || '#888';
      const lineSeries = chart.addLineSeries({
        color,
        lineWidth: 1,
        lineStyle: LineStyle.Solid,
        priceScaleId: 'left',
        lastValueVisible: true,
        priceLineVisible: false,
        title: symbol,
      });

      const lineData = data.snapshots
        .map(snap => {
          const st = snap.st.find(s => s.s === symbol);
          if (!st) return null;
          return {
            time: snap.t as Time,
            value: ((st.p - basePrice) / basePrice) * 100,
          };
        })
        .filter((d): d is { time: Time; value: number } => d !== null);

      lineSeries.setData(lineData);
    }

    chart.timeScale().fitContent();

    // Draw market-hour markers after fitContent
    requestAnimationFrame(updateMarkerPositions);
    chart.timeScale().subscribeVisibleTimeRangeChange(updateMarkerPositions);

    // Resize observer
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const width = entry.contentRect.width;
        if (width > 0 && chartRef.current) {
          chartRef.current.applyOptions({ width });
          chartRef.current.timeScale().fitContent();
          requestAnimationFrame(updateMarkerPositions);
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
  }, [data, updateMarkerPositions]);

  // Intraday stats (range + timestamps)
  const dayStats = data?.snapshots?.length ? (() => {
    const snapshots = data.snapshots;
    const values = snapshots.map(s => s.tv);
    const high = Math.max(...values);
    const low = Math.min(...values);
    const highIdx = values.indexOf(high);
    const lowIdx = values.indexOf(low);
    const first = values[0];
    const last = values[values.length - 1];
    const change = last - first;
    const changePct = first > 0 ? (change / first) * 100 : 0;

    const fmtTime = (ts: number) => {
      const d = new Date(ts * 1000);
      return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
    };

    return {
      high, low, change, changePct,
      highTime: fmtTime(snapshots[highIdx].t),
      lowTime: fmtTime(snapshots[lowIdx].t),
    };
  })() : null;

  return (
    <div className={`
      mt-3 border-t overflow-hidden
      transition-all duration-500 ease-out
      ${isOpen ? 'max-h-[700px] opacity-100 border-gray-200' : 'max-h-0 opacity-0 border-transparent'}
    `}>
      {/* Compact Header */}
      <div className="flex items-center justify-between px-4 pt-3 pb-1">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-bold text-gray-800">
            {internalDate ? formatDate(internalDate) : ''} 盤中走勢
          </h3>
          {data?.source && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
              data.source === 'collected'
                ? 'bg-green-100 text-green-700'
                : 'bg-blue-100 text-blue-700'
            }`}>
              {data.source === 'collected' ? '5 分鐘' : '小時級'}
            </span>
          )}
          {/* Intraday range with timestamps (unique to drilldown, not in main chart) */}
          {dayStats && (
            <div className="flex gap-3 text-xs text-gray-500">
              <span>
                盤中高 <span className="font-semibold text-gray-700 tabular-nums">NT$ {dayStats.high.toLocaleString()}</span>
                <span className="text-gray-400 ml-0.5">@{dayStats.highTime}</span>
              </span>
              <span>
                盤中低 <span className="font-semibold text-gray-700 tabular-nums">NT$ {dayStats.low.toLocaleString()}</span>
                <span className="text-gray-400 ml-0.5">@{dayStats.lowTime}</span>
              </span>
              <span className={`font-semibold tabular-nums ${dayStats.change >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {dayStats.change >= 0 ? '+' : ''}{dayStats.changePct.toFixed(2)}%
              </span>
            </div>
          )}
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded-lg hover:bg-gray-100 transition-colors text-gray-400 hover:text-gray-600"
          title="關閉"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Chart with market-hour overlay */}
      <div className="px-4 pb-3">
        {isLoading && (
          <div className="h-[250px] flex items-center justify-center">
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
          <div className="h-[250px] flex items-center justify-center text-gray-400">
            此日期無盤中數據
          </div>
        )}

        <div className="relative">
          <div
            ref={chartContainerRef}
            className={isLoading || !data?.snapshots?.length ? 'hidden' : 'w-full'}
            style={{ height: 250 }}
          />
          {/* Market hour dashed lines overlay */}
          <div
            ref={markersRef}
            className="absolute inset-0 pointer-events-none overflow-hidden"
          />
        </div>

        {/* Per-stock detail grid */}
        {data?.snapshots?.length ? (() => {
          const lastSnapshot = data.snapshots[data.snapshots.length - 1];
          const firstSnapshot = data.snapshots[0];
          return (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-7 gap-2 mt-2">
              {lastSnapshot.st.map((stock, i) => {
                const firstStock = firstSnapshot.st.find(s => s.s === stock.s);
                const change = firstStock ? ((stock.p - firstStock.p) / firstStock.p) * 100 : 0;
                const holding = PORTFOLIO_CONFIG.holdings.find(h => h.symbol === stock.s);
                const isUp = change >= 0;
                const color = STOCK_COLORS[stock.s] || '#888';
                return (
                  <div
                    key={stock.s}
                    className="p-2 rounded-lg bg-gray-50 transition-all duration-300 ease-out"
                    style={{
                      transitionDelay: `${i * 40}ms`,
                      opacity: isOpen ? 1 : 0,
                      transform: isOpen ? 'translateY(0)' : 'translateY(8px)',
                    }}
                  >
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                      <span className="text-xs font-bold text-gray-700">{stock.s}</span>
                    </div>
                    <div className="text-xs text-gray-500 tabular-nums">
                      {holding?.currency === 'USD' ? '$' : 'NT$'}
                      {stock.p < 1 ? stock.p.toFixed(4) : stock.p.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                    <div className={`text-sm font-semibold tabular-nums ${isUp ? 'text-green-600' : 'text-red-600'}`}>
                      {isUp ? '+' : ''}{change.toFixed(2)}%
                    </div>
                    <div className="text-[10px] text-gray-400 tabular-nums">
                      NT$ {stock.v.toLocaleString()}
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
