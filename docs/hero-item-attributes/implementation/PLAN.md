---
建立日期: 2026-11-04
是否完成: false
---

# H1～H3 實作記錄

唯一規格為 `../PLAN.md`。本次執行純邏輯與獨立 Node 測試。主設計的是否完成維持 false。

## 實作順序

1. 建立物品型別、四階數值資料、普通階產生器與相容性檢查。
2. 新增英雄狀態、符文學徒資料、預建英雄與不可變升級函式。
3. 建立穿脫檢查、數值匯總、最大生命公式與同位置比較。
4. 在 `tests/hero/run.ts` 登錄獨立測試。執行指定的測試、型別、分層與格式檢查。

## 分層與邊界

- item 與 character 各自保存中性資料。兩者不匯入其他 entities slice。
- equipment 只從 entities 的公開入口匯入。既有角色常數的欄位與值全部保留。
- 本次只修改任務允許的位置。建置、遊戲、Lua 驗證及正式戰鬥接線交給 H4。

## 實作選擇

- 個別詞綴池未指定權重，首版全部使用權重 1。相容標籤採任一匹配，必要子類由詞綴表明列。
- 四階數量與區間全數登錄。公開產生器只接受普通階，其餘階級只提供資料與區間查詢。
- 卸下與替換回傳移出的物品，由呼叫者更新持有清單。
- 同位置比較成功時提供穿戴前後數值與差值。失敗時提供候選物、目前物品、全部原因與原狀態。
- 戰鬥運算函式目前未從 combat 公開入口匯出。本次不得修改該入口，equipment 暫用同範圍的先檢查算術。H4 須改接既有函式。
- 比例與百分點以整數保存。匯總時除以 100。相同作用參數先相加，再依適用標籤、輸出分類、事件種類或防禦通道建立修正。
- 來源只明列固定值詞綴的相容標籤。比例詞綴採攻擊、施法與生存用途分類。個別物品仍以第 6 節的池限制抽取。
- 單值區間的顯示百分位採 100。沒有主武器時，主武器資料為 undefined，武器預覽傷害為 0。
- `calculateMaxLife` 回傳公式值。匯總結果沿用既有戰鬥系統的生命範圍 1 至 100000。
- `getItemBonuses` 可讀取四階保存資料，逐項檢查重複、池、相容性與區間。它不要求保存資料已填滿階級詞綴數量。產生器固定產生一項普通階詞綴。

## 型別與公開 API

### item

- 型別為 `ItemBase`、`ItemInstance`、`ItemAffix`、`ItemBonus`、`ItemWeapon`、`AffixDefinition`、`AffixPoolEntry` 與 `RandomInt`。
- 常數集合為 `ItemTier`、`EquipSlot`、`ItemTag`、`ItemBonusStat`、`AffixId`、`AffixTable`、`AffixValueType` 與 `ItemBaseId`。各集合都有同名聯合型別。
- 共用資料為 `affixTables`、`tierAffixCounts`、`affixes` 與 `itemBases`。
- 查詢與規則為 `getAffix`、`getAffixRange`、`getItemBase`、`isAffixCompatible`、`createItem`、`getItemBonuses` 與 `affixPercentile`。
- `createItem(id, baseId, random)` 的亂數函式接受閉區間上下限，並須提供等機率整數。權重抽取與數值抽取分開呼叫。函式驗證傳回值，且不讀取全域亂數或 WC3。

### character

- 新增 `PrimaryAttributeSet`、`ClassLevel`、`HeroState`、`ClassDefinition`、`LevelUpResult`、`ClassId` 與 `LevelUpFailure`。
- 新增 `classDefinitions`、`getClassDefinition`、`combatLevel`、`levelUp` 與 `runeScholar`。
- `levelUp` 以 ok 區分成功與失敗。失敗原因包含未認證、已達最高等級與職業資料尚未登錄。無效數值會拋出正體中文錯誤。
- 預建英雄沒有再次加入第一級成長。七項初始值完整沿用 scholar。升到第二級時，智力才從 16 增加到 17。

### equipment

- 型別為 `EquipmentState`、`EquipFailure`、`EquipResult`、`EquipmentBonuses`、`EquipmentModifiers`、`EquipmentStats`、`EquipmentSummary`、`MaxLifeInput`、`EquipmentComparison` 與 `EquipmentRound`。
- `EquipFailureCode` 保存位置錯誤、副手占用、雙手占用、缺少知識與重複實例五種原因。
- 穿脫入口為 `emptyEquipment`、`checkEquip`、`equip` 與 `unequip`。
- 數值入口為 `aggregateEquipment`、`calculateMaxLife` 與 `compareEquipment`。
- 匯總輸出 `attributes`、`bonuses`、`maxLifePercent`、`damageModifiers.attacker`、`damageModifiers.target`、`mainWeapon`、`mainWeaponDamage` 與 `stats`。
- `bonuses` 擴充既有 `CombatBonuses`，另含 `spellPower`。分類暴擊保存在傷害修正中，另提供 `stats.meleeCritChance` 與 `stats.spellCritChance` 供顯示。
- 比較結果包含二級屬性差值、生命百分比差值、主武器傷害差值，以及攻擊方與承傷方修正差值。
- 數值函式接受可選的 `EquipmentRound`。Node 測試傳入 Math.fround 包裝，並在每次加法、乘法及取整前後檢查 32 位元範圍。

