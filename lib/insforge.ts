/**
 * InsForge PostgreSQL - persistent data layer (REST API)
 *
 * Two-tier architecture:
 *   Redis (hot cache, fast, TTL) → InsForge PostgreSQL (permanent, slower)
 */

const BASE_URL = process.env.INSFORGE_BASE_URL || '';
const ANON_KEY = process.env.INSFORGE_ANON_KEY || '';

function headers() {
  return {
    Authorization: `Bearer ${ANON_KEY}`,
    'Content-Type': 'application/json',
  };
}

/** Query records from a table with optional filters */
export async function dbQuery<T = Record<string, unknown>>(
  table: string,
  params: Record<string, string> = {},
  extraQuery?: string,
): Promise<T[]> {
  if (!BASE_URL || !ANON_KEY) return [];

  const qs = new URLSearchParams(params).toString();
  const parts = [qs, extraQuery].filter(Boolean).join('&');
  const url = `${BASE_URL}/api/database/records/${table}${parts ? '?' + parts : ''}`;

  const res = await fetch(url, {
    headers: headers(),
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) return [];
  return res.json();
}

/** Insert records into a table, returns inserted rows */
export async function dbInsert<T = Record<string, unknown>>(
  table: string,
  records: Record<string, unknown>[],
): Promise<T[]> {
  if (!BASE_URL || !ANON_KEY || records.length === 0) return [];

  const res = await fetch(`${BASE_URL}/api/database/records/${table}`, {
    method: 'POST',
    headers: { ...headers(), Prefer: 'return=representation' },
    body: JSON.stringify(records),
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) {
    console.error(`InsForge insert ${table} failed:`, res.status);
    return [];
  }
  return res.json();
}

/** Raw SQL query via CLI-compatible admin endpoint */
export async function dbRawQuery<T = Record<string, unknown>>(
  sql: string,
): Promise<T[]> {
  // Raw SQL requires admin API key, not available from anon key
  // Use dbQuery for PostgREST-style queries instead
  console.warn('dbRawQuery not available from anon key');
  return [];
}

/** Check if InsForge is configured */
export function isInsForgeConfigured(): boolean {
  return !!(BASE_URL && ANON_KEY);
}
