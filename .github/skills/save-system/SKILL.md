---
name: save-system
description: 新增存檔欄位、修改存檔碼格式、密鑰、`-save`／`-load` 流程或分段同步（syncChunked）時使用。說明資料格式登錄、編碼與防竄改、32 位元處理與已在遊戲中確認的結果。
---

# 存檔系統

規格：`docs/save-system/PLAN.md`（已完成，2026-11-03）。實作細節與驗證：`docs/save-system/implementation/PLAN.md`。

## 結構

| 位置 | 內容 |
|---|---|
| `src/features/save/model/format.ts` | 資料格式登錄（`SaveRegistry`、`SaveSection`）、位元打包、版本轉換 |
| `src/features/save/lib/hash.ts` | SHA-256 與 HMAC（16 位元半字運算） |
| `src/features/save/config/keys.ts` | 密鑰與密鑰版本（唯一位置，不從 `index.ts` 匯出） |
| `src/features/save/model/codec.ts` | 驗證碼、混淆、Crockford Base32、分組 |
| `src/features/save/model/chat.ts`、`manual-input.ts` | `-save`、`-load`、手動分段輸入；`SaveNatives` |
| `src/features/save/model/demo.ts`、`src/app/save-example.ts` | 範例資料與範例地圖 |
| `src/shared/rxwc3/sync/sync-chunked.ts` | 分段同步 `syncChunked` |
| `src/shared/file-io/` | `write`／`read`（存檔檔案）、`writeReadable`（可閱讀的指令檔） |

## 新增存檔欄位

- 以登錄區段的方式加入欄位。不得修改其他系統的區段。
- 欄位種類：無號整數、布林、固定長度整數清單。整數範圍 0 至 16777215。
- 格式改變時登錄新版本，並在前一版本提供 `migrate`。解碼時依序轉換到目前版本。不得修改已發布版本的欄位。
- 物件（物品等）以目錄索引保存，不保存 32 位元物件代碼。

## 編碼流程

```
位元打包 → HMAC-SHA-256（取前 128 位元）→ 混淆（排列 + XOR 遮罩）→ Crockford Base32 → 每 5 字元以 - 分組
```

- 驗證碼的輸入包含用途標記、密鑰版本、正規化玩家名稱與打包資料。同時偵測錯字、竄改與玩家不符。
- 驗證失敗只顯示「存檔碼無效」，不說明原因。
- 更換密鑰：增加密鑰版本，保留舊密鑰以讀取舊碼。
- 玩家名稱只統一 ASCII 字母大小寫並去除前後空白，其他位元組保留。原因：Lua 與 Node 的大小寫轉換規則不同。

## 32 位元規則

- SHA-256 的 32 位元字拆成兩個 16 位元整數計算。全部中間值小於 16777216（int32 安全，float32 可精確表示）。
- 修改雜湊、打包或 Base32 時，必須維持此上限，並以 Node 稽核（`Math.fround(value) === value`）檢查。

## 同步規則

| 操作 | 執行位置 |
|---|---|
| `-save` 收集與編碼 | 共同流程 |
| 寫入 `save.pld`、`save-commands.pld`、顯示存檔碼 | 只在擁有者本地 |
| `-load` 讀檔 | 只在擁有者本地，再以 `syncChunked` 送給全部用戶端 |
| 解碼、驗證、套用 | 全部用戶端（同步） |
| `-load <存檔碼>`、`-load 1/2 <片段>` | 聊天事件已同步，直接解碼，不經 sync |

- `syncChunked`：每片預設 200 位元組，最多 64 片、4096 位元組。允許亂序與重複；新序號覆蓋舊序號；15 秒逾時。prefix 與一般 `sync` 共用登錄表，不得重複。
- 手動分段：每片最多 80 字元（指令最長 92 字元），等待 60 秒。

## 遊戲內結果（2026-11-03，單人）

- 存檔、重新開啟地圖、`-load` 自動讀檔、手動完整輸入、分段輸入、竄改偵測、檔案遺失提示：全部通過。
- 離線時 `GetPlayerName` 傳回用戶端語言的文字（正體中文為 `本地玩家`），沒有 `#` 數字標籤。不同語言的用戶端離線時，存檔碼可能互不通用（已知限制）。
- 尚未驗證：聊天字數上限（約 127）、分段逾時、多人同步、Battle.net 名稱格式。

## 驗證

- `pnpm run test:unit`、`pnpm run test:save:lua`、`pnpm run build`。
- 會在 WC3 中執行的修改，以 `pnpm run test` 在遊戲中驗證。
