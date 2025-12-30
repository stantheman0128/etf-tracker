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

// ============ 美股價格 (Yahoo Finance - 免費無需 API Key) ============
export async function getUSStockPrice(symbol: string): Promise<PriceData | null> {
  try {
    // 使用 Yahoo Finance API（和台股相同來源，穩定可靠）
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}`;

    const response = await fetch(url, {
      next: { revalidate: 60 },
      signal: AbortSignal.timeout(10000)
    });

    if (!response.ok) {
      console.error(`Yahoo Finance API error for ${symbol}: ${response.status}`);
      return null;
    }

    const data = await response.json();
    const quote = data.chart?.result?.[0];

    if (!quote) {
      console.error('Invalid response for US stock', symbol);
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
  } catch (error: any) {
    console.error(`Error fetching US stock ${symbol}:`, error?.message || error);
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

// ============ BTC 價格 (多重 API 備援) ============
export async function getBTCPrice(): Promise<PriceData | null> {
  // 使用多個備用 API（參考舊版本成功經驗）
  const apis = [
    {
      name: 'Kraken',
      url: 'https://api.kraken.com/0/public/Ticker?pair=BTCUSD',
      parser: (data: any) => {
        const ticker = data.result?.XXBTZUSD;
        if (ticker) {
          const currentPrice = parseFloat(ticker.c?.[0]);
          const openPrice = parseFloat(ticker.o);
          let change = 0;
          if (openPrice && openPrice > 0) {
            change = ((currentPrice - openPrice) / openPrice) * 100;
          }
          return { price: currentPrice, change };
        }
        return null;
      }
    },
    {
      name: 'Coinbase',
      url: 'https://api.coinbase.com/v2/exchange-rates?currency=BTC',
      parser: (data: any) => {
        const usdRate = data.data?.rates?.USD;
        if (usdRate) {
          const price = 1 / parseFloat(usdRate);
          return { price, change: 0 }; // Coinbase 不提供漲跌幅
        }
        return null;
      }
    },
    {
      name: 'Blockchain.info',
      url: 'https://blockchain.info/ticker',
      parser: (data: any) => {
        const usd = data.USD;
        if (usd?.last) {
          return { price: usd.last, change: 0 };
        }
        return null;
      }
    }
  ];

  // 嘗試每個 API
  for (const api of apis) {
    try {
      const response = await fetch(api.url, {
        next: { revalidate: 120 },
        signal: AbortSignal.timeout(10000)
      });

      if (response.ok) {
        const data = await response.json();
        const result = api.parser(data);

        if (result && result.price > 50000 && result.price < 200000) {
          console.log(`✅ ${api.name} BTC: $${result.price.toFixed(2)}`);
          return {
            price: result.price,
            change: result.change,
            changePercent: result.change
          };
        }
      }
    } catch (error: any) {
      console.error(`${api.name} failed:`, error?.message);
    }
  }

  // 所有 API 都失敗，使用備用價格
  console.error('All BTC APIs failed, using fallback price');
  return { price: 95000, change: 0, changePercent: 0 };
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

// ============ 歷史價格 (Yahoo Finance - 免費無需 API Key) ============
export async function getHistoricalPrices(
  symbol: string,
  days: number = 90
): Promise<HistoricalPrice[]> {
  try {
    // 為台股加上 .TW 後綴
    const yahooSymbol = symbol.match(/^\d{4}$/) ? `${symbol}.TW` : symbol;

    // Yahoo Finance 支援的時間範圍：1d, 5d, 1mo, 3mo, 6mo, 1y, 2y, 5y, 10y, ytd, max
    let range = '3mo'; // 預設 3 個月
    if (days <= 5) range = '5d';
    else if (days <= 30) range = '1mo';
    else if (days <= 90) range = '3mo';
    else if (days <= 180) range = '6mo';
    else range = '1y';

    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${yahooSymbol}?range=${range}&interval=1d`;

    const response = await fetch(url, {
      next: { revalidate: 86400 }, // 快取 24 小時
      signal: AbortSignal.timeout(10000)
    });

    if (!response.ok) {
      console.error(`Yahoo Finance historical data error for ${yahooSymbol}: ${response.status}`);
      return [];
    }

    const data = await response.json();
    const result = data.chart?.result?.[0];

    if (!result || !result.timestamp || !result.indicators?.quote?.[0]) {
      console.error('Invalid historical data response for', yahooSymbol);
      return [];
    }

    const timestamps = result.timestamp;
    const quote = result.indicators.quote[0];

    // 將資料轉換為 HistoricalPrice 格式
    const historicalData: HistoricalPrice[] = timestamps.map((timestamp: number, index: number) => ({
      date: new Date(timestamp * 1000).toISOString().split('T')[0],
      close: quote.close[index] || 0,
      open: quote.open[index],
      high: quote.high[index],
      low: quote.low[index],
      volume: quote.volume[index]
    })).filter((item: HistoricalPrice) => item.close > 0); // 過濾掉無效資料

    console.log(`✅ Got ${historicalData.length} days of historical data for ${yahooSymbol}`);
    return historicalData;
  } catch (error: any) {
    console.error(`Error fetching historical data for ${symbol}:`, error?.message || error);
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
