---
name: hero-item-attributes
description: 新增或修改英雄狀態、職業升級、物品基底、詞綴、穿戴檢查或裝備數值匯總時使用。記錄模組分工、公式與已在遊戲中驗證的行為。
---

# 英雄與物品屬性

規格：`docs/hero-item-attributes/PLAN.md`（已完成，2026-11-04）。實作與驗證記錄：`docs/hero-item-attributes/implementation/PLAN.md`。

英雄存檔：`docs/hero-save/PLAN.md`；實作記錄：`docs/hero-save/implementation/PLAN.md`（已完成，2026-11-04）。存檔細節見 `.github/skills/save-system`。

## 結構

| 位置 | 內容 |
|---|---|
| `src/entities/character/` | `HeroState`、職業資料、`levelUp`、`combatLevel`、預建 `runeScholar` |
| `src/entities/item/` | 物品基底、詞綴表、詞綴抽取、穿戴位置。輸出中性的 `ItemBonusStat` 清單 |
| `src/features/equipment/` | 穿戴狀態、穿脫檢查、匯總（`aggregateEquipment`）、比較（`compareEquipment`） |
| `src/app/hero-example.ts` | `HeroExample`：英雄、穿戴物、持有清單與聊天指令 |

- `entities/item` 不得 import `entities/character` 或 `entities/combat`。`features/equipment` 把加成轉成二級數值與傷害修正。
- 英雄狀態不保存穿戴物。全部規則是純函式，不修改輸入。亂數由呼叫者傳入。

## 規則

- 戰鬥等級＝全部職業等級的和。最高等級＝階級 × 5。
- 最大生命＝（40＋體質×5＋戰鬥等級×2＋加值）×（1＋Σ百分比）＋固定值。裝備的固定屬性與固定詞綴是加值。
- 最大生命增加時，目前生命增加相同值；減少時限制在新上限內；失能維持 0。
- 穿上前依序檢查位置、雙手武器與副手、必要知識、同一實例。任一失敗時狀態不變，並傳回全部原因。雙手武器不自動卸下副手。
- 沒有主武器時，普通攻擊停用並顯示「沒有武器」。法術仍可施放。
- 詞綴值在階級區間內等機率抽整數。保存 `{ affixId, value }`。

## 接到戰鬥

- `HeroExample.refresh` 以 `CombatRegistry.update` 提交匯總的屬性、二級數值、傷害修正與主武器。
- 技能施法時讀取目前戰鬥等級、智力與法術強度。法力容量與恢復仍是建置常數。

## 存檔與恢復

- `HeroExample.snapshot()` 傳回英雄、穿戴物與持有清單的副本。`restore(hero, worn, held)` 取代狀態，依主武器、副手、防具、工具、持有清單的順序重新編號，再呼叫 refresh。
- `src/app/hero-save.ts` 的編碼與解碼是純函式。只保存預建索引、職業等級、知識與物品目錄欄位。讀檔從預建英雄重新執行 levelUp，不保存計算結果或原物品編號。
- 解碼先使用 getItemBonuses 驗證詞綴，再以恢復後的知識依序 equip。任一參與者驗證失敗時，不套用英雄、裝備或 demo。
- 目前物品目錄沒有工具類物品。合法滿裝為主武器、副手與防具，工具格留空，不得為測試變更目錄。
- Lua 陣列尾端的 nil 不計入長度。編碼固定讀取 16 個位置，不得把含空工具格的穿戴陣列與持有清單直接合併。
- 版本 2 存檔不含英雄資料，轉換後不改英雄與裝備。生命沿用 refresh 的規則，失能仍為 0。

## 陷阱

| 陷阱 | 處理 |
|---|---|
| Lua 的 `""` 與 `0` 是真值，`a \|\| "無"` 不會使用預設值 | 明確比較，例如 `text.length > 0 ? text : "無"` |
| 含 `undefined` 的物件展開不能清除 Lua 舊欄位 | 複製後明確清除 |
| 原生英雄面板的屬性不隨升級更新 | 戰鬥只使用本系統的值 |

## 範例指令

`-hero`、`-hero-up`、`-item-new <基底>`、`-items`、`-equip <編號>`、`-unequip <位置>`。除錯：`-hero-forget` 清空知識。

## 驗證

- `npm run test:unit`、`npm run test:hero:lua`、`npm run lint:fsd`、`npm run build`。
- 遊戲內驗證：`npm run test`。

## 尚未接入

- 法力容量與恢復不隨智力變化。
