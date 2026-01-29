const fs = require('fs');
const path = require('path');

const csvPath = 'c:\\Users\\stans\\OneDrive - gapps.ntnu.edu.tw\\桌面\\coding\\etf\\Stan ETF - 5_30.csv';
const content = fs.readFileSync(csvPath, 'utf-8');
const lines = content.trim().split('\n');

console.log('='.repeat(80));
console.log('📊 Stan ETF - 5/30 CSV 檔案讀取測試');
console.log('='.repeat(80));
console.log('\n📁 檔案路徑:', csvPath);
console.log('📝 總行數:', lines.length);

console.log('\n🏷️  原始標題行:');
console.log(lines[0]);

console.log('\n💼 持股資料:\n');

let totalUSD = 0;
let totalTWD = 0;

// 從第2行開始讀取 (跳過標題)
lines.slice(1).forEach((line, idx) => {
  if (!line.trim() || line.includes('總額:')) return;
  
  const parts = line.split(',');
  
  // 解析欄位
  const category = parts[0]?.trim() || '';
  const symbol = parts[1]?.trim() || '';
  const shares = parts[2]?.trim() || '';
  const price = parts[3]?.trim() || '';
  const valueUSD = parts[4]?.trim() || '';
  const valueTWD = parts[5]?.trim() || '';
  
  // 跳過分類標題行
  if (symbol && !symbol.includes('美金') && !symbol.includes('持股')) {
    console.log(`[${idx}] ${symbol}`);
    console.log(`    📊 數量: ${shares} 股`);
    console.log(`    💰 5/30 價格: $${price}`);
    console.log(`    💵 總價 (美金): $${valueUSD}`);
    console.log(`    💴 總價 (台幣): NT$${valueTWD}`);
    console.log(`    📂 類別: ${category || '(續上)'}`);
    console.log('');
    
    if (valueUSD && !isNaN(parseFloat(valueUSD))) {
      totalUSD += parseFloat(valueUSD);
    }
    if (valueTWD && !isNaN(parseFloat(valueTWD))) {
      totalTWD += parseFloat(valueTWD);
    }
  } else if (category.includes('持股') || category.includes('比特幣')) {
    console.log(`\n📌 ${category}`);
    if (symbol.includes('美金')) {
      console.log(`   匯率: 1 USD = ${symbol.replace('美金', '')} TWD`);
    }
  }
});

console.log('='.repeat(80));
console.log('📈 投資組合總價值:');
console.log(`    USD: $${totalUSD.toFixed(2)}`);
console.log(`    TWD: NT$${Math.round(totalTWD).toLocaleString()}`);
console.log('='.repeat(80));
