import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import {
  STRATEGIES, PARAMS, type StrategyId,
} from '@/lib/strategies/momentum-types';
import { loadStrategyState } from '@/lib/strategies/strategy-store';
import { fetchMany, lastClose } from '@/lib/strategies/yahoo-fetcher';
import { initializeStrategy, rankByMomentum } from '@/lib/strategies/top3-momentum';
import SignalCard from '@/components/strategies/SignalCard';
import PerformanceChart from '@/components/strategies/PerformanceChart';
import RebalanceHistoryTable from '@/components/strategies/RebalanceHistoryTable';
import MomentumRanking from '@/components/strategies/MomentumRanking';

// This page reads Redis + fetches external API on every request.
// Mark it dynamic so Next.js doesn't try to prerender it at build time.
export const dynamic = 'force-dynamic';

const STRATEGY_IDS: StrategyId[] = ['us-top3', 'tw-top3'];
const FETCH_WINDOW_DAYS = 400;

/**
 * Single fetch per strategy. Returns everything the page needs:
 *  - state: stored or freshly-initialized strategy state
 *  - isPreview: true if we built it on the fly (no Redis state yet)
 *  - livePrices: today's closes for each ticker (for SignalCard)
 *  - ranking: full sorted MomentumScore[] for MomentumRanking
 */
async function getStrategyData(id: StrategyId) {
  const config = STRATEGIES[id];
  const yahooSyms = [
    ...config.pool.map(p => p.yahooSym),
    config.benchmarkYahooSym,
  ];
  const startUnix = Math.floor(
    (Date.now() - FETCH_WINDOW_DAYS * 24 * 60 * 60 * 1000) / 1000,
  );
  const histories = await fetchMany(yahooSyms, startUnix, undefined, 80);

  // Live prices
  const livePrices: Record<string, number> = {};
  for (const stock of config.pool) {
    const h = histories.get(stock.yahooSym);
    const px = h ? lastClose(h.bars) : null;
    if (px) livePrices[stock.ticker] = px.close;
  }

  // Full momentum ranking (descending)
  const ranking = rankByMomentum(config, histories);

  // Stored or preview state
  const stored = await loadStrategyState(id);
  let state = stored;
  let isPreview = false;
  if (!state) {
    const today = new Date().toISOString().slice(0, 10);
    state = initializeStrategy(config, histories, today);
    isPreview = true;
  }

  return { config, state, isPreview, livePrices, ranking };
}

function computeNextRebalanceDate(): string {
  const now = new Date();
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return next.toISOString().slice(0, 10);
}

export default async function MomentumStrategyPage() {
  const nextRebalance = computeNextRebalanceDate();
  const [usData, twData] = await Promise.all([
    getStrategyData('us-top3'),
    getStrategyData('tw-top3'),
  ]);

  const dataById = { 'us-top3': usData, 'tw-top3': twData };

  return (
    <main className="container max-w-5xl mx-auto px-4 py-6">
      <header className="mb-6">
        <Link href="/" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 mb-1">
          <ArrowLeft className="w-3 h-3" /> Portfolio
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">
          TOP 3 by 12M Momentum
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          動態前 3 名動能策略 · 每月第一個交易日再平衡 · 起始資金 NT$200,000（US/TW 各半）
        </p>
      </header>

      {STRATEGY_IDS.map(id => {
        const data = dataById[id];
        const { config, state, isPreview, livePrices, ranking } = data;
        const heldTickers = new Set(state?.holdings.map(h => h.ticker) ?? []);
        return (
          <section key={id} className="mb-8">
            {isPreview && (
              <div className="mb-2 text-[11px] text-amber-600 font-mono">
                ⚠ Preview mode (策略尚未由 cron 初始化，下方數據為即時計算結果)
              </div>
            )}
            <div className="grid gap-4">
              <SignalCard
                config={config}
                state={state}
                livePrices={livePrices}
                nextRebalanceDate={nextRebalance}
              />
              <MomentumRanking
                scores={ranking}
                pool={config.pool}
                heldTickers={heldTickers}
                topN={PARAMS.n}
              />
              <PerformanceChart
                navHistory={state?.navHistory ?? []}
                rebalanceDates={(state?.rebalances ?? []).map(r => r.date)}
                benchmarkLabel={config.benchmarkLabel}
                strategyLabel={config.label}
                startDate={state?.startDate}
              />
              <RebalanceHistoryTable rebalances={state?.rebalances ?? []} />
            </div>
          </section>
        );
      })}

      <footer className="mt-8 pt-4 border-t text-[11px] text-muted-foreground space-y-1">
        <p>Data source: Yahoo Finance · NAV rebased to 100 at start date · Benchmark rebased same way</p>
        <p>Snapshots taken daily at 22:00 UTC weekdays by Vercel Cron. First-of-month auto-rebalance.</p>
        <p>Momentum signal = (today close / close 252 trading days ago) − 1. Equal weight within top {PARAMS.n}.</p>
      </footer>
    </main>
  );
}
