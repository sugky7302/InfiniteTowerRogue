import { strict as assert } from "node:assert";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import * as ts from "typescript";

type AllowedCategory =
    | "函式"
    | "可變的狀態"
    | "具有執行期狀態的實例"
    | "原生函式介面的實作與服務物件"
    | "declare const 與全域別名"
    | "單一筆資料定義";

interface AllowedConstant {
    key: string;
    category: AllowedCategory;
}

interface RenameEntry {
    file: string;
    oldName: string;
    newName: string;
}

interface ModuleConstant {
    key: string;
    automaticallyExcluded: boolean;
    name: string;
}

// 每項均依定稿規格核對宣告。自動排除的函式與 declare const 仍列在此處。
const ALLOWED_CONSTANTS: readonly AllowedConstant[] = [
    { key: "src/entities/combat/model/check.ts:attributeModifier", category: "函式" },
    { key: "src/entities/combat/model/check.ts:clampCheck", category: "函式" },
    { key: "src/entities/combat/model/damage.ts:spellPower", category: "函式" },
    { key: "src/entities/combat/model/damage.ts:manaCapacity", category: "函式" },
    { key: "src/entities/combat/model/damage.ts:spellDefense", category: "函式" },
    { key: "src/entities/knowledge/model/knowledge.ts:safeExp", category: "函式" },
    { key: "src/features/skill/config/definitions.ts:yardsToWc3", category: "函式" },
    { key: "src/features/skill/config/definitions.ts:castSeconds", category: "函式" },
    { key: "src/features/skill/config/definitions.ts:rangeYards", category: "函式" },
    { key: "src/shared/lib/rxwc3/core/protected-call.ts:protectedCall", category: "函式" },
    { key: "src/shared/lib/rxwc3/signal/runtime.ts:queue", category: "可變的狀態" },
    { key: "src/shared/lib/rxwc3/signal/runtime.ts:visited", category: "可變的狀態" },
    { key: "src/shared/lib/rxwc3/signal/runtime.ts:counts", category: "可變的狀態" },
    { key: "src/shared/lib/rxwc3/sync/sync.ts:usedPrefixes", category: "可變的狀態" },
    { key: "src/shared/lib/rxwc3/core/config.ts:config", category: "可變的狀態" },
    { key: "src/app/hero-save.ts:inventoryRegistry", category: "具有執行期狀態的實例" },
    {
        key: "src/shared/lib/rxwc3/scheduler/clocks.ts:worldClock",
        category: "具有執行期狀態的實例",
    },
    { key: "src/shared/lib/rxwc3/scheduler/clocks.ts:uiClock", category: "具有執行期狀態的實例" },
    { key: "src/shared/lib/rxwc3/wc3/events.ts:onDamaging", category: "具有執行期狀態的實例" },
    { key: "src/shared/lib/rxwc3/wc3/events.ts:onDamaged", category: "具有執行期狀態的實例" },
    { key: "src/shared/lib/rxwc3/wc3/events.ts:onSpellChannel", category: "具有執行期狀態的實例" },
    { key: "src/shared/lib/rxwc3/wc3/events.ts:onSpellCast", category: "具有執行期狀態的實例" },
    { key: "src/shared/lib/rxwc3/wc3/events.ts:onSpellEffect", category: "具有執行期狀態的實例" },
    { key: "src/shared/lib/rxwc3/wc3/events.ts:onSpellFinish", category: "具有執行期狀態的實例" },
    { key: "src/shared/lib/rxwc3/wc3/events.ts:onSpellEndCast", category: "具有執行期狀態的實例" },
    { key: "src/shared/lib/rxwc3/wc3/events.ts:onUnitOrder", category: "具有執行期狀態的實例" },
    { key: "src/shared/lib/rxwc3/wc3/events.ts:onUnitDeath", category: "具有執行期狀態的實例" },
    { key: "src/shared/lib/rxwc3/wc3/events.ts:onPlayerChat", category: "具有執行期狀態的實例" },
    {
        key: "src/shared/lib/i18n/natives.ts:wc3I18nNatives",
        category: "原生函式介面的實作與服務物件",
    },
    { key: "src/shared/lib/logger.ts:logger", category: "原生函式介面的實作與服務物件" },
    {
        key: "src/shared/lib/wc3-def/ability/wc3-ability-natives.ts:wc3AbilityNatives",
        category: "原生函式介面的實作與服務物件",
    },
    {
        key: "src/shared/lib/wc3-def/effect/wc3-effect-natives.ts:wc3EffectNatives",
        category: "原生函式介面的實作與服務物件",
    },
    {
        key: "src/shared/lib/wc3-def/file/wc3-file-natives.ts:wc3FileNatives",
        category: "原生函式介面的實作與服務物件",
    },
    {
        key: "src/shared/lib/wc3-def/frame/wc3-frame-natives.ts:wc3FrameNatives",
        category: "原生函式介面的實作與服務物件",
    },
    {
        key: "src/shared/lib/wc3-def/item/wc3-item-carrier-natives.ts:wc3ItemCarrierNatives",
        category: "原生函式介面的實作與服務物件",
    },
    {
        key: "src/shared/lib/wc3-def/item/wc3-item-natives.ts:wc3ItemNatives",
        category: "原生函式介面的實作與服務物件",
    },
    {
        key: "src/shared/lib/wc3-def/player/wc3-player-natives.ts:wc3PlayerNatives",
        category: "原生函式介面的實作與服務物件",
    },
    {
        key: "src/shared/lib/wc3-def/random/wc3-random-natives.ts:wc3RandomNatives",
        category: "原生函式介面的實作與服務物件",
    },
    {
        key: "src/shared/lib/wc3-def/timer/wc3-timer-natives.ts:wc3TimerNatives",
        category: "原生函式介面的實作與服務物件",
    },
    {
        key: "src/shared/lib/wc3-def/trigger/wc3-trigger-natives.ts:wc3EventNatives",
        category: "原生函式介面的實作與服務物件",
    },
    {
        key: "src/shared/lib/wc3-def/trigger/wc3-trigger-natives.ts:wc3SyncNatives",
        category: "原生函式介面的實作與服務物件",
    },
    {
        key: "src/shared/lib/wc3-def/unit/wc3-unit-action-natives.ts:wc3UnitActionNatives",
        category: "原生函式介面的實作與服務物件",
    },
    {
        key: "src/shared/lib/wc3-def/unit/wc3-unit-natives.ts:wc3UnitNatives",
        category: "原生函式介面的實作與服務物件",
    },
    { key: "src/features/save/lib/hash.ts:string", category: "declare const 與全域別名" },
    {
        key: "src/shared/lib/i18n/i18n-example.ts:__i18nObjectData",
        category: "declare const 與全域別名",
    },
    {
        key: "src/shared/lib/rxwc3/benchmark/wc3/runtime.ts:os",
        category: "declare const 與全域別名",
    },
    {
        key: "src/shared/lib/rxwc3/benchmark/wc3/runtime.ts:collectgarbage",
        category: "declare const 與全域別名",
    },
    { key: "src/shared/lib/rxwc3/sync/limits.ts:string", category: "declare const 與全域別名" },
    {
        key: "src/shared/lib/rxwc3/sync/sync-chunked.ts:string",
        category: "declare const 與全域別名",
    },
    {
        key: "src/shared/lib/wc3-def/file/wc3-file-natives.ts:globals",
        category: "declare const 與全域別名",
    },
    { key: "src/app/hero-save.ts:heroSection", category: "單一筆資料定義" },
    { key: "src/app/hero-save.ts:equipmentSectionV3", category: "單一筆資料定義" },
    { key: "src/app/hero-save.ts:equipmentSection", category: "單一筆資料定義" },
    { key: "src/entities/character/config/heroes.ts:runeScholar", category: "單一筆資料定義" },
    { key: "src/entities/character/model/roles.ts:scholar", category: "單一筆資料定義" },
    { key: "src/entities/character/model/roles.ts:patrolMachine", category: "單一筆資料定義" },
    { key: "src/entities/character/model/roles.ts:testEnemy", category: "單一筆資料定義" },
    { key: "src/features/skill/config/definitions.ts:fireball", category: "單一筆資料定義" },
    { key: "src/features/skill/config/definitions.ts:frostbolt", category: "單一筆資料定義" },
    { key: "src/shared/lib/i18n/locales/en-US.ts:enUS", category: "單一筆資料定義" },
    { key: "src/shared/lib/i18n/locales/zh-CN.ts:zhCN", category: "單一筆資料定義" },
    { key: "src/shared/lib/i18n/locales/zh-TW.ts:zhTW", category: "單一筆資料定義" },
];

