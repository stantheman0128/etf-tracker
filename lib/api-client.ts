// API 客戶端 - 處理所有外部 API 呼叫

import { API_CONFIG } from './config';

export interface PriceData {
  price: number;
  change: number;
  changePercent: number;
}

export interface HistoricalPrice {
  date: string;
  close: number;
  open?: number;
  high?: number;
  low?: number;
  volume?: number;
}

// ============ 美股價格 (Alpha Vantage) ============
export async function getUSStockPrice(symbol: string): Promise<PriceData | null> {
  try {
    const url = `${API_CONFIG.alphaVantage.baseUrl}?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${API_CONFIG.alphaVantage.apiKey}`;

    const response = await fetch(url, {
      next: { revalidate: 60 } // 快取 1 分鐘
    });

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status}`);
    }

    const data = await response.json();
    const quote = data['Global Quote'];

    if (!quote || !quote['05. price']) {
      console.error('Invalid Alpha Vantage response for', symbol);
      return null;
    }

    return {
      price: parseFloat(quote['05. price']),
      change: parseFloat(quote['09. change']),
      changePercent: parseFloat(quote['10. change percent'].replace('%', ''))
    };
  } catch (error) {
    console.error(`Error fetching price for ${symbol}:`, error);
    return null;
  }
}

// ============ 台股價格 (Yahoo Finance - 免費無需 API Key) ============
export async function getTWStockPrice(symbol: string): Promise<PriceData | null> {
  try {
    // 使用 Yahoo Finance API (免費)
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}.TW`;

    const response = await fetch(url, {
      next: { revalidate: 60 }
    });

    const data = await response.json();
    const quote = data.chart?.result?.[0];

    if (!quote) {
      console.error('Invalid response for TW stock', symbol);
      return null;
    }

    const meta = quote.meta;
    const currentPrice = meta.regularMarketPrice;
    const previousClose = meta.chartPreviousClose || meta.previousClose;
    const change = currentPrice - previousClose;
    const changePercent = (change / previousClose) * 100;

    return {
      price: currentPrice,
      change: change,
      changePercent: changePercent
    };
  } catch (error) {
    console.error(`Error fetching TW stock ${symbol}:`, error);
    return null;
  }
}

// ============ BTC 價格 (CoinGecko - 免費) ============
export async function getBTCPrice(): Promise<PriceData | null> {
  try {
    const url = `${API_CONFIG.coinGecko.baseUrl}/simple/price?ids=bitcoin&vs_currencies=usd&include_24hr_change=true`;

    const response = await fetch(url, {
      next: { revalidate: 120 } // BTC 快取 2 分鐘
    });

    const data = await response.json();
    const btcData = data.bitcoin;

    if (!btcData) {
      return null;
    }

    return {
      price: btcData.usd,
      change: btcData.usd_24h_change,
      changePercent: btcData.usd_24h_change
    };
  } catch (error) {
    console.error('Error fetching BTC price:', error);
    return null;
  }
}

// ============ 匯率 USD/TWD ============
export async function getExchangeRate(): Promise<number> {
  try {
    const url = `${API_CONFIG.exchangeRate.baseUrl}/USD`;

    const response = await fetch(url, {
      next: { revalidate: 3600 } // 快取 1 小時
    });

    const data = await response.json();
    return data.rates?.TWD || 31.5; // 預設匯率
  } catch (error) {
    console.error('Error fetching exchange rate:', error);
    return 31.5; // 備用匯率
  }
}

// ============ 歷史價格 (Alpha Vantage) ============
export async function getHistoricalPrices(
  symbol: string,
  days: number = 30
): Promise<HistoricalPrice[]> {
  try {
    const url = `${API_CONFIG.alphaVantage.baseUrl}?function=TIME_SERIES_DAILY&symbol=${symbol}&apikey=${API_CONFIG.alphaVantage.apiKey}`;

    const response = await fetch(url, {
      next: { revalidate: 86400 } // 快取 24 小時
    });

    const data = await response.json();
    const timeSeries = data['Time Series (Daily)'];

    if (!timeSeries) {
      console.error('No historical data for', symbol);
      return [];
    }

    return Object.entries(timeSeries)
      .slice(0, days)
      .map(([date, values]: [string, any]) => ({
        date,
        open: parseFloat(values['1. open']),
        high: parseFloat(values['2. high']),
        low: parseFloat(values['3. low']),
        close: parseFloat(values['4. close']),
        volume: parseInt(values['5. volume'])
      }))
      .reverse(); // 從舊到新排序
  } catch (error) {
    console.error(`Error fetching historical data for ${symbol}:`, error);
    return [];
  }
}

// ============ BTC 歷史價格 (CoinGecko) ============
export async function getBTCHistoricalPrices(days: number = 30): Promise<HistoricalPrice[]> {
  try {
    const url = `${API_CONFIG.coinGecko.baseUrl}/coins/bitcoin/market_chart?vs_currency=usd&days=${days}`;

    const response = await fetch(url, {
      next: { revalidate: 86400 }
    });

    const data = await response.json();

    if (!data.prices) {
      return [];
    }

    return data.prices.map(([timestamp, price]: [number, number]) => ({
      date: new Date(timestamp).toISOString().split('T')[0],
      close: price
    }));
  } catch (error) {
    console.error('Error fetching BTC historical data:', error);
    return [];
  }
}

// ============ 市場狀態檢查 ============
export function getMarketStatus() {
  const now = new Date();
  const taipeiTime = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Taipei" }));
  const nyTime = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));

  const isTaiwanOpen = checkTaiwanMarket(taipeiTime);
  const isUSOpen = checkUSMarket(nyTime);

  return {
    taiwan: isTaiwanOpen,
    us: isUSOpen,
    isAnyOpen: isTaiwanOpen.isOpen || isUSOpen.isOpen
  };
}

function checkTaiwanMarket(time: Date) {
  const day = time.getDay();
  const hour = time.getHours();
  const minute = time.getMinutes();
  const totalMinutes = hour * 60 + minute;

  const isWeekday = day >= 1 && day <= 5;
  const isOpen = isWeekday && totalMinutes >= 540 && totalMinutes <= 810; // 9:00-13:30

  return {
    isOpen,
    display: isOpen ? '🟢 台股開市中' :
             (!isWeekday ? '🔴 台股週末休市' :
              totalMinutes < 540 ? '🔴 台股尚未開市' : '🔴 台股已收市')
  };
}

function checkUSMarket(time: Date) {
  const day = time.getDay();
  const hour = time.getHours();
  const minute = time.getMinutes();
  const totalMinutes = hour * 60 + minute;

  const isWeekday = day >= 1 && day <= 5;
  const isOpen = isWeekday && totalMinutes >= 570 && totalMinutes <= 960; // 9:30-16:00

  return {
    isOpen,
    display: isOpen ? '🟢 美股開市中' :
             (!isWeekday ? '🔴 美股週末休市' :
              totalMinutes < 570 ? '🔴 美股尚未開市' : '🔴 美股已收市')
  };
}
