import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
    ClassId,
    combatLevel,
    getClassDefinition,
    HeroState,
    levelUp,
    LevelUpFailure,
    patrolMachine,
    runeScholar,
    scholar,
    testEnemy,
} from "@entities/character";
import { aggregateEquipment, emptyEquipment } from "@features/equipment";
import { float32 } from "./fixtures";

test("預建英雄沿用學者的七項屬性並保留親和欄位", () => {
    assert.deepEqual(runeScholar.attributes, {
        strength: 2,
        precision: 4,
        agility: 4,
        constitution: 0,
        spirit: 9,
        intelligence: 16,
        luck: 0,
        affinity: 0,
    });
    for (const key of [
        "strength",
        "precision",
        "agility",
        "constitution",
        "spirit",
        "intelligence",
        "luck",
    ] as const)
        assert.equal(runeScholar.attributes[key], scholar[key]);
    assert.deepEqual(runeScholar.classes, [{ classId: ClassId.RuneApprentice, level: 1 }]);
    assert.deepEqual(runeScholar.knowledge, [
        "火焰",
        "投射",
        "區域",
        "火之燃燒",
        "冰霜",
        "移動減速",
        "魔法解析",
    ]);
});
test("既有角色保留原始欄位與值", () => {
    assert.deepEqual(scholar, {
        level: 1,
        intelligence: 16,
        spirit: 9,
        constitution: 0,
        manaRegen: 2,
        strength: 2,
        precision: 4,
        agility: 4,
        luck: 0,
        challenge: 1,
        armor: 0,
        weapon: { name: "符文杖", hands: 1, base: 4, coefficient: 0.5 },
        attackSeconds: 1.5,
        attackShape: { kind: "native-melee" },
    });
    assert.equal(patrolMachine.weapon.base, 6);
    assert.equal(patrolMachine.constitution, 4);
    assert.deepEqual(testEnemy, {
        challenge: 1,
        spirit: 4,
        constitution: 4,
        agility: 4,
        resistance: 0,
        combustible: true,
    });
});
test("戰鬥等級是全部已認證職業等級總和，空清單為零", () => {
    assert.equal(combatLevel(runeScholar), 1);
    assert.equal(combatLevel({ ...runeScholar, classes: [] }), 0);
    assert.equal(
        combatLevel({
            ...runeScholar,
            classes: [
                { classId: "甲", level: 3 },
                { classId: "乙", level: 2 },
            ],
        }),
        5,
    );
});
test("符文學徒是一階，每級只有智力增加一點", () => {
    assert.deepEqual(getClassDefinition(ClassId.RuneApprentice), {
        id: ClassId.RuneApprentice,
        name: "符文學徒",
        tier: 1,
        growth: { intelligence: 1 },
    });
    const before = JSON.stringify(runeScholar);
    const result = levelUp(runeScholar, ClassId.RuneApprentice);
    assert.ok(result.ok);
    assert.notEqual(result.hero, runeScholar);
    assert.deepEqual(result.hero.attributes, { ...runeScholar.attributes, intelligence: 17 });
    assert.equal(combatLevel(result.hero), 2);
    assert.equal(JSON.stringify(runeScholar), before);
    assert.deepEqual(result.hero.knowledge, runeScholar.knowledge);
});
test("最高五級，達到上限後傳回失敗原因", () => {
    let hero = runeScholar;
    for (let index = 0; index < 4; index++) {
        const result = levelUp(hero, ClassId.RuneApprentice);
        assert.ok(result.ok);
        hero = result.hero;
    }
    assert.equal(combatLevel(hero), 5);
    assert.equal(hero.attributes.intelligence, 20);
    assert.deepEqual(levelUp(hero, ClassId.RuneApprentice), {
        ok: false,
        reason: LevelUpFailure.MaximumLevel,
    });
});
test("未認證職業與尚未登錄的已認證職業各回傳原因", () => {
    assert.deepEqual(levelUp({ ...runeScholar, classes: [] }, ClassId.RuneApprentice), {
        ok: false,
        reason: LevelUpFailure.Uncertified,
    });
    assert.deepEqual(
        levelUp({ ...runeScholar, classes: [{ classId: "未知職業", level: 1 }] }, "未知職業"),
        { ok: false, reason: LevelUpFailure.UnknownClass },
    );
});
test("升級保留其他職業與認證順序", () => {
    const hero: HeroState = {
        ...runeScholar,
        classes: [{ classId: "既有職業", level: 3 }, ...runeScholar.classes],
    };
    const result = levelUp(hero, ClassId.RuneApprentice);
    assert.ok(result.ok);
    assert.deepEqual(result.hero.classes, [
        { classId: "既有職業", level: 3 },
        { classId: ClassId.RuneApprentice, level: 2 },
    ]);
});
test("無裝備最大生命由四十二升至四十四，法術強度由四十一升至四十三", () => {
    const result = levelUp(runeScholar, ClassId.RuneApprentice);
    assert.ok(result.ok);
    assert.equal(aggregateEquipment(runeScholar, emptyEquipment(), float32).stats.maxLife, 42);
    const stats = aggregateEquipment(result.hero, emptyEquipment(), float32).stats;
    assert.equal(stats.maxLife, 44);
    assert.equal(stats.spellPower, 43);
    assert.equal(aggregateEquipment(runeScholar, emptyEquipment()).stats.spellPower, 41);
});
test("英雄成長與戰鬥等級拒絕超範圍中間值", () => {
    assert.throws(() =>
        levelUp(
            { ...runeScholar, attributes: { ...runeScholar.attributes, intelligence: 2147483520 } },
            ClassId.RuneApprentice,
        ),
    );
    assert.throws(() =>
        combatLevel({
            ...runeScholar,
            classes: [
                { classId: "甲", level: 2147483520 },
                { classId: "乙", level: 1 },
            ],
        }),
    );
    assert.throws(() => combatLevel({ ...runeScholar, classes: [{ classId: "甲", level: -1 }] }));
});
