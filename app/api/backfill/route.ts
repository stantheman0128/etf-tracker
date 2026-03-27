/**
 * API Route: Backfill historical hourly portfolio data into Redis
 *
 * GET /api/backfill?days=7
 *
 * Fetches hourly price data from Yahoo Finance / Kraken / CoinGecko,
 * assembles IntradaySnapshot[] for each date, and stores via setHourlyData().
 * Uses a Redis cursor to resume from the last processed date.
 */

import { NextRequest, NextResponse } from 'next/server';
import { PORTFOLIO_CONFIG } from '@/lib/config';
import {
  getHourlyPrices,
  getBTCHourlyPrices,
  getHourlyExchangeRates,
  type HistoricalPrice,
} from '@/lib/api-client';
import { INITIAL_EXCHANGE_RATE } from '@/lib/initial-data';
import {
  setHourlyData,
  getBackfillCursor,
  setBackfillCursor,
} from '@/lib/redis-cache';
import { calculateValue } from '@/lib/utils/calculate';
import type { IntradaySnapshot } from '@/lib/types/intraday';

export const maxDuration = 30;

// Portfolio start date — no data before this
const PORTFOLIO_START = '2025-05-30';

// ─── Auth ────────────────────────────────────────────────────────────

function verifyRequest(request: NextRequest): boolean {
  if (process.env.NODE_ENV === 'development') return true;

  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error('CRON_SECRET not set in production');
    return false;
  }

  const authHeader = request.headers.get('authorization');
  return authHeader === `Bearer ${secret}`;
}

// ─── Helpers ─────────────────────────────────────────────────────────

/** Return YYYY-MM-DD string for a Date (UTC). */
function toDateStr(d: Date): string {
  return d.toISOString().split('T')[0];
}

/** Add `n` days to a date string, return new YYYY-MM-DD. */
function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return toDateStr(d);
}

/** Generate an array of YYYY-MM-DD strings from `start` (inclusive) for `count` days. */
function generateDates(start: string, count: number): string[] {
  const dates: string[] = [];
  for (let i = 0; i < count; i++) {
    dates.push(addDays(start, i));
  }
  return dates;
}

/**
 * Index hourly price data by date -> hourKey -> price.
 * hourKey = "YYYY-MM-DDTHH" (first 13 chars of ISO string).
 */
function indexByDateAndHour(
  prices: HistoricalPrice[],
): Map<string, Map<string, number>> {
  const map = new Map<string, Map<string, number>>();
  for (const p of prices) {
    const date = p.date.slice(0, 10);        // YYYY-MM-DD
    const hourKey = p.date.slice(0, 13);     // YYYY-MM-DDTHH
    let inner = map.get(date);
    if (!inner) {
      inner = new Map();
      map.set(date, inner);
    }
    inner.set(hourKey, p.close);
  }
  return map;
}

