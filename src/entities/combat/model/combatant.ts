import { attributeModifier } from "./check";
import { clampCombat, combatAdd, combatMultiply } from "./combat-number";

export interface PrimaryAttributes {
    readonly strength: number;
    readonly precision: number;
    readonly agility: number;
    readonly constitution: number;
    readonly spirit: number;
    readonly intelligence: number;
    readonly luck: number;
    readonly level: number;
}
export interface CombatBonuses {
    readonly maxLife?: number;
    readonly maxLifePercent?: number;
    readonly maxLifeFixed?: number;
    readonly spellPower?: number;
    readonly meleeAttack?: number;
    readonly rangedAttack?: number;
    readonly armor?: number;
    readonly protection?: number;
    readonly physicalDefense?: number;
    readonly spellDefense?: number;
    readonly critChance?: number;
    readonly critDamage?: number;
    readonly evasion?: number;
    readonly attackSpeed?: number;
    readonly castingStability?: number;
}
export function deriveCombatStats(attributes: PrimaryAttributes, bonuses: CombatBonuses = {}) {
    const precision = attributeModifier(attributes.precision);
    const agility = attributeModifier(attributes.agility);
    const luck = attributeModifier(attributes.luck);
    const sum = (...values: number[]): number => {
        let result = 0;
        for (const value of values) result = combatAdd(result, value);
        return result;
    };
    return {
        maxLife: clampCombat(
            sum(
                combatMultiply(
                    sum(
                        40,
                        combatMultiply(attributes.constitution, 5),
                        combatMultiply(attributes.level, 2),
                        bonuses.maxLife ?? 0,
                    ),
                    sum(1, bonuses.maxLifePercent ?? 0),
                ),
                bonuses.maxLifeFixed ?? 0,
            ),
            1,
            100000,
        ),
        spellPower: sum(
            combatMultiply(attributes.intelligence, 2),
            attributes.spirit,
            bonuses.spellPower ?? 0,
        ),
        meleeAttack: Math.max(
            0,
            sum(
                combatMultiply(attributes.strength, 2),
                attributes.precision,
                bonuses.meleeAttack ?? 0,
            ),
        ),
        rangedAttack: Math.max(
            0,
            sum(
                combatMultiply(attributes.precision, 2),
                attributes.strength,
                bonuses.rangedAttack ?? 0,
            ),
        ),
        physicalDefense: Math.max(
            0,
            sum(
                combatMultiply(attributes.constitution, 2),
                attributes.strength,
                bonuses.armor ?? 0,
                bonuses.physicalDefense ?? 0,
            ),
        ),
        spellDefense: Math.max(
            0,
            sum(
                combatMultiply(attributes.spirit, 2),
                attributes.constitution,
                bonuses.protection ?? 0,
                bonuses.spellDefense ?? 0,
            ),
        ),
        critChance: clampCombat(
            sum(0.05, precision * 0.01, luck * 0.02, bonuses.critChance ?? 0),
            0,
            0.5,
        ),
        critDamage: clampCombat(
            sum(2, precision * 0.02, luck * 0.03, bonuses.critDamage ?? 0),
            1,
            3,
        ),
        evasion: sum(agility, bonuses.evasion ?? 0),
        attackSpeed: clampCombat(sum((agility + precision) * 0.05, bonuses.attackSpeed ?? 0), 0, 1),
        castingStability: sum(
            precision,
            attributeModifier(attributes.spirit),
            bonuses.castingStability ?? 0,
        ),
    };
}
export interface CombatLife {
    readonly role: "player" | "enemy";
    readonly maxLife: number;
    readonly life: number;
    readonly shield: number;
    readonly incapacitated: boolean;
    readonly knockedDown: boolean;
}
export function createCombatLife(
    role: CombatLife["role"],
    maxLife: number,
    life = maxLife,
    shield = 0,
): CombatLife {
    const maximum = clampCombat(maxLife, 1, 100000);
    const current = clampCombat(life, 0, maximum);
    return {
        role,
        maxLife: maximum,
        life: current,
        shield: clampCombat(shield, 0, 100000),
        incapacitated: role === "player" && current === 0,
        knockedDown: role === "enemy" && current === 0,
    };
}
/** 套用結算後的生命與護盾。重複套用同一快照不會再次扣血。 */
export function updateCombatLife(state: CombatLife, life: number, shield: number): CombatLife {
    return createCombatLife(state.role, state.maxLife, life, shield);
}
/** 增加上限時補相同生命；減少時限制目前生命。失能與擊倒維持 0。 */
export function resizeCombatLife(state: CombatLife, maxLife: number): CombatLife {
    const maximum = clampCombat(maxLife, 1, 100000);
    const life =
        state.incapacitated || state.knockedDown
            ? 0
            : Math.min(
                  maximum,
                  combatAdd(state.life, Math.max(0, combatAdd(maximum, -state.maxLife))),
              );
    return createCombatLife(state.role, maximum, life, state.shield);
}
/** 恢復明確解除失能或擊倒。一般補血不會自動復起。 */
export function reviveCombatLife(state: CombatLife, life = state.maxLife): CombatLife {
    return createCombatLife(
        state.role,
        state.maxLife,
        clampCombat(life, 1, state.maxLife),
        state.shield,
    );
}
export function recoverCombatLife(state: CombatLife, amount: number): CombatLife {
    if (state.incapacitated || state.knockedDown) return state;
    return updateCombatLife(
        state,
        Math.min(state.maxLife, combatAdd(state.life, Math.max(0, amount))),
        state.shield,
    );
}
