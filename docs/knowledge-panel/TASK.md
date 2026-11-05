---
建立日期: 2026-11-05
是否完成: false
---

# 知識面板：任務

規格：`PLAN.md`。每個任務依 `AGENTS.md` 的開發流程進行：Codex 寫測試，Antigravity 檢查測試，使用者實作，Codex 與 Antigravity 分開驗證。

## 介面約定

### `@entities/knowledge`（`src/entities/knowledge/`）

```ts
export const KnowledgeNodeType = { Core: "core", Form: "form", Effect: "effect", Modifier: "modifier", Trigger: "trigger", Bridge: "bridge" } as const;
export type KnowledgeNodeType = (typeof KnowledgeNodeType)[keyof typeof KnowledgeNodeType];
export const KnowledgeLaw = { Form: "form", Flow: "flow", Energy: "energy", Motion: "motion", Space: "space", Perception: "perception", Mind: "mind" } as const;
export type KnowledgeLaw = (typeof KnowledgeLaw)[keyof typeof KnowledgeLaw];
export const KnowledgeDepth = { Basic: "basic", Professional: "professional", Advanced: "advanced", Unified: "unified" } as const;
export type KnowledgeDepth = (typeof KnowledgeDepth)[keyof typeof KnowledgeDepth];

export interface KnowledgeDefinition {
    readonly id: number;          // 目錄編號，等於存檔位置。已發布的編號不得改變
    readonly name: string;        // 正式名稱，與 Hero.knowledge 相同
    readonly nodeType: KnowledgeNodeType;
    readonly law: KnowledgeLaw;   // 主要歸屬法則
    readonly depth: KnowledgeDepth;
    readonly summary: string;     // 一句說明
}

export const knowledgeCatalog: readonly KnowledgeDefinition[];
export const knowledgeExpUnit = 10;      // 1 經驗＝10 單位
export const knowledgeExpMax = 40000;    // 單位，等於 4000 經驗
export const knowledgeMaxLevel: number;  // knowledgeLevel(knowledgeExpMax)，目前為 8

export interface KnowledgeProgress {
    readonly level: number;
    readonly current: number;   // 本級已累積的單位
    readonly required: number;  // 本級所需的單位；最高等級時為 0
}

export function knowledgeLevel(units: number): number;
export function knowledgeLevelThreshold(level: number): number; // 達到該等級需要的累積單位；0 級為 0
export function knowledgeProgress(units: number): KnowledgeProgress;
export function formatKnowledgeExp(units: number): string;      // 例如 350 →「35.0」

// K2
export interface KnowledgeState {
    readonly exp: readonly number[]; // 長度＝knowledgeCatalog.length；單位；0～knowledgeExpMax 的整數
}
export function createKnowledgeState(): KnowledgeState;
export function knowledgeStateFromNames(names: readonly string[]): KnowledgeState;
export function setKnowledgeExp(state: KnowledgeState, id: number, units: number): KnowledgeState;
export function knownKnowledgeIds(state: KnowledgeState): readonly number[];
export function formedKnowledgeNames(state: KnowledgeState): readonly string[];
export function parseKnowledgeExp(text: string): number | undefined;
```

- 路徑別名 `@widgets/*` 與 AGENTS.md 的分層表已加入（2026-11-05，使用者同意）。Steiger 預設認得 `widgets` 層。
- 不合法的輸入一律丟出 `Error`，訊息不限。「不合法」指 `Number.isInteger` 為 false（包含 `NaN`、小數、`Infinity`）、小於下限，或大於 2147483647。
- 全部數值與中間值不得超過 2147483647。

### `@widgets/knowledge-panel`（`src/widgets/knowledge-panel/`）

