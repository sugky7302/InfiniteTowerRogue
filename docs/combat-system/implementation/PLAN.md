---
建立日期: 2026-11-03
是否完成: true
---

# C1 至 C4 實作記錄

唯一規格為 `../PLAN.md`。完成屬性表示 C1、C2 與 C4 的實作及工具驗證已完成。C3 已有使用者確認結果。C5 遊戲內驗證由使用者執行，主設計的完成屬性仍為 false。C3 的原始實驗設計見 `../c3/PLAN.md`。

## 實作順序

1. 建立傷害事件、修正清單、26 個步驟函式與中間結果。
2. 建立二級數值、通用檢定、生命與失能狀態。
3. 新增預建數值，接入技能直接傷害與燃燒。
4. 建立 Node 與 Lua 共用案例，逐步比對烈焰斬與邊界。
5. 執行全部指定工具驗證，記錄結果與限制。

## 分層

生命與失能是純領域狀態，放在 `entities/combat/model/`。技能與後續戰鬥功能都能使用它。戰鬥者登錄、原生行動及顯示留給後續階段。

## C1 型別與資料

- `DamageEvent` 保存來源、承受者、事件種類、輸出分類、暴擊資格、技能所有權與傷害部分。另提供接觸、撕裂、逐項跳過減傷及生命百分比公式。
- `DamagePart` 保存數量、最終標籤、防禦通道、來源歷史與轉換前標籤。基礎公式可使用 `base`、`power`、`coefficient`。第 4 步計算後移除公式欄位，避免週期快照再次加入強度。
- `DamageAttacker` 與 `DamageTarget` 提供修正清單。`DamageModifier` 可依標籤、通道、輸出、事件種類或技能比對。同一識別碼對同一部分只套用一次。資料值衝突時採第一個匹配來源。
- `increase` 的負值表示降低傷害。`more` 的 0.2 表示獨立乘以 1.2，負 0.2 表示乘以 0.8。`critDamage` 是相對基準 200% 的加成。`resistanceCap` 是相對基準 75% 的加成。其他百分比使用小數，固定值使用傷害或防禦單位。
- `DamageAddition.match` 限制附傷的適用事件。缺省只接受直接命中。持續週期附傷須明列 `kind`。
- `DamageShield` 保存獨立容量與匹配條件。`DamageShare` 保存各接收者的生命、護盾與死亡保護資料。
- `rolls` 接受固定布林結果，`roll` 接受判定種類與最終機率。固定結果優先。機率為 0 時不呼叫骰子。兩者均未提供時視為沒有觸發。
- `DamageKind`、`DamageOutput`、`DefenseChannel`、`DamageHistory`、`ReductionLayer` 與 `DamageStat` 都使用 const 物件、as const 與同名推導型別。

`settleDamage` 傳回 `DamageResult`。`trace` 依序保存 26 個 `DamageState`。`recipients[0]` 是原目標，其後是分攤接收者。各承受者都有剩餘生命、護盾、生命損失、護盾消耗、保命、斬殺及擊倒結果。

壓碎的傷害、生命損失與護盾消耗另外保存。`leech`、`reactions`、`stabilityCheck`、`damageBreak`、`shieldHit`、`shieldBroken` 與 `killed` 保存後續結果。斬殺減去的生命不加入偷取與反射基數。結算只回傳資料，呼叫者負責提交狀態及處理衍生事件。

## C1 的 26 步

每個函式接收一份狀態並傳回新狀態。函式不修改先前快照，也不修改輸入。

| 步驟 | 函式 | 工作 |
|---|---|---|
| 1 | `validateDamage` | 接受技能、資源與互動矩陣結果，檢查不相容旗標及重複分攤者 |
| 2 | `generateDamage` | 接受知識與標籤生成結果 |
| 3 | `hitDamage` | 接受攔截後目標的命中與迴避結果 |
| 4 | `baseDamage` | 計算基礎值與效果係數，或生命百分比公式 |
| 5 | `addDamage` | 加入符合來源限制的固定附傷 |
| 6 | `gainDamage` | 以同一份轉換前快照計算額外獲得 |
| 7 | `convertDamage` | 執行一次轉換，截斷或正規化超額比率 |
| 8 | `immuneDamage` | 依最終標籤移除免疫部分 |
| 9 | `increaseDamage` | 合計增加與降低傷害 |
| 10 | `multiplyDamage` | 依序套用獨立乘區 |
| 11 | `criticalDamage` | 使用一組輸出分類判定暴擊與暴擊防禦 |
| 12 | `blockDamage` | 判定格擋，按占比分配格擋值 |
| 13 | `crushDamage` | 先處理壓碎抗性、護盾及最低生命 |
| 14 | `defendDamage` | 依序處理防禦增加、降低、固定降低與兩種穿透 |
| 15 | `resistDamage` | 處理降低抗性、元素穿透及抗性上下限 |
| 16 | `reduceDamage` | 處理承傷降低及事件總量的 95% 聯合上限 |
| 17 | `flatReduceDamage` | 每個固定減傷來源每次事件只扣一次 |
| 18 | `absorbDamage` | 先百分比吸收，再扣固定吸收池 |
| 19 | `vulnerableDamage` | 處理易傷，最高增加 100% |
| 20 | `shareDamage` | 分配主傷害，建立各承受者資料 |
| 21 | `shieldDamage` | 各承受者分別消耗匹配護盾 |
| 22 | `loseDamageLife` | 扣除生命，排除溢出 |
| 23 | `preventDamageDeath` | 處理阻止死亡、替身、階段轉換與死亡免疫 |
| 24 | `executeDamage` | 直接傷害且有生命損失時檢查斬殺 |
| 25 | `followDamage` | 回傳偷取、反射、受傷解除及施法穩定 |
| 26 | `finishDamage` | 回傳荊棘、護盾受擊、破盾及擊殺結果 |

