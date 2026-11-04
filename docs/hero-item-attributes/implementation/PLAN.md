---
建立日期: 2026-11-04
是否完成: true
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

## H4

建立日期為 2026-11-04。是否完成為 true。此狀態只涵蓋 H4 實作與工具驗證。H5 尚待使用者確認。兩份主設計稿的是否完成仍為 false。

### 實作前設計

- 依「H4 交接」第 1 至 13 項順序接線。C4 已完成，本次沒有其他代理修改共用檔案。
- equipment 改用 combat 公開運算。生命與法術強度由正式推導計算。
- CombatStats 提供目前施法者快照。app 保存英雄、裝備與持有清單，再更新戰鬥登錄。法力常數保持原值。
- 最大生命增加時補相同生命，減少時限制目前生命，失能時維持 0。沒有主武器時拒絕普通攻擊。
- 範例起始產生並穿上符文杖與學徒長袍。聊天以固定 ID 或固定輸入別名查詢物品，不比較翻譯文字。
- 新增 Node 與 Lua 共用整合案例，涵蓋穿脫、傷害、升級與聊天狀態。Lua 關閉 debug，並注入故障檢查驗證器。
- 執行指定工具與地圖產物測試。依本次要求，不執行 npm run test。第 13 項的遊戲驗證保留給 H5。

### 做法與交接結果

| 項目 | 結果 |
|---|---|
| 1 | 已確認 C4 完成。依 C4 的登錄、普通攻擊、技能提交介面接線。本次沒有其他代理 |
| 2 | combat 公開四個運算函式。equipment 的運算改用公開入口，保留取整前後的邊界檢查 |
| 3 | CombatBonuses 新增可選 spellPower、maxLifePercent、maxLifeFixed。正式推導加入法術強度與完整生命公式，最後限制生命在 1 至 100000 |
| 4 | aggregateEquipment 傳入百分比與固定值 0。移除重複推導。calculateMaxLife 仍作為獨立公式測試入口 |
| 5 | tests/run.ts 已匯入 hero/run。H1 至 H3 的 58 項測試納入完整測試 |
| 6 | CombatStats.caster 為必要查詢。技能完成施法時查詢等級與智力；命中時查詢法術強度。法力仍沿用 scholar |
| 7 | CombatRegistry.update 替換 profile、stats、修正與生命快照。resizeCombatLife 在上限增加時補差值，減少時限制目前生命，失能時維持 0。原生顯示同步更新 |
| 8 | 攻擊方與承受方快照分別加入裝備修正。分類暴擊只加入裝備差值。基礎暴擊仍取 stats.critChance，不再加入顯示用的完整分類暴擊率 |
| 9 | 普通攻擊讀目前主武器的 base 與 coefficient。沒有武器時拒絕攻擊命令、右鍵敵人與傷害結算，顯示「沒有武器」。暫停後不重播已失效的攻擊命令 |
| 10 | app 的 HeroExample 保存每名英雄的 HeroState、EquipmentState 與持有清單。全部六項新指令已接線。穿戴使用 compareEquipment 顯示差異，並以 removed 回收原裝備 |
| 11 | 新增 verify-hero-lua.cjs 與 test:hero:lua。37 組共用案例與 1 組驗證器故障注入通過。debug 為 nil。另有 Node 的 float32 案例 |
| 12 | 接入 app 後，全專案 Steiger 為 0 個問題。沒有新增豁免 |
| 13 | 正式建置與五支地圖產物驗證通過。依本次要求，未執行 npm run test。遊戲內部分保留給 H5 |

- 起始登錄先用預建英雄，再產生並穿上普通階符文杖與學徒長袍。兩件物品各有一項詞綴，持有清單為空。
- 升級、穿上與卸下後重新匯總。英雄的原生攻擊間隔更新為 1.5／（1＋目前攻速）。scholar 的欄位與值完全不變，建置腳本可繼續讀取。
- 英雄指令只由英雄擁有者操作。原有技能與戰鬥指令仍由原訂閱處理。存檔訂閱保持獨立，資料仍是存檔範例資料。
- 持有清單最多 12 件。滿載時不能新建或卸下；可以替換穿戴物，因為候選物先離開清單，原裝備再回到清單。
- 錯誤由 logger.error 輸出。共用測試的迴圈若建立閉包，先複製到 const。

