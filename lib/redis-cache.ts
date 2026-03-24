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
  // 如果沒有設定環境變數，返回 null（優雅降級）
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    if (IS_DEV) {
      devLog('⚠️ Redis not configured, using fallback mode');
    }
    return null;
  }

  if (!redisClient) {
    redisClient = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    });
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

/**
 * Append a single snapshot to the intraday array for a given date.
 * Creates the key if it doesn't exist yet.
 */
export async function appendIntradaySnapshot(
  date: string,
  snapshot: IntradaySnapshot,
): Promise<boolean> {
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
 */
export async function getIntradayData(
  date: string,
): Promise<IntradaySnapshot[] | null> {
  try {
    const redis = getRedisClient();
    if (!redis) return null;

    const key = `${CACHE_KEYS.INTRADAY_PREFIX}${date}`;
    const data = await redis.get<IntradaySnapshot[]>(key);

    if (data) {
      devLog(`✅ Intraday cache hit: ${key} (${data.length} snapshots)`);
      return data;
    }

    devLog(`📂 Intraday cache miss: ${key}`);
    return null;
  } catch (error) {
    console.error(`❌ Redis getIntradayData error for ${date}:`, error);
    return null;
  }
}

/**
 * Get hourly (backfilled) snapshots for a given date.
 */
export async function getHourlyData(
  date: string,
): Promise<IntradaySnapshot[] | null> {
  try {
    const redis = getRedisClient();
    if (!redis) return null;

    const key = `${CACHE_KEYS.HOURLY_PREFIX}${date}`;
    const data = await redis.get<IntradaySnapshot[]>(key);

    if (data) {
      devLog(`✅ Hourly cache hit: ${key} (${data.length} snapshots)`);
      return data;
    }

    devLog(`📂 Hourly cache miss: ${key}`);
    return null;
  } catch (error) {
    console.error(`❌ Redis getHourlyData error for ${date}:`, error);
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
