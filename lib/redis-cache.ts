/**
 * Upstash Redis 快取層
 * 
 * 用於伺服器端快取，讓多人訪問時不需要每次都呼叫外部 API
 * 
 * 快取策略：
 * - portfolio-data: 投資組合資料，每 5 分鐘由 Cron Job 更新
 * - portfolio-history: 歷史資料，每日更新一次
 */

import { Redis } from '@upstash/redis';
import { IS_DEV, devLog } from './config';
import { IntradaySnapshot } from './types/intraday';

// 快取鍵值
export const CACHE_KEYS = {
  PORTFOLIO_DATA: 'portfolio-data',           // 目前投資組合資料
  PORTFOLIO_HISTORY: 'portfolio-history',     // 歷史資料（365天）
  LAST_UPDATE: 'last-update',                 // 上次更新時間
  EXCHANGE_RATE: 'exchange-rate',             // 匯率
  INTRADAY_PREFIX: 'intraday:',              // 5-min collected snapshots per day
  HOURLY_PREFIX: 'hourly:',                  // Backfilled hourly data per day
  BACKFILL_CURSOR: 'hourly-backfill-cursor', // Last backfilled date
} as const;

// 快取 TTL（秒）
export const CACHE_TTL = {
  PORTFOLIO_DATA: 10 * 60,      // 10 分鐘（給 5 分鐘 Cron 一些緩衝）
  PORTFOLIO_HISTORY: 24 * 60 * 60,  // 24 小時
  EXCHANGE_RATE: 60 * 60,       // 1 小時
  INTRADAY_DATA: 400 * 24 * 60 * 60,   // 400 days retention for intraday data
} as const;

// 建立 Redis 客戶端（懶加載）
let redisClient: Redis | null = null;

function getRedisClient(): Redis | null {
  // 支援兩種環境變數命名：Vercel 整合 (KV_*) 和手動設定 (UPSTASH_*)
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    if (IS_DEV) {
      devLog('⚠️ Redis not configured, using fallback mode');
    }
    return null;
  }

  if (!redisClient) {
    redisClient = new Redis({ url, token });
    devLog('✅ Redis client initialized');
  }

  return redisClient;
}

/**
 * 從快取讀取資料
 */
export async function getFromCache<T>(key: string): Promise<T | null> {
  try {
    const redis = getRedisClient();
    if (!redis) return null;

    const data = await redis.get<T>(key);
    
    if (data) {
      devLog(`✅ Cache hit: ${key}`);
      return data;
    }
    
    devLog(`📂 Cache miss: ${key}`);
    return null;
  } catch (error) {
    console.error(`❌ Redis get error for ${key}:`, error);
    return null;
  }
}

/**
 * 將資料寫入快取
 */
export async function setToCache<T>(
  key: string, 
  data: T, 
  ttlSeconds: number = CACHE_TTL.PORTFOLIO_DATA
): Promise<boolean> {
  try {
    const redis = getRedisClient();
    if (!redis) return false;

    await redis.set(key, data, { ex: ttlSeconds });
    devLog(`💾 Cache set: ${key} (TTL: ${ttlSeconds}s)`);
    return true;
  } catch (error) {
    console.error(`❌ Redis set error for ${key}:`, error);
    return false;
  }
}

/**
 * 刪除快取
 */
export async function deleteFromCache(key: string): Promise<boolean> {
  try {
    const redis = getRedisClient();
    if (!redis) return false;

    await redis.del(key);
    devLog(`🗑️ Cache deleted: ${key}`);
    return true;
  } catch (error) {
    console.error(`❌ Redis delete error for ${key}:`, error);
    return false;
  }
}

// ─── Intraday / Hourly helpers ──────────────────────────────────────

import { dbQuery, dbInsert, isInsForgeConfigured } from './insforge';

/**
 * Fetch snapshots from PostgreSQL for a date range, reconstruct IntradaySnapshot format.
 */
