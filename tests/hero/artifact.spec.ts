import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import War3Map from "mdx-m3-viewer-th/dist/cjs/parsers/w3x/map";

const map = new War3Map();
map.load(new Uint8Array(readFileSync("dist/bin/map.w3x")).buffer);
const script = map.archive.get("war3map.lua")!.text();
assert.equal(script, readFileSync("dist/map.w3x/war3map.lua", "utf8"));
assert.ok(!/2\s*\^\s*1024/.test(script));
for (const command of ["-hero", "-hero-up", "-item-new", "-items", "-equip", "-unequip"])
    assert.ok(script.includes(`"${command}"`));
assert.ok(script.includes("HeroExample") && script.includes("resizeCombatLife"));
assert.ok(script.includes("self.stats:caster(source).spellPower"));
assert.ok(script.includes("沒有武器"));
console.log("H4 地圖產物：6 組通過，0 組失敗。");
