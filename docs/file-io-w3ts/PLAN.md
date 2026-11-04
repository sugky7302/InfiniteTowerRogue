---
建立日期: 2026-11-04
是否完成: true
---

# 檔案讀寫改用 w3ts `File` 的做法

## 目的

- 使用者提議參考 [w3ts File](https://cipherxof.github.io/w3ts/docs/api/classes/file)。專案已安裝 w3ts 3.0.2（`node_modules/w3ts/system/file.lua`）。
- 移除目前的 43 個檔案通道技能（`A0IO`、`AF01`～`AF42`）與 96 字元分段。

## 目前做法與 w3ts 做法比較

| 項目 | 目前（`src/shared/file-io`） | w3ts `File` |
|---|---|---|
| 檔案內容 | 每 96 字元一行 JASS：`BlzSetAbilityTooltip('AFxx',"…",0)` | 檔案內嵌 Lua（`//! beginusercode`）：改寫 `Preload` 累加字串，最後一次 `BlzSetAbilityIcon(Amls, o)` |
| 需要的技能 | 建置產生 43 個技能 | 遊戲內建 `Amls`，不需要建置 |
| 長度 | 最多 43 段，約 4128 字元 | 每行 259 字元，段數不受技能數量限制 |
| 特殊字元 | 只允許安全 ASCII | 以 ESC 字元跳脫雙引號 |
| 遊戲內驗證 | 已確認（2026-11-04） | 未在本專案確認 |

w3ts 的做法讀檔時只寫入一次，所以避開了「串接不生效」與「第 1 級以上不能獨立保存」兩個已確認的問題。

## 決策

- 保留 `LocalFileIo` 介面、`FileReadStatus`／`FileWriteStatus` 與 `ITF1|長度|資料|檢查碼` 框架。呼叫者（存檔、多語言、基準）不改。
- 只替換 shared 的原生實作：寫檔時使用 w3ts 的檔案格式（beginusercode 累加），讀檔時讀取單一技能欄位。
  - 方案 A：直接呼叫 w3ts `File.read`／`File.write`。
  - 方案 B：沿用 w3ts 的格式，自己實作，以便注入假原生介面測試，並保留讀取前後還原欄位的行為。
  - 採用方案 B。原因：現有 Node 與 Lua 測試以 `FileNatives` 注入假介面；w3ts `File` 直接呼叫原生函式，無法注入。
- 讀取欄位使用自訂地圖不會改動的技能圖示欄位。是否沿用 `Amls` 由實作時確認不與既有技能衝突。
- 舊格式（`A0IO`、`AFxx`）的存檔檔案不再支援。遊戲中顯示「存檔檔案內容錯誤」，玩家可以用存檔指令檔手動讀檔。測試存檔不需要轉換。
- 移除 `scripts/file-io.cjs` 的 43 個技能與相關測試。`scripts/decode-bench.cjs` 改讀新格式。

## 風險

- 檔案中的 Lua 會在 `Preloader` 時執行。目前格式同樣會執行檔案中的 JASS，風險相同：玩家可以修改自己的檔案。存檔碼仍由 HMAC 驗證。
- `//! beginusercode` 是 Lua 地圖的預載檔語法。必須在遊戲中確認 3.0.1 仍支援。

## 階段

| 階段 | 內容 | 完成條件 |
|---|---|---|
| F1 | 原生實作改為 w3ts 格式；假介面模擬新格式；移除 43 個技能 | `test:unit`、`test:i18n:lua`（含檔案 Lua 驗證）、`test:save:lua`、`test:benchmark:lua`、全部產物測試、`lint:fsd` 通過 |
| F2 | 遊戲內驗證 | 4096 字元資料寫入後重新開啟地圖可讀回；英雄存檔 `-save`／`-load`；語言偏好；檔案遺失提示 |

F1 在物品欄 I1／I2 完成並提交後開始，避免與進行中的修改衝突。