```ts
import { FrameRect } from "@shared/ui";

export const KnowledgeSort = { Name: "name", Level: "level", NodeType: "nodeType", Law: "law" } as const;
export type KnowledgeSort = (typeof KnowledgeSort)[keyof typeof KnowledgeSort];
export const KnowledgeStatus = { All: "all", Formed: "formed", Analyzing: "analyzing" } as const;
export type KnowledgeStatus = (typeof KnowledgeStatus)[keyof typeof KnowledgeStatus];

export interface KnowledgeFilter {
    readonly nodeType: KnowledgeNodeType | "all";
    readonly law: KnowledgeLaw | "all";
    readonly status: KnowledgeStatus;
}
export interface KnowledgeEntry {
    readonly definition: KnowledgeDefinition;
    readonly units: number;
}

export const knowledgeNodeTypeOrder: readonly KnowledgeNodeType[]; // core, form, effect, modifier, trigger, bridge
export const knowledgeLawOrder: readonly KnowledgeLaw[];           // form, flow, energy, motion, space, perception, mind

export function knowledgeEntries(state: KnowledgeState): readonly KnowledgeEntry[];  // 目錄順序，包含 0
export function testKnowledgeEntries(count: number): readonly KnowledgeEntry[];      // -know-fill 的假知識
export function knowledgeView(entries: readonly KnowledgeEntry[], filter: KnowledgeFilter, sort: KnowledgeSort): readonly KnowledgeEntry[];
export function scrollRows(total: number, columns: number, rows: number, top: number, delta: number): number;
export function nextOption<T>(options: readonly T[], current: T): T;
export function knowledgeTooltip(entry: KnowledgeEntry): readonly string[]; // 傳給 Tooltip.show 的行
export function knowledgeFilterLabels(filter: KnowledgeFilter): { readonly nodeType: string; readonly law: string; readonly status: string }; // 三個篩選按鈕的文字
export function knowledgeSortLabel(sort: KnowledgeSort): string;
export function knowledgeScrollLabel(total: number, columns: number, rows: number, top: number): string;

export const knowledgeColumns = 6;
export const knowledgeRows = 5;
export interface KnowledgePanelLayout {
    readonly panel: FrameRect;              // 等於 screen
    readonly cells: readonly FrameRect[];   // 30 格，由左到右、由上到下
}
export function knowledgePanelLayout(screen: FrameRect): KnowledgePanelLayout;

// K5
export interface KnowledgePanelPort {
    entries(): readonly KnowledgeEntry[];
    onOpen(): void;
}
export interface KnowledgePanelControl {
    open(): void;
    close(): void;
    isOpen(): boolean;
    refresh(): void;
    stop(): void;
}
export function runKnowledgePanel(port: KnowledgePanelPort, owner: player, frames?: FrameNatives): KnowledgePanelControl;
```

### `@shared/ui`（`src/shared/ui/`，使用者決定，2026-11-05）

通用的介面元件，不含任何遊戲規則。知識面板是第一個使用者，之後的自製介面也使用它。

```ts
export interface FrameRect { readonly left: number; readonly right: number; readonly bottom: number; readonly top: number }

export function visibleScreen(clientWidth: number, clientHeight: number): FrameRect; // 整個螢幕的框架座標

export const TooltipSide = { Right: "right", Left: "left" } as const;
export type TooltipSide = (typeof TooltipSide)[keyof typeof TooltipSide];
export const TooltipGrow = { Down: "down", Up: "up" } as const;
export type TooltipGrow = (typeof TooltipGrow)[keyof typeof TooltipGrow];
export interface TooltipPlacement {
    readonly side: TooltipSide;  // 放在目標的右側或左側
    readonly grow: TooltipGrow;  // down：頂端對齊目標頂端；up：底端對齊目標底端
}
export function tooltipPlacement(target: FrameRect, screen: FrameRect, width: number, gap: number): TooltipPlacement;

export interface TooltipOptions {
    readonly parent: framehandle;
    readonly width?: number;    // 預設 0.24
    readonly gap?: number;      // 預設 0.005
    readonly padding?: number;  // 預設 0.008
}
export interface Tooltip {
    show(lines: readonly string[], target: FrameRect, screen: FrameRect): void;
    hide(): void;
    isVisible(): boolean;
    destroy(): void;
}
export function createTooltip(frames: FrameNatives, options: TooltipOptions): Tooltip | undefined;
```

## K1：知識目錄與等級（entities）

- 目錄：`heroKnowledge` 的 7 項，編號 0～6，名稱與順序相同。資料取自 `docs/dnd/知識/` 的頁首（主要節點類型、主要歸屬法則、知識深度）與第一段。
- `knowledgeLevel(units)`：
  - 0 為 0 級；1～999 為 0 級（解析中）；1000 為 1 級；2999 為 1 級；3000 為 2 級；36000 為 8 級；40000 為 8 級。
  - 大於 `knowledgeExpMax` 時以上限計算（40001、2147483647 為 8 級）。
  - 負數或非整數丟出錯誤。
