# 開發規則

- 設計稿、決策與 skill 的規則，見「開發流程」的「設計稿」。
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
    - `tests/naming/constant-naming.spec.ts` 檢查 `src/` 的此規則（2026-11-06）。可變的狀態、實例、原生函式介面的實作與單一筆資料定義不改名，寫在它的允許清單中。新增這類常數時，把它加入允許清單。

```ts
export const KNOWLEDGE_EXP_UNIT = 10;
export const KNOWLEDGE_EXP_MAX = 40000;
export const KNOWLEDGE_CATALOG: readonly KnowledgeDefinition[] = [ /* … */ ];
```

## 開發流程

### 設計稿

1. 開始開發前，必須先寫設計稿。
2. 設計稿必須放在 `docs/<feature-name>/PLAN.md`。
3. `PLAN.md` 必須在開頭寫入兩個屬性：`created`（建立日期）與 `done`（是否完成）。
4. `done` 的初始值是 `false`。skill 通過審核後（「步驟」的「全部任務完成後」第 2 步），Claude 把 `done` 改為 `true`。
5. `PLAN.md` 完成後，必須將內容精煉為 skill，放入 `.github/skills/<skill-name>/`。
6. 同名 skill 已存在時，AI 助理依內容判斷是否更新。
7. 本節的 `research/` 與 `decisions/` 規則從 2026-11-09 開始生效，只適用於之後開始的開發項目。進行中的開發項目（例如 `knowledge-panel`）不補寫 `research/` 與 `decisions/`，但「步驟」與「助理的規則」立即生效。

決策的位置：

1. 寫 `PLAN.md` 時，決策必須寫入該開發項目的 `decisions/`。
2. 決策影響其他開發項目時，必須精煉到 skill 的 `references/`。開發項目的 `decisions/` 保留原文。
3. 決策必須在所有工作中生效時，必須在本文件加一行規則。這行規則必須連結到 skill 與決策原文。
4. `PLAN.md` 開頭必須列出「依據的決策」。開發項目沒有 `PLAN.md` 時，列在 `README.md` 開頭。
5. AI 助理執行任務時，必須讀取本文件、相關 skill 與「依據的決策」。
6. AI 助理必須追查這些決策的取代關係與相依決策。
7. `PLAN.md` 精煉為 skill 時，必須把「依據的決策」一起寫入 skill。

權威順序：

1. 決策原文是權威來源。skill 與本文件只寫摘要，並且必須連結到原文。
2. 摘要與原文衝突時，以原文為準。發現衝突時，必須修正摘要。
3. 較新、狀態為 `accepted`、且明確取代舊決策的決策優先。
4. 狀態為 `superseded` 的決策只供追溯，不可作為操作依據。
5. 研究文件（`research/`）只提供決策的輸入，不取代決策本身。

決策檔的格式：

1. 每個決策檔在開頭寫入下列屬性：

```yaml
---
status: proposed | accepted | superseded | rejected
date: 2026-11-09            # 最後一次改變 status 的日期
supersedes: []              # 本決策取代的決策（開發項目路徑與完整檔名）
superseded-by: []           # 取代本決策的決策（status 為 superseded 時必填）
depends-on: []              # 本決策依據的其他決策
---
```

2. `proposed`：還沒有得到 Arvin 同意。不可作為操作依據。
3. `accepted`：Arvin 已同意。可以作為操作依據。
4. `superseded`：已被其他決策取代。必須填寫 `superseded-by`。
5. `rejected`：Arvin 不同意。只供追溯。
6. 新決策取代舊決策時，必須同時更新兩個檔案：新決策的 `supersedes` 與舊決策的 `status`、`superseded-by`。
7. AI 助理追查取代關係與相依決策時，依 `supersedes`、`superseded-by` 與 `depends-on` 追查。

決策檔名：

1. 遷入的決策保留原完整檔名。
2. 引用決策時，必須寫出開發項目路徑與完整檔名，不可只寫編號。
3. 空的 `decisions/` 從 `0001` 開始編號。已有決策的 `decisions/`，新決策從該資料夾的最大編號加 1 開始。

### 步驟

Claude 負責串聯。Claude 依下列步驟調用下一個助理。

開發項目開始時：

1. Arvin 與 Claude 討論設計方向。
2. Claude 將討論紀錄寫入 `docs/<feature-name>/research/`。
3. Claude 調用 Codex。Codex 依討論紀錄撰寫 `PLAN.md` 與 `decisions/`。
4. Claude 調用 Antigravity 審核 `PLAN.md`。Antigravity 提出問題時，Claude 調用 Codex 修正。
5. Claude 調用 DeepSeek。DeepSeek 依 `PLAN.md` 切分任務，並寫入 `TASK.md`。
6. Claude 調用 Antigravity 審核 `TASK.md`。Antigravity 提出問題時，Claude 調用 DeepSeek 修正。

每個任務：

1. Claude 調用 DeepSeek。DeepSeek 定義介面與 Stub。
2. Claude 調用 Codex。Codex 依 TDD 原則撰寫測試程式碼。
3. Claude 調用 Antigravity 審核介面、Stub 與測試。Antigravity 對介面或 Stub 提出問題時，Claude 調用 DeepSeek 修正。對測試提出問題時，Claude 調用 Codex 修正。
4. Arvin 實作程式碼。Codex 只可以在 IDE 中提供補全建議。
5. Claude 詢問 Arvin 是否完成實作。Arvin 回答完成後，Claude 執行測試。
6. 測試通過時，Claude 調用 Antigravity，檢查實作是否符合 `TASK.md` 的完成條件。
7. 檢查通過，而且任務含有會在 WC3 中執行的程式時，Arvin 在測試地圖（`pnpm run test`）中驗證。驗證失敗時，Claude 依第 8 步判定原因。
8. 測試失敗、第 6 步檢查不通過或第 7 步驗證失敗時，Claude 調用 DeepSeek 判定原因：
    - 程式碼錯誤：回到第 4 步。
    - 測試錯誤：回到第 2 步。
    - 介面或 Stub 錯誤：回到第 1 步。
    - `PLAN.md` 或 `TASK.md` 錯誤：Claude 告訴 Arvin。Arvin 同意後，回到「開發項目開始時」的第 3 步（`PLAN.md`）或第 5 步（`TASK.md`），然後從本清單第 1 步重新開始。
