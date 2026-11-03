---
建立日期: 2026-11-03
是否完成: true
---

# Feature-Sliced Design 分層重構

## 目的

- 使 `src/` 符合 `AGENTS.md` 的「分層規則（Feature-Sliced Design）」。
- 以 Steiger 檢查，必須沒有錯誤。

## 起因

- `src/shared/wc3-def/skill-natives.ts` 與 `wc3-skill-natives.ts` import `feature` 層的程式（`Defense`、`spellDefense`、`scholar`、`testEnemy`、`attributeModifier`）。shared 層依賴上層。
- `feature/skill` import `feature/combat`。同一層的模組互相 import。
- Steiger（`pnpx steiger ./src`，2026-11-03）：
  - `src/feature` 層名應為 `features`。
  - `src/shared/wc3-def` 缺少公開 API。

## 已決策（2026-11-03）

| 問題 | 決策 |
|---|---|
| 分層規則 | 寫入 `AGENTS.md`。層名使用 FSD 標準名稱（複數）。 |
| 檢查工具 | Steiger 加入 `devDependencies`，固定版本 0.9.0。新增 `pnpm run lint:fsd`。 |
| 執行者 | Claude。存檔系統 V1 至 V3（Codex）完成後才開始。 |
| `wc3-def` 的分類 | 依 WC3 概念分資料夾（方案 B）。每個資料夾內放介面與 WC3 實作。 |

## 步驟

### 1. Steiger

- `pnpm add -D steiger@0.9.0`。
- `package.json` 新增 `"lint:fsd": "steiger ./src"`。
- `AGENTS.md` 的檢查指令改為 `pnpm run lint:fsd`。

### 2. 層名

- `src/feature/` → `src/features/`。
- `src/entity/` → `src/entities/`。
- 更新全部 import、建置腳本（例如 `scripts/skill-objects.cjs` 讀取的路徑）、測試與文件中的路徑。

### 3. 拆分職責

| 內容 | 目前 | 新位置 |
|---|---|---|
| 傷害公式、燃燒、減速（`damage.ts`、`effects.ts`） | `feature/combat/` | `entities/combat/` |
| 戰鬥數值查詢介面（防禦、挑戰等級、迴避、可燃、護盾） | 混在 `shared/wc3-def/skill-natives.ts` | `entities/combat/` 定義介面 |
| 範例用的戰鬥數值實作（英雄、測試敵人） | 混在 `shared/wc3-def/wc3-skill-natives.ts` | `app/` |
| 技能範例（組合技能與暫停轉接） | `feature/skill/example.ts` | `app/` |
| 存檔範例（若組合多個功能） | 依存檔系統的實作 | `app/` |
| 暫停轉接 | `feature/combat/pause-bridge.ts` | `features/combat/` |
| `SkillRuntime` | 接收一個混合介面 | 分別接收 WC3 原生操作與戰鬥數值查詢 |

### 4. `wc3-def` 依 WC3 概念分類

```
src/shared/wc3-def/
  index.ts      公開 API
  types/        inputs.ts、events.ts
  trigger/      觸發器、事件註冊、同步資料
  timer/        週期計時器
  unit/         單位操作、傷害、移動速度、區域搜尋
  ability/      冷卻、停用、法力、技能說明
  effect/       特效、浮動文字
  item/         物品名稱與說明
  file/         Preload 檔案讀寫
```

- 每個資料夾放「介面 + WC3 實作」，例如 `unit/unit-natives.ts` 與 `unit/wc3-unit-natives.ts`。
- 檔名不得使用遊戲功能名稱（技能、存檔、i18n）。
- 現有檔案的歸屬：

| 現有檔案 | 新位置 |
|---|---|
| `natives.ts`、`wc3-natives.ts` | `trigger/` |
| `frame-natives.ts`、`wc3-frame-natives.ts` | `timer/` |
| `skill-natives.ts`、`wc3-skill-natives.ts` | 拆分至 `unit/`、`ability/`、`effect/`；遊戲規則部分移出 shared |
| `i18n-natives.ts`、`wc3-i18n-natives.ts` | 拆分至 `ability/`、`item/`、`unit/` |
| `file-io-natives.ts`、`wc3-file-io-natives.ts` | `file/` |
| `save-natives.ts`、`wc3-save-natives.ts` | 依內容歸類（存檔系統完成後決定） |
| `inputs.ts`、`events.ts` | `types/` |

### 5. 公開 API

- 每個 slice（`features/*`、`entities/*`）與 shared 的每個模組，以 `index.ts` 作為公開 API。
- 其他模組只從 `index.ts` import。

