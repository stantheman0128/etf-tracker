# 什錦雜貨鋪 ETF - Roadmap

## 基礎建設 ✅ 已完成

- ✅ Upstash Redis 快取 (KV_REST_API via Vercel 整合)
- ✅ QStash 每 5 分鐘自動收集即時數據
- ✅ 歷史數據 backfill (2025-05-30 至今，每小時級)
- ✅ Carry-forward 機制 (跨日、跨 batch、7 天回溯 seed)
- ✅ BTC 24/7 小時級數據 (Kraken 最近 30 天 + CoinGecko)
- ✅ 假日/週末 gap-filling (hourly-range API)
- ✅ SWR 前端快取 + 智慧更新 (開市 5min / 收盤 30min / 週末 60min)
- ✅ Skeleton 載入 + 背景更新指示器

## 圖表 UI ✅ 已完成（初版）

- ✅ 每日/盤中平滑曲線 (lightweight-charts)
- ✅ 點擊日期 → 大圖放大到當天走勢
- ✅ 個股 % 變化折線疊加在大圖上
- ✅ 市場時段標線 (台股紅/美股藍 開收盤)
- ✅ 大漲大跌標記 (>=1.5% 箭頭)
- ✅ 個股明細格子 (價格、漲跌%、市值)
- ✅ 非交易日提示 (「延續收盤價」badge)
- ✅ Morph 動畫 (卡片 ↔ 表格)、Mini sparkline

## 🎯 下一步：UI/UX 精修

### 開發流程改進 🔴 優先
- **問題**：目前「邊做邊改」導致改了這個漏了那個
- **方案**：先設計再實作
  1. 用 Figma 設計完整的 UI mockup（所有狀態、所有交互）
  2. 寫行為規格文件（狀態機、edge cases、動畫時序）
  3. Review 確認後一次性實作
- **範圍**：
  - 總覽模式：大圖時間軸 + 個股卡片/表格
  - 鑽取模式：大圖放大到當天 + 個股走勢 + 市場標線
  - 數值顯示區：總值、獲利、報酬率
  - 響應式：手機/平板適配
  - 動畫：所有狀態轉場

### 響應式優化
- 手機上圖表縮放
- 卡片排列自適應
- 觸控友善互動

### 效能優化
- Lighthouse 評分
- 代碼分割 (dynamic import)
- Bundle size 分析

---

## 🔜 之後再做

### 錯誤監控
- Sentry 或 LogRocket
- API 錯誤、前端異常追蹤

### 大盤比較
- 疊加 S&P 500 / TAIEX 走勢
- 相對表現（跑贏/跑輸大盤）

### 深色模式
- next-themes

### 多投資組合
- 需要後端資料庫（目前 Redis 只是快取）
- 可能搭配 Supabase / PlanetScale

### 行動 App (PWA)
- 可安裝、離線快取、推播通知

---

## ❌ 不做

- 持股拖拽排序
- 資料匯出
- 價格警示通知
- 效能分析圖表（夏普比率等）
- 股息追蹤

---

## 技術架構現況

```
前端：Next.js + lightweight-charts + SWR + Tailwind
部署：Vercel (Hobby plan)
快取：Upstash Redis (KV, 400 天 TTL)
排程：Upstash QStash (每 5 分鐘)
數據：Yahoo Finance (股票) + Kraken/CoinGecko (BTC)
```

### 數據限制
- 股票小時級數據：只有交易時段 (Yahoo Finance)
- BTC 小時級：最近 30 天 (Kraken)，更舊只有日線 (CoinGecko)
- 匯率：交易日才有 (Yahoo Finance)
- 即時 5 分鐘數據：從 2026-03-27 開始收集

最後更新：2026-03-28
