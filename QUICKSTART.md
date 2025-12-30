# ⚡ 快速啟動 - 3 步驟上線

## 📝 開始之前

確認你已經：
- ✅ 安裝了 Node.js (>= 18)
- ✅ 註冊了 Alpha Vantage API Key (免費)

---

## 🚀 Step 1: 設定環境變數

```bash
# 1. 複製範例檔案
cp .env.example .env.local

# 2. 用記事本或 VSCode 編輯 .env.local
# 填入你的 API Key:
ALPHA_VANTAGE_API_KEY=你的API金鑰
```

**獲取 Alpha Vantage API Key**:
1. 前往 https://www.alphavantage.co/support/#api-key
2. 填寫 Email
3. 立即收到免費 API Key (每天 500 次請求)

---

## 💼 Step 2: 設定投資組合

編輯 `lib/config.ts`：

```typescript
export const PORTFOLIO_CONFIG: PortfolioConfig = {
  holdings: [
    {
      symbol: '2330',        // ← 改成你的股票代號
      name: '台積電',         // ← 改成你的股票名稱
      shares: 46,            // ← 改成你的持股數量
      exchange: 'TPE',
      currency: 'TWD',
      market: 'TAIWAN'
    },
    // 繼續新增你的其他持股...
  ],
  totalCostTWD: 200000  // ← 改成你的總成本（台幣）
};
```

**支援的市場**:
- 台股: `exchange: 'TPE'`, `currency: 'TWD'`
- 美股 (NASDAQ): `exchange: 'NASDAQ'`, `currency: 'USD'`
- 美股 (NYSE): `exchange: 'NYSE'`, `currency: 'USD'`
- 比特幣: `symbol: 'BTC'`, `exchange: 'CRYPTO'`, `currency: 'USD'`

---

## 🎯 Step 3: 啟動專案

```bash
# 啟動開發伺服器
npm run dev
```

開啟瀏覽器訪問: **http://localhost:3000**

🎉 **完成！** 你應該能看到你的投資組合了！

---

## 📤 推送到 GitHub (選擇性)

### 建立 GitHub 儲存庫

1. 前往 https://github.com/new
2. 儲存庫名稱: `etf-tracker`
3. 設為 **Private** (保護隱私)
4. 不要初始化 README
5. 建立儲存庫

### 推送程式碼

```bash
# 設定遠端儲存庫 (替換成你的用戶名)
git remote add origin https://github.com/你的用戶名/etf-tracker.git

# 推送
git branch -M main
git push -u origin main
```

---

## ☁️ 部署到 Vercel (選擇性)

### 1. 連接 GitHub

1. 前往 https://vercel.com/login
2. 用 GitHub 登入
3. 點擊 "Import Project"
4. 選擇 `etf-tracker`

### 2. 設定環境變數

在 Vercel 部署頁面：
- 新增環境變數: `ALPHA_VANTAGE_API_KEY`
- 值: 貼上你的 API Key
- 環境: Production

### 3. 部署

點擊 "Deploy" → 等待 1-2 分鐘 → 完成！

---

## 🐛 遇到問題？

### 無法啟動？

```bash
# 重新安裝依賴
rm -rf node_modules package-lock.json
npm install
npm run dev
```

### API 錯誤？

- 檢查 `.env.local` 的 API Key 是否正確
- 確認沒有超過每日 500 次限制
- 查看終端機的錯誤訊息

### 圖表無法顯示？

- 確認網路連線正常
- 等待幾秒後重新整理
- 檢查瀏覽器 Console 的錯誤

---

## 📚 更多資訊

- **完整文件**: 查看 [README.md](./README.md)
- **詳細設定**: 查看 [SETUP.md](./SETUP.md)
- **問題回報**: 到 GitHub 提交 Issue

---

**享受追蹤投資組合的樂趣！** 🚀📈
