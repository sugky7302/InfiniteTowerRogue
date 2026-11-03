import { combatLevel, HeroState } from "@entities/character";
import {
    CombatBonuses,
    DamageKind,
    DamageModifier,
    DamageOutput,
    DamageStat,
    DefenseChannel,
    deriveCombatStats,
    PrimaryAttributes,
} from "@entities/combat";
import { EquipSlot, getItemBase, getItemBonuses, ItemBonusStat, ItemWeapon } from "@entities/item";
import { equipmentAdd, equipmentMultiply, equipmentNumber, EquipmentRound } from "../lib/numbers";
import { EquipmentState } from "./equipment";

export interface EquipmentBonuses extends CombatBonuses {
    readonly spellPower: number;
}
export interface EquipmentModifiers {
    readonly attacker: readonly DamageModifier[];
    readonly target: readonly DamageModifier[];
}
export type EquipmentStats = ReturnType<typeof deriveCombatStats> & {
    readonly spellPower: number;
    readonly meleeCritChance: number;
    readonly spellCritChance: number;
};
export interface EquipmentSummary {
    readonly attributes: PrimaryAttributes;
    readonly bonuses: EquipmentBonuses;
    readonly maxLifePercent: number;
    readonly damageModifiers: EquipmentModifiers;
    readonly mainWeapon?: ItemWeapon;
    readonly mainWeaponDamage: number;
    readonly stats: EquipmentStats;
}
export interface MaxLifeInput {
    readonly constitution: number;
    readonly level: number;
    readonly bonus?: number;
    readonly percent?: number;
    readonly fixed?: number;
}
/** 傳回完整公式值。試玩生命上限由匯總層套用。 */
export function calculateMaxLife(
    input: MaxLifeInput,
    round: EquipmentRound = (value) => value,
): number {
    const add = (a: number, b: number) => equipmentAdd(a, b, round);
    const multiply = (a: number, b: number) => equipmentMultiply(a, b, round);
    const base = add(
        add(add(40, multiply(input.constitution, 5)), multiply(input.level, 2)),
        input.bonus ?? 0,
    );
    return add(multiply(base, add(1, input.percent ?? 0)), input.fixed ?? 0);
}
export function aggregateEquipment(
    hero: HeroState,
    state: EquipmentState,
    round: EquipmentRound = (value) => value,
): EquipmentSummary {
    const totals = {} as Record<ItemBonusStat, number>;
    for (const key of Object.values(ItemBonusStat)) totals[key] = 0;
    const ids: number[] = [];
    for (const slot of Object.values(EquipSlot)) {
        const item = state[slot];
        if (!item) continue;
        if (ids.includes(item.id)) throw new Error("同一物品實例不能重複匯總。");
        ids.push(item.id);
        for (const bonus of getItemBonuses(item)) {
            totals[bonus.stat] = equipmentAdd(totals[bonus.stat], bonus.value, round);
        }
    }
    const ratio = (stat: ItemBonusStat) => equipmentNumber(totals[stat] / 100, round);
    const bonuses: EquipmentBonuses = {
        maxLife: totals.maxLife,
        meleeAttack: totals.meleeAttack,
        armor: totals.armor,
        protection: totals.protection,
        evasion: totals.evasion,
        attackSpeed: ratio(ItemBonusStat.AttackSpeed),
        spellPower: totals.spellPower,
        maxLifePercent: ratio(ItemBonusStat.MaxLifePercent),
        maxLifeFixed: 0,
    };
    const attributes: PrimaryAttributes = { ...hero.attributes, level: combatLevel(hero) };
    const derived = deriveCombatStats(attributes, bonuses);
    const maxLifePercent = bonuses.maxLifePercent ?? 0;
    const stats: { -readonly [Key in keyof EquipmentStats]: EquipmentStats[Key] } = {
        ...derived,
        meleeCritChance: Math.max(
            0,
            Math.min(
                0.5,
                equipmentAdd(derived.critChance, ratio(ItemBonusStat.MeleeCritChance), round),
            ),
        ),
        spellCritChance: Math.max(
            0,
            Math.min(
                0.5,
                equipmentAdd(derived.critChance, ratio(ItemBonusStat.SpellCritChance), round),
            ),
        ),
    };
    for (const key of Object.keys(stats) as (keyof EquipmentStats)[])
        stats[key] = equipmentNumber(stats[key], round);
    const attacker: DamageModifier[] = [];
    const target: DamageModifier[] = [];
    const push = (
        list: DamageModifier[],
        key: ItemBonusStat,
        stat: DamageStat,
        match: Omit<DamageModifier, "id" | "stat" | "value">,
        percent = true,
    ) => {
        if (totals[key] !== 0)
            list.push({
                id: `equipment-${key}`,
                stat,
                value: percent ? ratio(key) : totals[key],
                ...match,
            });
    };
    push(attacker, ItemBonusStat.PhysicalDamage, DamageStat.Increase, { tags: ["physical"] });
    push(attacker, ItemBonusStat.FireDamage, DamageStat.Increase, { tags: ["fire"] });
    push(attacker, ItemBonusStat.FrostDamage, DamageStat.Increase, { tags: ["frost"] });
    push(attacker, ItemBonusStat.MeleeCritChance, DamageStat.CritChance, {
        output: DamageOutput.Melee,
    });
    push(attacker, ItemBonusStat.SpellCritChance, DamageStat.CritChance, {
        output: DamageOutput.Spell,
    });
    push(
        attacker,
        ItemBonusStat.ArmorPenetration,
        DamageStat.FlatPenetration,
        { channel: DefenseChannel.Physical },
        false,
    );
    push(
        attacker,
        ItemBonusStat.SpellPenetration,
        DamageStat.FlatPenetration,
        { channel: DefenseChannel.Spell },
        false,
    );
    push(target, ItemBonusStat.FireResistance, DamageStat.Resistance, { tags: ["fire"] });
    push(target, ItemBonusStat.FrostResistance, DamageStat.Resistance, { tags: ["frost"] });
    push(target, ItemBonusStat.DirectReduction, DamageStat.Reduction, { kind: DamageKind.Direct });
    const main = state[EquipSlot.MainHand];
    const mainWeapon = main ? getItemBase(main.baseId).weapon : undefined;
    const mainWeaponDamage = mainWeapon
        ? equipmentAdd(
              mainWeapon.base,
              equipmentMultiply(stats.meleeAttack, mainWeapon.coefficient, round),
              round,
          )
        : 0;
    return {
        attributes,
        bonuses,
        maxLifePercent,
        damageModifiers: { attacker, target },
        mainWeapon,
        mainWeaponDamage,
        stats,
    };
}