## 特殊傷害與保守選擇

1. 前三步接受外部判定資料。C1 不擁有技能圖、資源登錄或攔截選取。呼叫者須先把攔截後的目標及其數值寫入輸入。未提供 gates 時表示已通過。未通過時保留 26 步零傷害快照。
2. 轉換只執行一輪。它可以轉換額外獲得的部分，但不再次轉換本輪產生的部分，避免循環。只要有來源明列優先級，就先處理明列來源。同級依宣告順序，未列者排最後。全部未列時等比例正規化。
3. 單一部分有多個最終標籤時，採最高匹配抗性。規則沒有指定多標籤抗性合併方式，此選擇避免低抗性標籤抵消高抗性。
4. 聯合上限依事件總量判斷。只有百分比層總額低於防禦前總額的 5% 時才補足。按當時占比分配，差額放在最後部分。固定減傷與吸收仍可把結果降至 0。
5. 格擋、固定減傷、固定吸收與護盾使用同一個占比分配程序。最後一個匹配部分保存差額。多個分攤者依宣告順序截斷，合計最高 100%。重複承受者會被拒絕，避免重複使用同一份生命快照。
6. 分攤接收者只再處理護盾與死亡保護。其護盾以 share 種類匹配。獨立 share 事件採同一規則，不再次套用免疫與普通減傷。
7. 壓碎使用獨立 crush 標籤、無廣泛防禦通道及 crush 種類匹配護盾。壓碎抗性先於護盾。壓碎最多把生命降至 1。壓碎與分攤的生命損失不加入主傷害的偷取、反射或施法穩定。
8. `bleed` 旗標使撕裂跳過物理防禦，並禁止暴擊、偷取與壓碎。`selectBleedingWound` 提供全來源單一最強槽。較強者取代，較弱者保留，同強度只刷新持續時間。呼叫者提供物理與流血標籤及週期資料。
9. 生命百分比公式接受目前、最大或已損失生命。呼叫者依目標類型選擇比率，並提供本次施放剩餘額度。結算回傳 `healthDamageUsed`，供呼叫者扣除額度。百分比額度加入第一部分，明列的強度係數與其他部分照常結算。
10. 無視減傷只跳過明列層，格擋也須明列才跳過，仍處理護盾與死亡保護。最大生命百分比與此旗標並用時拒絕結算。這類事件不能暴擊、偷取或產生依生命損失計算的反射。對於規格未明列的壓碎與斬殺觸發，採保守選擇並停用。
11. 阻止死亡、替身與階段轉換共用輸入的恢復生命值。本次有這類保護時抑制斬殺，避免同一次事件又把目標設為 0。保護恢復的生命不列為實際生命損失。外部替身建立及階段切換由呼叫者處理。
12. 荊棘使用明列固定量，只要求合格近戰接觸。護盾全吸收時仍可觸發。反射只讀取原目標的主傷害生命損失。一般持續傷害可以被反射，撕裂預設排除。衍生事件繼承輸出分類，標籤與防禦通道由反擊資料指定，並清除技能所有權。反射與荊棘都不連鎖。
13. 施法穩定只在輸入提供 `castingStability` 時回傳門檻，表示目標正在進行需要穩定的施法。公式沒有 2 至 19 的一般檢定夾限。護盾全吸收或零生命損失時沒有門檻。
14. 普通補血不自動解除失能或擊倒。呼叫者須使用 `reviveCombatLife` 明確恢復。最大生命與護盾採 100000 試玩上限，生命最低上限為 1，攻擊速度與暴擊率最低為 0。

## 技能接線

- 火球直接傷害、燃燒與寒冰箭都使用 `settleDamage`。輸出是 spell，防禦通道是 spell。技能定義新增 `damageTag`，目前為 fire 與 frost。
- `CombatStats` 新增可選的 `damageTarget` 與 `damageAttacker`。舊實作仍可使用原本的 defense、resistance 與 shield。範例轉接提供相同資料的新目標快照。
- C1 尚未建立戰鬥者生命登錄。舊技能轉接使用 100000 生命作為結算容量，送出的傷害讀取主生命損失及額外壓碎、斬殺量，避免以大生命值相減求傷害。正式生命與原生顯示接線屬於後續階段。
- 目前技能轉接提交原目標傷害與護盾。分攤、偷取、反射、失能及穩定結果的遊戲提交屬於後續整合，純結算 API 已回傳這些資料。
- 燃燒使用 `snapshotDamageOffense` 鎖定基礎值、加成、乘區、轉換與暴擊結果。另複製穿透修正。免疫、防禦、抗性等目標狀態在每次週期讀取。刷新會取消舊排程並建立新快照。
- `resolveDamage` 保留為新結算的相容包裝。它仍回傳 raw、effectiveDefense、reduction、absorbed、shield 與 life。其 life 保留原介面的未限定目標生命語意。新流程的 95% 聯合上限也會生效。
- 既有技能數值與測試預期相同。原有 523 項測試全部通過。新增接線測試驗證標籤、法防通道、動態免疫、輸出快照、穿透快照及刷新。

## C2

