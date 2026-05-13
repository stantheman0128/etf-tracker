'use client';

import { useEffect, useRef } from 'react';
import { createChart, ColorType, IChartApi, ISeriesApi, Time, LineStyle } from 'lightweight-charts';
import { Card, CardContent } from '@/components/ui/card';
import type { NavSnapshot } from '@/lib/strategies/momentum-types';

interface Props {
  navHistory: NavSnapshot[];
  rebalanceDates: string[];      // YYYY-MM-DD list, used to draw vertical markers
  benchmarkLabel: string;
  strategyLabel: string;
  startDate?: string;
}

export default function PerformanceChart({
  navHistory, rebalanceDates, benchmarkLabel, strategyLabel, startDate,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, {
      width: containerRef.current.clientWidth,
      height: 320,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: 'rgb(120, 120, 120)',
        fontFamily: 'ui-sans-serif, system-ui',
      },
      grid: {
        vertLines: { color: 'rgba(200, 200, 200, 0.15)' },
        horzLines: { color: 'rgba(200, 200, 200, 0.15)' },
      },
      rightPriceScale: { borderVisible: false },
      timeScale: { borderVisible: false, secondsVisible: false },
      handleScroll: true,
      handleScale: true,
    });
    chartRef.current = chart;

    const stratLine = chart.addLineSeries({
      color: '#d33030',
      lineWidth: 2,
      priceLineVisible: true,
      title: strategyLabel,
    });
    const benchLine = chart.addLineSeries({
      color: '#1a1a1a',
      lineWidth: 1,
      lineStyle: LineStyle.Solid,
      priceLineVisible: false,
      title: benchmarkLabel,
    });

    // Sort + dedupe by date
    const sorted = [...navHistory].sort((a, b) => (a.date < b.date ? -1 : 1));
    stratLine.setData(sorted.map(s => ({ time: s.date as Time, value: s.nav })));
    benchLine.setData(
      sorted
        .filter(s => isFinite(s.benchmarkNav))
        .map(s => ({ time: s.date as Time, value: s.benchmarkNav })),
    );

    // Rebalance markers
    if (rebalanceDates.length > 0) {
      stratLine.setMarkers(
        rebalanceDates.map(d => ({
          time: d as Time,
          position: 'belowBar',
          color: '#0066cc',
          shape: 'arrowUp',
          text: 'R',
          size: 0.6,
        })),
      );
    }

    chart.timeScale().fitContent();

    const onResize = () => {
      if (containerRef.current && chartRef.current) {
        chartRef.current.applyOptions({ width: containerRef.current.clientWidth });
      }
    };
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      chart.remove();
      chartRef.current = null;
    };
  }, [navHistory, rebalanceDates, benchmarkLabel, strategyLabel]);

  return (
    <Card>
      <CardContent className="py-4">
        <div className="flex items-baseline justify-between mb-2 px-1">
          <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
            累積走勢 (rebased to 100)
          </div>
          <div className="text-[11px] text-muted-foreground font-mono">
            {startDate ? `自 ${startDate}` : ''} · {navHistory.length} snapshots
          </div>
        </div>
        <div ref={containerRef} className="w-full" />
        {navHistory.length < 2 && (
          <div className="text-center text-xs text-muted-foreground py-4">
            尚未累積足夠資料 — cron 每日 22:00 UTC 自動採集
          </div>
        )}
      </CardContent>
    </Card>
  );
}