async function fetchFromPostgres(date: string): Promise<IntradaySnapshot[] | null> {
  if (!isInsForgeConfigured()) return null;

  try {
    const nextDate = new Date(date + 'T00:00:00Z');
    nextDate.setUTCDate(nextDate.getUTCDate() + 1);
    const nextDateStr = nextDate.toISOString().split('T')[0];

    // PostgREST range filter: use custom query string since JS object can't have duplicate keys
    const snapshots = await dbQuery<{
      id: number; timestamp: string; total_value_twd: number;
      total_value_fixed_rate: number; exchange_rate: number;
    }>('intraday_snapshots', {
      order: 'timestamp.asc',
      limit: '100',
    }, `timestamp=gte.${date}T00:00:00Z&timestamp=lt.${nextDateStr}T00:00:00Z`);

    if (!snapshots.length) return null;

    // Query all stock details for these snapshot IDs
    const ids = snapshots.map(s => s.id);
    const stockDetails = await dbQuery<{
      snapshot_id: number; symbol: string; price: number; value_twd: number;
    }>('intraday_stock_details', {
      'snapshot_id': `in.(${ids.join(',')})`,
      limit: '1000',
    });

    // Group stock details by snapshot_id
    const stocksBySnapshotId = new Map<number, { s: string; p: number; v: number }[]>();
    for (const sd of stockDetails) {
      const arr = stocksBySnapshotId.get(sd.snapshot_id) || [];
      arr.push({ s: sd.symbol, p: Number(sd.price), v: sd.value_twd });
      stocksBySnapshotId.set(sd.snapshot_id, arr);
    }

    // Reconstruct IntradaySnapshot format
    const result: IntradaySnapshot[] = snapshots.map(s => ({
      t: Math.floor(new Date(s.timestamp).getTime() / 1000),
      tv: s.total_value_twd,
      tf: s.total_value_fixed_rate,
      fx: Number(s.exchange_rate),
      st: stocksBySnapshotId.get(s.id) || [],
    }));

    devLog(`✅ PostgreSQL hit: ${date} (${result.length} snapshots)`);
    return result;
  } catch (error) {
    console.error(`❌ PostgreSQL fetch error for ${date}:`, error);
    return null;
  }
}

/**
 * Write a snapshot to PostgreSQL (for dual-write from cron).
 */
export async function writeSnapshotToPostgres(snapshot: IntradaySnapshot): Promise<void> {
  if (!isInsForgeConfigured()) return;

  try {
    const inserted = await dbInsert<{ id: number }>('intraday_snapshots', [{
      timestamp: new Date(snapshot.t * 1000).toISOString(),
      total_value_twd: snapshot.tv,
      total_value_fixed_rate: snapshot.tf,
      exchange_rate: snapshot.fx,
      source: 'cron',
    }]);

    if (inserted.length > 0) {
      const snapshotId = inserted[0].id;
      const stockRecords = snapshot.st.map(st => ({
        snapshot_id: snapshotId,
        symbol: st.s,
        price: st.p,
        value_twd: st.v,
      }));
      await dbInsert('intraday_stock_details', stockRecords);
    }
  } catch (error) {
    console.error('❌ PostgreSQL write error:', error);
  }
}

/**
 * Append a single snapshot to the intraday array for a given date.
 * Writes to both Redis (cache) and PostgreSQL (permanent).
 */
export async function appendIntradaySnapshot(
  date: string,
  snapshot: IntradaySnapshot,
): Promise<boolean> {
  // Write to PostgreSQL (fire-and-forget, don't block Redis write)
  writeSnapshotToPostgres(snapshot).catch(err => console.error('Failed to write snapshot to PostgreSQL:', err));

  try {
    const redis = getRedisClient();
    if (!redis) return false;

    const key = `${CACHE_KEYS.INTRADAY_PREFIX}${date}`;
    const existing = await redis.get<IntradaySnapshot[]>(key);
    const arr = existing ?? [];
    arr.push(snapshot);

    await redis.set(key, arr, { ex: CACHE_TTL.INTRADAY_DATA });
    devLog(`💾 Intraday snapshot appended: ${key} (${arr.length} snapshots)`);
    return true;
  } catch (error) {
    console.error(`❌ Redis appendIntradaySnapshot error for ${date}:`, error);
    return false;
  }
}

/**
 * Get all intraday snapshots for a given date.
 * Redis first → PostgreSQL fallback → cache result in Redis.
 */
export async function getIntradayData(
  date: string,
): Promise<IntradaySnapshot[] | null> {
  try {
    // 1. Try Redis (hot cache)
    const redis = getRedisClient();
    if (redis) {
      const key = `${CACHE_KEYS.INTRADAY_PREFIX}${date}`;
      const data = await redis.get<IntradaySnapshot[]>(key);
      if (data) {
        devLog(`✅ Intraday Redis hit: ${key} (${data.length} snapshots)`);
        return data;
      }
    }

    // 2. Try PostgreSQL (permanent store)
    const pgData = await fetchFromPostgres(date);
    if (pgData && pgData.length > 0) {
      // Cache back to Redis for next time
      if (redis) {
        const key = `${CACHE_KEYS.INTRADAY_PREFIX}${date}`;
        await redis.set(key, pgData, { ex: CACHE_TTL.INTRADAY_DATA }).catch(err => console.error(`Failed to cache intraday data to Redis for ${key}:`, err));
        devLog(`💾 Cached PostgreSQL data to Redis: ${key}`);
      }
      return pgData;
    }

    devLog(`📂 No data found for ${date} (Redis + PostgreSQL)`);
    return null;
  } catch (error) {
    console.error(`❌ getIntradayData error for ${date}:`, error);
    return null;
  }
}

