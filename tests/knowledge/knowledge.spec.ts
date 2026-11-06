import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
    KnowledgeDefinition,
    KnowledgeDepth,
    KnowledgeLaw,
    KnowledgeNodeType,
    KnowledgeProgress,
    formatKnowledgeExp,
    KNOWLEDGE_CATALOG,
    KNOWLEDGE_EXP_MAX,
    KNOWLEDGE_EXP_UNIT,
    knowledgeLevel,
    knowledgeLevelThreshold,
    KNOWLEDGE_MAX_LEVEL,
    knowledgeProgress,
} from "@entities/knowledge";
import { heroKnowledge } from "../../src/app/hero-save";

const EXPECTED_CATALOG: readonly Pick<
    KnowledgeDefinition,
    "name" | "nodeType" | "law" | "depth"
>[] = [
    // 來源頁首為 docs/dnd/知識/核心/火焰.md。
    { name: "火焰", nodeType: "core", law: "energy", depth: "basic" },
    // 來源頁首為 docs/dnd/知識/型態/投射.md。
    { name: "投射", nodeType: "form", law: "motion", depth: "basic" },
    // 來源頁首為 docs/dnd/知識/型態/區域.md。
    { name: "區域", nodeType: "form", law: "space", depth: "basic" },
    // 來源頁首為 docs/dnd/知識/效果/火之燃燒.md。
    { name: "火之燃燒", nodeType: "effect", law: "energy", depth: "basic" },
    // 來源頁首為 docs/dnd/知識/核心/冰霜.md。
    { name: "冰霜", nodeType: "core", law: "flow", depth: "basic" },
    // 來源頁首為 docs/dnd/知識/效果/移動減速.md。
    { name: "移動減速", nodeType: "effect", law: "motion", depth: "professional" },
    // 來源頁首為 docs/dnd/知識/核心/魔法解析.md。
    { name: "魔法解析", nodeType: "core", law: "perception", depth: "basic" },
];

// 預期門檻獨立列出，避免使用受測函式產生預期等級。
const EXPECTED_THRESHOLDS = [
    0, 10000, 30000, 60000, 100000, 150000, 210000, 280000, 360000,
] as const;

test("節點類型、法則與深度的同名型別可用於型別註記", () => {
    const nodeType: KnowledgeNodeType = KnowledgeNodeType.Core;
    const law: KnowledgeLaw = KnowledgeLaw.Energy;
    const depth: KnowledgeDepth = KnowledgeDepth.Basic;
    assert.equal(nodeType, "core");
    assert.equal(law, "energy");
    assert.equal(depth, "basic");
});

test("節點類型常數與 K1 介面約定相同", () => {
    assert.deepEqual(KnowledgeNodeType, {
        Core: "core",
        Form: "form",
        Effect: "effect",
        Modifier: "modifier",
        Trigger: "trigger",
        Bridge: "bridge",
    });
});

test("法則常數與 K1 介面約定相同", () => {
    assert.deepEqual(KnowledgeLaw, {
        Form: "form",
        Flow: "flow",
        Energy: "energy",
        Motion: "motion",
        Space: "space",
        Perception: "perception",
        Mind: "mind",
    });
});

test("深度常數與 K1 介面約定相同", () => {
    assert.deepEqual(KnowledgeDepth, {
        Basic: "basic",
        Professional: "professional",
        Advanced: "advanced",
        Unified: "unified",
    });
});

test("知識目錄的名稱與順序和英雄存檔目錄完全相同", () => {
    const names = KNOWLEDGE_CATALOG.map((entry) => entry.name);
    assert.deepEqual(heroKnowledge, names);
    assert.deepEqual(
        names,
        EXPECTED_CATALOG.map((entry) => entry.name),
    );
});

test("知識目錄有七項，編號依序為零至六", () => {
    assert.equal(KNOWLEDGE_CATALOG.length, 7);
    assert.deepEqual(
        KNOWLEDGE_CATALOG.map((entry) => entry.id),
        [0, 1, 2, 3, 4, 5, 6],
    );
});

for (const entry of EXPECTED_CATALOG) {
    const expected = entry;
    test(`「${expected.name}」的節點類型、法則與深度符合來源頁首`, () => {
        const actual = KNOWLEDGE_CATALOG.find((candidate) => candidate.name === expected.name);
        assert.ok(actual);
        assert.equal(actual.nodeType, expected.nodeType);
        assert.equal(actual.law, expected.law);
        assert.equal(actual.depth, expected.depth);
    });
}

test("每項知識都有非空字串說明", () => {
    for (const entry of KNOWLEDGE_CATALOG) {
        assert.equal(typeof entry.description, "string");
        assert.ok(entry.description.length > 0, `「${entry.name}」的說明必須有內容。`);
    }
});

