import { strict as assert } from "node:assert";
import { test } from "node:test";
import { HeroState, runeScholar } from "@entities/character";
import {
    DamageHistory,
    DamageKind,
    DamageOutput,
    DamageStat,
    DefenseChannel,
    settleDamage,
} from "@entities/combat";
import { AffixId, EquipSlot, ItemBaseId, ItemTier } from "@entities/item";
import {
    aggregateEquipment,
    calculateMaxLife,
    checkEquip,
    compareEquipment,
    emptyEquipment,
    equip,
    EquipFailureCode,
    unequip,
} from "@features/equipment";
import { float32, item, wearing } from "./fixtures";

test("空配置有四個位置，單手武器與副手可以共存", () => {
    assert.equal(Object.keys(emptyEquipment()).length, 4);
    const sword = item(1, ItemBaseId.TrainingSword);
    const manual = item(2, ItemBaseId.SpellManual);
    const first = equip(runeScholar, emptyEquipment(), sword);
    assert.ok(first.ok);
    const second = equip(runeScholar, first.state, manual);
    assert.ok(second.ok);
    assert.equal(second.state[EquipSlot.MainHand], sword);
    assert.equal(second.state[EquipSlot.OffHand], manual);
    assert.equal(first.state[EquipSlot.OffHand], undefined);
});
test("副手非空時拒絕雙手武器，保持原狀態與物品", () => {
    const state = wearing(item(1, ItemBaseId.SpellManual));
    const result = equip(runeScholar, state, item(2, ItemBaseId.PatrolHammer));
    assert.equal(result.ok, false);
    assert.equal(result.state, state);
    assert.ok(!result.ok);
    assert.deepEqual(result.failures, [
        { code: EquipFailureCode.OffHandOccupied, slot: EquipSlot.OffHand },
    ]);
});
test("雙手武器穿戴中不能穿上副手，卸下後可以穿上", () => {
    const state = wearing(item(1, ItemBaseId.PatrolHammer));
    const manual = item(2, ItemBaseId.SpellManual);
    assert.deepEqual(checkEquip(runeScholar, state, manual, EquipSlot.OffHand), [
        { code: EquipFailureCode.TwoHandedWeapon, slot: EquipSlot.MainHand },
    ]);
    const removed = unequip(state, EquipSlot.MainHand);
    assert.equal(removed.removed?.id, 1);
    assert.ok(equip(runeScholar, removed.state, manual).ok);
});
test("缺少魔法解析時拒絕手冊，認證與職業等級不會代替知識", () => {
    const hero: HeroState = { ...runeScholar, knowledge: [] };
    assert.deepEqual(
        checkEquip(hero, emptyEquipment(), item(1, ItemBaseId.SpellManual), EquipSlot.OffHand),
        [
            {
                code: EquipFailureCode.MissingKnowledge,
                slot: EquipSlot.OffHand,
                knowledge: "魔法解析",
            },
        ],
    );
});
test("錯誤位置、缺少知識與重複實例依規定順序全部回傳", () => {
    const manual = item(1, ItemBaseId.SpellManual);
    const state = wearing(manual);
    const before = JSON.stringify(state);
    const result = equip({ ...runeScholar, knowledge: [] }, state, { ...manual }, EquipSlot.Armor);
    assert.ok(!result.ok);
    assert.deepEqual(result.failures, [
        { code: EquipFailureCode.WrongSlot, slot: EquipSlot.Armor },
        { code: EquipFailureCode.MissingKnowledge, slot: EquipSlot.Armor, knowledge: "魔法解析" },
        { code: EquipFailureCode.DuplicateInstance, slot: EquipSlot.OffHand },
    ]);
    assert.equal(result.state, state);
    assert.equal(JSON.stringify(state), before);
});
test("雙手占用、知識與重複識別碼同時回傳", () => {
    const state = wearing(item(1, ItemBaseId.PatrolHammer));
    const failures = checkEquip(
        { ...runeScholar, knowledge: [] },
        state,
        item(1, ItemBaseId.SpellManual),
        EquipSlot.OffHand,
    );
    assert.deepEqual(
        failures.map((entry) => entry.code),
        [
            EquipFailureCode.TwoHandedWeapon,
            EquipFailureCode.MissingKnowledge,
            EquipFailureCode.DuplicateInstance,
        ],
    );
});
test("替換只更新指定位置並回傳移出物，同位置重複穿上合法", () => {
    const sword = item(1, ItemBaseId.TrainingSword);
    const manual = item(2, ItemBaseId.SpellManual);
    const state = wearing(sword, manual);
    const result = equip(runeScholar, state, item(3, ItemBaseId.RuneStaff));
    assert.ok(result.ok);
    assert.equal(result.removed, sword);
    assert.equal(result.state[EquipSlot.OffHand], manual);
    assert.equal(state[EquipSlot.MainHand], sword);
    assert.ok(equip(runeScholar, state, sword).ok);
});
test("卸下回傳物品供持有清單接收，空位置卸下保持原狀態", () => {
    const robe = item(1, ItemBaseId.ApprenticeRobe);
    const state = wearing(robe);
    const result = unequip(state, EquipSlot.Armor);
    assert.equal(result.removed, robe);
    assert.equal(result.state[EquipSlot.Armor], undefined);
    assert.equal(state[EquipSlot.Armor], robe);
    assert.equal(unequip(emptyEquipment(), EquipSlot.Tool).removed, undefined);
    assert.equal(unequip(state, EquipSlot.Tool).state, state);
});
test("無裝備匯總提供原始英雄數值，親和不作用", () => {
    const summary = aggregateEquipment(runeScholar, emptyEquipment(), float32);
    assert.equal(summary.stats.maxLife, 42);
    assert.equal(summary.stats.meleeAttack, 8);
    assert.equal(summary.stats.rangedAttack, 10);
    assert.equal(summary.stats.physicalDefense, 2);
    assert.equal(summary.stats.spellDefense, 18);
    assert.equal(summary.stats.spellPower, 41);
    assert.equal(summary.mainWeapon, undefined);
    assert.equal(summary.mainWeaponDamage, 0);
    assert.deepEqual(
        aggregateEquipment(
            { ...runeScholar, attributes: { ...runeScholar.attributes, affinity: 100 } },
            emptyEquipment(),
        ).stats,
        aggregateEquipment(runeScholar, emptyEquipment()).stats,
    );
});
test("固定屬性與固定詞綴加入其他加成，法術強度可以跨裝備相加", () => {
    const state = wearing(
        item(1, ItemBaseId.RuneStaff, AffixId.SpellPower, 4),
        item(2, ItemBaseId.SpellManual, AffixId.SpellPower, 3),
        item(3, ItemBaseId.ApprenticeRobe, AffixId.Protection, 8),
    );
    const summary = aggregateEquipment(runeScholar, state, float32);
    assert.equal(summary.bonuses.spellPower, 7);
    assert.equal(summary.stats.spellPower, 48);
    assert.equal(summary.bonuses.protection, 12);
    assert.equal(summary.stats.spellDefense, 30);
});
test("近戰攻擊力影響主武器傷害，雙手係數來自基底", () => {
    const sword = aggregateEquipment(
        runeScholar,
        wearing(item(1, ItemBaseId.TrainingSword, AffixId.MeleeAttack, 4)),
        float32,
    );
    assert.equal(sword.stats.meleeAttack, 12);
    assert.equal(sword.mainWeaponDamage, 10);
    const hammer = aggregateEquipment(
        runeScholar,
        wearing(item(2, ItemBaseId.PatrolHammer, AffixId.MeleeAttack, 4)),
        float32,
    );
    assert.equal(hammer.mainWeapon?.hands, 2);
    assert.equal(hammer.mainWeaponDamage, 15);
});
test("最大生命固定詞綴在百分比之前加入，固定值在百分比之後加入", () => {
    assert.equal(calculateMaxLife({ constitution: 0, level: 1 }), 42);
    assert.equal(calculateMaxLife({ constitution: 0, level: 2 }), 44);
    assert.equal(
        calculateMaxLife({ constitution: 2, level: 3, bonus: 14, percent: 0.5, fixed: 7 }),
        112,
    );
    const state = wearing({
        ...item(1, ItemBaseId.ApprenticeRobe),
        affixes: [
            { affixId: AffixId.MaxLife, value: 15 },
            { affixId: AffixId.MaxLifePercent, value: 8 },
        ],
        tier: ItemTier.Fine,
    });
    const summary = aggregateEquipment(runeScholar, state);
    assert.equal(summary.bonuses.maxLife, 15);
    assert.equal(summary.maxLifePercent, 0.08);
    assert.equal(summary.stats.maxLife, (42 + 15) * 1.08);
});
test("生命百分比同群組相加後只乘算一次，普通階百分比使用整數百分點", () => {
    const summary = aggregateEquipment(
        runeScholar,
        wearing(item(1, ItemBaseId.ApprenticeRobe, AffixId.MaxLifePercent, 5)),
    );
    assert.equal(summary.maxLifePercent, 0.05);
    assert.equal(summary.stats.maxLife, 42 * 1.05);
    assert.equal(
        calculateMaxLife({ constitution: 0, level: 1, bonus: 10, percent: 0.05 + 0.1, fixed: 3 }),
        52 * 1.15 + 3,
    );
});
test("生命公式逐步使用三十二位元浮點數，匯總套用既有試玩上限", () => {
    const result = calculateMaxLife(
        { constitution: 2, level: 3, bonus: 15, percent: 0.15, fixed: 3 },
        float32,
    );
    const expected = Math.fround(Math.fround(Math.fround(71) * Math.fround(1.15)) + Math.fround(3));
    assert.equal(result, expected);
    assert.equal(
        aggregateEquipment(
            { ...runeScholar, attributes: { ...runeScholar.attributes, constitution: 20000 } },
            emptyEquipment(),
            float32,
        ).stats.maxLife,
        100000,
    );
});
test("生命公式拒絕溢位、無限值與浮點取整後的越界值", () => {
    assert.throws(() => calculateMaxLife({ constitution: 2147483520, level: 1 }, float32));
    assert.throws(() =>
        calculateMaxLife({ constitution: 0, level: 1, percent: 100000000 }, float32),
    );
    assert.throws(() => calculateMaxLife({ constitution: NaN, level: 1 }, float32));
    assert.throws(() => calculateMaxLife({ constitution: 0, level: 1, fixed: Infinity }, float32));
    assert.throws(() => calculateMaxLife({ constitution: 0, level: 1 }, () => 2147483648));
    assert.throws(() =>
        aggregateEquipment(
            { ...runeScholar, attributes: { ...runeScholar.attributes, strength: 2147483520 } },
            emptyEquipment(),
            float32,
        ),
    );
});
test("迴避與攻擊速度轉成對應二級屬性", () => {
    const state = wearing(
        item(1, ItemBaseId.TrainingSword, AffixId.AttackSpeed, 5),
        item(2, ItemBaseId.ApprenticeRobe, AffixId.Evasion, 1),
    );
    const summary = aggregateEquipment(runeScholar, state);
    assert.equal(summary.bonuses.attackSpeed, 0.05);
    assert.equal(summary.stats.attackSpeed, 0.25);
    assert.equal(summary.stats.evasion, 3);
});
const offensiveCases = [
    {
        name: "物理傷害",
        base: ItemBaseId.TrainingSword,
        affix: AffixId.PhysicalDamage,
        stat: DamageStat.Increase,
        match: { tags: ["physical"] },
        value: 5,
        expected: 0.05,
    },
    {
        name: "火焰傷害",
        base: ItemBaseId.RuneStaff,
        affix: AffixId.FireDamage,
        stat: DamageStat.Increase,
        match: { tags: ["fire"] },
        value: 5,
        expected: 0.05,
    },
    {
        name: "冰霜傷害",
        base: ItemBaseId.SpellManual,
        affix: AffixId.FrostDamage,
        stat: DamageStat.Increase,
        match: { tags: ["frost"] },
        value: 5,
        expected: 0.05,
    },
    {
        name: "近戰暴擊",
        base: ItemBaseId.TrainingSword,
        affix: AffixId.MeleeCritChance,
        stat: DamageStat.CritChance,
        match: { output: DamageOutput.Melee },
        value: 5,
        expected: 0.05,
    },
    {
        name: "法術暴擊",
        base: ItemBaseId.RuneStaff,
        affix: AffixId.SpellCritChance,
        stat: DamageStat.CritChance,
        match: { output: DamageOutput.Spell },
        value: 5,
        expected: 0.05,
    },
    {
        name: "護甲穿透",
        base: ItemBaseId.TrainingSword,
        affix: AffixId.ArmorPenetration,
        stat: DamageStat.FlatPenetration,
        match: { channel: DefenseChannel.Physical },
        value: 4,
        expected: 4,
    },
    {
        name: "法防穿透",
        base: ItemBaseId.SpellManual,
        affix: AffixId.SpellPenetration,
        stat: DamageStat.FlatPenetration,
        match: { channel: DefenseChannel.Spell },
        value: 4,
        expected: 4,
    },
] as const;
for (const entry of offensiveCases) {
    const current = entry;
    test(`${current.name}轉成有正確匹配條件的攻擊方修正`, () => {
        const summary = aggregateEquipment(
            runeScholar,
            wearing(item(1, current.base, current.affix, current.value)),
        );
        const modifier = summary.damageModifiers.attacker[0];
        assert.equal(summary.damageModifiers.attacker.length, 1);
        assert.deepEqual(modifier, {
            id: modifier.id,
            stat: current.stat,
            value: current.expected,
            ...current.match,
        });
        assert.equal(summary.damageModifiers.target.length, 0);
    });
}
test("同群組火焰傷害跨裝備相加，匯總不修改輸入", () => {
    const state = wearing(
        item(1, ItemBaseId.RuneStaff, AffixId.FireDamage, 5),
        item(2, ItemBaseId.SpellManual, AffixId.FireDamage, 4),
    );
    const before = JSON.stringify({ hero: runeScholar, state });
    const summary = aggregateEquipment(runeScholar, state);
    assert.equal(summary.damageModifiers.attacker.length, 1);
    assert.equal(summary.damageModifiers.attacker[0].value, 0.09);
    assert.equal(JSON.stringify({ hero: runeScholar, state }), before);
    assert.deepEqual(aggregateEquipment(runeScholar, state), summary);
});
test("分類暴擊只作用於指定分類，不能變成通用暴擊加成", () => {
    const melee = aggregateEquipment(
        runeScholar,
        wearing(item(1, ItemBaseId.TrainingSword, AffixId.MeleeCritChance, 5)),
    );
    assert.equal(melee.bonuses.critChance, undefined);
    assert.equal(melee.stats.meleeCritChance, melee.stats.critChance + 0.05);
    assert.equal(melee.stats.spellCritChance, melee.stats.critChance);
    const spell = aggregateEquipment(
        runeScholar,
        wearing(item(2, ItemBaseId.RuneStaff, AffixId.SpellCritChance, 5)),
    );
    assert.equal(spell.stats.meleeCritChance, spell.stats.critChance);
    assert.equal(spell.stats.spellCritChance, spell.stats.critChance + 0.05);
});
for (const entry of [
    {
        name: "火焰抗性",
        affix: AffixId.FireResistance,
        stat: DamageStat.Resistance,
        match: { tags: ["fire"] },
        value: 5,
        expected: 0.05,
    },
    {
        name: "冰霜抗性",
        affix: AffixId.FrostResistance,
        stat: DamageStat.Resistance,
        match: { tags: ["frost"] },
        value: 5,
        expected: 0.05,
    },
    {
        name: "直接承傷降低",
        affix: AffixId.DirectReduction,
        stat: DamageStat.Reduction,
        match: { kind: DamageKind.Direct },
        value: 2,
        expected: 0.02,
    },
] as const) {
    const current = entry;
    test(`${current.name}轉成承傷方修正`, () => {
        const summary = aggregateEquipment(
            runeScholar,
            wearing(item(1, ItemBaseId.ApprenticeRobe, current.affix, current.value)),
        );
        const modifier = summary.damageModifiers.target[0];
        assert.equal(summary.damageModifiers.target.length, 1);
        assert.deepEqual(modifier, {
            id: modifier.id,
            stat: current.stat,
            value: current.expected,
            ...current.match,
        });
        assert.equal(summary.damageModifiers.attacker.length, 0);
    });
}
test("輸出修正可由既有傷害結算直接使用，直接承傷降低不作用於週期", () => {
    const attack = aggregateEquipment(
        runeScholar,
        wearing(item(1, ItemBaseId.RuneStaff, AffixId.FireDamage, 5)),
    );
    const defense = aggregateEquipment(
        runeScholar,
        wearing(item(2, ItemBaseId.ApprenticeRobe, AffixId.DirectReduction, 2)),
    );
    const resolve = (kind: DamageKind) =>
        settleDamage({
            event: {
                source: 1,
                target: 2,
                kind,
                output: DamageOutput.Spell,
                canCrit: false,
                parts: [
                    {
                        amount: 100,
                        tags: ["fire"],
                        channel: DefenseChannel.Spell,
                        history: DamageHistory.Base,
                    },
                ],
            },
            attacker: { modifiers: attack.damageModifiers.attacker },
            target: { life: 1000, maxLife: 1000, modifiers: defense.damageModifiers.target },
            round: float32,
        });
    assert.ok(Math.abs(resolve(DamageKind.Direct).recipients[0].lifeLoss - 102.9) < 0.001);
    assert.ok(Math.abs(resolve(DamageKind.Dot).recipients[0].lifeLoss - 105) < 0.001);
});
test("同一實例不能被重複匯總", () => {
    const state = wearing(item(1, ItemBaseId.RuneStaff), item(1, ItemBaseId.SpellManual));
    assert.throws(() => aggregateEquipment(runeScholar, state));
});
test("同位置比較提供數值與武器差異，保留其他位置", () => {
    const sword = item(1, ItemBaseId.TrainingSword, AffixId.MeleeAttack, 2);
    const robe = item(2, ItemBaseId.ApprenticeRobe, AffixId.MaxLife, 8);
    const state = wearing(sword, robe);
    const before = JSON.stringify(state);
    const candidate = item(3, ItemBaseId.PatrolHammer, AffixId.MeleeAttack, 4);
    const result = compareEquipment(runeScholar, state, candidate);
    assert.ok(result.ok);
    assert.equal(result.current, sword);
    assert.equal(result.slot, EquipSlot.MainHand);
    assert.equal(result.delta.meleeAttack, 2);
    assert.equal(result.delta.maxLife, 0);
    assert.equal(result.mainWeaponDamageDelta, 6);
    assert.equal(JSON.stringify(state), before);
});
test("比較分開列出新增與移除的修正，不折算成戰力分數", () => {
    const state = wearing(item(1, ItemBaseId.RuneStaff, AffixId.FireDamage, 5));
    const result = compareEquipment(
        runeScholar,
        state,
        item(2, ItemBaseId.TrainingSword, AffixId.PhysicalDamage, 4),
    );
    assert.ok(result.ok);
    assert.deepEqual(
        result.modifierChanges.attacker.map((entry) => ({ tags: entry.tags, value: entry.value })),
        [
            { tags: ["fire"], value: -0.05 },
            { tags: ["physical"], value: 0.04 },
        ],
    );
});
test("空位置可以比較，百分比與最大生命差異分開列出", () => {
    const result = compareEquipment(
        runeScholar,
        emptyEquipment(),
        item(1, ItemBaseId.ApprenticeRobe, AffixId.MaxLifePercent, 5),
    );
    assert.ok(result.ok);
    assert.equal(result.current, undefined);
    assert.equal(result.maxLifePercentDelta, 0.05);
    assert.ok(Math.abs(result.delta.maxLife - 2.1) < 0.00001);
    assert.equal(result.delta.spellDefense, 4);
});
test("比較失敗時回傳全部原因與原狀態", () => {
    const state = wearing(item(1, ItemBaseId.PatrolHammer));
    const result = compareEquipment(
        { ...runeScholar, knowledge: [] },
        state,
        item(1, ItemBaseId.SpellManual),
    );
    assert.ok(!result.ok);
    assert.equal(result.state, state);
    assert.deepEqual(
        result.failures.map((entry) => entry.code),
        [
            EquipFailureCode.TwoHandedWeapon,
            EquipFailureCode.MissingKnowledge,
            EquipFailureCode.DuplicateInstance,
        ],
    );
});