### 與設計稿不同的地方及原因

- 沒有變更已決定的公式、生命更新、無武器規則、起始裝備或法力限制。
- 範例放在 src/app/hero-example.ts，由既有 runSkillExample 組合。src/main.ts 不需修改，因為它已啟動此入口與存檔範例。
- 額外接受固定的正體中文輸入別名，方便試玩。基底 ID 仍是實際查詢鍵，不讀取或比較翻譯結果。
- 新增 test:hero:artifact，直接檢查最終 MPQ 的 Lua、聊天入口、動態施法查詢與禁止常數。這是第 13 項的產物驗證補強。
- 修正 H3 的卸下實作。TSTL 把含 undefined 的物件展開轉成 ObjectAssign 時，nil 欄位不能覆寫舊值。現在先複製，再明確清除。英雄武器快照也避免用含 undefined 的展開覆寫舊武器。Node 原有測試無法發現此問題，Lua 流程已涵蓋。
- 本次不執行遊戲。這是本次任務明確要求的例外，不能視為 H5 已通過。

### 全部聊天指令

| 指令 | 功能 |
|---|---|
| -hero | 顯示全部一級屬性、親和、職業等級、戰鬥等級、主要二級數值與武器傷害 |
| -hero-up | 符文學徒升 1 級；最高 5 級 |
| -item-new <基底> | 產生普通階物品。基底為 rune-staff、training-sword、patrol-hammer、spell-manual、apprentice-robe；也接受符文杖、訓練短劍、巡檢長槌、術式手冊、學徒長袍 |
| -items | 列出四個穿戴位置與持有清單，包含編號、名稱、階級、固定屬性與詞綴 |
| -equip <編號> | 穿上持有物。成功時顯示同位置差異；失敗時列出全部原因 |
| -unequip <位置> | 卸下。位置為 main-hand、off-hand、armor、tool；也接受主武器、副手、防具、工具 |
| -pause | 增加一次世界時鐘暫停 |
| -resume | 解除一次暫停。全部解除後還原狀態與最後命令，也可重試快照還原 |
| -skill-status | 顯示世界時間、法力、恢復、火球冷卻與全部戰鬥者的內部生命、護盾、失能、擊倒 |
| -skill-move | 讓存活巡檢機移到測試點 |
| -revive | 恢復失能英雄，使用目前最大生命 |
| -skill-stop | 清理本範例的訂閱、排程、單位與原生資源 |
| -save | 保存存檔範例資料 |
| -load | 從本地檔案載入 |
| -load <存檔碼> | 載入完整存檔碼 |
| -load <序號>/<總數> <片段> | 分段輸入存檔碼 |
| -save-demo、-save-demo show | 顯示存檔範例資料 |
| -save-demo level <1..100> | 設定存檔範例等級 |
| -save-demo gold <0..1000000> | 設定存檔範例金錢 |
| -save-demo item <1..6> <0..3> | 設定存檔範例物品槽 |

火球術快捷鍵為 F，寒冰箭為 I。右鍵敵人使用普通攻擊。英雄與裝備不加入存檔碼。

### H4 工具驗證

驗證日期為 2026-11-04。全部指令使用 npm，沒有新增套件，沒有建立 git commit。

| 指令或檢查 | 結果 |
|---|---|
| npm run test:unit | 751 項通過，0 項失敗；含 tests/hero 的 96 項 |
| npm run format:check | 全專案通過 |
| npm run lint:fsd | 全專案 0 個問題，沒有新增豁免 |
| npm run build | 成功封裝 dist/bin/map.w3x，沒有檔案占用錯誤 |
| npm run test:save:lua | 11 組通過 |
| npm run test:skill:lua | 16 組通過 |
| npm run test:i18n:lua | 多語言 11 組、本地檔案 12 組通過 |
| npm run test:benchmark:lua | 18 組通過 |
| npm run test:combat:lua | 111 組通過 |
| npm run test:hero:lua | 38 組通過，其中 37 組流程、1 組故障注入 |
| 全部指定 Lua | 217 組通過，0 組失敗 |
| npm run test:skill:artifact | 5 組通過 |
| npm run test:combat:artifact | 7 組通過 |
| npm run test:i18n:artifact | 8 組通過 |
| npm run test:hero:artifact | 6 組通過 |
| npm run test:benchmark:artifact | 1 支驗證程式通過 |
| 最終 MPQ 與 dist/map.w3x/war3map.lua | Lua 內容相同，2 ^ 1024 為 0 處 |
| Prettier --debug-check | 本次程式、腳本、測試與 package.json 共 22 個檔案通過 |
| git diff --check | 通過 |
| fsd-layers 與 skill-system | 2 份通過 YAML、名稱、描述與未完成標記檢查。環境沒有 Python，改用既有 js-yaml 執行相同規則，沒有新增套件 |

