/**
 * Redis I/O for strategy state.
 *
 * Each strategy gets its own JSON blob keyed by strategy id. Simple
 * read-modify-write — no atomicity worries because the only writer is
 * the cron route running once per day.
 */

import { Redis } from '@upstash/redis';
import { IS_DEV, devLog } from '../config';
import type { StrategyId, StrategyState } from './momentum-types';

const KEY_PREFIX = 'strategy:';

function redisKey(id: StrategyId): string {
  return `${KEY_PREFIX}${id}`;
}

let redisClient: Redis | null = null;
function getRedisClient(): Redis | null {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    if (IS_DEV) devLog('⚠️ Strategy store: Redis not configured');
    return null;
  }
  if (!redisClient) redisClient = new Redis({ url, token });
  return redisClient;
}

export async function loadStrategyState(id: StrategyId): Promise<StrategyState | null> {
  const redis = getRedisClient();
  if (!redis) return null;
  try {
    const data = await redis.get<StrategyState>(redisKey(id));
    return data ?? null;
  } catch (err) {
    console.error(`Strategy store: load ${id} failed:`, err);
    return null;
  }
}

export async function saveStrategyState(state: StrategyState): Promise<boolean> {
  const redis = getRedisClient();
  if (!redis) return false;
  try {
    await redis.set(redisKey(state.id), state);
    devLog(`💾 Strategy ${state.id} saved (${state.navHistory.length} snapshots)`);
    return true;
  } catch (err) {
    console.error(`Strategy store: save ${state.id} failed:`, err);
    return false;
  }
}

/** Dev-only: wipe a strategy back to uninitialized state. */
export async function resetStrategyState(id: StrategyId): Promise<boolean> {
  const redis = getRedisClient();
  if (!redis) return false;
  try {
    await redis.del(redisKey(id));
    devLog(`🗑️ Strategy ${id} reset`);
    return true;
  } catch (err) {
    console.error(`Strategy store: reset ${id} failed:`, err);
    return false;
  }
}