- `knowledgeLevelThreshold(level)`：`50 × level × (level + 1) × knowledgeExpUnit`。`level` 必須是 0～`knowledgeMaxLevel` 的整數，否則丟出錯誤。
- `knowledgeProgress(units)`：
  - 輸入規則與 `knowledgeLevel` 相同（大於上限時以上限計算）。
  - 未達最高等級：`current = units − threshold(level)`，`required = threshold(level + 1) − threshold(level)`。例如 350 → `{0, 350, 1000}`；1500 → `{1, 500, 2000}`；3000 → `{2, 0, 3000}`。
  - 最高等級：`required = 0`，`current = units − threshold(knowledgeMaxLevel)`。例如 40000 → `{8, 4000, 0}`。
- `formatKnowledgeExp(units)`：
  - 一位小數。以 `Math.floor(units / 10)` 與 `units % 10` 組成字串，不使用浮點數除法的結果。
  - 例如 0 →「0.0」，5 →「0.5」，350 →「35.0」，40000 →「4000.0」。
  - 負數或非整數丟出錯誤。大於上限時照實顯示。

- `src/app/hero-save.ts` 的 `heroKnowledge` 改為 `knowledgeCatalog.map((entry) => entry.name)`。值不變（7 項，順序相同），既有測試不受影響。原因：Steiger 把沒有被任何程式 import 的 slice 視為錯誤（`fsd/insignificant-slice`，2026-11-05 實測），所以 K1 就讓 app 層 import 它。

完成條件：測試通過；`npm run test:unit` 通過；`npm run lint:fsd` 沒有錯誤。

測試整合：K1 實作前，使用 `npm run test:knowledge` 單獨執行。`tests/knowledge/` 暫時排除於 `tsconfig.test.json`，且未加入 `tests/run.ts`。K1 完成後，在 `tests/run.ts` 加入 `./knowledge/knowledge.spec`，並移除排除項目。

## K2：知識狀態、存檔第 5 版、`HeroExample` 同步

### 知識狀態（`@entities/knowledge`）

- `createKnowledgeState()`：長度等於目錄長度，全部為 0。
- `knowledgeStateFromNames(names)`：每個名稱設為 `knowledgeLevelThreshold(1)`（目前為 1000 單位）。未知名稱丟出錯誤。重複名稱只計一次。
- `setKnowledgeExp(state, id, units)`：
  - 傳回新狀態，不修改原狀態。
  - `id` 不是 0～`knowledgeCatalog.length − 1` 的整數時丟出錯誤。
  - `units` 是負數或非整數時丟出錯誤。大於上限時以上限保存。
- `knownKnowledgeIds(state)`：經驗大於 0 的編號，由小到大。
- `formedKnowledgeNames(state)`：經驗至少 1000 的名稱，依目錄順序。
- `parseKnowledgeExp(text)`：把經驗字串轉為單位，不使用浮點數乘法。
  - 接受 `整數` 或 `整數.一位數字`：「35」→ 350，「35.5」→ 355，「0.1」→ 1，「4000」→ 40000。
  - 拒絕（傳回 `undefined`）：空字串、負號、兩位以上小數、非數字、大於 4000。

### 存檔（`features/save` 與 `src/app/hero-save.ts`）

- 版本機制：`SaveParticipant.previous` 改為 `history`：

  ```ts
  export interface SaveSectionRevision {
      readonly until: number;   // 此格式使用到的最後版本
      readonly section: SaveSection;
      readonly empty: Record<string, SaveValue>;
      readonly migrate: (this: void, values: Record<string, SaveValue>) => Record<string, SaveValue>; // 轉為下一個格式
  }
  readonly history?: readonly SaveSectionRevision[]; // 依 until 由小到大
  ```

  - 版本 v 的區段：第一個 `until ≥ v` 的項目；沒有時使用目前的 `section`。
  - 讀取版本 v：依序執行每個 `until ≥ v` 項目的 `migrate`。
  - 裝備：`[{ until: 3, … }]`（沿用現有轉換）。英雄：`[{ until: 4, section: 旗標區段, migrate: 旗標 → 單位 }]`。
