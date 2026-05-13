/**
 * Momentum strategy types and config.
 *
 * Two strategy instances:
 *   - "us-top3": TOP 3 by 12M Momentum across US mega-caps
 *   - "tw-top3": TOP 3 by 12M Momentum across TW large-caps
 *
 * NAV is a normalized index (starts at 100).
 * starting_capital_ntd stored for display purposes only.
 */

export type StrategyId = 'us-top3' | 'tw-top3';
export type Market = 'US' | 'TW';

export interface PoolStock {
  ticker: string;       // display id (e.g., "NVDA", "2330")
  yahooSym: string;     // Yahoo Finance symbol (e.g., "NVDA", "2330.TW")
  name: string;         // human-readable name
}

export interface StrategyConfig {
  id: StrategyId;
  label: string;
  market: Market;
  currency: 'USD' | 'TWD';
  benchmarkYahooSym: string;
  benchmarkLabel: string;
  pool: PoolStock[];
  startingCapitalNtd: number;
}

export interface Holding {
  ticker: string;
  shares: number;
  weight: number;             // target weight at last rebalance
  entryDate: string;          // YYYY-MM-DD
  entryPrice: number;         // native currency
}

export interface NavSnapshot {
  date: string;               // YYYY-MM-DD
  nav: number;                // strategy NAV (rebased to 100 at start)
  benchmarkNav: number;       // benchmark NAV (rebased to 100 at start)
}

export interface RebalanceEvent {
  date: string;
  preNav: number;
  sold: string[];             // tickers exiting
  bought: string[];           // tickers entering
  newHoldings: { ticker: string; weight: number; entryPrice: number }[];
}

export interface StrategyState {
  id: StrategyId;
  startDate: string;
  startingCapitalNtd: number;
  holdings: Holding[];
  navHistory: NavSnapshot[];
  rebalances: RebalanceEvent[];
  benchmarkBasePrice: number; // benchmark price on start date, for rebasing
  lastUpdate: string;
}

export interface MomentumScore {
  ticker: string;
  currentPrice: number;
  pastPrice: number;
  momentum: number;           // (current / past) - 1
}

// ──────────────────────────────────────────────────────────
// Strategy configurations
// ──────────────────────────────────────────────────────────
const US_POOL: PoolStock[] = [
  { ticker: 'AAPL',  yahooSym: 'AAPL',  name: 'Apple' },
  { ticker: 'MSFT',  yahooSym: 'MSFT',  name: 'Microsoft' },
  { ticker: 'NVDA',  yahooSym: 'NVDA',  name: 'NVIDIA' },
  { ticker: 'GOOGL', yahooSym: 'GOOGL', name: 'Alphabet' },
  { ticker: 'AMZN',  yahooSym: 'AMZN',  name: 'Amazon' },
  { ticker: 'META',  yahooSym: 'META',  name: 'Meta' },
  { ticker: 'TSLA',  yahooSym: 'TSLA',  name: 'Tesla' },
  { ticker: 'AVGO',  yahooSym: 'AVGO',  name: 'Broadcom' },
  { ticker: 'BRK-B', yahooSym: 'BRK-B', name: 'Berkshire B' },
  { ticker: 'JPM',   yahooSym: 'JPM',   name: 'JPMorgan' },
  { ticker: 'V',     yahooSym: 'V',     name: 'Visa' },
  { ticker: 'LLY',   yahooSym: 'LLY',   name: 'Eli Lilly' },
  { ticker: 'WMT',   yahooSym: 'WMT',   name: 'Walmart' },
  { ticker: 'XOM',   yahooSym: 'XOM',   name: 'Exxon Mobil' },
  { ticker: 'UNH',   yahooSym: 'UNH',   name: 'UnitedHealth' },
  { ticker: 'MA',    yahooSym: 'MA',    name: 'Mastercard' },
  { ticker: 'JNJ',   yahooSym: 'JNJ',   name: 'Johnson & Johnson' },
  { ticker: 'HD',    yahooSym: 'HD',    name: 'Home Depot' },
  { ticker: 'ORCL',  yahooSym: 'ORCL',  name: 'Oracle' },
  { ticker: 'COST',  yahooSym: 'COST',  name: 'Costco' },
  { ticker: 'PG',    yahooSym: 'PG',    name: 'Procter & Gamble' },
];

const TW_POOL: PoolStock[] = [
  { ticker: '2330', yahooSym: '2330.TW', name: '台積電' },
  { ticker: '2317', yahooSym: '2317.TW', name: '鴻海' },
  { ticker: '2454', yahooSym: '2454.TW', name: '聯發科' },
  { ticker: '2308', yahooSym: '2308.TW', name: '台達電' },
  { ticker: '2382', yahooSym: '2382.TW', name: '廣達' },
  { ticker: '2412', yahooSym: '2412.TW', name: '中華電' },
  { ticker: '2882', yahooSym: '2882.TW', name: '國泰金' },
  { ticker: '2881', yahooSym: '2881.TW', name: '富邦金' },
  { ticker: '2891', yahooSym: '2891.TW', name: '中信金' },
  { ticker: '2884', yahooSym: '2884.TW', name: '玉山金' },
  { ticker: '3008', yahooSym: '3008.TW', name: '大立光' },
  { ticker: '1216', yahooSym: '1216.TW', name: '統一' },
  { ticker: '3711', yahooSym: '3711.TW', name: '日月光投控' },
  { ticker: '1301', yahooSym: '1301.TW', name: '台塑' },
  { ticker: '2603', yahooSym: '2603.TW', name: '長榮' },
  { ticker: '2912', yahooSym: '2912.TW', name: '統一超' },
];

export const STRATEGIES: Record<StrategyId, StrategyConfig> = {
  'us-top3': {
    id: 'us-top3',
    label: 'US TOP 3 by 12M Momentum',
    market: 'US',
    currency: 'USD',
    benchmarkYahooSym: 'SPY',
    benchmarkLabel: 'SPY',
    pool: US_POOL,
    startingCapitalNtd: 100000,
  },
  'tw-top3': {
    id: 'tw-top3',
    label: 'TW TOP 3 by 12M Momentum',
    market: 'TW',
    currency: 'TWD',
    benchmarkYahooSym: '0050.TW',
    benchmarkLabel: '0050',
    pool: TW_POOL,
    startingCapitalNtd: 100000,
  },
};

export const PARAMS = {
  n: 3,
  lookbackTradingDays: 252,   // 12 months
} as const;
