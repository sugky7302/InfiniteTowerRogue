---
name: i18n
description: 新增或修改顯示文字、翻譯、物件編輯器文字、語言切換或本地檔案讀寫（file-io）時使用。說明兩層切換、翻譯檔、同步安全與已在遊戲中確認的陷阱。
---

# i18n：多語言文字

規格與驗證記錄：`docs/i18n/PLAN.md`（I1 至 I4）。語言：`zh-TW`（基準）、`zh-CN`、`en-US`。

## 程式文字

- 翻譯鍵定義在 `src/shared/lib/i18n/locales/zh-TW.ts`。`zh-CN.ts` 與 `en-US.ts` 必須有相同的鍵，缺少或多出時編譯失敗。
- `zh-CN` 由人工翻譯，不使用自動轉換。
- 使用 `t(key, params)`，參數格式為 `{name}`。
- **參數若是顯示文字，也必須先翻譯**：`t("example.greeting", { name: t("example.traveler") })`。
- 介面中使用 `localComputed`／`localEffect` 讀取 `t()`，語言切換時自動更新。
- RxWC3 與 logger 的錯誤訊息不翻譯，固定使用正體中文。

## 語言是本地狀態

- 語言保存在本地 Signal。預設依 `BlzGetLocale()`（正體中文用戶端傳回 `zhTW`，沒有連字號）；不屬於三種語言時使用 `zh-TW`。
- `-lang <代碼>`：`onPlayerChat` + `forLocalPlayer`，只影響輸入者。代碼錯誤時只對輸入者顯示語言清單。
- **翻譯後的文字只能用於顯示。** 遊戲邏輯不得讀取或比較翻譯文字（例如 `GetUnitName`），否則多人時不同步。
- 套用文字的本地程式不得建立 handle。group、rect、region、觸發器在共同流程預先建立。

## 兩層切換

| 層 | 方式 | 涵蓋 |
|---|---|---|
| 自動層 | 建置產生 `_Locales/<zhTW|zhCN|enUS>.w3mod/war3map.wts`；物件與 `war3map.w3i` 文字改為 `TRIGSTR` 參照。遊戲依用戶端語言選擇 | 載入畫面、地圖名稱、單位說明、技能編輯器名稱等執行時無法修改的文字 |
| 執行時層 | 原生函式覆蓋文字 | 技能說明（各等級）、物品與單位名稱（逐個實例） |

- WC3 介面本身的文字（「等級1」、「傷害」、「物品欄」等）由用戶端語言決定，地圖無法修改。
- 物品：建立時呼叫 `trackItem()` 套用目前語言。新單位由進入地圖事件自動套用。

## 翻譯檔與建置

- 物件文字：`i18n/objects/<語言>.json`。地圖資訊文字：`i18n/map/<語言>.json`。格式為「鍵 → 字串或 `null`」，`null` 表示未翻譯，執行時使用 `zh-TW`，建置時輸出警告。
- 只擷取地圖中**自訂或修改過**的物件；內建物件文字由用戶端提供。
- 物件文字鍵：`<類別>:<代碼>:<欄位>[:<等級>]`，例如 `ability:A000:tip:1`。
- 建置腳本：`scripts/i18n-objects.cjs`（擷取、範本、Lua 翻譯表）、`scripts/i18n-locales.cjs`（`_Locales`、`TRIGSTR`、`w3i`）。不修改 `maps/map.w3x/` 的原始檔案，只修改建置產出。
- 範例物件只在 i18n 範例被 `main.ts` 載入時存在；其他範例掛載時，`i18n/objects/zh-TW.json` 會被重新產生為空的範本。

## 本地檔案讀寫（file-io）

- 位置：`src/shared/lib/file-io/`。以 `Preload` 系列函式寫入 `CustomMapData`，以 `Preloader` 與內建 `Amls` 的圖示欄位讀回。存檔系統也使用此模組。
- 上限 4096 個受限 ASCII 字元。寫入只能回報「已送出」，無法確認磁碟寫入成功。
- 使用內嵌 Lua 累加 Preload 資料，每次最多 259 字元，最後一次設定圖示。讀取前保存圖示，讀取後還原。不建立專用技能或預載單位。
- 新格式 F1 已實作；F2 語言偏好重開驗證仍待執行。舊 A0IO／AFxx 檔案不再支援，會使用用戶端語言作為後備。
- 語言偏好：`CustomMapData\InfiniteTowerRogue\language.pld`。讀寫只在本地執行，不需要 `sync`。

## 陷阱（已在遊戲中確認）

| 陷阱 | 處理 |
|---|---|
| `war3map.w3i` 第 39 版在載入畫面編號後多一個 4 位元組整數。未跳過時，字串被寫進整數，WC3 停在主畫面無法載入地圖 | `mapTextSlots` 跳過此整數，並檢查霧設定是否合理；不合理時停止建置 |
| 用同一個解析器比較改寫前後的檔案，無法發現欄位位置錯誤 | 測試以原始檔案的固定位移檢查 |
| 英文用戶端是否能顯示中文 | 已確認可以 |

## 驗證

- `pnpm run test:unit`、`pnpm run test:i18n:lua`、`pnpm run test:i18n:artifact`、`pnpm run build`。
- 待補驗證：簡體中文與其他語言用戶端的自動層、多人（不同語言互不影響且不同步）。
