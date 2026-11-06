---
name: combat-system
description: 新增或修改戰鬥登錄、生命與失能、普通攻擊、D20 命中檢定、敵人預告攻擊、戰術暫停或原生生命顯示時使用。記錄已在遊戲中驗證的做法與 WC3 陷阱。
---

# 戰鬥系統

規格：`docs/combat-system/PLAN.md`（已完成，2026-11-04）。實作與驗證記錄：`docs/combat-system/implementation/PLAN.md`。原生生命防護：`docs/combat-system/life-guard/PLAN.md`。

## 結構

| 位置 | 內容 |
|---|---|
| `src/entities/combat/` | 26 步傷害結算、二級數值、通用檢定、`CombatLife`、`meleeReach` |
| `src/features/combat/model/registry.ts` | `CombatRegistry`：登錄、生命提交、失能、擊倒、復起、`syncLife` |
| `src/features/combat/model/attack.ts` | D20 檢定、武器傷害、普通攻擊 |
| `src/features/combat/model/patrol-machine.ts` | 巡檢機狀態機（巡邏、追擊、準備、作用、收招） |
| `src/features/combat/model/runtime.ts` | `CombatRuntime`：傷害前事件、50 毫秒步進 |
| `src/features/combat/model/tactical-pause.ts` | `TacticalPause`：暫停快照與最後命令 |
| `src/shared/lib/wc3-def/unit/` | `UnitActionNatives`：只包裝原生動作 |
| `src/app/skill-example.ts` | 範例：符文學者對 2 台巡檢機 |

## 核心規則

- 生命只存在 `CombatLife`。原生血條只顯示，最低保留 1。命令、選敵與結算都使用內部狀態（`registry.active`）。
- 已登錄目標的**全部**原生傷害在傷害前事件設為 0。只有普通攻擊進入本系統的檢定與結算。
- 普通攻擊：先擲 D20（通用檢定），失敗顯示「未命中」；成功後檢查 `meleeReach`，失敗顯示「閃避」；再結算武器傷害。
- 預告攻擊：準備時固定位置與方向。作用時只擲一次 D20。成功後只對形狀內的玩家結算。碰撞後不追加檢定。
- 計時使用整數毫秒，由世界時鐘 `Phase.Combat` 驅動。不累加浮點時間。
- 浮動文字顯示「命中檢定 成功／失敗，骰值，檢定值」。

## 陷阱（已在遊戲中確認）

| 陷阱 | 處理 |
|---|---|
| `PauseUnit` 與 `BlzPauseUnitEx` 會中斷引導 | 戰術暫停使用動作速度 0、移速 0、停用兩個武器（`UNIT_WEAPON_BF_ATTACKS_ENABLED`）。失能才使用 `PauseUnit` |
| 沒有讀取動作速度的原生函式 | 動作速度存在 `Combatant.timeScale`，透過 `TacticalPause.setTimeScale` 設定 |
| 無敵擋不住負數生命恢復與直接寫入生命 | 登錄時關閉原生恢復；步進時以 `syncLife` 修正血條；不得直接寫入已登錄單位的原生生命或使用 `KillUnit` |
| 目標走開時引擎自己取消近戰命中 | 使用預設攻擊範圍緩衝 250、容許值 32。`meleeReach` 只是備援 |
| `DRAL` 閃電材質是綠色，`SetLightningColor` 與材質相乘 | 需要其他顏色時，改用白色材質 |
| 暫停中的玩家命令 | 只保存最後一個，恢復時由零延遲任務執行，讓資源轉接先完成 |

## 失能與擊倒

- 玩家生命 0：停止命令、保存並移除目標分類、設為無敵、`PauseUnit`。`-revive` 依目前上限還原。一般補血不能解除失能。
- 敵人生命 0：停止移動與武器、播放死亡動作，世界時間 2 秒後移除。重複傷害不重排移除。

## 範例指令

`-pause`、`-resume`（計數制）、`-revive`、`-skill-status`、`-skill-move`、`-skill-stop`。除錯：`-combat-hold` 讓巡檢機停在原地。

## 驗證

- `npm run test:unit`、`npm run test:combat:lua`、`npm run lint:fsd`、`npm run format:check`、`npm run build`。
- 建置前須關閉魔獸爭霸Ⅲ，否則 `dist/bin` 被占用（EPERM）。
- 遊戲內驗證：`npm run test`。自動操作視窗不可靠（移動目標點不到、視窗不在前景），優先由使用者操作，必要時加入除錯指令。
