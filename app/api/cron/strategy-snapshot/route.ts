/**
 * Cron: daily snapshot for every strategy in STRATEGIES.
 *
 * - Triggered by Vercel Cron at 22:00 UTC on weekdays (see vercel.json).
 * - For each strategy: fetch ~400 days of price history → compute today's NAV
 *   → if first trading day of month, also rebalance to new Top 3 → save state.
 * - First run on an uninitialized strategy seeds it via initializeStrategy().
 *
 * Idempotency: re-runs on the same date overwrite that date's NAV snapshot
 * but do NOT duplicate rebalance events (we detect them by date in
 * applySnapshot's caller logic).
 */

import { NextRequest, NextResponse } from 'next/server';
import { devLog } from '@/lib/config';
import {
  STRATEGIES, type StrategyId, type StrategyConfig, type StrategyState,
} from '@/lib/strategies/momentum-types';
import { fetchMany } from '@/lib/strategies/yahoo-fetcher';
import {
  loadStrategyState, saveStrategyState,
} from '@/lib/strategies/strategy-store';
import {
  initializeStrategy, applySnapshot, isFirstTradingDayOfMonth,
} from '@/lib/strategies/top3-momentum';

const FETCH_WINDOW_DAYS = 400;

function verifyCronRequest(request: NextRequest): boolean {
  if (process.env.NODE_ENV === 'development') return true;
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error('❌ CRON_SECRET not set in production');
    return false;
  }
  const authHeader = request.headers.get('authorization');
  return authHeader === `Bearer ${secret}`;
}

interface StrategyResult {
  id: StrategyId;
  status: 'initialized' | 'updated' | 'rebalanced' | 'failed';
  message?: string;
  nav?: number;
  benchmarkNav?: number;
  rebalanceCount?: number;
}

async function processStrategy(
  config: StrategyConfig,
  today: string,
): Promise<StrategyResult> {
  try {
    const yahooSyms = [
      ...config.pool.map(p => p.yahooSym),
      config.benchmarkYahooSym,
    ];
    const startUnix = Math.floor(
      (Date.now() - FETCH_WINDOW_DAYS * 24 * 60 * 60 * 1000) / 1000,
    );
    const histories = await fetchMany(yahooSyms, startUnix, undefined, 100);

    let state = await loadStrategyState(config.id);

    if (!state) {
      const seeded = initializeStrategy(config, histories, today);
      if (!seeded) {
        return { id: config.id, status: 'failed', message: 'init failed (insufficient data)' };
      }
      await saveStrategyState(seeded);
      return {
        id: config.id, status: 'initialized',
        nav: 100, benchmarkNav: 100, rebalanceCount: 1,
      };
    }

    // Determine if today is the first trading day of its month for this strategy.
    // We use the EXISTING navHistory (excluding any prior today snapshot).
    const priorHistory = state.navHistory.filter(s => s.date < today);
    const isRebalanceDay = isFirstTradingDayOfMonth(
      [...priorHistory, { date: today, nav: 0, benchmarkNav: 0 }],
      today,
    );

    // Avoid duplicate rebalance events if cron re-runs the same day
    const alreadyRebalancedToday = state.rebalances.some(r => r.date === today);
    const doRebalance = isRebalanceDay && !alreadyRebalancedToday;

    state = applySnapshot(state, config, histories, today, doRebalance);
    await saveStrategyState(state);

    const lastSnap = state.navHistory[state.navHistory.length - 1];
    return {
      id: config.id,
      status: doRebalance ? 'rebalanced' : 'updated',
      nav: lastSnap?.nav,
      benchmarkNav: lastSnap?.benchmarkNav,
      rebalanceCount: state.rebalances.length,
    };
  } catch (err) {
    console.error(`Strategy ${config.id}:`, err);
    return {
      id: config.id, status: 'failed',
      message: err instanceof Error ? err.message : 'unknown error',
    };
  }
}

export async function GET(request: NextRequest) {
  const startMs = Date.now();
  if (!verifyCronRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const today = new Date().toISOString().slice(0, 10);
  devLog(`🔄 Strategy snapshot: ${today}`);

  const ids = Object.keys(STRATEGIES) as StrategyId[];
  const results: StrategyResult[] = [];
  for (const id of ids) {
    const r = await processStrategy(STRATEGIES[id], today);
    results.push(r);
  }

  const durationMs = Date.now() - startMs;
  return NextResponse.json({
    date: today,
    durationMs,
    results,
  });
}
