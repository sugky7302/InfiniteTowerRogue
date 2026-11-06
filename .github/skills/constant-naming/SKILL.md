---
name: constant-naming
description: 在 src/ 新增或改名模組層級的 const 時使用，或 tests/naming/constant-naming.spec.ts 失敗時使用。說明哪些常數使用 UPPER_SNAKE_CASE、哪些不改，允許清單的用法，以及安全改名的方法。
---

# 模組層級常數的命名

規則：`AGENTS.md` 的「模組層級的常數使用大寫蛇形命名法」。改名記錄：`docs/constant-rename/PLAN.md`（已完成，2026-11-06，66 個名稱）。

## 判斷名稱

| 模組層級的 `const` | 名稱 | 例子 |
|---|---|---|
| 純量常數（數字、字串、布林） | `UPPER_SNAKE_CASE` | `MAX_PACKED_BYTES`、`SAVE_FILE_PATH` |
| 固定資料表（陣列、對照表），包含計算產生的表 | `UPPER_SNAKE_CASE` | `AFFIXES`、`HERO_KNOWLEDGE`、`FILE_ABILITY` |
| 帶同名 `type` 的常數物件 | PascalCase | `EquipSlot`、`FileReadStatus` |
| 箭頭函式、函式運算式 | 原命名 | `protectedCall` |
| 可變的狀態 | 原命名，加入允許清單 | `queue`、`config` |
| 具有執行期狀態的實例 | 原命名，加入允許清單 | `worldClock`、`inventoryRegistry`、`onDamaging` |
| 原生函式介面的實作與服務物件 | 原命名，加入允許清單 | `wc3UnitNatives`、`logger` |
| `declare const` 與全域別名 | 原命名 | `os`、`globals` |
| 單一筆資料定義 | 原命名，加入允許清單 | `fireball`、`scholar`、`heroSection`、`enUS` |

- 新名稱的轉換：在小寫字母或數字與大寫字母之間加 `_`，然後全部改為大寫。例如 `maxPackedBytes` → `MAX_PACKED_BYTES`。
- 函式內的區域常數、函式與類別不受此規則限制。
- `tests/` 與 `scripts/` 自己宣告的常數不檢查。

## 命名檢查測試

`tests/naming/constant-naming.spec.ts`（在 `npm run test:unit` 中執行）：

- 以 TypeScript 編譯器讀取 `src/**/*.ts`（不含 `.d.ts`），檢查每一個模組層級的 `const`。解構宣告的每個名稱分開檢查。
- 自動排除：`declare const`、帶同名 `type` 的物件常值、箭頭函式與函式運算式。
- 其他不改名的項目寫在 `ALLOWED_CONSTANTS`，格式是 `{ key: "檔案路徑:名稱", category: "類別" }`。
- 新增可變的狀態、實例、原生函式介面的實作或單一筆資料定義時，把它加入 `ALLOWED_CONSTANTS`。
- 允許清單中的項目不存在時，測試也失敗。搬移或刪除這類常數時，同時更新清單。
- `RENAME_ENTRIES` 確認 2026-11-06 改名的 66 個名稱沒有被改回。

## 改名的方法

- 以符號改名（TypeScript 語言服務的 `findRenameLocations`），不得使用全域文字取代。
    - 語言服務必須載入 `src/**/*.ts` 與 `tests/**/*.ts`。`tsconfig.json` 只包含 `src`。
    - 使用 `providePrefixAndSuffixTextForRename: true`，讓一般資料物件的簡寫屬性保留原屬性名稱，例如 `{ warmup: WARMUP }`。
- 同名的區域變數、參數、一般物件的屬性與資料字串（例如存檔欄位 `"bases"`）不改。
- 以模組物件讀取匯出的程式要手動改屬性名稱：`require(...)`、`import * as` 與模擬它們的測試物件。`.cjs` 不在型別檢查範圍內，語言服務不會更新它們。
    - 已知位置：`scripts/inventory-objects.cjs`、`scripts/skill-objects.cjs`、`scripts/decode-bench.cjs`、`tests/inventory/objects.spec.ts`、`tests/skill/objects.spec.ts`。
    - 解構時只改來源屬性，保留區域名稱。例如 `{ SKILLS: skills }`。
- 建置產物測試中寫死的 Lua 識別符也要更新，例如 `tests/hero-save/artifact.spec.ts` 的 `"MAX_PACKED_BYTES = 768"`。
- `.github/skills/` 與未完成的 `docs/*/` 中的舊名稱要更新。已完成的 `docs/*/PLAN.md` 不改。

## 驗證改名

- `npm run test:unit`、`lint:fsd`、`format:check`、`build`，以及各 Lua 與產物測試（清單在 `docs/constant-rename/PLAN.md` 的「行為不變」）。
- 物件資料不變：改名前與改名後各建置一次，比較 `dist/map.w3x/` 的 `war3map.w3a`、`war3map.w3t`、`war3map.w3u` 的位元組。建置結果是確定的，所以位元組必須相同。不比較 `war3map.lua`，因為 Lua 名稱與建置日期會改變。
- 在測試地圖（`pnpm run test`）中確認：地圖可以啟動、存檔與讀檔正常、物品欄可以打開。
