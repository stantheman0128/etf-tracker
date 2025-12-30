// 🦔 什錦雜貨鋪 ETF - 優化版 v2
// 核心投資組合追蹤系統

// ====== 📊 投資組合配置 ======
const PORTFOLIO_CONFIG = {
  holdings: [
    { symbol: '2330', name: '台積電', shares: 46, exchange: 'TPE', currency: 'TWD', market: 'TAIWAN' },
    { symbol: 'AMZN', name: 'Amazon', shares: 1, exchange: 'NASDAQ', currency: 'USD', market: 'US' },
    { symbol: 'TSLA', name: 'Tesla', shares: 3.51768, exchange: 'NASDAQ', currency: 'USD', market: 'US' },
    { symbol: 'TSM', name: '台積電ADR', shares: 7, exchange: 'NYSE', currency: 'USD', market: 'US' },
    { symbol: 'META', name: 'Meta', shares: 0.16161, exchange: 'NASDAQ', currency: 'USD', market: 'US' },
    { symbol: 'NVDA', name: 'Nvidia', shares: 11, exchange: 'NASDAQ', currency: 'USD', market: 'US' },
    { symbol: 'BTC', name: 'Bitcoin', shares: 0.008, exchange: 'CRYPTO', currency: 'USD', market: 'CRYPTO' }
  ],
  totalCostTWD: 200000
};

// ====== 系統配置 ======
const CONFIG = {
  cache: {
    marketOpen: 5,
    marketClosed: 30,
    exchangeRate: 60,
    btc: 5
  },
  api: {
    btc: [
      {
        name: 'CoinCap',
        url: 'https://api.coincap.io/v2/assets/bitcoin',
        parser: (data) => ({
          price: parseFloat(data.data?.priceUsd),
          change: parseFloat(data.data?.changePercent24Hr) || 0
        })
      },
      {
        name: 'CoinGecko',
        url: 'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_24hr_change=true',
        parser: (data) => ({
          price: data.bitcoin?.usd,
          change: data.bitcoin?.usd_24h_change || 0
        }),
        headers: { 'Accept': 'application/json' }
      }
    ],
    exchangeRate: [
      {
        name: 'ExchangeRate-API',
        url: 'https://api.exchangerate-api.com/v4/latest/USD',
        parser: (data) => data.rates?.TWD
      }
    ]
  }
};

