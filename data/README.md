# 資料夾說明

## 檔案

### `initial-holdings.csv`
初始持股資料（2025-05-30），作為投資組合的起始狀態。

格式：
- `date`: 日期 (YYYY-MM-DD)
- `symbol`: 股票代號
- `name`: 股票名稱
- `shares`: 持股數量
- `exchange`: 交易所 (TPE/NASDAQ/NYSE/CRYPTO)
- `currency`: 幣別 (TWD/USD)
- `price`: 當日價格
- `value`: 當日價值 (price × shares)

### `cache/` 資料夾（開發模式自動產生）
開發環境下的 API 快取檔案，避免頻繁呼叫外部 API。

- `portfolio-history.json` - 投資組合歷史資料快取
- `stock-history-{symbol}.json` - 個股歷史資料快取

快取會在 24 小時後自動失效。

## 注意事項

1. `cache/` 資料夾已加入 `.gitignore`，不會被 commit
2. 生產環境不使用本地快取
3. 可手動刪除 `cache/` 資料夾強制重新抓取資料
