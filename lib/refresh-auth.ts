import type { NextRequest } from 'next/server';
import { IS_DEV } from '@/lib/config';

/**
 * 判斷一個 refresh=true 的請求是否有權強制重抓（繞過快取）。
 * dev 一律放行；prod 需帶 `Authorization: Bearer <CRON_SECRET>`。
 * 純函式方便測試。
 */
export function checkRefreshAuth(
  authHeader: string | null,
  secret: string | undefined,
  isDev: boolean,
): boolean {
  if (isDev) return true;
  if (!secret) return false;
  return authHeader === `Bearer ${secret}`;
}

/** 從請求判斷是否可強制重抓。未授權的 refresh 會被當成一般讀取（只吃快取）。 */
export function isAuthorizedRefresh(request: NextRequest): boolean {
  return checkRefreshAuth(request.headers.get('authorization'), process.env.CRON_SECRET, IS_DEV);
}
