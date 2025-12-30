import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PORTFOLIO_CONFIG } from '@/lib/config';
import {
  getUSStockPrice,
  getTWStockPrice,
  getBTCPrice,
  getExchangeRate,
  getMarketStatus,
  type PriceData
} from '@/lib/api-client';
import { TrendingUp, TrendingDown, BarChart3, RefreshCw } from 'lucide-react';

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

export default async function Dashboard() {
  // 獲取匯率
  const exchangeRate = await getExchangeRate();

  // 獲取市場狀態
  const marketStatus = getMarketStatus();

  // 獲取所有持股價格
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

  // 計算總價值
  const totalValueTWD = holdingsWithPrices.reduce((sum, h) => sum + h.valueTWD, 0);
  const totalReturnTWD = totalValueTWD - PORTFOLIO_CONFIG.totalCostTWD;
  const returnRate = (totalReturnTWD / PORTFOLIO_CONFIG.totalCostTWD) * 100;

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
          <div className="flex flex-col gap-2 text-sm">
            <span className="px-3 py-1 rounded-full bg-gray-100 text-gray-700">
              {marketStatus.taiwan.display}
            </span>
            <span className="px-3 py-1 rounded-full bg-gray-100 text-gray-700">
              {marketStatus.us.display}
            </span>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {/* 總資產 */}
        <Card className="bg-white/95 backdrop-blur">
          <CardHeader>
            <CardTitle className="text-lg text-gray-600">💰 總資產價值</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              NT$ {Math.round(totalValueTWD).toLocaleString()}
            </div>
            <div className={`text-xl font-semibold mt-2 flex items-center gap-2 ${
              totalReturnTWD >= 0 ? 'text-green-600' : 'text-red-600'
            }`}>
              {totalReturnTWD >= 0 ? <TrendingUp size={24} /> : <TrendingDown size={24} />}
              {totalReturnTWD >= 0 ? '+' : ''}NT$ {Math.round(totalReturnTWD).toLocaleString()}
              <span className="text-base">
                ({returnRate >= 0 ? '+' : ''}{returnRate.toFixed(2)}%)
              </span>
            </div>
          </CardContent>
        </Card>

        {/* 美金匯率 */}
        <Card className="bg-white/95 backdrop-blur">
          <CardHeader>
            <CardTitle className="text-lg text-gray-600">💱 美金匯率</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold flex items-baseline gap-2">
              <span className="text-gray-400 text-lg">1 USD =</span>
              <span className="text-3xl">{exchangeRate.toFixed(2)}</span>
              <span className="text-gray-400 text-lg">TWD</span>
            </div>
          </CardContent>
        </Card>

        {/* 查看圖表 */}
        <Card className="bg-gradient-to-br from-[#667eea] to-[#764ba2] text-white cursor-pointer hover:scale-105 transition-transform">
          <Link href="/charts">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <BarChart3 size={24} />
                歷史曲線圖
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-white/80">
                查看 30 天價格走勢
              </p>
              <div className="text-right mt-4">
                <span className="text-2xl">→</span>
              </div>
            </CardContent>
          </Link>
        </Card>
      </div>

      {/* Holdings Table */}
      <Card className="bg-white/95 backdrop-blur">
        <CardHeader>
          <CardTitle className="text-xl">📈 持股明細</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b-2 border-gray-200">
                  <th className="text-left p-3 font-semibold">代號</th>
                  <th className="text-left p-3 font-semibold">名稱</th>
                  <th className="text-right p-3 font-semibold">股數</th>
                  <th className="text-right p-3 font-semibold">價格</th>
                  <th className="text-right p-3 font-semibold">漲跌</th>
                  <th className="text-right p-3 font-semibold">價值 (USD)</th>
                  <th className="text-right p-3 font-semibold">價值 (TWD)</th>
                </tr>
              </thead>
              <tbody>
                {holdingsWithPrices.map((holding) => {
                  const isPositive = holding.change >= 0;
                  const displayShares = holding.shares % 1 === 0
                    ? holding.shares.toLocaleString()
                    : holding.shares.toFixed(holding.symbol === 'BTC' ? 6 : 4);

                  return (
                    <tr key={holding.symbol} className="border-b hover:bg-gray-50">
                      <td className="p-3">
                        <span className="font-bold text-[#667eea]">{holding.symbol}</span>
                      </td>
                      <td className="p-3">{holding.name}</td>
                      <td className="p-3 text-right font-mono">{displayShares}</td>
                      <td className="p-3 text-right">
                        <span className={`px-3 py-1 rounded-lg font-bold font-mono ${
                          isPositive ? 'price-up' : 'price-down'
                        }`}>
                          {holding.currency === 'TWD'
                            ? `NT$ ${Math.round(holding.currentPrice).toLocaleString()}`
                            : `$ ${holding.currentPrice.toFixed(2)}`
                          }
                        </span>
                      </td>
                      <td className="p-3 text-right">
                        <span className={`font-semibold flex items-center justify-end gap-1 ${
                          isPositive ? 'text-green-600' : 'text-red-600'
                        }`}>
                          {isPositive ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
                          {isPositive ? '+' : ''}{holding.change.toFixed(2)}%
                        </span>
                      </td>
                      <td className="p-3 text-right font-mono font-semibold">
                        {holding.currency === 'USD'
                          ? `$ ${holding.valueUSD.toFixed(2)}`
                          : '-'
                        }
                      </td>
                      <td className="p-3 text-right font-mono font-semibold">
                        NT$ {Math.round(holding.valueTWD).toLocaleString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Footer */}
      <div className="mt-6 text-center text-white/80 text-sm">
        <p>© 2025 什錦雜貨鋪 ETF | Made with 🦔 by Stan Shih</p>
      </div>
    </div>
  );
}

// 重新驗證時間（秒）- 每 1 分鐘更新一次
export const revalidate = 60;
