import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import War3Map from "mdx-m3-viewer-th/dist/cjs/parsers/w3x/map";

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
console.log("英雄存檔地圖產物：5 組通過，0 組失敗。");
