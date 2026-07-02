import { useCallback, useEffect, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import { createChart, ColorType, IChartApi, ISeriesApi, Time, CrosshairMode, LineStyle } from 'lightweight-charts';
import { PORTFOLIO_CONFIG } from '@/lib/config';
import { STOCK_COLORS } from '@/lib/constants';
import { getMarketHoursUTC } from '@/lib/utils/market-hours';
import type { IntradayChartPoint, IntradayDayData } from '@/lib/types/intraday';
import type { DailyPortfolioDetail } from './types';

interface UseChartSetupArgs {
  allData: DailyPortfolioDetail[];
  dataByDate: Map<string, DailyPortfolioDetail>;
  intradayMode: boolean;
  drilldownDate: string | null;
  setDrilldownDate: Dispatch<SetStateAction<string | null>>;
  hourlyRangeData: IntradayChartPoint[] | undefined;
  drilldownDayData: IntradayDayData | undefined;
  chartRef: MutableRefObject<IChartApi | null>;
  stockSeriesRef: MutableRefObject<Map<string, ISeriesApi<'Line'>>>;
  setSelectedData: Dispatch<SetStateAction<DailyPortfolioDetail | null>>;
  setIsHovering: Dispatch<SetStateAction<boolean>>;
}

// 掌管 lightweight-charts 的建立、資料渲染（鑽取/盤中/每日三模式）、
// crosshair 與點擊訂閱、開收盤標記，以及固定匯率曲線切換。
export function useChartSetup({
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
}: UseChartSetupArgs) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const marketMarkersRef = useRef<HTMLDivElement>(null);
  const mainSeriesRef = useRef<ISeriesApi<'Area'> | null>(null);
  const returnSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);  // 報酬率序列（左軸）
  const fixedRateSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);  // 固定匯率報酬率序列
  const resizeObserverRef = useRef<ResizeObserver | null>(null);

  // 是否顯示固定匯率報酬率曲線
  const [showFixedRateReturn, setShowFixedRateReturn] = useState(false);

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

  // Draw market-hour dashed lines on the main chart
  const updateMainMarketMarkers = useCallback((dateStr: string | null) => {
    if (!chartRef.current || !marketMarkersRef.current) return;
    const container = marketMarkersRef.current;
    container.innerHTML = '';
    if (!dateStr) return;

    const timeScale = chartRef.current.timeScale();
    const windows = getMarketHoursUTC(dateStr);

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
        line.style.borderLeft = `2px dashed ${win.color}70`;
        line.style.pointerEvents = 'none';

        const tag = document.createElement('span');
        tag.className = 'absolute top-1 text-xs font-bold whitespace-nowrap px-2 py-1 rounded-md shadow-sm';
        tag.style.left = '6px';
        tag.style.color = '#fff';
        tag.style.backgroundColor = win.color;
        tag.textContent = label;
        line.appendChild(tag);

        container.appendChild(line);
      }
    }
  }, []);

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

    // ─── Drilldown mode: zoom main chart into a single day ───
    if (drilldownDate && drilldownDayData?.snapshots?.length) {
      const snapshots = drilldownDayData.snapshots;
      const chart = chartRef.current;

      // Portfolio total value (area series)
      const chartData = snapshots.map(s => ({
        time: s.t as Time,
        value: s.tv,
      }));
      mainSeriesRef.current.setData(chartData);

      // Return % (hidden line for left axis scale)
      const initialCost = PORTFOLIO_CONFIG.totalCostTWD;
      const returnData = snapshots.map(s => ({
        time: s.t as Time,
        value: initialCost > 0 ? ((s.tv - initialCost) / initialCost) * 100 : 0,
      }));
      returnSeriesRef.current.setData(returnData);
      mainSeriesRef.current.setMarkers([]);

      // Clear any previous stock overlays from normal mode
      stockSeriesRef.current.forEach((series) => {
        try { chart.removeSeries(series); } catch {}
      });
      stockSeriesRef.current.clear();

      // Add per-stock % change lines directly on the main chart
      const firstSnap = snapshots[0];
      for (const stockSnap of firstSnap.st) {
        const symbol = stockSnap.s;
        const basePrice = stockSnap.p;
        if (basePrice <= 0) continue;

        const color = STOCK_COLORS[symbol] || '#888';
        const lineSeries = chart.addLineSeries({
          color,
          lineWidth: 2,
          lineStyle: LineStyle.Solid,
          priceScaleId: 'left',
          lastValueVisible: true,
          priceLineVisible: false,
          title: symbol,
        });

        const lineData = snapshots
          .map(snap => {
            const st = snap.st.find(s => s.s === symbol);
            if (!st) return null;
            return { time: snap.t as Time, value: ((st.p - basePrice) / basePrice) * 100 };
          })
          .filter((d): d is { time: Time; value: number } => d !== null);

        lineSeries.setData(lineData);
        stockSeriesRef.current.set(symbol, lineSeries);
      }

      chart.priceScale('left').applyOptions({
        visible: true,
        borderVisible: false,
        scaleMargins: { top: 0.1, bottom: 0.1 },
      });

      chart.applyOptions({
        timeScale: { timeVisible: true, secondsVisible: false },
      });

      requestAnimationFrame(() => {
        chart.timeScale().fitContent();
        requestAnimationFrame(() => updateMainMarketMarkers(drilldownDate));
      });

      // Re-draw markers on scroll/zoom
      const handler = () => updateMainMarketMarkers(drilldownDate);
      chart.timeScale().subscribeVisibleTimeRangeChange(handler);
      return () => {
        chart.timeScale().unsubscribeVisibleTimeRangeChange(handler);
        updateMainMarketMarkers(null);
        // Clean up drilldown stock series
        stockSeriesRef.current.forEach((series) => {
          try { chart.removeSeries(series); } catch {}
        });
        stockSeriesRef.current.clear();
      };
    }

    // ─── Normal smooth mode: hourly data across all days ───
    if (intradayMode && hourlyRangeData?.length && !drilldownDate) {
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

      // Significant daily movement markers
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

      chartRef.current.applyOptions({
        timeScale: { timeVisible: true, secondsVisible: false },
      });
      updateMainMarketMarkers(null); // no market markers in overview

      requestAnimationFrame(() => {
        chartRef.current?.timeScale().fitContent();
      });
      return;
    }

    // ─── Daily mode (fallback) ───
    if (allData.length === 0) return;

    const chartData = allData.map(d => ({
      time: d.date as Time,
      value: d.totalValueTWD,
    }));

    mainSeriesRef.current.setData(chartData);
    mainSeriesRef.current.setMarkers([]);
    updateMainMarketMarkers(null);

    const initialCost = PORTFOLIO_CONFIG.totalCostTWD;
    const returnData = allData.map(d => ({
      time: d.date as Time,
      value: initialCost > 0 ? ((d.totalValueTWD - initialCost) / initialCost) * 100 : 0,
    }));

    returnSeriesRef.current.setData(returnData);

    chartRef.current.applyOptions({
      timeScale: { timeVisible: false },
    });

    requestAnimationFrame(() => {
      chartRef.current?.timeScale().fitContent();
    });
  }, [allData, intradayMode, hourlyRangeData, drilldownDate, drilldownDayData, updateMainMarketMarkers, stockSeriesRef]);

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
  }, [allData, dataByDate, setSelectedData, setIsHovering]);

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
  }, [allData, setDrilldownDate]);

  return {
    chartContainerRef,
    marketMarkersRef,
    chartRef,
    showFixedRateReturn,
    toggleFixedRateReturn,
  };
}
