// 分析問題日期 - 檢查是否是台積電資料缺失

const problemDates = ['2025-08-01', '2025-09-29', '2025-10-06', '2025-10-10', '2025-10-24'];

console.log('='.repeat(60));
console.log('🔍 問題日期分析 - 檢查是否為台灣假日');
console.log('='.repeat(60));
console.log('');

problemDates.forEach(dateStr => {
  const date = new Date(dateStr);
  const dayOfWeek = date.toLocaleDateString('zh-TW', { weekday: 'long' });
  const month = date.getMonth() + 1;
  const day = date.getDate();
  
  let holiday = '';
  
  // 檢查台灣假日
  if (month === 8 && day === 1) holiday = '(非假日，但可能是 Yahoo API 問題)';
  if (month === 9 && day === 29) holiday = '🌙 中秋節假期';
  if (month === 10 && day === 6) holiday = '(10月第一週，可能是連假)';
  if (month === 10 && day === 10) holiday = '🇹🇼 國慶日';
  if (month === 10 && day === 24) holiday = '(非假日)';
  
  console.log(`${dateStr} (${dayOfWeek}) ${holiday}`);
});

console.log('');
console.log('='.repeat(60));
console.log('📊 結論：');
console.log('這些日期可能是台股休市日，導致 2330 台積電沒有資料');
console.log('Yahoo Finance API 在這些日期沒有返回台積電價格');
console.log('但美股有資料，所以只計算了美股部分');
console.log('');
console.log('💡 解決方案：');
console.log('1. 如果某支股票當天沒資料，使用前一個交易日的價格');
console.log('2. 或直接跳過這些日期不顯示');
console.log('='.repeat(60));
