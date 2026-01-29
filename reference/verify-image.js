// 驗證圖片中的數據
const holdings = [
  { symbol: '2330', valueTWD: 44482 },
  { symbol: 'AMZN', valueUSD: 205.0, valueTWD: 6130 },
  { symbol: 'TSLA', valueUSD: 1218.7, valueTWD: 36440 },
  { symbol: 'TSM', valueUSD: 1353.2, valueTWD: 40462 },
  { symbol: 'META', valueUSD: 104.7, valueTWD: 3130 },
  { symbol: 'NVDA', valueUSD: 1486.4, valueTWD: 44444 },
  { symbol: 'BTC', valueUSD: 847.3, valueTWD: 25335 },
];

console.log('📊 驗證圖片中的數據：\n');

let totalTWD = 0;
let totalUSD = 0;

holdings.forEach(h => {
  console.log(`${h.symbol}: ${h.valueTWD || h.valueUSD} ${h.valueTWD ? 'TWD' : 'USD'} → TWD ${h.valueTWD}`);
  totalTWD += h.valueTWD;
  if (h.valueUSD) totalUSD += h.valueUSD;
});

console.log('\n總計：');
console.log(`TWD: ${totalTWD.toLocaleString()}`);
console.log(`USD: ${totalUSD.toFixed(1)}`);
console.log('\n圖片顯示總額: 200423 TWD');
console.log(`差異: ${totalTWD - 200423} TWD`);
