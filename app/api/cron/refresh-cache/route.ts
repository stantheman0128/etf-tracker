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
import {
  setToCache,
  CACHE_KEYS,
  CACHE_TTL,
} from '@/lib/redis-cache';

// 驗證 Cron 請求（防止外部呼叫）
function verifyCronRequest(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization');
  
  // Vercel Cron 會帶 CRON_SECRET
  if (process.env.CRON_SECRET) {
    return authHeader === `Bearer ${process.env.CRON_SECRET}`;
  }
  
  // 開發環境允許無驗證
  if (process.env.NODE_ENV === 'development') {
    return true;
  }
  
  // 檢查是否來自 Vercel
  const isVercel = request.headers.get('x-vercel-id');
  return !!isVercel;
}

// 計算持股價值
function calculateValue(
  shares: number,
  price: number,
  currency: string,
  exchangeRate: number
) {
  if (currency === 'USD') {
    return {
      usd: shares * price,
      twd: shares * price * exchangeRate,
    };
  } else {
    return {
      usd: (shares * price) / exchangeRate,
      twd: shares * price,
    };
  }
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
    // 1. 獲取匯率
    const exchangeRate = await getExchangeRate();
    console.log(`💱 Cron: Exchange rate = ${exchangeRate}`);

    // 2. 獲取所有持股價格
    const holdingsWithPrices = await Promise.all(
      PORTFOLIO_CONFIG.holdings.map(async (holding) => {
        let priceData: PriceData | null = null;

        if (holding.market === 'TAIWAN') {
          priceData = await getTWStockPrice(holding.symbol);
        } else if (holding.market === 'CRYPTO') {
          priceData = await getBTCPrice();
        } else {
          priceData = await getUSStockPrice(holding.symbol);
        }

        // 如果無法獲取價格，使用預設值
        if (!priceData) {
          console.warn(`⚠️ Cron: Failed to get price for ${holding.symbol}`);
          priceData = { price: 0, change: 0, changePercent: 0 };
        }

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
      })
    );

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

    // 5. 存入 Redis 快取
    const [dataResult, rateResult, updateResult] = await Promise.all([
      setToCache(CACHE_KEYS.PORTFOLIO_DATA, portfolioData, CACHE_TTL.PORTFOLIO_DATA),
      setToCache(CACHE_KEYS.EXCHANGE_RATE, exchangeRate, CACHE_TTL.EXCHANGE_RATE),
      setToCache(CACHE_KEYS.LAST_UPDATE, new Date().toISOString(), CACHE_TTL.PORTFOLIO_DATA),
    ]);

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