const RENAME_ENTRIES: readonly RenameEntry[] = [
    { file: "src/app/hero-example.ts", oldName: "slotOrder", newName: "SLOT_ORDER" },
    { file: "src/app/hero-example.ts", oldName: "slots", newName: "SLOTS" },
    { file: "src/app/hero-example.ts", oldName: "bases", newName: "BASES" },
    { file: "src/app/hero-example.ts", oldName: "statNames", newName: "STAT_NAMES" },
    { file: "src/app/hero-example.ts", oldName: "bonusNames", newName: "BONUS_NAMES" },
    { file: "src/app/hero-save.ts", oldName: "heroPresets", newName: "HERO_PRESETS" },
    { file: "src/app/hero-save.ts", oldName: "heroClasses", newName: "HERO_CLASSES" },
    { file: "src/app/hero-save.ts", oldName: "heroKnowledge", newName: "HERO_KNOWLEDGE" },
    { file: "src/app/hero-save.ts", oldName: "heroBases", newName: "HERO_BASES" },
    { file: "src/app/hero-save.ts", oldName: "heroTiers", newName: "HERO_TIERS" },
    { file: "src/app/hero-save.ts", oldName: "heroAffixes", newName: "HERO_AFFIXES" },
    { file: "src/app/hero-save.ts", oldName: "heroSlots", newName: "HERO_SLOTS" },
    {
        file: "src/entities/character/config/classes.ts",
        oldName: "classDefinitions",
        newName: "CLASS_DEFINITIONS",
    },
    {
        file: "src/entities/combat/model/combat-number.ts",
        oldName: "combatNumberLimit",
        newName: "COMBAT_NUMBER_LIMIT",
    },
    {
        file: "src/entities/combat/model/damage-steps.ts",
        oldName: "damageSteps",
        newName: "DAMAGE_STEPS",
    },
    { file: "src/entities/item/config/affixes.ts", oldName: "affixes", newName: "AFFIXES" },
    {
        file: "src/entities/item/config/affixes.ts",
        oldName: "attackRanges",
        newName: "ATTACK_RANGES",
    },
    {
        file: "src/entities/item/config/affixes.ts",
        oldName: "defenseRanges",
        newName: "DEFENSE_RANGES",
    },
    {
        file: "src/entities/item/config/affixes.ts",
        oldName: "affixTables",
        newName: "AFFIX_TABLES",
    },
    {
        file: "src/entities/item/config/affixes.ts",
        oldName: "tierAffixCounts",
        newName: "TIER_AFFIX_COUNTS",
    },
    { file: "src/entities/item/config/affixes.ts", oldName: "offense", newName: "OFFENSE" },
    { file: "src/entities/item/config/affixes.ts", oldName: "survival", newName: "SURVIVAL" },
    { file: "src/entities/item/config/bases.ts", oldName: "itemBases", newName: "ITEM_BASES" },
    {
        file: "src/features/equipment/config/inventory-icons.ts",
        oldName: "emptyBagIcon",
        newName: "EMPTY_BAG_ICON",
    },
    {
        file: "src/features/equipment/config/inventory-icons.ts",
        oldName: "emptyEquipmentIcons",
        newName: "EMPTY_EQUIPMENT_ICONS",
    },
    {
        file: "src/features/equipment/config/native-items.ts",
        oldName: "nativeItemIcons",
        newName: "NATIVE_ITEM_ICONS",
    },
    {
        file: "src/features/equipment/config/native-items.ts",
        oldName: "nativeItemNames",
        newName: "NATIVE_ITEM_NAMES",
    },
    {
        file: "src/features/equipment/config/native-items.ts",
        oldName: "nativeItemTypes",
        newName: "NATIVE_ITEM_TYPES",
    },
    { file: "src/features/equipment/model/bag.ts", oldName: "bagSize", newName: "BAG_SIZE" },
    {
        file: "src/features/equipment/ui/layout.ts",
        oldName: "previewModelPath",
        newName: "PREVIEW_MODEL_PATH",
    },
    {
        file: "src/features/equipment/ui/layout.ts",
        oldName: "inventorySlots",
        newName: "INVENTORY_SLOTS",
    },
    {
        file: "src/features/equipment/ui/text.ts",
        oldName: "equipmentSlotNames",
        newName: "EQUIPMENT_SLOT_NAMES",
    },
    {
        file: "src/features/equipment/ui/text.ts",
        oldName: "equipmentStatNames",
        newName: "EQUIPMENT_STAT_NAMES",
    },
    {
        file: "src/features/equipment/ui/text.ts",
        oldName: "equipmentStatOrder",
        newName: "EQUIPMENT_STAT_ORDER",
    },
    {
        file: "src/features/equipment/ui/text.ts",
        oldName: "percentStats",
        newName: "PERCENT_STATS",
    },
    { file: "src/features/equipment/ui/text.ts", oldName: "bonusNames", newName: "BONUS_NAMES" },
    {
        file: "src/features/equipment/ui/text.ts",
        oldName: "percentBonuses",
        newName: "PERCENT_BONUSES",
    },
    { file: "src/features/save/config/keys.ts", oldName: "saveKeys", newName: "SAVE_KEYS" },
    {
        file: "src/features/save/config/keys.ts",
        oldName: "currentKeyVersion",
        newName: "CURRENT_KEY_VERSION",
    },
    { file: "src/features/save/lib/hash.ts", oldName: "initial", newName: "INITIAL" },
    { file: "src/features/save/lib/hash.ts", oldName: "constants", newName: "CONSTANTS" },
    { file: "src/features/save/model/chat.ts", oldName: "saveFilePath", newName: "SAVE_FILE_PATH" },
    {
        file: "src/features/save/model/chat.ts",
        oldName: "readableSavePath",
        newName: "READABLE_SAVE_PATH",
    },
    { file: "src/features/save/model/codec.ts", oldName: "saveAlphabet", newName: "SAVE_ALPHABET" },
    {
        file: "src/features/save/model/codec.ts",
        oldName: "maxSaveCodeLength",
        newName: "MAX_SAVE_CODE_LENGTH",
    },
    {
        file: "src/features/save/model/demo.ts",
        oldName: "demoItemCatalog",
        newName: "DEMO_ITEM_CATALOG",
    },
    {
        file: "src/features/save/model/demo.ts",
        oldName: "demoSaveVersion",
        newName: "DEMO_SAVE_VERSION",
    },
    {
        file: "src/features/save/model/format.ts",
        oldName: "maxPackedBytes",
        newName: "MAX_PACKED_BYTES",
    },
    {
        file: "src/features/save/model/manual-input.ts",
        oldName: "manualFragmentLength",
        newName: "MANUAL_FRAGMENT_LENGTH",
    },
    { file: "src/features/skill/config/definitions.ts", oldName: "skills", newName: "SKILLS" },
    {
        file: "src/features/skill/config/definitions.ts",
        oldName: "areaChallenge",
        newName: "AREA_CHALLENGE",
    },
    { file: "src/shared/lib/file-io/codec.ts", oldName: "alphabet", newName: "ALPHABET" },
    {
        file: "src/shared/lib/file-io/codec.ts",
        oldName: "maxFileDataLength",
        newName: "MAX_FILE_DATA_LENGTH",
    },
    {
        file: "src/shared/lib/file-io/preload.ts",
        oldName: "filePreloadEnd",
        newName: "FILE_PRELOAD_END",
    },
    {
        file: "src/shared/lib/file-io/preload.ts",
        oldName: "escapeCharacter",
        newName: "ESCAPE_CHARACTER",
    },
    { file: "src/shared/lib/file-io/preload.ts", oldName: "abilityCode", newName: "ABILITY_CODE" },
    { file: "src/shared/lib/file-io/preload.ts", oldName: "fileAbility", newName: "FILE_ABILITY" },
    {
        file: "src/shared/lib/file-io/preload.ts",
        oldName: "filePreloadLimit",
        newName: "FILE_PRELOAD_LIMIT",
    },
    {
        file: "src/shared/lib/file-io/preload.ts",
        oldName: "filePreloadStart",
        newName: "FILE_PRELOAD_START",
    },
    {
        file: "src/shared/lib/i18n/preference.ts",
        oldName: "languagePreferencePath",
        newName: "LANGUAGE_PREFERENCE_PATH",
    },
    { file: "src/shared/lib/rxwc3/benchmark/wc3/p1.ts", oldName: "warmup", newName: "WARMUP" },
    {
        file: "src/shared/lib/rxwc3/benchmark/wc3/p1.ts",
        oldName: "iterations",
        newName: "ITERATIONS",
    },
    { file: "src/shared/lib/rxwc3/benchmark/wc3/p1.ts", oldName: "rounds", newName: "ROUNDS" },
    { file: "src/shared/lib/rxwc3/benchmark/workloads.ts", oldName: "cases", newName: "CASES" },
    {
        file: "src/shared/lib/rxwc3/sync/fragments.ts",
        oldName: "maxFragmentCount",
        newName: "MAX_FRAGMENT_COUNT",
    },
    {
        file: "src/shared/lib/rxwc3/sync/fragments.ts",
        oldName: "maxTransferBytes",
        newName: "MAX_TRANSFER_BYTES",
    },
];