## 實作結果（2026-11-03）

### 結構

```
src/
  main.ts                 同時掛載技能範例與存檔範例
  app/                    skill-example.ts、save-example.ts、wc3-skill-natives.ts（WC3 組合 + 範例戰鬥數值）
  features/
    skill/                config/definitions.ts、model/runtime.ts、api/natives.ts（SkillNatives）
    combat/               model/pause-bridge.ts（ResourceNatives 在此定義）
    save/                 model/（format、codec、demo、manual-input、chat）、lib/hash.ts、config/keys.ts
  entities/
    combat/               model/（damage、effects、check、stats：CombatStats）
    character/            model/roles.ts（scholar、testEnemy）
  shared/wc3-def/         index.ts + types/ trigger/ timer/ unit/ ability/ effect/ item/ player/ random/ file/
```

### 與計畫不同的地方

| 項目 | 計畫 | 實際 | 原因 |
|---|---|---|---|
| slice 內部 | 未規定 | 分 `model/`、`lib/`、`config/`、`api/` | Steiger 的 `fsd/no-segmentless-slices` 規則要求 segment |
| D20 檢定（`check.ts`） | 未列出 | 移到 `entities/combat` | 範例戰鬥數值（迴避）也使用 `attributeModifier` |
| 角色數值 | 「app/」 | `entities/character` | 技能流程與範例都讀取，屬於領域資料 |
| `save-natives` | 依內容決定 | `player/`（`PlayerNatives`），另加 `getLocale` | 內容是玩家名稱與顯示文字 |
| 亂數 | 未列出 | `random/`（`RandomNatives`） | 不屬於其他概念 |
| `FrameNatives`、`FileIoNatives` | — | 改名為 `TimerNatives`、`FileNatives` | 以 WC3 概念命名 |
| 功能用的介面組合 | — | `SkillNatives`、`I18nNatives`、`SaveNatives` 在使用端以 `Pick` 組合 | shared 的檔名與介面不得含功能名稱 |
| 路徑別名 | — | 新增 `@features/*`、`@entities/*` | 跨層 import 不使用多層 `../` |
| `main.ts` | 存檔範例 | 同時掛載技能與存檔範例 | 一次遊戲即可驗證兩個範例 |

- 建置陷阱：`compiletime` 回呼由 war3-transformer 執行，不支援物件展開語法（`...`），建置會失敗並顯示 `Unexpected token 'var'`。改用 `Object.assign`。
- 遊戲內第一次驗證：同時掛載兩個範例時，第二個範例呼叫 `installWc3ClockDrivers()` 會丟出「時鐘已安裝驅動器」，存檔範例沒有啟動。改為可重複呼叫：第二次以後傳回第一次安裝的驅動器。
- `rxwc3/index.ts` 新增匯出 `scheduler/time` 的函式（`addTicks`、`durationTicks` 等），讓上層不必 import 內部檔案。

### 工具驗證

| 檢查 | 結果 |
|---|---|
| `pnpm run lint:fsd` | 沒有問題 |
| `pnpm run test:unit` | 523 項通過，0 項失敗 |
| `pnpm run format:check` | 通過 |
| Lua 驗證（save 11、skill 16、i18n 11 + file-io 12、benchmark 18） | 全部通過 |
| `pnpm run build` | 成功；`war3map.lua` 中 `2 ^ 1024` 為 0 處 |
| `test:skill:artifact`、`test:i18n:artifact` | 5 組、8 組通過 |
| shared 向上 import | 0 處 |

### 遊戲內驗證（2026-11-03，通過）

- 技能範例：火球術、寒冰箭、`-pause`／`-resume`、施法中斷，行為與重構前相同。通過。
- 存檔範例：`-save`、`-load`、`-load <存檔碼>`，行為與重構前相同。通過（修正時鐘驅動器重複安裝後）。

## 完成條件

1. `pnpm run lint:fsd` 沒有錯誤。
2. `src/shared/` 中沒有 import `features`、`entities`、`app` 的程式。
3. `pnpm run test:unit`、`pnpm run format:check`、`pnpm run build`、全部 Lua 驗證通過。
4. 遊戲內：技能範例與存檔範例的行為與重構前相同。
5. 更新受影響的 skill（`.github/skills/`）與設計稿中的路徑。

## 風險

- 搬移與改名影響大量 import。每完成一個步驟就執行測試與 Steiger。
- 建置腳本以字串路徑 `require` TypeScript 檔案（例如 `skill-objects.cjs` 讀取 `definitions.ts`），型別檢查無法發現路徑錯誤。完成後必須建置並在遊戲中驗證。
