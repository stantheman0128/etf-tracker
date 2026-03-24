/**
 * Single-day intraday detail API
 *
 * GET /api/intraday?date=2026-03-24
 *
 * Returns hourly (or 5-min) portfolio snapshots for a given date.
 * Data sources (in priority order):
 *   1. Collected 5-min snapshots (from cron)
 *   2. Backfilled hourly data (previously fetched)
 *   3. On-demand fetch from Yahoo Finance / Kraken (then cached)
 */

import { NextRequest, NextResponse } from 'next/server';
import { PORTFOLIO_CONFIG } from '@/lib/config';
import {
  getHourlyPrices,
  getBTCHourlyPrices,
  getHourlyExchangeRates,
} from '@/lib/api-client';
import { INITIAL_EXCHANGE_RATE, getPortfolioStartDate } from '@/lib/initial-data';
import {
  getIntradayData,
  getHourlyData,
  setHourlyData,
} from '@/lib/redis-cache';
import { calculateValue } from '@/lib/utils/calculate';
import type {
  IntradaySnapshot,
  IntradayStockSnapshot,
  IntradayDayData,
} from '@/lib/types/intraday';

// ─── On-demand backfill helper ───────────────────────────────────────

/**
 * Fetch hourly data for a single date from external APIs,
 * build IntradaySnapshot[], and store in Redis.
 */
async function fetchAndBuildHourlySnapshots(
  date: string,
): Promise<IntradaySnapshot[]> {
  console.log(`📡 Intraday API: on-demand fetch for ${date}`);

  // Fetch 1 day of hourly data for each stock, BTC, and exchange rate
  const stockPromises = PORTFOLIO_CONFIG.holdings
    .filter((h) => h.market !== 'CRYPTO')
    .map(async (holding) => {
      const data = await getHourlyPrices(holding.symbol, 1);
      return { symbol: holding.symbol, data };
    });

  const [stockResults, btcHourly, fxHourly] = await Promise.all([
    Promise.all(stockPromises),
    getBTCHourlyPrices(1),
    getHourlyExchangeRates(1),
  ]);

  // Build lookup maps keyed by ISO hour prefix ("YYYY-MM-DDTHH")
  // Stock prices: symbol -> hourKey -> price
  const stockPriceByHour = new Map<string, Map<string, number>>();
  for (const { symbol, data } of stockResults) {
    const hourMap = new Map<string, number>();
    for (const point of data) {
      // point.date is ISO string from getHourlyPrices
      const hourKey = point.date.slice(0, 13);
      if (hourKey.startsWith(date)) {
        hourMap.set(hourKey, point.close);
      }
    }
    stockPriceByHour.set(symbol, hourMap);
  }

  // BTC prices: hourKey -> price
  const btcByHour = new Map<string, number>();
  for (const point of btcHourly) {
    const hourKey = point.date.slice(0, 13);
    if (hourKey.startsWith(date)) {
      btcByHour.set(hourKey, point.close);
    }
  }

  // Exchange rates: hourKey -> rate
  const fxByHour = new Map<string, number>();
  for (const point of fxHourly) {
    const hourKey = point.date.slice(0, 13);
    if (hourKey.startsWith(date)) {
      fxByHour.set(hourKey, point.close);
    }
  }

  // Collect all unique hour keys for the target date
  const allHourKeys = new Set<string>();
  stockPriceByHour.forEach((hourMap) => {
    hourMap.forEach((_, key) => allHourKeys.add(key));
  });
  btcByHour.forEach((_, key) => allHourKeys.add(key));
  fxByHour.forEach((_, key) => allHourKeys.add(key));

  const sortedHours = Array.from(allHourKeys).sort();

  // Build snapshots
  const snapshots: IntradaySnapshot[] = [];
  let lastKnownFx = INITIAL_EXCHANGE_RATE;
  const lastKnownPrice = new Map<string, number>();

  for (const hourKey of sortedHours) {
    // Determine exchange rate (carry forward if missing)
    const fx = fxByHour.get(hourKey) ?? lastKnownFx;
    lastKnownFx = fx;

    // Build per-stock snapshot
    const stockSnapshots: IntradayStockSnapshot[] = [];
    let totalValueTWD = 0;
    let totalValueFixedRate = 0;
    let hasAnyPrice = false;

    for (const holding of PORTFOLIO_CONFIG.holdings) {
      let price: number | undefined;

      if (holding.market === 'CRYPTO') {
        price = btcByHour.get(hourKey) ?? lastKnownPrice.get(holding.symbol);
      } else {
        const hourMap = stockPriceByHour.get(holding.symbol);
        price = hourMap?.get(hourKey) ?? lastKnownPrice.get(holding.symbol);
      }

      if (price === undefined) continue;

      lastKnownPrice.set(holding.symbol, price);
      hasAnyPrice = true;

      const value = calculateValue(holding.shares, price, holding.currency, fx);
      const fixedValue = calculateValue(
        holding.shares,
        price,
        holding.currency,
        INITIAL_EXCHANGE_RATE,
      );

      totalValueTWD += value.twd;
      totalValueFixedRate += fixedValue.twd;

      stockSnapshots.push({
        s: holding.symbol,
        p: price,
        v: Math.round(value.twd),
      });
    }

    if (!hasAnyPrice || stockSnapshots.length === 0) continue;

    // Timestamp: parse hourKey back to epoch seconds
    const timestamp = Math.floor(new Date(`${hourKey}:00:00Z`).getTime() / 1000);

    snapshots.push({
      t: timestamp,
      tv: Math.round(totalValueTWD),
      tf: Math.round(totalValueFixedRate),
      fx,
      st: stockSnapshots,
    });
  }

  console.log(`📊 Intraday API: built ${snapshots.length} hourly snapshots for ${date}`);
  return snapshots;
}