- `deriveCombatStats` 實作設計稿的十項二級屬性，並接收各項額外加成。防禦與攻擊力最低為 0，暴擊率最高 50%，暴擊傷害最高 300%，攻擊速度最高 100%。
- `generalCheckValue` 與既有 `checkValue` 共用 `sumCheck` 及 `clampCheck`。最終範圍為 2 至 19。`rollCheck` 保留嚴格大於門檻的規則。
- `CombatLife` 保存角色種類、生命、護盾、最大生命、失能與擊倒。建立、套用、補血及復起函式都傳回狀態。重複套用同一份生命與護盾快照不會再次扣血。
- 生命純狀態位於 entities，因為技能與戰鬥功能會共用。此位置與主設計把生命功能列在 features 的初步表格有差異。登錄、原生命令與顯示仍屬於功能層。
- scholar 原有 level、intelligence、spirit、constitution、manaRegen 的值全部保留。只新增試玩欄位。另新增 patrolMachine。
- 推導結果為學者最大生命 42、近戰 8、遠程 10、物防 2、法防 18。巡檢機最大生命 62、近戰 10、遠程 8、物防 22、法防 8。兩者武器傷害分別為 8 與 13.5。

## 32 位元處理

- 戰鬥算術使用 `combatNumber`、`combatAdd` 與 `combatMultiply`。數值限於正負 2147483520，這是小於 int32 上限的最大 float32 整數。加法與乘法先檢查範圍，再執行運算。超出範圍時拒絕，避免先溢位再檢查。
- 傷害運算接受 `round`。Node 案例在每次加法、乘法、除法結果及相關輸入使用 Math.fround，並檢查中間值不超過 2147483647。另稽核全部烈焰斬快照。
- 轉換排序比較優先級大小，不相減大型優先級。時間使用整數 tick 資料或既有 Clock，不新增浮點時間累加。
- 所有需延後執行的迴圈案例都使用迴圈內 const 複本。正式程式沒有直接列印 Error 物件。Lua 驗證關閉 debug，失敗時只讀取 message。
- Fengari 使用 int32 與 float64。float32 精度的證據來自 Node 案例。正式 Lua 採執行環境精度，不自行以十進位取整。

## 烈焰斬結果

每一步都比對文件的物理與火焰部分，且獨立呼叫該步驟函式。全部誤差小於 0.001。以下為 Node 的 float32 結果。

| 欄位 | 結果 |
|---|---:|
| 壓碎 | 80 |
| 壓碎護盾消耗／生命損失 | 50／30 |
| 有效物防／法防 | 67.5／70 |
| 最終生命 | 865.0496215820312 |
| 主傷害生命損失 | 104.95039367675781 |
| 守護者生命損失 | 14.983467102050781 |
| 偷取 | 10.495039939880371 |
| 反射 | 20.990079879760742 |
| 施法穩定檢定值 | 109.95039367675781 |

## 驗證結果

驗證日期為 2026-11-03。完成屬性只表示 C1 與 C2 的實作及工具驗證完成。

| 指令或檢查 | 結果 |
|---|---|
| npm run test:unit | 619 項通過，0 項失敗。原有 523 項，新增 96 項 |
| npm run test:combat:lua | 84 組通過，0 組失敗 |
| npm run test:save:lua | 11 組通過 |
| npm run test:skill:lua | 16 組通過 |
| npm run test:i18n:lua | 多語言 11 組，本地檔案 12 組通過 |
| npm run test:benchmark:lua | 18 組通過 |
| 全部指定 Lua | 合計 152 組通過，0 組失敗 |
| npm run format:check | 通過 |
| npm run lint:fsd | 0 個問題 |
| npm run build | 已成功封裝 dist/bin/map.w3x，沒有地圖占用錯誤 |
| Prettier --debug-check | 通過 |
| git diff --check | 通過 |
| dist/map.w3x/war3map.lua | 2 ^ 1024 為 0 處 |
| npm run test:skill:artifact | 最終 MPQ 的 5 組檢查通過，含 Lua 與輸出檔相同及超大常數檢查 |

環境原有 21 個 node_modules 連結指向失效的舊工作目錄。已將連結指向本專案既有的 .pnpm 檔案。沒有安裝套件。建置會顯示既有的翻譯缺漏及保留舊鍵提示。

最終地圖 SHA256 為 `6F5F3B943793BA4D508F66A491999A4A84912F3AAA4391776F9FEA5E925E24CD`。

## 檔案

### 新增

- `src/entities/combat/model/damage-event.ts`
- `src/entities/combat/model/damage-steps.ts`
- `src/entities/combat/model/combat-number.ts`
- `src/entities/combat/model/combatant.ts`
- `src/entities/combat/model/bleeding.ts`
- `tests/combat/fixtures.ts`
- `tests/combat/basic-lua.spec.ts`
- `tests/combat/combat.spec.ts`
- `tests/combat/skill-integration.spec.ts`
- `scripts/verify-combat-lua.cjs`
- `docs/combat-system/implementation/PLAN.md`

### 修改

- `src/entities/combat/index.ts`
- `src/entities/combat/model/check.ts`
- `src/entities/combat/model/damage.ts`
- `src/entities/combat/model/stats.ts`
- `src/entities/character/index.ts`
- `src/entities/character/model/roles.ts`
- `src/features/skill/config/definitions.ts`
- `src/features/skill/model/runtime.ts`
- `src/app/wc3-skill-natives.ts`
- `tests/run.ts`
- `package.json`
- `.github/skills/skill-system/SKILL.md`
- `.github/skills/fsd-layers/SKILL.md`

完成經驗已更新到既有 skill-system 與 fsd-layers skill。

## 尚待驗證