最終地圖 SHA256 為 `41A792C16D4C841DF95F6AECF86538153E89763A90F0B337072B982567E14D2B`。

原有技能與戰鬥測試的預期值沒有修改。預建英雄未穿裝備且等級 1 時，生命為 42、近戰攻擊力為 8、法術強度為 41、物理防禦為 2、法術防禦為 18、攻速為 0.2。

### H4 檔案

本清單以本次開始時的工作目錄為基準。主設計稿原有的三項決定與未追蹤的 .claude/ 均保留，沒有改寫。

新增 6 個檔案：

- src/app/hero-example.ts
- scripts/verify-hero-lua.cjs
- tests/hero/integration-cases.ts
- tests/hero/integration.spec.ts
- tests/hero/lua-entry.ts
- tests/hero/artifact.spec.ts

修改 19 個檔案：

- src/app/skill-example.ts
- src/app/wc3-skill-natives.ts
- src/entities/combat/index.ts
- src/entities/combat/model/combatant.ts
- src/entities/combat/model/stats.ts
- src/features/combat/model/registry.ts
- src/features/combat/model/attack.ts
- src/features/combat/model/tactical-pause.ts
- src/features/equipment/lib/numbers.ts
- src/features/equipment/model/aggregate.ts
- src/features/equipment/model/equipment.ts
- src/features/skill/model/runtime.ts
- tests/run.ts
- tests/hero/run.ts
- tests/skill/fakes.ts
- package.json
- docs/hero-item-attributes/implementation/PLAN.md
- .github/skills/fsd-layers/SKILL.md
- .github/skills/skill-system/SKILL.md

沒有刪除檔案。建置會重新寫出翻譯 JSON，但本次沒有翻譯內容差異。

### H5 遊戲內驗證步驟

使用者手動載入正式 dist/bin/map.w3x。需要完整敵人、重設等級或清空持有清單時，重新載入地圖。以下步驟尚未執行。

