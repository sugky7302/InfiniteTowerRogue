---
建立日期: 2026-11-06
是否完成: true
---

# 模組層級常數改名

## 目的

AGENTS.md 規定模組層級的常數使用大寫蛇形命名法（UPPER_SNAKE_CASE，2026-11-05）。既有程式在此規則之前寫成，大多使用 camelCase。本設計把 `src/` 中的既有常數一次改名，然後刪除 AGENTS.md 的過渡條款。

## 使用者決策（2026-11-06）

| 問題 | 決策 |
|---|---|
| 要改名的常數 | 模組層級的純量常數（數字、字串）與固定資料表（陣列、對照表） |
| 不改名的常數 | 帶同名 `type` 的常數物件、函式、類別 |
| 範圍 | 只改 `src/` 中宣告的常數 |
| `tests/` 與 `scripts/` | 只更新被改名的 `src/` 常數的 import 與使用處。`tests/`、`scripts/` 自己宣告的常數不改名 |
| 單一筆資料定義 | 不改名。例如技能 `fireball`、`frostbolt`；角色數值 `scholar`、`patrolMachine`、`testEnemy`、`runeScholar`；存檔結構 `heroSection`、`equipmentSectionV3`、`equipmentSection`；語系表 `enUS`、`zhCN`、`zhTW` |
| 實作者 | Codex（使用者同意，因為這是機械式的改名） |

## 改名規則

- 新名稱由舊名稱直接轉換：在小寫字母或數字與大寫字母之間加 `_`，然後全部改為大寫。例如 `maxPackedBytes` → `MAX_PACKED_BYTES`。
- 只改名稱，不改值、型別、檔案位置與匯出方式。
- 以符號改名（例如 TypeScript 的「重新命名符號」）。不得使用全域文字取代。
    - 使用 TypeScript 語言服務時，載入的檔案範圍必須包含 `src/**/*.ts` 與 `tests/**/*.ts`。`tsconfig.json` 只包含 `src`，所以只用它時，`tests/` 的引用不會更新。
    - 以「宣告檔案＋名稱」找出目標，只更新指向該宣告的引用。
    - 同名的區域變數與參數不改。例如 `src/app/hero-save.ts` 的區域變數 `bases`，以及 `src/features/equipment/ui/text.ts` 的區域變數 `affixes`。
    - 一般物件的屬性名稱與字串內容不改，例如存檔欄位名稱 `"bases"`。
- 宣告處、同一檔案的使用處、其他檔案的 import 與使用處，全部一起改。
    - `export *` 的再匯出不用改。`export { a as b }` 只改來源名稱 `a`，不改別名 `b`。
    - import 路徑與 `index.ts` 公開入口不變。
- 一般資料物件的簡寫屬性會讓屬性名稱跟著改變。這時保留原屬性名稱。例如 `src/shared/lib/rxwc3/benchmark/wc3/p1.ts` 的 `{ warmup, iterations, rounds }` 改為 `{ warmup: WARMUP, iterations: ITERATIONS, rounds: ROUNDS }`。
- 以「模組物件」讀取匯出的程式，屬性名稱改為新名稱。模組物件是 `require(...)` 或 `import * as` 的結果，以及模擬它的物件。下列位置全部要改：
    - `scripts/inventory-objects.cjs`：`config.nativeItemTypes` 等改為 `config.NATIVE_ITEM_TYPES` 等。呼叫端是 `src/app/skill-example.ts`，它傳入模組物件，不用改。
    - `tests/inventory/objects.spec.ts`：模擬模組物件的 `config` 與第 40 行的覆寫物件，屬性改為 `NATIVE_ITEM_TYPES`、`NATIVE_ITEM_ICONS`、`NATIVE_ITEM_NAMES`。
    - `scripts/skill-objects.cjs`：解構 `{ skills, ... }` 改為 `{ SKILLS: skills, ... }`。只改來源屬性，函式內的區域名稱 `skills` 與它的引用不改。
    - `tests/skill/objects.spec.ts`：`definitions.skills` 改為 `definitions.SKILLS`。
    - `scripts/decode-bench.cjs`：第 9 行的解構 `{ unescapeFileData, fileAbility }` 改為 `{ unescapeFileData, FILE_ABILITY: fileAbility }`。區域名稱 `fileAbility` 與第 24 行的引用不改。`tests/rxwc3/benchmark-p3.spec.ts` 載入此檔案，所以漏改時 `test:unit` 會失敗。
    - `.cjs` 檔不在 TypeScript 的型別檢查範圍內，「重新命名符號」不會更新它們。上列位置必須逐一手動確認。