- `demoSaveVersion` 維持 2（沒有參與者時的範例格式）。有參與者時，最新版本＝`max(3, 全部 history 的 until + 1)`：
  - 傳入第 3 版參與者（`createHeroSaveParticipantsV3`，沒有 `history`）時為第 3 版，與現有測試相同。
  - 傳入目前的參與者時，註冊第 3、4、5 版，以第 5 版編碼。
  - 第 2 版轉第 3 版時，每個參與者使用第一個 `until ≥ 3` 項目的 `empty`；沒有時使用 `participant.empty`。
- `maxPackedBytes` 改為 800。
- 第 5 版 `hero.knowledge`：32 個 0～40000 的整數。
- 讀檔拒絕：
  - 經驗不是 0～40000 的整數。
  - 位置 `knowledgeCatalog.length`～31 不是 0。
  - `present` 為 false 時，任何經驗不是 0。
  - 重新簽章後仍不合法的資料。
- `hero-save.ts` 的知識名稱改用 `knowledgeCatalog`，不再使用 `runeScholar.knowledge`。
- `HeroSnapshot` 加入 `readonly knowledge: KnowledgeState`。`HeroSaveTarget.restore` 加入必填的第 4 個參數 `knowledge: KnowledgeState`。
- 既有測試：
  - 寫死第 4 版的數值（版本、碼長、分段數、`pack(…, 4)`）由 Codex 改為第 5 版的值。
  - 第 4 版的固定存檔碼保留，改為測試「舊版仍可讀取，且知識轉為 1000 單位」。
  - `encodeHeroSave` 等呼叫補上 `knowledge`。
- 讀檔後 `Hero.knowledge` 等於 `formedKnowledgeNames(knowledge)`。編碼時只使用知識狀態，不讀 `Hero.knowledge`。
- 位元數：測試記錄第 5 版的最壞位元數（6157）。

### `HeroExample`

- 每名英雄持有知識狀態。`Hero.knowledge` 每次由 `formedKnowledgeNames` 產生。
- 公開方法 `knowledgeState(): KnowledgeState`。`snapshot().knowledge` 傳回相同的值。
- `HeroExample.restore(hero, worn, held, knowledge?)`：省略 `knowledge` 時使用 `knowledgeStateFromNames(hero.knowledge)`，讓既有的 3 參數呼叫不變。
- 新英雄：`knowledgeStateFromNames(英雄設定的 knowledge)`。
- 快照、讀檔、升級保留知識狀態。`-hero-forget` 設為 `createKnowledgeState()`。

### 知識減少時卸下裝備

- `@features/equipment` 新增純函式：

  ```ts
  export type UnequipUnmetResult =
      | { readonly ok: true; readonly worn: EquipmentState; readonly held: BagState; readonly removed: readonly ItemInstance[] }
      | { readonly ok: false; readonly removed: readonly ItemInstance[] }; // 背包空間不足；removed 為需要卸下的物品
  export function unequipUnmetKnowledge(hero: HeroState, worn: EquipmentState, held: BagState): UnequipUnmetResult;
  ```

  - 依固定順序 主武器、副手、防具、工具 檢查每個位置（使用陣列，不使用 `Object.values`：Lua 中物件的列舉順序不固定，會改變背包落點）。物品的 `requiredKnowledge` 有任何一項不在 `hero.knowledge` 時，卸下此物品。只檢查知識，不檢查其他穿戴條件。
  - 卸下的物品依序以 `putInBag` 放入背包。
  - 背包的空格少於要卸下的件數時傳回 `ok: false`，不修改輸入。
  - 沒有要卸下的物品時，`ok: true`、`removed` 為空，`worn`、`held` 與輸入相同。
- `HeroExample` 改變知識狀態時（`-know-exp`、`-hero-forget`）：
  1. 以新的知識狀態產生新的 `Hero.knowledge`。
  2. 呼叫 `unequipUnmetKnowledge`。
  3. `ok: false` 時，知識、裝備與背包都不變，傳回 `["背包空間不足，無法卸下：<名稱>、<名稱>。"]`。
  4. `ok: true` 時一起提交，然後呼叫 `refresh()`（重新計算裝備加成與戰鬥數值，並通知物品欄與知識視窗）。有卸下的物品時，訊息再加一行 `"已卸下：<名稱>、<名稱>。"`。
  - 名稱使用物品基底的名稱。
