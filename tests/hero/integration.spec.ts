import { test } from "node:test";
import { heroCases } from "./integration-cases";
import { strict as assert } from "node:assert";
import { runeScholar } from "@entities/character";
import { deriveCombatStats } from "@entities/combat";
import { aggregateEquipment, emptyEquipment, calculateMaxLife } from "@features/equipment";
import { float32 } from "./fixtures";

for (const entry of heroCases) {
    const item = entry;
    test(item.name, () => item.run());
}
test("H4 正式推導與裝備匯總在32位元浮點範圍內維持相同結果", () => {
    const input = { ...runeScholar.attributes, level: 2 };
    const bonuses = {
        maxLife: 15,
        maxLifePercent: Math.fround(0.05),
        maxLifeFixed: 2,
        spellPower: 4,
    };
    const stats = deriveCombatStats(input, bonuses);
    const expected = calculateMaxLife(
        { constitution: 0, level: 2, bonus: 15, percent: bonuses.maxLifePercent, fixed: 2 },
        float32,
    );
    assert.ok(Math.abs(Math.fround(stats.maxLife) - expected) < 0.00001);
    const summary = aggregateEquipment(runeScholar, emptyEquipment(), float32);
    for (const value of Object.values(summary.stats)) assert.equal(float32(value), value);
});
