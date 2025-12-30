import { NextRequest, NextResponse } from 'next/server';
import { getHistoricalPrices, getBTCHistoricalPrices } from '@/lib/api-client';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const symbol = searchParams.get('symbol');
    const days = parseInt(searchParams.get('days') || '30');

    if (!symbol) {
      return NextResponse.json(
        { error: 'Symbol is required' },
        { status: 400 }
      );
    }

    let data;

    if (symbol === 'BTC') {
      data = await getBTCHistoricalPrices(days);
    } else {
      data = await getHistoricalPrices(symbol, days);
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch historical data' },
      { status: 500 }
    );
  }
}

// 快取 24 小時
export const revalidate = 86400;
