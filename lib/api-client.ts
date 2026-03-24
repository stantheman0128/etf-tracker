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
      next: { revalidate: 60 },
      signal: AbortSignal.timeout(10000)
    });

    if (!response.ok) {
      console.error(`Yahoo Finance API error for ${symbol}.TW: ${response.status}`);
      return null;
    }

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
          const price = parseFloat(usdRate); // 1 BTC = X USD
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

  // 使用 Promise.any() 競速：取最快成功的 API，而非依序嘗試
  try {
    const result = await Promise.any(
      apis.map(async (api) => {
        const response = await fetch(api.url, {
          next: { revalidate: 120 },
          signal: AbortSignal.timeout(10000)
        });

        if (!response.ok) {
          throw new Error(`${api.name} HTTP ${response.status}`);
        }

        const data = await response.json();
        const parsed = api.parser(data);

        if (!parsed || !Number.isFinite(parsed.price) || parsed.price <= 0) {
          throw new Error(`${api.name} returned invalid price`);
        }

        console.log(`✅ ${api.name} BTC: $${parsed.price.toFixed(2)}`);
        return {
          price: parsed.price,
          change: parsed.change,
          changePercent: parsed.change
        };
      })
    );
    return result;
  } catch (error: any) {
    // 所有 API 都失敗
    console.error('All BTC APIs failed, using fallback price:', error?.message);
    return { price: 95000, change: 0, changePercent: 0 };
  }
}

// ============ 匯率 USD/TWD ============
export async function getExchangeRate(): Promise<number> {
  try {
    const url = `${API_CONFIG.exchangeRate.baseUrl}/USD`;

    const response = await fetch(url, {
      next: { revalidate: 3600 }, // 快取 1 小時
      signal: AbortSignal.timeout(10000)
    });

    if (!response.ok) {
      console.error(`Exchange rate API error: ${response.status}`);
      return 31.5;
    }

    const data = await response.json();
    return data.rates?.TWD || 31.5; // 預設匯率
  } catch (error) {
    console.error('Error fetching exchange rate:', error);
    return 31.5; // 備用匯率
  }
}

