import { PORTFOLIO_CONFIG } from '@/lib/config';
import {
  getUSStockPrice,
  getTWStockPrice,
  getBTCPrice,
  getExchangeRate,
  getMarketStatus,
  type PriceData
} from '@/lib/api-client';
import RefreshButton from '@/components/RefreshButton';
import PortfolioChart from '@/components/PortfolioChart';

// 計算持股價值
function calculateValue(shares: number, price: number, currency: string, exchangeRate: number) {
  if (currency === 'USD') {
    return {
      usd: shares * price,
      twd: shares * price * exchangeRate
    };
  } else {
    return {
      usd: (shares * price) / exchangeRate,
      twd: shares * price
    };
  }
}

// 計算固定匯率價值（用於排除匯率影響）
const FIXED_EXCHANGE_RATE = 29.9;  // 2025-05-30 的匯率
function calculateValueFixedRate(shares: number, price: number, currency: string) {
  if (currency === 'USD') {
    return Math.round(shares * price * FIXED_EXCHANGE_RATE);
  } else {
    return Math.round(shares * price);
  }
}

export default async function Dashboard() {
  // 獲取匯率
  const exchangeRate = await getExchangeRate();

  // 獲取市場狀態
  const marketStatus = getMarketStatus();

  // 獲取所有持股價格（使用 Yahoo Finance，無需延遲）
  const holdingsWithPrices = await Promise.all(
    PORTFOLIO_CONFIG.holdings.map(async (holding) => {
      let priceData: PriceData | null = null;

      // 根據市場選擇 API
      if (holding.market === 'TAIWAN') {
        priceData = await getTWStockPrice(holding.symbol);
      } else if (holding.market === 'CRYPTO') {
        priceData = await getBTCPrice();
      } else {
        priceData = await getUSStockPrice(holding.symbol);
      }

      // 如果無法獲取價格，使用預設值
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
        ...holding,
        currentPrice: priceData.price,
        change: priceData.changePercent,
        valueUSD: value.usd,
        valueTWD: value.twd,
      };
    })
  );

  return (
    <div className="container mx-auto p-4 md:p-6 max-w-7xl">
      {/* Header */}
      <div className="bg-white/95 backdrop-blur rounded-2xl shadow-xl p-6 mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-[#667eea] to-[#764ba2] bg-clip-text text-transparent flex items-center gap-2">
              🦔 什錦雜貨鋪 ETF
            </h1>
            <p className="text-sm text-gray-500 mt-2">
              最後更新: {new Date().toLocaleString('zh-TW')}
            </p>
          </div>
          <RefreshButton />
        </div>
      </div>

      {/* Portfolio Chart - 投資組合總覽（整合總資產 + 圖表 + 匯率 + 市場狀態） */}
      <PortfolioChart 
        className="mb-3" 
        marketStatus={marketStatus}
        todayData={{
          date: new Date().toISOString().split('T')[0],
          exchangeRate,
          stocks: holdingsWithPrices.map(h => ({
            symbol: h.symbol,
            name: h.name,
            shares: h.shares,
            price: h.currentPrice,
            valueTWD: h.valueTWD,
            valueFixedRate: calculateValueFixedRate(h.shares, h.currentPrice, h.currency),
            currency: h.currency,
            changePercent: h.change,
          })),
        }}
      />

      {/* Footer */}
      <footer className="mt-12 bg-white/10 backdrop-blur rounded-2xl p-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-6">
          {/* 關於 */}
          <div>
            <h3 className="text-lg font-semibold text-white mb-3">關於什錦雜貨鋪 ETF</h3>
            <p className="text-white/70 text-sm leading-relaxed">
              個人投資組合追蹤工具，結合台股、美股和加密貨幣的即時數據。
              使用 Next.js 14 + Yahoo Finance API，完全免費且開源。
            </p>
            <p className="text-white/60 text-xs mt-2">
              ⚡ 頁面每分鐘自動更新 | 💯 完全免費無需 API Key
            </p>
          </div>

          {/* 聯繫方式 */}
          <div>
            <h3 className="text-lg font-semibold text-white mb-3">聯繫我</h3>
            <div className="flex flex-col gap-2">
              <a href="mailto:stan@stan-shih.com" className="text-white/70 hover:text-white transition-colors text-sm flex items-center gap-2">
                <span>📧</span> stan@stan-shih.com
              </a>
              <a href="https://www.dcard.tw/@stantheman" target="_blank" rel="noopener noreferrer" className="text-white/70 hover:text-white transition-colors text-sm flex items-center gap-2">
                <span>🦔</span> Dcard: @stantheman
              </a>
              <a href="https://www.instagram.com/shijin.store/" target="_blank" rel="noopener noreferrer" className="text-white/70 hover:text-white transition-colors text-sm flex items-center gap-2">
                <span>📷</span> Instagram: @shijin.store
              </a>
              <a href="https://www.threads.net/@shijin.store" target="_blank" rel="noopener noreferrer" className="text-white/70 hover:text-white transition-colors text-sm flex items-center gap-2">
                <span>🧵</span> Threads: @shijin.store
              </a>
            </div>
          </div>

          {/* 技術棧 */}
          <div>
            <h3 className="text-lg font-semibold text-white mb-3">技術棧</h3>
            <div className="flex flex-col gap-2 text-sm text-white/70">
              <div>⚡ Next.js 14 + React 19</div>
              <div>🎨 Tailwind CSS + shadcn/ui</div>
              <div>📊 Yahoo Finance API</div>
              <div>🪙 Kraken / Coinbase API</div>
              <div>📈 TradingView Charts</div>
            </div>
          </div>
        </div>

        {/* 底部版權 */}
        <div className="pt-6 border-t border-white/10 text-center text-white/60 text-sm">
          <p>© 2025 什錦雜貨鋪 ETF | Made with 🦔 by Stan Shih</p>
          <p className="text-xs mt-2 text-white/40">
            Open Source • MIT License • Powered by Yahoo Finance
          </p>
        </div>
      </footer>
    </div>
  );
}

// 重新驗證時間（秒）- 每 1 分鐘更新一次
export const revalidate = 60;