1. 輸入 -items，確認英雄穿著編號 1 的新符文杖與編號 2 的新學徒長袍，各有一項普通階詞綴，持有清單為 0／12。輸入 -hero，核對裝備造成的法術強度或生命加成。
2. 先輸入 -unequip 防具，以免隨機生命詞綴影響基準。輸入 -hero，確認最大生命 42。輸入 -hero-up，再輸入 -hero 與 -skill-status，確認戰鬥等級 2、智力 17、最大生命 44；目前生命增加 2。重複升至 5 級，再升級應失敗且數值不變。
3. 讓英雄受到傷害，記錄內部生命。穿上提供最大生命的長袍，確認目前生命增加上限差值。卸下後，確認目前生命不超過新上限。失能後再升級或穿脫，內部生命須維持 0。輸入 -revive，確認以新上限復起。
4. 以 -item-new 術式手冊 產生副手，依 -items 的編號穿上。再產生巡檢長槌，嘗試穿上，應顯示副手已占用；物品與狀態不變。卸下副手後可穿上長槌。此時再穿手冊，應顯示雙手武器已占用副手。
5. 缺少知識無法在正式預建英雄上觸發，因為它已知魔法解析。此規則已在 Node 與 Lua 通過。遊戲驗證須另建暫時診斷地圖：只在 new HeroExample 的第五個參數傳入 { ...runeScholar, knowledge: [] }，建置後另存診斷產物，再還原程式並重建正式產物。診斷地圖中產生並穿上手冊，確認顯示「缺少知識：魔法解析」；若同時穿長槌，須列出兩項原因。不要改 scholar 或正式預建知識。
6. 卸下主武器，確認顯示「沒有武器」。右鍵敵人與攻擊命令均不得造成普通攻擊傷害。移動、跟隨友軍與施法仍可用。穿回武器後可攻擊。暫停中卸下武器，恢復後不得重播先前的攻擊命令。
7. 比較符文杖與巡檢長槌。確認長槌使用 6＋近戰攻擊力×0.75；符文杖使用 4＋近戰攻擊力×0.5。記錄各自固定詞綴，確認比較輸出與實際攻擊使用目前武器。排除暴擊與檢定失敗後比較傷害。
8. 產生帶火焰、冰霜或物理傷害詞綴的武器。確認對應傷害增加，其他標籤不變。持有清單滿載時重載重試。以 -items 的詞綴值核對倍率；同一分類暴擊不應重複加入。火球燃燒仍使用命中時鎖定的輸出快照。
9. 技能法術強度：卸下全部裝備時，等級 1 的寒冰箭原始傷害為 10＋41×0.8＝42.8；對完整巡檢機法防 8，生命損失約 39.63。升 1 級後法術強度為 43，原始傷害為 44.4，生命損失約 41.11。另穿法術強度＋n 的符文杖，傷害應再增加 n×0.8，再套防禦；若有冰霜增傷，另套該倍率。使用兩台完整巡檢機或重載作對照，避免擊倒截斷生命損失。確認法力容量與恢復仍為 69 與 2。
10. 依 C4 的 C5 步驟確認 -pause、-resume、-skill-move、-skill-status、-revive 與 -skill-stop 仍可用。用 -save-demo、-save 與 -load 檢查存檔範例。英雄與裝備不應被存檔範例覆寫。

### 尚未解決

- H5 與戰鬥 C5 的遊戲內驗證尚未執行。Fengari 的浮點數為 64 位元；Node 的 float32 案例不能取代 WC3 原生行為。
- 法力容量與恢復仍使用建置常數；英雄與裝備尚未接入存檔碼。這兩項是既定限制。
- 建置仍有既有的翻譯缺漏與保留舊鍵提示。缺少翻譯時使用 zh-TW。

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

## H5 遊戲內驗證（第一輪，2026-11-04）

由 Claude 以 PowerShell 操作遊戲視窗。

| 項目 | 結果 |
|---|---|
| 起始穿戴 | 通過。符文杖與學徒長袍；持有清單 0／12 |
| 最大生命百分比詞綴 | 通過。學徒長袍抽到最大生命 +5%，最大生命 44.1（42 × 1.05） |
| 升級 | 通過。卸下防具並升級後，戰鬥等級 2、最大生命 44.0、法術強度 43（17 × 2 ＋ 9）；原生顯示 44／44 |
| 雙手武器 | 通過。副手有術式手冊時，穿上巡檢長槌失敗並顯示「副手已占用，不能穿上雙手武器」 |
| 必要知識（已具備） | 通過。術式手冊需要魔法解析，可以穿上 |
| 主武器替換 | 通過。巡檢長槌的主武器傷害 12.0（6 ＋ 8 × 0.75） |
| 普通攻擊使用主武器 | 通過。攻擊巡檢機時產生傷害事件 |
| 沒有主武器 | 通過（第二輪）。卸下主武器後普通攻擊顯示「沒有武器」，不產生傷害 |
| 缺少知識、技能傷害反映法術強度 | **未驗證**。缺少知識需要診斷地圖；腳本點擊無法穩定選中移動中的目標施法 |

發現並修正：沒有固定屬性的物品顯示「固定屬性：；」。原因是 Lua 中空字串為真值，`|| "無"` 不生效。已改為長度檢查，並加入 `AGENTS.md` 的 WC3 Lua 限制。

## H5 遊戲內驗證（第三輪，2026-11-04）

由使用者操作。

| 項目 | 結果 |
|---|---|
| 技能傷害反映法術強度 | 通過。`-hero-up` 後寒冰箭傷害提高 |
| 缺少知識 | 通過。`-hero-forget` 後 `-equip` 術式手冊，顯示「缺少知識：魔法解析。」，物品留在持有清單 |

H5 全部項目通過。
