import { NextRequest, NextResponse } from 'next/server';
import { PORTFOLIO_CONFIG, IS_DEV, devLog } from '@/lib/config';
import {
  getHistoricalPrices,
  getBTCHistoricalPrices,
  getExchangeRate,
  getHistoricalExchangeRates
} from '@/lib/api-client';
import { readCache, writeCache } from '@/lib/cache';
import { getPortfolioStartDate, getInitialHoldings, getInitialTotalValueTWD, INITIAL_EXCHANGE_RATE } from '@/lib/initial-data';
import { getFromCache, setToCache, CACHE_KEYS, CACHE_TTL } from '@/lib/redis-cache';

// 每支股票的日明細
interface StockDetail {
  symbol: string;
  name: string;
  shares: number;
  price: number;
  valueTWD: number;
  currency: string;
  changePercent: number;  // 相對前一天的漲跌幅
}

// 每日的投資組合明細
interface DailyPortfolioDetail {
  date: string;
  totalValueTWD: number;
  totalValueFixedRate: number;  // 使用固定匯率計算的價值（分析匯率影響用）
  exchangeRate: number;  // 當日匯率
  changePercent: number;  // 投資組合整體漲跌幅
  stocks: StockDetail[];
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const days = parseInt(searchParams.get('days') || '365');
    const forceRefresh = searchParams.get('refresh') === 'true';

    const cacheKey = `portfolio-detail-${days}`;
    const redisCacheKey = `${CACHE_KEYS.PORTFOLIO_HISTORY}-${days}`;

    // 嘗試讀取快取（生產用 Redis，開發用本地檔案）
    if (!forceRefresh) {
      // 生產環境：Redis cache
      if (!IS_DEV) {
        const redisCached = await getFromCache<DailyPortfolioDetail[]>(redisCacheKey);
        if (redisCached) {
          devLog(`⚡ Redis cache hit: portfolio-detail (${redisCached.length} days)`);
          return NextResponse.json(redisCached);
        }
      }

      // 開發環境：本地檔案快取
      if (IS_DEV) {
        const cached = readCache<DailyPortfolioDetail[]>(cacheKey);
        if (cached) {
          devLog(`📊 Using cached portfolio detail (${cached.length} days)`);
          return NextResponse.json(cached);
        }
      }
    }

    devLog(`📊 Fetching portfolio detail for ${days} days...`);

    // 1. 獲取當前匯率（作為備用）
    const currentExchangeRate = await getExchangeRate();

    // 2. 獲取歷史匯率
    const historicalRates = await getHistoricalExchangeRates(days);
    const ratesByDate = new Map<string, number>();
    
    // 直接使用 API 回傳的真實匯率資料
    for (const { date, close } of historicalRates) {
      if (close && close > 0) {
        ratesByDate.set(date, close);
      }
    }
    
    devLog(`📊 Loaded ${ratesByDate.size} exchange rate entries`);

    // 固定匯率（使用初始日期的匯率，用於計算匯率影響）
    const fixedExchangeRate = INITIAL_EXCHANGE_RATE;

    // 3. 並行獲取所有股票的歷史資料
    const historicalDataPromises = PORTFOLIO_CONFIG.holdings.map(async (holding) => {
      let data;

      if (holding.market === 'CRYPTO') {
        data = await getBTCHistoricalPrices(days);
      } else {
        data = await getHistoricalPrices(holding.symbol, days);
      }

      return {
        symbol: holding.symbol,
        name: holding.name,
        shares: holding.shares,
        currency: holding.currency,
        data: data
      };
    });

    const allHistoricalData = await Promise.all(historicalDataPromises);

    // 4. 建立每支股票的日期→價格對應表（使用當日匯率）
    // 這裡先只存原始價格，之後再根據當日匯率計算
    const stockPricesByDate = new Map<string, Map<string, { price: number; currency: string }>>();

    allHistoricalData.forEach(({ symbol, currency, data }) => {
      const priceMap = new Map<string, { price: number; currency: string }>();
      data.forEach(({ date, close }) => {
        if (close && close > 0) {
          priceMap.set(date, { price: close, currency });
        }
      });
      stockPricesByDate.set(symbol, priceMap);
    });

    // 5. 找出所有日期
    const allDates = new Set<string>();
    stockPricesByDate.forEach((priceMap) => {
      priceMap.forEach((_, date) => allDates.add(date));
    });

    const portfolioStartDate = getPortfolioStartDate();
    const totalStocks = stockPricesByDate.size;

    // 用來記錄每支股票的「最後已知價格」
    const lastKnownPrices = new Map<string, { price: number; currency: string }>();

    const sortedDates = Array.from(allDates).sort();
    const portfolioDetail: DailyPortfolioDetail[] = [];

    // 建立 symbol -> holding 的對應表
    const holdingMap = new Map(
      PORTFOLIO_CONFIG.holdings.map(h => [h.symbol, h])
    );

    // 取得初始日的各股票資料
    const initialData = getInitialHoldings();
    const initialHoldingMap = new Map(
      initialData?.holdings.map(h => [h.symbol, h]) || []
    );

    // 用來記錄前一天的價格，計算漲跌幅
    const previousPrices = new Map<string, number>();
    const lastKnownChangePercent = new Map<string, number>(); // 記錄上一個交易日的漲跌幅（假日沿用）
    let previousTotalValue = 0;
    let lastKnownRate = fixedExchangeRate; // 追蹤上一個已知的匯率

