const fs = require('fs');
const path = require('path');

const csvPath = path.join(__dirname, 'data', 'initial-holdings.csv');
const content = fs.readFileSync(csvPath, 'utf-8');
const lines = content.trim().split('\n');
const headers = lines[0].split(',');

console.log('='.repeat(80));
console.log('📊 CSV 檔案讀取測試');
console.log('='.repeat(80));
console.log('\n📁 檔案路徑:', csvPath);
console.log('📝 總行數:', lines.length, '(含標題)');
console.log('🏷️  欄位:', headers.join(' | '));

console.log('\n💼 持股資料:\n');

let totalTWD = 0;
let totalUSD = 0;

lines.slice(1).forEach((line, idx) => {
  const values = line.split(',');
  const holding = {};
  headers.forEach((h, i) => {
    holding[h.trim()] = values[i]?.trim() || '';
  });
  
  const valueTWD = parseFloat(holding.valueTWD) || 0;
  const valueUSD = parseFloat(holding.valueUSD) || 0;
  const exchangeRate = parseFloat(holding.exchangeRate) || 0;
  
  totalTWD += valueTWD;
  totalUSD += valueUSD;
  
  console.log(`[${idx + 1}] ${holding.name} (${holding.symbol})`);
  console.log(`    📅 日期: ${holding.date}`);
  console.log(`    📊 數量: ${holding.shares} 股`);
  console.log(`    💰 價格: ${holding.currency} ${holding.price}`);
  
  if (holding.currency === 'USD') {
    console.log(`    💵 美金價值: $${valueUSD}`);
    console.log(`    💱 匯率: ${exchangeRate}`);
    console.log(`    💴 台幣價值: NT$${valueTWD.toLocaleString()} (驗證: ${(valueUSD * exchangeRate).toFixed(0)})`);
  } else {
    console.log(`    💴 台幣價值: NT$${valueTWD.toLocaleString()}`);
  }
  console.log(`    🏦 交易所: ${holding.exchange}`);
  console.log('');
});

console.log('='.repeat(80));
console.log('📈 投資組合總價值:');
console.log(`    USD: $${totalUSD.toFixed(2)}`);
console.log(`    TWD: NT$${Math.round(totalTWD).toLocaleString()}`);
console.log('='.repeat(80));