- 測試：
  - 穿戴術式手冊 → `-know-exp 6 99.9` → 手冊在背包中，可以存檔，讀檔後狀態相同。
  - 背包空格剛好等於要卸下的件數 → 成功，背包已滿。
  - 背包已滿時同樣操作 → 失敗，知識仍為 1 級，手冊仍穿戴。
  - 卸下的物品保留原本的物品編號與詞綴。
  - `-hero-forget` 適用同一規則。

完成條件：`npm run test:unit`、`npm run test:save:lua`、`npm run test:hero:lua` 通過；舊版（第 3、4 版）固定存檔碼仍可讀取。

## K3：`@shared/ui` 的螢幕範圍與浮動說明框

使用者決定把說明框標準化，放到 `@shared/ui`（2026-11-05）。它不含遊戲規則，只接收文字行與目標位置。

### 原生函式（`@shared/wc3-def`）

- `FrameNatives` 加入：
  - `getEventValue(): number`：`BlzGetTriggerFrameValue()`。
  - `getLocalClientWidth(): number`、`getLocalClientHeight(): number`：`BlzGetLocalClientWidth()`、`BlzGetLocalClientHeight()`。只能用於本地顯示。
- 假實作：可以設定這三個值。螢幕寬高的預設值為 800、600（4:3）。

### 純函式

- `visibleScreen(clientWidth, clientHeight)`：
  - 可見寬度 `w = 0.6 × clientWidth ÷ clientHeight`。傳回 `{ left: 0.4 − w ÷ 2, right: 0.4 + w ÷ 2, bottom: 0, top: 0.6 }`。
  - 例如 4:3 → `left 0、right 0.8`；16:9 → 寬約 1.0667；21:9 → 寬 1.4。
  - 任一參數不是正的有限數（包含 0）時，傳回 4:3 的範圍 `{0, 0.8, 0, 0.6}`。原因：視窗最小化時，本地寬高可能為 0。
- `tooltipPlacement(target, screen, width, gap)`：
  - `side`：`target.right + gap + width ≤ screen.right` 時為 `Right`，否則為 `Left`。
  - `grow`：目標中心 `(target.top + target.bottom) ÷ 2` 大於等於畫面中心 `(screen.top + screen.bottom) ÷ 2` 時為 `Down`，否則為 `Up`。
  - `width`、`gap` 必須是非負的有限數；`target`、`screen` 的四個值必須是有限數，且 `left ≤ right`、`bottom ≤ top`。否則丟出錯誤。

### 框架

- 新增 `assets/ui/tooltip.fdf`，加入主 TOC。樣板 `ItrTooltip`（背景），子框架 `ItrTooltipText`（文字）。
- `createTooltip(frames, options)`：
  - 在 `options.parent` 下建立一個 `ItrTooltip`。建立失敗時傳回 `undefined`，不丟出錯誤。
  - 背景與文字都不接收滑鼠（`setEnabled(false)`），讓 Tooltip 覆蓋其他格子時，不阻擋格子的懸停與滾輪。
  - 建立後隱藏。文字框架只設定寬度 `width − 2 × padding`（高度 0，讓文字決定高度）。背景的四角對齊文字的四角，加上 `padding`。
  - `show(lines, target, screen)`：
    - 文字為 `lines` 以 `"\n"` 連接。`lines` 為空時等於 `hide()`。
    - 以 `tooltipPlacement(target, screen, width, gap)` 定位（`setAbsPoint`）：`Right` 時背景左邊為 `target.right + gap`，`Left` 時背景右邊為 `target.left − gap`；`Down` 時背景頂端為 `target.top`，`Up` 時背景底端為 `target.bottom`。
    - 然後顯示。
  - `hide()` 隱藏；`isVisible()` 傳回目前狀態；`destroy()` 銷毀背景（子框架一起銷毀），之後的呼叫不做任何事。
  - 只改變本地顯示。使用端只在本地玩家的事件中呼叫 `show`、`hide`。
- `width` 是背景的總寬度（包含 `padding`），所以 `tooltipPlacement` 的水平判斷已包含邊距。字型與字級固定在 `ItrTooltipText` 樣板中。
- 高度不受控制。上下半部的規則保證至少有半個畫面的空間；使用端的文字應短於此高度（知識說明為一句）。
- 測試使用假 `FrameNatives`：檢查樣板名稱、文字、對齊點、可見性，以及反覆 `show` 不建立新框架。

### 遷移

- 物品欄目前的固定說明框不在本任務中改變。之後是否改用 `@shared/ui` 的 Tooltip 另行決定。

