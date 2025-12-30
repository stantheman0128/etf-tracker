# 📁 參考資料

這個資料夾包含了原始的 Google Apps Script 版本，作為參考與對比。

## 原始版本檔案

### [old-version/codev2.gs](old-version/codev2.gs)
- **類型**: Google Apps Script 後端程式碼
- **功能**:
  - 投資組合資料處理
  - 透過 Google Sheets 的 GOOGLEFINANCE() 函數獲取價格
  - 使用多個 API 獲取 BTC 價格與匯率
  - PropertiesService 快取機制
- **問題**:
  - 依賴 Google Sheets，速度慢 (3-5 秒)
  - 無法支援多用戶
  - 資料儲存限制 (500KB)

### [old-version/indexv8.html](old-version/indexv8.html)
- **類型**: Google Apps Script HTML 前端
- **功能**:
  - 顯示投資組合儀表板
  - 即時價格與報酬率
  - 浮動按鈕（重新整理、強制更新）
- **問題**:
  - 沒有手機優化
  - 無歷史曲線圖
  - 依賴 Google Apps Script 環境

---

## 新版本改進

### 架構改變

| 項目 | 舊版 (GAS) | 新版 (Next.js) |
|------|-----------|---------------|
| **後端** | Google Apps Script | Next.js API Routes |
| **資料來源** | GOOGLEFINANCE() + Sheets | 直接呼叫 API |
| **前端** | HTML + Vanilla JS | React + TypeScript |
| **部署** | Google Apps Script | Vercel / Zeabur |
| **速度** | 3-5 秒 | < 1 秒 |
| **擴展性** | 單用戶 | 可擴展多用戶 |

### 功能增強

- ✅ 歷史曲線圖 (TradingView Charts)
- ✅ 響應式設計 (手機完美支援)
- ✅ 更快的載入速度
- ✅ 模組化程式碼架構
- ✅ TypeScript 型別安全
- ✅ 可擴展資料庫支援

### API 改進

| 資料類型 | 舊版 | 新版 |
|---------|------|------|
| **美股** | Google Finance (Sheets) | Alpha Vantage API |
| **台股** | Google Finance (Sheets) | Yahoo Finance API |
| **BTC** | 多個 API + GBTC 估算 | CoinGecko API |
| **匯率** | ExchangeRate-API | ExchangeRate-API |

---

## 為什麼重構？

### 1. 效能瓶頸
```javascript
// 舊版：每次都要寫入 Sheets
sheet.getRange('Z1').setFormula('=GOOGLEFINANCE(...)');
SpreadsheetApp.flush();
Utilities.sleep(500);  // ← 浪費時間
const price = sheet.getRange('Z1').getValue();
```

```typescript
// 新版：直接呼叫 API
const response = await fetch(apiUrl);
const data = await response.json();
return data.price;  // ← 快 10 倍
```

### 2. 無法擴展
- GAS PropertiesService: 500KB 限制
- 無法儲存歷史資料
- 無法支援多用戶

### 3. 開發體驗
- 舊版：Google Apps Script 編輯器，無 IDE 支援
- 新版：VSCode + TypeScript + 自動完成

---

## 遷移筆記

如果你想要從舊版遷移：

1. **投資組合設定**
   - 舊版: `codev2.gs` 的 `PORTFOLIO_CONFIG`
   - 新版: `lib/config.ts` 的 `PORTFOLIO_CONFIG`
   - 格式完全相同，直接複製貼上即可

2. **API Key**
   - 舊版: 寫在程式碼裡
   - 新版: 使用 `.env.local` 環境變數

3. **部署**
   - 舊版: 發佈為 Web App
   - 新版: GitHub + Vercel/Zeabur 自動部署

---

## 保留原始碼的原因

1. **參考對比** - 了解架構演進
2. **功能檢查** - 確保沒有遺漏功能
3. **學習資源** - 理解兩種架構的差異
4. **備份** - 萬一需要回退

---

最後更新: 2025-12-30
