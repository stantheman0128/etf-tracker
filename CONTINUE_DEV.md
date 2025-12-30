# 🔄 換電腦繼續開發指南

如何在不同電腦間無縫切換開發環境。

---

## 💬 繼續 Claude 對話

### 方法 1: Claude.ai 網頁版 (推薦) ⭐

**優勢**: 對話會自動同步到所有裝置

1. **在新電腦上**:
   - 前往 https://claude.ai
   - 用同一個帳號登入
   - 在左側欄找到這個對話
   - 點擊即可繼續！

2. **對話歷史**:
   - ✅ 完整保留所有上下文
   - ✅ 我會記得專案結構
   - ✅ 我會記得你的需求
   - ✅ 可以直接繼續討論

### 方法 2: Claude Code (VS Code Extension)

如果你使用 VS Code + Claude Code Extension：

1. **同步設定**:
   - 啟用 VS Code Settings Sync
   - 登入同一個 Microsoft 帳號
   - 對話歷史會自動同步

2. **重新開啟專案**:
   ```bash
   cd etf-tracker
   code .
   ```

3. **在 Claude Code 中**:
   - 點擊左側 Claude 圖示
   - 查看歷史對話
   - 繼續討論

---

## 💾 同步專案檔案

### 方法 1: 透過 GitHub (推薦)

**在新電腦上**:

```bash
# 1. Clone 專案
git clone https://github.com/你的用戶名/etf-tracker.git
cd etf-tracker

# 2. 安裝依賴
npm install

# 3. 複製環境變數
cp .env.example .env.local

# 4. 編輯 .env.local，填入 API Key
# (用記事本或 VS Code 開啟)

# 5. 啟動開發
npm run dev
```

### 方法 2: OneDrive 自動同步 ☁️

**你已經在使用！**

由於專案在 OneDrive 資料夾:
```
c:\Users\stans\OneDrive - gapps.ntnu.edu.tw\桌面\coding\etf
```

**在另一台電腦**:
1. 登入 OneDrive
2. 等待同步完成
3. 前往相同路徑
4. 執行 `npm install`
5. 完成！

> ⚠️ **注意**:
> - `node_modules/` 不會同步 (太大，且在 .gitignore)
> - `.env.local` 不會同步 (包含敏感資訊)
> - 需要重新執行 `npm install`

### 方法 3: USB 隨身碟

```bash
# 在舊電腦
cd etf-tracker
git archive --format=zip --output=etf-tracker.zip HEAD

# 複製 etf-tracker.zip 到隨身碟

# 在新電腦
unzip etf-tracker.zip -d etf-tracker
cd etf-tracker
npm install
```

---

## 🔑 環境變數處理

### 安全做法

**不要**把 `.env.local` 放在雲端同步！

**推薦做法**:

1. **密碼管理器** (如 1Password, Bitwarden)
   - 儲存 API Key 在 Secure Note
   - 在新電腦上複製貼上

2. **手動記錄**
   - 把 Alpha Vantage API Key 記在安全的地方
   - 在新電腦上手動建立 `.env.local`

3. **Zeabur 上查看**
   - 已部署的話，環境變數在 Zeabur Dashboard
   - 可以複製貼上到本地

---

## 🛠️ 開發環境設定

### 必備軟體

**在新電腦上安裝**:

1. **Node.js** (>= 18)
   - 前往 https://nodejs.org
   - 下載 LTS 版本
   - 安裝

2. **Git**
   - 前往 https://git-scm.com
   - 下載並安裝

3. **VS Code** (推薦)
   - 前往 https://code.visualstudio.com
   - 下載並安裝

4. **推薦的 VS Code 擴充功能**:
   ```
   - ES7+ React/Redux/React-Native snippets
   - Tailwind CSS IntelliSense
   - TypeScript Vue Plugin (Volar)
   - Prettier - Code formatter
   - ESLint
   ```

### 驗證安裝

```bash
# 檢查 Node.js
node --version  # 應該 >= v18.0.0

# 檢查 npm
npm --version

# 檢查 Git
git --version
```

---

## 📋 快速恢復 Checklist

在新電腦上的完整步驟：

- [ ] 安裝 Node.js (>= 18)
- [ ] 安裝 Git
- [ ] Clone GitHub 專案 或 等待 OneDrive 同步
- [ ] 進入專案資料夾
- [ ] 執行 `npm install`
- [ ] 建立 `.env.local` 並填入 API Key
- [ ] 執行 `npm run dev` 測試
- [ ] 開啟瀏覽器訪問 http://localhost:3000
- [ ] 確認正常運作 ✅

---

## 🔄 Git 工作流程

### 在舊電腦提交變更

```bash
git add .
git commit -m "更新功能: XXX"
git push
```

### 在新電腦拉取更新

```bash
git pull
npm install  # 如果 package.json 有變更
```

### 分支管理 (進階)

如果在多台電腦同時開發：

```bash
# 在電腦 A
git checkout -b feature/new-chart
# ... 修改程式碼 ...
git push -u origin feature/new-chart

# 在電腦 B
git fetch
git checkout feature/new-chart
# ... 繼續開發 ...
```

---

## 💡 最佳實踐

### 1. 定期提交

```bash
# 每次有進度就提交
git add .
git commit -m "完成 XXX 功能"
git push
```

### 2. 使用有意義的 Commit 訊息

```bash
✅ git commit -m "✨ 新增歷史曲線圖功能"
✅ git commit -m "🐛 修復價格顯示錯誤"
✅ git commit -m "📝 更新 README 文件"

❌ git commit -m "update"
❌ git commit -m "fix bug"
```

### 3. 同步前先拉取

```bash
# 開始工作前
git pull

# 工作完成後
git add .
git commit -m "XXX"
git push
```

### 4. 保護敏感資訊

**絕對不要提交**:
- `.env.local`
- API Keys
- 密碼

確認 `.gitignore` 包含:
```
.env.local
.env*.local
```

---

## 🆘 常見問題

### Q: 忘記推送，兩台電腦的程式碼不一樣？

```bash
# 在有最新程式碼的電腦
git add .
git commit -m "同步最新變更"
git push --force  # ⚠️ 小心使用

# 在另一台電腦
git fetch
git reset --hard origin/main
```

### Q: node_modules 太大，OneDrive 同步很慢？

**解決方案**:
1. 把專案移出 OneDrive
2. 只用 GitHub 同步
3. 或在 OneDrive 設定中排除 `node_modules`

### Q: 環境變數在新電腦上不能用？

**檢查清單**:
- [ ] 確認 `.env.local` 存在
- [ ] 確認變數名稱正確 (大小寫)
- [ ] 重新啟動開發伺服器 (`npm run dev`)

---

## 📱 行動開發 (選擇性)

如果想在平板或手機上查看：

1. **部署到 Zeabur/Vercel**
   - 推送到 GitHub
   - 自動部署
   - 用網址訪問

2. **本地網路訪問**
   ```bash
   # 啟動開發伺服器
   npm run dev -- --hostname 0.0.0.0

   # 用同網路的裝置訪問
   # http://你的電腦IP:3000
   ```

---

## 🎯 總結

**最簡單的方式**:
1. **程式碼**: GitHub
2. **對話**: Claude.ai 網頁版
3. **環境變數**: 密碼管理器或手動記錄

**每次切換電腦**:
```bash
git pull
npm install
npm run dev
```

**就這麼簡單！** ✨

---

最後更新: 2025-12-30
