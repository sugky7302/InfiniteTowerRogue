import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import War3Map from "mdx-m3-viewer-th/dist/cjs/parsers/w3x/map";
import W3u from "mdx-m3-viewer-th/dist/cjs/parsers/w3x/w3u/file";
import { NATIVE_ITEM_TYPES } from "@features/equipment";

const map = new War3Map();
map.load(new Uint8Array(readFileSync("dist/bin/map.w3x")).buffer);
const script = map.archive.get("war3map.lua")!.text();
assert.equal(script, readFileSync("dist/map.w3x/war3map.lua", "utf8"));
assert.ok(!/2\s*\^\s*1024/.test(script));
assert.ok(
    /local hero = runSkillExample\(\)\s+runSaveExample\(createHeroSaveParticipants\(\s*Player\(0\),\s*hero\s*\)\)/.test(
        script,
    ),
    "英雄與存檔範例的入口接線錯誤。",
);
for (const field of [
    "present",
    "preset",
    "classIds",
    "classLevels",
    "knowledge",
    "bases",
    "tiers",
    "affixIds",
    "affixValues",
])
    assert.ok(script.includes(`name = "${field}"`));
assert.deepEqual(
    Buffer.from(map.archive.get("war3map.w3a")!.bytes()),
    readFileSync("dist/map.w3x/war3map.w3a"),
);
for (const field of ["items", "slot", "base", "tier"])
    assert.ok(script.includes(`name = "${field}"`));
assert.ok(script.includes('kind = "records"') && script.includes("maxLength = 94"));
assert.ok(
    script.includes("MAX_PACKED_BYTES = 768") && script.includes("MAX_SAVE_CODE_LENGTH = 1600"),
);
for (const command of ["-drop", "-bag-swap"]) assert.ok(script.includes(`"${command}"`));
assert.ok(script.includes("UnitRemoveItem(owner, target)"));
assert.ok(script.includes("SetItemVisible(target, visible)"));
const items = new W3u();
items.load(map.archive.get("war3map.w3t")!.bytes());
for (const code of Object.values(NATIVE_ITEM_TYPES)) {
    const object = items.customTable.objects.find((entry) => entry.newId === code)!;
    assert.ok(object);
    assert.equal(object.oldId, "ratf");
    assert.equal(object.modifications.find((entry) => entry.id === "icla")?.value, "Permanent");
    assert.equal(object.modifications.find((entry) => entry.id === "iabi")?.value, "");
}
assert.deepEqual(
    Buffer.from(map.archive.get("war3map.w3t")!.bytes()),
    readFileSync("dist/map.w3x/war3map.w3t"),
);
const units = new W3u();
units.load(map.archive.get("war3map.w3u")!.bytes());
const hero = units.customTable.objects.find((entry) => entry.newId === "H0SS")!;
assert.ok(
    String(hero.modifications.find((entry) => entry.id === "uabi")?.value)
        .split(",")
        .includes("AInv"),
);
console.log("英雄存檔與物品載體地圖產物：12 組通過，0 組失敗。");
