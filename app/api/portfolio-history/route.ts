import { NextRequest, NextResponse } from 'next/server';
import { PORTFOLIO_CONFIG } from '@/lib/config';
import {
  getHistoricalPrices,
  getBTCHistoricalPrices,
  getExchangeRate
} from '@/lib/api-client';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const days = parseInt(searchParams.get('days') || '90');

    console.log(`📊 Fetching portfolio history for ${days} days...`);

    // 1. 獲取當前匯率（用於計算）
    const exchangeRate = await getExchangeRate();

    // 2. 並行獲取所有股票的歷史資料
    const historicalDataPromises = PORTFOLIO_CONFIG.holdings.map(async (holding) => {
      let data;

      if (holding.market === 'CRYPTO') {
        data = await getBTCHistoricalPrices(days);
      } else {
        data = await getHistoricalPrices(holding.symbol, days);
      }

      return {
        symbol: holding.symbol,
        shares: holding.shares,
        currency: holding.currency,
        data: data
      };
    });

    const allHistoricalData = await Promise.all(historicalDataPromises);

    // 3. 建立每支股票的日期→價格對應表
    const stockPricesByDate = new Map<string, Map<string, number>>();

    allHistoricalData.forEach(({ symbol, shares, currency, data }) => {
      const priceMap = new Map<string, number>();
      data.forEach(({ date, close }) => {
        if (close && close > 0) {
          // 轉換為台幣價值
          const valueInTWD = currency === 'USD'
            ? shares * close * exchangeRate
            : shares * close;
          priceMap.set(date, valueInTWD);
        }
      });
      stockPricesByDate.set(symbol, priceMap);
    });

    // 4. 找出所有股票都有數據的日期（交集）
    const allDates = new Set<string>();
    stockPricesByDate.forEach((priceMap) => {
      priceMap.forEach((_, date) => allDates.add(date));
    });

    // ETF 起始日期：2024-05-30
    const portfolioStartDate = '2024-05-30';

    const portfolioHistory: Array<{ date: string; close: number }> = [];

    for (const date of Array.from(allDates).sort()) {
      // 過濾掉起始日期之前的資料
      if (date < portfolioStartDate) continue;

      // 檢查是否所有股票都有這個日期的資料
      let hasAllStocks = true;
      let totalValue = 0;

      for (const [symbol, priceMap] of stockPricesByDate.entries()) {
        const value = priceMap.get(date);
        if (!value) {
          hasAllStocks = false;
          break;
        }
        totalValue += value;
      }

      // 只加入所有股票都有資料的日期
      if (hasAllStocks) {
        portfolioHistory.push({
          date,
          close: Math.round(totalValue)
        });
      }
    }

    console.log(`✅ Portfolio history: ${portfolioHistory.length} days of data (from ${portfolioStartDate})`);

    return NextResponse.json(portfolioHistory);
  } catch (error) {
    console.error('Portfolio history API Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch portfolio history' },
      { status: 500 }
    );
  }
}

// 快取 24 小時
export const revalidate = 86400;