// ─── Main handler ────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const startTime = Date.now();

  if (!verifyRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // 1. Parse query params
    const { searchParams } = new URL(request.url);
    const rawDays = parseInt(searchParams.get('days') || '7', 10);
    const days = Math.min(Math.max(rawDays, 1), 365);

    // 2. Determine start date from cursor
    const cursor = await getBackfillCursor();

    let startDate: string;
    if (cursor) {
      // Resume from the day after the last processed date
      startDate = addDays(cursor, 1);
    } else {
      // No cursor — start from max(today - 365, PORTFOLIO_START)
      const earliest = addDays(toDateStr(new Date()), -365);
      startDate = earliest > PORTFOLIO_START ? earliest : PORTFOLIO_START;
    }

    // Don't go past today
    const today = toDateStr(new Date());
    if (startDate > today) {
      return NextResponse.json({
        status: 'up_to_date',
        cursor,
        message: 'Backfill is already up to date.',
      });
    }

    // Generate the dates we'll process in this invocation
    const datesToProcess = generateDates(startDate, days).filter(d => d <= today);

    if (datesToProcess.length === 0) {
      return NextResponse.json({
        status: 'up_to_date',
        cursor,
        message: 'No dates to process.',
      });
    }

    console.log(
      `Backfill: processing ${datesToProcess.length} dates from ${datesToProcess[0]} to ${datesToProcess[datesToProcess.length - 1]}`,
    );

    // 3. Fetch ALL hourly data in parallel (one call per symbol + exchange rate)
    const holdings = PORTFOLIO_CONFIG.holdings;

    const [hourlyExchangeRates, ...allHourlyPrices] = await Promise.all([
      getHourlyExchangeRates(365),
      ...holdings.map((holding) => {
        if (holding.market === 'CRYPTO') {
          return getBTCHourlyPrices(365);
        }
        return getHourlyPrices(holding.symbol, 365);
      }),
    ]);

    // 4. Index all fetched data by date + hour for fast lookup
    const fxIndex = indexByDateAndHour(hourlyExchangeRates);
    const priceIndices = allHourlyPrices.map((prices) => indexByDateAndHour(prices));

    // 5. Build snapshots per date and store
    //    Carry forward: persist last known price per stock across dates,
    //    so every snapshot includes ALL stocks (not just those with new data).
    let datesWritten = 0;
    let lastProcessedDate = cursor || '';
    const lastKnownPrice = new Map<string, number>();
    let lastKnownFx = INITIAL_EXCHANGE_RATE;

    // Seed carry-forward state by scanning backwards from startDate
    // until we find price data for each stock (handles weekends/holidays)
    const batchStart = datesToProcess[0];
    for (let i = 0; i < holdings.length; i++) {
      for (let back = 1; back <= 7; back++) {
        if (lastKnownPrice.has(holdings[i].symbol)) break;
        const seedDate = addDays(batchStart, -back);
        const dayMap = priceIndices[i].get(seedDate);
        if (dayMap && dayMap.size > 0) {
          const lastHour = Array.from(dayMap.keys()).sort().pop()!;
          lastKnownPrice.set(holdings[i].symbol, dayMap.get(lastHour)!);
        }
      }
    }
    for (let back = 1; back <= 7; back++) {
      const seedDate = addDays(batchStart, -back);
      const seedFxMap = fxIndex.get(seedDate);
      if (seedFxMap && seedFxMap.size > 0) {
        const lastHour = Array.from(seedFxMap.keys()).sort().pop()!;
        lastKnownFx = seedFxMap.get(lastHour) || INITIAL_EXCHANGE_RATE;
        break;
      }
    }

    for (const date of datesToProcess) {
      // Collect hour keys from real data sources
      const realHourKeys = new Set<string>();

      for (let i = 0; i < holdings.length; i++) {
        const dateMap = priceIndices[i].get(date);
        if (dateMap) {
          Array.from(dateMap.keys()).forEach((hk) => realHourKeys.add(hk));
        }
      }

      const fxDateMap = fxIndex.get(date);
      if (fxDateMap) {
        Array.from(fxDateMap.keys()).forEach((hk) => realHourKeys.add(hk));
      }

      // Generate all 24 hour keys for this date if we have carry-forward state.
      // This fills weekends/holidays with smooth carry-forward points.
      const hourKeysSet = new Set<string>();
      if (realHourKeys.size > 0) {
        // Date has some real data — use real hours + fill gaps
        realHourKeys.forEach(hk => hourKeysSet.add(hk));
      }
      // If we have carry-forward state, pad to all 24 hours
      if (lastKnownPrice.size > 0) {
        const [y, m, d] = date.split('-').map(Number);
        for (let h = 0; h < 24; h++) {
          const hk = `${date}T${h.toString().padStart(2, '0')}`;
          hourKeysSet.add(hk);
        }
      }

      if (hourKeysSet.size === 0) {
        lastProcessedDate = date;
        continue;
      }

      const sortedHourKeys = Array.from(hourKeysSet).sort();
      const snapshots: IntradaySnapshot[] = [];

      for (const hourKey of sortedHourKeys) {
        // Find exchange rate for this hour (carry forward if missing)
        const fxPrice = fxDateMap?.get(hourKey);
        const fx = (fxPrice && fxPrice > 0) ? fxPrice : lastKnownFx;
        lastKnownFx = fx;

        // Build per-stock data — include ALL stocks via carry-forward
        const stocks: { s: string; p: number; v: number }[] = [];
        let totalValueTWD = 0;
        let totalValueFixedRate = 0;

        for (let i = 0; i < holdings.length; i++) {
          const holding = holdings[i];
          // Use new price if available, otherwise carry forward last known
          const newPrice = priceIndices[i].get(date)?.get(hourKey);
          const price = (newPrice !== undefined && newPrice > 0)
            ? newPrice
            : lastKnownPrice.get(holding.symbol);

          if (price === undefined) continue; // stock never seen yet

          // Update carry-forward state
          lastKnownPrice.set(holding.symbol, price);

          const value = calculateValue(holding.shares, price, holding.currency, fx);
          const valueTWD = Math.round(value.twd);

          stocks.push({
            s: holding.symbol,
            p: price,
            v: valueTWD,
          });

          totalValueTWD += value.twd;

          const fixedValue =
            holding.currency === 'USD'
              ? holding.shares * price * INITIAL_EXCHANGE_RATE
              : holding.shares * price;
          totalValueFixedRate += fixedValue;
        }

        // Skip hours where no stock has ever been seen
        if (stocks.length === 0) continue;

        // Derive Unix timestamp from hourKey ("YYYY-MM-DDTHH")
        const ts = Math.floor(new Date(hourKey + ':00:00Z').getTime() / 1000);

        snapshots.push({
          t: ts,
          tv: Math.round(totalValueTWD),
          tf: Math.round(totalValueFixedRate),
          fx,
          st: stocks,
        });
      }

      // Don't write empty arrays
      if (snapshots.length === 0) {
        lastProcessedDate = date;
        continue;
      }

      await setHourlyData(date, snapshots);
      datesWritten++;
      lastProcessedDate = date;
    }

    // 6. Update cursor
    if (lastProcessedDate) {
      await setBackfillCursor(lastProcessedDate);
    }

    const duration = Date.now() - startTime;

    console.log(
      `Backfill complete: ${datesWritten} dates written in ${duration}ms (cursor: ${lastProcessedDate})`,
    );

    return NextResponse.json({
      status: 'ok',
      datesRequested: datesToProcess.length,
      datesWritten,
      dateRange: {
        from: datesToProcess[0],
        to: datesToProcess[datesToProcess.length - 1],
      },
      cursor: lastProcessedDate,
      duration: `${duration}ms`,
    });
  } catch (error) {
    console.error('Backfill failed:', error);
    return NextResponse.json(
      { error: 'Backfill failed', details: String(error) },
      { status: 500 },
    );
  }
}
