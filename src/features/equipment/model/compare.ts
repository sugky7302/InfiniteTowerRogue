import { HeroState } from "@entities/character";
import { DamageModifier } from "@entities/combat";
import { getItemBase, ItemInstance } from "@entities/item";
import { equipmentAdd, EquipmentRound } from "../lib/numbers";
import { aggregateEquipment, EquipmentStats } from "./aggregate";
import { equip, EquipmentState } from "./equipment";

function modifierDifference(
    before: readonly DamageModifier[],
    after: readonly DamageModifier[],
    round: EquipmentRound,
): readonly DamageModifier[] {
    const keys: string[] = [];
    const result: DamageModifier[] = [];
    for (const entry of [...before, ...after]) {
        if (keys.includes(entry.id)) continue;
        keys.push(entry.id);
        const oldValue = before.find((item) => item.id === entry.id)?.value ?? 0;
        const newValue = after.find((item) => item.id === entry.id)?.value ?? 0;
        const value = equipmentAdd(newValue, -oldValue, round);
        if (value !== 0) result.push({ ...entry, value });
    }
    return result;
}
/** 比較只替換候選物的基底位置。失敗時傳回全部原因。 */
export function compareEquipment(
    hero: HeroState,
    state: EquipmentState,
    candidate: ItemInstance,
    round: EquipmentRound = (value) => value,
) {
    const slot = getItemBase(candidate.baseId).slot;
    const current = state[slot];
    const result = equip(hero, state, candidate, slot);
    if (!result.ok) return { ...result, slot, current, candidate };
    const before = aggregateEquipment(hero, state, round);
    const after = aggregateEquipment(hero, result.state, round);
    const delta = {} as { -readonly [Key in keyof EquipmentStats]: number };
    for (const key of Object.keys(after.stats) as (keyof EquipmentStats)[])
        delta[key] = equipmentAdd(after.stats[key], -before.stats[key], round);
    return {
        ok: true as const,
        slot,
        current,
        candidate,
        before,
        after,
        delta,
        maxLifePercentDelta: equipmentAdd(after.maxLifePercent, -before.maxLifePercent, round),
        mainWeaponDamageDelta: equipmentAdd(
            after.mainWeaponDamage,
            -before.mainWeaponDamage,
            round,
        ),
        modifierChanges: {
            attacker: modifierDifference(
                before.damageModifiers.attacker,
                after.damageModifiers.attacker,
                round,
            ),
            target: modifierDifference(
                before.damageModifiers.target,
                after.damageModifiers.target,
                round,
            ),
        },
    };
}
export type EquipmentComparison = ReturnType<typeof compareEquipment>;