9. 同一個失敗嘗試 2 次仍未解決時，Claude 讀取錯誤 log，並進行根本原因分析（RCA）。
10. 第 6 步與第 7 步都通過後，進行下一個任務。

全部任務完成後：

1. Claude 調用 DeepSeek，依「設計稿」一節將 `PLAN.md` 精煉為 skill。
2. Claude 調用 Antigravity 審核 skill。審核通過後，Claude 把 `PLAN.md` 的 `done` 改為 `true`。

### 調用方式

Claude 以下列方式調用其他助理。Claude 傳遞檔案路徑與要做的工作，不轉貼檔案內容。

| 助理 | 調用方式 |
|---|---|
| Antigravity | `agy.exe -p "<工作說明與檔案路徑>" --mode plan --print-timeout 900s`。只讀的審核與檢查使用 `--mode plan`；需要寫入檔案時使用 `--mode accept-edits`。提示必須寫「不得執行任何終端指令」 |
| Codex | `codex.exe exec -C <儲存庫路徑> -s <沙箱> --color never -o <輸出檔.md> -`，提示由 stdin 傳入。`codex.exe` 在 `*Codex*` Appx 套件的 `app\resources\` 中。只讀的工作使用 `-s read-only`，提示必須允許只讀的終端指令 |
| DeepSeek | `pwsh -File scripts/deepseek.ps1 -Mode <edit\|read> -Prompt "<工作說明與檔案路徑>" [-OutFile <輸出檔.md>]`。以 Claude Code CLI 連到 DeepSeek 的 Anthropic 相容 API，模型 `deepseek-flash`（API 接受的名稱）。`edit` 可以讀寫檔案，`read` 只讀，兩者都不能執行終端指令。API 金鑰只放在使用者環境變數 `DEEPSEEK_API_KEY`，不得寫入儲存庫 |

### 助理的規則

1. 撰寫者與審核者必須是不同的助理。
2. Claude 調用其他助理時，必須傳遞檔案路徑，不可轉貼檔案內容。
3. 除了測試檔與 Stub，AI 助理不可修改程式碼。
4. 測試通過 Antigravity 審核（「每個任務」第 3 步）之後，AI 助理修改測試的斷言前，必須先取得 Arvin 同意。第 3 步審核期間的修改不需要同意。
5. 「步驟」指定的檔案（研究紀錄、`PLAN.md`、`decisions/`、`TASK.md`、skill、測試檔、Stub），由負責的助理直接寫入。
6. AI 助理修改其他文件或工具設定前，必須先取得 Arvin 同意。
7. Claude 負責更新 `TASK.md` 的進度與「任務追蹤」一節的 Issue 標籤。

## 任務追蹤（GitHub Issue）

`TASK.md` 的每一個任務是一個 GitHub issue（2026-11-06）。

- 標題：`<開發項目名稱> <任務編號>：<TASK.md 的任務標題>`。例如：`知識面板 K2：知識狀態、存檔第 5 版、HeroExample 同步`。
- 內文：`PLAN.md` 與 `TASK.md` 的連結、`TASK.md` 中該任務的段落（包含完成條件）與進度。任務完成時，加上提交編號。
- milestone：每個開發項目一個，名稱與開發項目名稱相同。全部任務完成後，關閉 milestone。
- 儲存庫是公開的。建立 issue 前，必須先得到 Arvin 同意。

### 標籤

每個 issue 在每一組中最多使用一個標籤。

| 組 | 標籤 | 顏色 | 使用時機 |
|---|---|---|---|
| `type:` | `type: feature` | 綠 | 新功能 |
| | `type: change` | 藍 | 修改既有程式或規則 |
| | `type: bugfix` | 紅 | 修正錯誤 |
| | `type: docs` | 灰 | 只改文件、skill 或工具 |
| `task:` | `task: <開發項目資料夾名稱>` | 黑 | 屬於哪一個開發項目。例如：`task: knowledge-panel`。新增開發項目時，新增此標籤 |
| `stage:` | `stage: test` | 黃 | 「每個任務」第 1～3 步：DeepSeek 寫介面與 Stub，Codex 寫測試，Antigravity 審核 |
| | `stage: implement` | 黃 | 「每個任務」第 4～5 步：Arvin 實作 |
| | `stage: verify` | 黃 | 「每個任務」第 5～6 步：Claude 執行測試，Antigravity 檢查完成條件 |
| | `stage: in-game` | 黃 | 「每個任務」第 7 步：Arvin 在測試地圖中驗證 |
| `status:` | `status: paused` | 桃紅 | 暫停 |
| | `status: blocked` | 橘 | 等待其他任務或決定 |

- `type:` 與 `task:` 必須有。`status:` 只在例外時使用。
- 任務進入下一步時，同時更新 `TASK.md` 的進度與 `stage:` 標籤。
- 任務完成時，關閉 issue，並移除 `stage:` 標籤。提交訊息可以使用 `Closes #<編號>`。

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
