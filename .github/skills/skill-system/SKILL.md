---
name: skill-system
description: 新增或修改技能、施法流程、投射物、傷害套用、持續效果、冷卻與法力的暫停轉接時使用。記錄已在遊戲中驗證的做法與 WC3 陷阱。
---

# 技能系統

規格與驗證記錄：`docs/skill-system/PLAN.md`（已完成，2026-11-03）。實作細節：`docs/skill-system/implementation/PLAN.md`。

## 結構

| 位置 | 內容 |
|---|---|
| `src/feature/skill/definitions.ts` | 技能與角色數值。純資料，試玩值註明來源 |
| `src/feature/skill/runtime.ts` | 施法流程、投射物、命中 |
| `src/feature/combat/` | 傷害結算（部分）、燃燒與減速、暫停轉接 |
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
- 傷害先以純規則結算，再以 `UnitDamageTarget` 送出；傷害觸發器只把本系統標記的事件固定為結算值，避免 WC3 護甲再次減傷。
- 浮動文字使用非永久、有存活時間的 texttag。顯示數值時處理負零。
- 暫停期間正在施法的單位：圖示不變灰，冷卻動畫照常轉動；恢復時以快照校正數值。

## 驗證

- `pnpm run test:unit`、`pnpm run test:skill:lua`、`pnpm run format:check`、`pnpm run build`。
- 遊戲內驗證：`pnpm run test`。地圖會停在開啟地圖之後，直到使用者點擊遊戲視窗。
- 範例指令：`-skill-status`、`-skill-move`、`-pause`、`-resume`、`-skill-stop`。

## 待觀察

- 離開遊戲變慢：受控條件下沒有重現（見設計稿「待觀察」）。再次發生時，比較 `pnpm run test` 的 `-editor` 參數有無影響。
