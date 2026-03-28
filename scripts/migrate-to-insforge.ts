/**
 * One-time migration: Redis hourly data → InsForge PostgreSQL
 *
 * Run with: npx tsx scripts/migrate-to-insforge.ts
 */

import { readFileSync } from 'fs';
// Parse .env.local manually (no dotenv dependency needed)
const envContent = readFileSync('.env.local', 'utf-8');
for (const line of envContent.split('\n')) {
  const match = line.match(/^([A-Z_]+)="?(.+?)"?\s*$/);
  if (match) process.env[match[1]] = match[2];
}

const INSFORGE_BASE_URL = process.env.INSFORGE_BASE_URL || 'https://m63i3j2q.ap-southeast.insforge.app';
const INSFORGE_ANON_KEY = process.env.INSFORGE_ANON_KEY || '';
const KV_REST_API_URL = process.env.KV_REST_API_URL || '';
const KV_REST_API_TOKEN = process.env.KV_REST_API_TOKEN || '';

interface IntradayStockSnapshot {
  s: string;
  p: number;
  v: number;
}

interface IntradaySnapshot {
  t: number;
  tv: number;
  tf: number;
  fx: number;
  st: IntradayStockSnapshot[];
}

// Fetch from Redis
async function redisGet(key: string): Promise<unknown> {
  const res = await fetch(`${KV_REST_API_URL}/get/${key}`, {
    headers: { Authorization: `Bearer ${KV_REST_API_TOKEN}` },
  });
  const data = await res.json();
  const result = data.result;
  // Upstash returns JSON-encoded strings for complex values
  if (typeof result === 'string') {
    try { return JSON.parse(result); } catch { return result; }
  }
  return result;
}

// Insert into InsForge via REST API
async function insforgeInsert(table: string, records: Record<string, unknown>[]) {
  if (records.length === 0) return;

  const res = await fetch(`${INSFORGE_BASE_URL}/api/database/records/${table}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${INSFORGE_ANON_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify(records),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`InsForge insert to ${table} failed: ${res.status} ${text}`);
  }

  return res.json();
}

// Generate all dates from start to end
function generateDates(start: string, end: string): string[] {
  const dates: string[] = [];
  const d = new Date(start + 'T00:00:00Z');
  const endDate = new Date(end + 'T00:00:00Z');
  while (d <= endDate) {
    dates.push(d.toISOString().split('T')[0]);
    d.setDate(d.getDate() + 1);
  }
  return dates;
}

async function migrate() {
  console.log('Starting Redis → InsForge migration...');
  console.log(`InsForge: ${INSFORGE_BASE_URL}`);
  console.log(`Redis: ${KV_REST_API_URL}`);

  const today = new Date().toISOString().split('T')[0];
  const dates = generateDates('2025-05-30', today);
  console.log(`Processing ${dates.length} dates...`);

  let totalSnapshots = 0;
  let totalStockDetails = 0;
  let datesWithData = 0;

  for (let i = 0; i < dates.length; i++) {
    const date = dates[i];

    // Try collected (5-min) data first, then hourly (backfill)
    let snapshots: IntradaySnapshot[] | null = null;
    let source = 'backfill';

    const intradayRaw = await redisGet(`intraday:${date}`);
    if (intradayRaw && Array.isArray(intradayRaw) && intradayRaw.length > 0) {
      snapshots = intradayRaw as IntradaySnapshot[];
      source = 'collected';
    } else {
      const hourlyRaw = await redisGet(`hourly:${date}`);
      if (hourlyRaw && Array.isArray(hourlyRaw) && hourlyRaw.length > 0) {
        snapshots = hourlyRaw as IntradaySnapshot[];
      }
    }

    if (!snapshots || snapshots.length === 0) {
      if ((i + 1) % 50 === 0) console.log(`  ${i + 1}/${dates.length} (${date}) - no data`);
      continue;
    }

    datesWithData++;

    // Insert intraday_snapshots (batch)
    const snapshotRecords = snapshots.map(s => ({
      timestamp: new Date(s.t * 1000).toISOString(),
      total_value_twd: s.tv,
      total_value_fixed_rate: s.tf,
      exchange_rate: s.fx,
      source,
    }));

    try {
      const inserted = await insforgeInsert('intraday_snapshots', snapshotRecords);

      // Insert stock details for each snapshot
      if (inserted && Array.isArray(inserted)) {
        const stockRecords: Record<string, unknown>[] = [];
        for (let j = 0; j < inserted.length; j++) {
          const snapshotId = inserted[j].id;
          const originalSnap = snapshots[j];
          for (const st of originalSnap.st) {
            stockRecords.push({
              snapshot_id: snapshotId,
              symbol: st.s,
              price: st.p,
              value_twd: st.v,
            });
          }
        }

        // Batch insert stock details (max 500 at a time to avoid payload limits)
        for (let k = 0; k < stockRecords.length; k += 500) {
          const batch = stockRecords.slice(k, k + 500);
          await insforgeInsert('intraday_stock_details', batch);
        }

        totalStockDetails += stockRecords.length;
      }

      totalSnapshots += snapshots.length;
    } catch (err) {
      console.error(`  Error on ${date}:`, err);
    }

    if ((i + 1) % 20 === 0 || i === dates.length - 1) {
      console.log(`  ${i + 1}/${dates.length} (${date}) - ${datesWithData} days, ${totalSnapshots} snapshots, ${totalStockDetails} stock details`);
    }
  }

  console.log('\n=== Migration complete ===');
  console.log(`Dates with data: ${datesWithData}`);
  console.log(`Total snapshots: ${totalSnapshots}`);
  console.log(`Total stock details: ${totalStockDetails}`);
}

migrate().catch(console.error);
