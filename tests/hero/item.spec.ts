import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
    AffixId,
    affixes,
    affixPercentile,
    affixTables,
    AffixTable,
    AffixValueType,
    createItem,
    EquipSlot,
    getAffix,
    getAffixRange,
    getItemBase,
    getItemBonuses,
    isAffixCompatible,
    itemBases,
    ItemBaseId,
    ItemBonusStat,
    ItemTag,
    ItemTier,
    tierAffixCounts,
} from "@entities/item";
import { item } from "./fixtures";

test("四個階級的詞綴數量依序為一至四", () => {
    assert.deepEqual(
        Object.values(ItemTier).map((tier) => tierAffixCounts[tier]),
        [1, 2, 3, 4],
    );
});
test("全部比例與百分點表符合來源的四階區間", () => {
    assert.deepEqual(Object.values(affixTables[AffixTable.Minor]), [
        [1, 2],
        [2, 4],
        [3, 6],
        [5, 8],
    ]);
    assert.deepEqual(Object.values(affixTables[AffixTable.Standard]), [
        [2, 5],
        [4, 8],
        [7, 12],
        [10, 15],
    ]);
    assert.deepEqual(Object.values(affixTables[AffixTable.Strong]), [
        [4, 8],
        [7, 12],
        [14, 20],
        [18, 25],
    ]);
});
test("全部固定值表符合來源的四階區間", () => {
    assert.deepEqual(Object.values(affixTables[AffixTable.MaxLife]), [
        [8, 15],
        [14, 24],
        [22, 36],
        [32, 50],
    ]);
    assert.deepEqual(Object.values(affixTables[AffixTable.Evasion]), [
        [1, 1],
        [1, 2],
        [2, 3],
        [3, 4],
    ]);
    for (const table of [
        AffixTable.MeleeAttack,
        AffixTable.RangedAttack,
        AffixTable.SpellPower,
        AffixTable.ArmorPenetration,
        AffixTable.SpellPenetration,
    ]) {
        assert.deepEqual(Object.values(affixTables[table]), [
            [2, 4],
            [4, 7],
            [6, 10],
            [9, 14],
        ]);
    }
    for (const table of [AffixTable.Armor, AffixTable.Protection])
        assert.deepEqual(Object.values(affixTables[table]), [
            [4, 8],
            [7, 13],
            [11, 19],
            [17, 28],
        ]);
});
for (const base of itemBases) {
    const testedBase = base;
    test(`${testedBase.name}的每個普通階詞綴與整數值都可抽到且不重複`, () => {
        for (let index = 0; index < testedBase.affixPool.length; index++) {
            const ticket = index + 1;
            const entry = testedBase.affixPool[index];
            const [minimum, maximum] = getAffixRange(entry.affixId, ItemTier.Common);
            const reached: number[] = [];
            for (let value = minimum; value <= maximum; value++) {
                const expected = value;
                let calls = 0;
                const result = createItem(1, testedBase.id, (low, high) => {
                    calls++;
                    if (calls === 1) {
                        assert.equal(low, 1);
                        assert.equal(high, testedBase.affixPool.length);
                        return ticket;
                    }
                    assert.equal(low, minimum);
                    assert.equal(high, maximum);
                    return expected;
                });
                assert.equal(calls, 2);
                assert.equal(result.tier, ItemTier.Common);
                assert.equal(result.affixes.length, 1);
                assert.equal(
                    new Set(result.affixes.map((affix) => affix.affixId)).size,
                    result.affixes.length,
                );
                assert.deepEqual(result.affixes, [{ affixId: entry.affixId, value: expected }]);
                reached.push(result.affixes[0].value);
            }
            assert.equal(reached.length, maximum - minimum + 1);
        }
    });
}
test("全部詞綴有唯一名稱、型態、作用參數、相容標籤與疊加群組", () => {
    assert.equal(affixes.length, 18);
    assert.equal(new Set(affixes.map((affix) => affix.id)).size, affixes.length);
    assert.equal(new Set(affixes.map((affix) => affix.name)).size, affixes.length);
    for (const definition of affixes) {
        assert.ok(definition.compatibleTags.length > 0 && definition.stackingGroup.length > 0);
        assert.ok(Object.values(ItemBonusStat).includes(definition.stat));
        for (const tier of Object.values(ItemTier)) {
            const [minimum, maximum] = getAffixRange(definition.id, tier);
            assert.ok(Number.isInteger(minimum) && Number.isInteger(maximum) && minimum <= maximum);
            assert.ok(maximum <= 2147483647);
        }
    }
    assert.equal(getAffix(AffixId.FireResistance).valueType, AffixValueType.PercentagePoint);
    assert.equal(getAffix(AffixId.FireDamage).valueType, AffixValueType.Percent);
});
test("全部基底詞綴池相容，工具標籤不能取得詞綴", () => {
    for (const base of itemBases) {
        for (const entry of base.affixPool)
            assert.ok(isAffixCompatible(base, getAffix(entry.affixId)));
    }
    const base = getItemBase(ItemBaseId.RuneStaff);
    assert.equal(isAffixCompatible({ ...base, tags: [] }, getAffix(AffixId.MeleeAttack)), false);
    assert.equal(
        isAffixCompatible({ ...base, tags: [ItemTag.CastingFocus] }, getAffix(AffixId.MeleeAttack)),
        false,
    );
    assert.equal(
        isAffixCompatible({ ...base, tags: [ItemTag.MeleeWeapon] }, getAffix(AffixId.MeleeAttack)),
        true,
    );
    assert.ok(itemBases.every((entry) => entry.slot !== EquipSlot.Tool));
});
test("五件物品保留設計稿的名稱、手數、武器係數與固定防護", () => {
    const weapons = itemBases.filter((base) => base.weapon).map((base) => base.weapon);
    assert.deepEqual(weapons, [
        { name: "符文杖", hands: 1, base: 4, coefficient: 0.5 },
        { name: "訓練短劍", hands: 1, base: 4, coefficient: 0.5 },
        { name: "巡檢長槌", hands: 2, base: 6, coefficient: 0.75 },
    ]);
    assert.deepEqual(getItemBase(ItemBaseId.ApprenticeRobe).bonuses, [
        { stat: ItemBonusStat.Protection, value: 4 },
    ]);
    assert.deepEqual(getItemBase(ItemBaseId.SpellManual).requiredKnowledge, ["魔法解析"]);
});
test("亂數由呼叫者提供，相同序列產生相同結果", () => {
    const low = createItem(1, ItemBaseId.RuneStaff, (minimum) => minimum);
    assert.deepEqual(
        createItem(1, ItemBaseId.RuneStaff, (minimum) => minimum),
        low,
    );
    assert.deepEqual(low.affixes, [{ affixId: AffixId.SpellPower, value: 2 }]);
    assert.deepEqual(createItem(2, ItemBaseId.RuneStaff, (_low, high) => high).affixes, [
        { affixId: AffixId.AttackSpeed, value: 5 },
    ]);
});
test("拒絕超出範圍或非整數亂數與識別碼", () => {
    for (const invalid of [NaN, Infinity, -1, 0.5, 2147483647])
        assert.throws(() => createItem(invalid, ItemBaseId.RuneStaff, (low) => low));
    for (const invalid of [NaN, Infinity, -1, 0, 0.5, 7])
        assert.throws(() => createItem(1, ItemBaseId.RuneStaff, () => invalid));
    assert.throws(() => createItem(1, "未知基底", (low) => low));
});
test("已保存的重複、不相容、池外或越界詞綴會被拒絕", () => {
    const valid = item(1, ItemBaseId.RuneStaff, AffixId.SpellPower, 2);
    assert.deepEqual(getItemBonuses(valid), [{ stat: ItemBonusStat.SpellPower, value: 2 }]);
    assert.throws(() =>
        getItemBonuses({ ...valid, affixes: [...valid.affixes, ...valid.affixes] }),
    );
    assert.throws(() => getItemBonuses(item(1, ItemBaseId.RuneStaff, AffixId.MaxLife, 8)));
    assert.throws(() => getItemBonuses(item(1, ItemBaseId.RuneStaff, AffixId.PhysicalDamage, 2)));
    for (const value of [1, 5, 2.5, NaN, Infinity])
        assert.throws(() =>
            getItemBonuses(item(1, ItemBaseId.RuneStaff, AffixId.SpellPower, value)),
        );
});
test("百分位包含兩端，單一整數區間視為滿值", () => {
    assert.equal(affixPercentile(AffixId.SpellPower, ItemTier.Common, 2), 0);
    assert.equal(affixPercentile(AffixId.SpellPower, ItemTier.Common, 3), 50);
    assert.equal(affixPercentile(AffixId.SpellPower, ItemTier.Common, 4), 100);
    assert.equal(affixPercentile(AffixId.Evasion, ItemTier.Common, 1), 100);
    assert.throws(() => affixPercentile(AffixId.SpellPower, ItemTier.Common, 5));
});
