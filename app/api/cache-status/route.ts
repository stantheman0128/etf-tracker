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
      redis: {
        available,
        ...status,
      },
      environment: process.env.NODE_ENV,
      hasCredentials: !!(
        process.env.UPSTASH_REDIS_REST_URL && 
        process.env.UPSTASH_REDIS_REST_TOKEN
      ),
    });
  } catch (error) {
    return NextResponse.json({
      redis: { available: false },
      error: String(error),
    });
  }
}
