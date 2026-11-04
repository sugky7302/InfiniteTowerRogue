import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import War3Map from "mdx-m3-viewer-th/dist/cjs/parsers/w3x/map";
import W3a from "mdx-m3-viewer-th/dist/cjs/parsers/w3x/w3d/file";
import W3u from "mdx-m3-viewer-th/dist/cjs/parsers/w3x/w3u/file";
import { ObjectData } from "war3-objectdata-th/dist/cjs";
import { castSeconds, skills, yardsToWc3, rangeYards } from "@features/skill";

/** 直接讀取最終 MPQ，確認技能欄位與 Lua 都已封裝。 */
export function verifySkillArtifact(): number {
    const config = JSON.parse(readFileSync("config.json", "utf8"));
    const bytes = new Uint8Array(readFileSync(path.resolve(config.outputFolder, config.mapFolder)));
    const map = new War3Map();
    map.load(bytes.buffer);
    const ability = new W3a(),
        abilitySkin = new W3a(),
        units = new W3u(),
        unitSkin = new W3u();
    ability.load(map.archive.get("war3map.w3a")!.bytes());
    abilitySkin.load(map.archive.get("war3mapSkin.w3a")!.bytes());
    units.load(map.archive.get("war3map.w3u")!.bytes());
    unitSkin.load(map.archive.get("war3mapSkin.w3u")!.bytes());
    const data = new ObjectData();
    data.load({ w3a: ability, w3aSkin: abilitySkin, w3u: units, w3uSkin: unitSkin });
    for (const skill of skills) {
        const value = data.abilities.get(skill.code)!;
        assert.equal(value.oldId, "ANcl");
        const channel = value as unknown as {
            followThroughTime: number;
            targetType: number;
            options: number;
            disableOtherAbilities: boolean;
        };
        assert.equal(channel.followThroughTime, 60);
        assert.equal(channel.targetType, skill.target === "point" ? 2 : 1);
        assert.equal(channel.options, 1);
        assert.equal(Number(channel.disableOtherAbilities), 0);
        assert.ok(
            ability.customTable.objects
                .find((object) => object.newId === skill.code)!
                .modifications.some((mod) => mod.id === "Ncl5" && mod.value === 0),
        );
        assert.equal(value.manaCost, skill.mana);
        assert.equal(value.cooldown, skill.cooldown);
        assert.equal(value.castRange, yardsToWc3(rangeYards(skill)));
        for (const mod of ability.customTable.objects.find((object) => object.newId === skill.code)!
            .modifications) {
            if (/^Ncl[1-6]$/.test(mod.id)) {
                assert.equal(mod.levelOrVariation, 1);
                assert.equal(mod.dataPointer, Number(mod.id[3]));
            }
        }
    }
    assert.match(map.archive.get("war3mapMisc.txt")!.text(), /\[Misc\][\s\S]*MinUnitSpeed=0\.0/);
    assert.equal(data.units.get("H0SS")!.normal, "A0SF,A0SI,AInv");
    assert.equal(data.units.get("h0SE")!.defenseBase, 20);
    const script = map.archive.get("war3map.lua")!.text();
    assert.equal(
        script,
        readFileSync(path.resolve("dist", config.mapFolder, "war3map.lua"), "utf8"),
    );
    assert.ok(!/2\s*\^\s*1024/.test(script));
    assert.equal(
        // 組合入口呼叫技能範例一次，再把傳回的英雄交給存檔範例。
        (script.match(/= runSkillExample\(\)\s+runSaveExample\(/g) ?? []).length,
        1,
    );
    assert.equal(
        (script.match(/addScriptHook\(W3TS_HOOK.MAIN_AFTER, runBenchmarkExample\)/g) ?? []).length,
        0,
    );
    return 5;
}
if (require.main === module) {
    verifySkillArtifact();
    console.log("技能地圖產物：5 組通過，0 組失敗。");
}
