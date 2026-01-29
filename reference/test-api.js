// 測試初始值功能
console.log('等待 5 秒讓伺服器啟動...\n');

setTimeout(async () => {
  try {
    const response = await fetch('http://localhost:3000/api/portfolio-history?days=365&refresh=true');
    const data = await response.json();
    
    console.log('='.repeat(80));
    console.log('📊 Portfolio History API 測試');
    console.log('='.repeat(80));
    console.log(`\n總共 ${data.length} 天的資料\n`);
    
    // 顯示前10筆資料
    console.log('前 10 天資料：');
    console.log('日期         | 價值 (TWD)');
    console.log('-'.repeat(40));
    data.slice(0, 10).forEach(item => {
      const highlight = item.date === '2025-05-30' ? ' 🔥 (CSV初始值)' : '';
      console.log(`${item.date} | NT$ ${item.close.toLocaleString()}${highlight}`);
    });
    
    // 檢查第一天是否是 200,423
    const firstDay = data[0];
    console.log('\n' + '='.repeat(80));
    if (firstDay && firstDay.date === '2025-05-30' && firstDay.close === 200423) {
      console.log('✅ 成功！第一天使用 CSV 初始值：NT$ 200,423');
    } else if (firstDay) {
      console.log(`❌ 錯誤！第一天 (${firstDay.date}): NT$ ${firstDay.close.toLocaleString()}`);
      console.log('   預期：2025-05-30, NT$ 200,423');
    }
    console.log('='.repeat(80));
    
  } catch (error) {
    console.error('❌ 測試失敗:', error.message);
  }
}, 5000);
