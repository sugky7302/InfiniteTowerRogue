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
    assert.deepEqual(names, heroKnowledge);
    assert.deepEqual(
        names,
        expectedCatalog.map((entry) => entry.name),
    );
});

test("知識目錄最多有三十二項，編號等於索引", () => {
    assert.ok(knowledgeCatalog.length <= 32);
    knowledgeCatalog.forEach((entry, index) => assert.equal(entry.id, index));
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

for (const [level, units] of expectedThresholds.entries()) {
    const expectedLevel = level;
    const expectedUnits = units;
    test(`${expectedLevel} 級的累積門檻為 ${expectedUnits} 單位`, () => {
        assert.equal(knowledgeLevelThreshold(expectedLevel), expectedUnits);
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
    test(`${expectedUnits} 單位得到 ${expectedLevel} 級，超過上限時以上限計算`, () => {
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
] as const) {
    const expectedUnits = units;
    const expectedText = text;
    test(`${expectedUnits} 單位顯示為「${expectedText}」`, () => {
        assert.equal(formatKnowledgeExp(expectedUnits), expectedText);
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

test("零至八級的門檻與公式各步驟符合 32 位元限制", () => {
    for (let level = 0; level <= 8; level++) {
        const scaledLevel = Math.fround(50 * level);
        const nextLevel = Math.fround(level + 1);
        const experience = Math.fround(scaledLevel * nextLevel);
        const units = Math.fround(experience * knowledgeExpUnit);
        const actual = knowledgeLevelThreshold(level);
        for (const value of [scaledLevel, nextLevel, experience, units, actual]) {
            assert.ok(Number.isInteger(value) && value >= 0 && value <= 2147483647);
            assert.equal(Math.fround(value), value);
        }
        assert.equal(units, expectedThresholds[level]);
        assert.equal(actual, units);
    }
});