## H4 交接

1. 等 C4 建置與修改完成後，再進行共用檔案接線。
2. 在 `src/entities/combat/index.ts` 匯出既有 `combatNumber`、`combatAdd`、`combatMultiply` 與 `clampCombat`。將 equipment 的 `lib/numbers.ts` 改成呼叫這些公開函式，保留取整前後的檢查。
3. 在 `src/entities/combat/model/combatant.ts` 的 `CombatBonuses` 加入可選的 `spellPower`、`maxLifePercent` 與 `maxLifeFixed`。`deriveCombatStats` 回傳法術強度，使用智力乘 2 加精神與加成。最大生命改用完整公式，最後再套用 1 至 100000 上限。既有欄位與缺省值維持相同結果。
4. 將 `aggregateEquipment` 的 `maxLifePercent` 與保留的固定值 0 傳入正式推導。正式推導可用後，移除匯總內重複的法術強度與生命推導，保留獨立公式的測試入口。
5. 在 `tests/run.ts` 匯入 `./hero/run`。本次的獨立入口已匯入全部三個 `.spec.ts`。
6. 在 `CombatStats` 增加英雄戰鬥等級、智力與法術強度的查詢，或提供同等快照介面。`src/features/skill/model/runtime.ts` 的檢定目前讀取 scholar.level 與 scholar.intelligence，傷害強度也讀取 scholar。正式接線須改為查詢當前英雄。法力容量與恢復仍沿用既有常數，符合已知限制。
7. 依 C4 最終介面，更新 `CombatRegistry` 的英雄 profile、stats 與武器資料。升級、穿上與卸下後重新匯總。更新最大生命與原生顯示，避免沿用舊的生命上限。生命目前值的調整方式須明確決定。
8. 將 `damageModifiers.attacker` 接入攻擊者快照，將 `damageModifiers.target` 接入承受者快照。分類暴擊修正只包含裝備加成。若使用 `stats.meleeCritChance` 或 `stats.spellCritChance` 作為完整暴擊率，不能再次加入同一分類修正。
9. 普通攻擊改讀 `mainWeapon` 的 base 與 coefficient。沒有主武器時，本次只回傳 undefined。H4 須決定範例是否停用普通攻擊或另用明列的徒手資料。
10. 在 app 建立每名英雄的 `HeroState`、`EquipmentState` 與持有清單。串接主設計第 7 節的全部聊天指令。穿脫成功後，以 removed 更新持有清單。比較直接使用 `compareEquipment`。
11. 新增 Lua 驗證入口與 package 指令。驗證普通階抽取、數值區間、英雄升級、穿脫、百分比生命、分類暴擊、修正清單與 32 位元邊界。關閉 debug 時也須正常執行。
12. 接入 app 後執行未加豁免的 Steiger 檢查。equipment 有 app 引用後，item 與 equipment 的引用不足問題應消失。
13. 完成正式建置與產物檢查，再執行測試地圖。逐項驗證升級生命 42 → 44、雙手占用、缺少知識、詞綴傷害、主武器替換及技能傷害。H5 仍須使用者確認。

## 驗證結果

驗證日期為 2026-11-04。

| 檢查 | 結果 |
|---|---|
| 指定的 tests/hero/run.ts 指令 | 58 項通過，0 項失敗 |
| npx tsc --noEmit -p tsconfig.test.json | 通過，當次沒有其他代理的型別錯誤 |
| 本次 19 個 TypeScript 檔的 Prettier --check | 通過 |
| 本次 19 個 TypeScript 檔的 Prettier --debug-check | 通過 |
| npm run lint:fsd | 2 個 fsd/insignificant-slice 問題，原因如下 |
| 建置、測試地圖、全域單元測試、Lua 驗證 | 依任務分工交給 H4 |

Steiger 的引用數量規則回報 item 只被 equipment 使用，以及 equipment 尚未被使用。任務限制使本次不能加入 app 引用。其他分層規則沒有回報問題。主設計與本記錄的是否完成均維持 false。

## 檔案

新增檔案如下。

- `src/entities/item/model/item.ts`
- `src/entities/item/model/affix-roll.ts`
- `src/entities/item/config/affixes.ts`
- `src/entities/item/config/bases.ts`
- `src/entities/item/index.ts`
- `src/entities/character/model/hero.ts`
- `src/entities/character/config/classes.ts`
- `src/entities/character/config/heroes.ts`
- `src/features/equipment/model/equipment.ts`
- `src/features/equipment/model/aggregate.ts`
- `src/features/equipment/model/compare.ts`
- `src/features/equipment/lib/numbers.ts`
- `src/features/equipment/index.ts`
- `tests/hero/fixtures.ts`
- `tests/hero/item.spec.ts`
- `tests/hero/hero.spec.ts`
- `tests/hero/equipment.spec.ts`
- `tests/hero/run.ts`
- `docs/hero-item-attributes/implementation/PLAN.md`

修改 `src/entities/character/index.ts`，只新增本次公開匯出。既有角色資料檔保持原狀。
