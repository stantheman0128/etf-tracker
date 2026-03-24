// 🦔 什錦雜貨鋪 ETF - 投資組合配置

// ============================================
// 環境設定
// ============================================
export const IS_DEV = process.env.NODE_ENV === 'development';
export const IS_PROD = process.env.NODE_ENV === 'production';
export const ENV_NAME = IS_DEV ? '🔧 Development' : '🚀 Production';
export const DEBUG = process.env.NEXT_PUBLIC_DEBUG === 'true';

// 開發模式 console log（Production 自動隱藏）
export const devLog = (...args: unknown[]) => {
  if (IS_DEV || DEBUG) {
    console.log('[DEV]', ...args);
  }
};

export interface Holding {
  symbol: string;
  name: string;
  shares: number;
  exchange: 'TPE' | 'NASDAQ' | 'NYSE' | 'CRYPTO';
  currency: 'TWD' | 'USD';
  market: 'TAIWAN' | 'US' | 'CRYPTO';
}

export interface PortfolioConfig {
  holdings: Holding[];
  totalCostTWD: number;
}

// 你的投資組合設定
export const PORTFOLIO_CONFIG: PortfolioConfig = {
  holdings: [
    {
      symbol: '2330',
      name: '台積電',
      shares: 46,
      exchange: 'TPE',
      currency: 'TWD',
      market: 'TAIWAN'
    },
    {
      symbol: 'AMZN',
      name: 'Amazon',
      shares: 1,
      exchange: 'NASDAQ',
      currency: 'USD',
      market: 'US'
    },
    {
      symbol: 'TSLA',
      name: 'Tesla',
      shares: 3.51768,
      exchange: 'NASDAQ',
      currency: 'USD',
      market: 'US'
    },
    {
      symbol: 'TSM',
      name: '台積電ADR',
      shares: 7,
      exchange: 'NYSE',
      currency: 'USD',
      market: 'US'
    },
    {
      symbol: 'META',
      name: 'Meta',
      shares: 0.16161,
      exchange: 'NASDAQ',
      currency: 'USD',
      market: 'US'
    },
    {
      symbol: 'NVDA',
      name: 'Nvidia',
      shares: 11,
      exchange: 'NASDAQ',
      currency: 'USD',
      market: 'US'
    },
    {
      symbol: 'BTC',
      name: 'Bitcoin',
      shares: 0.008,
      exchange: 'CRYPTO',
      currency: 'USD',
      market: 'CRYPTO'
    }
  ],
  totalCostTWD: 200000
};

// API 配置
export const API_CONFIG = {
  coinGecko: {
    baseUrl: 'https://api.coingecko.com/api/v3',
  },
  exchangeRate: {
    baseUrl: 'https://api.exchangerate-api.com/v4/latest',
  },
};