C1 與 C2 的工具驗證已完成。後續須依主設計執行遊戲整合與遊戲驗證。依本次任務範圍，未執行會開啟遊戲的 npm run test。主設計的是否完成維持 false。

## C3 遊戲內實驗

建立日期為 2026-11-04。此節提供遊戲內實驗與觀察表。C3 完成條件仍由使用者觀察決定。

### 地圖與單位

- 地圖入口以 `addScriptHook` 掛載 `src/app/combat-experiment.ts`。
- A 位於 `(-60, 700)`，由玩家 0 控制。B 位於 `(60, 700)`，屬於中立敵對。建立後兩者互相攻擊。可以選取 A 並下達移動或攻擊命令。
- 四種單位都由 hfoo 複製。預設緩衝使用 `h0CA`、`h0CB`，小緩衝使用 `h0CC`、`h0CD`。建立前會檢查全部代碼。
- 最大生命為 2000，生命恢復為每秒 10，始終恢復。原生傷害為 2，攻擊範圍為 100，攻擊間隔為 1.5 秒，傷害點與收招點各為 0.5 秒。
- `war3-types-strict/1.33.0/common.j.d.ts` 提供攻擊範圍欄位，但沒有範圍緩衝欄位。本實驗使用 compiletime 物件設定，預設值從 hfoo 讀取為 250，小值為 25。
- 建置腳本在 `data.save` 明確寫入 `urb1`、`udp1`、`ua1c` 與 `uaen`，避免套件省略欄位。原始地圖保持原有內容。

### 全部聊天指令

| 指令 | 功能 |
|---|---|
| `-cx-mode 1` | 選擇 BlzPauseUnitEx。預設方法為 1 |
| `-cx-mode 2` | 動作速度與移速設為 0，停用兩個武器 |
| `-cx-mode 2b` | 動作速度與移速設為 0，清除兩個武器的攻擊目標遮罩 |
| `-cx-mode 3` | 選擇 PauseUnit 對照組 |
| `-cx-pause` | 先增加一次世界時鐘暫停，再套用目前方法到地圖全部存活單位。重複輸入直接返回 |
| `-cx-resume` | 反向還原實驗修改，再解除本實驗的一次世界時鐘暫停 |
| `-cx-buffer default` | 重建 A、B，緩衝為 250，並清除統計 |
| `-cx-buffer small` | 重建 A、B，緩衝為 25，並清除統計 |
| `-cx-tol <數值>` | 設定距離容許值。預設 32，接受 0 至 4096 的有限數值，包含小數 |
| `-cx-status` | 顯示出手、傷害事件、命中、閃避、出手減傷害事件，以及方法、緩衝、容許值與暫停狀態 |
| `-cx-walk` | B 沿遠離 A 的方向移動 400。抵達目的地 32 範圍內後，重新攻擊 A。兩者重疊時沿正 X 方向移動 |
| `-cx-hold` | 取消走開流程，B 立即改為攻擊 A |
| `-cx-reset` | 清除全部四項計數 |

暫停中切換方法時，先完整還原舊方法，再套用新方法。世界時鐘保留本實驗的一次暫停。暫停中重建 A、B 也會先還原舊快照，再重新列舉存活單位。暫停後新增的其他單位會在下次套用時納入。

既有 `-pause`／`-resume` 有自己的引用計數。使用它們增加的暫停，仍須用原指令配對解除。實驗操作請使用 `-cx-pause`／`-cx-resume` 配對。

### 方法 2 的停止攻擊與快照

方法 2 使用 `BlzGetUnitWeaponBooleanField` 保存武器索引 0、1 的 `UNIT_WEAPON_BF_ATTACKS_ENABLED`。原本啟用時，使用 `BlzSetUnitWeaponBooleanField` 設為 false。恢復時設回保存值。原本停用的武器保持原狀。

2b 使用 `BlzGetUnitWeaponIntegerField` 保存兩個武器的 `UNIT_WEAPON_IF_ATTACK_TARGETS_ALLOWED`，再使用 `BlzSetUnitWeaponIntegerField` 寫入 0。恢復時還原各武器原有遮罩。

兩種做法都有對應的原生讀取與寫入函式，可以保存原值。它們讓實驗直接比較武器啟用與目標資格對引導、命令及攻擊冷卻的影響。原生寫入傳回失敗時，以 logger.error 記錄，並回復已修改的欄位。

動作速度使用 `SetUnitTimeScale`。型別宣告沒有對應讀取函式，因此實驗模組載入時包裝全域寫入函式，追蹤後續寫入值。未曾寫入的單位以引擎初始值 1 保存。已檢查目前 src 與原始地圖，沒有其他動作速度寫入。此假設須在未來加入初始化腳本時重新檢查。

快照只保存本實驗實際修改成功的值。還原順序與修改順序相反，包含單位順序及每個單位的欄位順序。方法 1 只配對本實驗的一次計數。方法 3 保留原本已暫停的單位。已移除的單位跳過原生還原操作。還原寫入失敗時保留該筆快照，供再次輸入 `-cx-resume` 重試。

### 實驗 A 的操作步驟

1. 輸入 `-cx-mode 1`。
2. 讓 A 移動，或使用既有 `-skill-move` 讓技能範例敵人移動。
3. 輸入 `-cx-pause`。觀察移動、攻擊與模型動作。
4. 暫停中對 A 下達新的移動或攻擊命令。輸入 `-cx-resume`，觀察恢復後的命令與攻擊間隔。
5. 讓英雄引導火球術。在引導期間輸入 `-cx-pause`，稍候再輸入 `-cx-resume`。記錄是否出現「中斷」，以及原引導是否繼續。
6. 對 2、2b 與 3 重複以上步驟。方法 3 是已知會打斷引導的對照組，仍由本輪遊戲觀察填表。
7. 使用 `-cx-status` 確認實驗與世界時鐘狀態。直接觀察引擎如何處理暫停中的新命令。

