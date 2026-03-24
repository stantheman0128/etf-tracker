/**
 * Cron Job: 定期更新投資組合快取
 * 
 * 由 Vercel Cron 每 5 分鐘執行一次
 * 抓取最新資料並存入 Redis 快取
 */

import { NextRequest, NextResponse } from 'next/server';
import { PORTFOLIO_CONFIG } from '@/lib/config';
import {
  getUSStockPrice,
  getTWStockPrice,
  getBTCPrice,
  getExchangeRate,
  type PriceData,
} from '@/lib/api-client';
import { INITIAL_EXCHANGE_RATE } from '@/lib/initial-data';
import {
  setToCache,
  getFromCache,
  appendIntradaySnapshot,
  CACHE_KEYS,
  CACHE_TTL,
} from '@/lib/redis-cache';
import { calculateValue } from '@/lib/utils/calculate';
import type { IntradaySnapshot } from '@/lib/types/intraday';

// 驗證 Cron 請求（防止外部呼叫）
function verifyCronRequest(request: NextRequest): boolean {
  // 開發環境允許無驗證
  if (process.env.NODE_ENV === 'development') {
    return true;
  }

  // 生產環境必須有 CRON_SECRET
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error('❌ CRON_SECRET not set in production');
    return false; // fail closed
  }

  const authHeader = request.headers.get('authorization');
  return authHeader === `Bearer ${secret}`;
}

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  
  // 驗證請求來源
  if (!verifyCronRequest(request)) {
    console.log('❌ Cron: Unauthorized request');
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  console.log('🔄 Cron: Starting cache refresh...');

  try {
    // 1. 並行獲取匯率和所有持股價格
    const pricePromises = PORTFOLIO_CONFIG.holdings.map(async (holding) => {
      let priceData: PriceData | null = null;

      if (holding.market === 'TAIWAN') {
        priceData = await getTWStockPrice(holding.symbol);
      } else if (holding.market === 'CRYPTO') {
        priceData = await getBTCPrice();
      } else {
        priceData = await getUSStockPrice(holding.symbol);
      }

      if (!priceData) {
        console.warn(`⚠️ Cron: Failed to get price for ${holding.symbol}`);
        priceData = { price: 0, change: 0, changePercent: 0 };
      }

      return { holding, priceData };
    });

    const [exchangeRate, ...priceResults] = await Promise.all([
      getExchangeRate(),
      ...pricePromises,
    ]);

    console.log(`💱 Cron: Exchange rate = ${exchangeRate}`);

    // 2. 計算持股價值
    const holdingsWithPrices = priceResults.map(({ holding, priceData }) => {
      const value = calculateValue(
        holding.shares,
        priceData.price,
        holding.currency,
        exchangeRate
      );

      return {
        symbol: holding.symbol,
        name: holding.name,
        shares: holding.shares,
        currency: holding.currency,
        market: holding.market,
        currentPrice: priceData.price,
        changePercent: priceData.changePercent,
        valueUSD: value.usd,
        valueTWD: value.twd,
      };
    });

    // 3. 計算總值
    const totalValueTWD = holdingsWithPrices.reduce((sum, h) => sum + h.valueTWD, 0);
    const totalValueUSD = holdingsWithPrices.reduce((sum, h) => sum + h.valueUSD, 0);

    // 4. 組裝快取資料
    const portfolioData = {
      timestamp: new Date().toISOString(),
      exchangeRate,
      totalValueTWD: Math.round(totalValueTWD),
      totalValueUSD: Math.round(totalValueUSD * 100) / 100,
      holdings: holdingsWithPrices,
    };

    // 5. 存入 Redis 快取（即時資料）
    const [dataResult, rateResult] = await Promise.all([
      setToCache(CACHE_KEYS.PORTFOLIO_DATA, portfolioData, CACHE_TTL.PORTFOLIO_DATA),
      setToCache(CACHE_KEYS.EXCHANGE_RATE, exchangeRate, CACHE_TTL.EXCHANGE_RATE),
      setToCache(CACHE_KEYS.LAST_UPDATE, new Date().toISOString(), CACHE_TTL.PORTFOLIO_DATA),
    ]);

    // 6. 追加盤中快照（每 5 分鐘一筆，用於 intraday 圖表）
    const today = new Date().toISOString().split('T')[0];
    const snapshot: IntradaySnapshot = {
      t: Math.floor(Date.now() / 1000),
      tv: Math.round(totalValueTWD),
      tf: Math.round(holdingsWithPrices.reduce((sum, h) => {
        const fixedValue = h.currency === 'USD'
          ? h.shares * h.currentPrice * INITIAL_EXCHANGE_RATE
          : h.shares * h.currentPrice;
        return sum + fixedValue;
      }, 0)),
      fx: exchangeRate,
      st: holdingsWithPrices.map(h => ({
        s: h.symbol,
        p: h.currentPrice,
        v: Math.round(h.valueTWD),
      })),
    };

    appendIntradaySnapshot(today, snapshot)
      .then(ok => ok && console.log(`📈 Cron: Intraday snapshot appended for ${today}`))
      .catch(err => console.warn('⚠️ Cron: Intraday snapshot failed (non-critical):', err));

    // 7. Warm 歷史數據快取（每日一次，避免第一個用戶等待）
    const historyKey = `${CACHE_KEYS.PORTFOLIO_HISTORY}-365`;
    const existingHistory = await getFromCache(historyKey);

    if (!existingHistory) {
      console.log('📊 Cron: Warming historical data cache...');
      try {
        // 觸發 portfolio-detail API 來建立歷史數據快取
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL
          ? `https://${process.env.VERCEL_URL}`
          : 'http://localhost:3000';
        await fetch(`${baseUrl}/api/portfolio-detail?days=365&refresh=true`, {
          signal: AbortSignal.timeout(25000), // 留足時間但不超過 maxDuration
        });
        console.log('✅ Cron: Historical data cache warmed');
      } catch (historyError: any) {
        console.warn('⚠️ Cron: Historical data warm failed (non-critical):', historyError?.message);
      }
    }

    const duration = Date.now() - startTime;

    console.log(`✅ Cron: Cache refresh complete in ${duration}ms`);
    console.log(`   - Portfolio data: ${dataResult ? '✓' : '✗'}`);
    console.log(`   - Exchange rate: ${rateResult ? '✓' : '✗'}`);
    console.log(`   - Total value: NT$ ${Math.round(totalValueTWD).toLocaleString()}`);

    return NextResponse.json({
      success: true,
      duration: `${duration}ms`,
      totalValueTWD: Math.round(totalValueTWD),
      holdingsCount: holdingsWithPrices.length,
      timestamp: portfolioData.timestamp,
    });
  } catch (error) {
    console.error('❌ Cron: Cache refresh failed:', error);
    return NextResponse.json(
      { error: 'Cache refresh failed', details: String(error) },
      { status: 500 }
    );
  }
}

// 設定較長的執行時間限制（Cron Job 可能需要更多時間）
export const maxDuration = 30;
