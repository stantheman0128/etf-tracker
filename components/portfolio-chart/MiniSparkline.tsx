import { memo } from 'react';
import type { DailyPortfolioDetail } from './types';

// 迷你趨勢圖（memoized，避免每次 render 重算 SVG path）
export const MiniSparkline = memo(function MiniSparkline({ symbol, allData }: { symbol: string; allData: DailyPortfolioDetail[] }) {
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