// ====== 🎯 Web App 入口點 ======
function doGet() {
  return HtmlService.createTemplateFromFile('indexrwdv1')
    .evaluate()
    .setTitle('🦔 什錦雜貨鋪 ETF')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// ====== 📊 主要功能 ======
function getPortfolioDataForWeb() {
  try {
    console.log('🌐 獲取投資組合數據...');
    
    const marketStatus = MarketUtil.getStatus();
    const exchangeRate = PriceService.getExchangeRate();
    const holdings = [];
    
    let totalValueUSD = 0;
    let totalValueTWD = 0;
    
    // 批量獲取Google Finance數據（優化：一次性獲取）
    const stockPrices = PriceService.getBatchPrices(PORTFOLIO_CONFIG.holdings);
    
    for (const stock of PORTFOLIO_CONFIG.holdings) {
      try {
        const priceData = stockPrices[stock.symbol] || PriceService.getPriceWithChange(stock.symbol, stock.exchange);
        
        if (priceData && priceData.price > 0) {
          const holding = calculateHoldingValue(stock, priceData, exchangeRate);
          if (holding) {
            holdings.push(holding);
            totalValueUSD += holding.valueUSD;
            totalValueTWD += holding.valueTWD;
          }
        }
      } catch (error) {
        console.error(`❌ ${stock.symbol} 處理錯誤:`, error);
      }
    }
    
    const originalTotalTWD = PORTFOLIO_CONFIG.totalCostTWD;
    const totalReturnTWD = totalValueTWD - originalTotalTWD;
    const returnRate = ((totalReturnTWD / originalTotalTWD) * 100).toFixed(2);
    
    return {
      success: true,
      totalUSD: totalValueUSD.toFixed(2),
      totalTWD: `NT$ ${Math.round(totalValueTWD).toLocaleString()}`,
      totalReturnTWD: `${totalReturnTWD >= 0 ? '+' : ''}NT$ ${Math.round(totalReturnTWD).toLocaleString()}`,
      returnRate: `${returnRate >= 0 ? '+' : ''}${returnRate}%`,
      exchangeRate: exchangeRate.toFixed(2),
      taiwanStatus: marketStatus.taiwan.display,
      usStatus: marketStatus.us.display,
      marketMode: marketStatus.isAnyOpen ? '積極開市模式' : '節能休市模式',
      holdings: holdings,
      lastUpdate: new Date().toLocaleString('zh-TW'),
      cacheMinutes: marketStatus.isAnyOpen ? CONFIG.cache.marketOpen : CONFIG.cache.marketClosed
    };
    
  } catch (error) {
    console.error('❌ 數據獲取失敗:', error);
    return {
      success: false,
      error: error.toString(),
      lastUpdate: new Date().toLocaleString('zh-TW')
    };
  }
}

function forceUpdateAndGetData() {
  console.log('🔄 執行強制更新...');
  CacheService.clearAll();
  return getPortfolioDataForWeb();
}

function calculateHoldingValue(stock, priceData, exchangeRate) {
  if (!stock || !priceData || !exchangeRate) {
    console.error('❌ calculateHoldingValue 參數錯誤');
    return null;
  }
  
  let valueUSD = 0;
  let valueTWD = 0;
  
  if (stock.currency === 'USD') {
    valueUSD = priceData.price * stock.shares;
    valueTWD = valueUSD * exchangeRate;
  } else {
    valueTWD = priceData.price * stock.shares;
    valueUSD = valueTWD / exchangeRate;
  }
  
  return {
    symbol: stock.symbol,
    name: stock.name,
    shares: stock.shares,
    currentPrice: priceData.price,
    currency: stock.currency,
    market: stock.market,
    currentValueUSD: stock.currency === 'USD' ? valueUSD : null,
    currentValueTWD: valueTWD,
    valueUSD: valueUSD,
    valueTWD: valueTWD,
    priceChange: priceData.change || 0,  // 使用真實漲跌幅
    changeColor: priceData.change >= 0 ? 'green' : 'red',
    changeIcon: priceData.change > 0 ? '▲' : priceData.change < 0 ? '▼' : '●'
  };
}

// ====== 💰 價格服務 ======
const PriceService = {
  // 批量獲取價格（優化效能）
  getBatchPrices: function(holdings) {
    const results = {};
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    
    // 建立批量公式
    const formulas = [];
    const positions = [];
    let row = 1;
    
    holdings.forEach(stock => {
      if (stock.symbol !== 'BTC') {
        const ticker = stock.exchange === 'TPE' ? `${stock.exchange}:${stock.symbol}` : stock.symbol;
        formulas.push([
          `=GOOGLEFINANCE("${ticker}","price")`,
          `=GOOGLEFINANCE("${ticker}","changepct")`
        ]);
        positions.push({ symbol: stock.symbol, row: row });
        row++;
      }
    });
    
    if (formulas.length > 0) {
      // 一次性設定所有公式
      const range = sheet.getRange(1, 26, formulas.length, 2); // 使用 Z 和 AA 欄
      range.setFormulas(formulas);
      SpreadsheetApp.flush();
      
      // 等待計算完成
      Utilities.sleep(800); // 稍微增加等待時間
      
      // 一次性讀取所有值
      const values = range.getValues();
      
      positions.forEach((pos, index) => {
        const price = values[index][0];
        const change = values[index][1];
        
        if (typeof price === 'number' && price > 0) {
          // 修正：changepct 已經是百分比形式，不需要乘以 100
          results[pos.symbol] = {
            price: price,
            change: (typeof change === 'number' ? change : 0)
          };
        }
      });
      
      range.clear();
    }
    
    return results;
  },
  
  // 獲取單一股票價格與漲跌幅
  getPriceWithChange: function(symbol, exchange) {
    try {
      const marketStatus = MarketUtil.getStatus();
      const cacheMinutes = marketStatus.isAnyOpen ? CONFIG.cache.marketOpen : CONFIG.cache.marketClosed;
      
      // 檢查緩存
      const cached = CacheService.get(`${symbol}_full`, cacheMinutes);
      if (cached !== null) {
        return cached;
      }
      
      let result = null;
      
      if (symbol === 'BTC') {
        result = this.getBTCPriceWithChange();
      } else {
        result = this.getGoogleFinancePriceWithChange(symbol, exchange);
      }
      
      if (result && result.price > 0) {
        CacheService.set(`${symbol}_full`, result);
      }
      
      return result;
    } catch (error) {
      console.error(`❌ ${symbol} 價格獲取失敗:`, error);
      return null;
    }
  },
  
  // 獲取 Google Finance 價格與漲跌幅
  getGoogleFinancePriceWithChange: function(symbol, exchange) {
    try {
      const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
      const ticker = exchange === 'TPE' ? `${exchange}:${symbol}` : symbol;
      
      // 同時獲取價格和漲跌百分比
      sheet.getRange('Z1').setFormula(`=GOOGLEFINANCE("${ticker}","price")`);
      sheet.getRange('AA1').setFormula(`=GOOGLEFINANCE("${ticker}","changepct")`);
      SpreadsheetApp.flush();
      
      Utilities.sleep(500);
      
      const price = sheet.getRange('Z1').getValue();
      const changePct = sheet.getRange('AA1').getValue();
      
      sheet.getRange('Z1:AA1').clear();
      
      if (typeof price === 'number' && price > 0) {
        return {
          price: price,
          change: (typeof changePct === 'number' ? changePct : 0) // 不乘以 100，保持原始值
        };
      }
      
      return null;
    } catch (error) {
      console.error(`Google Finance ${symbol} 錯誤:`, error);
      return null;
    }
  },
  
  // 獲取BTC價格與漲跌幅（修正版）
  getBTCPriceWithChange: function() {
    console.log('🪙 獲取比特幣價格與漲跌幅...');
    
    // 只使用實測可用的 API
    const apis = [
      {
        name: 'Blockchain.info',
        url: 'https://blockchain.info/ticker',
        parser: (data) => {
          const usd = data.USD;
          if (usd) {
            // Blockchain.info 不提供漲跌幅，稍後從 GBTC 獲取
            return {
              price: usd.last,
              change: null  // 待補充
            };
          }
          return null;
        }
      },
      {
        name: 'Kraken',
        url: 'https://api.kraken.com/0/public/Ticker?pair=BTCUSD',
        parser: (data) => {
          const ticker = data.result?.XXBTZUSD;
          if (ticker) {
            const currentPrice = parseFloat(ticker.c?.[0]);  // 最新成交價
            const openPrice = parseFloat(ticker.o);  // 24小時開盤價
            let change = 0;
            if (openPrice && openPrice > 0) {
              // 修正：轉換為百分比形式
              change = ((currentPrice - openPrice) / openPrice) * 100;
            }
            return {
              price: currentPrice,
              change: change
            };
          }
          return null;
        }
      },
      {
        name: 'Coinbase',
        url: 'https://api.coinbase.com/v2/exchange-rates?currency=BTC',
        parser: (data) => {
          const usdRate = data.data?.rates?.USD;
          if (usdRate) {
            // Coinbase 也不直接提供漲跌幅
            return {
              price: parseFloat(usdRate),
              change: null
            };
          }
          return null;
        }
      }
    ];
    
    let btcData = null;
    
    // 嘗試每個 API
    for (const api of apis) {
      try {
        console.log(`📡 嘗試 ${api.name}...`);
        
        const response = UrlFetchApp.fetch(api.url, {
          muteHttpExceptions: true,
          timeout: 10
        });
        
        if (response.getResponseCode() === 200) {
          const data = JSON.parse(response.getContentText());
          const result = api.parser(data);
          
          if (result && result.price > 50000 && result.price < 200000) {
            console.log(`✅ ${api.name} BTC價格: $${result.price.toFixed(2)}`);
            btcData = result;
            
            // 如果已經有漲跌幅數據，直接返回
            if (result.change !== null) {
              console.log(`   漲跌: ${result.change.toFixed(2)}%`);
              return result;
            }
            
            break;  // 有價格但沒漲跌幅，繼續下一步
          }
        }
      } catch (error) {
        console.log(`⚠️ ${api.name} 失敗: ${error.toString()}`);
      }
      
      Utilities.sleep(300);
    }
    
    // 如果有價格但沒有漲跌幅，嘗試從 GBTC 獲取漲跌趨勢
    if (btcData && btcData.change === null) {
      try {
        console.log('📊 從 GBTC 獲取漲跌幅參考...');
        const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
        
        // 獲取 GBTC 的漲跌幅
        sheet.getRange('AA1').setFormula('=GOOGLEFINANCE("GBTC","changepct")');
        SpreadsheetApp.flush();
        Utilities.sleep(300);
        
        const gbtcChangePct = sheet.getRange('AA1').getValue();
        sheet.getRange('AA1').clear();
        
        if (typeof gbtcChangePct === 'number') {
          // 修正：GBTC 的 changepct 已經是百分比數值（如 -1.81 代表 -1.81%）
          btcData.change = gbtcChangePct;
          console.log(`   GBTC 參考漲跌: ${gbtcChangePct.toFixed(2)}%`);
        }
      } catch (error) {
        console.log('⚠️ GBTC 漲跌幅獲取失敗');
      }
      
      if (btcData) {
        return {
          price: btcData.price,
          change: btcData.change || 0
        };
      }
    }
    
    // 如果所有 API 都失敗，使用 GBTC 估算
    try {
      console.log('📊 使用 GBTC 估算 BTC 價格...');
      const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
      
      sheet.getRange('Z1').setFormula('=GOOGLEFINANCE("GBTC","price")');
      sheet.getRange('AA1').setFormula('=GOOGLEFINANCE("GBTC","changepct")');
      SpreadsheetApp.flush();
      Utilities.sleep(500);
      
      const gbtcPrice = sheet.getRange('Z1').getValue();
      const gbtcChangePct = sheet.getRange('AA1').getValue();
      sheet.getRange('Z1:AA1').clear();
      
      if (gbtcPrice && gbtcPrice > 0) {
        // GBTC 每股約含 0.00091 BTC
        const btcPerShare = 0.00091;
        const estimatedBtcPrice = gbtcPrice / btcPerShare;
        
        // 修正：changepct 已經是百分比形式，直接使用
        const changeValue = typeof gbtcChangePct === 'number' ? gbtcChangePct: 0;
        
        console.log(`💡 GBTC 價格: $${gbtcPrice}`);
        console.log(`💡 GBTC 漲跌: ${gbtcChangePct}%`);
        console.log(`💡 估算 BTC: $${estimatedBtcPrice.toFixed(2)}, 漲跌: ${changeValue.toFixed(2)}%`);
        
        return { 
          price: estimatedBtcPrice, 
          change: changeValue
        };
      }
    } catch (error) {
      console.log('⚠️ GBTC 估算失敗:', error.toString());
    }
    
    // 備用價格（使用較接近市價的數值）
    console.log('⚠️ 使用備用價格 $111,000');
    return { price: 111000, change: 0 };
  },
  
  getExchangeRate: function() {
    try {
      const cached = CacheService.get('USD_TWD_RATE', CONFIG.cache.exchangeRate);
      if (cached !== null) {
        return cached;
      }
      
      // 嘗試多個匯率 API
      const apis = [
        {
          name: 'ExchangeRate-API',
          url: 'https://api.exchangerate-api.com/v4/latest/USD',
          parser: (data) => data.rates?.TWD
        },
        {
          name: 'Fixer.io (免費版)',
          url: 'https://api.fixer.io/latest?base=USD&symbols=TWD&access_key=YOUR_API_KEY', // 需要註冊免費 API key
          parser: (data) => data.rates?.TWD
        }
      ];
      
      for (const api of apis) {
        try {
          if (api.name === 'Fixer.io (免費版)' && api.url.includes('YOUR_API_KEY')) {
            continue; // 跳過未設定 API key 的
          }
          
          const response = UrlFetchApp.fetch(api.url, { muteHttpExceptions: true });
          
          if (response.getResponseCode() === 200) {
            const data = JSON.parse(response.getContentText());
            const rate = api.parser(data);
            
            if (rate && rate > 25 && rate < 40) {
              CacheService.set('USD_TWD_RATE', rate);
              return rate;
            }
          }
        } catch (error) {
          console.log(`⚠️ ${api.name} 失敗`);
        }
      }
      
      // 使用 Google Finance 獲取匯率
      try {
        const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
        sheet.getRange('Z1').setFormula('=GOOGLEFINANCE("CURRENCY:USDTWD")');
        SpreadsheetApp.flush();
        Utilities.sleep(300);
        
        const rate = sheet.getRange('Z1').getValue();
        sheet.getRange('Z1').clear();
        
        if (rate && rate > 25 && rate < 40) {
          console.log(`✅ Google Finance 匯率: ${rate}`);
          CacheService.set('USD_TWD_RATE', rate);
          return rate;
        }
      } catch (error) {
        console.log('⚠️ Google Finance 匯率失敗');
      }
      
      return 31.5;  // 預設匯率
      
    } catch (error) {
      console.error('❌ 匯率獲取失敗:', error);
      return 31.5;
    }
  }
};

// ====== 🕐 市場狀態工具 ======
const MarketUtil = {
  getStatus: function() {
    const now = new Date();
    const taipeiTime = new Date(now.toLocaleString("en-US", {timeZone: "Asia/Taipei"}));
    const nyTime = new Date(now.toLocaleString("en-US", {timeZone: "America/New_York"}));
    
    const taiwan = this.checkTaiwanMarket(taipeiTime);
    const us = this.checkUSMarket(nyTime);
    
    return {
      taiwan: taiwan,
      us: us,
      isAnyOpen: taiwan.isOpen || us.isOpen
    };
  },
  
  checkTaiwanMarket: function(time) {
    const day = time.getDay();
    const hour = time.getHours();
    const minute = time.getMinutes();
    const totalMinutes = hour * 60 + minute;
    
    const isWeekday = day >= 1 && day <= 5;
    const isOpen = isWeekday && totalMinutes >= 540 && totalMinutes <= 810; // 9:00-13:30
    
    return {
      isOpen: isOpen,
      display: isOpen ? '🟢 台股開市中' : 
               (!isWeekday ? '🔴 台股週末休市' :
                totalMinutes < 540 ? '🔴 台股尚未開市' : '🔴 台股已收市')
    };
  },
  
  checkUSMarket: function(time) {
    const day = time.getDay();
    const hour = time.getHours();
    const minute = time.getMinutes();
    const totalMinutes = hour * 60 + minute;
    
    const isWeekday = day >= 1 && day <= 5;
    const isOpen = isWeekday && totalMinutes >= 570 && totalMinutes <= 960; // 9:30-16:00
    
    return {
      isOpen: isOpen,
      display: isOpen ? '🟢 美股開市中' :
               (!isWeekday ? '🔴 美股週末休市' :
                totalMinutes < 570 ? '🔴 美股尚未開市' : '🔴 美股已收市')
    };
  }
};

// ====== 💾 緩存服務 ======
const CacheService = {
  get: function(key, maxAgeMinutes) {
    try {
      const cache = PropertiesService.getScriptProperties();
      const cached = cache.getProperty(key);
      
      if (!cached) return null;
      
      const data = JSON.parse(cached);
      const age = (Date.now() - data.timestamp) / 60000;
      
      if (age <= maxAgeMinutes) {
        return data.value;
      }
      
      cache.deleteProperty(key);
      return null;
      
    } catch (error) {
      console.error('緩存讀取錯誤:', error);
      return null;
    }
  },
  
  set: function(key, value) {
    try {
      const cache = PropertiesService.getScriptProperties();
      cache.setProperty(key, JSON.stringify({
        value: value,
        timestamp: Date.now()
      }));
    } catch (error) {
      console.error('緩存寫入錯誤:', error);
    }
  },
  
  clearAll: function() {
    try {
      const cache = PropertiesService.getScriptProperties();
      cache.deleteAllProperties();
      console.log('🧹 所有緩存已清除');
    } catch (error) {
      console.error('緩存清除錯誤:', error);
    }
  }
};