const REPOSITORY_ROOT = resolve(__dirname, "../..");
const CONSTANT_NAME_PATTERN = /^[A-Z][A-Z0-9]*(_[A-Z0-9]+)*$/;
const ALLOWED_KEYS = new Set(ALLOWED_CONSTANTS.map((entry) => entry.key));

function sourceFiles(directory: string): string[] {
    return readdirSync(resolve(REPOSITORY_ROOT, directory), { withFileTypes: true })
        .flatMap((entry) => {
            const file = `${directory}/${entry.name}`;
            if (entry.isDirectory()) return sourceFiles(file);
            return entry.isFile() && file.endsWith(".ts") && !file.endsWith(".d.ts") ? [file] : [];
        })
        .sort();
}

function bindingNames(binding: ts.BindingName): string[] {
    if (ts.isIdentifier(binding)) return [binding.text];
    return binding.elements.flatMap((element) =>
        ts.isOmittedExpression(element) ? [] : bindingNames(element.name),
    );
}

function unwrapInitializer(initializer: ts.Expression | undefined): ts.Expression | undefined {
    let expression = initializer;
    while (
        expression !== undefined &&
        (ts.isParenthesizedExpression(expression) ||
            ts.isAsExpression(expression) ||
            ts.isSatisfiesExpression(expression) ||
            ts.isTypeAssertionExpression(expression))
    ) {
        expression = expression.expression;
    }
    return expression;
}

