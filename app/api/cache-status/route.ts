/**
 * 快取狀態 API
 * 
 * 用於檢查 Redis 快取是否正常運作
 */

import { NextResponse } from 'next/server';
import { getCacheStatus, isRedisAvailable } from '@/lib/redis-cache';

export async function GET() {
  try {
    const available = await isRedisAvailable();
    const status = await getCacheStatus();

    return NextResponse.json({
      healthy: available,
      lastUpdate: status.lastUpdate,
      cachedKeys: status.keys.length,
    });
  } catch {
    return NextResponse.json({
      healthy: false,
    });
  }
}