| 方法 | 移動中暫停 | 攻擊動作中暫停 | 英雄引導火球術時暫停 | 暫停中下達新命令 | 恢復後繼續原命令 | 攻擊冷卻是否重置 | 其他 |
|---|---|---|---|---|---|---|---|
| 1 | | | 中斷引導 | | | | 不採用 |
| 2 | 正常 | 正常 | 不中斷 | | | | **採用** |
| 2b | 正常 | | | | | | 站著互打時出手比傷害事件多 2 次 |
| 3 | | | | | | | 對照組，不採用 |

2026-11-04 使用者實測：方法 1 會中斷引導。採用方法 2（動作速度 0＋移動速度 0＋停用武器 `UNIT_WEAPON_BF_ATTACKS_ENABLED`）。

### 實驗 B 的操作步驟

1. 解除實驗暫停。輸入 `-cx-buffer default`、`-cx-tol 32`。
2. 讓 A、B 站著互打。先輸入 `-cx-reset`，觀察約 10 秒，再輸入 `-cx-status`。
3. 在 B 開始攻擊動作後，控制 A 移開。觀察浮動文字與傷害日誌，再記錄計數。
4. 輸入 `-cx-hold`，讓 B 回到攻擊。也可使用 `-cx-walk` 觀察 A 攻擊移動中的 B。A 可能會追擊 B，可以對 A 下達停止命令後再觀察距離。
5. 改用 `-cx-buffer small`，以相同容許值重複測試。再比較容許值 0、16、32 或其他試玩值。
6. 每組先清除統計，並在記錄前等待最後一次攻擊動作完成。出手與傷害事件之差包含取消、移動或其他引擎處理，以及尚未到傷害點的攻擊。

傷害前事件只接受 A、B 間且 `BlzGetEventIsAttack()` 為 true 的事件。`meleeReach` 使用攻擊者武器 0 的原生範圍、雙方原生碰撞半徑及容許值。距離大於上限時，傷害設為 0，顯示「閃避」。等於上限時顯示「命中」。每個事件以 logger.info 記錄攻擊者 A／B、距離、上限與結果。

出手次數來自 `EVENT_PLAYER_UNIT_ATTACKED`，傷害次數來自 `EVENT_PLAYER_UNIT_DAMAGING`。兩種事件分開計數，因此可以觀察引擎是否在傷害事件前就取消攻擊。純判定已從 entities/combat 公開，後續整合可重用。

| 緩衝 | 容許值 | 站著互打的出手／傷害事件／閃避 | A 在 B 出手時走開，是否閃避 | 備註 |
|---|---|---|---|---|
| default，250 | 32 | 60／60／0、78／78／0、126／126／0 | 是。引擎顯示紅字「未命中」，沒有傷害事件 | 2026-11-04 使用者確認預設參數可用 |
| small，25 | 32 | | | |
| default，250 | 0 | | | |
| small，25 | 0 | | | |
| | | | | |

### C3 工具驗證

驗證日期為 2026-11-04。遊戲觀察表保持空白。依本次要求，跳過 npm run test。

| 指令或檢查 | 結果 |
|---|---|
| npm run test:unit | 639 項通過，0 項失敗。C3 新增 20 項 |
| npm run format:check | 通過 |
| npm run lint:fsd | 0 個問題 |
| npm run build | 成功封裝 dist/bin/map.w3x，沒有檔案占用錯誤 |
| npm run test:save:lua | 11 組通過 |
| npm run test:skill:lua | 16 組通過 |
| npm run test:i18n:lua | 多語言 11 組、本地檔案 12 組通過 |
| npm run test:benchmark:lua | 18 組通過 |
| npm run test:combat:lua | 87 組通過，包含 C3 的 3 組距離案例 |
| 全部指定 Lua | 155 組通過，0 組失敗 |
| npm run test:skill:artifact | 既有技能產物 5 組通過 |
| npm run test:combat:artifact | C3 產物 7 組通過 |
| Prettier --debug-check | 本次程式、測試與設定通過 |
| git diff --check | 通過 |
| 最終 MPQ 與 dist/map.w3x/war3map.lua | Lua 內容相同，2 ^ 1024 為 0 處 |

最終 MPQ 的 war3map.w3u 原始欄位已逐一檢查。四種單位皆以 hfoo 為來源，urb1 分別為 250、250、25、25，udp1 全部為 0.5，ua1c 全部為 1.5，uaen 全部為 1。每個欄位各出現一次，資料型別符合物件格式。war3mapMisc.txt 的 MinUnitSpeed=0.0 也已確認。

最終地圖 SHA256 為 `6587B09886E909B08623A65B8CA0B1A725E0BE185E1E4EC4F572B64297324747`。

建置產生四個新單位名稱的翻譯鍵。zh-TW 寫入正體中文名稱，zh-CN 與 en-US 保留 null，建置使用 zh-TW。既有翻譯缺漏及保留舊鍵提示仍會出現。

### C3 檔案

新增檔案如下。

