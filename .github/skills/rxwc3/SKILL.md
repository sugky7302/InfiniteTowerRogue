---
name: rxwc3
description: 使用或修改 RxWC3（WC3 特化的 Observable、Signal、時鐘、事件中樞、同步與本地）時使用。說明 API 的選擇、執行規則、同步安全與已在遊戲中確認的陷阱。
---

# RxWC3

位置：`src/shared/lib/rxwc3/`，從 `index.ts` 匯入。規格與各階段記錄：`docs/rxwc3/PLAN.md`（M1 至 M5）。效能：`.github/skills/rxwc3-benchmark/SKILL.md`。

## 選擇 API

| 需求 | 使用 |
|---|---|
| 一次性的事件（傷害、施法、聊天、命令） | Observable：`onDamaging`、`onDamaged`、`onSpellChannel` 等、`onUnitDeath`、`onPlayerChat`、`onUnitOrder`。單位專屬用 `.of(unit)`；傷害用 `.ofTarget(unit)`／`.ofSource(unit)` |
| 一直有目前值的狀態（生命、法力、背包、語言） | Signal：`signal`、`computed`、`linkedSignal`、`effect`、`batch`、`untracked`、`toSignal`、`toObservable` |
| 遊戲規則的計時（冷卻、倒數、預告、潮汐） | `timer`、`interval`、`delay` 等，使用 `worldClock`（可暫停） |
| 介面計時 | `uiClock`（戰術暫停時仍前進） |
| 每幀更新的大量物件（投射物） | `frames()`：共用一個 1/32 秒計時器，受世界時鐘暫停控制 |
| 包裝任意 WC3 觸發器 | `fromTrigger` |
| 可重複使用的 operator 組合 | 獨立函式版 `pipe(...)` |

## 執行規則

- 分發依訂閱順序。傷害修正（增傷、護盾）依此順序串接。
- `onDamaging` 的 `setAmount()` 等方法只在分發期間有效。`delay` 之後呼叫會回報錯誤。事件資料是快照，事件結束後仍可讀取。
- 一個訂閱者拋出錯誤，不影響其他訂閱者。錯誤送到 `config.onUnhandledError`（預設 `logger.error`）。
- Effect 同步執行；用 `batch()` 合併寫入。`computed` 內不得寫入 signal。
- 同一時間點的任務依結算階段排序：`Phase.Combat` → `Extraction` → `World` → `Default`。
- 時鐘以整數毫秒保存時間（WC3 Lua 為 32 位元數字）。`pause()`／`resume()` 為引用計數。`clock.pauseChanges` 送出暫停狀態的變化。
- 地圖啟動時呼叫 `installWc3ClockDrivers()`。可以重複呼叫：多個功能或範例各自呼叫時，第二次以後傳回第一次安裝的驅動器（2026-11-03 起）。

## 同步與本地（防止不同步）

- `Observable<T, Sync | Local>`。會改變遊戲狀態的 API 只接受同步串流。
- `forLocalPlayer(player)`：同步轉本地。`sync(player, { prefix, encode, decode })`：本地轉同步；`prefix` 必須明確提供且不得重複；資料上限 240 位元組，不分段。
- 本地程式不得建立 handle（group、rect、trigger、timer）。需要的 handle 在共同流程預先建立。
- 本地 signal 使用 `localSignal`、`localComputed`、`localEffect`。同步的計算讀取本地 signal 時回報錯誤（`config.checkSignalSync`）。
- Operator 以 `deriveObservable` 傳遞執行時同步標記。`mergeMap`／`switchMap` 的內層為本地時，須傳入 `"local"`。

## 陷阱（已在遊戲中確認）

| 陷阱 | 處理 |
|---|---|
| TSTL 的 `try/catch` 每次執行都建立閉包 | 熱點路徑用 `protectedCall(fn, ...args)`（`core/protected-call.ts`） |
| TSTL 的 `for (let i...)` 共用一個變數 | 閉包需要迴圈變數時，在迴圈內複製到 `const` |
| `Number.MAX_SAFE_INTEGER` 在遊戲中等於 0.0 | 使用明確的字面常數 |
| 列印 TSTL 的 `Error` 物件會失敗（沒有 `debug` 函式庫） | 使用 `logger.error` |
| `whenCastCompleted`（`wc3/m5-logic.ts`）以施法結束事件取消，只適用引導型技能 | 瞬發技能的延遲效果用 `onSpellEffect` + `timer` |
| `PauseUnit` 會打斷引導 | 戰術暫停不得用 `PauseUnit` |
| Signal 傳播每個依賴者約 3.8 µs | 不要頻繁寫入依賴者很多的 signal |

## 範例

`wc3/m2-example.ts` 至 `m5-example.ts`：時鐘與暫停、事件中樞與傷害修正、同步與本地、預告技能與護盾。

## 驗證

- `pnpm run test:unit`、`node .cache/rxwc3/verify-lua.cjs`（Fengari：32 位元整數、64 位元浮點數，無法發現 float32 問題）。
- 會在 WC3 中執行的修改，必須在測試地圖中驗證。
- 待補驗證：長時間排程（18 分鐘、2 小時）、WC3 原生遊戲暫停、多人同步（合作模式前必須驗證）。
