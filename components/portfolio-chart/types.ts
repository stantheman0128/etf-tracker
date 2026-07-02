export interface StockDetail {
  symbol: string;
  name: string;
  shares: number;
  price: number;
  valueTWD: number;
  currency: string;
  changePercent: number;
}

export interface DailyPortfolioDetail {
  date: string;
  totalValueTWD: number;
  totalValueFixedRate: number;
  exchangeRate: number;
  changePercent: number;
  stocks: StockDetail[];
}

// 即時數據介面（從 page.tsx 傳入）
export interface TodayData {
  date: string;
  exchangeRate: number;
  stocks: (StockDetail & { valueFixedRate: number })[];  // 包含固定匯率價值
}

export interface PortfolioChartProps {
  className?: string;
  marketStatus: {
    taiwan: { isOpen: boolean; display: string };
    us: { isOpen: boolean; display: string };
    isAnyOpen: boolean;
  };
  todayData?: TodayData;
}