- `docs/combat-system/c3/PLAN.md`
- `src/app/combat-experiment.ts`
- `src/entities/combat/model/melee-reach.ts`
- `scripts/combat-experiment-objects.cjs`
- `tests/combat/melee-reach.spec.ts`
- `tests/combat/experiment-objects.spec.ts`
- `tests/combat/experiment.spec.ts`
- `tests/combat/artifact.spec.ts`

修改檔案如下。

- `docs/combat-system/implementation/PLAN.md`
- `src/main.ts`
- `src/entities/combat/index.ts`
- `tests/combat/basic-lua.spec.ts`
- `tests/run.ts`
- `package.json`
- `i18n/objects/zh-TW.json`
- `i18n/objects/zh-CN.json`
- `i18n/objects/en-US.json`

### C3 結果（2026-11-04）

- 戰術暫停採用方法 2。方法 1 會中斷引導。
- 近戰閃避採用預設攻擊範圍緩衝（250）與容許值 32。站著互打沒有誤判；目標在出手時走開可以閃避：引擎自己判定未命中（紅字「未命中」），不產生傷害事件。本系統的距離檢查是備援。
- C4 依此結果整合。

## C4

建立日期為 2026-11-04。是否完成為 true。此狀態只涵蓋 C4 實作與工具驗證。C5 尚待使用者確認。

### 設計與做法

1. `CombatRegistry` 登錄原生單位、陣營、角色種類、唯讀角色資料、二級數值與 `CombatLife`。內部生命與護盾是傷害來源。原生血條只顯示此狀態。
2. `CombatRuntime` 在傷害前事件先把已登錄目標的原生普通攻擊傷害設為 0。玩家普通攻擊依序執行 D20、`meleeReach`、武器事件、`settleDamage` 與生命提交。檢定失敗顯示「未命中」，距離失敗顯示「閃避」。檢定浮動文字包含成功或失敗、骰值與檢定值。
3. 近戰範圍使用原生範圍、雙方碰撞半徑與容許值 32。物件緩衝使用 C3 確認的 250，傷害點為 0.5 秒，基礎間隔為 1.5 秒。英雄執行時依二級攻速設定間隔，試玩值為 1.25 秒。
4. 玩家生命為 0 時，停止命令、保存原生目標分類與無敵值，再移除目標分類並設為無敵。失能使用 `PauseUnit` 阻止原生命令。`-revive` 恢復 42 生命並還原保存值。普通補血不能解除失能。
5. 敵人生命為 0 時，停止移動與武器、移除目標分類、播放死亡動作，再於世界時間 2 秒後移除。重複傷害不重排移除。技能直接傷害與燃燒使用相同流程。
6. `PatrolMachine` 使用巡邏、追擊、準備、作用、收招五種狀態。世界時鐘以 `Phase.Combat` 每 50 毫秒驅動。準備與收招使用整數毫秒，分別為 800 與 600。準備時保存位置與方向，後續目標移動不改變方向。
7. 預告以四條地面閃電邊線形成長 160、寬 80 的矩形，並播放地圖既有的提示音。作用時只擲一次 D20。成功後只對形狀內的有效玩家套用武器傷害。碰撞後沒有第二次 D20。
8. 範例讀取 `patrolMachine` 的準備、收招、形狀、武器與屬性。察覺距離為 600，追擊距離試用 900。範例沿用 `runSkillExample` 入口，建立 1 名符文學者與 2 台巡檢機。原有未登錄的展示步兵已移除。
9. app 將 `CombatStats.damageTarget`、`damageAttacker` 與新增的 `commitDamage` 接到戰鬥登錄。技能直接提交結算結果，更新實際生命、護盾與擊倒。舊技能介面仍由原有測試保護。
10. `UnitActionNatives` 只包裝動作速度、武器、生命顯示、目標分類、命令及單位移除等原生操作。跨功能的技能與戰鬥組合放在 app。兩個 features 沒有互相 import。

### 暫停與動作速度

- `TacticalPause` 訂閱世界時鐘的暫停變化。每個已登錄單位都保存移速與兩個武器的啟用值，再設定動作速度 0、移速 0 與停用武器。暫停中登錄的新單位也立即套用。
- 動作速度由本系統擁有。登錄時明確設定 1，並存在 `Combatant.timeScale`。後續透過 `TacticalPause.setTimeScale` 設定。恢復時讀取此值。此做法使用登錄資料，沒有讀取不存在的原生函式。
- 其他模組要調整已登錄單位的動作速度時，須使用上述介面。C4 直接呼叫 `SetUnitTimeScale` 的位置只有 shared 的原生實作。
- 移速以 `TacticalPause.speed` 與 `setSpeed` 轉接技能減速。暫停中的減速變更更新快照，恢復後才套用。已擊倒單位恢復時仍維持移速 0 與武器停用。
- 暫停只保存玩家的最後一個原生命令。內部停止透過 `TacticalPause.stop`，避免覆蓋玩家命令。恢復命令由世界時鐘零延遲任務執行，確保全部暫停通知完成後，技能資源已還原。
- 原有 `installPauseBridge` 保留。施法中的單位仍跳過全部技能停用與冷卻結束。戰術暫停使用方法 2，失能另使用 `PauseUnit`。
- 武器寫入會檢查原生結果。還原失敗時保留未完成的快照。恢復後再次輸入 `-resume` 可以重試。

### 試玩選擇與規格差異

