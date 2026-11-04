import { strict as assert } from "node:assert";
import { test } from "node:test";
import { ObjectData } from "war3-objectdata-th/dist/cjs";
import * as skill from "@features/skill";
import { scholar } from "@entities/character";
// 建置腳本同時讀取技能定義與角色數值。
const definitions = { ...skill, scholar };
const { createSkillObjects } = require("../../scripts/skill-objects.cjs");

test("S2 Channel 物件使用整數目標與選項，寫入引導時間、法力與冷卻", () => {
    const data = new ObjectData();
    createSkillObjects(data, definitions);
    const saved = data.save();
    for (const [index, skill] of definitions.skills.entries()) {
        const object = saved.w3a!.customTable.objects.find((value) => value.newId === skill.code)!;
        assert.equal(object.oldId, "ANcl");
        const field = (id: string) => object.modifications.find((value) => value.id === id);
        assert.equal(field("Ncl1")?.value, 60);
        assert.equal(field("Ncl1")?.levelOrVariation, 1);
        assert.equal(field("Ncl1")?.dataPointer, 1);
        assert.equal(field("Ncl2")?.value, index === 0 ? 2 : 1);
        assert.equal(field("Ncl2")?.variableType, 0);
        assert.equal(field("Ncl3")?.value, 1);
        assert.equal(field("Ncl3")?.variableType, 0);
        assert.equal(field("Ncl5")?.value, 0);
        assert.equal(field("Ncl5")?.variableType, 0);
        assert.equal(field("Ncl5")?.levelOrVariation, 1);
        assert.equal(field("Ncl5")?.dataPointer, 5);
        assert.equal(field("amcs")?.value, skill.mana);
        assert.equal(field("amcs")?.levelOrVariation, 1);
        const cooldown = field("acdn")?.value ?? 0;
        assert.equal(cooldown, skill.cooldown);
        assert.equal(field("aran")?.value, definitions.yardsToWc3(definitions.rangeYards(skill)));
        assert.equal(field("Ncl6")?.value, index === 0 ? "flamestrike" : "frostnova");
    }
});
test("S2 英雄與敵人物件可儲存並重新載入", () => {
    const data = new ObjectData();
    createSkillObjects(data, definitions);
    const loaded = new ObjectData();
    loaded.load(data.save());
    const hero = loaded.units.get("H0SS")!,
        enemy = loaded.units.get("h0SE")!;
    assert.equal(hero.normal, "A0SF,A0SI,AInv");
    assert.equal(hero.startingIntelligence, 16);
    assert.equal(hero.manaMaximum, 69);
    assert.equal(hero.animationCastPoint, 0);
    assert.equal(enemy.hitPointsMaximumBase, 2000);
    assert.equal(Number(enemy.attacksEnabled), 0);
});
test("S2 物件代碼衝突時回報錯誤", () => {
    const data = new ObjectData();
    createSkillObjects(data, definitions);
    assert.throws(() => createSkillObjects(data, definitions), /代碼已被使用/);
});

test("S3 建置遊戲常數支援新增、合併與重複執行", () => {
    const fs = require("node:fs"),
        path = require("node:path");
    const { writeSkillMisc } = require("../../scripts/skill-misc.cjs");
    fs.mkdirSync(".cache", { recursive: true });
    const directory = fs.mkdtempSync(path.resolve(".cache/skill-misc-"));
    const filename = path.join(directory, "war3mapMisc.txt");
    try {
        writeSkillMisc(directory);
        assert.match(fs.readFileSync(filename, "utf8"), /\[Misc\]\nMinUnitSpeed=0\.0/);
        for (const content of [
            "[Misc]\r\nMaxUnitSpeed=522\r\nMinUnitSpeed=150\r\n[Other]\r\nMinUnitSpeed=99\r\n",
            "[Other]\nX=1\n[Misc]\nMaxUnitSpeed=522",
            "[Other]\nMinUnitSpeed=99\n",
        ]) {
            fs.writeFileSync(filename, content);
            writeSkillMisc(directory);
            const result = fs.readFileSync(filename, "utf8");
            assert.match(result, /MinUnitSpeed=0\.0/);
            if (content.includes("MinUnitSpeed=99")) assert.match(result, /MinUnitSpeed=99/);
            if (content.includes("MaxUnitSpeed=522")) assert.match(result, /MaxUnitSpeed=522/);
            writeSkillMisc(directory);
            assert.equal(fs.readFileSync(filename, "utf8"), result);
        }
    } finally {
        fs.rmSync(filename, { force: true });
        fs.rmdirSync(directory);
    }
});