test("一經驗等於一百個整數單位，上限為四十萬單位", () => {
    assert.equal(KNOWLEDGE_EXP_UNIT, 100);
    assert.equal(KNOWLEDGE_EXP_MAX, 400000);
});

test("最高等級為八級，等於經驗上限的等級", () => {
    assert.equal(KNOWLEDGE_MAX_LEVEL, 8);
    assert.equal(KNOWLEDGE_MAX_LEVEL, knowledgeLevel(KNOWLEDGE_EXP_MAX));
});

for (const [level, units] of EXPECTED_THRESHOLDS.entries()) {
    const expectedLevel = level;
    const expectedUnits = units;
    test(`${expectedLevel} 級的累積門檻為 ${expectedUnits} 單位`, () => {
        const actual = knowledgeLevelThreshold(expectedLevel);
        assert.equal(actual, expectedUnits);
        assert.equal(actual, 50 * expectedLevel * (expectedLevel + 1) * KNOWLEDGE_EXP_UNIT);
        assert.ok(Number.isInteger(actual) && actual >= 0 && actual <= 2147483647);
        assert.equal(Math.fround(actual), actual);
    });
}

for (const [units, level] of [
    [0, 0],
    [1, 0],
    [9999, 0],
    [10000, 1],
    [29999, 1],
    [30000, 2],
    [359999, 7],
    [360000, 8],
    [400000, 8],
    [400001, 8],
    [2147483647, 8],
] as const) {
    const expectedUnits = units;
    const expectedLevel = level;
    test(`${expectedUnits} 單位為 ${expectedLevel} 級`, () => {
        assert.equal(knowledgeLevel(expectedUnits), expectedLevel);
    });
}

for (const [units, text] of [
    [0, "0.00"],
    [5, "0.05"],
    [50, "0.50"],
    [3500, "35.00"],
    [9999, "99.99"],
    [400000, "4000.00"],
    [400001, "4000.01"],
    [2147483647, "21474836.47"],
] as const) {
    const expectedUnits = units;
    const expectedText = text;
    test(`${expectedUnits} 單位顯示為「${expectedText}」`, () => {
        assert.equal(formatKnowledgeExp(expectedUnits), expectedText);
    });
}

for (const units of [-1, 0.5, NaN, Infinity, -Infinity, 2147483648]) {
    const invalidUnits = units;
    test(`等級計算拒絕無效單位 ${invalidUnits}`, () => {
        assert.throws(() => knowledgeLevel(invalidUnits), Error);
    });
    test(`進度計算拒絕無效單位 ${invalidUnits}`, () => {
        assert.throws(() => knowledgeProgress(invalidUnits), Error);
    });
    test(`經驗格式化拒絕無效單位 ${invalidUnits}`, () => {
        assert.throws(() => formatKnowledgeExp(invalidUnits), Error);
    });
}

for (const level of [-1, 9, 1.5, NaN, Infinity, -Infinity, 2147483648]) {
    const invalidLevel = level;
    test(`累積門檻拒絕無效等級 ${invalidLevel}`, () => {
        assert.throws(() => knowledgeLevelThreshold(invalidLevel), Error);
    });
}

for (const [units, level, currentEXP, requiredEXP] of [
    [0, 0, 0, 10000],
    [3500, 0, 3500, 10000],
    [9999, 0, 9999, 10000],
    [10000, 1, 0, 20000],
    [15000, 1, 5000, 20000],
    [30000, 2, 0, 30000],
    [359999, 7, 359999 - 280000, 80000],
    [360000, 8, 0, 0],
    [375000, 8, 15000, 0],
    [400000, 8, 40000, 0],
    [400001, 8, 40000, 0],
    [2147483647, 8, 40000, 0],
] as const) {
    const expectedUnits = units;
    const expected: KnowledgeProgress = { level, currentEXP, requiredEXP };
    test(`${expectedUnits} 單位的進度符合各級門檻，回傳值符合 32 位元整數限制`, () => {
        const actual = knowledgeProgress(expectedUnits);
        assert.deepEqual(actual, expected);
        for (const value of [actual.level, actual.currentEXP, actual.requiredEXP]) {
            assert.ok(Number.isInteger(value) && value >= 0 && value <= 2147483647);
            assert.equal(Math.fround(value), value);
        }
    });
}

test("零至四十萬的全部整數單位符合門檻，等級在 32 位元整數範圍內", () => {
    let expectedLevel = 0;
    for (let units = 0; units <= 400000; units++) {
        if (expectedLevel < 8 && units >= EXPECTED_THRESHOLDS[expectedLevel + 1]) expectedLevel++;
        const actual = knowledgeLevel(Math.fround(units));
        assert.equal(actual, expectedLevel, `${units} 單位的等級必須符合門檻。`);
        assert.ok(Number.isInteger(actual) && actual >= 0 && actual <= 2147483647);
        assert.equal(Math.fround(actual), actual);
    }
});
