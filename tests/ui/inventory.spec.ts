import { test } from "node:test";
import { inventoryUiCases } from "./cases";
import { strict as assert } from "node:assert";
import {
    bagPosition,
    aggregateEquipment,
    emptyEquipment,
    inventoryView,
    createBag,
} from "@features/equipment";
import { runeScholar } from "@entities/character";

for (const entry of inventoryUiCases) {
    const current = entry;
    test(current.name, () => current.run());
}

test("I4 float32 座標與數值保持在 int32 範圍", () => {
    for (let index = 0; index < 90; index++) {
        const p = bagPosition(index);
        assert.ok(Math.fround(p.x) >= 0 && Math.fround(p.x + 0.04) <= 0.8);
        assert.ok(Math.fround(p.y) <= 0.6 && Math.fround(p.y - 0.04) >= 0.18);
    }
    const summary = aggregateEquipment(runeScholar, emptyEquipment(), Math.fround);
    for (const value of Object.values(summary.stats)) {
        assert.ok(Number.isFinite(value) && Math.abs(value) < 2147483647);
        assert.equal(Math.fround(value), value);
    }
    const view = inventoryView(
        { hero: runeScholar, worn: emptyEquipment(), bag: createBag() },
        0,
        false,
    );
    assert.ok(view.stats.every((line) => !line.value.includes("NaN")));
});
