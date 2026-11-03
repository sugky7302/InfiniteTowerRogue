import { strict as assert } from "node:assert";
import { test } from "node:test";
import { ObjectData } from "war3-objectdata-th/dist/cjs";
import { scholar } from "@entities/character";
import * as skill from "@features/skill";
const { codes, createCombatObjects } = require("../../scripts/combat-objects.cjs");
const { createSkillObjects } = require("../../scripts/skill-objects.cjs");
test("C4 範例明確保存緩衝、傷害點、間隔與近戰類型", () => {
    const data = new ObjectData();
    const definitions = { ...skill, scholar };
    createSkillObjects(data, definitions);
    createCombatObjects(data, definitions);
    const saved = data.save(),
        loaded = new ObjectData();
    loaded.load(saved);
    assert.equal(loaded.units.get("H0SS")!.startingStrength, 0);
    assert.equal(loaded.units.get("H0SS")!.startingAgility, 0);
    for (const [index, code] of codes.entries()) {
        const value = loaded.units.get(code)!;
        assert.equal(value.attack1RangeMotionBuffer, 250);
        assert.equal(value.attack1AnimationDamagePoint, 0.5);
        assert.equal(value.attack1CooldownTime, 1.5);
        assert.equal(value.attack1WeaponType, "normal");
        assert.equal(Number(value.attacksEnabled), index === 0 ? 1 : 0);
        const object = saved.w3u!.customTable.objects.find((entry) => entry.newId === code)!;
        for (const id of ["urb1", "udp1", "ua1c", "uaen", "ua1w", "ua1r"])
            assert.equal(object.modifications.filter((entry) => entry.id === id).length, 1);
    }
});
test("C4 物件代碼衝突在修改前停止", () => {
    const data = new ObjectData();
    const definitions = { ...skill, scholar };
    createSkillObjects(data, definitions);
    data.units.copy("hfoo", "h0CM");
    assert.throws(() => createCombatObjects(data, definitions), /代碼已被使用/);
});