// ─── Route handler ───────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const date = searchParams.get('date');

    // 1. Validate date param
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json(
        { error: 'Missing or invalid date parameter (expected YYYY-MM-DD)' },
        { status: 400 },
      );
    }

    const portfolioStartDate = getPortfolioStartDate();
    const today = new Date().toISOString().split('T')[0];

    if (date < portfolioStartDate) {
      return NextResponse.json(
        { error: `Date must be >= portfolio start date (${portfolioStartDate})` },
        { status: 400 },
      );
    }

    if (date > today) {
      return NextResponse.json(
        { error: `Date must be <= today (${today})` },
        { status: 400 },
      );
    }

    // 2. Try collected 5-min data first
    const intradaySnapshots = await getIntradayData(date);
    if (intradaySnapshots && intradaySnapshots.length > 0) {
      console.log(`📈 Intraday API: returning collected data for ${date} (${intradaySnapshots.length} snapshots)`);
      const response: IntradayDayData = {
        date,
        source: 'collected',
        snapshots: intradaySnapshots,
      };
      return NextResponse.json(response);
    }

    // 3. Try backfilled hourly data
    const hourlySnapshots = await getHourlyData(date);
    if (hourlySnapshots && hourlySnapshots.length > 0) {
      console.log(`📈 Intraday API: returning backfill data for ${date} (${hourlySnapshots.length} snapshots)`);
      const response: IntradayDayData = {
        date,
        source: 'backfill',
        snapshots: hourlySnapshots,
      };
      return NextResponse.json(response);
    }

    // 4. Neither exists — fetch on-demand
    console.log(`📡 Intraday API: no cached data for ${date}, fetching on-demand...`);
    const snapshots = await fetchAndBuildHourlySnapshots(date);

    if (snapshots.length > 0) {
      // Store in Redis for future requests
      await setHourlyData(date, snapshots);
      console.log(`💾 Intraday API: cached ${snapshots.length} hourly snapshots for ${date}`);
    }

    const response: IntradayDayData = {
      date,
      source: 'backfill',
      snapshots,
    };
    return NextResponse.json(response);
  } catch (error) {
    console.error('❌ Intraday API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch intraday data', details: String(error) },
      { status: 500 },
    );
  }
}