- 建置產物測試中寫死的 Lua 識別符名稱也要更新：`tests/hero-save/artifact.spec.ts` 第 37 行的 `"maxPackedBytes = 768"`、`"maxSaveCodeLength = 1600"`。資料字串不改。
- `.github/skills/` 與 `docs/` 中提到舊名稱的地方，由 Claude 更新。已完成的 `docs/*/PLAN.md` 是歷史紀錄，不改。

## 不改名的項目

以 TypeScript 編譯器列出 `src/` 中全部模組層級的 `const` 識別符（解構宣告的每個名稱分開計算），共 168 個：16 個已使用 UPPER_SNAKE_CASE（例如 `KNOWLEDGE_CATALOG`、`TICKS_PER_SECOND`，以及 `src/main.ts` 的 `BUILD_DATE` 等），66 個要改名，86 個不改名。不改名的項目如下：

| 類別 | 數量 | 例子 | 原因 |
|---|---|---|---|
| 帶同名 `type` 的常數物件 | 24 | `EquipSlot`、`FileReadStatus`、`GoalStatus` | AGENTS.md 規定維持 PascalCase |
| 函式（箭頭函式、條件選出的函式） | 10 | `protectedCall` | 函式維持原命名 |
| 可變的狀態 | 5 | `queue`、`visited`、`counts`、`usedPrefixes`、`config` | 內容會在執行時改變，不是常數 |
| 具有執行期狀態的實例 | 13 | `worldClock`、`uiClock`、`inventoryRegistry`；`src/shared/lib/rxwc3/wc3/events.ts` 解構的 10 個事件來源（`onDamaging`、`onPlayerChat` 等） | 不屬於固定資料表 |
| 原生函式介面的實作與服務物件 | 15 | `wc3UnitNatives`、`wc3I18nNatives`、`logger` | 內容是函式，用法與函式相同 |
| `declare const` 與全域別名 | 7 | `string`、`os`、`__i18nObjectData`、`globals` | 名稱由 Lua 或 WC3 決定 |
| 單一筆資料定義 | 12 | `fireball`、`scholar`、`heroSection`、`enUS` | 使用者決定 |

## 改名清單（66 個）

位置與行號是 2026-11-06 的狀態。「匯出」為「是」時，其他檔案也要更新。