function moduleConstants(file: string): ModuleConstant[] {
    const source = ts.createSourceFile(
        file,
        readFileSync(resolve(REPOSITORY_ROOT, file), "utf8"),
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TS,
    );
    // 只以 type 宣告配對，不以 interface 排除常數。
    const typeNames = new Set(
        source.statements.filter(ts.isTypeAliasDeclaration).map((statement) => statement.name.text),
    );
    const constants: ModuleConstant[] = [];
    for (const statement of source.statements) {
        if (
            !ts.isVariableStatement(statement) ||
            (statement.declarationList.flags & ts.NodeFlags.Const) === 0
        ) {
            continue;
        }
        const declared =
            statement.modifiers?.some(
                (modifier) => modifier.kind === ts.SyntaxKind.DeclareKeyword,
            ) === true;
        for (const declaration of statement.declarationList.declarations) {
            const initializer = unwrapInitializer(declaration.initializer);
            for (const name of bindingNames(declaration.name)) {
                const automaticallyExcluded =
                    declared ||
                    (initializer !== undefined &&
                        (ts.isArrowFunction(initializer) ||
                            ts.isFunctionExpression(initializer) ||
                            (ts.isObjectLiteralExpression(initializer) && typeNames.has(name))));
                constants.push({ key: `${file}:${name}`, name, automaticallyExcluded });
            }
        }
    }
    return constants;
}

