import { Card, CardContent } from '@/components/ui/card';
import type { MomentumScore, PoolStock } from '@/lib/strategies/momentum-types';

interface Props {
  scores: MomentumScore[];          // already sorted descending by momentum
  pool: PoolStock[];                 // for resolving company names
  heldTickers: Set<string>;          // current top N (highlighted)
  topN: number;                      // for showing cutoff line
}

export default function MomentumRanking({ scores, pool, heldTickers, topN }: Props) {
  const nameByTicker = new Map(pool.map(p => [p.ticker, p.name]));

  return (
    <Card>
      <CardContent className="py-4">
        <div className="flex items-baseline justify-between mb-2 px-1">
          <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
            12M 動能排行榜
          </div>
          <div className="text-[11px] text-muted-foreground font-mono">
            {scores.length} candidates · 紅底 = 當前持有
          </div>
        </div>

        {scores.length === 0 ? (
          <div className="text-xs text-muted-foreground py-3 px-1">
            尚無資料（候選股不足或 API 失敗）
          </div>
        ) : (
          <table className="w-full text-sm tabular-nums">
            <thead>
              <tr className="text-[11px] uppercase tracking-wider text-muted-foreground border-b">
                <th className="text-left font-medium py-1.5 px-1 w-10">#</th>
                <th className="text-left font-medium py-1.5 px-1">Ticker</th>
                <th className="text-left font-medium py-1.5 px-1">公司</th>
                <th className="text-right font-medium py-1.5 px-1">12M 前價</th>
                <th className="text-right font-medium py-1.5 px-1">當前價</th>
                <th className="text-right font-medium py-1.5 px-1">Momentum</th>
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
                    <td className="py-1.5 px-1 text-muted-foreground font-mono text-xs">
                      {rank}
                    </td>
                    <td className="py-1.5 px-1 font-mono font-semibold">
                      {s.ticker}
                    </td>
                    <td className="py-1.5 px-1 text-xs text-muted-foreground">
                      {nameByTicker.get(s.ticker) ?? '—'}
                    </td>
                    <td className="py-1.5 px-1 text-right font-mono text-xs text-muted-foreground">
                      {s.pastPrice.toFixed(2)}
                    </td>
                    <td className="py-1.5 px-1 text-right font-mono text-xs">
                      {s.currentPrice.toFixed(2)}
                    </td>
                    <td className={`py-1.5 px-1 text-right font-mono font-medium ${s.momentum >= 0 ? 'text-red-600' : 'text-green-600'}`}>
                      {fmtPct(s.momentum)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        <div className="text-[11px] text-muted-foreground mt-3 px-1 leading-relaxed">
          動能 = (當前收盤 / 252 個交易日前收盤) − 1。線上方為當前持有的 top {topN}，
          每月第一個交易日重新排序，新進前 {topN} 名取代落出名單者。
        </div>
      </CardContent>
    </Card>
  );
}

function fmtPct(x: number): string {
  if (!isFinite(x)) return '—';
  return (x >= 0 ? '+' : '') + (x * 100).toFixed(1) + '%';
}
