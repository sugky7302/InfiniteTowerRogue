# 開發規則

- 每次開發請先撰寫設計稿，先在 `docs/` 底下建立該設計的資料夾，然後新建 `PLAN.md` 於該資料夾。
    - `PLAN.md` 必須含有建立日期，以及是否完成兩個屬性。
    - 完成的 `PLAN.md`，請精煉為 skill，放到 `.github/skills` 裡面。若是已經存在，請根據內容，自主判斷要更新還是不變動。
- 撰寫時請遵守 ASD-STE100 原則，並使用正體中文書寫。
- TypeScript 檔名使用 Angular v20 命名法。
    - 使用 kebab-case，不加類型後綴。例如：`behavior-subject.ts`、`switch-map.ts`、`wc3-clock-driver.ts`。
    - 測試檔使用 `.spec.ts`。例如：`core.spec.ts`。
- TypeScript 不得使用 `enum` 或 `const enum`。
    - 固定值集合統一使用 `const` 物件、`as const` 與同名 `type`。
    - 使用 `(typeof 名稱)[keyof typeof 名稱]` 推導值的聯合型別。
    - 執行時使用物件屬性取得常數，型別註記使用同名 `type`。

```ts
export const TowerState = {
    Idle: "idle",
    Running: "running",
    Completed: "completed",
} as const;

export type TowerState = (typeof TowerState)[keyof typeof TowerState];
```

- 模組層級的常數使用大寫蛇形命名法（`UPPER_SNAKE_CASE`）（2026-11-05）。
    - 適用：純量常數（數字、字串、布林）與固定的資料表（陣列、對照表）。例如：`KNOWLEDGE_EXP_MAX`、`KNOWLEDGE_CATALOG`、`KNOWLEDGE_NODE_TYPE_ORDER`。
    - 不適用：帶同名 `type` 的常數物件（如上例的 `TowerState`），維持 PascalCase。函式內的區域常數、函式與類別，維持原本的命名。
    - 既有程式的名稱另外安排一次改名，在此之前不受此規則限制。

```ts
export const KNOWLEDGE_EXP_UNIT = 10;
export const KNOWLEDGE_EXP_MAX = 40000;
export const KNOWLEDGE_CATALOG: readonly KnowledgeDefinition[] = [ /* … */ ];
```

## 開發流程

1. 由我與 Claude 討論，擬定出設計稿，由 Codex 和 Antigravity 審核以及修正，最後將討論結果放置在 `docs/<開發項目>/PLAN.md` 裡。
2. Claude 根據 `PLAN.md`，切割出一個個任務，由 Antigravity 審核每項任務是否定義清楚，最後將結果放到 `docs/<開發項目>/TASK.md`。
3. Claude 會調用 Codex 以 TDD 原則，設計出測試項目。Antigravity 會檢驗 Codex 提出的測試項目，並新增、更新、修改、刪除不適宜的測試項目。
4. 由我本人實作程式碼，**AI Agents** 只能提供建議，不得直接修改。除非是 MDX 或者工具的使用，這部份需要先尋求我的同意。Claude 會要求我回覆是否完成，若是我回答完成，Claude 調用 Codex 以及 Antigravity 進行分開驗證、檢查，確認符合測試。
5. 檢查後，若是符合，則進行下一個任務，循環往復。若是不符合測試，則重複執行 4.。

# 分層規則（Feature-Sliced Design）

`src/` 分為五層，層名使用 FSD 標準名稱（複數）。上層可以 import 下層，下層不得 import 上層：

| 層 | 位置 | 內容 |
|---|---|---|
| app | `src/app/`、`src/main.ts` | 所有系統、範例與地圖入口 |
| widgets | `src/widgets/<名稱>/` | 獨立的視窗元件，例如知識面板 |
| features | `src/features/<名稱>/` | 玩家可使用的功能，例如技能、存檔 |
| entities | `src/entities/<名稱>/` | 遊戲領域的資料與規則，例如傷害公式、狀態效果、角色數值 |
| shared | `src/shared/lib/`、`src/shared/ui/` | 與遊戲規則無關的通用模組。`lib/`：RxWC3、wc3-def、logger、file-io、i18n；`ui/`：通用介面元件，例如 tooltip |

- 依賴方向只能是 app → widgets → features → entities → shared。
- 同一層的不同模組（slice）不得互相 import。兩個功能都需要的規則，移到 entities 層；組合多個功能的程式，放在 app 層。
- 每個模組以 `index.ts` 作為公開 API。其他模組只能從 `index.ts` import，不得 import 內部檔案。
- widgets、features 與 entities 的 slice 內，檔案放在 segment 資料夾：`model/`（狀態與規則）、`lib/`（內部工具）、`config/`（常數與資料）、`api/`（對外介面，例如原生函式組合）、`ui/`（介面）。
- 跨層 import 使用路徑別名：`@widgets/<名稱>`、`@features/<名稱>`、`@entities/<名稱>`、`@shared/lib/<模組>`、`@shared/ui/<元件>`。
- shared 層不得知道任何遊戲規則。WC3 原生函式介面只包裝原生操作；需要遊戲規則的查詢，在上層定義介面並實作。
- 以 Steiger 檢查分層：`pnpm run lint:fsd`。必須沒有錯誤。

# WC3 Lua 限制

以下限制已在遊戲中實測（2026-10-26）。Node 與 Fengari 的測試無法發現這些問題。

- WC3 Lua 使用 32 位元整數與 32 位元浮點數。
    - 整數上限是 2147483647。全部整數值與中間值不得超過此上限。
    - 浮點數約有 7 位有效數字。不得以浮點數累加長時間的值（例如時間）。請改用整數單位。
    - 不得使用 `Number.MAX_SAFE_INTEGER`、`Number.MAX_VALUE`、`Number.EPSILON` 或 `2 ** 53` 等常數。TSTL 會把 `Number.MAX_SAFE_INTEGER` 轉譯為 `2 ^ 1024`，它在遊戲中等於 `0.0`。請使用明確的字面常數。
    - Node 測試請用 `Math.fround` 模擬 32 位元浮點數，並檢查整數不超過上限。
- WC3 Lua 沒有 `debug` 函式庫。
    - TSTL 的 `Error` 沒有 `stack`。把 `Error` 物件轉為字串（`print`、`tostring`、字串串接）時，會因呼叫 `debug.getinfo` 而失敗，並遮蔽原始錯誤。
    - 輸出錯誤時，請使用 `src/shared/lib/logger.ts` 的 `logger.error`。不得直接 `print` 錯誤物件。
- TSTL 把 `for (let i = ...; ...; ...)` 轉譯為共用一個變數的 `while` 迴圈。每次迴圈不會建立新的 `i`。
    - 閉包（回呼、訂閱、計時器）在迴圈結束後讀取 `i` 時，會讀到最後的值。
    - 閉包需要迴圈變數時，請在迴圈內複製到 `const`。例如：`const id = index;`。
- Lua 中只有 `nil` 與 `false` 是假值。空字串 `""` 與 `0` 是真值（2026-11-04 在遊戲中確認）。
    - TSTL 把 `a || b` 轉譯為 `a or b`。`"" || "無"` 在遊戲中得到 `""`，`0 || 預設值` 得到 `0`。
    - 需要「空字串或 0 時使用預設值」時，請明確比較，例如 `text.length > 0 ? text : "無"`。
- 會在 WC3 中執行的程式，完成後必須在測試地圖（`pnpm run test`）中驗證。
