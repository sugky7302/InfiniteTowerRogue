---
name: save-system
description: 新增存檔欄位、修改存檔碼格式、密鑰、`-save`／`-load` 流程或分段同步（syncChunked）時使用。說明資料格式登錄、編碼與防竄改、32 位元處理與已在遊戲中確認的結果。
---

# 存檔系統

規格：`docs/save-system/PLAN.md`（已完成，2026-11-03）。實作細節與驗證：`docs/save-system/implementation/PLAN.md`。

版本 3 英雄存檔規格：`docs/hero-save/PLAN.md`。版本 4 與 90 格背包以 `docs/inventory-ui/PLAN.md` 為準。I1、I2 記錄見 `docs/inventory-ui/implementation/PLAN.md`；遊戲內驗證尚未執行。

## 結構

| 位置 | 內容 |
|---|---|
| `src/features/save/model/format.ts` | 資料格式登錄（`SaveRegistry`、`SaveSection`）、位元打包、版本轉換 |
| `src/features/save/lib/hash.ts` | SHA-256 與 HMAC（16 位元半字運算） |
| `src/features/save/config/keys.ts` | 密鑰與密鑰版本（唯一位置，不從 `index.ts` 匯出） |
| `src/features/save/model/codec.ts` | 驗證碼、混淆、Crockford Base32、分組 |
| `src/features/save/model/chat.ts`、`manual-input.ts` | `-save`、`-load`、手動分段輸入；`SaveNatives` |
| `src/features/save/model/demo.ts`、`src/app/save-example.ts` | 範例資料與範例地圖 |
| `src/features/save/model/participant.ts` | 通用 `SaveParticipant`。存檔功能不得依賴英雄、物品或裝備模組 |
| `src/app/hero-save.ts` | 英雄與裝備目錄、純編碼與解碼、兩個參與者 |
| `src/shared/rxwc3/sync/sync-chunked.ts` | 分段同步 `syncChunked` |
| `src/shared/file-io/` | `write`／`read`（存檔檔案）、`writeReadable`（可閱讀的指令檔） |

## 新增存檔欄位

- 以登錄區段的方式加入欄位。不得修改其他系統的區段。
- 欄位種類：無號整數、布林、固定長度整數清單、可變長度紀錄清單。整數範圍 0 至 16777215。
- `records` 保存數量與紀錄。`maxLength` 為 1～256；紀錄欄位不得為空或重名。紀錄內的 `dependent-list` 以同一紀錄中前置的 `uint` 作為索引，選擇 `lengths` 的清單長度。來源最小值須為 0，長度表須完整覆蓋來源範圍。此功能不得知道英雄或物品規則。
- 登錄時計算最壞位元數。打包上限 768 位元組，存檔碼輸入上限 1600 字元。修改範圍時須重新計算並執行 NumberAudit。
- 格式改變時登錄新版本，並在前一版本提供 `migrate`。解碼時依序轉換到目前版本。不得修改已發布版本的欄位。
- 物件（物品等）以目錄索引保存，不保存 32 位元物件代碼。

## 版本與參與者

- `installSaveChat` 第八個參數為參與者清單，第七個參數仍為可選編碼器。沒有參與者時保留版本 2，既有呼叫與碼值不變。
- 有參與者時，沒有 `previous` 使用版本 3；有任一 `previous` 使用版本 4。先登錄 demo，再依清單順序登錄參與者區段。版本 1～3 的欄位與碼值保持不變。
- `previous` 提供版本 3 的 `section`、`empty` 與轉換函式。版本 2 先補入舊空資料，版本 3 再轉為版本 4。沒有 `previous` 的區段直接沿用。
- `empty` 必須是常數。版本轉換不得呼叫 collect 或讀取遊戲狀態。
- 共同流程執行 collect。讀檔時先解碼並執行全部 prepare，成功後才執行全部套用函式，最後更新 demo。prepare 不得修改遊戲狀態。
- 英雄參與者先驗證並暫存英雄純資料；裝備參與者使用此資料驗證穿戴，並產生恢復函式。必須使用 `createHeroSaveParticipants` 傳回的順序。
- 版本 2 轉換後 `hero.present` 為 false。只恢復 demo，不改英雄與裝備。只有玩家 1 收集英雄資料。
- 版本 3 碼長固定為 265 字元，包含分組；移除連字號後為 221 字元。手動輸入使用指令檔的三段指令。
- 版本 4 的 equipment 只保存有物品的格子：0～3 為穿戴位置，4～93 為 90 格背包。版本 3 的位置 0～15 原位轉換，空格保留。只保存基底、階級與該階級數量的詞綴。
- 版本 4：起始兩件普通裝備 79 字元；另加 12 件普通物品 153 字元；94 件傳世紀錄的格式上限 1397 字元（皆含分組）。最壞打包 710 位元組，手動分 15 段。現有物品目錄沒有工具，合法英雄最多 93 件；94 筆只驗證格式與通道容量。

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
- 存檔範例使用預設 200，不再指定 20。最壞存檔含請求序號最多 1405 位元組，需 8 片，仍在通道上限內。
- 手動分段：每片最多 80 字元（指令最長 92 字元），等待 60 秒。

## 存檔檔案（file-io）

- 檔案框架 `ITF1|長度|資料|檢查碼` 每 96 字元一段。每段寫入一個技能的第 0 級：`A0IO`、`AF01`～`AF42`（最多 43 段）。技能代碼在 `src/shared/file-io/codec.ts` 與 `scripts/file-io.cjs`，兩處必須相同。
- 遊戲內確認（2026-11-04）：Preloader 執行時，`BlzGetAbilityTooltip(...)+` 串接不生效；第 1 級以上的提示也不能獨立保存（讀回時每級都是第 0 級的內容）。不得改回這兩種寫法。
- 假原生介面不支援串接與多級，與遊戲行為一致。Node 與 Fengari 無法證明 Preloader 的行為，修改後必須在遊戲中驗證超過 96 字元的存檔。
- file-io 資料上限維持 4096 字元。版本 4 最壞存檔 1397 字元，框架最多 1413 字元，使用 15 個技能段；不用修改已在遊戲中確認的檔案通道。
- 自動讀檔失敗時，本地顯示讀取結果（沒有檔案、內容錯誤與讀回字元數、讀取失敗、過長）。

## 遊戲內結果（2026-11-04，版本 3）

- 英雄存檔：自動讀檔、手動分段、竄改偵測、版本 2 轉換全部通過。

## 遊戲內結果（2026-11-03，單人）

- 存檔、重新開啟地圖、`-load` 自動讀檔、手動完整輸入、分段輸入、竄改偵測、檔案遺失提示：全部通過。
- 離線時 `GetPlayerName` 傳回用戶端語言的文字（正體中文為 `本地玩家`），沒有 `#` 數字標籤。不同語言的用戶端離線時，存檔碼可能互不通用（已知限制）。
- 尚未驗證：聊天字數上限（約 127）、分段逾時、多人同步、Battle.net 名稱格式。

## 驗證

- `npm run test:unit`、`npm run test:save:lua`、`npm run test:hero:lua`、`npm run build`。
- 英雄存檔案例在 `tests/hero-save/`，由 Node 與英雄 Lua 驗證共用。Node 的 NumberAudit 檢查 int32 與 float32。
- 會在 WC3 中執行的修改，以 `npm run test` 在遊戲中驗證。使用者要求保留遊戲驗證時，不執行此指令。
