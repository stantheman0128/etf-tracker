// Intraday portfolio data types
// 使用短屬性名節省 Redis 空間（每個 snapshot ~90 bytes vs ~150 bytes）

/** 單支股票的盤中快照（compact） */
export interface IntradayStockSnapshot {
  s: string;   // symbol
  p: number;   // price（原始貨幣）
  v: number;   // valueTWD（四捨五入整數）
}

/** 單一時間點的投資組合快照 */
export interface IntradaySnapshot {
  t: number;   // Unix timestamp（秒）
  tv: number;  // totalValueTWD（四捨五入整數）
  tf: number;  // totalValueFixedRate（四捨五入整數）
  fx: number;  // exchangeRate
  st: IntradayStockSnapshot[];
}

/** 一天的盤中數據容器 */
export interface IntradayDayData {
  date: string;                         // YYYY-MM-DD
  source: 'collected' | 'backfill';     // collected = 5min cron, backfill = Yahoo hourly
  snapshots: IntradaySnapshot[];
}

/** 平滑曲線用的簡化數據點 */
export interface IntradayChartPoint {
  time: number;  // Unix timestamp（秒）
  value: number; // totalValueTWD
}
