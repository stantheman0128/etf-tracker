/**
 * Yahoo Finance v8 chart API wrapper for strategy module.
 *
 * Unlike the existing lib/api-client.ts (which fetches single quotes for the
 * portfolio dashboard), this fetches **full daily history** so we can compute
 * 12-month momentum and rebuild prices on demand.
 *
 * Uses the same public endpoint as our Python backtest scripts:
 *   https://query1.finance.yahoo.com/v8/finance/chart/{sym}?period1=...&interval=1d
 */

import { devLog } from '../config';

export interface DailyBar {
  date: string;     // YYYY-MM-DD (UTC)
  close: number;
}

export interface DailyHistory {
  symbol: string;
  bars: DailyBar[];   // ascending by date, closes only (forward-fill not applied)
}

const YAHOO_BASE = 'https://query1.finance.yahoo.com/v8/finance/chart';

interface YahooChartResponse {
  chart: {
    result: Array<{
      timestamp: number[];
      indicators: { quote: Array<{ close: (number | null)[] }> };
    }> | null;
    error: { code: string; description: string } | null;
  };
}

/**
 * Fetch daily close prices for one symbol over the requested window.
 * Returns null on network/API error. Missing closes (Yahoo returns null on
 * non-trading bars or data glitches) are dropped silently.
 */
export async function fetchDailyHistory(
  symbol: string,
  startUnix: number,
  endUnix: number = Math.floor(Date.now() / 1000),
): Promise<DailyHistory | null> {
  const url = `${YAHOO_BASE}/${encodeURIComponent(symbol)}?period1=${startUnix}&period2=${endUnix}&interval=1d`;

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      // Next.js caching: we want fresh data on cron, stale-while-revalidate on page
      next: { revalidate: 60 * 60 },  // 1 hour
    });
    if (!res.ok) {
      console.warn(`Yahoo fetch ${symbol}: HTTP ${res.status}`);
      return null;
    }
    const payload = (await res.json()) as YahooChartResponse;
    const result = payload.chart.result?.[0];
    if (!result) {
      console.warn(`Yahoo fetch ${symbol}: empty result`);
      return null;
    }

    const timestamps = result.timestamp ?? [];
    const closes = result.indicators.quote?.[0]?.close ?? [];
    const bars: DailyBar[] = [];
    for (let i = 0; i < timestamps.length; i++) {
      const c = closes[i];
      if (c == null) continue;
      const date = new Date(timestamps[i] * 1000).toISOString().slice(0, 10);
      bars.push({ date, close: Number(c.toFixed(4)) });
    }
    return { symbol, bars };
  } catch (err) {
    console.error(`Yahoo fetch ${symbol} error:`, err);
    return null;
  }
}

/**
 * Fetch many symbols in parallel batches.
 * Yahoo's public chart API tolerates ~10 concurrent requests; larger batches
 * occasionally trigger rate limiting. Sequential was ~10-15 s for 40 symbols,
 * batched parallel is ~1-2 s.
 */
export async function fetchMany(
  symbols: string[],
  startUnix: number,
  endUnix?: number,
  batchSize: number = 10,
): Promise<Map<string, DailyHistory>> {
  const out = new Map<string, DailyHistory>();
  for (let i = 0; i < symbols.length; i += batchSize) {
    const batch = symbols.slice(i, i + batchSize);
    const results = await Promise.all(
      batch.map(s => fetchDailyHistory(s, startUnix, endUnix)),
    );
    results.forEach((h, idx) => {
      if (h) {
        out.set(batch[idx], h);
        devLog(`  ✓ ${batch[idx]}: ${h.bars.length} bars`);
      } else {
        devLog(`  ✗ ${batch[idx]}: failed`);
      }
    });
  }
  return out;
}

/**
 * Convenience: returns the close from N trading days back (or null if not enough history).
 * Walks backwards from the array tail.
 */
export function priceNDaysAgo(bars: DailyBar[], n: number): DailyBar | null {
  if (bars.length <= n) return null;
  return bars[bars.length - 1 - n];
}

/** Most recent close (or null if no bars). */
export function lastClose(bars: DailyBar[]): DailyBar | null {
  return bars.length > 0 ? bars[bars.length - 1] : null;
}
