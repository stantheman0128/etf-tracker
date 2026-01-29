// 正確的數據結構應該是：

const correctData = [
  // 台股：只需要台幣
  { symbol: '2330', shares: 46, price: 967, currency: 'TWD', valueTWD: 44482 },
  
  // 美股：需要美金價值 + 台幣價值
  { symbol: 'AMZN', shares: 1, price: 205.01, currency: 'USD', valueUSD: 205.0, valueTWD: 6130 },
  { symbol: 'TSLA', shares: 3.51768, price: 346.46, currency: 'USD', valueUSD: 1218.7, valueTWD: 36440 },
  { symbol: 'TSM', shares: 7, price: 193.32, currency: 'USD', valueUSD: 1353.2, valueTWD: 40462 },
  { symbol: 'META', shares: 0.16161, price: 647.79, currency: 'USD', valueUSD: 104.7, valueTWD: 3130 },
  { symbol: 'NVDA', shares: 11, price: 135.13, currency: 'USD', valueUSD: 1486.4, valueTWD: 44444 },
  { symbol: 'BTC', shares: 0.008, price: 105915.2, currency: 'USD', valueUSD: 847.3, valueTWD: 25335 },
];

const exchangeRate = 29.9;

console.log('驗證計算邏輯：\n');

correctData.forEach(item => {
  console.log(`${item.symbol}:`);
  console.log(`  股數 × 價格 = ${item.shares} × ${item.price} = ${(item.shares * item.price).toFixed(2)} ${item.currency}`);
  
  if (item.currency === 'USD') {
    console.log(`  美金價值: $${item.valueUSD}`);
    console.log(`  × 匯率 ${exchangeRate} = NT$${item.valueTWD}`);
    console.log(`  驗證: ${item.valueUSD} × ${exchangeRate} = ${(item.valueUSD * exchangeRate).toFixed(0)}`);
  } else {
    console.log(`  台幣價值: NT$${item.valueTWD}`);
  }
  console.log('');
});

const totalTWD = correctData.reduce((sum, item) => sum + item.valueTWD, 0);
console.log(`總計: NT$${totalTWD.toLocaleString()}`);
