---
name: fsd-layers
description: 新增檔案、模組或功能，搬移程式，或決定程式要放在哪一層時使用。說明本專案的 Feature-Sliced Design 結構、Steiger 規則與已遇到的陷阱。
---

# FSD 分層

規則：`AGENTS.md` 的「分層規則（Feature-Sliced Design）」。重構記錄：`docs/fsd-refactor/PLAN.md`（已完成，2026-11-03）。

## 結構

```
src/
  main.ts          地圖入口，只掛載 app 的範例
  app/             組合功能、範例、範例用的規則實作（例如 CombatStats）
  features/<名稱>/  skill、combat、save
  entities/<名稱>/  combat（傷害、效果、檢定、CombatStats）、character（角色數值）
  shared/          rxwc3、wc3-def、i18n、file-io、logger
```

## 放在哪一層

| 程式 | 層 |
|---|---|
| 只包裝 WC3 原生函式，不含遊戲規則 | `shared/wc3-def/<WC3 概念>/` |
| 與遊戲無關的通用工具 | `shared/` |
| 遊戲規則、公式、領域資料（多個功能共用） | `entities/` |
| 玩家使用的一個功能 | `features/` |
| 組合多個功能、範例、規則的具體實作 | `app/` |

- 兩個功能都需要的程式，移到 entities；不要讓功能互相 import。
- shared 需要遊戲規則時：在 entities 定義介面，由 app 實作並注入。例如 `CombatStats`。
- 功能需要的原生操作組合（`Pick` + `&`），定義在功能自己的 `api/`，例如 `SkillNatives`。

## slice 內部

- features 與 entities 的 slice 必須有 segment 資料夾（Steiger `fsd/no-segmentless-slices`）：`model/`、`lib/`、`config/`、`api/`、`ui/`。
- 每個 slice 與 shared 模組以 `index.ts` 為公開 API。不要匯出內部祕密（例如 `features/save/config/keys.ts`）。
- 跨層 import 使用別名：`@features/<名稱>`、`@entities/<名稱>`、`@shared/<模組>`。同一 slice 內使用相對路徑。

## 陷阱

| 陷阱 | 處理 |
|---|---|
| `compiletime` 回呼由 war3-transformer 執行，不支援物件展開（`...`）。建置失敗，訊息為 `Unexpected token 'var'` | 使用 `Object.assign` |
| 建置腳本以字串路徑 `require` TypeScript 檔（例如技能定義、角色數值）。搬移檔案時型別檢查不會發現 | 搬移後搜尋 `require(root +`，並執行建置與地圖產物測試 |
| 多個範例都安裝時鐘驅動器 | `installWc3ClockDrivers()` 可重複呼叫 |
| 只執行 Steiger 無法發現行為錯誤 | 搬移後在遊戲中驗證受影響的範例 |

## 驗證

`pnpm run lint:fsd`（必須沒有問題）、`pnpm run test:unit`、`pnpm run format:check`、全部 Lua 驗證、`pnpm run build`、地圖產物測試，最後 `pnpm run test` 遊戲內驗證。
