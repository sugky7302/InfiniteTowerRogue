---
name: hero-item-attributes
description: 新增或修改英雄狀態、職業升級、物品基底、詞綴、穿戴檢查或裝備數值匯總時使用。記錄模組分工、公式與已在遊戲中驗證的行為。
---

# 英雄與物品屬性

規格：`docs/hero-item-attributes/PLAN.md`（已完成，2026-11-04）。實作與驗證記錄：`docs/hero-item-attributes/implementation/PLAN.md`。

英雄存檔：`docs/hero-save/PLAN.md`；實作記錄：`docs/hero-save/implementation/PLAN.md`（已完成，2026-11-04）。存檔細節見 `.github/skills/save-system`。

90 格背包、版本 4 與原生載體：以 `docs/inventory-ui/PLAN.md` 為準。I1、I2 記錄見 `docs/inventory-ui/implementation/PLAN.md`。I3 結論見 `docs/inventory-ui/i3/PLAN.md`。I4 框架見 `docs/inventory-ui/i4/PLAN.md`。I5 遊戲內驗證已通過（2026-11-04）。

## 結構

| 位置 | 內容 |
|---|---|
| `src/entities/character/` | `HeroState`、職業資料、`levelUp`、`combatLevel`、預建 `runeScholar` |
| `src/entities/item/` | 物品基底、詞綴表、詞綴抽取、穿戴位置。輸出中性的 `ItemBonusStat` 清單 |
| `src/features/equipment/` | 穿戴狀態、穿脫檢查、匯總（`aggregateEquipment`）、比較（`compareEquipment`）、90 格背包純規則 |
| `src/features/equipment/config/native-items.ts` | 每個基底的原生代碼、圖示與名稱 |
| `src/app/hero-example.ts` | `HeroExample`：英雄、穿戴物、固定格背包與聊天指令 |
| `src/app/native-item-registry.ts` | 原生載體登錄、建立、隱藏、丟棄、撿起與移除 |
| `src/features/equipment/ui/` | 純版面、點選狀態機、檢視模型與 `InventoryPort` |
| `src/app/inventory-ui.ts` | 正式框架、同步事件、擁有者檢查與變更訂閱 |

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

- `HeroExample.snapshot()` 傳回英雄、穿戴物與背包的副本。背包固定 90 格，以 `false` 表示空格；不得用 `undefined` 保存固定位置。`restore(hero, worn, held)` 依主武器、副手、防具、工具、背包格序重新編號，再更新載體與 refresh。
- 讀檔先移除全部舊載體（包含地面物品），再建立新載體。建立失敗時移除已建立部分並清空物品資料，避免孤兒載體或資料。
- `src/app/hero-save.ts` 的編碼與解碼是純函式。只保存預建索引、職業等級、知識與物品目錄欄位。讀檔從預建英雄重新執行 levelUp，不保存計算結果或原物品編號。
- 解碼先使用 getItemBonuses 驗證詞綴，再以恢復後的知識依序 equip。任一參與者驗證失敗時，不套用英雄、裝備或 demo。
- 目前物品目錄沒有工具類物品。合法滿裝為主武器、副手與防具，工具格留空，不得為測試變更目錄。
- 版本 4 固定讀取 94 個位置，只輸出有物品的紀錄。不得把含空工具格的穿戴陣列與背包直接合併。版本 3 相容函式仍固定讀取 16 個位置，供舊碼轉換測試。
- 版本 2 存檔不含英雄資料，轉換後不改英雄與裝備。生命沿用 refresh 的規則，失能仍為 0。

## 背包與原生載體

- `createBag`、`firstEmptySlot`、`putInBag`、`takeFromBag`、`swapBagSlots`、`findBagSlot` 是純函式，不修改輸入。放入與卸下使用第一個空格；穿戴後取下的舊裝備也放入第一個空格。
- 真實資料仍是 `ItemInstance`。每個基底對應一種一般永久類別的原生物品，代碼為 `I0B1`～`I0B5`。不得使用內建裝備類別。
- `SetItemUserData` 保存編號，app 登錄表以編號查詢資料，並比對 handle。背包與穿戴中的載體隱藏，不放在原生物品欄。
- 英雄保留 `AInv`。拾取已登錄物品時，先 `UnitRemoveItem`，再嘗試放入背包。背包已滿時物品留在地面並顯示「背包已滿」。未登錄的一般原生物品沿用引擎行為。
- I3 已在遊戲中確認：隱藏載體不受其他單位或範圍效果影響。

## 正式物品欄

- `HeroExample` 實作 `InventoryPort`：`read`、`send`、`subscribe`。聊天建立、交換、丟棄、拾取、穿脫、升級、知識變動及讀檔都送出變更通知。不輪詢。
- `inventoryTransition` 是純函式。背包互換、穿上與卸下都回傳新資料。失敗保留資料與選取，並回傳全部原因。同格取消；無選取時點空格不做事。
- 卸下與被替換的裝備使用第一個空格，沿用 I2。丟棄先由 app 操作載體，成功後才提交背包變更。
- `inventoryView`、`inventoryDescription` 只讀純資料。背包說明沿用 `compareEquipment`。數值面板與 `-hero` 共用百分比格式；迴避及施法穩定是數值，不加 `%`。
- 全部用戶端在 0 秒計時器中建立相同框架。事件先檢查擁有者；只以 `GetLocalPlayer` 控制可見性，不讀取本地文字或可見值來操作物品。
- 外部變更清除選取，並更新目前頁與移入說明。停止戰鬥範例時，同時移除框架、事件及訂閱。

## 陷阱

| 陷阱 | 處理 |
|---|---|
| Lua 的 `""` 與 `0` 是真值，`a \|\| "無"` 不會使用預設值 | 明確比較，例如 `text.length > 0 ? text : "無"` |
| 含 `undefined` 的物件展開不能清除 Lua 舊欄位 | 複製後明確清除 |
| 原生英雄面板的屬性不隨升級更新 | 戰鬥只使用本系統的值 |

## 範例指令

`-bag`、`-hero`、`-hero-up`、`-item-new <基底>`、`-items`、`-equip <編號>`、`-unequip <位置>`、`-drop <格子>`、`-bag-swap <格子> <格子>`。背包格子使用 1～90。除錯：`-hero-forget` 清空知識。`-item-new` 直接放入第一個空格；`-items` 顯示穿戴物與背包中的非空格。I3 的 `-ui-*` 指令已移除。

## 驗證

- `npm run test:unit`、`npm run test:hero:lua`、`npm run lint:fsd`、`npm run build`。
- 遊戲內驗證：`npm run test`。

## 尚未接入

- 法力容量與恢復不隨智力變化。
