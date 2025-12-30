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

    // 3. 建立日期到價格的對應表
    const dateValueMap = new Map<string, number>();

    allHistoricalData.forEach(({ symbol, shares, currency, data }) => {
      data.forEach(({ date, close }) => {
        if (!close || close <= 0) return;

        // 計算此持股在該日的台幣價值
        let valueInTWD = 0;
        if (currency === 'USD') {
          valueInTWD = shares * close * exchangeRate;
        } else {
          valueInTWD = shares * close;
        }

        // 累加到該日期的總值
        const currentTotal = dateValueMap.get(date) || 0;
        dateValueMap.set(date, currentTotal + valueInTWD);
      });
    });

    // 4. 轉換為陣列並排序
    const portfolioHistory = Array.from(dateValueMap.entries())
      .map(([date, value]) => ({
        date,
        close: Math.round(value) // 四捨五入到整數
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    console.log(`✅ Portfolio history: ${portfolioHistory.length} days of data`);

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