| 位置 | 匯出 | 舊名稱 | 新名稱 |
|---|---|---|---|
| `src/app/hero-example.ts:47` | 否 | `slotOrder` | `SLOT_ORDER` |
| `src/app/hero-example.ts:53` | 否 | `slots` | `SLOTS` |
| `src/app/hero-example.ts:59` | 否 | `bases` | `BASES` |
| `src/app/hero-example.ts:66` | 否 | `statNames` | `STAT_NAMES` |
| `src/app/hero-example.ts:81` | 否 | `bonusNames` | `BONUS_NAMES` |
| `src/app/hero-save.ts:23` | 是 | `heroPresets` | `HERO_PRESETS` |
| `src/app/hero-save.ts:24` | 是 | `heroClasses` | `HERO_CLASSES` |
| `src/app/hero-save.ts:25` | 是 | `heroKnowledge` | `HERO_KNOWLEDGE` |
| `src/app/hero-save.ts:26` | 是 | `heroBases` | `HERO_BASES` |
| `src/app/hero-save.ts:34` | 是 | `heroTiers` | `HERO_TIERS` |
| `src/app/hero-save.ts:40` | 是 | `heroAffixes` | `HERO_AFFIXES` |
| `src/app/hero-save.ts:41` | 是 | `heroSlots` | `HERO_SLOTS` |
| `src/entities/character/config/classes.ts:11` | 是 | `classDefinitions` | `CLASS_DEFINITIONS` |
| `src/entities/combat/model/combat-number.ts:2` | 是 | `combatNumberLimit` | `COMBAT_NUMBER_LIMIT` |
| `src/entities/combat/model/damage-steps.ts:1015` | 是 | `damageSteps` | `DAMAGE_STEPS` |
| `src/entities/item/config/affixes.ts:107` | 是 | `affixes` | `AFFIXES` |
| `src/entities/item/config/affixes.ts:41` | 否 | `attackRanges` | `ATTACK_RANGES` |
| `src/entities/item/config/affixes.ts:42` | 否 | `defenseRanges` | `DEFENSE_RANGES` |
| `src/entities/item/config/affixes.ts:44` | 是 | `affixTables` | `AFFIX_TABLES` |
| `src/entities/item/config/affixes.ts:58` | 是 | `tierAffixCounts` | `TIER_AFFIX_COUNTS` |
| `src/entities/item/config/affixes.ts:94` | 否 | `offense` | `OFFENSE` |
| `src/entities/item/config/affixes.ts:95` | 否 | `survival` | `SURVIVAL` |
| `src/entities/item/config/bases.ts:15` | 是 | `itemBases` | `ITEM_BASES` |
| `src/features/equipment/config/inventory-icons.ts:3` | 是 | `emptyBagIcon` | `EMPTY_BAG_ICON` |
| `src/features/equipment/config/inventory-icons.ts:4` | 是 | `emptyEquipmentIcons` | `EMPTY_EQUIPMENT_ICONS` |
| `src/features/equipment/config/native-items.ts:12` | 是 | `nativeItemIcons` | `NATIVE_ITEM_ICONS` |
| `src/features/equipment/config/native-items.ts:20` | 是 | `nativeItemNames` | `NATIVE_ITEM_NAMES` |
| `src/features/equipment/config/native-items.ts:4` | 是 | `nativeItemTypes` | `NATIVE_ITEM_TYPES` |
| `src/features/equipment/model/bag.ts:3` | 是 | `bagSize` | `BAG_SIZE` |
| `src/features/equipment/ui/layout.ts:20` | 是 | `previewModelPath` | `PREVIEW_MODEL_PATH` |
| `src/features/equipment/ui/layout.ts:2` | 是 | `inventorySlots` | `INVENTORY_SLOTS` |
| `src/features/equipment/ui/text.ts:14` | 是 | `equipmentSlotNames` | `EQUIPMENT_SLOT_NAMES` |
| `src/features/equipment/ui/text.ts:20` | 是 | `equipmentStatNames` | `EQUIPMENT_STAT_NAMES` |
| `src/features/equipment/ui/text.ts:35` | 是 | `equipmentStatOrder` | `EQUIPMENT_STAT_ORDER` |
| `src/features/equipment/ui/text.ts:50` | 否 | `percentStats` | `PERCENT_STATS` |
| `src/features/equipment/ui/text.ts:75` | 否 | `bonusNames` | `BONUS_NAMES` |
| `src/features/equipment/ui/text.ts:95` | 否 | `percentBonuses` | `PERCENT_BONUSES` |
| `src/features/save/config/keys.ts:2` | 是 | `saveKeys` | `SAVE_KEYS` |
| `src/features/save/config/keys.ts:5` | 是 | `currentKeyVersion` | `CURRENT_KEY_VERSION` |
| `src/features/save/lib/hash.ts:4` | 否 | `initial` | `INITIAL` |
| `src/features/save/lib/hash.ts:5` | 否 | `constants` | `CONSTANTS` |
| `src/features/save/model/chat.ts:23` | 是 | `saveFilePath` | `SAVE_FILE_PATH` |
| `src/features/save/model/chat.ts:24` | 是 | `readableSavePath` | `READABLE_SAVE_PATH` |
| `src/features/save/model/codec.ts:5` | 是 | `saveAlphabet` | `SAVE_ALPHABET` |
| `src/features/save/model/codec.ts:6` | 是 | `maxSaveCodeLength` | `MAX_SAVE_CODE_LENGTH` |
| `src/features/save/model/demo.ts:6` | 是 | `demoItemCatalog` | `DEMO_ITEM_CATALOG` |
| `src/features/save/model/demo.ts:7` | 是 | `demoSaveVersion` | `DEMO_SAVE_VERSION` |
| `src/features/save/model/format.ts:38` | 是 | `maxPackedBytes` | `MAX_PACKED_BYTES` |
| `src/features/save/model/manual-input.ts:4` | 是 | `manualFragmentLength` | `MANUAL_FRAGMENT_LENGTH` |
| `src/features/skill/config/definitions.ts:67` | 是 | `skills` | `SKILLS` |
| `src/features/skill/config/definitions.ts:69` | 是 | `areaChallenge` | `AREA_CHALLENGE` |
| `src/shared/lib/file-io/codec.ts:1` | 否 | `alphabet` | `ALPHABET` |
| `src/shared/lib/file-io/codec.ts:3` | 是 | `maxFileDataLength` | `MAX_FILE_DATA_LENGTH` |
| `src/shared/lib/file-io/preload.ts:11` | 是 | `filePreloadEnd` | `FILE_PRELOAD_END` |
| `src/shared/lib/file-io/preload.ts:12` | 否 | `escapeCharacter` | `ESCAPE_CHARACTER` |
| `src/shared/lib/file-io/preload.ts:2` | 否 | `abilityCode` | `ABILITY_CODE` |
| `src/shared/lib/file-io/preload.ts:3` | 是 | `fileAbility` | `FILE_ABILITY` |
| `src/shared/lib/file-io/preload.ts:8` | 是 | `filePreloadLimit` | `FILE_PRELOAD_LIMIT` |
| `src/shared/lib/file-io/preload.ts:9` | 是 | `filePreloadStart` | `FILE_PRELOAD_START` |
| `src/shared/lib/i18n/preference.ts:4` | 是 | `languagePreferencePath` | `LANGUAGE_PREFERENCE_PATH` |
| `src/shared/lib/rxwc3/benchmark/wc3/p1.ts:10` | 否 | `warmup` | `WARMUP` |
| `src/shared/lib/rxwc3/benchmark/wc3/p1.ts:11` | 否 | `iterations` | `ITERATIONS` |
| `src/shared/lib/rxwc3/benchmark/wc3/p1.ts:12` | 否 | `rounds` | `ROUNDS` |
| `src/shared/lib/rxwc3/benchmark/workloads.ts:17` | 是 | `cases` | `CASES` |
| `src/shared/lib/rxwc3/sync/fragments.ts:5` | 是 | `maxFragmentCount` | `MAX_FRAGMENT_COUNT` |
| `src/shared/lib/rxwc3/sync/fragments.ts:6` | 是 | `maxTransferBytes` | `MAX_TRANSFER_BYTES` |

