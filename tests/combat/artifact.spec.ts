import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import War3Map from "mdx-m3-viewer-th/dist/cjs/parsers/w3x/map";
import W3u from "mdx-m3-viewer-th/dist/cjs/parsers/w3x/w3u/file";

/** 直接檢查最終 MPQ 的原始欄位，避免只驗證套件預設值。 */
export function verifyCombatArtifact(): number {
    const config = JSON.parse(readFileSync("config.json", "utf8"));
    const map = new War3Map();
    map.load(
        new Uint8Array(readFileSync(path.resolve(config.outputFolder, config.mapFolder))).buffer,
    );
    const objects = new W3u();
    objects.load(map.archive.get("war3map.w3u")!.bytes());
    for (const [index, code] of ["H0SS", "h0CM"].entries()) {
        const object = objects.customTable.objects.find((entry) => entry.newId === code)!;
        assert.ok(object);
        assert.equal(object.oldId, index === 0 ? "Hamg" : "hfoo");
        for (const [id, type, expected] of [
            ["urb1", 2, 250],
            ["udp1", 2, 0.5],
            ["ua1c", 2, 1.5],
            ["uaen", 0, index === 0 ? 1 : 0],
            ["ua1w", 3, "normal"],
            ["ua1r", 0, 100],
        ] as const) {
            const field = object.modifications.filter((entry) => entry.id === id);
            assert.equal(field.length, 1);
            assert.equal(field[0].variableType, type);
            assert.equal(field[0].value, expected);
        }
    }
    const script = map.archive.get("war3map.lua")!.text();
    const strength = objects.customTable.objects
        .find((entry) => entry.newId === "H0SS")!
        .modifications.find((entry) => entry.id === "ustr");
    assert.equal(strength?.value, 0);
    const agility = objects.customTable.objects
        .find((entry) => entry.newId === "H0SS")!
        .modifications.find((entry) => entry.id === "uagi");
    assert.equal(agility?.value, 0);
    assert.equal(
        script,
        readFileSync(path.resolve("dist", config.mapFolder, "war3map.lua"), "utf8"),
    );
    assert.ok(!/2\s*\^\s*1024/.test(script));
    assert.equal(
        (script.match(/addScriptHook\(W3TS_HOOK.MAIN_AFTER, runCombatExperiment\)/g) ?? []).length,
        0,
    );
    assert.match(map.archive.get("war3mapMisc.txt")!.text(), /\[Misc\][\s\S]*MinUnitSpeed=0\.0/);
    assert.match(script, /CombatRuntime/);
    assert.match(script, /FourCC\("h0CM"\)/);
    return 7;
}
if (require.main === module) {
    verifyCombatArtifact();
    console.log("C4 地圖產物：7 組通過，0 組失敗。緩衝 250，傷害點 0.5 秒，間隔 1.5 秒。");
}
