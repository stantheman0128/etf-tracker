/**
 * 開發環境本地快取工具
 * 
 * 用於減少開發時頻繁呼叫外部 API
 * 只在開發環境下啟用，生產環境自動跳過
 */

import fs from 'fs';
import path from 'path';
import { IS_DEV, devLog } from './config';

const CACHE_DIR = path.join(process.cwd(), 'data', 'cache');
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 小時

interface CacheData<T> {
  timestamp: number;
  data: T;
}

/**
 * 確保快取目錄存在
 */
function ensureCacheDir(): void {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    devLog('📁 Created cache directory:', CACHE_DIR);
  }
}

/**
 * 從本地快取讀取資料
 */
export function readCache<T>(key: string): T | null {
  if (!IS_DEV) return null;

  try {
    const filePath = path.join(CACHE_DIR, `${key}.json`);
    
    if (!fs.existsSync(filePath)) {
      devLog(`📂 Cache miss: ${key}`);
      return null;
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const cached: CacheData<T> = JSON.parse(content);

    // 檢查是否過期
    const age = Date.now() - cached.timestamp;
    if (age > CACHE_TTL) {
      devLog(`⏰ Cache expired: ${key} (${Math.round(age / 1000 / 60)} minutes old)`);
      return null;
    }

    devLog(`✅ Cache hit: ${key} (${Math.round(age / 1000 / 60)} minutes old)`);
    return cached.data;
  } catch (error) {
    devLog(`❌ Cache read error: ${key}`, error);
    return null;
  }
}

/**
 * 將資料寫入本地快取
 */
export function writeCache<T>(key: string, data: T): void {
  if (!IS_DEV) return;

  try {
    ensureCacheDir();
    
    const filePath = path.join(CACHE_DIR, `${key}.json`);
    const cacheData: CacheData<T> = {
      timestamp: Date.now(),
      data,
    };

    fs.writeFileSync(filePath, JSON.stringify(cacheData, null, 2));
    devLog(`💾 Cache saved: ${key}`);
  } catch (error) {
    devLog(`❌ Cache write error: ${key}`, error);
  }
}

/**
 * 清除指定快取
 */
export function clearCache(key: string): void {
  try {
    const filePath = path.join(CACHE_DIR, `${key}.json`);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      devLog(`🗑️ Cache cleared: ${key}`);
    }
  } catch (error) {
    devLog(`❌ Cache clear error: ${key}`, error);
  }
}

/**
 * 清除所有快取
 */
export function clearAllCache(): void {
  try {
    if (fs.existsSync(CACHE_DIR)) {
      const files = fs.readdirSync(CACHE_DIR);
      files.forEach(file => {
        fs.unlinkSync(path.join(CACHE_DIR, file));
      });
      devLog(`🗑️ All cache cleared (${files.length} files)`);
    }
  } catch (error) {
    devLog(`❌ Cache clear all error:`, error);
  }
}

/**
 * 取得快取統計
 */
export function getCacheStats(): { count: number; totalSize: number; files: string[] } {
  try {
    if (!fs.existsSync(CACHE_DIR)) {
      return { count: 0, totalSize: 0, files: [] };
    }

    const files = fs.readdirSync(CACHE_DIR);
    let totalSize = 0;
    
    files.forEach(file => {
      const stat = fs.statSync(path.join(CACHE_DIR, file));
      totalSize += stat.size;
    });

    return { count: files.length, totalSize, files };
  } catch {
    return { count: 0, totalSize: 0, files: [] };
  }
}
