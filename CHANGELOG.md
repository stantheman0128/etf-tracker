# Changelog

## 0.1.1 — 2026-07-02

安全修正:`refresh=true` 強制重抓改為需鑑權,擋掉成本型放大攻擊。

- 新增 `lib/refresh-auth.ts`(`checkRefreshAuth` 純函式 + `isAuthorizedRefresh`)與測試(加入 vitest、`npm test`)。
- `/api/portfolio` 與 `/api/portfolio-detail` 的 `refresh=true` 需帶 `Authorization: Bearer <CRON_SECRET>`(dev 放行);未授權的 refresh 一律當成一般讀取、只吃快取,避免匿名者反覆強制重抓放大成大量外部 API 呼叫。
- cron 的 warm 呼叫補上 `CRON_SECRET` header,維持排程可正常重抓。
- 前端不受影響(手動刷新走 SWR revalidate、不送 refresh)。
