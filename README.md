# 🦔 什錦雜貨鋪 ETF - Portfolio Tracker

個人投資組合追蹤工具，支援台股、美股與加密貨幣的即時價格追蹤與歷史走勢分析。

![Next.js](https://img.shields.io/badge/Next.js-14-black)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-3-38bdf8)

## ✨ 功能特色

- 📊 **即時價格追蹤** - 自動更新台股、美股與比特幣價格
- 📈 **歷史曲線圖** - 查看過去 30 天的價格走勢
- 💰 **資產總覽** - 一目了然的投資組合價值與報酬率
- 📱 **響應式設計** - 完美支援手機、平板與桌面
- ⚡ **快速載入** - Next.js 14 + SSR，< 1 秒載入
- 🎨 **現代化 UI** - Tailwind CSS + shadcn/ui

## 🚀 快速開始

### 1. 安裝依賴

```bash
npm install
```

### 2. 設定環境變數（選用）

複製 `.env.example` 為 `.env.local`：

```bash
cp .env.example .env.local
```

**注意：** 本專案主要使用免費的 Yahoo Finance API，**不需要** API Key 即可運行！Alpha Vantage API Key 已經不再需要。

### 3. 設定你的投資組合

編輯 `lib/config.ts`，修改你的持股：

```typescript
export const PORTFOLIO_CONFIG: PortfolioConfig = {
  holdings: [
    {
      symbol: '2330',
      name: '台積電',
      shares: 46,
      exchange: 'TPE',
      currency: 'TWD',
      market: 'TAIWAN'
    },
    // ... 新增你的持股
  ],
  totalCostTWD: 200000  // 總成本（台幣）
};
```

### 3. 啟動開發伺服器

```bash
npm run dev
```

開啟瀏覽器訪問 http://localhost:3000

## 📦 專案結構

```
etf-tracker/
├── app/                    # Next.js App Router
│   ├── api/               # API 路由
│   ├── charts/            # 圖表頁面
│   ├── page.tsx           # 首頁儀表板
│   └── layout.tsx         # 全域 Layout
├── components/            # React 元件
│   └── ui/               # UI 元件 (shadcn/ui)
├── lib/                   # 核心邏輯
│   ├── config.ts         # 投資組合設定
│   ├── api-client.ts     # API 客戶端
│   └── utils/            # 工具函數
└── public/               # 靜態資源
```

## 🔧 技術棧

- **框架**: [Next.js 14](https://nextjs.org/) (App Router)
- **語言**: [TypeScript](https://www.typescriptlang.org/)
- **樣式**: [Tailwind CSS](https://tailwindcss.com/)
- **UI 元件**: [shadcn/ui](https://ui.shadcn.com/)
- **圖表**: [TradingView Lightweight Charts](https://www.tradingview.com/lightweight-charts/)
- **部署**: [Vercel](https://vercel.com/)

## 📡 資料來源

| 資料類型 | API 來源 | 免費額度 | 需要 API Key |
|---------|---------|---------|-------------|
| 美股即時價格 | Yahoo Finance | 無限制 | ❌ 不需要 |
| 台股即時價格 | Yahoo Finance | 無限制 | ❌ 不需要 |
| BTC 價格 | Kraken / Coinbase / Blockchain.info | 無限制 | ❌ 不需要 |
| USD/TWD 匯率 | ExchangeRate-API | 1500 次/月 | ❌ 不需要 |

**✨ 完全免費，無需註冊任何 API Key！**

## 🚀 部署到 Vercel

### 方法 1: 使用 GitHub (推薦)

1. 推送程式碼到 GitHub
2. 前往 [Vercel Dashboard](https://vercel.com/dashboard)
3. 點擊 "Import Project"
4. 選擇你的 GitHub 儲存庫
5. **無需設定任何環境變數**
6. 點擊 Deploy！

### 方法 2: 使用 Vercel CLI

```bash
npm install -g vercel
vercel login
vercel
```

## 📝 自訂設定

### 修改顏色主題

編輯 `tailwind.config.ts` 的顏色設定：

```typescript
theme: {
  extend: {
    colors: {
      primary: {
        DEFAULT: "hsl(242 79% 69%)",  // 主色調
        // ...
      },
    },
  },
},
```

### 調整快取時間

編輯 `lib/config.ts`：

```typescript
export const CACHE_CONFIG = {
  prices: {
    revalidate: 60,  // 秒
  },
  // ...
};
```

## 🔒 資料安全與隱私

- ✅ **完全不需要 API Key** - 使用公開免費的 Yahoo Finance API
- ✅ **無個人資料收集** - 所有持股資訊僅存於本地設定檔
- ✅ **開源透明** - 所有程式碼公開可查
- ✅ **隱私優先** - `.env.local` 和個人設定不會被提交到 Git

## 📄 授權

MIT License - 自由使用與修改

## 👤 作者

Made with 🦔 by Stan Shih

- Email: stan@stan-shih.com
- Dcard: [@stantheman](https://www.dcard.tw/@stantheman)
- Instagram: [@shijin.store](https://www.instagram.com/shijin.store/)

## 🙏 致謝

- [Next.js](https://nextjs.org/)
- [shadcn/ui](https://ui.shadcn.com/)
- [Alpha Vantage](https://www.alphavantage.co/)
- [TradingView](https://www.tradingview.com/)
