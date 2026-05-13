/**
 * Core momentum strategy logic.
 *
 * Pure functions over price history — no I/O, no Redis. Easy to unit-test
 * and reuse from both the page and the cron route.
 */

import type {
  StrategyConfig, StrategyState, Holding, NavSnapshot,
  RebalanceEvent, MomentumScore,
} from './momentum-types';
import { PARAMS } from './momentum-types';
import type { DailyHistory } from './yahoo-fetcher';
import { lastClose, priceNDaysAgo } from './yahoo-fetcher';

/**
 * Rank candidate stocks by 12-month price momentum.
 * Stocks lacking enough history are silently dropped.
 */
export function rankByMomentum(
  config: StrategyConfig,
  histories: Map<string, DailyHistory>,
): MomentumScore[] {
  const scores: MomentumScore[] = [];
  for (const stock of config.pool) {
    const h = histories.get(stock.yahooSym);
    if (!h) continue;
    const now = lastClose(h.bars);
    const past = priceNDaysAgo(h.bars, PARAMS.lookbackTradingDays);
    if (!now || !past || past.close <= 0) continue;
    scores.push({
      ticker: stock.ticker,
      currentPrice: now.close,
      pastPrice: past.close,
      momentum: now.close / past.close - 1,
    });
  }
  scores.sort((a, b) => b.momentum - a.momentum);
  return scores;
}

/**
 * Compute the NAV of given holdings using latest prices.
 * Returns native-currency cash value (e.g., USD for US strategy, TWD for TW).
 * Forward-fills if a ticker has no data today (uses last available close).
 */
export function computeNavValue(
  config: StrategyConfig,
  holdings: Holding[],
  histories: Map<string, DailyHistory>,
): number {
  let total = 0;
  for (const h of holdings) {
    const stock = config.pool.find(p => p.ticker === h.ticker);
    if (!stock) continue;
    const hist = histories.get(stock.yahooSym);
    if (!hist) continue;
    const px = lastClose(hist.bars);
    if (!px) continue;
    total += h.shares * px.close;
  }
  return total;
}

/**
 * Compute the equal-weight holding set for a target NAV value.
 * shares = (nav / N) / price_per_share
 */
export function buildHoldings(
  topN: MomentumScore[],
  navValue: number,
  date: string,
): Holding[] {
  const weight = 1 / topN.length;
  return topN.map(({ ticker, currentPrice }) => ({
    ticker,
    shares: (navValue * weight) / currentPrice,
    weight,
    entryDate: date,
    entryPrice: currentPrice,
  }));
}

/**
 * Initialize a strategy on its first run.
 * Picks top N right now, allocates equal weight using initial $100 NAV.
 * Stores the benchmark's price today as the baseline for rebasing.
 */
export function initializeStrategy(
  config: StrategyConfig,
  histories: Map<string, DailyHistory>,
  date: string,
): StrategyState | null {
  const ranked = rankByMomentum(config, histories);
  if (ranked.length < PARAMS.n) return null;

  const benchHist = histories.get(config.benchmarkYahooSym);
  const benchPx = benchHist ? lastClose(benchHist.bars) : null;
  if (!benchPx) return null;

  const top = ranked.slice(0, PARAMS.n);
  const initialNav = 100;
  const holdings = buildHoldings(top, initialNav, date);

  return {
    id: config.id,
    startDate: date,
    startingCapitalNtd: config.startingCapitalNtd,
    holdings,
    navHistory: [{ date, nav: 100, benchmarkNav: 100 }],
    rebalances: [{
      date,
      preNav: initialNav,
      sold: [],
      bought: top.map(t => t.ticker),
      newHoldings: top.map(t => ({
        ticker: t.ticker,
        weight: 1 / top.length,
        entryPrice: t.currentPrice,
      })),
    }],
    benchmarkBasePrice: benchPx.close,
    lastUpdate: date,
  };
}

/**
 * Apply a daily snapshot. If `isRebalanceDay`, also rebalance to new top N.
 * Returns the updated state. Pure function: does NOT mutate `state`.
 */
export function applySnapshot(
  state: StrategyState,
  config: StrategyConfig,
  histories: Map<string, DailyHistory>,
  date: string,
  isRebalanceDay: boolean,
): StrategyState {
  // Compute current "cash value" of holdings using today's prices.
  // navValue is in native currency units (NOT rebased) — we re-rebase at the end.
  const navValue = computeNavValue(config, state.holdings, histories);

  // Convert to the rebased index value (initial NAV was the starting holdings cash).
  // Since holdings are initialized so that their cash value == NAV at rebalance,
  // we can use ratios.
  let lastRebalanceNav = 100;
  for (const r of state.rebalances) {
    lastRebalanceNav = r.preNav;
  }
  // Cash value of holdings AT last rebalance equals lastRebalanceNav (by construction).
  // So today's rebased NAV = lastRebalanceNav * (today_cash_value / cash_at_rebalance).
  // But we don't store cash_at_rebalance separately — re-derive from holdings & entry prices.
  const cashAtRebalance = state.holdings.reduce(
    (s, h) => s + h.shares * h.entryPrice,
    0,
  );
  const todayNav = cashAtRebalance > 0 ? lastRebalanceNav * (navValue / cashAtRebalance) : lastRebalanceNav;

  // Benchmark NAV (rebased)
  const benchHist = histories.get(config.benchmarkYahooSym);
  const benchPx = benchHist ? lastClose(benchHist.bars) : null;
  const benchmarkNav = benchPx ? (benchPx.close / state.benchmarkBasePrice) * 100 : NaN;

  const navHistory: NavSnapshot[] = [
    ...state.navHistory.filter(s => s.date !== date),
    { date, nav: round(todayNav, 4), benchmarkNav: round(benchmarkNav, 4) },
  ].sort((a, b) => (a.date < b.date ? -1 : 1));

  let holdings = state.holdings;
  let rebalances = state.rebalances;

  if (isRebalanceDay) {
    const ranked = rankByMomentum(config, histories);
    if (ranked.length >= PARAMS.n) {
      const top = ranked.slice(0, PARAMS.n);
      const oldTickers = new Set(state.holdings.map(h => h.ticker));
      const newTickers = new Set(top.map(t => t.ticker));

      const newHoldings = buildHoldings(top, todayNav, date);
      const event: RebalanceEvent = {
        date,
        preNav: todayNav,
        sold: [...oldTickers].filter(t => !newTickers.has(t)),
        bought: [...newTickers].filter(t => !oldTickers.has(t)),
        newHoldings: top.map(t => ({
          ticker: t.ticker,
          weight: 1 / top.length,
          entryPrice: t.currentPrice,
        })),
      };
      holdings = newHoldings;
      rebalances = [...state.rebalances, event];
    }
  }

  return {
    ...state,
    holdings,
    navHistory,
    rebalances,
    lastUpdate: date,
  };
}

/**
 * Is the given date the first trading day of its month, given an existing nav history?
 * Implementation: look at all nav-history dates. The first date in each month is the
 * rebalance day. So `date` is a rebalance day iff there is no earlier nav-history entry
 * in the same YYYY-MM month.
 */
export function isFirstTradingDayOfMonth(
  navHistory: NavSnapshot[],
  date: string,
): boolean {
  const ym = date.slice(0, 7);
  for (const snap of navHistory) {
    if (snap.date === date) continue;
    if (snap.date.slice(0, 7) === ym) return false;
  }
  return true;
}

function round(x: number, d: number): number {
  if (!isFinite(x)) return x;
  const p = 10 ** d;
  return Math.round(x * p) / p;
}
