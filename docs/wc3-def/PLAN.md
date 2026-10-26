---
建立日期: 2026-10-26
是否完成: true
---

# wc3-def：WC3 共用定義與原生函式綁定

## 目的

- 把與 RxWC3 無關的 WC3 定義移到 `src/shared/wc3-def/`。
- RxWC3 只 import 這些定義。
- 其他模組（存檔系統、i18n、戰鬥系統）也使用同一份定義。

## 已決策（2026-10-26）

| 問題 | 決策 |
|---|---|
| Handle 型別從哪裡來？ | 先直接使用 `war3-types-strict` 的全域型別（`handle`、`unit`、`player`、`trigger`、`attacktype`、`damagetype`、`weapontype` 等）。有無法解決的衝突時，才在 `wc3-def/` 中自行宣告。 |
| 哪些內容移出 RxWC3？ | 與 Observable、Subject 無關的內容：handle 型別、事件資料、原生函式介面、原生函式的 WC3 實作。 |
| 執行者 | Claude 直接修改。RxWC3 M4 完成後才開始，避免與 M4 衝突。 |

## 搬移內容

| 內容 | 目前位置 | 新位置 |
|---|---|---|
| `Handle`、`UnitHandle`、`PlayerHandle`、`TriggerHandle`、`AttackType`、`DamageType`、`WeaponType` | `rxwc3/wc3/event-natives.ts` | 刪除。改用 `war3-types-strict` 的全域型別。 |
| `DamageEvent`、`DamagingEvent`、`SpellEvent`、`DeathEvent`、`ChatEvent`、`UnitInput`、`UnitEventKind` | `rxwc3/wc3/event-natives.ts` | `wc3-def/events.ts` |
| `TriggerNatives`、`EventNatives` | `rxwc3/wc3/event-natives.ts` | `wc3-def/natives.ts` |
| 原生函式的 WC3 實作 | `rxwc3/wc3/wc3-event-natives.ts` | `wc3-def/wc3-natives.ts` |
| M4 新增的原生函式介面與實作（`GetLocalPlayer`、同步資料） | 依 M4 結果 | 同上規則 |
| 計時器原生函式的模組內宣告 | `rxwc3/wc3/wc3-clock-driver.ts` | 刪除。改用 `war3-types-strict` 的宣告。驅動器本身留在 RxWC3。 |

留在 RxWC3：事件中樞、事件串流（`onDamaged` 等）、`fromTrigger`、`forLocalPlayer`、`sync`、時鐘驅動器、範例。

## 步驟

1. 在 `tsconfig.test.json` 與 `tsconfig.rxwc3.json` 的 `types` 加入 `war3-types-strict/1.33.0`。
2. 確認與 Node 型別沒有衝突（`tsc --noEmit -p tsconfig.test.json`）。有衝突時，記錄衝突內容，改為在 `wc3-def/` 中宣告。
3. 建立 `src/shared/wc3-def/`，搬移上表內容。
4. 更新 RxWC3 與測試的 import。RxWC3 從 `index.ts` 繼續匯出事件資料型別，保持既有 API。
5. 驗證。

## 限制

- `wc3-def/` 的型別只用於型別檢查。Node 測試不得呼叫 WC3 原生函式。原生函式仍經由「原生函式介面」注入。

## 驗證

- `pnpm run test:unit` 全部通過。
- `pnpm run build` 成功。
- 獨立 TSTL 轉譯與 `.cache/rxwc3/verify-lua.cjs` 通過。
- RxWC3 中沒有自行宣告的 handle 型別。

## 實作結果（2026-10-26）

### 檔案

| 檔案 | 內容 |
|---|---|
| `src/shared/wc3-def/inputs.ts` | `UnitInput`、`PlayerInput`、`unwrapUnit`、`unwrapPlayer` |
| `src/shared/wc3-def/events.ts` | `DamageEvent`、`DamagingEvent`、`SpellEvent`、`DeathEvent`、`ChatEvent`、`UnitEventKind` |
| `src/shared/wc3-def/natives.ts` | `TriggerNatives`、`EventNatives`、`SyncNatives` |
| `src/shared/wc3-def/wc3-natives.ts` | `wc3EventNatives`、`wc3SyncNatives` |

已刪除：`rxwc3/wc3/event-natives.ts`、`rxwc3/wc3/wc3-event-natives.ts`、`rxwc3/sync/sync-natives.ts`、`rxwc3/wc3/wc3-sync-natives.ts`。M3 與 M4 範例、時鐘驅動器中自行宣告的原生函式也已刪除。

### 與計畫不同之處

- `war3-types-strict` 與 TypeScript 的 DOM 型別都宣告了 `Location`，因此發生衝突。解決方法：在 `tsconfig.test.json` 指定 `"lib": ["ES2022"]`，不載入 DOM 型別。Node 測試不需要 DOM 型別。
- `war3-types-strict` 是嚴格版。`GetTriggerUnit()`、`Player()`、`BlzGetEventAttackType()` 等的傳回型別包含 `undefined`。在事件回呼中這些值一定存在，所以 WC3 實作與範例使用 `!`。
- M4 的 `SyncNatives` 與 `PlayerInput` 也依相同規則移到 `wc3-def/`。
- RxWC3 的 `index.ts` 重新匯出 `wc3-def` 的型別。舊的 `UnitHandle`、`PlayerHandle` 等別名已移除；使用者改用全域型別 `unit`、`player` 等。

### 驗證

| 檢查 | 結果 |
|---|---|
| `pnpm run test:unit` | 285 項通過、0 項失敗 |
| `pnpm run build` | 成功 |
| 獨立 TSTL 轉譯與 `.cache/rxwc3/verify-lua.cjs` | 46 組通過、0 組失敗 |
| `war3map.lua` 中的 `2 ^ 1024` | 0 處 |
| RxWC3 中自行宣告的 handle 型別 | 0 處 |

遊戲內驗證與 RxWC3 M4 一起執行，全部通過（見 `docs/rxwc3/m4/PLAN.md`）。