/**
 * Get hourly (backfilled) snapshots for a given date.
 * Redis first → PostgreSQL fallback.
 */
export async function getHourlyData(
  date: string,
): Promise<IntradaySnapshot[] | null> {
  try {
    // 1. Try Redis
    const redis = getRedisClient();
    if (redis) {
      const key = `${CACHE_KEYS.HOURLY_PREFIX}${date}`;
      const data = await redis.get<IntradaySnapshot[]>(key);
      if (data) {
        devLog(`✅ Hourly Redis hit: ${key} (${data.length} snapshots)`);
        return data;
      }
    }

    // 2. Try PostgreSQL (hourly and collected data share the same table)
    const pgData = await fetchFromPostgres(date);
    if (pgData && pgData.length > 0) {
      // Cache back to Redis
      if (redis) {
        const key = `${CACHE_KEYS.HOURLY_PREFIX}${date}`;
        await redis.set(key, pgData, { ex: CACHE_TTL.INTRADAY_DATA }).catch(err => console.error(`Failed to cache hourly data to Redis for ${key}:`, err));
        devLog(`💾 Cached PostgreSQL hourly data to Redis: ${key}`);
      }
      return pgData;
    }

    devLog(`📂 No hourly data for ${date}`);
    return null;
  } catch (error) {
    console.error(`❌ getHourlyData error for ${date}:`, error);
    return null;
  }
}

/**
 * Store hourly (backfilled) snapshots for a given date.
 */
export async function setHourlyData(
  date: string,
  snapshots: IntradaySnapshot[],
): Promise<boolean> {
  try {
    const redis = getRedisClient();
    if (!redis) return false;

    const key = `${CACHE_KEYS.HOURLY_PREFIX}${date}`;
    await redis.set(key, snapshots, { ex: CACHE_TTL.INTRADAY_DATA });
    devLog(`💾 Hourly data set: ${key} (${snapshots.length} snapshots)`);
    return true;
  } catch (error) {
    console.error(`❌ Redis setHourlyData error for ${date}:`, error);
    return false;
  }
}

/**
 * Get the last backfilled date cursor.
 */
export async function getBackfillCursor(): Promise<string | null> {
  try {
    const redis = getRedisClient();
    if (!redis) return null;

    const cursor = await redis.get<string>(CACHE_KEYS.BACKFILL_CURSOR);
    devLog(`📂 Backfill cursor: ${cursor ?? '(not set)'}`);
    return cursor;
  } catch (error) {
    console.error('❌ Redis getBackfillCursor error:', error);
    return null;
  }
}

/**
 * Set the last backfilled date cursor.
 */
export async function setBackfillCursor(date: string): Promise<boolean> {
  try {
    const redis = getRedisClient();
    if (!redis) return false;

    // No TTL — keep cursor indefinitely
    await redis.set(CACHE_KEYS.BACKFILL_CURSOR, date);
    devLog(`💾 Backfill cursor set: ${date}`);
    return true;
  } catch (error) {
    console.error('❌ Redis setBackfillCursor error:', error);
    return false;
  }
}

/**
 * 檢查 Redis 是否可用
 */
export async function isRedisAvailable(): Promise<boolean> {
  try {
    const redis = getRedisClient();
    if (!redis) return false;

    await redis.ping();
    return true;
  } catch {
    return false;
  }
}

/**
 * 取得快取狀態資訊
 */
export async function getCacheStatus(): Promise<{
  available: boolean;
  lastUpdate: string | null;
  keys: string[];
}> {
  try {
    const redis = getRedisClient();
    if (!redis) {
      return { available: false, lastUpdate: null, keys: [] };
    }

    const lastUpdate = await redis.get<string>(CACHE_KEYS.LAST_UPDATE);
    
    // 檢查各個快取鍵是否存在
    const keyChecks = await Promise.all([
      redis.exists(CACHE_KEYS.PORTFOLIO_DATA),
      redis.exists(CACHE_KEYS.PORTFOLIO_HISTORY),
      redis.exists(CACHE_KEYS.EXCHANGE_RATE),
    ]);

    const existingKeys: string[] = [];
    if (keyChecks[0]) existingKeys.push(CACHE_KEYS.PORTFOLIO_DATA);
    if (keyChecks[1]) existingKeys.push(CACHE_KEYS.PORTFOLIO_HISTORY);
    if (keyChecks[2]) existingKeys.push(CACHE_KEYS.EXCHANGE_RATE);

    return {
      available: true,
      lastUpdate,
      keys: existingKeys,
    };
  } catch {
    return { available: false, lastUpdate: null, keys: [] };
  }
}
