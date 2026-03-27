/**
 * Multi-day hourly data API for smooth portfolio curve
 *
 * GET /api/intraday/hourly-range?days=30
 *
 * Returns a flat array of { time, value } chart points aggregated
 * from all available intraday / hourly data within the requested range.
 *
 * For days with 5-min collected data, snapshots are downsampled to hourly
 * (last snapshot per hour) to keep density consistent.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  getIntradayData,
  getHourlyData,
} from '@/lib/redis-cache';
import type { IntradaySnapshot, IntradayChartPoint } from '@/lib/types/intraday';

// ─── Helpers ─────────────────────────────────────────────────────────

/** Downsample 5-min snapshots to hourly by keeping the last snapshot in each hour. */
function downsampleToHourly(snapshots: IntradaySnapshot[]): IntradaySnapshot[] {
  const byHour = new Map<number, IntradaySnapshot>();

  for (const snap of snapshots) {
    // Floor timestamp to the start of the hour
    const hourKey = Math.floor(snap.t / 3600) * 3600;
    // Always overwrite so we end up with the *last* snapshot in each hour
    byHour.set(hourKey, snap);
  }

  return Array.from(byHour.values()).sort((a, b) => a.t - b.t);
}

/** Generate YYYY-MM-DD strings from today backwards for N days. */
function generateDateRange(days: number): string[] {
  const dates: string[] = [];
  const now = new Date();

  for (let i = 0; i < days; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    dates.push(d.toISOString().split('T')[0]);
  }

  // Return in chronological order (oldest first)
  return dates.reverse();
}

// ─── Route handler ───────────────────────────────────────────────────

const BATCH_SIZE = 30;
const MAX_DAYS = 365;

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const rawDays = parseInt(searchParams.get('days') || '30', 10);
    const days = Math.min(Math.max(1, rawDays), MAX_DAYS);

    console.log(`📈 Hourly-range API: fetching ${days} days of hourly data`);

    const dates = generateDateRange(days);

    // Fetch data from Redis in parallel, batched to avoid overwhelming Redis
    const allSnapshots: IntradaySnapshot[] = [];

    for (let batchStart = 0; batchStart < dates.length; batchStart += BATCH_SIZE) {
      const batch = dates.slice(batchStart, batchStart + BATCH_SIZE);

      const results = await Promise.all(
        batch.map(async (date) => {
          // Try collected 5-min data first
          const intraday = await getIntradayData(date);
          if (intraday && intraday.length > 0) {
            // Downsample to hourly for consistent density
            return { date, snapshots: downsampleToHourly(intraday), source: 'collected' as const };
          }

          // Fall back to backfilled hourly data
          const hourly = await getHourlyData(date);
          if (hourly && hourly.length > 0) {
            return { date, snapshots: hourly, source: 'backfill' as const };
          }

          return { date, snapshots: [] as IntradaySnapshot[], source: 'none' as const };
        }),
      );

      for (const result of results) {
        if (result.snapshots.length > 0) {
          allSnapshots.push(...result.snapshots);
        }
      }
    }

    // Build a map of date -> snapshots for gap-filling
    const snapshotsByDate = new Map<string, IntradaySnapshot[]>();
    for (const snap of allSnapshots) {
      const d = new Date(snap.t * 1000).toISOString().split('T')[0];
      const arr = snapshotsByDate.get(d) || [];
      arr.push(snap);
      snapshotsByDate.set(d, arr);
    }

    // Gap-fill: carry forward last known value for dates with no data (weekends/holidays)
    const chartPoints: IntradayChartPoint[] = [];
    let lastKnownValue: number | null = null;

    for (const date of dates) {
      const daySnapshots = snapshotsByDate.get(date);

      if (daySnapshots && daySnapshots.length > 0) {
        for (const snap of daySnapshots) {
          chartPoints.push({ time: snap.t, value: snap.tv });
        }
        lastKnownValue = daySnapshots[daySnapshots.length - 1].tv;
      } else if (lastKnownValue !== null) {
        // No data (holiday/weekend) — insert a single point at midnight UTC
        // to keep the chart continuous and prevent false drops
        const midnightUTC = Math.floor(new Date(date + 'T00:00:00Z').getTime() / 1000);
        chartPoints.push({ time: midnightUTC, value: lastKnownValue });
      }
    }

    // Sort by time ascending (should already be mostly sorted, but be safe)
    chartPoints.sort((a, b) => a.time - b.time);

    console.log(`📊 Hourly-range API: returning ${chartPoints.length} chart points for ${days} days`);

    return NextResponse.json(chartPoints);
  } catch (error) {
    console.error('❌ Hourly-range API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch hourly range data', details: String(error) },
      { status: 500 },
    );
  }
}
