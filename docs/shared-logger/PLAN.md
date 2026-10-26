---
建立日期: 2026-10-26
是否完成: true
---

# 共用記錄模組與路徑別名

## 目的

將記錄輸出移至 `src/shared/logger.ts`。RxWC3 保留錯誤處理設定。

## 設計

1. 匯出 `logger.info`、`logger.warn` 與 `logger.error`。
2. 全域 `print` 是函式時，使用 `print`。其他情況使用全域 `console`。
3. 錯誤物件有 `stack` 時輸出 `stack`。其他情況輸出原值。
4. RxWC3 使用 `@shared/logger`。預設處理器與處理器錯誤都交由 `logger.error` 輸出。
5. 加入 `@shared/*` 別名，保留 `@objectdata/*`。測試使用既有的 `tsconfig-paths`。
6. 擴大獨立轉譯的來源根目錄，使共用模組位於根目錄內。

## 驗證

- 測試 Node 輸出、模擬 Lua 輸出、錯誤追蹤資訊與錯誤處理器。
- 執行 `npm run test:unit`，確認既有 135 項測試與新增測試通過。
- 執行 `npm run build`。
- 獨立轉譯 `tsconfig.rxwc3.json`，再執行 `.cache/rxwc3/verify-lua.cjs`。
- 檢查 Lua 產出的模組名稱與載入路徑。

## 驗證結果

驗證日期：2026-10-26。

| 指令或檢查 | 結果 |
|---|---|
| `npm run test:unit` | 型別檢查通過。149 項通過，0 項失敗。包含既有 135 項與新增 14 項。 |
| `npm run build` | 1 次建置成功，0 次失敗。地圖封裝位於 `dist/bin/map.w3x`。 |
| `node node_modules/typescript-to-lua/dist/tstl.js -p tsconfig.rxwc3.json` | 1 次獨立轉譯成功，0 次失敗。 |
| `node .cache/rxwc3/verify-lua.cjs` | Lua 5.3 執行驗證：13 組通過，0 組失敗。 |
| `node` 標準輸入腳本：檢查兩份 Lua 產物並以 Fengari 執行記錄模組 | 2 份產物的模組路徑檢查通過。每份有 7 組執行驗證，共 14 組通過，0 組失敗。 |

完整建置使用 `require("src.shared.logger")`，對應內嵌的 `src.shared.logger` 模組。獨立轉譯使用 `require("logger")`，對應內嵌的 `logger` 模組。兩份 Lua 產物均沒有殘留 `@shared/` 路徑。產物執行驗證涵蓋一般輸出、警告、錯誤原值、追蹤資訊、布林值、預設錯誤處理器與處理器錯誤。

首次單元測試為 148 項通過、1 項失敗。既有 Node 測試預期輸出錯誤物件。本次要求有 `stack` 時輸出 `stack`，因此將該斷言改為檢查 `failure.stack`。重新執行後全部通過。

依環境限制，Codex 使用 `npm run`。使用者在本機執行 `pnpm run test:unit`，149 項通過、0 項失敗。沒有新增套件，也沒有執行 Git 提交。沒有尚未解決的問題。
