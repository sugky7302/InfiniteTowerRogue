---
建立日期: 2026-11-05
是否完成: false
---

# 知識面板：任務

規格：`PLAN.md`。每個任務依 `AGENTS.md` 的開發流程進行：Codex 先寫測試，使用者實作，Codex 驗證。

## 介面約定

### `@entities/knowledge`（`src/entities/knowledge/`）

```ts
export const KnowledgeNodeType = { Core: "core", Form: "form", Effect: "effect", Modifier: "modifier", Trigger: "trigger", Bridge: "bridge" } as const;
export const KnowledgeLaw = { Form: "form", Flow: "flow", Energy: "energy", Motion: "motion", Space: "space", Perception: "perception", Mind: "mind" } as const;
export const KnowledgeDepth = { Basic: "basic", Professional: "professional", Advanced: "advanced", Unified: "unified" } as const;

export interface KnowledgeDefinition {
    readonly id: number;          // 目錄編號 0～31，等於存檔位置
    readonly name: string;        // 正式名稱，與 Hero.knowledge 相同
    readonly nodeType: KnowledgeNodeType;
    readonly law: KnowledgeLaw;   // 主要歸屬法則
    readonly depth: KnowledgeDepth;
    readonly summary: string;     // 一句說明
}

export const knowledgeCatalog: readonly KnowledgeDefinition[];
export const knowledgeExpUnit = 10;      // 1 經驗＝10 單位
export const knowledgeExpMax = 40000;    // 單位，等於 4000 經驗

export function knowledgeLevel(units: number): number;
export function knowledgeLevelThreshold(level: number): number; // 達到該等級需要的累積單位；0 級為 0
export function formatKnowledgeExp(units: number): string;      // 例如 350 →「35.0」
```

- 名稱與目錄順序以 `src/app/hero-save.ts` 的 `heroKnowledge` 為準。目錄必須包含它的全部名稱，順序相同。
- 曲線：`knowledgeLevelThreshold(n) = 50 × n × (n + 1) × knowledgeExpUnit`。這是暫定值，只在 `config/` 定義。

### 知識狀態

```ts
export interface KnowledgeState {
    readonly exp: readonly number[]; // 長度＝目錄長度；單位；0～knowledgeExpMax 的整數
}
export function createKnowledgeState(): KnowledgeState;              // 全部為 0
export function setKnowledgeExp(state, id, units): KnowledgeState;    // 傳回新狀態；超過上限時以上限保存；負數、非整數、未知編號丟出錯誤
export function knownKnowledgeIds(state): readonly number[];          // 經驗大於 0
export function formedKnowledgeNames(state): readonly string[];       // 達到 1 級，依目錄順序
```

### `@features/knowledge`（`src/features/knowledge/`）

```ts
export const KnowledgeSort = { Name: "name", Level: "level", NodeType: "nodeType", Law: "law" } as const;
export const KnowledgeStatus = { All: "all", Formed: "formed", Analyzing: "analyzing" } as const;

export interface KnowledgeFilter {
    readonly nodeType: KnowledgeNodeType | "all";
    readonly law: KnowledgeLaw | "all";
    readonly status: KnowledgeStatus;
}
export function knowledgeView(state, filter, sort): readonly number[]; // 篩選與排序後的目錄編號
export function scrollRows(total: number, columns: number, rows: number, top: number, delta: number): number; // 新的頂列
export function nextOption<T>(options: readonly T[], current: T): T; // 循環切換篩選與排序
```

## K1：知識目錄與等級（entities）

- 目錄：`heroKnowledge` 的 7 項，資料取自 `docs/dnd/知識/` 的頁首（主要節點類型、主要歸屬法則、知識深度）與第一段。
- `knowledgeLevel`：0 單位為 0 級；1～999 為 0 級（解析中）；1000 為 1 級；2999 為 1 級；3000 為 2 級；36000 為 8 級；40000 為 8 級。
- `formatKnowledgeExp`：一位小數，不使用浮點數除法累加。例如 0 →「0.0」，5 →「0.5」，350 →「35.0」，40000 →「4000.0」。
- 全部數值不得超過 2147483647。

完成條件：測試通過；`npm run lint:fsd` 沒有錯誤。

## K2：知識狀態與存檔

- 知識狀態函式依介面約定。
- 存檔：`hero` 區段的 `knowledge` 改為 32 個 0～40000 的經驗單位。存檔格式升版。
  - 舊版：旗標 1 轉換為 1000，0 轉換為 0。
  - 讀檔後 `Hero.knowledge` 等於 `formedKnowledgeNames`。
  - 存檔時保存知識狀態。
- 舊版存檔碼仍可讀取。竄改或超出範圍的值被拒絕。

完成條件：Node 與 Lua 存檔測試通過；`test:save:lua` 通過；位元數在測試中記錄。

## K3：篩選、排序與捲動（features 的 model）

- `knowledgeView`：
  - 只包含經驗大於 0 的知識。
  - 篩選三種條件同時成立。
  - 排序：名稱（字串比較）、等級（高到低）、節點類型（介面約定的順序）、法則（介面約定的順序）。同值時以目錄編號排列。
- `scrollRows`：頂列在 0 到「總列數－顯示列數」之間；項目少於一頁時為 0。
- `nextOption`：最後一項之後回到第一項；找不到目前值時傳回第一項。

完成條件：測試通過。

## K4：視窗框架與開關（features 的 ui、app）

- 依 `PLAN.md`「介面」：30 格（6×5）、篩選與排序按鈕、上下按鈕、滑鼠滾輪、說明框、關閉按鈕。
- 物品欄按鈕旁的「知識」按鈕；與物品欄互斥。
- 聊天指令 `-know`、`-know-exp <編號> <經驗>`。
- 格子只建立一次，捲動與篩選只改變內容與可見性。

完成條件：`npm run build` 成功；`npm run test:ui:artifact` 通過（加入新框架的檢查）。

## K5：遊戲內驗證（使用者）

- 打開與關閉；與物品欄互斥。
- `-know-exp` 設定多項經驗後：篩選、排序、捲動、說明框的等級與經驗正確。
- 存檔、重新開啟地圖、`-load` 後經驗相同。
- 關閉遊戲時不卡住。

## 進度

| 任務 | 測試 | 實作 | 驗證 |
|---|---|---|---|
| K1 | 未開始 | 未開始 | 未開始 |
| K2 | 未開始 | 未開始 | 未開始 |
| K3 | 未開始 | 未開始 | 未開始 |
| K4 | 未開始 | 未開始 | 未開始 |
| K5 | — | — | 未開始 |