- 原生生命顯示最低保留 1，內部生命可為 0。這可保留玩家失能單位與敵人的死亡動作。命令、選敵與結算都使用內部有效狀態。
- C4 物件把英雄的原生力量與敏捷設為 0，避免原生生命恢復與攻速再次加成。戰鬥登錄仍讀取符文學者的力量 2、精準 4、身法 4。角色資料檔保持唯讀。
- 50 毫秒步進、追擊距離 900、死亡動作保留 2 秒與提示音是本次選定的試玩值。主規格沒有指定這些值。
- 預告使用原生閃電邊線，形成設計指定的直線矩形。模型外觀與聲音適合程度由 C5 觀察。
- 原生引擎在傷害前就取消近戰攻擊時，沿用 C3 確認的引擎「未命中」文字。此時沒有傷害事件可供本系統擲骰。

### 全部聊天指令

| 指令 | 功能 |
|---|---|
| `-pause` | 增加一次世界時鐘暫停。全部已登錄單位套用方法 2 |
| `-resume` | 解除本範例的一次暫停。引用計數歸零後還原並重播最後命令，也可重試動作快照還原 |
| `-skill-status` | 顯示世界時間、法力、法力恢復、火球冷卻，以及各戰鬥者內部生命、護盾、失能與擊倒 |
| `-skill-move` | 讓存活巡檢機向左右測試點移動。抵達後恢復狀態機，用於技能移動目標測試 |
| `-revive` | 恢復失能的符文學者 |
| `-skill-stop` | 清理技能與戰鬥範例的訂閱、排程、預告、單位與原生資源 |
| `-save` | 保存存檔範例資料 |
| `-load` | 從本地存檔讀取 |
| `-load <存檔碼>` | 直接載入完整存檔碼 |
| `-load <序號>/<總數> <片段>` | 分段輸入存檔碼 |
| `-save-demo`、`-save-demo show` | 顯示存檔範例資料 |
| `-save-demo level <1..100>` | 設定存檔範例等級 |
| `-save-demo gold <0..1000000>` | 設定存檔範例金錢 |
| `-save-demo item <1..6> <0..3>` | 設定存檔範例物品槽 |

火球術快捷鍵為 F，寒冰箭為 I。普通攻擊使用右鍵。存檔範例資料仍與本次戰鬥場景分開保存。

### C4 檔案

以下清單以本次開始時的工作目錄為基準，區分 C4 變更與既有 C1 至 C3 內容。

新增 13 個檔案。

- `src/features/combat/api/natives.ts`
- `src/features/combat/model/registry.ts`
- `src/features/combat/model/attack.ts`
- `src/features/combat/model/patrol-machine.ts`
- `src/features/combat/model/tactical-pause.ts`
- `src/features/combat/model/runtime.ts`
- `src/shared/wc3-def/unit/unit-action-natives.ts`
- `src/shared/wc3-def/unit/wc3-unit-action-natives.ts`
- `scripts/combat-objects.cjs`
- `tests/combat/integration-cases.ts`
- `tests/combat/integration.spec.ts`
- `tests/combat/lua-entry.ts`
- `tests/combat/objects.spec.ts`

修改 16 個檔案。

- `src/features/combat/index.ts`
- `src/entities/combat/model/stats.ts`
- `src/features/skill/model/runtime.ts`
- `src/shared/wc3-def/index.ts`
- `src/app/skill-example.ts`
- `src/app/wc3-skill-natives.ts`
- `src/main.ts`
- `scripts/verify-combat-lua.cjs`
- `tests/combat/artifact.spec.ts`
- `tests/run.ts`
- `.github/skills/skill-system/SKILL.md`
- `.github/skills/fsd-layers/SKILL.md`
- `docs/combat-system/implementation/PLAN.md`
- `i18n/objects/zh-TW.json`
- `i18n/objects/zh-CN.json`
- `i18n/objects/en-US.json`

刪除 4 個 C3 檔案。

- `src/app/combat-experiment.ts`
- `scripts/combat-experiment-objects.cjs`
- `tests/combat/experiment.spec.ts`
- `tests/combat/experiment-objects.spec.ts`

### C4 工具驗證

驗證日期為 2026-11-04。全部指令使用 npm。C4 有 27 項 Node 案例，其中 23 項流程與 Lua 共用，2 項是 Node 還原失敗及 float32 案例，2 項是物件案例。原有 C3 實驗測試已由 C4 案例取代。

| 指令或檢查 | 結果 |
|---|---|
| `npm run test:unit` | 655 項通過，0 項失敗 |
| `npm run format:check` | 通過 |
| `npm run lint:fsd` | 本次檔案 0 個問題。全專案有 2 個問題，均在另一代理的指定區域 |
| TypeScript 正式與測試組態檢查 | 0 個錯誤 |
| `npm run build` | 成功封裝 `dist/bin/map.w3x`，沒有檔案占用錯誤 |
| `npm run test:save:lua` | 11 組通過 |
| `npm run test:skill:lua` | 16 組通過 |
| `npm run test:i18n:lua` | 多語言 11 組、本地檔案 12 組通過 |
| `npm run test:benchmark:lua` | 18 組通過 |
| `npm run test:combat:lua` | 111 組通過，含既有 87 組、C4 流程 23 組與驗證器故障注入 1 組 |
| 全部指定 Lua | 179 組通過，0 組失敗 |
| `npm run test:combat:artifact` | 7 組通過 |
| `npm run test:skill:artifact` | 5 組通過 |
| `npm run test:i18n:artifact` | 8 組通過 |
| `npm run test:benchmark:artifact` | 1 支產物驗證程式通過 |
| Prettier `--debug-check` | 本次程式、腳本與測試通過 |
| `git diff --check` | 通過 |
| 最終 MPQ 與 `dist/map.w3x/war3map.lua` | Lua 相同，`2 ^ 1024` 為 0 處 |