完成條件：測試通過；`npm run test:unit`、`npm run test:ui:artifact`（加入 `tooltip.fdf` 與 TOC 的檢查）、`npm run lint:fsd` 通過。

## K4：知識面板的純函式（widgets）

### 設定

- 路徑別名與 AGENTS.md 已完成（見介面約定）。`widgets/knowledge-panel` 在 K5 前只被測試使用，`lint:fsd` 會有 `fsd/insignificant-slice` 錯誤，K5 由 app 層 import 後消失。

### 純函式（`@widgets/knowledge-panel`）

- `knowledgeEntries(state)`：每個目錄項目一筆，依目錄順序。
- `testKnowledgeEntries(count)`：`count` 筆假知識。第 i 筆（i 從 0 開始）：
  - 編號 `1000 + i`，名稱「測試知識 i+1」，說明「測試用的假知識。」。
  - 節點類型、法則、深度依 `knowledgeNodeTypeOrder`、`knowledgeLawOrder`、`["basic", "professional", "advanced", "unified"]` 以 i 循環。
  - 經驗依 1、1000、3000、40000 以 i 循環。
  - `count` 不是 0～100 的整數時丟出錯誤。
- `knowledgeView(entries, filter, sort)`：
  - 只包含 `units > 0` 的項目。
  - 三種篩選同時成立。`Formed`：`units ≥ 1000`。`Analyzing`：`1 ≤ units ≤ 999`。
  - 排序：
    - `Name`：名稱以 `<` 比較，小的在前。
    - `Level`：等級高到低；同級時經驗高到低。
    - `NodeType`、`Law`：依 `knowledgeNodeTypeOrder`、`knowledgeLawOrder` 的位置。
    - 同值時以編號由小到大。
  - 不修改輸入陣列。
- `scrollRows(total, columns, rows, top, delta)`：
  - `total` 是篩選後的項目數。總列數＝⌈total ÷ columns⌉，以整數運算計算。
  - 傳回 `top + delta` 限制在 0～max(0, 總列數 − rows)。
  - `total`、`top`、`delta` 必須是整數，`total ≥ 0`；`columns`、`rows` 必須是正整數。否則丟出錯誤。
- `nextOption(options, current)`：傳回下一項；最後一項之後回到第一項；找不到目前值時傳回第一項；`options` 為空時丟出錯誤。
- `knowledgeTooltip(entry)`：傳回每行一個字串，共 7 行，交給 `Tooltip.show`。例如火焰 1500 單位：

    ```
    火焰
    節點類型：核心
    主要歸屬法則：能量
    知識深度：基礎
    等級：1 級
    經驗：50.0／200
    <summary>
    ```

  - 等級行：0 級為「等級：解析中」，其他為「等級：N 級」。
  - 經驗行：`required > 0` 時為「經驗：`formatKnowledgeExp(current)`／`Math.floor(required / 10)`」。分母一定是整數經驗，所以不顯示小數，例如 350 單位為「經驗：35.0／100」。`required = 0` 時為「經驗：已達最高等級」。
- 中文顯示名稱放在 `config/`：
  - 節點類型：核心、型態、效果、修飾、觸發、橋接。
  - 法則：形體、流動、能量、動力、空間、感知、心智（`docs/dnd/規則/知識體系.md`「七大法則與性質知識」）。
  - 深度：基礎、專業、高等、統合。
  - 狀態：全部、已形成、解析中。排序：名稱、等級、節點類型、法則。
- `knowledgeFilterLabels(filter)`：三個按鈕各自的文字，例如 `{ nodeType: "類型：全部", law: "法則：能量", status: "狀態：已形成" }`。
- `knowledgeSortLabel(sort)`：例如「排序：等級」。
- `knowledgeScrollLabel(total, columns, rows, top)`：
  - 參數規則與 `scrollRows` 相同。`top` 先以 `scrollRows(total, columns, rows, top, 0)` 限制。
  - 文字為「限制後的頂列 + 1／最大頂列 + 1」，例如「1／3」；項目少於一頁時為「1／1」。
- 初始狀態與切換順序（`config/`）：
  - 初始篩選 `{ nodeType: "all", law: "all", status: "all" }`，初始排序 `"name"`，初始頂列 0。
  - 類型：`["all", ...knowledgeNodeTypeOrder]`；法則：`["all", ...knowledgeLawOrder]`；狀態：`["all", "formed", "analyzing"]`；排序：`["name", "level", "nodeType", "law"]`。
