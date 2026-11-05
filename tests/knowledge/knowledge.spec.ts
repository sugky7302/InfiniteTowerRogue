import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
    KnowledgeDefinition,
    KnowledgeDepth,
    KnowledgeLaw,
    KnowledgeNodeType,
    formatKnowledgeExp,
    knowledgeCatalog,
    knowledgeExpMax,
    knowledgeExpUnit,
    knowledgeLevel,
    knowledgeLevelThreshold,
    knowledgeMaxLevel,
    knowledgeProgress,
} from "@entities/knowledge";
import { heroKnowledge } from "../../src/app/hero-save";

const expectedCatalog: readonly Pick<KnowledgeDefinition, "name" | "nodeType" | "law" | "depth">[] =
    [
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
const expectedThresholds = [0, 1000, 3000, 6000, 10000, 15000, 21000, 28000, 36000] as const;

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
    const names = knowledgeCatalog.map((entry) => entry.name);
    assert.deepEqual(heroKnowledge, names);
    assert.deepEqual(
        names,
        expectedCatalog.map((entry) => entry.name),
    );
});

test("知識目錄有七項，編號依序為零至六", () => {
    assert.equal(knowledgeCatalog.length, 7);
    assert.deepEqual(
        knowledgeCatalog.map((entry) => entry.id),
        [0, 1, 2, 3, 4, 5, 6],
    );
});

for (const entry of expectedCatalog) {
    const expected = entry;
    test(`「${expected.name}」的節點類型、法則與深度符合來源頁首`, () => {
        const actual = knowledgeCatalog.find((candidate) => candidate.name === expected.name);
        assert.ok(actual);
        assert.equal(actual.nodeType, expected.nodeType);
        assert.equal(actual.law, expected.law);
        assert.equal(actual.depth, expected.depth);
    });
}

test("每項知識都有非空字串說明", () => {
    for (const entry of knowledgeCatalog) {
        assert.equal(typeof entry.summary, "string");
        assert.ok(entry.summary.length > 0, `「${entry.name}」的說明必須有內容。`);
    }
});

test("一經驗等於十個整數單位，上限為四萬單位", () => {
    assert.equal(knowledgeExpUnit, 10);
    assert.equal(knowledgeExpMax, 40000);
});

test("最高等級為八級，等於經驗上限的等級", () => {
    assert.equal(knowledgeMaxLevel, 8);
    assert.equal(knowledgeMaxLevel, knowledgeLevel(knowledgeExpMax));
});

for (const [level, units] of expectedThresholds.entries()) {
    const expectedLevel = level;
    const expectedUnits = units;
    test(`${expectedLevel} 級的累積門檻為 ${expectedUnits} 單位`, () => {
        const actual = knowledgeLevelThreshold(expectedLevel);
        assert.equal(actual, expectedUnits);
        assert.equal(actual, 50 * expectedLevel * (expectedLevel + 1) * knowledgeExpUnit);
        assert.ok(Number.isInteger(actual) && actual >= 0 && actual <= 2147483647);
        assert.equal(Math.fround(actual), actual);
    });
}

for (const [units, level] of [
    [0, 0],
    [1, 0],
    [999, 0],
    [1000, 1],
    [2999, 1],
    [3000, 2],
    [35999, 7],
    [36000, 8],
    [40000, 8],
    [40001, 8],
    [2147483647, 8],
] as const) {
    const expectedUnits = units;
    const expectedLevel = level;
    test(`${expectedUnits} 單位為 ${expectedLevel} 級`, () => {
        assert.equal(knowledgeLevel(expectedUnits), expectedLevel);
    });
}

for (const [units, text] of [
    [0, "0.0"],
    [5, "0.5"],
    [10, "1.0"],
    [350, "35.0"],
    [999, "99.9"],
    [40000, "4000.0"],
    [40001, "4000.1"],
    [2147483647, "214748364.7"],
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

for (const [units, level, current, required] of [
    [0, 0, 0, 1000],
    [350, 0, 350, 1000],
    [999, 0, 999, 1000],
    [1000, 1, 0, 2000],
    [1500, 1, 500, 2000],
    [3000, 2, 0, 3000],
    [35999, 7, 35999 - 28000, 8000],
    [36000, 8, 0, 0],
    [37500, 8, 1500, 0],
    [40000, 8, 4000, 0],
    [40001, 8, 4000, 0],
    [2147483647, 8, 4000, 0],
] as const) {
    const expectedUnits = units;
    const expected = { level, current, required };
    test(`${expectedUnits} 單位的進度符合各級門檻，回傳值符合 32 位元整數限制`, () => {
        const actual = knowledgeProgress(expectedUnits);
        assert.deepEqual(actual, expected);
        for (const value of [actual.level, actual.current, actual.required]) {
            assert.ok(Number.isInteger(value) && value >= 0 && value <= 2147483647);
            assert.equal(Math.fround(value), value);
        }
    });
}

test("零至四萬的全部整數單位符合門檻，等級在 32 位元整數範圍內", () => {
    let expectedLevel = 0;
    for (let units = 0; units <= 40000; units++) {
        if (expectedLevel < 8 && units >= expectedThresholds[expectedLevel + 1]) expectedLevel++;
        const actual = knowledgeLevel(Math.fround(units));
        assert.equal(actual, expectedLevel, `${units} 單位的等級必須符合門檻。`);
        assert.ok(Number.isInteger(actual) && actual >= 0 && actual <= 2147483647);
        assert.equal(Math.fround(actual), actual);
    }
});
