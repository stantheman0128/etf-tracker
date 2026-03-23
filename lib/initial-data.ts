/**
 * 初始持股資料讀取工具
 * 
 * 讀取 data/initial-holdings.csv 作為投資組合的起始狀態
 */

import fs from 'fs';
import path from 'path';
import { devLog } from './config';

export interface InitialHolding {
  date: string;
  symbol: string;
  name: string;
  shares: number;
  exchange: string;
  currency: string;
  price: number;
  valueUSD: number;  // 美金價值（美股/加密貨幣）
  valueTWD: number;  // 台幣價值（換算後）
  exchangeRate: number;  // 當天匯率
}

export interface InitialPortfolioData {
  date: string;
  holdings: InitialHolding[];
  totalValueTWD: number;
  totalValueUSD: number;
}

const CSV_PATH = path.join(process.cwd(), 'data', 'initial-holdings.csv');

// 初始匯率（2025-05-30 實際值）— 也用於固定匯率報酬率計算
export const INITIAL_EXCHANGE_RATE = 29.9;

// Module-level cache：避免每次呼叫都重新讀取和解析 CSV
let _cachedData: InitialPortfolioData | null | undefined = undefined;

/**
 * 解析 CSV 內容
 */
function parseCSV(content: string): InitialHolding[] {
  const lines = content.trim().replace(/\r\n/g, '\n').split('\n');
  const headers = lines[0].split(',').map(h => h.trim());

  return lines.slice(1).map(line => {
    const values = line.split(',');
    const row: Record<string, string> = {};
    headers.forEach((header, index) => {
      row[header.trim()] = values[index]?.trim() || '';
    });

    return {
      date: row.date,
      symbol: row.symbol,
      name: row.name,
      shares: parseFloat(row.shares) || 0,
      exchange: row.exchange,
      currency: row.currency,
      price: parseFloat(row.price) || 0,
      valueUSD: parseFloat(row.valueUSD) || 0,
      valueTWD: parseFloat(row.valueTWD) || 0,
      exchangeRate: parseFloat(row.exchangeRate) || 0,
    };
  });
}

/**
 * 讀取初始持股資料
 */
export function getInitialHoldings(): InitialPortfolioData | null {
  // 使用 module-level cache，避免重複讀取
  if (_cachedData !== undefined) return _cachedData;

  try {
    if (!fs.existsSync(CSV_PATH)) {
      devLog('⚠️ Initial holdings CSV not found:', CSV_PATH);
      return null;
    }

    const content = fs.readFileSync(CSV_PATH, 'utf-8');
    const holdings = parseCSV(content);

    if (holdings.length === 0) {
      devLog('⚠️ No holdings found in CSV');
      return null;
    }

    // 計算總價值（直接使用 CSV 中的台幣價值）
    let totalValueTWD = 0;

    holdings.forEach(holding => {
      totalValueTWD += holding.valueTWD;
    });

    const result: InitialPortfolioData = {
      date: holdings[0].date,
      holdings,
      totalValueTWD: Math.round(totalValueTWD),
      totalValueUSD: 0, // 不再計算 USD，因為我們直接使用 TWD
    };

    devLog('📊 Initial holdings loaded:', {
      date: result.date,
      count: holdings.length,
      totalValueTWD: result.totalValueTWD,
    });

    _cachedData = result;
    return result;
  } catch (error) {
    devLog('❌ Error reading initial holdings:', error);
    _cachedData = null;
    return null;
  }
}

/**
 * 取得投資組合起始日期
 */
export function getPortfolioStartDate(): string {
  const data = getInitialHoldings();
  return data?.date || '2025-05-30';
}

/**
 * 取得初始總價值（TWD）
 */
export function getInitialTotalValueTWD(): number {
  const data = getInitialHoldings();
  return data?.totalValueTWD || 0;
}
