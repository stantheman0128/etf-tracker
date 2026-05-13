import { Card, CardContent } from '@/components/ui/card';
import type { StrategyState, StrategyConfig } from '@/lib/strategies/momentum-types';

interface Props {
  config: StrategyConfig;
  state: StrategyState | null;
  livePrices?: Record<string, number>;   // ticker → current native price
  nextRebalanceDate?: string;             // YYYY-MM-DD or "(計算中)"
}

export default function SignalCard({ config, state, livePrices, nextRebalanceDate }: Props) {
  if (!state) {
    return (
      <Card>
        <CardContent className="py-6">
          <div className="text-sm font-semibold mb-1">{config.label}</div>
          <div className="text-xs text-muted-foreground">
            策略尚未初始化。等待第一次 cron snapshot。
          </div>
        </CardContent>
      </Card>
    );
  }

  const lastNav = state.navHistory.length > 0
    ? state.navHistory[state.navHistory.length - 1]
    : null;
  const portfolioReturn = lastNav ? lastNav.nav / 100 - 1 : 0;
  const benchmarkReturn = lastNav ? lastNav.benchmarkNav / 100 - 1 : 0;
  const excess = portfolioReturn - benchmarkReturn;
  const ntdValue = state.startingCapitalNtd * (1 + portfolioReturn);

  return (
    <Card>
      <CardContent className="py-5">
        <div className="flex items-baseline justify-between mb-3">
          <div className="text-sm font-semibold">{config.label}</div>
          <div className="text-[11px] text-muted-foreground font-mono">
            自 {state.startDate} · 下次再平衡 {nextRebalanceDate ?? '—'}
          </div>
        </div>

        <table className="w-full text-sm tabular-nums">
          <thead>
            <tr className="text-[11px] uppercase tracking-wider text-muted-foreground border-b">
              <th className="text-left font-medium py-1.5">Ticker</th>
              <th className="text-right font-medium py-1.5">權重</th>
              <th className="text-right font-medium py-1.5">買進價</th>
              <th className="text-right font-medium py-1.5">目前價</th>
              <th className="text-right font-medium py-1.5">未實現</th>
            </tr>
          </thead>
          <tbody>
            {state.holdings.map(h => {
              const cur = livePrices?.[h.ticker] ?? h.entryPrice;
              const ret = h.entryPrice > 0 ? cur / h.entryPrice - 1 : 0;
              return (
                <tr key={h.ticker} className="border-b last:border-b-0">
                  <td className="py-2 font-mono font-semibold">{h.ticker}</td>
                  <td className="py-2 text-right font-mono">{(h.weight * 100).toFixed(1)}%</td>
                  <td className="py-2 text-right font-mono text-muted-foreground">
                    {fmtPrice(h.entryPrice, config.currency)}
                  </td>
                  <td className="py-2 text-right font-mono">
                    {fmtPrice(cur, config.currency)}
                  </td>
                  <td className={`py-2 text-right font-mono font-medium ${ret >= 0 ? 'text-red-600' : 'text-green-600'}`}>
                    {fmtPct(ret)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div className="mt-4 pt-3 border-t flex items-baseline justify-between text-sm">
          <div className="text-muted-foreground">
            起始 {fmtNTD(state.startingCapitalNtd)} · 當前 <span className="font-semibold text-foreground">{fmtNTD(ntdValue)}</span>
          </div>
          <div className="font-mono">
            <span className={portfolioReturn >= 0 ? 'text-red-600 font-semibold' : 'text-green-600 font-semibold'}>
              {fmtPct(portfolioReturn)}
            </span>
            <span className="text-muted-foreground mx-1.5">vs {config.benchmarkLabel}</span>
            <span className={benchmarkReturn >= 0 ? 'text-red-600' : 'text-green-600'}>
              {fmtPct(benchmarkReturn)}
            </span>
            <span className="text-muted-foreground mx-1.5">·</span>
            <span className={excess >= 0 ? 'text-red-600 font-semibold' : 'text-green-600 font-semibold'}>
              {excess >= 0 ? '+' : ''}{(excess * 100).toFixed(2)}%
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function fmtPct(x: number): string {
  if (!isFinite(x)) return '—';
  return (x >= 0 ? '+' : '') + (x * 100).toFixed(2) + '%';
}

function fmtPrice(x: number, currency: 'USD' | 'TWD'): string {
  if (!isFinite(x)) return '—';
  return (currency === 'USD' ? '$' : 'NT$') + x.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtNTD(x: number): string {
  return 'NT$' + Math.round(x).toLocaleString();
}
