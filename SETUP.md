# 🚀 完整設定與部署指南

## 📋 前置準備

### 1. 確認已安裝

```bash
# 檢查 Node.js 版本 (需要 >= 18)
node --version

# 檢查 npm 版本
npm --version

# 檢查 git 版本
git --version
```

### 2. 註冊免費服務

- [ ] **Alpha Vantage API Key**: https://www.alphavantage.co/support/#api-key
- [ ] **GitHub 帳號**: https://github.com/signup
- [ ] **Vercel 帳號**: https://vercel.com/signup

---

## 🔧 本地開發設定

### Step 1: 安裝依賴

```bash
cd etf-tracker
npm install
```

### Step 2: 建立環境變數

```bash
# 複製範例檔案
cp .env.example .env.local

# 編輯 .env.local
# 填入你的 ALPHA_VANTAGE_API_KEY
```

### Step 3: 修改投資組合

編輯 `lib/config.ts`，設定你的持股。

### Step 4: 啟動開發伺服器

```bash
npm run dev
```

訪問 http://localhost:3000

---

## 📂 推送到 GitHub

### Step 1: 初始化 Git

```bash
cd etf-tracker
git init
git add .
git commit -m "🎉 Initial commit: ETF Portfolio Tracker"
```

### Step 2: 建立 GitHub 儲存庫

1. 前往 https://github.com/new
2. 儲存庫名稱: `etf-tracker`
3. 設定為 **Private** (隱私，因為包含你的持股資訊)
4. **不要**初始化 README, .gitignore (我們已經有了)
5. 點擊 "Create repository"

### Step 3: 連結並推送

GitHub 會顯示指令，複製並執行：

```bash
# 設定遠端儲存庫 (替換成你的 GitHub 用戶名)
git remote add origin https://github.com/你的用戶名/etf-tracker.git

# 重新命名分支為 main
git branch -M main

# 推送到 GitHub
git push -u origin main
```

---

## ☁️ 部署到 Vercel

### 方法 1: 透過 Vercel Dashboard (推薦)

1. **登入 Vercel**
   - 前往 https://vercel.com/login
   - 使用 GitHub 帳號登入

2. **匯入專案**
   - 點擊 "Add New" → "Project"
   - 選擇你的 GitHub 儲存庫 `etf-tracker`
   - 點擊 "Import"

3. **設定環境變數**
   - 在 "Environment Variables" 區塊
   - 新增: `ALPHA_VANTAGE_API_KEY` = 你的 API Key
   - 選擇 "Production"

4. **部署**
   - 點擊 "Deploy"
   - 等待 1-2 分鐘
   - 完成！你會得到一個 `https://xxx.vercel.app` 網址

### 方法 2: 透過 CLI

```bash
# 安裝 Vercel CLI
npm install -g vercel

# 登入
vercel login

# 部署
vercel

# 設定環境變數 (生產環境)
vercel env add ALPHA_VANTAGE_API_KEY production

# 重新部署
vercel --prod
```

---

## 🌐 自訂網域 (選擇性)

如果你有自己的網域 (例如: `etf.stan-shih.com`)：

### 在 Vercel 設定

1. 前往你的專案 → Settings → Domains
2. 輸入你的網域
3. 依照指示設定 DNS

### 在 Cloudflare 設定 DNS

1. 登入 Cloudflare Dashboard
2. 選擇你的網域
3. DNS → Add record
   - Type: `CNAME`
   - Name: `etf` (或你想要的子網域)
   - Target: `cname.vercel-dns.com`
   - Proxy status: DNS only (灰色雲朵)
4. 回到 Vercel，點擊 "Verify"

---

## 🔄 日常開發流程

### 修改程式碼

```bash
# 1. 修改檔案
# 2. 測試
npm run dev

# 3. 提交變更
git add .
git commit -m "✨ 新增功能: XXX"

# 4. 推送到 GitHub
git push

# 5. Vercel 會自動部署！
```

### 查看部署狀態

- 前往 https://vercel.com/dashboard
- 點擊你的專案
- 查看 "Deployments" 頁面

---

## 🐛 常見問題

### Q: API 回傳錯誤？

**A:** 檢查以下事項：
1. `.env.local` 中的 API Key 是否正確
2. Alpha Vantage 免費方案限制：500 次/天
3. 查看瀏覽器 Console 的錯誤訊息

### Q: 圖表無法顯示？

**A:**
1. 確認網路連線正常
2. 檢查 Alpha Vantage API 配額是否用完
3. 等待幾分鐘後重新整理

### Q: Vercel 部署失敗？

**A:**
1. 檢查環境變數是否設定
2. 查看 Vercel 的部署日誌
3. 確認 `package.json` 的依賴沒有錯誤

### Q: 價格不即時？

**A:**
- Next.js 預設快取 60 秒
- 修改 `app/page.tsx` 的 `revalidate` 值
- 或使用「強制重新整理」(Ctrl+Shift+R)

---

## 📊 效能優化

### 減少 API 呼叫

```typescript
// lib/config.ts
export const CACHE_CONFIG = {
  prices: {
    revalidate: 300,  // 5 分鐘快取 (減少 API 呼叫)
  },
};
```

### 啟用圖片最佳化

如果之後要新增圖片：

```javascript
// next.config.js
module.exports = {
  images: {
    domains: ['your-image-cdn.com'],
  },
}
```

---

## 🔐 安全建議

1. **不要提交 `.env.local`**
   - 已在 `.gitignore` 中排除
   - 絕對不要把 API Key 推送到 GitHub

2. **GitHub 儲存庫設為 Private**
   - 避免暴露你的持股資訊

3. **定期更新依賴**
   ```bash
   npm update
   npm audit fix
   ```

4. **使用環境變數**
   - 所有敏感資訊都放在 `.env.local`
   - Vercel 部署時在後台設定

---

## 📈 未來擴展方向

當你準備好升級時，可以考慮：

- [ ] 加入資料庫 (Supabase)
- [ ] 支援多用戶
- [ ] 加入回測功能
- [ ] 自動寄送每日報表
- [ ] 價格警報通知
- [ ] 行動 App (React Native)

---

## 💡 有問題？

- 查看 [README.md](./README.md)
- 提交 Issue 到 GitHub
- 或寄信給我: stan@stan-shih.com

祝開發順利！🚀