## 驗證

### 命名檢查測試（Codex 依 TDD 先寫，Antigravity 檢查）

- 位置：`tests/naming/constant-naming.spec.ts`，加入 `tests/run.ts`。
- 以 TypeScript 編譯器讀取 `src/` 的全部 `.ts` 檔（不含 `.d.ts`），找出模組層級的 `const` 識別符。解構宣告的每個名稱分開檢查。
- 判斷初始值前，先移除外層的括號、`as`、`satisfies` 與型別斷言。
- 下列項目不檢查：
    - `declare const`。
    - 同一檔案有同名 `type` 的常數物件（只適用於初始值是物件常值的常數）。
    - 初始值是箭頭函式或函式運算式。
    - 允許清單：「不改名的項目」中其他類別的每一項，以「檔案路徑:名稱」寫出，並寫出類別。
- 其餘名稱必須符合 `/^[A-Z][A-Z0-9]*(_[A-Z0-9]+)*$/`。初始值的種類（常值、函式呼叫、運算式）不影響判斷，所以 `heroKnowledge`、`attackRanges`、`fileAbility` 等計算產生的常數也會被檢查。
- 另外以改名清單逐項確認：新名稱的宣告存在於清單的檔案，舊名稱的模組層級宣告已不存在。
- 允許清單中有、但 `src/` 中已不存在的項目，也使測試失敗，讓清單保持正確。
- 改名前，此測試只因改名清單的 66 個項目失敗；改名後通過。

### 行為不變

- 下列檢查全部通過：
    - `npm run test:unit`、`npm run lint:fsd`、`npm run format:check`、`npm run build`。
    - Lua：`test:hero:lua`、`test:save:lua`、`test:skill:lua`、`test:combat:lua`、`test:i18n:lua`、`test:benchmark:lua`。
    - 建置產物：`test:save:artifact`、`test:hero:artifact`、`test:skill:artifact`、`test:combat:artifact`、`test:i18n:artifact`、`test:benchmark:artifact`、`test:ui:artifact`（在 `build` 之後執行）。
- 物件資料不變：改名前，建置一次並保存 `dist/map.w3x/` 的 `war3map.w3a`、`war3map.w3t`、`war3map.w3u`。改名後再建置，三個檔案的位元組必須相同。不比較整張地圖或 `war3map.lua`，因為 Lua 名稱與建置日期會改變。
- 在測試地圖（`pnpm run test`）中確認地圖可以啟動、存檔與讀檔正常、物品欄可以打開。

## 完成後

- 刪除 AGENTS.md 的「既有程式的名稱另外安排一次改名，在此之前不受此規則限制。」。
- 精煉為 skill，放到 `.github/skills/`，或更新既有 skill。

## 審核紀錄

2026-11-06 第一輪：Codex 與 Antigravity 都要求修正。已補上：以符號改名、模組物件的屬性規則與位置清單、建置產物測試的字串、總數 168 與事件來源實例、命名測試的判斷方法與位置、Lua 與產物測試指令、物件資料的比較方法。

2026-11-06 第二輪：兩方確認第一輪各項已處理，改名清單沒有漏列或誤列。Codex 要求：`skill-objects.cjs` 保留區域名稱 `skills`；命名測試不排除同名 `interface`。Antigravity 要求：補上 `scripts/decode-bench.cjs`。另外補上語言服務的檔案範圍，並修正兩處描述（`createInventoryObjects` 的呼叫端、`BUILD_DATE` 不是 `declare`）。

2026-11-06 第三輪：Codex 與 Antigravity 都沒有必須修正的項目，結論是可以進行。設計稿定稿。

## 不包含

- `tests/` 與 `scripts/` 自己宣告的常數。
- 函式內的區域常數。
- 檔名與資料夾名稱。