const MODULE_CONSTANTS = sourceFiles("src").flatMap(moduleConstants);
// 存在集合保留全部宣告，包含會被自動規則排除的項目。
const DECLARED_KEYS = new Set(MODULE_CONSTANTS.map((constant) => constant.key));

test("模組層級常數的名稱符合大寫蛇形命名規則", () => {
    const invalid = MODULE_CONSTANTS.filter(
        (constant) =>
            !constant.automaticallyExcluded &&
            !ALLOWED_KEYS.has(constant.key) &&
            !CONSTANT_NAME_PATTERN.test(constant.name),
    )
        .map((constant) => constant.key)
        .sort();
    assert.deepEqual(
        invalid,
        [],
        `不符合命名規則的項目（${invalid.length} 項）：\n${invalid.join("\n")}`,
    );
});

test("改名清單的新名稱已宣告，舊名稱已移除", () => {
    assert.equal(RENAME_ENTRIES.length, 66, "改名清單必須有 66 項。");
    assert.equal(
        new Set(RENAME_ENTRIES.map((entry) => `${entry.file}:${entry.oldName}`)).size,
        66,
        "改名清單不得重複。",
    );
    const problems: string[] = [];
    for (const entry of RENAME_ENTRIES) {
        const newKey = `${entry.file}:${entry.newName}`;
        const oldKey = `${entry.file}:${entry.oldName}`;
        if (!DECLARED_KEYS.has(newKey)) problems.push(`缺少新名稱：${newKey}`);
        if (DECLARED_KEYS.has(oldKey)) problems.push(`仍有舊名稱：${oldKey}`);
    }
    assert.deepEqual(problems, [], `改名清單尚未完成：\n${problems.join("\n")}`);
});

test("允許清單的全部項目仍有模組層級宣告", () => {
    assert.equal(ALLOWED_CONSTANTS.length, 62, "允許清單必須有 62 項。");
    assert.equal(ALLOWED_KEYS.size, 62, "允許清單不得重複。");
    const missing = ALLOWED_CONSTANTS.filter((entry) => !DECLARED_KEYS.has(entry.key)).map(
        (entry) => `${entry.key}（${entry.category}）`,
    );
    assert.deepEqual(missing, [], `允許清單的項目已不存在：\n${missing.join("\n")}`);
});
