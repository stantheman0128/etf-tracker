import type { MomentumScore, PoolStock } from '@/lib/strategies/momentum-types';

interface Props {
  scores: MomentumScore[];          // already sorted descending by momentum
  pool: PoolStock[];                 // for resolving company names
  heldTickers: Set<string>;          // current top N (highlighted)
  topN: number;                      // for showing cutoff line
}

/**
 * Card-less ranking table — caller provides the outer container (typically
 * a <details> in strategies/momentum/page.tsx).
 */
export default function MomentumRanking({ scores, pool, heldTickers, topN }: Props) {
  const nameByTicker = new Map(pool.map(p => [p.ticker, p.name]));

  if (scores.length === 0) {
    return (
      <div className="px-6 pb-4 text-xs text-gray-500">
        尚無資料（候選股不足或 API 失敗）
      </div>
    );
  }

  return (
    <div className="px-4 pb-4">
      <table className="w-full text-sm tabular-nums">
        <thead>
          <tr className="text-[11px] uppercase tracking-wider text-gray-500 border-b">
            <th className="text-left font-medium py-1.5 px-2 w-10">#</th>
            <th className="text-left font-medium py-1.5 px-2">Ticker</th>
            <th className="text-left font-medium py-1.5 px-2">公司</th>
            <th className="text-right font-medium py-1.5 px-2">12M 前</th>
            <th className="text-right font-medium py-1.5 px-2">當前</th>
            <th className="text-right font-medium py-1.5 px-2">Momentum</th>
          </tr>
        </thead>
        <tbody>
          {scores.map((s, idx) => {
            const rank = idx + 1;
            const held = heldTickers.has(s.ticker);
            const isCutoff = rank === topN;
            return (
              <tr
                key={s.ticker}
                className={`border-b last:border-b-0 ${held ? 'bg-red-50/60' : ''} ${isCutoff ? 'border-b-2 border-b-red-400/40' : ''}`}
              >
                <td className="py-1.5 px-2 text-gray-400 font-mono text-xs">
                  {rank}
                </td>
                <td className="py-1.5 px-2 font-mono font-semibold text-gray-800">
                  {s.ticker}
                </td>
                <td className="py-1.5 px-2 text-xs text-gray-500">
                  {nameByTicker.get(s.ticker) ?? '—'}
                </td>
                <td className="py-1.5 px-2 text-right font-mono text-xs text-gray-500">
                  {s.pastPrice.toFixed(2)}
                </td>
                <td className="py-1.5 px-2 text-right font-mono text-xs text-gray-700">
                  {s.currentPrice.toFixed(2)}
                </td>
                <td className={`py-1.5 px-2 text-right font-mono font-medium ${s.momentum >= 0 ? 'text-red-600' : 'text-green-600'}`}>
                  {fmtPct(s.momentum)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="text-[11px] text-gray-500 mt-3 px-2 leading-relaxed">
        紅底 = 當前持有的 top {topN}，下方為落榜。每月第一個交易日重新排序、自動換股。
      </div>
    </div>
  );
}

function fmtPct(x: number): string {
  if (!isFinite(x)) return '—';
  return (x >= 0 ? '+' : '') + (x * 100).toFixed(1) + '%';
}
