# Changelog

## 0.1.3 — 2026-07-02

倉庫清理:移除殘留檔案,不動任何執行程式。

- 刪掉 `reference/old-version/`(codev2.gs / indexV8.html,舊 Google Apps Script 版本)與 `reference/` 下的一次性腳本(analyze-dates / check-consistency / test-api / test-csv / test-stan-csv / verify-image / verify-logic),原始碼零引用。`reference/README.md` 保留。
- 移除磁碟上空的 AI 編輯器目錄(.augment / .kilocode / .qoder / .qwen / .roo / .trae / .windsurf,皆已在 .gitignore、未追蹤)。`.gitignore` 早已涵蓋這些名單,防止再生。
- `.insforge/`(Insforge 專案設定)與 `.agents/`(Insforge SDK skill 文件)保留,本 app 實際使用 Insforge。

## 0.1.2 — 2026-07-02

重構:把 `components/PortfolioChart.tsx`(1445 行)拆成薄組裝層 + `components/portfolio-chart/` 子模組。行為與畫面不變。

- 抽出型別 `components/portfolio-chart/types.ts`(StockDetail / DailyPortfolioDetail / TodayData / PortfolioChartProps)。
- 抽出子元件 `AnimatedValue.tsx`(數字跳動)與 `MiniSparkline.tsx`(memo 迷你趨勢圖)。
- 抽出 hooks:`useMergedPortfolioData`(SWR 歷史 + 即時 todayData 合併成 allData/dataByDate)、`useStockOverlays`(個股疊加曲線的新增/移除/切換/全選)、`useChartSetup`(圖表建立、鑽取/盤中/每日三模式渲染、crosshair 與點擊訂閱、開收盤標記、固定匯率曲線)。
- `chartRef` 與 `stockSeriesRef` 由組裝層建立並共用給兩個 hook,避免相互依賴。
- `PortfolioChart` 對外的 default import 路徑不變,`app/page.tsx` 不受影響。主檔 1445 → 709 行。

## 0.1.1 — 2026-07-02

安全修正:`refresh=true` 強制重抓改為需鑑權,擋掉成本型放大攻擊。

- 新增 `lib/refresh-auth.ts`(`checkRefreshAuth` 純函式 + `isAuthorizedRefresh`)與測試(加入 vitest、`npm test`)。
- `/api/portfolio` 與 `/api/portfolio-detail` 的 `refresh=true` 需帶 `Authorization: Bearer <CRON_SECRET>`(dev 放行);未授權的 refresh 一律當成一般讀取、只吃快取,避免匿名者反覆強制重抓放大成大量外部 API 呼叫。
- cron 的 warm 呼叫補上 `CRON_SECRET` header,維持排程可正常重抓。
- 前端不受影響(手動刷新走 SWR revalidate、不送 refresh)。