// ============ 歷史匯率 (Yahoo Finance USDTWD=X) ============
export async function getHistoricalExchangeRates(
  days: number = 365
): Promise<HistoricalPrice[]> {
  try {
    // USD/TWD 匯率的 Yahoo Finance 代碼
    const symbol = 'USDTWD=X';

    let range = '1y';
    if (days <= 30) range = '1mo';
    else if (days <= 90) range = '3mo';
    else if (days <= 180) range = '6mo';
    else range = '1y';

    // 先嘗試日線資料
    const dailyUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=${range}&interval=1d`;

    const response = await fetch(dailyUrl, {
      next: { revalidate: 86400 },
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(10000)
    });

    if (!response.ok) {
      console.error(`Historical exchange rate API error: ${response.status}`);
      return [];
    }

    const data = await response.json();
    const result = data.chart?.result?.[0];

    if (!result) return [];

    const timestamps = result.timestamp || [];
    const closes = result.indicators?.quote?.[0]?.close || [];

    // 建立日期到匯率的 Map
    const ratesMap = new Map<string, number>();
    timestamps.forEach((ts: number, i: number) => {
      const date = new Date(ts * 1000).toISOString().split('T')[0];
      if (closes[i] && closes[i] > 0) {
        ratesMap.set(date, closes[i]);
      }
    });

    // 檢查是否有缺失的日期（特別是週五），用小時線補齊
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    const endDate = new Date();
    
    const missingDates: string[] = [];
    const current = new Date(startDate);
    while (current <= endDate) {
      const dateStr = current.toISOString().split('T')[0];
      // 只檢查工作日（週一到週五）
      if (current.getDay() >= 1 && current.getDay() <= 5) {
        if (!ratesMap.has(dateStr)) {
          missingDates.push(dateStr);
        }
      }
      current.setDate(current.getDate() + 1);
    }

    // 如果有缺失的工作日，嘗試用小時線補齊
    if (missingDates.length > 0) {
      console.log(`📊 Found ${missingDates.length} missing weekday exchange rates, fetching hourly data...`);
      
      // 用小時線抓取整個範圍
      const hourlyUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=${range}&interval=1h`;
      
      try {
        const hourlyResponse = await fetch(hourlyUrl, {
          next: { revalidate: 86400 },
          headers: { 'User-Agent': 'Mozilla/5.0' },
          signal: AbortSignal.timeout(10000)
        });

        if (!hourlyResponse.ok) {
          console.error(`Hourly exchange rate API error: ${hourlyResponse.status}`);
          throw new Error('Hourly API failed');
        }

        const hourlyData = await hourlyResponse.json();
        const hourlyResult = hourlyData.chart?.result?.[0];

        if (hourlyResult) {
          const hourlyTimestamps = hourlyResult.timestamp || [];
          const hourlyCloses = hourlyResult.indicators?.quote?.[0]?.close || [];
          
          // 為每個缺失的日期找最後一個有效的小時收盤價
          const dailyFromHourly = new Map<string, number>();
          
          hourlyTimestamps.forEach((ts: number, i: number) => {
            const date = new Date(ts * 1000).toISOString().split('T')[0];
            if (hourlyCloses[i] && hourlyCloses[i] > 0) {
              dailyFromHourly.set(date, hourlyCloses[i]); // 會被覆蓋，最後保留當天最後的值
            }
          });

          // 補齊缺失的資料
          let filledCount = 0;
          for (const date of missingDates) {
            if (dailyFromHourly.has(date)) {
              ratesMap.set(date, dailyFromHourly.get(date)!);
              filledCount++;
            }
          }
          console.log(`📊 Filled ${filledCount} missing dates from hourly data`);
        }
      } catch (hourlyError) {
        console.error('Error fetching hourly exchange rates:', hourlyError);
      }
    }

    // 轉換回陣列
    const rates: HistoricalPrice[] = Array.from(ratesMap.entries())
      .map(([date, close]) => ({ date, close }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return rates;
  } catch (error) {
    console.error('Error fetching historical exchange rates:', error);
    return [];
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

// ============ 每小時價格 (Yahoo Finance - 小時線) ============
export async function getHourlyPrices(
  symbol: string,
  days: number = 30
): Promise<HistoricalPrice[]> {
  try {
    // 為台股加上 .TW 後綴
    const yahooSymbol = symbol.match(/^\d{4}$/) ? `${symbol}.TW` : symbol;

    // Yahoo Finance 支援的時間範圍
    let range = '1mo';
    if (days <= 5) range = '5d';
    else if (days <= 30) range = '1mo';
    else if (days <= 90) range = '3mo';
    else if (days <= 180) range = '6mo';
    else range = '1y';

    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${yahooSymbol}?range=${range}&interval=1h`;

    const response = await fetch(url, {
      next: { revalidate: 3600 },
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(15000)
    });

    if (!response.ok) {
      console.error(`Yahoo Finance hourly data error for ${yahooSymbol}: ${response.status}`);
      return [];
    }

    const data = await response.json();
    const result = data.chart?.result?.[0];

    if (!result || !result.timestamp || !result.indicators?.quote?.[0]) {
      console.error('Invalid hourly data response for', yahooSymbol);
      return [];
    }

    const timestamps = result.timestamp;
    const quote = result.indicators.quote[0];

    const hourlyData: HistoricalPrice[] = timestamps.map((timestamp: number, index: number) => ({
      date: new Date(timestamp * 1000).toISOString(),
      close: quote.close[index] || 0,
      open: quote.open[index],
      high: quote.high[index],
      low: quote.low[index],
      volume: quote.volume[index]
    })).filter((item: HistoricalPrice) => item.close > 0);

    console.log(`✅ Got ${hourlyData.length} hourly data points for ${yahooSymbol}`);
    return hourlyData;
  } catch (error: any) {
    console.error(`Error fetching hourly data for ${symbol}:`, error?.message || error);
    return [];
  }
}

// ============ BTC 每小時價格 (Kraken OHLC + CoinGecko 備援) ============
export async function getBTCHourlyPrices(
  days: number = 30
): Promise<HistoricalPrice[]> {
  try {
    const sinceTimestamp = Math.floor(Date.now() / 1000) - days * 86400;
    const krakenUrl = `https://api.kraken.com/0/public/OHLC?pair=XBTUSD&interval=60&since=${sinceTimestamp}`;

    const krakenResponse = await fetch(krakenUrl, {
      signal: AbortSignal.timeout(10000)
    });

    let krakenPrices: HistoricalPrice[] = [];

    if (krakenResponse.ok) {
      const krakenData = await krakenResponse.json();
      const ohlcData = krakenData.result?.XXBTUSD;

      if (ohlcData && Array.isArray(ohlcData)) {
        // Kraken OHLC format: [time, open, high, low, close, vwap, volume, count]
        krakenPrices = ohlcData.map((entry: any) => ({
          date: new Date(entry[0] * 1000).toISOString(),
          close: parseFloat(entry[4]),
          open: parseFloat(entry[1]),
          high: parseFloat(entry[2]),
          low: parseFloat(entry[3]),
          volume: parseFloat(entry[6])
        })).filter((item: HistoricalPrice) => item.close > 0);
      }
    }

    console.log(`✅ Got ${krakenPrices.length} hourly BTC data points from Kraken`);

    // Kraken 最多返回 720 筆（約 30 天小時線），超過則用 CoinGecko 補齊
    if (days > 30) {
      try {
        const geckoUrl = `https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=usd&days=${days}`;
        const geckoResponse = await fetch(geckoUrl, {
          signal: AbortSignal.timeout(10000)
        });

        if (geckoResponse.ok) {
          const geckoData = await geckoResponse.json();

          if (geckoData.prices && Array.isArray(geckoData.prices)) {
            // CoinGecko 在 days <= 90 時返回小時線
            const geckoPrices: HistoricalPrice[] = geckoData.prices.map(
              ([timestamp, price]: [number, number]) => ({
                date: new Date(timestamp).toISOString(),
                close: price
              })
            );

            // 合併並以小時去重（Kraken 資料優先）
            const hourMap = new Map<string, HistoricalPrice>();

            // 先放 CoinGecko（會被 Kraken 覆蓋）
            for (const item of geckoPrices) {
              const hourKey = item.date.slice(0, 13); // "YYYY-MM-DDTHH"
              hourMap.set(hourKey, item);
            }

            // 再放 Kraken（覆蓋重複的小時）
            for (const item of krakenPrices) {
              const hourKey = item.date.slice(0, 13);
              hourMap.set(hourKey, item);
            }

            const merged = Array.from(hourMap.values()).sort(
              (a, b) => a.date.localeCompare(b.date)
            );

            console.log(`✅ Merged BTC hourly data: ${merged.length} points (Kraken + CoinGecko)`);
            return merged;
          }
        }
      } catch (geckoError: any) {
        console.error('CoinGecko hourly BTC fetch failed:', geckoError?.message || geckoError);
      }
    }

    return krakenPrices;
  } catch (error: any) {
    console.error('Error fetching BTC hourly prices:', error?.message || error);
    return [];
  }
}

// ============ 每小時匯率 (Yahoo Finance USDTWD=X 小時線) ============
export async function getHourlyExchangeRates(
  days: number = 30
): Promise<HistoricalPrice[]> {
  try {
    const symbol = 'USDTWD=X';

    let range = '1mo';
    if (days <= 5) range = '5d';
    else if (days <= 30) range = '1mo';
    else if (days <= 90) range = '3mo';
    else if (days <= 180) range = '6mo';
    else range = '1y';

    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=${range}&interval=1h`;

    const response = await fetch(url, {
      next: { revalidate: 3600 },
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(10000)
    });

    if (!response.ok) {
      console.error(`Hourly exchange rate API error: ${response.status}`);
      return [];
    }

    const data = await response.json();
    const result = data.chart?.result?.[0];

    if (!result || !result.timestamp || !result.indicators?.quote?.[0]) {
      console.error('Invalid hourly exchange rate response');
      return [];
    }

    const timestamps = result.timestamp;
    const closes = result.indicators.quote[0].close;

    const rates: HistoricalPrice[] = timestamps.map((ts: number, i: number) => ({
      date: new Date(ts * 1000).toISOString(),
      close: closes[i] || 0
    })).filter((item: HistoricalPrice) => item.close > 0);

    console.log(`✅ Got ${rates.length} hourly exchange rate data points`);
    return rates;
  } catch (error: any) {
    console.error('Error fetching hourly exchange rates:', error?.message || error);
    return [];
  }
}

// ============ 市場狀態檢查 ============
// 從 Intl.DateTimeFormat 取得指定時區的時間部件（避免 toLocaleString round-trip）
function getTimeParts(timeZone: string) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    hour: 'numeric',
    minute: 'numeric',
    hourCycle: 'h23',
  });
  const parts = formatter.formatToParts(new Date());
  const get = (type: string) => parts.find(p => p.type === type)?.value || '';
  const weekday = get('weekday'); // Mon, Tue, ...
  const hour = parseInt(get('hour'), 10);
  const minute = parseInt(get('minute'), 10);
  const dayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return { day: dayMap[weekday] ?? 0, totalMinutes: hour * 60 + minute };
}

export function getMarketStatus() {
  const taipei = getTimeParts('Asia/Taipei');
  const ny = getTimeParts('America/New_York');

  const isTaiwanOpen = checkTaiwanMarket(taipei.day, taipei.totalMinutes);
  const isUSOpen = checkUSMarket(ny.day, ny.totalMinutes);

  return {
    taiwan: isTaiwanOpen,
    us: isUSOpen,
    isAnyOpen: isTaiwanOpen.isOpen || isUSOpen.isOpen
  };
}

function checkTaiwanMarket(day: number, totalMinutes: number) {
  const isWeekday = day >= 1 && day <= 5;
  const isOpen = isWeekday && totalMinutes >= 540 && totalMinutes <= 810; // 9:00-13:30

  return {
    isOpen,
    display: isOpen ? '🟢 台股開市中' :
             (!isWeekday ? '🔴 台股週末休市' :
              totalMinutes < 540 ? '🔴 台股尚未開市' : '🔴 台股已收市')
  };
}

function checkUSMarket(day: number, totalMinutes: number) {
  const isWeekday = day >= 1 && day <= 5;
  const isOpen = isWeekday && totalMinutes >= 570 && totalMinutes <= 960; // 9:30-16:00

  return {
    isOpen,
    display: isOpen ? '🟢 美股開市中' :
             (!isWeekday ? '🔴 美股週末休市' :
              totalMinutes < 570 ? '🔴 美股尚未開市' : '🔴 美股已收市')
  };
}