- `knowledgePanelLayout(screen)`：
  - `panel` 等於 `screen`。
  - 版面：上方標題列高 0.05，下方邊距 0.03，右側捲軸寬 0.04，左右邊距 0.02。格子區為其餘範圍，置中排列 6×5 格；格子為正方形，邊長為「格子區寬 ÷ 6」與「格子區高 ÷ 5」中較小者減去間距 0.005。
  - `cells` 有 30 個，由左到右、由上到下。全部格子在 `screen` 內，互不重疊。
  - `screen` 不合法（非有限數、`left > right`、`bottom > top`）時丟出錯誤。
  - 測試 `visibleScreen` 的 4:3、16:9、21:9 結果。

完成條件：測試通過；`npm run test:unit` 通過；`npm run lint:fsd` 只有 `widgets/knowledge-panel` 的 `fsd/insignificant-slice` 錯誤。

## K5：面板框架（widgets）與組合（app）

### 實驗 E1（實作前，使用者在遊戲內執行）

- 在寬螢幕下，比較掛在 `ORIGIN_FRAME_GAME_UI` 與 `ConsoleUIBackdrop`（`fromName("ConsoleUIBackdrop", 0)`）的框架能否超出 4:3 區域；也在 `hideOrigin(true)` 後各看一次。
- 通過條件：4:3、16:9、21:9，以及內建面板隱藏前後，測試框架都能放到可見範圍的四個角落，並能接收滑鼠事件。
- 結果決定面板與 Tooltip 的父框架。結果記錄在 `PLAN.md`。

### 框架（`@widgets/knowledge-panel`）

- 新增 `assets/ui/knowledge.fdf`，加入主 TOC。樣板與子框架名稱：
  - `ItrKnowledgePanel`：背景。
  - `ItrKnowledgeCell`：格子按鈕。子框架 `ItrKnowledgeCellIcon`（圖示）、`ItrKnowledgeCellName`（名稱文字）。
  - 其他按鈕沿用物品欄的按鈕樣板。說明框使用 `@shared/ui` 的 `createTooltip`。
- 顯示文字：標題「知識」，關閉「關閉」，捲動「上」、「下」，開關按鈕「知識」。
- `KnowledgePanelPort`：
  - `entries()`：每次刷新時讀取。
  - `onOpen()`：打開時呼叫，app 用它關閉物品欄。
- `runKnowledgePanel(port, owner, frames = wc3FrameNatives)`：參數順序與 `runInventoryUi` 相同。
  - 建立「知識」開關按鈕（在物品欄按鈕旁），並註冊 `-know` 聊天指令，做法與物品欄的「物品欄」按鈕和 `-bag` 相同。點擊或 `-know` 打開時呼叫 `port.onOpen()`。
  - 框架建立前呼叫 `open`、`close`、`refresh` 時，只記錄狀態；建立後依記錄的狀態顯示。
  - 遊戲時間 0 秒後建立一次全部框架：背景、標題、篩選按鈕 3 個（類型、法則、狀態）、排序按鈕、關閉按鈕、30 格、上下按鈕、捲動文字、一個 Tooltip。
  - 每次打開時，以 `visibleScreen(getLocalClientWidth(), getLocalClientHeight())` 與 `knowledgePanelLayout` 重新定位（只影響本地顯示）。
  - 篩選與排序按鈕以 `nextOption` 循環切換，然後頂列以 `scrollRows(…, 0)` 修正。
  - 滾輪：面板與 30 格都註冊。`getEventValue() > 0` 時 `delta = −1`（向上），`< 0` 時 `delta = +1`。
  - 沒有內容的格子隱藏。
  - Tooltip：
    - 格子的 `MOUSE_ENTER` 時以 `knowledgeTooltip` 與該格的位置呼叫 `show`，`MOUSE_LEAVE` 時 `hide`。
    - 捲動、篩選、排序、`refresh` 後：滑鼠所在格子有內容時重新 `show`，沒有內容時 `hide`。關閉面板時 `hide`。
  - `refresh()`：重新讀取 `entries()`，頂列以 `scrollRows(…, 0)` 修正，更新格子與 Tooltip。app 在 `-know-exp`、`-hero-forget`、`-know-fill`、讀檔之後都呼叫它。
  - `open`、`close`、`isOpen` 只用本地玩家切換可見性。`stop` 銷毀觸發器、Tooltip 與父框架。
