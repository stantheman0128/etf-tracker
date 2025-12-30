# 🚀 Zeabur 部署指南

完整的 Zeabur 部署教學，讓你的 ETF Tracker 快速上線！

---

## 📋 前置準備

- ✅ 已註冊 [Zeabur 帳號](https://zeabur.com)
- ✅ 已推送程式碼到 GitHub
- ✅ 已取得 Alpha Vantage API Key

---

## 🎯 部署步驟

### Step 1: 登入 Zeabur

1. 前往 https://zeabur.com
2. 點擊右上角 "Login"
3. 使用 GitHub 帳號登入

### Step 2: 建立新專案

1. 點擊 Dashboard 的 "Create Project"
2. 輸入專案名稱: `etf-tracker`
3. 選擇區域:
   - **推薦**: `Hong Kong` (香港) - 離台灣最近
   - 或 `Singapore` (新加坡)
   - 或 `Tokyo` (東京)
4. 點擊 "Create"

### Step 3: 新增服務

1. 在專案頁面點擊 "Add Service"
2. 選擇 "Git"
3. 選擇你的 GitHub 儲存庫 `etf-tracker`
4. Zeabur 會自動偵測為 Next.js 專案

### Step 4: 設定環境變數

在服務設定頁面：

1. 找到 "Environment Variables" 區塊
2. 點擊 "Add Variable"
3. 新增以下變數：

```env
ALPHA_VANTAGE_API_KEY=你的API金鑰
NEXT_PUBLIC_APP_URL=https://你的網域.zeabur.app
```

4. 點擊 "Save"

### Step 5: 部署

1. Zeabur 會自動開始部署
2. 等待 2-3 分鐘
3. 部署完成後，點擊 "Public Domain" 旁的連結
4. 完成！🎉

---

## 🌐 設定自訂網域

### 使用 Zeabur 提供的網域 (免費)

1. 在服務頁面點擊 "Domain"
2. 點擊 "Generate Domain"
3. Zeabur 會提供一個 `xxx.zeabur.app` 網域
4. 立即可用！

### 使用自己的網域

#### 在 Zeabur 設定

1. 在服務頁面點擊 "Domain"
2. 點擊 "Add Custom Domain"
3. 輸入你的網域，例如: `etf.stan-shih.com`
4. 記下 Zeabur 提供的 CNAME 目標

#### 在 Cloudflare 設定 DNS

1. 登入 Cloudflare Dashboard
2. 選擇你的網域
3. 點擊 "DNS" → "Add record"
4. 設定：
   - Type: `CNAME`
   - Name: `etf` (或你想要的子網域)
   - Target: Zeabur 提供的 CNAME (例如: `xxx.zeabur.app`)
   - Proxy status: **DNS only** (灰色雲朵)
5. 點擊 "Save"
6. 回到 Zeabur，等待驗證完成（通常 1-5 分鐘）

---

## 🔄 自動部署

### 設定完成後

每次你推送程式碼到 GitHub：

```bash
git add .
git commit -m "更新功能"
git push
```

Zeabur 會自動：
1. 偵測到 GitHub 更新
2. 自動建置專案
3. 自動部署到線上
4. 完成！

---

## 📊 監控與日誌

### 查看建置日誌

1. 點擊服務名稱
2. 選擇 "Logs" 分頁
3. 查看即時建置與運行日誌

### 查看資源使用

1. 在服務頁面可以看到：
   - CPU 使用率
   - 記憶體使用量
   - 網路流量

---

## 💰 費用說明

### 免費方案

Zeabur 提供免費方案：
- ✅ **$5 USD 免費額度/月**
- ✅ 無限專案
- ✅ 自訂網域
- ✅ SSL 憑證
- ✅ 自動部署

### 費用計算

這個專案預估費用（每月）：
- **靜態流量**: 幾乎免費 (< $0.1)
- **運算時間**: 非常少 (< $1)
- **總計**: **約 $0-2 USD/月**

> 💡 **結論**: 免費額度完全夠用！

---

## 🔧 進階設定

### 調整建置設定

如果需要自訂建置指令，編輯 `zbpack.json`：

```json
{
  "$schema": "https://zeabur.com/schema/zbpack.json",
  "build_command": "npm run build",
  "start_command": "npm run start",
  "install_command": "npm install"
}
```

### 設定 Node.js 版本

在 `package.json` 加入：

```json
{
  "engines": {
    "node": ">=18.0.0"
  }
}
```

### 啟用快取

Zeabur 預設會快取 `node_modules`，加快建置速度。

---

## 🐛 常見問題

### Q: 部署失敗？

**A:** 檢查以下事項：
1. **查看建置日誌** - 找出錯誤訊息
2. **環境變數** - 確認 `ALPHA_VANTAGE_API_KEY` 已設定
3. **依賴套件** - 執行 `npm install` 確認本地可正常建置
4. **Node 版本** - 確認使用 Node.js >= 18

### Q: 網站很慢？

**A:**
1. **選擇正確區域** - 香港、新加坡、東京離台灣最近
2. **檢查 API 配額** - Alpha Vantage 可能已超過每日限制
3. **查看快取設定** - 確認 Next.js 的 `revalidate` 設定

### Q: 自訂網域無法使用？

**A:**
1. **DNS 傳播時間** - 等待 5-30 分鐘
2. **CNAME 設定** - 確認 Cloudflare 的 Proxy 設為 DNS only
3. **SSL 憑證** - Zeabur 會自動配置，可能需要幾分鐘

### Q: 如何查看錯誤？

**A:**
1. 前往 Zeabur Dashboard
2. 點擊你的服務
3. 查看 "Logs" 分頁
4. 或在網站上按 F12 查看瀏覽器 Console

---

## 🔄 更新程式碼流程

### 日常開發

```bash
# 1. 修改程式碼
# 2. 本地測試
npm run dev

# 3. 提交變更
git add .
git commit -m "✨ 新增功能: XXX"
git push

# 4. Zeabur 自動部署！
# 5. 1-2 分鐘後訪問你的網站查看更新
```

### 回滾版本

如果部署出問題：

1. 前往 Zeabur Dashboard
2. 點擊服務 → "Deployments"
3. 選擇之前正常的版本
4. 點擊 "Redeploy"

---

## 📈 效能優化建議

### 1. 啟用 CDN (已自動啟用)

Zeabur 預設使用全球 CDN，靜態資源會自動快取。

### 2. 圖片最佳化

如果之後要加入圖片：

```javascript
// next.config.js
module.exports = {
  images: {
    domains: ['your-cdn.com'],
  },
}
```

### 3. 調整快取策略

編輯 `lib/config.ts`：

```typescript
export const CACHE_CONFIG = {
  prices: {
    revalidate: 300,  // 5 分鐘 (減少 API 呼叫)
  },
};
```

---

## 🆚 Zeabur vs Vercel 比較

| 項目 | Zeabur | Vercel |
|------|--------|--------|
| **免費額度** | $5/月 | Hobby 方案 |
| **區域選擇** | ✅ 可選香港、東京 | ❌ 美國為主 |
| **中文介面** | ✅ 支援 | ❌ 英文 |
| **速度 (台灣)** | ⚡⚡⚡ 快 | ⚡⚡ 中等 |
| **自訂網域** | ✅ 免費 | ✅ 免費 |
| **部署速度** | 1-2 分鐘 | 1-2 分鐘 |

**推薦**: 台灣用戶選 Zeabur！ 🇹🇼

---

## 📞 需要幫助？

- **Zeabur 文件**: https://zeabur.com/docs
- **Discord 社群**: https://discord.gg/zeabur
- **或在專案 GitHub 提 Issue**

---

**部署完成後，記得測試所有功能！** ✅

祝部署順利！🚀
