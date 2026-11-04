---
name: wc3-def
description: 新增或使用 WC3 原生函式、handle 型別、事件資料或「原生函式介面」時使用。說明如何讓呼叫 WC3 的程式仍能在 Node 中測試。
---

# wc3-def：WC3 共用定義與原生函式綁定

位置：`src/shared/wc3-def/`。規格：`docs/wc3-def/PLAN.md`。

## 規則

- Handle 型別（`unit`、`player`、`trigger`、`timer`、`attacktype` 等）與原生函式，直接使用 `war3-types-strict` 的全域宣告。**不要自行 `declare`**。
- `war3-types-strict` 是嚴格版：`GetTriggerUnit()`、`Player()`、`BlzGetEventAttackType()` 等傳回值包含 `undefined`。確定有值時（例如事件回呼中）使用 `!`。
- 與 Observable 無關的 WC3 定義放在 `wc3-def/`。RxWC3、i18n、技能系統只 import 它們。

## 原生函式介面

呼叫 WC3 的程式拆成兩層，讓邏輯可以在 Node 中測試：

| 檔案 | 內容 |
|---|---|
| `<概念>/<概念>-natives.ts` | 介面。只宣告原生操作 |
| `<概念>/wc3-<概念>-natives.ts` | WC3 實作。呼叫真正的原生函式 |
| `tests/.../fake-xxx.ts` | 測試用的假實作 |

依 WC3 概念分資料夾（2026-11-03 重構）。其他模組只從 `@shared/wc3-def`（`index.ts`）import：

| 資料夾 | 介面 | 內容 |
|---|---|---|
| `types/` | — | `inputs.ts`、`events.ts` |
| `trigger/` | `TriggerNatives`、`EventNatives`、`SyncNatives` | 觸發器、事件註冊、同步資料 |
| `timer/` | `TimerNatives` | 週期計時器 |
| `unit/` | `UnitNatives`、`UnitDamageNatives`、`UnitAreaNatives` | 單位查詢與命令、固定傷害、範圍列舉 |
| `ability/` | `AbilityNatives` | 冷卻、停用、技能說明 |
| `effect/` | `EffectNatives` | 特效、浮動文字 |
| `item/` | `ItemNatives` | 物品文字與列舉 |
| `player/` | `PlayerNatives` | 玩家名稱、顯示文字、用戶端語言 |
| `random/` | `RandomNatives` | 同步亂數 |
| `file/` | `FileNatives` | Preload 檔案讀寫、getIcon(ability)、setIcon(text, ability) |
| `frame/` | `FrameNatives` | TOC、樣板與類型建立、原點與子框架、位置與外觀、模型與動畫、焦點重設、框架事件與銷毀 |

- **檔名與介面不得使用遊戲功能名稱**（技能、存檔、i18n）。功能需要的組合在使用端定義，例如 `features/skill` 的 `SkillNatives`（以 `Pick` 與 `&` 組合）、`shared/i18n` 的 `I18nNatives`、`features/save` 的 `SaveNatives`。
- **介面不得包含遊戲規則**（防禦、挑戰等級等）。規則查詢在上層定義介面（例如 `entities/combat` 的 `CombatStats`），由 `app/` 實作。
- 需要 handle 的實作使用工廠函式，在共同流程呼叫一次，例如 `createWc3UnitDamage()`、`createWc3UnitArea()`，傳回 `{ natives, destroy }`。
- 邏輯模組透過參數或建構函式接收介面，預設值使用 WC3 實作。
- WC3 實作載入時不得呼叫原生函式。
- `FrameNatives` 使用原生 `framehandle`，不向使用端公開 w3ts。只有 `frame/wc3-frame-natives.ts` 使用 w3ts `Frame`；在呼叫時載入，讓 Node 可以匯入公開 API。建立失敗傳回 `undefined`，不向外拋出。
- 框架在遊戲時間 0 秒後由全部玩家共同建立。`fromName`、`fromOrigin` 先在共同流程取得。只用本地玩家切換可見性；不得用本地可見值改變遊戲狀態。點擊後用 `resetFocus` 停用再啟用按鈕。
- `registerEvent` 使用 `BlzTriggerRegisterFrameEvent`。使用端持有並銷毀觸發器。銷毀父框架會清理子框架，避免重複銷毀。
- 模型動畫使用 `setSpriteAnimate(primaryProp, flags)`，沒有按名稱播放的 w3ts 方法。SPRITE 的 birth、death、stand、morph、alternate 分別為 0～4，不能使用 `ANIM_TYPE_*` 的 handle 編號。沒有已知的 attack 屬性。來源與遊戲驗收見 I3 設計稿。
- 專案 FDF 位於 `assets/ui/`。建置時複製到 `dist/<mapFolder>/ui/` 再封裝。主 TOC 使用 CRLF，且最後一行之後有空行。探測 TOC 刻意沒有結尾換行，供 I3 比較。執行 `npm run test:ui:artifact` 檢查產物；遊戲驗收步驟見 `docs/inventory-ui/i3/PLAN.md`。
- 介面方法在 Lua 中會收到 `self`。把一般函式指定給介面方法時，用箭頭函式包裝，例如 `unwrapUnit: (input) => unwrapUnit(input)`。否則 TSTL 會報錯。

- FileNatives 的技能參數是數字。WC3 實作只包裝 BlzGetAbilityIcon、BlzSetAbilityIcon 與 Preload 系列。沿用 w3ts 的方式，不建立預載單位，也不提供 prepare。檔案格式與載體常數由 file-io 管理。F2 遊戲驗證仍待執行。

## 其他檔案

- `types/inputs.ts`：`UnitInput`／`PlayerInput` 接受原生 handle 或 w3ts 包裝物件（有 `handle` 欄位）；`unwrapUnit`、`unwrapPlayer`。WC3 handle 是 userdata，`typeof` 不是 `"object"`。
- `types/events.ts`：`DamageEvent`、`DamagingEvent`、`SpellEvent`、`DeathEvent`、`ChatEvent` 等事件快照型別。

## Node 測試設定

- `tsconfig.test.json` 載入 `war3-types-strict`，並指定 `"lib": ["ES2022"]`。原因：TypeScript 的 DOM 型別也宣告了 `Location`，會與 WC3 的 `Location` 衝突。
- 型別只用於檢查。Node 測試不得呼叫 WC3 原生函式。