    for (const date of sortedDates) {
      if (date < portfolioStartDate) continue;

      // 取得當日匯率，如果沒有則使用上一個已知的匯率（而非當前匯率）
      let dailyRate = ratesByDate.get(date);
      if (dailyRate) {
        lastKnownRate = dailyRate;
      } else {
        dailyRate = lastKnownRate;
      }

      // 如果是初始日期，使用 CSV 的固定值
      if (date === portfolioStartDate && initialData) {
        const stocks: StockDetail[] = [];
        
        for (const holding of PORTFOLIO_CONFIG.holdings) {
          const initial = initialHoldingMap.get(holding.symbol);
          if (initial) {
            stocks.push({
              symbol: holding.symbol,
              name: holding.name,
              shares: holding.shares,
              price: initial.price,
              valueTWD: initial.valueTWD,
              currency: holding.currency,
              changePercent: 0,
            });
            lastKnownPrices.set(holding.symbol, { 
              price: initial.price, 
              currency: holding.currency 
            });
            previousPrices.set(holding.symbol, initial.price);
          }
        }

        const totalValue = getInitialTotalValueTWD();
        portfolioDetail.push({
          date,
          totalValueTWD: totalValue,
          totalValueFixedRate: totalValue, // 初始日固定匯率和實際匯率相同
          exchangeRate: fixedExchangeRate,
          changePercent: 0,
          stocks,
        });
        previousTotalValue = totalValue;
        continue;
      }

      // 計算這個日期的資料
      let totalValueTWD = 0;
      let totalValueFixedRate = 0;
      let stocksWithActualData = 0; // 改為追蹤「當日有實際交易資料」的股票數
      const stocks: StockDetail[] = [];

      for (const [symbol, priceMap] of stockPricesByDate.entries()) {
        const holding = holdingMap.get(symbol);
        if (!holding) continue;

        const todayData = priceMap.get(date);
        let priceData: { price: number; currency: string } | undefined;
        let hasActualData = false; // 標記是否有當日實際資料

        if (todayData) {
          priceData = todayData;
          lastKnownPrices.set(symbol, todayData);
          stocksWithActualData++;
          hasActualData = true;
        } else {
          // 假日：使用上一個交易日的價格
          priceData = lastKnownPrices.get(symbol);
        }

        if (priceData) {
          const shares = holding.shares;
          
          // 使用當日匯率計算價值
          const valueTWD = priceData.currency === 'USD'
            ? shares * priceData.price * dailyRate
            : shares * priceData.price;
          
          // 使用固定匯率計算價值（分析匯率影響用）
          const valueFixedRate = priceData.currency === 'USD'
            ? shares * priceData.price * fixedExchangeRate
            : shares * priceData.price;

          totalValueTWD += valueTWD;
          totalValueFixedRate += valueFixedRate;
          
          // 計算個股漲跌幅
          let changePercent: number;
          if (hasActualData) {
            // 有當日實際資料：計算真實漲跌幅
            const prevPrice = previousPrices.get(symbol) || priceData.price;
            changePercent = prevPrice > 0 
              ? ((priceData.price - prevPrice) / prevPrice) * 100 
              : 0;
            // 儲存這個漲跌幅供假日使用
            lastKnownChangePercent.set(symbol, changePercent);
          } else {
            // 假日：沿用上一個交易日的漲跌幅
            changePercent = lastKnownChangePercent.get(symbol) || 0;
          }
          
          stocks.push({
            symbol,
            name: holding.name,
            shares,
            price: priceData.price,
            valueTWD: Math.round(valueTWD),
            currency: priceData.currency,
            changePercent,
          });
          
          previousPrices.set(symbol, priceData.price);
        }
      }

      // 只要所有股票都有資料（包括使用上一交易日的價格）就計入
      // 假日時：股票使用上一交易日價格，BTC 使用當日價格，匯率使用上一交易日匯率
      if (stocks.length === totalStocks) {
        const portfolioChangePercent = previousTotalValue > 0
          ? ((totalValueTWD - previousTotalValue) / previousTotalValue) * 100
          : 0;

        // 檢測異常數據（與前一天相比變化超過 10%）
        if (previousTotalValue > 0) {
          const changeRatio = Math.abs(totalValueTWD - previousTotalValue) / previousTotalValue;
          if (changeRatio > 0.1) {
            console.warn(`⚠️ 異常數據 ${date}: 總值從 ${previousTotalValue.toFixed(0)} 變為 ${totalValueTWD.toFixed(0)} (${(changeRatio * 100).toFixed(1)}% 變化), 匯率: ${dailyRate.toFixed(2)}`);
            // 列出每支股票的價格
            stocks.forEach(s => {
              const prev = previousPrices.get(s.symbol);
              console.warn(`   ${s.symbol}: ${prev?.toFixed(2)} -> ${s.price.toFixed(2)}`);
            });
          }
        }

        portfolioDetail.push({
          date,
          totalValueTWD: Math.round(totalValueTWD),
          totalValueFixedRate: Math.round(totalValueFixedRate),
          exchangeRate: dailyRate,
          changePercent: portfolioChangePercent,
          stocks,
        });
        
        previousTotalValue = totalValueTWD;
      }
    }

    devLog(`✅ Portfolio detail: ${portfolioDetail.length} days of data`);

    // 儲存到快取
    if (portfolioDetail.length > 0) {
      if (IS_DEV) {
        writeCache(cacheKey, portfolioDetail);
      }
      // 生產環境：寫入 Redis（非同步，不阻塞回應）
      setToCache(redisCacheKey, portfolioDetail, CACHE_TTL.PORTFOLIO_HISTORY)
        .catch(err => console.error('Failed to cache portfolio-detail to Redis:', err));
    }

    return NextResponse.json(portfolioDetail);
  } catch (error) {
    console.error('Error fetching portfolio detail:', error);
    return NextResponse.json(
      { error: 'Failed to fetch portfolio detail' },
      { status: 500 }
    );
  }
}
