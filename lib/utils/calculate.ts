// 共用的持股價值計算函數

/**
 * 計算持股價值（USD 和 TWD）
 */
export function calculateValue(
  shares: number,
  price: number,
  currency: string,
  exchangeRate: number
) {
  if (currency === 'USD') {
    return {
      usd: shares * price,
      twd: shares * price * exchangeRate,
    };
  } else {
    return {
      usd: (shares * price) / exchangeRate,
      twd: shares * price,
    };
  }
}
