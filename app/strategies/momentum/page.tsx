import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import {
  STRATEGIES, PARAMS, type StrategyId, type MomentumScore,
} from '@/lib/strategies/momentum-types';
import { loadStrategyState } from '@/lib/strategies/strategy-store';
import { fetchMany, lastClose } from '@/lib/strategies/yahoo-fetcher';
import { initializeStrategy, rankByMomentum } from '@/lib/strategies/top3-momentum';
import SignalCard from '@/components/strategies/SignalCard';
import PerformanceChart from '@/components/strategies/PerformanceChart';
import RebalanceHistoryTable from '@/components/strategies/RebalanceHistoryTable';
import MomentumRanking from '@/components/strategies/MomentumRanking';

// This page reads Redis on every request. Dynamic — never prerender.
export const dynamic = 'force-dynamic';

const STRATEGY_IDS: StrategyId[] = ['us-top3', 'tw-top3'];
const FETCH_WINDOW_DAYS = 400;

/**
 * Cron-driven path (fast): if Redis state has `cachedRanking`, use it directly.
 * Cold path (slow): no Redis state yet — fall back to live Yahoo fetch and
 * compute everything on the fly. Only hits on first visit before cron runs.
 */
async function getStrategyData(id: StrategyId) {
  const config = STRATEGIES[id];
  const stored = await loadStrategyState(id);

  // Fast path: state exists with cached ranking + prices
  if (stored?.cachedRanking && stored?.cachedLivePrices) {
    return {
      config,
      state: stored,
      isPreview: false,
      livePrices: stored.cachedLivePrices,
      ranking: stored.cachedRanking,
    };
  }

  // Cold path: live fetch
  const yahooSyms = [
    ...config.pool.map(p => p.yahooSym),
    config.benchmarkYahooSym,
  ];
  const startUnix = Math.floor(
    (Date.now() - FETCH_WINDOW_DAYS * 24 * 60 * 60 * 1000) / 1000,
  );
  const histories = await fetchMany(yahooSyms, startUnix, undefined, 10);

  const livePrices: Record<string, number> = {};
  for (const stock of config.pool) {
    const h = histories.get(stock.yahooSym);
    const px = h ? lastClose(h.bars) : null;
    if (px) livePrices[stock.ticker] = px.close;
  }
  const ranking: MomentumScore[] = rankByMomentum(config, histories);

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
  const anyPreview = usData.isPreview || twData.isPreview;

  return (
    <div className="container mx-auto p-4 md:p-6 max-w-7xl">
      {/* Header — matches main page style: white rounded card with gradient title */}
      <div className="bg-white/95 backdrop-blur rounded-2xl shadow-xl p-6 mb-6">
        <Link
          href="/"
          className="text-xs text-gray-500 hover:text-gray-800 inline-flex items-center gap-1 mb-2 transition-colors"
        >
          <ArrowLeft className="w-3 h-3" /> Portfolio
        </Link>
        <h1 className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-[#667eea] to-[#764ba2] bg-clip-text text-transparent">
          TOP 3 by 12M Momentum
        </h1>
        <p className="text-sm text-gray-500 mt-2">
          動態前 3 名動能策略 · 每月第一個交易日再平衡 · 起始資金 NT$200,000（US/TW 各半）
        </p>
        {anyPreview && (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-3 inline-block font-mono">
            ⚠ Preview mode · 策略尚未由 cron 初始化，下方為即時計算結果
          </p>
        )}
      </div>

      {/* Row 1: SignalCards side-by-side */}
      <div className="grid gap-4 md:grid-cols-2 mb-4">
        {STRATEGY_IDS.map(id => {
          const { config, state, livePrices } = dataById[id];
          return (
            <SignalCard
              key={id}
              config={config}
              state={state}
              livePrices={livePrices}
              nextRebalanceDate={nextRebalance}
            />
          );
        })}
      </div>

      {/* Row 2: Charts side-by-side */}
      <div className="grid gap-4 md:grid-cols-2 mb-4">
        {STRATEGY_IDS.map(id => {
          const { config, state } = dataById[id];
          return (
            <PerformanceChart
              key={id}
              navHistory={state?.navHistory ?? []}
              rebalanceDates={(state?.rebalances ?? []).map(r => r.date)}
              benchmarkLabel={config.benchmarkLabel}
              strategyLabel={config.label}
              startDate={state?.startDate}
            />
          );
        })}
      </div>

      {/* Row 3: Collapsible Momentum Rankings (start closed to keep page short) */}
      <div className="grid gap-4 md:grid-cols-2 mb-4">
        {STRATEGY_IDS.map(id => {
          const { config, state, ranking } = dataById[id];
          const heldTickers = new Set(state?.holdings.map(h => h.ticker) ?? []);
          return (
            <details
              key={id}
              className="bg-white/95 backdrop-blur rounded-2xl shadow-lg overflow-hidden group"
            >
              <summary className="cursor-pointer list-none px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors">
                <div>
                  <div className="text-sm font-semibold text-gray-800">
                    {config.market} 12M 動能排行榜
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {ranking.length} 檔候選 · 點擊展開
                  </div>
                </div>
                <div className="text-[#667eea] text-sm group-open:rotate-90 transition-transform">
                  ▶
                </div>
              </summary>
              <div className="px-2 pb-2">
                <MomentumRanking
                  scores={ranking}
                  pool={config.pool}
                  heldTickers={heldTickers}
                  topN={PARAMS.n}
                />
              </div>
            </details>
          );
        })}
      </div>

      {/* Row 4: Collapsible Rebalance Histories */}
      <div className="grid gap-4 md:grid-cols-2 mb-6">
        {STRATEGY_IDS.map(id => {
          const { config, state } = dataById[id];
          const count = state?.rebalances.length ?? 0;
          return (
            <details
              key={id}
              className="bg-white/95 backdrop-blur rounded-2xl shadow-lg overflow-hidden group"
            >
              <summary className="cursor-pointer list-none px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors">
                <div>
                  <div className="text-sm font-semibold text-gray-800">
                    {config.market} 換手歷史
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {count} 次再平衡 · 點擊展開
                  </div>
                </div>
                <div className="text-[#667eea] text-sm group-open:rotate-90 transition-transform">
                  ▶
                </div>
              </summary>
              <div className="px-2 pb-2">
                <RebalanceHistoryTable rebalances={state?.rebalances ?? []} />
              </div>
            </details>
          );
        })}
      </div>

      {/* Footnote */}
      <footer className="bg-white/10 backdrop-blur rounded-2xl px-6 py-4 text-[11px] text-white/80 space-y-1">
        <p>Data source: Yahoo Finance · NAV rebased to 100 at start date · Benchmark rebased same way</p>
        <p>Snapshots daily at 22:00 UTC (weekdays) by Vercel Cron · First-of-month auto-rebalance</p>
        <p>Momentum signal = (today close / close 252 trading days ago) − 1 · Equal weight within top {PARAMS.n}</p>
      </footer>
    </div>
  );
}
