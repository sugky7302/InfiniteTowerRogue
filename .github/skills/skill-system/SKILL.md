---
name: skill-system
description: 新增或修改技能、施法流程、投射物、傷害套用、持續效果、冷卻與法力的暫停轉接時使用。記錄已在遊戲中驗證的做法與 WC3 陷阱。
---

# 技能系統

規格與驗證記錄：`docs/skill-system/PLAN.md`（已完成，2026-11-03）。實作細節：`docs/skill-system/implementation/PLAN.md`。

## 結構

| 位置 | 內容 |
|---|---|
| `src/features/skill/config/definitions.ts` | 技能定義。純資料，試玩值註明來源 |
| `src/features/skill/model/runtime.ts` | 施法流程、投射物、命中。建構時分別接收 `SkillNatives` 與 `CombatStats` |
| `src/features/skill/api/natives.ts` | `SkillNatives`：從 `@shared/wc3-def` 組合需要的原生操作 |
| `src/features/combat/` | 暫停轉接 |
| `src/entities/combat/` | 傷害公式、燃燒與減速、D20 檢定、`CombatStats` 介面 |
| `src/entities/character/` | 固定角色數值（符文學者、測試敵人） |
| `src/app/skill-example.ts`、`src/app/wc3-skill-natives.ts` | 技能範例；組合 WC3 原生操作與範例戰鬥數值 |
| `src/shared/rxwc3/sources/frames.ts` | 固定步進幀來源 `frames()` |
| `src/shared/wc3-def/` | 技能與幀的原生函式介面及 WC3 實作 |
| `scripts/skill-objects.cjs`、`scripts/skill-misc.cjs` | 建置時產生物件資料與 `war3mapMisc.txt` |

純公式不得讀取 WC3 原生函式。

## 施法流程（已驗證）

1. 引擎檢查並扣除法力、開始冷卻（WC3 原生機制）。不足時引擎阻止施法。
2. `onSpellChannel` 開始追蹤。世界時鐘暫停時，拒絕此次施法：停止單位、返還法力、結束冷卻、顯示「暫停中無法施法」。
3. 施法時間由世界時鐘（`Phase.Combat`）計時。Channel 引導時間設為 60 秒，只用於顯示動作。
4. 中斷條件：施法者收到任何新命令（`onUnitOrder.of(unit)`），或引導結束。中斷時顯示「中斷」。
5. 計時完成：先清除施法狀態，再下達停止命令。否則停止命令與引導結束會被當成中斷。
6. D20 技能檢定（同步的 `GetRandomInt`）。成功才產生投射物。

## 陷阱（已在遊戲中確認）

| 陷阱 | 處理 |
|---|---|
| 物件資料套件省略 `disableOtherAbilities=false`，單位可能不理會移動與停止命令 | 明確寫入整數 `Ncl5=0`。檢查最終 MPQ，不能只看套件的預設值 |
| WC3 引導跟隨遊戲時間，不受世界時鐘控制 | 施法時間由世界時鐘控制，引導時間設長 |
| 停用正在引導的技能，或停用同一單位的其他技能，都會中斷施法 | 暫停轉接不動正在施法單位的任何技能，只保存剩餘冷卻，恢復時校正 |
| 每幀重設冷卻會使冷卻圖示閃動 | 暫停時結束冷卻並停用技能（`hide = false`），恢復時重啟剩餘冷卻 |
| WC3 停用技能是計數制 | 只還原本系統造成的一次停用 |
| 遊戲常數「單位移動速度下限」預設 150 | 建置時寫入 `war3mapMisc.txt` 的 `[Misc] MinUnitSpeed=0.0`，不修改原始地圖 |
| 施法流程停止運作時，技能卡在施法狀態 60 秒 | 施法流程的訂閱不得因錯誤而結束 |
| `PauseUnit` 會打斷引導 | 不使用 `PauseUnit`。完整戰術暫停屬於戰鬥系統 |
| 作為回呼傳遞的類別函式欄位，Lua 中可能多一個 self | 明確標註 `(this: void, ...) => ...`。Node 無法發現此錯誤 |

## 其他做法

- 投射物共用 `frames()`，以 `deltaSeconds` 更新位置，不為每個投射物建立 `interval`。
- C4 範例把技能結算結果交給戰鬥者登錄，直接更新內部生命與血條。舊介面仍可透過 `UnitDamageTarget` 送出固定傷害。
- 浮動文字使用非永久、有存活時間的 texttag。顯示數值時處理負零。
- 暫停期間正在施法的單位：圖示不變灰，冷卻動畫照常轉動；恢復時以快照校正數值。

## C1 純傷害接線

- 直接傷害與燃燒使用 `@entities/combat` 的 `settleDamage`。事件使用法術輸出、法防通道與技能的 `damageTag`。燃燒使用火焰標籤。
- `CombatStats.damageTarget` 與 `damageAttacker` 可提供完整修正。C4 新增 `commitDamage`，提交完整結算結果。既有技能測試的傷害預期值保持相同。
- 燃燒以 `snapshotDamageOffense` 鎖定輸出，另複製穿透修正。每次週期讀取目前目標狀態。刷新時建立新快照並清除舊排程。
- `resolveDamage` 是相容包裝，也使用新結算。技能既有預期值由原有測試保護。
- C1 至 C4 的規格與實作記錄見 `docs/combat-system/implementation/PLAN.md`。驗證入口為 `npm run test:combat:lua`。C5 遊戲內驗證尚待完成。

## C4 整合

- `features/combat` 提供 `CombatRegistry`、`CombatRuntime`、`TacticalPause` 與 `PatrolMachine`。app 注入原生操作，並組合技能。
- 暫停使用動作速度 0、移速 0 與停用兩個武器。動作速度由本系統保存，登錄時明確設為 1。之後透過 `TacticalPause.setTimeScale` 設定。
- 技能減速透過 `TacticalPause.setSpeed`。暫停中的變更只更新快照。恢復時套用保存值。
- 技能的內部停止命令透過 `TacticalPause.stop`，避免覆蓋玩家保存的命令。恢復命令使用世界時鐘的零延遲任務，讓資源轉接先啟用技能。
- 玩家失能時才使用 `PauseUnit` 阻止命令。戰術暫停使用方法 2。原有施法資源轉接仍跳過施法中的技能。
- 本次新增流程以明確的 catch 清理後重新拋出。TSTL 的部分 `try/finally` 轉譯會吞掉錯誤。Lua 驗證器必須用故障注入檢查失敗路徑。

## 驗證

- `pnpm run test:unit`、`pnpm run test:skill:lua`、`pnpm run format:check`、`pnpm run build`。
- 遊戲內驗證：`pnpm run test`。地圖會停在開啟地圖之後，直到使用者點擊遊戲視窗。
- 範例指令包括 `-skill-status`、`-skill-move`、`-pause`、`-resume`、`-revive` 與 `-skill-stop`。

## 待觀察

- 離開遊戲變慢：受控條件下沒有重現（見設計稿「待觀察」）。再次發生時，比較 `pnpm run test` 的 `-editor` 參數有無影響。
