/**
 * 投資組合即時資料 API
 * 
 * 優先從 Redis 快取讀取，如果快取不存在則直接抓取
 * 這個 API 回應時間應該在毫秒級
 */

import { NextRequest, NextResponse } from 'next/server';
import { PORTFOLIO_CONFIG } from '@/lib/config';
import {
  getUSStockPrice,
  getTWStockPrice,
  getBTCPrice,
  getExchangeRate,
  getMarketStatus,
  type PriceData,
} from '@/lib/api-client';
import {
  getFromCache,
  setToCache,
  CACHE_KEYS,
  CACHE_TTL,
} from '@/lib/redis-cache';

// 快取的資料結構
interface CachedPortfolioData {
  timestamp: string;
  exchangeRate: number;
  totalValueTWD: number;
  totalValueUSD: number;
  holdings: Array<{
    symbol: string;
    name: string;
    shares: number;
    currency: string;
    market: string;
    currentPrice: number;
    changePercent: number;
    valueUSD: number;
    valueTWD: number;
  }>;
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

// 直接抓取資料（當快取不存在時）
async function fetchFreshData(): Promise<CachedPortfolioData> {
  console.log('📡 Fetching fresh portfolio data...');
  
  const exchangeRate = await getExchangeRate();

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

      if (!priceData) {
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

  const totalValueTWD = holdingsWithPrices.reduce((sum, h) => sum + h.valueTWD, 0);
  const totalValueUSD = holdingsWithPrices.reduce((sum, h) => sum + h.valueUSD, 0);

  return {
    timestamp: new Date().toISOString(),
    exchangeRate,
    totalValueTWD: Math.round(totalValueTWD),
    totalValueUSD: Math.round(totalValueUSD * 100) / 100,
    holdings: holdingsWithPrices,
  };
}

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    const searchParams = request.nextUrl.searchParams;
    const forceRefresh = searchParams.get('refresh') === 'true';

    // 1. 嘗試從快取讀取
    if (!forceRefresh) {
      const cached = await getFromCache<CachedPortfolioData>(CACHE_KEYS.PORTFOLIO_DATA);
      
      if (cached) {
        const duration = Date.now() - startTime;
        console.log(`⚡ Cache hit: responded in ${duration}ms`);
        
        return NextResponse.json({
          ...cached,
          source: 'cache',
          responseTime: `${duration}ms`,
          marketStatus: getMarketStatus(),
        });
      }
    }

    // 2. 快取不存在，直接抓取
    console.log('📡 Cache miss, fetching fresh data...');
    const freshData = await fetchFreshData();

    // 3. 存入快取（非同步，不等待）
    setToCache(CACHE_KEYS.PORTFOLIO_DATA, freshData, CACHE_TTL.PORTFOLIO_DATA)
      .catch(err => console.error('Failed to cache data:', err));

    const duration = Date.now() - startTime;
    console.log(`📡 Fresh data: responded in ${duration}ms`);

    return NextResponse.json({
      ...freshData,
      source: 'fresh',
      responseTime: `${duration}ms`,
      marketStatus: getMarketStatus(),
    });
  } catch (error) {
    console.error('Portfolio API Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch portfolio data' },
      { status: 500 }
    );
  }
}

// Next.js 快取設定：每 60 秒重新驗證
export const revalidate = 60;