最終 MPQ 的 `war3map.w3u` 已直接解析。H0SS 與 h0CM 的 `urb1=250`、`udp1=0.5`、`ua1c=1.5`、`ua1w=normal`、`ua1r=100` 均各有一筆。`uaen` 分別為 1 與 0。英雄的 `ustr` 與 `uagi` 皆為 0。`war3mapMisc.txt` 保留 `MinUnitSpeed=0.0`。

最終地圖 SHA256 為 `A94AD282C916D9F194FA0ACDF9BB0C76568B97F25346314AC0CFDBCB4241E12B`。

TSTL 的部分 `try/finally` 轉譯會吞掉例外。本次新增的相關路徑使用明確 catch 清理與重新拋出。驗證器故障注入已確認 Lua 會拒絕失敗案例。

### 另一代理的工作與剩餘事項

- 看見 `src/entities/item/`、`src/entities/character/`、`src/features/equipment/`、`tests/hero/` 與 `docs/hero-item-attributes/` 的進行中檔案。本次對這些區域維持唯讀。
- Steiger 的 2 個問題分別為 `entities/item` 只有 equipment 使用，以及 `features/equipment` 尚無使用者。兩者都是 `fsd/insignificant-slice`。依任務要求，交由另一代理處理。
- 建置仍顯示既有翻譯缺漏與舊鍵保留提示。新巡檢機名稱的 zh-CN 與 en-US 使用 zh-TW 後備文字。
- C5 尚待遊戲內驗證。主設計的 `是否完成` 為 false。

### C5 遊戲內驗證步驟

手動載入本次 `dist/bin/map.w3x`。每組需要完整敵人時，重新載入地圖。

1. 確認只有本範例建立的 1 名符文學者與 2 台巡檢機。巡檢機在兩點間巡邏，接近後追擊。
2. 等巡檢機進入準備。確認地面出現長 160、寬 80 的預告與提示音。準備期間向側面移動。確認方向固定，且 D20 成功時，走出形狀仍不受傷。此步驗收「預告可以閃避」。
3. 對巡檢機右鍵普通攻擊。觀察「命中檢定 成功／失敗」、骰值、檢定值及傷害。失敗時確認「未命中」。攻擊動作中走開，確認引擎可以取消近戰命中。此步驗收「檢定結果有顯示」。
4. 讓巡檢機把學者生命降至 0。以 `-skill-status` 確認內部生命為 0 與失能為 true。確認學者停止行動、命令無效，巡檢機不再選其為目標。輸入 `-revive`，確認生命為 42，且可以移動、普通攻擊與施法。
5. 分別用普通攻擊、寒冰箭與火球燃燒擊倒敵人。確認「擊倒」、死亡動作與約 2 秒後移除。此步與上一步驗收「失能與擊倒正確」。
6. 在移動、普通攻擊與敵人準備時輸入 `-pause`。確認全部已登錄單位的位移、攻擊與模型動作停止，預告計時與傷害也停止。暫停中先下達一個命令，再改成另一個命令。輸入 `-resume`，確認只執行最後命令。
7. 在火球引導中暫停，保持原命令，再恢復。確認引導沒有因暫停而中斷，且原施法繼續。另測暫停中下達新的技能命令，確認資源恢復後可執行。連續輸入兩次 `-pause`，第一次 `-resume` 應仍暫停，第二次才恢復。此步與上一步驗收「暫停時全部停止」。
8. 用 `-skill-move` 檢查技能對移動敵人的流程。用 `-save-demo show`、`-save`、修改範例值與 `-load`，確認存檔範例仍可操作。

本次依任務限制保留 C5 給使用者執行。工具驗證結果與遊戲內完成條件分開記錄。

## C5 遊戲內驗證（第一輪，2026-11-04）

由 Claude 以 PowerShell 操作遊戲視窗（前景、模擬按鍵與點擊、截圖）。

| 項目 | 結果 |
|---|---|
| 檢定結果顯示 | 通過。浮動文字顯示「命中檢定 成功／失敗，骰值，檢定值」與傷害數值 |
| 巡檢機預告 | 通過。準備時地面顯示直線形狀 |
| 玩家失能 | 通過。生命 0 時失能、指令卡消失、原生顯示保留 1；巡檢機不再以學者為目標 |
| `-revive` | 通過。恢復為目前最大生命 |
| 敵人擊倒與移除 | 通過。被擊倒的巡檢機從戰鬥者清單移除 |
| 暫停時全部停止 | 通過。移動中的巡檢機在暫停的 3 秒內位置不變；學者的武器停用；恢復後繼續行動 |
| 走出預告形狀即可閃避 | **未驗證**。需要精確的移動時機 |
| 引導中暫停不中斷、恢復後只執行最後命令 | **未驗證**。範例中敵人都被擊倒後，沒有施法目標 |

觀察：範例開始後，學者沒有命令時會被巡檢機擊倒（約 48 秒）。這是正常的戰鬥結果。

## C5 遊戲內驗證（第二輪，2026-11-04）

由使用者操作，Claude 依截圖判讀。

| 項目 | 結果 |
|---|---|
| 走出預告形狀即可閃避 | 通過。使用者確認走出形狀後不受傷；留在形狀內時被擊倒 |
| 引導中暫停不中斷 | 通過。暫停時引導光束保留，恢復後施法完成 |
| 恢復後只執行最後命令 | 未驗證 |

觀察：預告邊線使用 `DRAL` 材質。`SetLightningColor` 與材質顏色相乘，所以設定的橘紅色顯示為綠色。這不影響功能。