- 測試用假 `FrameNatives`：框架數量只在建立時增加，捲動、篩選、反覆開關後不增加。

### 組合（app）

- 物品欄：`runInventoryUi(port: InventoryPort, owner: player, frames: FrameNatives = wc3FrameNatives, onOpen?: (this: void) => void): InventoryControl`。`InventoryControl` 定義在 `src/app/inventory-ui.ts`，欄位與 `KnowledgePanelControl` 相同（`open`、`close`、`isOpen`、`refresh`、`stop`）。`tests/ui/frames.spec.ts` 由 Codex 把 `stop()` 改為 `.stop()`。
- `src/app/skill-example.ts` 組合兩者：知識面板的 `onOpen` 關閉物品欄，物品欄的 `onOpen` 關閉知識面板（按鈕、`-bag`、`-know` 都適用）。`port.entries` 由 `HeroExample` 提供。
- 聊天指令（`HeroExample.command`）：
  - `-know-exp <編號> <經驗>`：把累積經驗設定為指定值（不是增加）。編號為 0～目錄長度 − 1 的整數（「0」有效；「-1」、「7」、「1.5」、「a」、空白無效）；經驗以 `parseKnowledgeExp` 轉換（「0」有效）。任一無效時不改變狀態。成功時傳回 `["<名稱>：<formatKnowledgeExp(units)> 經驗"]`，例如 `-know-exp 0 35` →「火焰：35.0 經驗」；失敗時傳回 `["用法：-know-exp <0～6> <0～4000，最多一位小數>"]`（範圍依目錄長度與上限產生）。成功後更新 `Hero.knowledge`、物品欄說明，並刷新知識視窗。
  - `-know-fill`：開關測試模式。傳回 `["知識測試模式：開啟（40 項假知識）"]` 或 `["知識測試模式：關閉"]`，並刷新知識視窗。不保存，不影響 `Hero.knowledge`。
  - `HeroExample.knowledgeEntries(): readonly KnowledgeEntry[]`：`knowledgeEntries(knowledgeState())`，測試模式時再加上 `testKnowledgeEntries(40)`。
- 指令說明文字加入以上三個指令。

完成條件：`npm run test:unit`、`npm run build` 成功；`npm run test:ui:artifact` 通過（加入 `knowledge.fdf`、TOC 與樣板名稱的檢查）；`npm run lint:fsd` 沒有錯誤。

## K6：遊戲內驗證（使用者）

- 打開與關閉；與物品欄互斥（按鈕、`-bag`、`-know`）。
- `-know-exp` 設定多項經驗後：篩選、排序、說明框的等級與經驗正確。
- `-know-fill` 後：滾輪（滑鼠在格子上與空白處）、上下按鈕、末列、篩選後的頂列正確。
- 浮動說明框：在四個角落與最右一欄的格子上，說明框完整顯示在畫面內；離開格子後隱藏；4:3 與寬螢幕各看一次。說明框蓋住其他格子時，移到被蓋住的格子仍會切換說明，滾輪仍可捲動。
- 面板在寬螢幕下佔滿整個螢幕。
- `-know-exp 0 0` 後，需要「火焰」的裝備不能穿戴，物品欄說明顯示缺少知識；`-know-exp 0 100` 後恢復。
- 穿戴術式手冊後 `-know-exp 6 99.9`：手冊自動回到背包，顯示「已卸下」；之後可以存檔與讀檔。背包已滿時，指令失敗，手冊仍穿戴。
- 存檔、重新開啟地圖、`-load` 後經驗相同（包含解析中的項目）。
- 讀取第 4 版的舊存檔碼後，原有的知識為 1 級。
- 反覆開關後，關閉遊戲時不卡住。

## 進度

| 任務 | 測試 | 實作 | 驗證 |
|---|---|---|---|
| K1 | 完成（82 組；Codex 撰寫，Antigravity 檢查） | 未開始 | 未開始 |
| K2 | 未開始 | 未開始 | 未開始 |
| K3 | 未開始 | 未開始 | 未開始 |
| K4 | 未開始 | 未開始 | 未開始 |
| K5 | 未開始 | 未開始 | 未開始 |
| K6 | — | — | 未開始 |
